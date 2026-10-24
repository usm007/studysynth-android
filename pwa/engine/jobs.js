/**
 * StudySynth Lite — Application-level processing jobs.
 * Owns the lifetime of a document import or a question-generation run so it
 * survives screen changes, and persists bounded checkpoints for recovery.
 * No DOM access lives here; the app renders the snapshots it receives.
 */

(function (global) {
  'use strict';

  const TERMINAL = { completed: true, cancelled: true, failed: true };

  const STAGE_LABELS = {
    opening: 'Opening document',
    extracting: 'Reading document pages',
    ocr: 'Recognising text',
    preparing: 'Preparing content',
    inventory: 'Finding important facts',
    generating: 'Creating questions',
    validating: 'Checking answers',
    saving: 'Saving study module'
  };

  const STAGE_MESSAGES = {
    opening: 'Opening your document…',
    extracting: 'Reading document pages…',
    ocr: 'Recognising text in this image…',
    preparing: 'Preparing document content…',
    inventory: 'Finding important facts…',
    generating: 'Creating practice questions…',
    validating: 'Checking questions and answers…',
    saving: 'Saving your study module…'
  };

  const SEQUENCES = {
    'generate': ['preparing', 'inventory', 'generating', 'validating', 'saving'],
    'import:pdf': ['opening', 'extracting', 'preparing'],
    'import:ocr': ['opening', 'ocr', 'preparing'],
    'import:text': ['opening', 'preparing']
  };

  function cleanSourceMeta(meta) {
    if (!meta) return null;
    return {
      origin: meta.origin,
      confidence: meta.confidence,
      lowConfidence: !!meta.lowConfidence,
      confirmed: !!meta.confirmed,
      edited: !!meta.edited
    };
  }

  function isAbort(err) {
    return !!err && (err.name === 'AbortError' || err.code === 'CANCELLED');
  }

  function normalizeProgress(event) {
    const src = event || {};
    const completed = Number.isFinite(src.completed) ? src.completed : null;
    const total = Number.isFinite(src.total) && src.total > 0 ? src.total : null;
    const ratio = Number.isFinite(src.ratio)
      ? src.ratio
      : (!total && Number.isFinite(src.progress) ? src.progress : null);

    if (total && completed != null) {
      const bounded = Math.max(0, Math.min(completed, total));
      return {
        indeterminate: false,
        completed: bounded,
        total: total,
        percent: Math.round((bounded / total) * 100)
      };
    }
    if (ratio != null) {
      const bounded = Math.max(0, Math.min(1, ratio));
      return {
        indeterminate: false,
        completed: null,
        total: null,
        percent: Math.round(bounded * 100)
      };
    }
    return { indeterminate: true, completed: null, total: null, percent: null };
  }

  function createJobManager(options) {
    const opts = options || {};
    const storage = opts.storage || null;
    const saveModule = opts.saveModule || function () { throw new Error('Module storage is unavailable.'); };
    const createWorker = (opts.workers && opts.workers.create) || function () { return null; };
    const inlineAnalyze = opts.analyze || null;
    const emitUpdate = opts.onUpdate || function () {};
    const emitSettled = opts.onSettled || function () {};
    const clock = opts.now || function () { return Date.now(); };
    const readFile = opts.readFile || null;

    let current = null;
    let activeWorker = null;
    let abortController = null;
    let pageWrites = Promise.resolve();

    function iso() {
      return new Date(clock()).toISOString();
    }

    function makeId() {
      return 'job_' + clock() + '_' + Math.random().toString(36).slice(2, 8);
    }

    function sequenceFor(type, kind) {
      if (type === 'generate') return SEQUENCES.generate.slice();
      return (SEQUENCES['import:' + kind] || SEQUENCES['import:text']).slice();
    }

    function isActive(job) {
      return !!job && current === job && job.status === 'running' && !job.cancelRequested;
    }

    function record(job) {
      return {
        id: job.id,
        type: job.type,
        kind: job.kind || null,
        status: job.status,
        stage: job.stage,
        stageKeys: job.stageKeys,
        message: job.message,
        title: job.title,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        startedAtMs: job.startedAtMs || 0,
        resumed: !!job.resumed,
        recoverable: job.recoverable !== false,
        storageWarning: job.storageWarning || '',
        sourceMeta: cleanSourceMeta(job.sourceMeta),
        source: job.source || null,
        progress: job.progress || { indeterminate: true },
        checkpoint: job.checkpoint || null,
        error: job.error || null,
        moduleId: job.moduleId || null,
        revisionOnly: !!job.revisionOnly
      };
    }

    function view(job) {
      if (!job) return null;
      const keys = Array.isArray(job.stageKeys) ? job.stageKeys : [];
      const at = keys.indexOf(job.stage);
      const completed = job.status === 'completed';
      const stages = keys.map(function (key, index) {
        let state = 'pending';
        if (completed) state = 'done';
        else if (job.status === 'failed' && index === at) state = 'error';
        else if (at >= 0 && index < at) state = 'done';
        else if (index === at) state = 'active';
        return { key: key, label: STAGE_LABELS[key] || key, state: state };
      });
      return {
        id: job.id,
        type: job.type,
        kind: job.kind || null,
        status: job.status,
        stage: job.stage,
        stageLabel: STAGE_LABELS[job.stage] || '',
        title: job.title,
        message: job.message,
        progress: job.progress || { indeterminate: true },
        stages: stages,
        resumed: !!job.resumed,
        recoverable: job.recoverable !== false,
        storageWarning: job.storageWarning || '',
        canCancel: job.status === 'running' && job.stage !== 'saving',
        canMinimize: job.status === 'running',
        canRetry: job.status === 'failed' && !!(job.checkpoint && job.checkpoint.module || job.retryPayload),
        error: job.error ? { code: job.error.code || '', message: job.error.message || '' } : null,
        moduleId: job.moduleId || null,
        revisionOnly: !!job.revisionOnly
      };
    }

    function updateView(job) {
      job.updatedAt = iso();
      emitUpdate(view(job));
    }

    function markNotRecoverable(job, err) {
      if (job.recoverable === false) return;
      job.recoverable = false;
      job.storageWarning = 'This device could not save recovery data. Keep the app open until processing finishes.';
      if (err && global.console && console.warn) console.warn('Recovery checkpoint was not saved:', err);
      updateView(job);
    }

    async function persistJob(job) {
      if (!storage || typeof storage.saveJob !== 'function') {
        markNotRecoverable(job, new Error('Job storage is unavailable.'));
        return false;
      }
      try {
        await storage.saveJob(record(job));
        return true;
      } catch (err) {
        markNotRecoverable(job, err);
        return false;
      }
    }

    function terminateWorker() {
      if (!activeWorker) return;
      try { activeWorker.terminate(); } catch (err) { /* already gone */ }
      activeWorker = null;
    }

    function cleanupStorage(job) {
      if (!job || !storage || typeof storage.deleteJob !== 'function') return;
      Promise.resolve(storage.deleteJob(job.id)).catch(function () { /* best effort */ });
    }

    function applyProgress(job, event) {
      if (!isActive(job)) return;
      const data = event || {};
      if (data.jobId && data.jobId !== job.id) return;
      const nextStage = data.stage && STAGE_LABELS[data.stage] ? data.stage : job.stage;
      const stageChanged = nextStage !== job.stage;
      job.stage = nextStage;
      job.message = data.message || data.status || STAGE_MESSAGES[nextStage] || job.message;
      job.progress = normalizeProgress(data);
      updateView(job);
      if (stageChanged || data.persist === true || (job.progress.total && job.progress.completed != null)) {
        persistJob(job);
      }
    }

    function failJob(job, rawError) {
      if (!isActive(job)) return;
      terminateWorker();
      if (abortController && !job.cancelRequested) {
        try { abortController.abort(); } catch (err) { /* already aborted */ }
      }
      const error = {
        code: (rawError && rawError.code) || 'FAILED',
        message: friendlyError(rawError)
      };
      job.status = 'failed';
      job.error = error;
      job.message = error.message;
      updateView(job);
      emitSettled({ status: 'failed', type: job.type, error: error, job: view(job) });
    }

    function friendlyError(err) {
      const code = err && err.code;
      if (code === 'SAVE_FAILED') return err.message;
      if (code === 'NO_VERIFIED_QUESTIONS') {
        return 'No question passed the final source check, so nothing was published. Add clearer source text and try again.';
      }
      if (code === 'NO_INPUT') {
        return 'The saved input for this job is no longer available. Add the document again to continue.';
      }
      if (code === 'WORKER_UNAVAILABLE') {
        return 'Background processing is not available in this browser. Reload the app and try again.';
      }
      if (code === 'WORKER_FAILED') {
        return 'The on-device engine stopped unexpectedly. Your text is safe; try again.';
      }
      const message = (err && err.message) || '';
      if (/no clear facts|no structured knowledge/i.test(message)) {
        return 'No clear facts were found in this text. Try a longer passage with complete sentences.';
      }
      if (/no readable text/i.test(message)) {
        return 'No readable text was found in this file. For a scanned page, choose a clear photo so on-device OCR can read it.';
      }
      return 'The study module could not be created. Your text is still here; try again.';
    }

    function buildModule(job, analyzed) {
      const durationMs = Math.max(1, Math.round(clock() - (job.startedAtMs || clock())));
      const inventory = Array.isArray(analyzed.inventory) ? analyzed.inventory : [];
      const sourceMeta = cleanSourceMeta(job.sourceMeta);
      const base = {
        id: 'mod_' + clock(),
        title: job.title,
        createdAt: iso(),
        durationMs: durationMs,
        sectionsCount: analyzed.sectionsCount || 0,
        inventory: inventory,
        validation: analyzed.validation,
        generation: analyzed.generation,
        sourceMeta: sourceMeta
      };
      let generationError = null;
      if (analyzed.generationError) {
        generationError = new Error(analyzed.generationError.message || 'Generation stopped.');
        generationError.code = analyzed.generationError.code || '';
      }
      try {
        if (!inventory.length) {
          throw new Error('No clear facts were found in this text. Try a longer passage with complete sentences.');
        }
        if (generationError) throw generationError;
        if (!analyzed.validation || !analyzed.validation.valid) {
          throw new Error('The generated questions did not pass the final source check, so nothing was saved. Add clearer source text and try again.');
        }
        return {
          module: Object.assign({}, base, { questions: analyzed.questions || [] }),
          revisionOnly: false
        };
      } catch (err) {
        if (err && err.code === 'NO_VERIFIED_QUESTIONS' && inventory.length) {
          return {
            module: Object.assign({}, base, { questions: [], revisionOnly: true }),
            revisionOnly: true
          };
        }
        throw err;
      }
    }

    async function saveBuiltModule(job, module) {
      if (!isActive(job)) return;
      job.checkpoint = Object.assign({}, job.checkpoint || {}, { module: module });
      job.stage = 'saving';
      job.message = STAGE_MESSAGES.saving;
      job.progress = { indeterminate: true, completed: null, total: null, percent: null };
      updateView(job);
      await persistJob(job);
      if (!isActive(job)) return;
      try {
        await saveModule(module);
      } catch (err) {
        if (global.console && console.warn) console.warn('Study module could not be saved:', err);
        failJob(job, {
          code: 'SAVE_FAILED',
          message: 'Your device could not save the study module. Free some storage space, then try again.'
        });
        return;
      }
      if (!isActive(job)) return;
      finishCompleted(job, { module: module, revisionOnly: !!module.revisionOnly });
    }

    function finishCompleted(job, payload) {
      job.status = 'completed';
      job.stage = 'done';
      job.message = payload && payload.text
        ? 'Your document is ready.'
        : 'Your study module is ready.';
      job.progress = { indeterminate: false, completed: null, total: null, percent: 100 };
      job.moduleId = payload && payload.module ? payload.module.id : null;
      job.revisionOnly = !!(payload && payload.revisionOnly);
      updateView(job);
      emitSettled(Object.assign({
        status: 'completed',
        type: job.type,
        job: view(job)
      }, payload || {}));
      cleanupStorage(job);
    }

    async function completeGeneration(job, analyzed) {
      if (!isActive(job)) return;
      terminateWorker();
      let built;
      try {
        built = buildModule(job, analyzed);
      } catch (err) {
        failJob(job, err);
        return;
      }
      job.revisionOnly = built.revisionOnly;
      if (!isActive(job)) return;
      await saveBuiltModule(job, built.module);
    }

    function shapeAnalysis(analyzed) {
      return {
        sectionsCount: Array.isArray(analyzed.sections) ? analyzed.sections.length : (analyzed.sectionsCount || 0),
        inventory: analyzed.inventory,
        questions: analyzed.questions,
        generation: analyzed.generation,
        validation: analyzed.validation,
        generationError: analyzed.generationError ? {
          code: analyzed.generationError.code || '',
          message: analyzed.generationError.message || ''
        } : null
      };
    }

    function runInline(job, spec) {
      setTimeout(function () {
        if (!isActive(job)) return;
        if (!inlineAnalyze) {
          failJob(job, { code: 'WORKER_UNAVAILABLE' });
          return;
        }
        try {
          const analyzed = inlineAnalyze({
            text: spec.text,
            title: spec.title,
            sourceMeta: cleanSourceMeta(spec.sourceMeta),
            targetCount: spec.targetCount
          }, {
            onStage: function (stage, detail) {
              applyProgress(job, {
                stage: stage,
                message: (detail && detail.message) || '',
                progress: { indeterminate: true }
              });
            }
          });
          completeGeneration(job, shapeAnalysis(analyzed));
        } catch (err) {
          failJob(job, err);
        }
      }, 0);
    }

    function startWorker(job, spec) {
      let worker = null;
      try {
        worker = createWorker(job.id);
      } catch (err) {
        worker = null;
      }

      if (!worker) {
        runInline(job, spec);
        return;
      }

      activeWorker = worker;
      const onMessage = function (event) {
        const data = event && event.data ? event.data : {};
        if (!data || (data.jobId && data.jobId !== job.id)) return;
        if (!isActive(job)) return;
        if (data.type === 'progress') {
          applyProgress(job, data);
        } else if (data.type === 'result') {
          completeGeneration(job, data.analyzed || {});
        } else if (data.type === 'error') {
          failJob(job, { code: data.code || 'WORKER_FAILED', message: data.message });
        }
      };
      const onError = function () {
        if (!isActive(job)) return;
        failJob(job, { code: 'WORKER_FAILED' });
      };

      if (typeof worker.addEventListener === 'function') {
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
      } else {
        worker.onmessage = onMessage;
        worker.onerror = onError;
      }

      try {
        worker.postMessage({
          type: 'generate',
          jobId: job.id,
          text: spec.text,
          title: spec.title,
          sourceMeta: cleanSourceMeta(spec.sourceMeta),
          targetCount: spec.targetCount || 15
        });
      } catch (err) {
        failJob(job, { code: 'WORKER_FAILED' });
      }
    }

    async function beginGeneration(job, spec) {
      job.retryPayload = spec;
      job.sourceMeta = spec.sourceMeta || null;
      await persistJob(job);
      if (!isActive(job)) return;

      let inputOk = false;
      if (storage && typeof storage.saveJobInput === 'function') {
        try {
          inputOk = await storage.saveJobInput(job.id, {
            kind: 'text',
            text: spec.text,
            sourceMeta: cleanSourceMeta(spec.sourceMeta)
          });
        } catch (err) {
          markNotRecoverable(job, err);
        }
      }
      if (!inputOk && isActive(job)) {
        markNotRecoverable(job, new Error('The source text could not be stored for recovery.'));
      }
      if (!isActive(job)) return;
      startWorker(job, spec);
    }

    function startGeneration(spec) {
      if (current && !TERMINAL[current.status]) {
        return { accepted: false, reason: 'busy', job: view(current) };
      }
      if (current && TERMINAL[current.status]) cleanupStorage(current);
      terminateWorker();
      const startedAt = clock();
      const job = {
        id: makeId(),
        type: 'generate',
        status: 'running',
        stage: 'preparing',
        stageKeys: sequenceFor('generate'),
        message: STAGE_MESSAGES.preparing,
        title: spec.title || 'Custom Study Quiz',
        createdAt: iso(),
        updatedAt: iso(),
        startedAtMs: startedAt,
        sourceMeta: spec.sourceMeta || null,
        progress: { indeterminate: true, completed: null, total: null, percent: null },
        checkpoint: { pages: 0 },
        recoverable: true
      };
      current = job;
      emitUpdate(view(job));
      beginGeneration(job, {
        text: spec.text,
        title: job.title,
        sourceMeta: spec.sourceMeta,
        targetCount: spec.targetCount || 15
      });
      return { accepted: true, job: view(job) };
    }

    function queuePageWrite(job, pageNumber, pageText) {
      pageWrites = pageWrites.then(async function () {
        if (!isActive(job)) return;
        try {
          const ok = await storage.saveJobPage(job.id, pageNumber, pageText);
          if (!ok) {
            markNotRecoverable(job, new Error('Page checkpoints are unavailable.'));
            return;
          }
          job.checkpoint = job.checkpoint || {};
          job.checkpoint.pages = Math.max(job.checkpoint.pages || 0, pageNumber);
        } catch (err) {
          markNotRecoverable(job, err);
        }
      }).catch(function () { /* keep the chain alive */ });
    }

    function handleImportProgress(job, event) {
      if (!isActive(job)) return;
      const data = event || {};
      if (data.stage && data.stage !== job.stage) {
        job.stage = data.stage;
      }
      if (data.pageNumber && data.pageText) {
        queuePageWrite(job, data.pageNumber, data.pageText);
      }
      applyProgress(job, Object.assign({}, data, {
        stage: data.stage || job.stage,
        progress: data
      }));
    }

    async function runImport(job, spec, priorPages) {
      job.retryPayload = spec;
      const pages = Array.isArray(priorPages) ? priorPages : [];
      const startPage = pages.length
        ? Math.max.apply(null, pages.map(function (p) { return p.page; })) + 1
        : 1;
      const initialPages = pages.map(function (p) { return { page: p.page, text: p.text }; });

      if (!readFile && !spec.readFile) {
        failJob(job, { code: 'WORKER_UNAVAILABLE' });
        return;
      }
      const loader = spec.readFile || readFile;

      abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (startPage > 1) {
        job.message = 'Resuming from the last saved page…';
        updateView(job);
      }

      try {
        const detailed = await loader(spec.file, function (event) {
          handleImportProgress(job, event);
        }, {
          signal: abortController ? abortController.signal : null,
          startPage: startPage,
          initialPages: initialPages
        });

        if (!isActive(job)) return;
        await pageWrites;
        if (!isActive(job)) return;

        const text = detailed && detailed.text ? detailed.text : '';
        if (!text || text.trim().length < 25) {
          throw new Error('No readable text was found. For a scanned PDF, try a clear photo of each page instead.');
        }

        job.progress = { indeterminate: false, completed: null, total: null, percent: 100 };
        abortController = null;
        finishCompleted(job, { text: text, detailed: detailed });
      } catch (err) {
        if (!isActive(job)) return;
        if (isAbort(err)) return;
        abortController = null;
        failJob(job, err);
      }
    }

    function startImport(spec) {
      if (current && !TERMINAL[current.status]) {
        return { accepted: false, reason: 'busy', job: view(current) };
      }
      if (current && TERMINAL[current.status]) cleanupStorage(current);
      terminateWorker();
      const name = spec.file && spec.file.name ? spec.file.name : 'Document';
      const ext = name.split('.').pop().toLowerCase();
      const kind = ext === 'pdf' ? 'pdf'
        : (['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) >= 0 ? 'ocr' : 'text');
      const job = {
        id: makeId(),
        type: 'import',
        kind: kind,
        status: 'running',
        stage: 'opening',
        stageKeys: sequenceFor('import', kind),
        message: STAGE_MESSAGES.opening,
        title: name,
        createdAt: iso(),
        updatedAt: iso(),
        startedAtMs: clock(),
        source: {
          fileName: name,
          fileSize: spec.file ? spec.file.size : 0,
          fileType: spec.file ? spec.file.type : ''
        },
        progress: { indeterminate: true, completed: null, total: null, percent: null },
        checkpoint: { pages: 0 },
        recoverable: true
      };
      current = job;
      emitUpdate(view(job));

      (async function () {
        await persistJob(job);
        if (!isActive(job)) return;
        let inputOk = false;
        if (storage && typeof storage.saveJobInput === 'function' && spec.file) {
          try {
            inputOk = await storage.saveJobInput(job.id, {
              kind: 'file',
              blob: spec.file,
              name: name,
              type: spec.file.type || '',
              size: spec.file.size || 0
            });
          } catch (err) {
            markNotRecoverable(job, err);
          }
        }
        if (!inputOk && isActive(job)) {
          markNotRecoverable(job, new Error('The source file could not be stored for recovery.'));
        }
        if (!isActive(job)) return;
        runImport(job, spec, []);
      })();
      return { accepted: true, job: view(job) };
    }

    function cancel() {
      const job = current;
      if (!job || job.status !== 'running') return false;
      if (job.stage === 'saving') return false;
      job.cancelRequested = true;
      job.status = 'cancelled';
      job.message = 'Processing cancelled.';
      terminateWorker();
      if (abortController) {
        try { abortController.abort(); } catch (err) { /* already aborted */ }
        abortController = null;
      }
      updateView(job);
      emitSettled({ status: 'cancelled', type: job.type, job: view(job) });
      Promise.resolve(pageWrites).then(function () {
        cleanupStorage(job);
      }).catch(function () {
        cleanupStorage(job);
      });
      return true;
    }

    function retry() {
      const job = current;
      if (!job || job.status !== 'failed') return false;
      job.status = 'running';
      job.error = null;
      job.cancelRequested = false;
      job.message = 'Retrying on this device…';

      if (job.checkpoint && job.checkpoint.module) {
        updateView(job);
        saveBuiltModule(job, job.checkpoint.module);
        return true;
      }
      if (job.type === 'generate' && job.retryPayload) {
        job.stage = 'preparing';
        job.progress = { indeterminate: true, completed: null, total: null, percent: null };
        updateView(job);
        persistJob(job);
        startWorker(job, job.retryPayload);
        return true;
      }
      if (job.type === 'import' && job.retryPayload) {
        job.stage = 'opening';
        updateView(job);
        persistJob(job);
        runImport(job, job.retryPayload, []);
        return true;
      }
      return false;
    }

    function dismiss() {
      const job = current;
      if (!job || !TERMINAL[job.status]) return false;
      terminateWorker();
      cleanupStorage(job);
      current = null;
      emitUpdate(null);
      return true;
    }

    async function listInterrupted() {
      if (current && !TERMINAL[current.status]) return [];
      if (!storage || typeof storage.getJobs !== 'function') return [];
      let records = [];
      try {
        records = await storage.getJobs();
      } catch (err) {
        return [];
      }
      const active = (Array.isArray(records) ? records : [])
        .filter(function (job) {
          if (!job || !job.id) return false;
          if (!TERMINAL[job.status]) return true;
          // A module generated but not written is still recoverable.
          return job.status === 'failed' && job.error && job.error.code === 'SAVE_FAILED'
            && job.checkpoint && job.checkpoint.module;
        })
        .sort(function (a, b) { return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0); })
        .slice(0, 3);

      // Remove terminal leftovers (for example a crash during cleanup) so they
      // cannot accumulate. Save failures are excluded because they are active.
      for (const rec of (Array.isArray(records) ? records : [])) {
        if (!rec || !rec.id || !TERMINAL[rec.status]) continue;
        const saveFailure = rec.status === 'failed' && rec.error
          && rec.error.code === 'SAVE_FAILED' && rec.checkpoint && rec.checkpoint.module;
        if (saveFailure) continue;
        try { await storage.deleteJob(rec.id); } catch (err) { /* best effort */ }
      }

      const results = [];
      for (const rec of active) {
        const wasSaveFailure = rec.status === 'failed';
        let input = null;
        try {
          input = await storage.getJobInput(rec.id);
        } catch (err) {
          input = null;
        }
        let canResume = false;
        let reason = '';
        if (rec.checkpoint && rec.checkpoint.module) {
          canResume = true;
        } else if (rec.type === 'generate' && input && input.kind === 'text' && input.text) {
          canResume = true;
        } else if (rec.type === 'import' && input && input.blob) {
          canResume = true;
        } else {
          reason = 'The saved input for this job is no longer available, so it cannot be resumed.';
        }

        rec.status = 'interrupted';
        rec.message = wasSaveFailure
          ? 'The study module was ready but had not been saved when the app closed.'
          : 'Processing stopped when the app closed.';
        if (wasSaveFailure) rec.error = null;
        rec.updatedAt = iso();
        if (rec.recoverable !== false) {
          try { await storage.saveJob(rec); } catch (err) { /* keep it in memory */ }
        }
        const snapshot = view(rec);
        snapshot.canResume = canResume;
        snapshot.reason = reason;
        results.push(snapshot);
      }
      return results;
    }

    async function resume(jobId) {
      if (current && !TERMINAL[current.status]) {
        return { accepted: false, reason: 'busy' };
      }
      let rec = null;
      try {
        rec = await storage.getJob(jobId);
      } catch (err) {
        rec = null;
      }
      if (!rec) return { accepted: false, reason: 'missing' };

      rec.status = 'running';
      rec.resumed = true;
      rec.cancelRequested = false;
      rec.startedAtMs = clock();
      rec.error = null;
      rec.message = 'Resuming where processing stopped…';
      current = rec;
      updateView(rec);

      if (rec.checkpoint && rec.checkpoint.module) {
        saveBuiltModule(rec, rec.checkpoint.module);
        return { accepted: true, job: view(rec) };
      }

      let input = null;
      try {
        input = await storage.getJobInput(jobId);
      } catch (err) {
        input = null;
      }

      if (rec.type === 'generate') {
        if (!input || !input.text) {
          failJob(rec, { code: 'NO_INPUT' });
          return { accepted: false, job: view(rec) };
        }
        startWorker(rec, {
          text: input.text,
          title: rec.title,
          sourceMeta: input.sourceMeta || rec.sourceMeta || null,
          targetCount: 15
        });
        return { accepted: true, job: view(rec) };
      }

      if (rec.type === 'import') {
        if (!input || !input.blob) {
          failJob(rec, { code: 'NO_INPUT' });
          return { accepted: false, job: view(rec) };
        }
        let pages = [];
        try {
          pages = await storage.getJobPages(jobId);
        } catch (err) {
          pages = [];
        }
        let file = null;
        try {
          file = new File([input.blob], input.name || rec.title, { type: input.type || '' });
        } catch (err) {
          failJob(rec, { code: 'NO_INPUT' });
          return { accepted: false, job: view(rec) };
        }
        runImport(rec, { file: file, title: rec.title, readFile: readFile }, pages);
        return { accepted: true, job: view(rec) };
      }

      failJob(rec, { code: 'NO_INPUT' });
      return { accepted: false, job: view(rec) };
    }

    function discard(jobId) {
      const id = jobId || (current && current.id);
      if (!id) return false;
      if (current && current.id === id) {
        terminateWorker();
        current = null;
        emitUpdate(null);
      }
      if (storage && typeof storage.deleteJob === 'function') {
        Promise.resolve(storage.deleteJob(id)).catch(function () { /* best effort */ });
      }
      return true;
    }

    function getCurrent() {
      return view(current);
    }

    function isBusy() {
      return !!current && !TERMINAL[current.status];
    }

    function refresh() {
      if (current) emitUpdate(view(current));
    }

    return {
      startGeneration: startGeneration,
      startImport: startImport,
      cancel: cancel,
      retry: retry,
      dismiss: dismiss,
      resume: resume,
      discard: discard,
      listInterrupted: listInterrupted,
      getCurrent: getCurrent,
      isBusy: isBusy,
      refresh: refresh
    };
  }

  const api = {
    createJobManager: createJobManager,
    normalizeProgress: normalizeProgress,
    STAGE_LABELS: STAGE_LABELS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StudySynthJobs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
