/**
 * StudySynth Lite — Processing job manager tests.
 * Exercises cancellation, stale-worker rejection, checkpoints, recovery,
 * quota failures, and the rule that completion is only emitted after the
 * module write succeeds. Runs without a DOM or IndexedDB.
 */

const assert = require('assert');
const Jobs = require('../engine/jobs.js');

console.log('--- Running StudySynth Lite Processing Job Tests ---');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushTimes(count) {
  for (let i = 0; i < count; i++) await flush();
}

function quotaError() {
  const err = new Error('The quota has been exceeded.');
  err.name = 'QuotaExceededError';
  return err;
}

function makeStorage() {
  return {
    jobs: new Map(),
    inputs: new Map(),
    pages: new Map(),
    failJobSave: false,
    failInputSave: false,
    failPageSave: false,
    pageWrites: 0,
    async saveJob(job) {
      if (this.failJobSave) throw quotaError();
      this.jobs.set(job.id, JSON.parse(JSON.stringify(job)));
      return true;
    },
    async getJob(id) {
      const job = this.jobs.get(id);
      return job ? JSON.parse(JSON.stringify(job)) : null;
    },
    async getJobs() {
      return Array.from(this.jobs.values()).map((job) => JSON.parse(JSON.stringify(job)));
    },
    async deleteJob(id) {
      this.jobs.delete(id);
      this.inputs.delete(id);
      for (const [key, page] of Array.from(this.pages.entries())) {
        if (page.jobId === id) this.pages.delete(key);
      }
      return true;
    },
    async saveJobInput(id, input) {
      if (this.failInputSave) throw quotaError();
      this.inputs.set(id, input);
      return true;
    },
    async getJobInput(id) {
      return this.inputs.get(id) || null;
    },
    async saveJobPage(id, page, text) {
      if (this.failPageSave) throw quotaError();
      this.pageWrites++;
      this.pages.set(id + ':' + page, { jobId: id, page: page, text: text });
      return true;
    },
    async getJobPages(id) {
      return Array.from(this.pages.values())
        .filter((page) => page.jobId === id)
        .sort((a, b) => a.page - b.page);
    }
  };
}

function makeWorkers() {
  const workers = [];
  return {
    workers,
    create(jobId) {
      const handlers = {};
      const worker = {
        jobId: jobId,
        posted: null,
        terminated: false,
        addEventListener(type, handler) {
          (handlers[type] || (handlers[type] = [])).push(handler);
        },
        postMessage(message) {
          this.posted = message;
        },
        terminate() {
          this.terminated = true;
        },
        emit(data) {
          (handlers.message || []).forEach((handler) => handler({ data: data }));
        },
        emitError() {
          (handlers.error || []).forEach((handler) => handler({}));
        }
      };
      workers.push(worker);
      return worker;
    },
    last() {
      return workers[workers.length - 1];
    }
  };
}

function makeManager(storage, workers, hooks) {
  const options = hooks || {};
  return Jobs.createJobManager({
    storage: storage,
    workers: workers,
    saveModule: options.saveModule || (async () => {}),
    readFile: options.readFile || null,
    analyze: options.analyze || null,
    onUpdate: options.onUpdate || (() => {}),
    onSettled: options.onSettled || (() => {}),
    now: options.now || (() => 1700000000000)
  });
}

const analyzedOk = {
  sectionsCount: 1,
  inventory: [{ ku_id: 'ku_1', statement: 'A fact.' }],
  questions: [{ id: 'q_1', stem: 'A question?' }],
  generation: { totalCandidates: 1 },
  validation: { valid: true, accepted: 1, rejected: 0, rejectionCounts: {} },
  generationError: null
};

function generationSpec(text) {
  return {
    title: 'Test module',
    text: text || 'A sufficiently long source text for the deterministic engine.',
    sourceMeta: { origin: 'text', confidence: null, lowConfidence: false },
    targetCount: 15
  };
}

