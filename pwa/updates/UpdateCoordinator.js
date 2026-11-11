/**
 * Update coordinator.
 *
 * Owns every decision about *when* an update may be fetched or activated.
 * The individual services (LiveUpdateService, ApkUpdateService,
 * ContentUpdateService) only know *how*. Keeping the policy here is what
 * guarantees an active mock test is never interrupted.
 *
 * Policy:
 *   - Check on launch (if due) and every 12 h while the app is open.
 *   - Never download or activate while the learner is in a timed exam.
 *   - Content packages may activate automatically: they are small, verified,
 *     atomic and reversible, and they never touch bookmarks or attempts.
 *   - Web bundles are downloaded and staged automatically, then activated
 *     only on an explicit restart (or the next cold start).
 *   - APK updates are never installed silently: Android always shows the
 *     system installer, and the learner must ask for the download.
 */
(function (global) {
  'use strict';

  var DEFAULT_MANIFEST_URL = 'https://usm007.github.io/studysynth-android/updates/stable/manifest.json';
  var FETCH_TIMEOUT_MS = 20000;
  var APK_STATE_POLL_MS = 400;

  function friendlyFetchError(message) {
    var text = String(message || '').trim();
    if (!text) return 'The update check did not complete.';
    if (/failed to fetch|networkerror|load failed|network request failed|net::|err_/i.test(text)) {
      return 'Could not reach the update server. Check your internet connection and try again.';
    }
    return text;
  }

  var runtime = {
    manifestUrl: DEFAULT_MANIFEST_URL,
    isBusy: null,
    onEvent: null,
    autoTimer: null,
    checking: false,
    busy: false,
    lastStatus: null,
    listeners: []
  };

  function emit(type, detail) {
    var event = { type: type, at: Date.now(), detail: detail || null };
    runtime.lastStatus = event;
    runtime.listeners.forEach(function (listener) {
      try { listener(event); } catch (err) { /* a broken UI listener must not stop an update */ }
    });
    if (typeof runtime.onEvent === 'function') {
      try { runtime.onEvent(event); } catch (err) { /* ignore */ }
    }
  }

  function onEvent(listener) {
    if (typeof listener !== 'function') return function () {};
    runtime.listeners.push(listener);
    return function () {
      runtime.listeners = runtime.listeners.filter(function (item) { return item !== listener; });
    };
  }

  function cryptoApi() {
    return global.UpdateCrypto || null;
  }

  function isNative() {
    try {
      return !!(global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform());
    } catch (err) {
      return false;
    }
  }

  /**
   * True when the learner is inside a timed exam or an exam is about to start.
   * The host app supplies this. Until it does, the answer is "busy": failing
   * closed is the only way to guarantee an exam is never interrupted.
   */
  function isBusy() {
    if (typeof runtime.isBusy === 'function') {
      try { return !!runtime.isBusy(); } catch (err) { return true; }
    }
    return true;
  }

  function networkAllowsDownload(settings) {
    if (!settings || !settings.wifiOnly) return true;
    var connection = global.navigator && global.navigator.connection;
    if (!connection) return true; // unknown network: do not block the learner
    if (connection.saveData) return false;
    var type = connection.type;
    if (typeof type === 'string' && type && type !== 'unknown') {
      return type === 'wifi' || type === 'ethernet';
    }
    return true;
  }

  async function getInstalledState() {
    var version = global.STUDYSYNTH_VERSION || {};
    var stored = global.UpdateStorage ? global.UpdateStorage.read() : { installedWebBundleId: '' };
    // A fresh install ships the dataset described by version.json, so it is
    // already at that content version even before any pack is activated.
    var contentVersion = version.contentVersion || '';
    var contentSource = contentVersion ? 'bundled' : '';
    var contentPreviousVersion = '';
    if (global.ContentUpdateService && global.ContentUpdateService.getState) {
      try {
        var content = await global.ContentUpdateService.getState();
        if (content && content.active && content.active.version) {
          contentVersion = content.active.version;
          contentSource = 'pack';
        }
        if (content && content.previous && content.previous.version) {
          contentPreviousVersion = content.previous.version;
        }
      } catch (err) {
        /* fall back to the bundled version */
      }
    }
    var webBundleId = stored.installedWebBundleId || '';
    if (global.LiveUpdateService && global.LiveUpdateService.isAvailable()) {
      var live = await global.LiveUpdateService.getCurrentBundleId();
      if (live) webBundleId = live;
    }
    return {
      packageId: version.packageId || '',
      versionName: version.versionName || '',
      versionCode: Number(version.versionCode) || 0,
      runtimeVersion: version.runtimeVersion || '',
      contentVersion: contentVersion,
      contentSource: contentSource,
      contentPreviousVersion: contentPreviousVersion,
      webBundleId: webBundleId
    };
  }

  async function fetchManifest(url) {
    var controller = null;
    var timer = null;
    var options = { cache: 'no-store', credentials: 'omit' };
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      options.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    }
    try {
      var response = await fetch(url, options);
      if (!response.ok) throw new Error('Update server responded with HTTP ' + response.status + '.');
      var text = await response.text();
      if (text.length > 1024 * 1024) throw new Error('Update manifest is unexpectedly large.');
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error('Update manifest is not valid JSON.');
      }
      return parsed;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Fetches, validates and verifies the manifest, then decides what applies.
   * Returns { ok, manifest, plan, error, verified }.
   */
  async function refresh(options) {
    var opts = options || {};
    var stored = global.UpdateStorage ? global.UpdateStorage.read() : null;
    var url = opts.manifestUrl || runtime.manifestUrl;
    var installed = await getInstalledState();
    var context = {
      packageId: installed.packageId || undefined,
      channel: (global.STUDYSYNTH_VERSION && global.STUDYSYNTH_VERSION.channel) || undefined
    };

    var manifest;
    try {
      manifest = await fetchManifest(url);
    } catch (err) {
      var message = friendlyFetchError(err && err.message || err);
      if (stored) {
        global.UpdateStorage.patch({ lastCheckAt: Date.now(), lastCheckOk: false, lastError: message });
      }
      emit('check-failed', { error: message });
      return { ok: false, error: message, installed: installed };
    }

    var check = global.UpdateManifest.validate(manifest, context);
    if (!check.ok) {
      var invalid = 'Update manifest rejected: ' + check.errors.slice(0, 3).join('; ');
      if (stored) {
        global.UpdateStorage.patch({ lastCheckAt: Date.now(), lastCheckOk: false, lastError: invalid });
      }
      emit('check-failed', { error: invalid });
      return { ok: false, error: invalid, installed: installed };
    }

    var payload = Object.assign({}, manifest);
    var signature = payload.signature;
    delete payload.signature;
    var c = cryptoApi();
    var publicKey = global.STUDYSYNTH_UPDATE_PUBLIC_KEY;
    if (!c || !publicKey) {
      var unsupported = 'This build cannot verify update signatures.';
      if (stored) {
        global.UpdateStorage.patch({ lastCheckAt: Date.now(), lastCheckOk: false, lastError: unsupported });
      }
      emit('check-failed', { error: unsupported });
      return { ok: false, error: unsupported, installed: installed };
    }

    var verified = await c.verifySignature(publicKey, payload, signature);
    if (!verified) {
      var forged = 'Update manifest signature is invalid. Nothing will be installed.';
      if (stored) {
        global.UpdateStorage.patch({ lastCheckAt: Date.now(), lastCheckOk: false, lastError: forged });
      }
      emit('check-failed', { error: forged });
      return { ok: false, error: forged, installed: installed };
    }

    var plan = global.UpdateManifest.selectUpdates(manifest, installed);
    var summary = {
      versionName: plan.release ? plan.release.versionName : '',
      versionCode: plan.release ? plan.release.versionCode : 0,
      apk: !!plan.apk,
      web: !!plan.web,
      content: !!plan.content,
      blocked: plan.blocked,
      checkedAt: Date.now()
    };
    if (stored) {
      global.UpdateStorage.patch({
        lastCheckAt: Date.now(),
        lastCheckOk: true,
        lastError: '',
        lastManifestAt: manifest.generatedAt || '',
        available: summary
      });
    }
    emit('check-ok', { plan: plan, summary: summary, installed: installed });
    return { ok: true, manifest: manifest, plan: plan, installed: installed, summary: summary };
  }

  /**
   * Runs a scheduled or manual check, then applies whatever policy allows.
   * @param {{manual?: boolean, manifestUrl?: string, silent?: boolean}} [options]
   */
  async function checkNow(options) {
    var opts = options || {};
    if (runtime.checking) return { ok: false, error: 'An update check is already running.' };
    if (!opts.manual && isBusy()) {
      return { ok: false, error: 'Skipped while a timed exam is in progress.', skipped: true };
    }
    runtime.checking = true;
    emit('check-started', { manual: !!opts.manual });
    try {
      var result = await refresh(opts);
      if (!result.ok) return result;

      var settings = (global.UpdateStorage ? global.UpdateStorage.read().settings : { auto: true, wifiOnly: true });
      var held = (global.UpdateStorage ? global.UpdateStorage.read().contentHoldVersion : '') || '';
      var plan = result.plan;
      var applied = { content: false, web: false, apk: false };

      if (plan.content && settings.auto !== false && plan.content.version !== held) {
        if (isBusy()) {
          emit('deferred', { reason: 'exam', target: 'content' });
        } else if (!networkAllowsDownload(settings)) {
          emit('deferred', { reason: 'network', target: 'content' });
        } else {
          try {
            await applyContentPlan(plan, { silent: opts.silent });
            applied.content = true;
          } catch (err) {
            emit('apply-failed', { target: 'content', error: String(err && err.message || err) });
          }
        }
      }

      if (plan.web && settings.auto !== false && global.LiveUpdateService && global.LiveUpdateService.isAvailable()) {
        if (isBusy()) {
          emit('deferred', { reason: 'exam', target: 'web' });
        } else if (!networkAllowsDownload(settings)) {
          emit('deferred', { reason: 'network', target: 'web' });
        } else {
          try {
            await stageWebPlan(plan, { silent: opts.silent });
            applied.web = true;
          } catch (err) {
            emit('apply-failed', { target: 'web', error: String(err && err.message || err) });
          }
        }
      }

      return { ok: true, plan: plan, applied: applied, summary: result.summary };
    } finally {
      runtime.checking = false;
      emit('check-finished', null);
    }
  }

  function contentOptions(plan) {
    return {
      url: plan.content.url,
      sha256: plan.content.sha256,
      size: plan.content.size,
      signature: plan.content.signature,
      version: plan.content.version,
      onProgress: function (progress) { emit('content-progress', progress); }
    };
  }

  /**
   * Clears one "available" flag after it has been applied while keeping the
   * others, so a content update never erases a pending app or interface update.
   */
  function clearAvailable(target, extra) {
    if (!global.UpdateStorage) return;
    var state = global.UpdateStorage.read();
    var available = state.available;
    var patch = Object.assign({ lastError: '' }, extra || {});
    if (available && available[target]) {
      var next = Object.assign({}, available);
      next[target] = false;
      patch.available = next;
    }
    global.UpdateStorage.patch(patch);
  }

  async function applyContent(options) {
    var opts = options || {};
    var plan = opts.plan;
    if (!plan) {
      var current = await refresh({ silent: true });
      if (!current.ok) throw new Error(current.error);
      plan = current.plan;
    }
    return applyContentPlan(plan, opts);
  }

  async function applyContentPlan(plan, opts) {
    if (isBusy()) throw new Error('Content updates are paused while an exam is running.');
    if (!plan || !plan.content) return { applied: false, reason: 'No content update is available.' };

    emit('content-started', { version: plan.content.version });
    var result = await global.ContentUpdateService.download(contentOptions(plan));
    clearAvailable('content', { contentHoldVersion: '' });
    emit('content-applied', { version: result.version, packId: result.packId, silent: !!(opts && opts.silent) });
    return { applied: true, version: result.version, packId: result.packId };
  }

  /**
   * Restores the previous content package. The version that was rolled back
   * from is remembered so the automatic policy does not immediately reinstall
   * it; an explicit "Update question bank" clears that hold.
   */
  async function rollbackContent() {
    if (isBusy()) throw new Error('Finish or submit the current exam before changing the question bank.');
    if (!global.ContentUpdateService || typeof global.ContentUpdateService.rollback !== 'function') {
      throw new Error('Content rollback is not supported in this build.');
    }
    var before = await getInstalledState();
    var result = await global.ContentUpdateService.rollback();
    if (global.UpdateStorage) {
      global.UpdateStorage.patch({ contentHoldVersion: before.contentVersion || '' });
    }
    emit('content-rolled-back', { version: (result && result.active && result.active.version) || '' });
    return result;
  }

  async function stageWeb(options) {
    var opts = options || {};
    if (!global.LiveUpdateService || !global.LiveUpdateService.isAvailable()) {
      throw new Error('Web updates are only available in the installed Android app.');
    }
    var plan = opts.plan;
    if (!plan) {
      var current = await refresh({ silent: true });
      if (!current.ok) throw new Error(current.error);
      plan = current.plan;
    }
    return stageWebPlan(plan, opts);
  }

  async function stageWebPlan(plan, opts) {
    if (isBusy()) throw new Error('Web updates are paused while an exam is running.');
    if (!plan || !plan.web) return { staged: false, reason: 'No web update is available.' };

    emit('web-started', { bundleId: plan.web.bundleId });
    var unsubscribe = global.LiveUpdateService.onProgress(function (progress) {
      emit('web-progress', progress);
    });
    try {
      await global.LiveUpdateService.download({
        url: plan.web.url,
        bundleId: plan.web.bundleId,
        checksum: plan.web.sha256,
        signature: plan.web.signature
      });
    } finally {
      unsubscribe();
    }
    await global.LiveUpdateService.setNext(plan.web.bundleId);
    clearAvailable('web', { installedWebBundleId: plan.web.bundleId });
    emit('web-staged', { bundleId: plan.web.bundleId, silent: !!(opts && opts.silent) });
    return { staged: true, bundleId: plan.web.bundleId };
  }

  /** Activates a staged web bundle. Callers must confirm the learner agreed. */
  async function restartIntoWebBundle() {
    if (isBusy()) throw new Error('Finish or submit the current exam before restarting.');
    var bundleId = await global.LiveUpdateService.getNextBundleId();
    if (bundleId) await global.LiveUpdateService.setNext(bundleId);
    await global.LiveUpdateService.reload();
    return true;
  }

  async function downloadApk(options) {
    var opts = options || {};
    if (isBusy()) throw new Error('APK updates are paused while an exam is running.');
    if (!global.ApkUpdateService || !global.ApkUpdateService.isAvailable()) {
      throw new Error('APK updates are only available in the installed Android app.');
    }
    var plan = opts.plan;
    if (!plan) {
      var current = await refresh({ silent: true });
      if (!current.ok) throw new Error(current.error);
      plan = current.plan;
    }
    if (!plan.apk) return { started: false, reason: 'No APK update is available.' };

    var permission = await global.ApkUpdateService.getInstallPermissionStatus();
    emit('apk-started', { versionName: plan.apk.versionName, permission: permission });

    var unsubscribe = global.ApkUpdateService.onProgress(function (progress) {
      emit('apk-progress', progress);
    });
    try {
      await global.ApkUpdateService.download({
        url: plan.apk.url,
        sha256: plan.apk.sha256,
        size: plan.apk.size,
        versionCode: plan.apk.versionCode,
        certSha256: plan.apk.certSha256,
        packageId: (global.STUDYSYNTH_VERSION && global.STUDYSYNTH_VERSION.packageId) || ''
      });
    } catch (err) {
      unsubscribe();
      throw err;
    }
    unsubscribe();
    emit('apk-downloaded', { versionName: plan.apk.versionName, permission: permission });
    if (opts.installNow) {
      await installApk();
    }
    return { started: true, versionName: plan.apk.versionName, permission: permission };
  }

  async function installApk() {
    if (isBusy()) throw new Error('Finish or submit the current exam before installing.');
    if (!global.ApkUpdateService || !global.ApkUpdateService.isAvailable()) {
      throw new Error('APK updates are only available in the installed Android app.');
    }
    var state = await global.ApkUpdateService.getState();
    if (!state || state.status !== 'downloaded' || !state.versionCode) {
      throw new Error('No downloaded update is ready to install.');
    }
    var installedCode = Number(global.STUDYSYNTH_VERSION && global.STUDYSYNTH_VERSION.versionCode) || 0;
    if (installedCode && Number(state.versionCode) <= installedCode) {
      throw new Error('This update is already installed.');
    }
    var permission = await global.ApkUpdateService.getInstallPermissionStatus();
    if (!permission.allowed) {
      var error = new Error('Android needs permission to install this update. Allow "Install unknown apps" for StudySynth, then try again.');
      error.code = 'INSTALL_PERMISSION';
      throw error;
    }
    await global.ApkUpdateService.install();
    emit('apk-install-opened', null);
    return true;
  }

  async function getApkState() {
    if (!global.ApkUpdateService || !global.ApkUpdateService.isAvailable()) return { status: 'unavailable' };
    var state = await global.ApkUpdateService.getState();
    // A downloaded file for the version that is now running is left over from
    // the install that just happened; it is not a pending update.
    var installedCode = Number(global.STUDYSYNTH_VERSION && global.STUDYSYNTH_VERSION.versionCode) || 0;
    if (state && state.status === 'downloaded' && state.versionCode && installedCode
        && Number(state.versionCode) <= installedCode) {
      return { status: 'idle', versionCode: Number(state.versionCode), stale: true };
    }
    return state;
  }

  function setSettings(changes) {
    if (!global.UpdateStorage) return null;
    var next = global.UpdateStorage.patch({ settings: changes || {} });
    schedule();
    emit('settings-changed', next.settings);
    return next.settings;
  }

  function schedule() {
    if (runtime.autoTimer) {
      clearInterval(runtime.autoTimer);
      runtime.autoTimer = null;
    }
    if (!global.UpdateStorage) return;
    var state = global.UpdateStorage.read();
    if (!state.settings.auto) return;
    var interval = Math.max(60 * 1000, Number(state.settings.intervalMs) || global.UpdateStorage.DEFAULT_INTERVAL_MS);
    runtime.autoTimer = setInterval(function () {
      var latest = global.UpdateStorage.read();
      if (!global.UpdateStorage.isDue(latest)) return;
      if (isBusy()) return;
      checkNow({ manual: false }).catch(function () { /* already reported through events */ });
    }, Math.min(interval, 60 * 60 * 1000));
  }

  /**
   * Boot hook. Confirms a freshly activated bundle is healthy (the plugin rolls
   * back automatically if this never happens) and schedules periodic checks.
   */
  async function start(options) {
    var opts = options || {};
    if (opts.manifestUrl) runtime.manifestUrl = opts.manifestUrl;
    if (typeof opts.isBusy === 'function') runtime.isBusy = opts.isBusy;
    if (typeof opts.onEvent === 'function') runtime.onEvent = opts.onEvent;

    if (global.LiveUpdateService && global.LiveUpdateService.isAvailable()) {
      try { await global.LiveUpdateService.ready(); } catch (err) { /* plugin retries on next launch */ }
    }

    schedule();

    if (!global.UpdateStorage) return;
    var state = global.UpdateStorage.read();
    if (global.UpdateStorage.isDue(state) && !isBusy()) {
      // Let the first screen paint before touching the network.
      setTimeout(function () {
        checkNow({ manual: false }).catch(function () { /* reported via events */ });
      }, 4000);
    }
  }

  function stop() {
    if (runtime.autoTimer) {
      clearInterval(runtime.autoTimer);
      runtime.autoTimer = null;
    }
  }

  async function getStatus() {
    var stored = global.UpdateStorage ? global.UpdateStorage.read() : null;
    var installed = await getInstalledState();
    var apk = await getApkState();
    return {
      installed: installed,
      native: isNative(),
      liveUpdate: !!(global.LiveUpdateService && global.LiveUpdateService.isAvailable()),
      apkUpdate: !!(global.ApkUpdateService && global.ApkUpdateService.isAvailable()),
      lastCheckAt: stored ? stored.lastCheckAt : 0,
      lastCheckOk: stored ? stored.lastCheckOk : false,
      lastError: stored ? stored.lastError : '',
      lastManifestAt: stored ? stored.lastManifestAt : '',
      available: stored ? stored.available : null,
      settings: stored ? stored.settings : { auto: true, wifiOnly: true, intervalMs: 12 * 60 * 60 * 1000 },
      apkState: apk,
      lastEvent: runtime.lastStatus
    };
  }

  var api = {
    DEFAULT_MANIFEST_URL: DEFAULT_MANIFEST_URL,
    APK_STATE_POLL_MS: APK_STATE_POLL_MS,
    start: start,
    stop: stop,
    onEvent: onEvent,
    checkNow: checkNow,
    refresh: refresh,
    applyContent: applyContent,
    rollbackContent: rollbackContent,
    stageWeb: stageWeb,
    restartIntoWebBundle: restartIntoWebBundle,
    downloadApk: downloadApk,
    installApk: installApk,
    getApkState: getApkState,
    getInstalledState: getInstalledState,
    getStatus: getStatus,
    setSettings: setSettings,
    isBusy: isBusy
  };

  global.UpdateCoordinator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
