/**
 * StudySynth Lite — Offline Storage Manager
 * Uses IndexedDB with LocalStorage fallback for 100% offline persistence on Android and desktop.
 */

(function (global) {
  'use strict';

  const DB_NAME = 'StudySynthLiteDB';
  // v4 adds the content-update overlay. Upgrades are additive only: existing
  // stores (modules, attempts, revision data) are never dropped or recreated.
  const DB_VERSION = 4;
  const STORE_MODULES = 'modules';
  const STORE_ATTEMPTS = 'attempts';
  const STORE_JOBS = 'jobs';
  const STORE_JOB_PAGES = 'jobPages';
  const STORE_JOB_INPUTS = 'jobInputs';
  const STORE_REVISION_PROGRESS = 'revisionProgress';
  const STORE_REVISION_SESSIONS = 'revisionSessions';
  const STORE_CONTENT_META = 'contentMeta';
  const STORE_CONTENT_MODULES = 'contentModules';

  let dbPromise = null;

  function getDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          resolve(null); // Fallback to LocalStorage
          return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_MODULES)) {
            db.createObjectStore(STORE_MODULES, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
            db.createObjectStore(STORE_ATTEMPTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_JOBS)) {
            db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_JOB_PAGES)) {
            const pages = db.createObjectStore(STORE_JOB_PAGES, { keyPath: 'key' });
            pages.createIndex('jobId', 'jobId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_JOB_INPUTS)) {
            db.createObjectStore(STORE_JOB_INPUTS, { keyPath: 'jobId' });
          }
          if (!db.objectStoreNames.contains(STORE_REVISION_PROGRESS)) {
            const progress = db.createObjectStore(STORE_REVISION_PROGRESS, { keyPath: 'key' });
            progress.createIndex('moduleId', 'moduleId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_REVISION_SESSIONS)) {
            db.createObjectStore(STORE_REVISION_SESSIONS, { keyPath: 'moduleId' });
          }
          if (!db.objectStoreNames.contains(STORE_CONTENT_META)) {
            db.createObjectStore(STORE_CONTENT_META, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_CONTENT_MODULES)) {
            const content = db.createObjectStore(STORE_CONTENT_MODULES, { keyPath: 'key' });
            content.createIndex('packId', 'packId', { unique: false });
          }
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          // Another tab that still holds the previous schema version is told to
          // release its connection so a pending upgrade can complete instead of
          // hanging the whole app.
          db.onversionchange = () => {
            try { db.close(); } catch (err) { /* already closed */ }
            dbPromise = null;
          };
          resolve(db);
        };
        // A newer version upgrade blocked by another open connection: fall back
        // to local storage for this session instead of hanging forever.
        req.onblocked = () => resolve(null);
        req.onerror = () => resolve(null);
      });
    }
    return dbPromise;
  }

  async function saveModule(quizModule) {
    const db = await getDB();
    if (db) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_MODULES], 'readwrite');
        const store = tx.objectStore(STORE_MODULES);
        store.put(quizModule);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('The study module could not be saved.'));
        tx.onabort = () => reject(tx.error || new Error('The study module write was aborted.'));
      });
    } else {
      // LocalStorage fallback
      const list = readLocalModules();
      const filtered = list.filter(m => m.id !== quizModule.id);
      filtered.unshift(quizModule);
      localStorage.setItem('studysynth_modules', JSON.stringify(filtered.slice(0, 20)));
      return true;
    }
  }

  let ctetIndexCache = null;
  // -------------------------------------------------------------------------
  // CONTENT UPDATE OVERLAY
  // A downloaded content package is written to its own namespace and becomes
  // visible only when the "active" pointer is swapped. Bookmarks, attempts and
  // revision data live in other stores and are never touched here.
  // -------------------------------------------------------------------------
  let contentState = { loaded: false, active: null, previous: null };

  async function loadContentState(force) {
    if (contentState.loaded && !force) return contentState;
    const db = await getDB();
    if (!db) {
      contentState = { loaded: true, active: null, previous: null };
      return contentState;
    }
    const active = await idbRead(STORE_CONTENT_META, 'get', 'active');
    const previous = await idbRead(STORE_CONTENT_META, 'get', 'previous');
    contentState = {
      loaded: true,
      active: active && active.packId ? active : null,
      previous: previous && previous.packId ? previous : null
    };
    return contentState;
  }

  function getBundledIndex() {
    if (contentState.active && Array.isArray(contentState.active.index) && contentState.active.index.length) {
      return contentState.active.index;
    }
    if (ctetIndexCache) return ctetIndexCache;
    ctetIndexCache = (typeof globalThis !== 'undefined' && globalThis.CTET_INDEX)
      || (typeof window !== 'undefined' && window.CTET_INDEX)
      || (typeof global !== 'undefined' && global.CTET_INDEX)
      || [];
    return Array.isArray(ctetIndexCache) ? ctetIndexCache : [];
  }

  function getBundledIds() {
    return new Set(getBundledIndex().map((m) => m && m.id).filter(Boolean));
  }

  function getDeletedModuleIds() {
    try {
      if (typeof localStorage !== 'undefined') {
        return new Set(JSON.parse(localStorage.getItem('ctet_deleted_ids') || '[]'));
      }
    } catch (e) {}
    return new Set();
  }

  function readLocalModules() {
    try {
      const list = JSON.parse(localStorage.getItem('studysynth_modules') || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  // Bundled set bodies live in ./ctet/<id>.json and are fetched only when a
  // learner opens one. Earlier releases copied every body into IndexedDB, which
  // doubled device storage; those copies (and the stale content they carried)
  // are cleared once per bundle version.
  async function clearSeededBundled(db) {
    const bundled = getBundledIndex();
    if (!db || !bundled.length) return;
    const synced = (typeof globalThis !== 'undefined' && globalThis.CTET_BUNDLE_VERSION) || '1';
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('ctet_bundle_synced') === synced) return;
    } catch (e) {}
    await new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction([STORE_MODULES], 'readwrite');
      } catch (err) {
        resolve();
        return;
      }
      const store = tx.objectStore(STORE_MODULES);
      bundled.forEach((entry) => {
        if (entry && entry.id) store.delete(entry.id);
      });
      tx.oncomplete = () => {
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem('ctet_bundle_synced', synced);
        } catch (e) {}
        resolve();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  let bundledBodyCache = new Map();
  async function fetchBundledBody(moduleId) {
    if (bundledBodyCache.has(moduleId)) return bundledBodyCache.get(moduleId);
    const request = (async () => {
      const state = await loadContentState();
      if (state.active) {
        const record = await idbRead(STORE_CONTENT_MODULES, 'get', state.active.packId + '|' + moduleId);
        if (record && record.body && record.body.id) return record.body;
      }
      const response = await fetch('./ctet/' + encodeURIComponent(moduleId) + '.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Bundled set unavailable (' + response.status + ').');
      return response.json();
    })();
    const guarded = request.catch(() => {
      bundledBodyCache.delete(moduleId);
      return null;
    });
    bundledBodyCache.set(moduleId, guarded);
    return guarded;
  }

  async function getModule(moduleId) {
    if (!moduleId) return null;
    await loadContentState();
    if (getBundledIds().has(moduleId)) {
      const body = await fetchBundledBody(moduleId);
      if (body && body.id) return body;
    }
    const db = await getDB();
    if (db) return idbRead(STORE_MODULES, 'get', moduleId);
    return readLocalModules().find((m) => m.id === moduleId) || null;
  }

  async function getModules() {
    await loadContentState();
    const db = await getDB();
    const bundled = getBundledIndex();
    const bundledIds = getBundledIds();
    const deletedIds = getDeletedModuleIds();

    let stored = [];
    if (db) {
      try {
        await clearSeededBundled(db);
        stored = await new Promise((resolve) => {
          let tx;
          try {
            tx = db.transaction([STORE_MODULES], 'readonly');
          } catch (err) {
            resolve([]);
            return;
          }
          const req = tx.objectStore(STORE_MODULES).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      } catch (err) {
        stored = readLocalModules();
      }
    } else {
      stored = readLocalModules();
    }

    // Saved sets win over the shipped index, so a learner's own work is never
    // shadowed. Bundled entries contribute only their lightweight summary.
    const storedIds = new Set();
    const list = [];
    stored.forEach((entry) => {
      if (!entry || !entry.id) return;
      if (bundledIds.has(entry.id)) return;
      storedIds.add(entry.id);
      list.push(entry);
    });
    bundled.forEach((entry) => {
      if (!entry || !entry.id) return;
      if (storedIds.has(entry.id) || deletedIds.has(entry.id)) return;
      list.push(entry);
    });
    return list;
  }

  async function deleteModule(moduleId) {
    try {
      if (typeof localStorage !== 'undefined') {
        const del = JSON.parse(localStorage.getItem('ctet_deleted_ids') || '[]');
        if (!del.includes(moduleId)) {
          del.push(moduleId);
          localStorage.setItem('ctet_deleted_ids', JSON.stringify(del));
        }
      }
    } catch (e) {}
    const db = await getDB();
    if (db) {
      return new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction([STORE_MODULES, STORE_REVISION_PROGRESS, STORE_REVISION_SESSIONS], 'readwrite');
        } catch (err) {
          // A pre-revision database without the revision stores: still delete the module.
          const fallbackTx = db.transaction([STORE_MODULES], 'readwrite');
          fallbackTx.objectStore(STORE_MODULES).delete(moduleId);
          fallbackTx.oncomplete = () => resolve(true);
          fallbackTx.onerror = () => resolve(false);
          return;
        }
        tx.objectStore(STORE_MODULES).delete(moduleId);
        tx.objectStore(STORE_REVISION_SESSIONS).delete(moduleId);
        const cursorReq = tx.objectStore(STORE_REVISION_PROGRESS).index('moduleId').openCursor(IDBKeyRange.only(moduleId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      });
    } else {
      const list = readLocalModules();
      const filtered = list.filter(m => m.id !== moduleId);
      localStorage.setItem('studysynth_modules', JSON.stringify(filtered));
      try {
        localStorage.removeItem(localProgressKey(moduleId));
        localStorage.removeItem(localSessionKey(moduleId));
      } catch (e) { /* private mode */ }
      return true;
    }
  }

  async function saveAttempt(attempt) {
    const db = await getDB();
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_ATTEMPTS], 'readwrite');
        const store = tx.objectStore(STORE_ATTEMPTS);
        store.put(attempt);
        tx.oncomplete = () => resolve(true);
      });
    } else {
      const list = JSON.parse(localStorage.getItem('studysynth_attempts') || '[]');
      list.unshift(attempt);
      localStorage.setItem('studysynth_attempts', JSON.stringify(list.slice(0, 50)));
      return true;
    }
  }

  async function getAttempts(moduleId) {
    const db = await getDB();
    let all = [];
    if (db) {
      all = await new Promise((resolve) => {
        const tx = db.transaction([STORE_ATTEMPTS], 'readonly');
        const store = tx.objectStore(STORE_ATTEMPTS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } else {
      all = JSON.parse(localStorage.getItem('studysynth_attempts') || '[]');
    }
    if (moduleId) {
      return all.filter(a => a.moduleId === moduleId);
    }
    return all;
  }

  // ==========================================================================
  // PROCESSING JOBS (resumable background work)
  // ==========================================================================
  const LOCAL_JOBS_KEY = 'studysynth_jobs';

  function readLocalJobs() {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalJobs(jobs) {
    localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs.slice(0, 5)));
  }

  function idbWrite(storeName, value) {
    return getDB().then((db) => {
      if (!db) return false;
      return new Promise((resolve, reject) => {
        let tx;
        try {
          tx = db.transaction([storeName], 'readwrite');
        } catch (err) {
          reject(err);
          return;
        }
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('Local storage write failed.'));
        tx.onabort = () => reject(tx.error || new Error('Local storage write was aborted.'));
      });
    });
  }

  function idbRead(storeName, method, arg) {
    return getDB().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction([storeName], 'readonly');
        } catch (err) {
          resolve(null);
          return;
        }
        const req = tx.objectStore(storeName)[method](arg);
        req.onsuccess = () => resolve(req.result == null ? null : req.result);
        req.onerror = () => resolve(null);
      });
    });
  }

  async function saveJob(job) {
    if (!job || !job.id) throw new Error('A processing job needs an id.');
    const db = await getDB();
    if (db) return idbWrite(STORE_JOBS, job);
    const jobs = readLocalJobs().filter((entry) => entry.id !== job.id);
    jobs.unshift(job);
    writeLocalJobs(jobs);
    return true;
  }

  async function getJobs() {
    const db = await getDB();
    if (db) {
      const list = await idbRead(STORE_JOBS, 'getAll');
      return Array.isArray(list) ? list : [];
    }
    return readLocalJobs();
  }

  async function getJob(jobId) {
    const db = await getDB();
    if (db) return idbRead(STORE_JOBS, 'get', jobId);
    return readLocalJobs().find((job) => job.id === jobId) || null;
  }

  async function deleteJob(jobId) {
    const db = await getDB();
    if (!db) {
      try {
        writeLocalJobs(readLocalJobs().filter((job) => job.id !== jobId));
        return true;
      } catch (e) {
        return false;
      }
    }
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction([STORE_JOBS, STORE_JOB_PAGES, STORE_JOB_INPUTS], 'readwrite');
      } catch (err) {
        resolve(false);
        return;
      }
      tx.objectStore(STORE_JOBS).delete(jobId);
      tx.objectStore(STORE_JOB_INPUTS).delete(jobId);
      const cursorReq = tx.objectStore(STORE_JOB_PAGES).index('jobId').openCursor(IDBKeyRange.only(jobId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  // Large inputs (source text or the picked file) are kept in one record per
  // job so frequent checkpoint writes never duplicate the document.
  async function saveJobInput(jobId, input) {
    const db = await getDB();
    if (!db) return false;
    await idbWrite(STORE_JOB_INPUTS, Object.assign({ jobId: jobId }, input));
    return true;
  }

  async function getJobInput(jobId) {
    const db = await getDB();
    if (!db) return null;
    return idbRead(STORE_JOB_INPUTS, 'get', jobId);
  }

  async function saveJobPage(jobId, page, text) {
    const db = await getDB();
    if (!db) return false;
    await idbWrite(STORE_JOB_PAGES, {
      key: jobId + ':' + page,
      jobId: jobId,
      page: page,
      text: text
    });
    return true;
  }

  async function getJobPages(jobId) {
    const db = await getDB();
    if (!db) return [];
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction([STORE_JOB_PAGES], 'readonly');
      } catch (err) {
        resolve([]);
        return;
      }
      const req = tx.objectStore(STORE_JOB_PAGES).index('jobId').getAll(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const pages = Array.isArray(req.result) ? req.result : [];
        resolve(pages.sort((a, b) => a.page - b.page));
      };
      req.onerror = () => resolve([]);
    });
  }

  // ==========================================================================
  // REVISION PROGRESS & SESSIONS
  // ==========================================================================
  function revisionRecordKey(moduleId, itemId) {
    return String(moduleId) + '|' + String(itemId);
  }

  function localProgressKey(moduleId) {
    return 'studysynth_revision_progress_' + String(moduleId);
  }

  function localSessionKey(moduleId) {
    return 'studysynth_revision_session_' + String(moduleId);
  }

  function readLocalProgress(moduleId) {
    try {
      const raw = JSON.parse(localStorage.getItem(localProgressKey(moduleId)) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  }

  async function saveRevisionProgress(record) {
    if (!record || !record.itemId || !record.moduleId) return false;
    const value = Object.assign({}, record, {
      key: revisionRecordKey(record.moduleId, record.itemId)
    });
    const db = await getDB();
    if (db) return idbWrite(STORE_REVISION_PROGRESS, value);
    try {
      const map = readLocalProgress(record.moduleId);
      map[record.itemId] = value;
      localStorage.setItem(localProgressKey(record.moduleId), JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function getRevisionProgress(moduleId) {
    const db = await getDB();
    if (db) {
      const rows = await new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction([STORE_REVISION_PROGRESS], 'readonly');
        } catch (err) {
          resolve([]);
          return;
        }
        const req = tx.objectStore(STORE_REVISION_PROGRESS).index('moduleId').getAll(IDBKeyRange.only(moduleId));
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      });
      const map = {};
      rows.forEach((row) => {
        if (row && row.itemId) map[row.itemId] = row;
      });
      return map;
    }
    return readLocalProgress(moduleId);
  }

  async function resetRevisionProgress(moduleId) {
    const db = await getDB();
    if (db) {
      await new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction([STORE_REVISION_PROGRESS], 'readwrite');
        } catch (err) {
          resolve(false);
          return;
        }
        const cursorReq = tx.objectStore(STORE_REVISION_PROGRESS).index('moduleId').openCursor(IDBKeyRange.only(moduleId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      });
      return true;
    }
    try {
      localStorage.removeItem(localProgressKey(moduleId));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function saveRevisionSession(session) {
    if (!session || !session.moduleId) return false;
    const db = await getDB();
    if (db) return idbWrite(STORE_REVISION_SESSIONS, session);
    try {
      localStorage.setItem(localSessionKey(session.moduleId), JSON.stringify(session));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function getRevisionSession(moduleId) {
    const db = await getDB();
    if (db) return idbRead(STORE_REVISION_SESSIONS, 'get', moduleId);
    try {
      const raw = localStorage.getItem(localSessionKey(moduleId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function deleteRevisionSession(moduleId) {
    const db = await getDB();
    if (db) {
      await new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction([STORE_REVISION_SESSIONS], 'readwrite');
        } catch (err) {
          resolve(false);
          return;
        }
        tx.objectStore(STORE_REVISION_SESSIONS).delete(moduleId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      });
      return true;
    }
    try {
      localStorage.removeItem(localSessionKey(moduleId));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Bookmark helpers
  function getBookmarks() {
    try {
      return JSON.parse(localStorage.getItem('studysynth_bookmarks') || '{}');
    } catch (e) {
      return {};
    }
  }

  function toggleBookmark(questionId, questionData) {
    const b = getBookmarks();
    if (b[questionId]) {
      delete b[questionId];
    } else {
      b[questionId] = {
        ...questionData,
        bookmarkedAt: new Date().toISOString()
      };
    }
    localStorage.setItem('studysynth_bookmarks', JSON.stringify(b));
    return !!b[questionId];
  }

  // ==========================================================================
  // CONTENT PACKAGES (independently versioned educational content)
  // ==========================================================================
  function contentMetaRecord(key, pack, extra) {
    return Object.assign({
      key: key,
      packId: pack.packId,
      version: pack.version,
      index: Array.isArray(pack.index) ? pack.index : [],
      moduleCount: pack.modules ? Object.keys(pack.modules).length : 0,
      activatedAt: new Date().toISOString()
    }, extra || {});
  }

  async function getContentPackState() {
    await loadContentState(true);
    return {
      active: contentState.active,
      previous: contentState.previous,
      supported: !!(await getDB())
    };
  }

  async function getContentModule(moduleId) {
    const state = await loadContentState();
    if (!state.active) return null;
    const record = await idbRead(STORE_CONTENT_MODULES, 'get', state.active.packId + '|' + moduleId);
    return record && record.body ? record.body : null;
  }

  function writePackModules(db, pack) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction([STORE_CONTENT_MODULES], 'readwrite');
      } catch (err) {
        reject(err);
        return;
      }
      const store = tx.objectStore(STORE_CONTENT_MODULES);
      const ids = Object.keys(pack.modules || {});
      ids.forEach((moduleId) => {
        store.put({
          key: pack.packId + '|' + moduleId,
          packId: pack.packId,
          moduleId: moduleId,
          body: pack.modules[moduleId]
        });
      });
      (pack.removedModuleIds || []).forEach((moduleId) => {
        store.delete(pack.packId + '|' + moduleId);
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Content write failed.'));
      tx.onabort = () => reject(tx.error || new Error('Content write aborted.'));
    });
  }

  /**
   * Writes a package into its own namespace, then swaps the active pointer.
   * A failure before the swap leaves the previous package active.
   */
  async function applyContentPack(pack) {
    if (!pack || !pack.packId) throw new Error('A content package needs a packId.');
    const db = await getDB();
    if (!db) throw new Error('Content updates require IndexedDB, which is unavailable here.');

    await writePackModules(db, pack);

    const state = await loadContentState(true);
    const nextActive = contentMetaRecord('active', pack);
    const nextPrevious = state.active
      ? Object.assign({}, state.active, { key: 'previous' })
      : null;

    await new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction([STORE_CONTENT_META], 'readwrite');
      } catch (err) {
        reject(err);
        return;
      }
      const store = tx.objectStore(STORE_CONTENT_META);
      store.put(nextActive);
      if (nextPrevious) store.put(nextPrevious);
      else store.delete('previous');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Content activation failed.'));
      tx.onabort = () => reject(tx.error || new Error('Content activation aborted.'));
    });

    // Drop anything older than the retained previous pack.
    try {
      const keep = new Set([nextActive.packId]);
      if (nextPrevious) keep.add(nextPrevious.packId);
      const rows = await idbRead(STORE_CONTENT_MODULES, 'getAll');
      if (Array.isArray(rows)) {
        const stale = rows.filter((row) => row && row.packId && !keep.has(row.packId));
        if (stale.length) {
          await new Promise((resolve) => {
            let tx;
            try {
              tx = db.transaction([STORE_CONTENT_MODULES], 'readwrite');
            } catch (err) {
              resolve(false);
              return;
            }
            const store = tx.objectStore(STORE_CONTENT_MODULES);
            stale.forEach((row) => store.delete(row.key));
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          });
        }
      }
    } catch (err) { /* cleanup is best effort */ }

    ctetIndexCache = null;
    bundledBodyCache = new Map();
    await loadContentState(true);
    return { active: contentState.active, previous: contentState.previous };
  }

  /** Swaps back to the retained previous package. */
  async function rollbackContentPack() {
    const db = await getDB();
    if (!db) throw new Error('Content rollback requires IndexedDB.');
    const state = await loadContentState(true);
    if (!state.previous) throw new Error('There is no previous content package to restore.');
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONTENT_META], 'readwrite');
      const store = tx.objectStore(STORE_CONTENT_META);
      const restored = Object.assign({}, state.previous, { key: 'active' });
      store.put(restored);
      store.delete('previous');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Content rollback failed.'));
      tx.onabort = () => reject(tx.error || new Error('Content rollback aborted.'));
    });
    ctetIndexCache = null;
    bundledBodyCache = new Map();
    await loadContentState(true);
    return { active: contentState.active, previous: contentState.previous };
  }

  async function clearContentPacks() {
    const db = await getDB();
    if (!db) return false;
    await new Promise((resolve) => {
      const tx = db.transaction([STORE_CONTENT_META, STORE_CONTENT_MODULES], 'readwrite');
      tx.objectStore(STORE_CONTENT_META).clear();
      tx.objectStore(STORE_CONTENT_MODULES).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
    ctetIndexCache = null;
    bundledBodyCache = new Map();
    contentState = { loaded: false, active: null, previous: null };
    return true;
  }

  const OfflineStorage = {
    saveModule,
    getModules,
    getModule,
    deleteModule,
    saveAttempt,
    getAttempts,
    getBookmarks,
    toggleBookmark,
    saveJob,
    getJob,
    getJobs,
    deleteJob,
    saveJobInput,
    getJobInput,
    saveJobPage,
    getJobPages,
    revisionRecordKey,
    saveRevisionProgress,
    getRevisionProgress,
    resetRevisionProgress,
    saveRevisionSession,
    getRevisionSession,
    deleteRevisionSession,
    getContentPackState,
    getContentModule,
    applyContentPack,
    rollbackContentPack,
    clearContentPacks
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineStorage;
  }
  if (typeof window !== 'undefined') {
    window.OfflineStorage = OfflineStorage;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
