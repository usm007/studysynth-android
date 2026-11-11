/**
 * Persistent state and preferences for the update system.
 *
 * Everything here is small metadata; content and bundles live elsewhere
 * (IndexedDB overlay and the live-update plugin's storage).
 */
(function (global) {
  'use strict';

  var KEY = 'studysynth_updates_state';
  var DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;

  function defaults() {
    return {
      lastCheckAt: 0,
      lastCheckOk: false,
      lastError: '',
      lastManifestAt: '',
      available: null,
      settings: {
        auto: true,
        wifiOnly: true,
        intervalMs: DEFAULT_INTERVAL_MS
      },
      installedWebBundleId: '',
      lastNotifiedVersion: ''
    };
  }

  function read() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return defaults();
      var parsed = JSON.parse(raw);
      var base = defaults();
      if (parsed && typeof parsed === 'object') {
        base.lastCheckAt = Number(parsed.lastCheckAt) || 0;
        base.lastCheckOk = !!parsed.lastCheckOk;
        base.lastError = typeof parsed.lastError === 'string' ? parsed.lastError : '';
        base.lastManifestAt = typeof parsed.lastManifestAt === 'string' ? parsed.lastManifestAt : '';
        base.available = parsed.available || null;
        base.installedWebBundleId = typeof parsed.installedWebBundleId === 'string' ? parsed.installedWebBundleId : '';
        base.lastNotifiedVersion = typeof parsed.lastNotifiedVersion === 'string' ? parsed.lastNotifiedVersion : '';
        if (parsed.settings && typeof parsed.settings === 'object') {
          base.settings.auto = parsed.settings.auto !== false;
          base.settings.wifiOnly = parsed.settings.wifiOnly !== false;
          if (Number(parsed.settings.intervalMs) >= 60 * 1000) {
            base.settings.intervalMs = Number(parsed.settings.intervalMs);
          }
        }
      }
      return base;
    } catch (err) {
      return defaults();
    }
  }

  function write(state) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function patch(changes) {
    var state = read();
    Object.keys(changes || {}).forEach(function (key) {
      if (key === 'settings' && changes.settings && typeof changes.settings === 'object') {
        state.settings = Object.assign({}, state.settings, changes.settings);
      } else {
        state[key] = changes[key];
      }
    });
    write(state);
    return state;
  }

  function isDue(state, now) {
    var s = state || read();
    if (!s.settings.auto) return false;
    if (!s.lastCheckAt) return true;
    return (now || Date.now()) - s.lastCheckAt >= s.settings.intervalMs;
  }

  var api = {
    KEY: KEY,
    DEFAULT_INTERVAL_MS: DEFAULT_INTERVAL_MS,
    read: read,
    write: write,
    patch: patch,
    isDue: isDue
  };

  global.UpdateStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
