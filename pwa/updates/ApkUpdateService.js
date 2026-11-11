/**
 * APK update service.
 *
 * Talks to the local Capacitor plugin `ApkUpdate` (Java, part of this repo).
 * The native side owns the download, SHA-256 check, package-identity check and
 * the hand-off to the Android package installer. JavaScript never claims an
 * install succeeded: Android always shows the system confirmation unless the
 * app is a device owner / privileged installer.
 */
(function (global) {
  'use strict';

  function plugin() {
    var cap = global.Capacitor;
    if (!cap) return null;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
    if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('ApkUpdate')) return null;
    return (cap.Plugins && cap.Plugins.ApkUpdate) || null;
  }

  function isAvailable() {
    return !!plugin();
  }

  async function getInstallPermissionStatus() {
    var p = plugin();
    if (!p) return { allowed: false, supported: false };
    try {
      var result = await p.getInstallPermissionStatus();
      return { allowed: !!(result && result.allowed), supported: true };
    } catch (err) {
      return { allowed: false, supported: true, error: String(err && err.message || err) };
    }
  }

  async function openInstallPermissionSettings() {
    var p = plugin();
    if (!p) return false;
    try {
      await p.openInstallPermissionSettings();
      return true;
    } catch (err) {
      return false;
    }
  }

  var progressHandlers = [];
  var listenerAttached = false;

  function ensureListener() {
    var p = plugin();
    if (!p || listenerAttached || typeof p.addListener !== 'function') return;
    listenerAttached = true;
    p.addListener('downloadProgress', function (event) {
      progressHandlers.forEach(function (handler) {
        try { handler(event); } catch (err) { /* ignore */ }
      });
    });
  }

  function onProgress(handler) {
    if (typeof handler !== 'function') return function () {};
    progressHandlers.push(handler);
    ensureListener();
    return function () {
      progressHandlers = progressHandlers.filter(function (item) { return item !== handler; });
    };
  }

  async function getState() {
    var p = plugin();
    if (!p) return { status: 'unavailable' };
    try {
      return await p.getState();
    } catch (err) {
      return { status: 'error', error: String(err && err.message || err) };
    }
  }

  async function download(apk) {
    var p = plugin();
    if (!p) throw new Error('APK updates are only available in the installed Android app.');
    if (!apk || !apk.url || !apk.sha256) throw new Error('APK metadata is incomplete.');
    return p.download({
      url: apk.url,
      sha256: apk.sha256,
      size: apk.size,
      versionCode: apk.versionCode,
      certSha256: apk.certSha256,
      packageId: apk.packageId
    });
  }

  async function install() {
    var p = plugin();
    if (!p) throw new Error('APK updates are only available in the installed Android app.');
    return p.install();
  }

  async function cancel() {
    var p = plugin();
    if (!p) return false;
    try {
      await p.cancel();
      return true;
    } catch (err) {
      return false;
    }
  }

  var api = {
    isAvailable: isAvailable,
    getInstallPermissionStatus: getInstallPermissionStatus,
    openInstallPermissionSettings: openInstallPermissionSettings,
    onProgress: onProgress,
    getState: getState,
    download: download,
    install: install,
    cancel: cancel
  };

  global.ApkUpdateService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