async function beginGeneration(manager, workers, text) {
  const started = manager.startGeneration(generationSpec(text));
  assert.strictEqual(started.accepted, true, 'A fresh generation job should be accepted');
  await flushTimes(3);
  assert.strictEqual(workers.workers.length, 1, 'A generation worker should be created');
  return { job: started.job, worker: workers.last() };
}

(async function run() {
  // 1. Progress normalization is truthful.
  console.log('[Test 1] Normalizing real progress and indeterminate states...');
  const pageProgress = Jobs.normalizeProgress({ completed: 3, total: 12 });
  assert.strictEqual(pageProgress.indeterminate, false);
  assert.strictEqual(pageProgress.percent, 25);
  const ocrProgress = Jobs.normalizeProgress({ ratio: 0.42 });
  assert.strictEqual(ocrProgress.percent, 42);
  const unknownProgress = Jobs.normalizeProgress({ indeterminate: true });
  assert.strictEqual(unknownProgress.indeterminate, true);
  assert.strictEqual(unknownProgress.percent, null);
  assert.strictEqual(Jobs.normalizeProgress({}).percent, null);
  console.log('  ✓ Percentages come only from supplied measurements.');

  // 2. Completion waits for the save, and the module is stored once.
  console.log('[Test 2] Waiting for persistence before declaring completion...');
  {
    const storage = makeStorage();
    const workers = makeWorkers();
    const updates = [];
    const settled = [];
    let resolveSave = null;
    let saveCalls = 0;
    const gate = new Promise((resolve) => { resolveSave = resolve; });
    const manager = makeManager(storage, workers, {
      saveModule: () => { saveCalls++; return gate; },
      onUpdate: (job) => updates.push(job),
      onSettled: (result) => settled.push(result)
    });
    const { job, worker } = await beginGeneration(manager, workers);

    worker.emit({ type: 'progress', jobId: job.id, stage: 'inventory', message: 'Finding important facts', progress: { indeterminate: true } });
    assert.strictEqual(updates[updates.length - 1].stage, 'inventory');
    assert.strictEqual(updates[updates.length - 1].progress.indeterminate, true);

    worker.emit({ type: 'result', jobId: job.id, analyzed: analyzedOk });
    await flushTimes(4);
    assert.strictEqual(saveCalls, 1, 'The module write should have started');
    assert.strictEqual(settled.length, 0, 'No completion before the write resolves');
    assert.strictEqual(manager.getCurrent().stage, 'saving');
    assert.strictEqual(manager.getCurrent().canCancel, false, 'Saving cannot be cancelled mid-write');

    resolveSave();
    await flushTimes(4);
    assert.strictEqual(settled.length, 1);
    assert.strictEqual(settled[0].status, 'completed');
    assert.strictEqual(settled[0].module.questions.length, 1);
    assert.strictEqual(manager.getCurrent().status, 'completed');
    assert.strictEqual(worker.terminated, true);
    await flushTimes(2);
    assert.strictEqual(storage.jobs.has(job.id), false, 'Temporary job data is cleaned after success');
    assert.strictEqual(storage.inputs.has(job.id), false);
    console.log('  ✓ Completion follows the successful write, not the worker result.');
  }

  // 3. A failed write cannot produce a false success; retry saves the checkpoint.
  console.log('[Test 3] Failing safely on a module write error, then retrying...');
  {
    const storage = makeStorage();
    const workers = makeWorkers();
    const settled = [];
    let failSave = true;
    const saved = [];
    const manager = makeManager(storage, workers, {
      saveModule: async (module) => {
        if (failSave) throw quotaError();
        saved.push(module);
      },
      onSettled: (result) => settled.push(result)
    });
    const { job, worker } = await beginGeneration(manager, workers);
    worker.emit({ type: 'result', jobId: job.id, analyzed: analyzedOk });
    await flushTimes(4);

    assert.strictEqual(manager.getCurrent().status, 'failed');
    assert.strictEqual(settled[0].status, 'failed');
    assert.strictEqual(settled[0].error.code, 'SAVE_FAILED');
    assert.strictEqual(saved.length, 0, 'No module was stored');
    assert.strictEqual(settled.some((entry) => entry.status === 'completed'), false);

    failSave = false;
    assert.strictEqual(manager.retry(), true, 'Retry should reuse the saved result instead of regenerating');
    await flushTimes(4);
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(settled[settled.length - 1].status, 'completed');
    assert.strictEqual(manager.getCurrent().status, 'completed');
    console.log('  ✓ Quota failures stay failures until a later write succeeds.');
  }

  // 4. Cancellation stops the worker, ignores late results, and saves nothing.
  console.log('[Test 4] Cancelling and rejecting stale worker messages...');
  {
    const storage = makeStorage();
    const workers = makeWorkers();
    const settled = [];
    const saved = [];
    const manager = makeManager(storage, workers, {
      saveModule: async (module) => saved.push(module),
      onSettled: (result) => settled.push(result)
    });
    const { job, worker } = await beginGeneration(manager, workers);
    assert.strictEqual(manager.isBusy(), true);

    assert.strictEqual(manager.cancel(), true);
    assert.strictEqual(worker.terminated, true);
    assert.strictEqual(settled[0].status, 'cancelled');

    worker.emit({ type: 'result', jobId: job.id, analyzed: analyzedOk });
    await flushTimes(4);
    assert.strictEqual(saved.length, 0, 'A cancelled job must never save a partial module');
    assert.strictEqual(settled.some((entry) => entry.status === 'completed'), false);
    assert.strictEqual(manager.getCurrent().status, 'cancelled');

    const second = manager.startGeneration(generationSpec('Second run source text.'));
    assert.strictEqual(second.accepted, true);
    await flushTimes(3);
    assert.strictEqual(workers.workers.length, 2);
    worker.emit({ type: 'result', jobId: job.id, analyzed: analyzedOk });
    await flushTimes(3);
    assert.strictEqual(saved.length, 0, 'A stale result from the old worker is ignored');
    assert.strictEqual(manager.getCurrent().id, second.job.id);

    assert.strictEqual(manager.dismiss(), false, 'A running job cannot be dismissed');
    assert.strictEqual(manager.cancel(), true);
    await flushTimes(2);
    assert.strictEqual(manager.dismiss(), true);
    assert.strictEqual(manager.getCurrent(), null);
    console.log('  ✓ Late results cannot revive a cancelled job.');
  }

  // 5. A busy manager rejects duplicate runs.
  console.log('[Test 5] Rejecting a duplicate processing run...');
  {
    const storage = makeStorage();
    const workers = makeWorkers();
    const manager = makeManager(storage, workers);
    await beginGeneration(manager, workers);
    const duplicate = manager.startGeneration(generationSpec('Another source text.'));
    assert.strictEqual(duplicate.accepted, false);
    assert.strictEqual(duplicate.reason, 'busy');
    assert.strictEqual(workers.workers.length, 1);
    manager.cancel();
    await flushTimes(2);
    console.log('  ✓ Only one expensive job runs at a time.');
  }

  // 6. A reload detects the interrupted job and resumes from the saved input.
  console.log('[Test 6] Detecting an interrupted job after a reload and resuming...');
  {
    const storage = makeStorage();
    const firstWorkers = makeWorkers();
    const first = makeManager(storage, firstWorkers);
    const { job } = await beginGeneration(first, firstWorkers, 'Checkpointed source text for recovery.');
    assert.strictEqual(firstWorkers.last().posted.text, 'Checkpointed source text for recovery.');

    // Simulate process death: the old manager is abandoned, storage remains.
    const secondWorkers = makeWorkers();
    const settled = [];
    const second = makeManager(storage, secondWorkers, {
      onSettled: (result) => settled.push(result)
    });
    const interrupted = await second.listInterrupted();
    assert.strictEqual(interrupted.length, 1);
    assert.strictEqual(interrupted[0].id, job.id);
    assert.strictEqual(interrupted[0].status, 'interrupted');
    assert.strictEqual(interrupted[0].canResume, true);

    const resumed = await second.resume(job.id);
    assert.strictEqual(resumed.accepted, true);
    assert.strictEqual(second.getCurrent().resumed, true);
    await flushTimes(3);
    assert.strictEqual(secondWorkers.workers.length, 1);
    assert.strictEqual(secondWorkers.last().posted.text, 'Checkpointed source text for recovery.');
    secondWorkers.last().emit({ type: 'result', jobId: job.id, analyzed: analyzedOk });
    await flushTimes(4);
    assert.strictEqual(settled.some((entry) => entry.status === 'completed'), true);
    console.log('  ✓ Resume rebuilds from the stored source text.');
  }

  // 7. A checkpointed module is saved after a crash instead of regenerating.
  console.log('[Test 7] Completing a crash during the final module save...');
  {
    const storage = makeStorage();
    const module = {
      id: 'mod_checkpointed',
      title: 'Checkpointed title',
      questions: [{ id: 'q_saved' }],
      inventory: [{ ku_id: 'ku_saved' }],
      validation: { valid: true },
      revisionOnly: false
    };
    await storage.saveJob({
      id: 'job_checkpointed',
      type: 'generate',
      status: 'running',
      stage: 'saving',
      stageKeys: ['preparing', 'inventory', 'generating', 'validating', 'saving'],
      message: 'Saving your study module…',
      title: module.title,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      progress: { indeterminate: true },
      checkpoint: { module: module },
      recoverable: true
    });

    const workers = makeWorkers();
    const saved = [];
    const settled = [];
    const manager = makeManager(storage, workers, {
      saveModule: async (value) => saved.push(value),
      onSettled: (result) => settled.push(result)
    });
    const interrupted = await manager.listInterrupted();
    assert.strictEqual(interrupted[0].canResume, true);
    const resumed = await manager.resume('job_checkpointed');
    assert.strictEqual(resumed.accepted, true);
    await flushTimes(4);
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].id, module.id);
    assert.strictEqual(settled[settled.length - 1].status, 'completed');
    assert.strictEqual(workers.workers.length, 0, 'No worker is needed when the module already exists');
    console.log('  ✓ A saved checkpoint is written without regenerating questions.');
  }

  // 7b. A save failure survives a reload as a resumable checkpoint.
  console.log('[Test 7b] Recovering a failed final write after a reload...');
  {
    const storage = makeStorage();
    const module = {
      id: 'mod_write_failed',
      title: 'Write failed',
      questions: [{ id: 'q_kept' }],
      inventory: [],
      validation: { valid: true },
      revisionOnly: false
    };
    await storage.saveJob({
      id: 'job_write_failed',
      type: 'generate',
      status: 'failed',
      stage: 'saving',
      stageKeys: ['preparing', 'inventory', 'generating', 'validating', 'saving'],
      message: 'The study module could not be saved.',
      title: module.title,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      progress: { indeterminate: false, completed: null, total: null, percent: 100 },
      checkpoint: { module: module },
      error: { code: 'SAVE_FAILED', message: 'The study module could not be saved.' },
      recoverable: true
    });
    const saved = [];
    const settled = [];
    const manager = makeManager(storage, makeWorkers(), {
      saveModule: async (value) => saved.push(value),
      onSettled: (result) => settled.push(result)
    });
    const interrupted = await manager.listInterrupted();
    assert.strictEqual(interrupted.length, 1);
    assert.strictEqual(interrupted[0].status, 'interrupted');
    assert.strictEqual(interrupted[0].canResume, true);
    assert.strictEqual(interrupted[0].error, null);
    const resumed = await manager.resume('job_write_failed');
    assert.strictEqual(resumed.accepted, true);
    await flushTimes(4);
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(settled[settled.length - 1].status, 'completed');
    console.log('  ✓ A failed write is retried from the checkpoint after restart.');
  }

  // 8. Missing input is explained, never silently resumed.
  console.log('[Test 8] Explaining a job whose saved input is missing...');
  {
    const storage = makeStorage();
    await storage.saveJob({
      id: 'job_missing_input',
      type: 'generate',
      status: 'running',
      stage: 'inventory',
      stageKeys: ['preparing', 'inventory', 'generating', 'validating', 'saving'],
      message: 'Finding important facts…',
      title: 'Missing input',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      progress: { indeterminate: true },
      recoverable: true
    });
    const workers = makeWorkers();
    const manager = makeManager(storage, workers);
    const interrupted = await manager.listInterrupted();
    assert.strictEqual(interrupted[0].canResume, false);
    assert.ok(/no longer available/i.test(interrupted[0].reason));

    const resumed = await manager.resume('job_missing_input');
    assert.strictEqual(resumed.accepted, false);
    assert.strictEqual(manager.getCurrent().status, 'failed');
    assert.strictEqual(manager.getCurrent().error.code, 'NO_INPUT');
    assert.ok(/add the document again/i.test(manager.getCurrent().message));
    assert.strictEqual(workers.workers.length, 0);
    console.log('  ✓ Missing checkpoints produce a clear, non-recoverable state.');
  }

  // 9. Storage failures mark the job non-recoverable but do not fake progress.
  console.log('[Test 9] Continuing safely when checkpoint storage is unavailable...');
  {
    const storage = makeStorage();
    storage.failJobSave = true;
    const workers = makeWorkers();
    const updates = [];
    const manager = makeManager(storage, workers, {
      onUpdate: (job) => updates.push(job)
    });
    const started = manager.startGeneration(generationSpec());
    assert.strictEqual(started.accepted, true);
    await flushTimes(4);
    assert.strictEqual(manager.getCurrent().recoverable, false);
    assert.ok(/keep the app open/i.test(manager.getCurrent().storageWarning));
    assert.strictEqual(workers.workers.length, 1, 'Processing still runs in-memory');
    assert.strictEqual(updates.length > 0, true);
    manager.cancel();
    await flushTimes(2);
    console.log('  ✓ Unavailable checkpoints are reported, not claimed as recoverable.');
  }

  // 10. Import progress checkpoints each real page and completes with the text.
  console.log('[Test 10] Importing a document with per-page progress and checkpoints...');
  {
    const storage = makeStorage();
    const workers = makeWorkers();
    const updates = [];
    const settled = [];
    const readCalls = [];
    const readFile = async (file, onProgress, options) => {
      readCalls.push(options);
      onProgress({ status: 'Reading 2 pages…', stage: 'extracting', completed: 0, total: 2 });
      onProgress({ status: 'Reading page 1 of 2…', stage: 'extracting', completed: 1, total: 2, pageNumber: 1, pageText: '==Page 1==\nFirst' });
      await flush();
      onProgress({ status: 'Reading page 2 of 2…', stage: 'extracting', completed: 2, total: 2, pageNumber: 2, pageText: '==Page 2==\nSecond' });
      return {
        text: '==Page 1==\nFirst\n\n==Page 2==\nSecond',
        origin: 'pdf-text',
        confidence: null,
        lowConfidence: false
      };
    };
    const manager = makeManager(storage, workers, {
      readFile: readFile,
      saveModule: async () => {},
      onUpdate: (job) => updates.push(job),
      onSettled: (result) => settled.push(result)
    });
    const file = {
      name: 'notes.pdf',
      size: 1024,
      type: 'application/pdf'
    };
    const started = manager.startImport({ file: file });
    assert.strictEqual(started.accepted, true);
    await flushTimes(6);

    assert.strictEqual(readCalls.length, 1);
    assert.strictEqual(readCalls[0].startPage, 1);
    assert.deepStrictEqual(readCalls[0].initialPages, []);
    assert.ok(readCalls[0].signal, 'The importer receives an abort signal');

    const pageUpdate = updates.find((entry) => entry.progress && entry.progress.completed === 2 && entry.progress.total === 2);
    assert.ok(pageUpdate, 'Real page progress reaches the dialog');
    assert.strictEqual(pageUpdate.progress.percent, 100);
    assert.strictEqual(storage.pageWrites, 2, 'Each completed page is checkpointed');
    assert.strictEqual(settled.length, 1);
    assert.strictEqual(settled[0].status, 'completed');
    assert.ok(/First/.test(settled[0].text));
    await flushTimes(2);
    assert.strictEqual(storage.jobs.has(started.job.id), false);
    console.log('  ✓ Page progress is real and the extracted text reaches the app.');
  }

  // 11. Cancelling an import aborts the reader and saves nothing.
  console.log('[Test 11] Cancelling an in-flight document import...');
  {
    const storage = makeStorage();
    const workers = makeWorkers();
    const settled = [];
    let capturedSignal = null;
    const readFile = (file, onProgress, options) => new Promise((resolve, reject) => {
      capturedSignal = options.signal;
      onProgress({ status: 'Reading 4 pages…', stage: 'extracting', completed: 1, total: 4, pageNumber: 1, pageText: '==Page 1==\nA' });
      options.signal.addEventListener('abort', () => {
        const err = new Error('Processing cancelled.');
        err.name = 'AbortError';
        reject(err);
      });
    });
    const manager = makeManager(storage, workers, {
      readFile: readFile,
      saveModule: async () => {},
      onSettled: (result) => settled.push(result)
    });
    manager.startImport({ file: { name: 'notes.pdf', size: 10, type: 'application/pdf' } });
    await flushTimes(4);
    assert.ok(capturedSignal);
    assert.strictEqual(manager.cancel(), true);
    assert.strictEqual(capturedSignal.aborted, true);
    await flushTimes(3);
    assert.strictEqual(settled[0].status, 'cancelled');
    assert.strictEqual(settled.some((entry) => entry.status === 'completed'), false);
    assert.strictEqual(storage.jobs.size, 0);
    console.log('  ✓ Cancellation aborts extraction and cleans temporary data.');
  }

  // 12. Resuming an import reuses stored pages and starts at the next page.
  console.log('[Test 12] Resuming an interrupted import from the last saved page...');
  {
    const storage = makeStorage();
    const id = 'job_import_resume';
    await storage.saveJob({
      id: id,
      type: 'import',
      kind: 'pdf',
      status: 'running',
      stage: 'extracting',
      stageKeys: ['opening', 'extracting', 'preparing'],
      message: 'Reading document pages…',
      title: 'notes.pdf',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      progress: { indeterminate: false, completed: 2, total: 4, percent: 50 },
      checkpoint: { pages: 2 },
      source: { fileName: 'notes.pdf', fileSize: 10, fileType: 'application/pdf' },
      recoverable: true
    });
    await storage.saveJobInput(id, {
      kind: 'file',
      blob: new Blob(['pdf-bytes']),
      name: 'notes.pdf',
      type: 'application/pdf',
      size: 10
    });
    await storage.saveJobPage(id, 1, '==Page 1==\nA');
    await storage.saveJobPage(id, 2, '==Page 2==\nB');

    let captured = null;
    const settled = [];
    const manager = makeManager(storage, makeWorkers(), {
      readFile: async (file, onProgress, options) => {
        captured = options;
        return { text: '==Page 1==\nA\n\n==Page 2==\nB\n\n==Page 3==\nC', origin: 'pdf-text' };
      },
      onSettled: (result) => settled.push(result)
    });
    const interrupted = await manager.listInterrupted();
    assert.strictEqual(interrupted[0].canResume, true);
    const resumed = await manager.resume(id);
    assert.strictEqual(resumed.accepted, true);
    await flushTimes(3);
    assert.ok(captured);
    assert.strictEqual(captured.startPage, 3);
    assert.deepStrictEqual(captured.initialPages, [
      { page: 1, text: '==Page 1==\nA' },
      { page: 2, text: '==Page 2==\nB' }
    ]);
    await flushTimes(3);
    assert.strictEqual(settled[settled.length - 1].status, 'completed');
    console.log('  ✓ Completed pages are reused instead of re-read.');
  }

  console.log('\n=============================================');
  console.log('ALL PROCESSING JOB TESTS PASSED (0 ERRORS)');
  console.log('=============================================\n');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
