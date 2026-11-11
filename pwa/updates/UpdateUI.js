/**
 * Update Centre UI.
 *
 * A single sheet that reports what the app is running, what is available, and
 * lets the learner trigger a check or an install. It never claims an install
 * finished: Android's own installer owns that step.
 *
 * All network and policy work lives in UpdateCoordinator; this file only
 * renders state and forwards intents.
 */
(function (global) {
  'use strict';

  var dom = null;
  var mounted = false;
  var unsubscribe = null;
  var onContentApplied = null;

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatWhen(timestamp) {
    if (!timestamp) return 'Never';
    var date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Never';
    var diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) {
      var mins = Math.round(diff / 60000);
      return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    }
    if (diff < 24 * 60 * 60 * 1000) {
      var hours = Math.round(diff / 3600000);
      return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(0) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function statusLine(status) {
    if (!status) return 'Update status is unavailable.';
    if (status.lastError) return status.lastError;
    if (status.lastCheckOk) {
      return 'Last checked ' + formatWhen(status.lastCheckAt).toLowerCase() + '.';
    }
    if (!status.lastCheckAt) return 'StudySynth has not checked for updates on this device yet.';
    return 'The last check did not complete.';
  }

  function buildRow(label, value) {
    return '<div class="update-row"><span class="update-row-label">' + escapeHtml(label) +
      '</span><span class="update-row-value">' + escapeHtml(value) + '</span></div>';
  }

  function render(status) {
    if (!dom) return;
    var installed = status.installed || {};
    var settings = status.settings || {};
    var available = status.available || null;
    var apkState = status.apkState || {};
    var apkReady = !!(status.apkUpdate && apkState.status === 'downloaded');

    // An update is only actionable where the platform can install it: the APK
    // needs the Android plugin and the interface bundle needs the live-update
    // plugin. A browser install shows an explanation instead of a dead button.
    var canApk = !!(available && available.apk && status.apkUpdate);
    var canWeb = !!(available && available.web && status.liveUpdate);
    var canContent = !!(available && available.content);
    var apkElsewhere = !!(available && available.apk && !status.apkUpdate);
    var webElsewhere = !!(available && available.web && !status.liveUpdate);

    var parts = [];

    parts.push('<section class="update-section" aria-labelledby="updateCurrentTitle">');
    parts.push('<h3 class="update-section-title" id="updateCurrentTitle">Installed</h3>');
    parts.push(buildRow('App version', (installed.versionName || 'Unknown') + (installed.versionCode ? ' (' + installed.versionCode + ')' : '')));
    var contentLabel = installed.contentVersion || 'Bundled';
    if (installed.contentVersion && installed.contentSource === 'bundled') contentLabel += ' (bundled)';
    parts.push(buildRow('Content', contentLabel));
    if (installed.webBundleId) parts.push(buildRow('Web bundle', installed.webBundleId));
    parts.push(buildRow('Platform', status.native ? 'Android app' : 'Browser'));
    if (installed.contentPreviousVersion) {
      parts.push('<div class="update-card"><p class="update-card-title">Previous question bank ' + escapeHtml(installed.contentPreviousVersion) + '</p>' +
        '<p class="update-card-text">Restore it if the latest set caused a problem. Bookmarks, attempts and revision history are untouched.</p>' +
        '<button type="button" class="btn btn-ghost" data-update-action="content-rollback">Restore previous question bank</button>' +
        '</div>');
    }
    parts.push('</section>');

    parts.push('<section class="update-section" aria-labelledby="updateAvailableTitle">');
    parts.push('<h3 class="update-section-title" id="updateAvailableTitle">Available</h3>');
    if (available || apkReady) {
      if (canApk) {
        parts.push('<div class="update-card"><p class="update-card-title">App update ' + escapeHtml(available.versionName || '') + '</p>' +
          '<p class="update-card-text">Downloads the signed installer. Android will ask you to confirm the install.</p>' +
          '<button type="button" class="btn btn-primary" data-update-action="apk">Download app update</button>' +
          '<div class="update-progress" data-update-progress="apk" hidden><div class="update-progress-bar"></div><span class="update-progress-text"></span></div>' +
          '<button type="button" class="btn btn-ghost" data-update-action="install"' + (apkReady ? '' : ' hidden') + '>Install downloaded update</button>' +
          '</div>');
      } else if (apkReady) {
        parts.push('<div class="update-card"><p class="update-card-title">App update ready</p>' +
          '<p class="update-card-text">The signed installer is downloaded. Android will ask you to confirm the install.</p>' +
          '<button type="button" class="btn btn-primary" data-update-action="install">Install downloaded update</button>' +
          '</div>');
      }
      if (canWeb) {
        parts.push('<div class="update-card"><p class="update-card-title">Interface update</p>' +
          '<p class="update-card-text">Applies the signed interface bundle and restarts StudySynth. Your saved work is not affected.</p>' +
          '<button type="button" class="btn btn-primary" data-update-action="web">Apply and restart</button>' +
          '<div class="update-progress" data-update-progress="web" hidden><div class="update-progress-bar"></div><span class="update-progress-text"></span></div>' +
          '</div>');
      }
      if (canContent) {
        parts.push('<div class="update-card"><p class="update-card-title">Question bank update</p>' +
          '<p class="update-card-text">Adds or refreshes verified questions. Bookmarks, attempts and revision history stay intact.</p>' +
          '<button type="button" class="btn btn-primary" data-update-action="content">Update question bank</button>' +
          '<div class="update-progress" data-update-progress="content" hidden><div class="update-progress-bar"></div><span class="update-progress-text"></span></div>' +
          '</div>');
      }
      if (apkElsewhere) {
        parts.push('<div class="update-note">A newer app version is available. Open StudySynth on Android to install it.</div>');
      }
      if (webElsewhere) {
        parts.push('<div class="update-note">Interface updates install from the Android app; a browser copy updates itself.</div>');
      }
      if (available && available.blocked && available.blocked.length) {
        parts.push('<div class="update-note">' + escapeHtml(available.blocked[0]) + '</div>');
      }
      if (!canApk && !canWeb && !canContent && !apkReady) {
        parts.push('<p class="update-empty">You are on the latest available version.</p>');
      }
    } else {
      parts.push('<p class="update-empty">No update information yet. Check for updates to see what is available.</p>');
    }
    parts.push('</section>');

    parts.push('<section class="update-section" aria-labelledby="updateSettingsTitle">');
    parts.push('<h3 class="update-section-title" id="updateSettingsTitle">Automatic updates</h3>');
    parts.push('<label class="update-toggle"><input type="checkbox" data-update-setting="auto"' + (settings.auto ? ' checked' : '') + '>' +
      '<span>Check automatically in the background</span></label>');
    parts.push('<label class="update-toggle"><input type="checkbox" data-update-setting="wifiOnly"' + (settings.wifiOnly ? ' checked' : '') + '>' +
      '<span>Only download on Wi-Fi</span></label>');
    parts.push('<p class="update-note">Automatic updates pause while a timed exam is running.</p>');
    parts.push('</section>');

    parts.push('<section class="update-section">');
    parts.push('<p class="update-status" data-update-status role="status">' + escapeHtml(statusLine(status)) + '</p>');
    parts.push('<button type="button" class="btn btn-secondary" data-update-action="check">Check for updates</button>');
    parts.push('</section>');

    dom.body.innerHTML = parts.join('');
    dom.body.setAttribute('aria-busy', 'false');
    wire();
  }

  function wire() {
    dom.body.querySelectorAll('[data-update-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        handleAction(button.getAttribute('data-update-action'));
      });
    });
    dom.body.querySelectorAll('[data-update-setting]').forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-update-setting');
        var patch = {};
        patch[key] = !!input.checked;
        global.UpdateCoordinator.setSettings(patch);
      });
    });
  }

  function setBusy(message) {
    if (!dom) return;
    dom.body.setAttribute('aria-busy', 'true');
    var status = dom.body.querySelector('[data-update-status]');
    if (status) status.textContent = message;
    dom.body.querySelectorAll('button[data-update-action]').forEach(function (button) {
      button.disabled = true;
    });
  }

  function clearBusy() {
    if (!dom) return;
    dom.body.removeAttribute('aria-busy');
    dom.body.querySelectorAll('button[data-update-action]').forEach(function (button) {
      button.disabled = false;
    });
  }

  function showProgress(kind, percent, text) {
    if (!dom) return;
    var wrap = dom.body.querySelector('[data-update-progress="' + kind + '"]');
    if (!wrap) return;
    wrap.hidden = false;
    var bar = wrap.querySelector('.update-progress-bar');
    var label = wrap.querySelector('.update-progress-text');
    if (bar) {
      bar.style.width = (percent == null ? 0 : Math.max(0, Math.min(100, percent))) + '%';
    }
    if (label) label.textContent = text || '';
  }

  function hideProgress(kind) {
    if (!dom) return;
    var wrap = dom.body.querySelector('[data-update-progress="' + kind + '"]');
    if (wrap) wrap.hidden = true;
  }

  async function handleAction(action) {
    var coordinator = global.UpdateCoordinator;
    if (!coordinator) return;
    try {
      if (action === 'check') {
        setBusy('Checking for updates…');
        var result = await coordinator.checkNow({ manual: true });
        clearBusy();
        if (!result.ok) throw new Error(result.error || 'The check did not complete.');
        await refreshView();
        return;
      }
      if (action === 'content') {
        setBusy('Downloading the question bank update…');
        await coordinator.applyContent();
        clearBusy();
        await refreshView();
        if (typeof onContentApplied === 'function') {
          try { await onContentApplied(); } catch (err) { /* the app re-renders on its own next navigation */ }
        }
        return;
      }
      if (action === 'content-rollback') {
        setBusy('Restoring the previous question bank…');
        await coordinator.rollbackContent();
        clearBusy();
        await refreshView();
        if (typeof onContentApplied === 'function') {
          try { await onContentApplied(); } catch (err) { /* ignore */ }
        }
        return;
      }
      if (action === 'web') {
        setBusy('Preparing the interface update…');
        await coordinator.stageWeb();
        await coordinator.restartIntoWebBundle();
        return;
      }
      if (action === 'apk') {
        setBusy('Downloading the signed installer…');
        var downloaded = await coordinator.downloadApk();
        clearBusy();
        await refreshView();
        if (downloaded && downloaded.permission && !downloaded.permission.allowed) {
          var installStatus = dom.body.querySelector('[data-update-status]');
          if (installStatus) {
            installStatus.textContent = 'Downloaded. Android needs permission to install: allow “Install unknown apps” for StudySynth, then tap Install.';
          }
          await global.ApkUpdateService.openInstallPermissionSettings();
        }
        return;
      }
      if (action === 'install') {
        setBusy('Opening the Android installer…');
        await coordinator.installApk();
        clearBusy();
        return;
      }
    } catch (err) {
      clearBusy();
      var message = String(err && err.message || err);
      var line = dom.body.querySelector('[data-update-status]');
      if (line) line.textContent = message;
      if (err && err.code === 'INSTALL_PERMISSION') {
        await global.ApkUpdateService.openInstallPermissionSettings();
      }
    }
  }

  async function refreshView() {
    if (!dom) return;
    dom.body.setAttribute('aria-busy', 'true');
    try {
      var status = await global.UpdateCoordinator.getStatus();
      render(status);
    } catch (err) {
      dom.body.innerHTML = '<p class="update-note">Update status could not be read on this device.</p>';
    }
  }

  function onCoordinatorEvent(event) {
    if (!mounted || !dom) return;
    if (!dom.sheet.classList.contains('open')) {
      if (event.type === 'content-applied' && typeof onContentApplied === 'function') {
        try { onContentApplied(); } catch (err) { /* ignore */ }
      }
      return;
    }
    if (event.type === 'content-progress' || event.type === 'web-progress' || event.type === 'apk-progress') {
      var detail = event.detail || {};
      var percent = detail.percent;
      if (percent == null && detail.total) percent = Math.round((detail.received / detail.total) * 100);
      var kind = event.type === 'content-progress' ? 'content' : event.type === 'web-progress' ? 'web' : 'apk';
      showProgress(kind, percent, percent == null ? 'Downloading…' : percent + '%');
      return;
    }
    if (event.type === 'content-applied') {
      hideProgress('content');
      refreshView();
      if (typeof onContentApplied === 'function') {
        try { onContentApplied(); } catch (err) { /* ignore */ }
      }
      return;
    }
    if (event.type === 'web-staged' || event.type === 'apk-downloaded' || event.type === 'check-ok' || event.type === 'apply-failed' || event.type === 'content-rolled-back') {
      refreshView();
    }
  }

  function open() {
    if (!dom) return;
    dom.sheet.classList.add('open');
    dom.sheet.removeAttribute('aria-hidden');
    document.body.classList.add('update-open');
    dom.body.setAttribute('aria-busy', 'true');
    refreshView();
    try { dom.sheet.focus(); } catch (err) { /* ignore */ }
  }

  function close() {
    if (!dom) return;
    dom.sheet.classList.remove('open');
    dom.sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('update-open');
  }

  function isOpen() {
    return !!(dom && dom.sheet.classList.contains('open'));
  }

  function mount(options) {
    if (mounted) return;
    var opts = options || {};
    if (typeof opts.onContentApplied === 'function') onContentApplied = opts.onContentApplied;
    dom = {
      sheet: el('updateSheet'),
      body: el('updateSheetBody'),
      closeBtn: el('updateSheetClose'),
      backdrop: el('updateSheetBackdrop')
    };
    if (!dom.sheet || !dom.body) return;
    mounted = true;

    if (dom.closeBtn) dom.closeBtn.addEventListener('click', close);
    if (dom.backdrop) dom.backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) {
        event.preventDefault();
        close();
      }
    });
    if (global.UpdateCoordinator) unsubscribe = global.UpdateCoordinator.onEvent(onCoordinatorEvent);
    refreshView();
  }

  function destroy() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    mounted = false;
    dom = null;
  }

  var api = {
    mount: mount,
    destroy: destroy,
    open: open,
    close: close,
    isOpen: isOpen,
    refresh: refreshView
  };

  global.UpdateUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
