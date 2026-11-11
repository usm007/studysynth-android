/**
 * Educational content update service.
 *
 * A content package is a signed JSON document containing an index and one or
 * more module bodies (a full package or a delta). It is verified end to end
 * before anything is written, then activated atomically through the storage
 * overlay. Bookmarks, attempts and revision history are never touched.
 */
(function (global) {
  'use strict';

  var MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
  var cryptoApi = function () { return global.UpdateCrypto || null; };

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function validateModule(moduleId, module, errors) {
    if (!isObject(module)) {
      errors.push(moduleId + ': module body is not an object');
      return;
    }
    if (module.id !== moduleId) {
      errors.push(moduleId + ': module.id does not match its key');
    }
    if (!Array.isArray(module.questions) || !module.questions.length) {
      errors.push(moduleId + ': no questions');
      return;
    }
    var seen = Object.create(null);
    module.questions.forEach(function (question, index) {
      var label = moduleId + ' q' + (index + 1);
      if (!isObject(question)) {
        errors.push(label + ': not an object');
        return;
      }
      if (!isNonEmptyString(question.id)) errors.push(label + ': missing id');
      else if (seen[question.id]) errors.push(label + ': duplicate question id ' + question.id);
      else seen[question.id] = true;
      if (!Array.isArray(question.options) || question.options.length < 2) {
        errors.push(label + ': needs at least two options');
        return;
      }
      var keys = question.options.map(function (option) {
        return isObject(option) ? option.key : null;
      });
      if (keys.some(function (key) { return !isNonEmptyString(key); })) {
        errors.push(label + ': every option needs a key');
      }
      if (new Set(keys).size !== keys.length) errors.push(label + ': duplicate option keys');
      if (!isNonEmptyString(question.answer_key) || keys.indexOf(question.answer_key) === -1) {
        errors.push(label + ': answer_key does not match an option');
      }
      if (question.explanation !== undefined && typeof question.explanation !== 'string') {
        errors.push(label + ': explanation must be a string');
      }
    });
  }

  /**
   * Structural + semantic validation. Returns {ok, errors}.
   * @param {object} pkg parsed package
   * @param {{expectedVersion?: string}} [options]
   */
  function validatePackage(pkg, options) {
    var errors = [];
    var opts = options || {};
    if (!isObject(pkg)) return { ok: false, errors: ['package is not an object'] };
    if (pkg.schemaVersion !== 1) errors.push('unsupported schemaVersion: ' + pkg.schemaVersion);
    if (!isNonEmptyString(pkg.contentVersion)) errors.push('contentVersion is required');
    if (opts.expectedVersion && pkg.contentVersion !== opts.expectedVersion) {
      errors.push('contentVersion does not match the manifest (' + pkg.contentVersion + ' vs ' + opts.expectedVersion + ')');
    }
    if (pkg.mode !== undefined && pkg.mode !== 'full' && pkg.mode !== 'delta') {
      errors.push('mode must be "full" or "delta"');
    }
    if (!Array.isArray(pkg.index) || !pkg.index.length) errors.push('index is empty');
    if (!isObject(pkg.modules)) errors.push('modules is missing');

    if (Array.isArray(pkg.index)) {
      var indexIds = Object.create(null);
      pkg.index.forEach(function (entry, index) {
        if (!isObject(entry) || !isNonEmptyString(entry.id)) {
          errors.push('index[' + index + '] has no id');
          return;
        }
        if (indexIds[entry.id]) errors.push('index contains duplicate id ' + entry.id);
        indexIds[entry.id] = true;
      });
    }

    if (isObject(pkg.modules)) {
      Object.keys(pkg.modules).forEach(function (moduleId) {
        validateModule(moduleId, pkg.modules[moduleId], errors);
      });
    }

    if (pkg.removedModuleIds !== undefined) {
      if (!Array.isArray(pkg.removedModuleIds)) errors.push('removedModuleIds must be an array');
      else if (pkg.removedModuleIds.some(function (id) { return !isNonEmptyString(id); })) {
        errors.push('removedModuleIds contains an invalid id');
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  async function readWithProgress(response, expectedSize, onProgress) {
    var total = Number(response.headers.get('content-length')) || Number(expectedSize) || 0;
    if (!response.body || typeof response.body.getReader !== 'function') {
      var buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }
    var reader = response.body.getReader();
    var chunks = [];
    var received = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.length;
      if (typeof onProgress === 'function') {
        onProgress({ received: received, total: total, percent: total ? Math.round((received / total) * 100) : null });
      }
      if (received > MAX_PACKAGE_BYTES) {
        try { await reader.cancel(); } catch (err) { /* ignore */ }
        throw new Error('Content package is larger than the allowed limit.');
      }
    }
    var out = new Uint8Array(received);
    var offset = 0;
    chunks.forEach(function (chunk) {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }

  /**
   * Downloads, verifies, validates and activates a content package.
   * Throws on any failure; the active package is untouched in that case.
   */
  async function download(options) {
    var opts = options || {};
    var c = cryptoApi();
    if (!c) throw new Error('This device cannot verify update signatures.');
    var storage = global.OfflineStorage;
    if (!storage || !storage.applyContentPack) throw new Error('Content updates are not supported in this build.');
    if (!opts.url || !opts.sha256 || !opts.signature) throw new Error('Content metadata is incomplete.');

    var response = await fetch(opts.url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Content download failed (HTTP ' + response.status + ').');
    var bytes = await readWithProgress(response, opts.size, opts.onProgress);

    var digest = await c.sha256Hex(bytes);
    if (!digest || !c.timingSafeEqualHex(digest, opts.sha256)) {
      throw new Error('Content package checksum does not match the manifest.');
    }

    var publicKey = global.STUDYSYNTH_UPDATE_PUBLIC_KEY;
    var signatureOk = await c.verifyBytes(publicKey, bytes, opts.signature);
    if (!signatureOk) throw new Error('Content package signature is invalid.');

    var text;
    try {
      text = new TextDecoder('utf-8').decode(bytes);
    } catch (err) {
      throw new Error('Content package is not valid UTF-8.');
    }
    var pkg;
    try {
      pkg = JSON.parse(text);
    } catch (err) {
      throw new Error('Content package is not valid JSON.');
    }

    var check = validatePackage(pkg, { expectedVersion: opts.version });
    if (!check.ok) {
      var summary = check.errors.slice(0, 4).join('; ');
      throw new Error('Content package rejected: ' + summary);
    }

    var packId = 'content-' + pkg.contentVersion + '-' + digest.slice(0, 12);
    var result = await storage.applyContentPack({
      packId: packId,
      version: pkg.contentVersion,
      index: pkg.index,
      modules: pkg.modules,
      removedModuleIds: pkg.removedModuleIds || []
    });
    return { packId: packId, version: pkg.contentVersion, state: result };
  }

  async function getState() {
    var storage = global.OfflineStorage;
    if (!storage || !storage.getContentPackState) return { supported: false, active: null, previous: null };
    try {
      return await storage.getContentPackState();
    } catch (err) {
      return { supported: false, active: null, previous: null, error: String(err && err.message || err) };
    }
  }

  async function rollback() {
    var storage = global.OfflineStorage;
    if (!storage || !storage.rollbackContentPack) throw new Error('Content rollback is not supported in this build.');
    return storage.rollbackContentPack();
  }

  var api = {
    MAX_PACKAGE_BYTES: MAX_PACKAGE_BYTES,
    validatePackage: validatePackage,
    download: download,
    getState: getState,
    rollback: rollback
  };

  global.ContentUpdateService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
