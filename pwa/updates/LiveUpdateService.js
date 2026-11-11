/**
 * OTA web-update service.
 *
 * Wraps @capawesome/capacitor-live-update (Capacitor 8 compatible). The plugin
 * downloads a ZIP, verifies its RSA signature natively against the public key
 * in capacitor.config.json, extracts it, and rolls back automatically if the
 * app does not call ready() within readyTimeout.
 *
 * This module never decides *when* to activate; UpdateCoordinator does, so an
 * active mock test can never be interrupted.
 */
(function (global) {
  'use strict';

  function plugin() {
    var cap = global.Capacitor;
    if (!cap) return null;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
    if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('LiveUpdate')) return null;
    return (cap.Plugins && cap.Plugins.LiveUpdate) || null;
  }

  function isAvailable() {
    return !!plugin();
  }

  var progressHandlers = [];
  var listenerAttached = false;

  function ensureProgressListener() {
    var p = plugin();
    if (!p || listenerAttached || typeof p.addListener !== 'function') return;
    listenerAttached = true;
    p.addListener('downloadBundleProgress', function (event) {
      progressHandlers.forEach(function (handler) {
        try { handler(event); } catch (err) { /* a broken listener must not stop the download */ }
      });
    });
  }

  function onProgress(handler) {
    if (typeof handler !== 'function') return function () {};
    progressHandlers.push(handler);
    ensureProgressListener();
    return function () {
      progressHandlers = progressHandlers.filter(function (item) { return item !== handler; });
    };
  }

  async function getCurrentBundleId() {
    var p = plugin();
    if (!p) return '';
    try {
      var result = await p.getCurrentBundle();
      return (result && result.bundleId) || '';
    } catch (err) {
      return '';
    }
  }

  async function getNextBundleId() {
    var p = plugin();
    if (!p) return '';
    try {
      var result = await p.getNextBundle();
      return (result && result.bundleId) || '';
    } catch (err) {
      return '';
    }
  }

  async function download(options) {
    var p = plugin();
    if (!p) throw new Error('OTA updates are only available in the installed Android app.');
    if (!options || !options.url || !options.bundleId) throw new Error('A bundle URL and id are required.');
    if (!options.signature) throw new Error('Refusing to download an unsigned bundle.');
    await p.downloadBundle({
      url: options.url,
      bundleId: options.bundleId,
      checksum: options.checksum,
      signature: options.signature
    });
    return { bundleId: options.bundleId };
  }

  async function setNext(bundleId) {
    var p = plugin();
    if (!p) throw new Error('OTA updates are only available in the installed Android app.');
    await p.setNextBundle({ bundleId: bundleId });
    return true;
  }

  async function reload() {
    var p = plugin();
    if (!p) return false;
    await p.reload();
    return true;
  }

  async function ready() {
    var p = plugin();
    if (!p) return false;
    try {
      await p.ready();
      return true;
    } catch (err) {
      return false;
    }
  }

  async function reset() {
    var p = plugin();
    if (!p) return false;
    await p.reset();
    return true;
  }

  async function deleteBundle(bundleId) {
    var p = plugin();
    if (!p || !bundleId) return false;
    try {
      await p.deleteBundle({ bundleId: bundleId });
      return true;
    } catch (err) {
      return false;
    }
  }

  var api = {
    isAvailable: isAvailable,
    onProgress: onProgress,
    getCurrentBundleId: getCurrentBundleId,
    getNextBundleId: getNextBundleId,
    download: download,
    setNext: setNext,
    reload: reload,
    ready: ready,
    reset: reset,
    deleteBundle: deleteBundle
  };

  global.LiveUpdateService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
