/**
 * Update manifest schema validation and update selection.
 *
 * The manifest is the only thing the app trusts before downloading anything.
 * It is fetched from a static host (GitHub Pages), validated structurally, then
 * its signature is verified over the canonical JSON with the embedded key.
 *
 * Fails closed: an unexpected field type rejects the whole manifest.
 */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var MAX_SIZE_BYTES = 120 * 1024 * 1024;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isPositiveInt(value) {
    return Number.isInteger(value) && value > 0;
  }

  function isHttpsUrl(value) {
    if (!isNonEmptyString(value)) return false;
    try {
      var url = new URL(value);
      return url.protocol === 'https:';
    } catch (err) {
      return false;
    }
  }

  function isHex64(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
  }

  function isBase64Signature(value) {
    if (!isNonEmptyString(value)) return false;
    var compact = value.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false;
    if (compact.length % 4 !== 0) return false;
    // Structural floor only: 344 base64 characters is the smallest possible
    // RSA-2048 signature. The production RSA-3072 key produces 512; signature
    // verification, not this shape check, decides whether it is genuine.
    return compact.length >= 344;
  }

  function isIsoDate(value) {
    if (!isNonEmptyString(value)) return false;
    var time = Date.parse(value);
    return Number.isFinite(time);
  }

  function compareVersions(a, b) {
    var left = String(a || '0').split('.').map(function (part) { return parseInt(part, 10) || 0; });
    var right = String(b || '0').split('.').map(function (part) { return parseInt(part, 10) || 0; });
    var length = Math.max(left.length, right.length);
    for (var i = 0; i < length; i++) {
      var l = left[i] || 0;
      var r = right[i] || 0;
      if (l > r) return 1;
      if (l < r) return -1;
    }
    return 0;
  }

  function validate(manifest, context) {
    var errors = [];
    var ctx = context || {};

    if (!isObject(manifest)) {
      return { ok: false, errors: ['manifest is not an object'] };
    }
    if (manifest.schemaVersion !== SCHEMA_VERSION) {
      errors.push('unsupported schemaVersion: ' + manifest.schemaVersion);
    }
    if (ctx.packageId && manifest.packageId !== ctx.packageId) {
      errors.push('packageId mismatch: ' + manifest.packageId);
    }
    if (ctx.channel && manifest.channel !== ctx.channel) {
      errors.push('channel mismatch: ' + manifest.channel);
    }
    if (!isIsoDate(manifest.generatedAt)) errors.push('generatedAt is not an ISO date');
    if (!isBase64Signature(manifest.signature)) errors.push('manifest signature is malformed');

    var release = manifest.release;
    if (!isObject(release)) {
      errors.push('release block missing');
    } else {
      if (!/^\d+\.\d+\.\d+$/.test(String(release.versionName || ''))) errors.push('release.versionName is not semver');
      if (!isPositiveInt(release.versionCode)) errors.push('release.versionCode must be a positive integer');
      if (!isPositiveInt(release.minSupportedVersionCode)) errors.push('release.minSupportedVersionCode must be a positive integer');
      if (typeof release.mandatory !== 'boolean') errors.push('release.mandatory must be a boolean');
      if (release.releaseNotes !== undefined && typeof release.releaseNotes !== 'string') errors.push('release.releaseNotes must be a string');
    }

    var apk = manifest.apk;
    if (apk === undefined) {
      // APK-less manifests are valid: a release can ship only web/content.
    } else if (!isObject(apk)) {
      errors.push('apk block must be an object');
    } else {
      if (!isHttpsUrl(apk.url)) errors.push('apk.url must be https');
      if (!isHex64(apk.sha256)) errors.push('apk.sha256 must be 64 hex characters');
      if (!isPositiveInt(apk.size) || apk.size > MAX_SIZE_BYTES) errors.push('apk.size is out of range');
      if (!isHex64(String(apk.certSha256 || '').replace(/:/g, ''))) errors.push('apk.certSha256 must be a SHA-256 digest');
    }

    var web = manifest.web;
    if (web === undefined) {
      // optional
    } else if (!isObject(web)) {
      errors.push('web block must be an object');
    } else {
      if (!isNonEmptyString(web.bundleId)) errors.push('web.bundleId is required');
      if (!isNonEmptyString(web.runtimeVersion)) errors.push('web.runtimeVersion is required');
      if (!isHttpsUrl(web.url)) errors.push('web.url must be https');
      if (!isHex64(web.sha256)) errors.push('web.sha256 must be 64 hex characters');
      if (!isPositiveInt(web.size) || web.size > MAX_SIZE_BYTES) errors.push('web.size is out of range');
      if (!isBase64Signature(web.signature)) errors.push('web.signature is malformed');
      if (!isPositiveInt(web.minAppVersionCode)) errors.push('web.minAppVersionCode must be a positive integer');
    }

    var content = manifest.content;
    if (content === undefined) {
      // optional
    } else if (!isObject(content)) {
      errors.push('content block must be an object');
    } else {
      if (!isNonEmptyString(content.version)) errors.push('content.version is required');
      if (!isHttpsUrl(content.url)) errors.push('content.url must be https');
      if (!isHex64(content.sha256)) errors.push('content.sha256 must be 64 hex characters');
      if (!isPositiveInt(content.size) || content.size > MAX_SIZE_BYTES) errors.push('content.size is out of range');
      if (!isBase64Signature(content.signature)) errors.push('content.signature is malformed');
      if (!isPositiveInt(content.minAppVersionCode)) errors.push('content.minAppVersionCode must be a positive integer');
    }

    if (apk === undefined && web === undefined && content === undefined) {
      errors.push('manifest describes no artifacts (apk, web, content are all missing)');
    }

    if (isObject(release) && isPositiveInt(release.minSupportedVersionCode) && isPositiveInt(release.versionCode)) {
      if (release.minSupportedVersionCode > release.versionCode) {
        errors.push('minSupportedVersionCode cannot exceed versionCode');
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * Decides what, if anything, the installed app should take from this manifest.
   * Rejects downgrades and incompatible runtimes.
   */
  function selectUpdates(manifest, installed) {
    var state = installed || {};
    var installedCode = Number(state.versionCode) || 0;
    var result = {
      apk: null,
      web: null,
      content: null,
      blocked: [],
      release: manifest && manifest.release ? manifest.release : null
    };
    if (!manifest || !manifest.release) return result;

    var releaseCode = Number(manifest.release.versionCode) || 0;
    if (releaseCode < installedCode) {
      result.blocked.push('Manifest describes an older release than the installed app (downgrade rejected).');
      return result;
    }

    if (installedCode < Number(manifest.release.minSupportedVersionCode || 1)) {
      result.blocked.push('This release requires a newer APK before its web or content updates can be used.');
      return result;
    }

    if (manifest.apk && releaseCode > installedCode) {
      result.apk = {
        versionName: manifest.release.versionName,
        versionCode: releaseCode,
        mandatory: !!manifest.release.mandatory,
        url: manifest.apk.url,
        sha256: String(manifest.apk.sha256).toLowerCase(),
        size: manifest.apk.size,
        certSha256: String(manifest.apk.certSha256).replace(/:/g, '').toLowerCase(),
        releaseNotes: manifest.release.releaseNotes || ''
      };
    }

    var web = manifest.web;
    if (web) {
      if (state.runtimeVersion && web.runtimeVersion !== state.runtimeVersion) {
        result.blocked.push('Web bundle targets runtime "' + web.runtimeVersion + '" but this app runs "' + state.runtimeVersion + '".');
      } else if (Number(web.minAppVersionCode) > installedCode) {
        result.blocked.push('Web bundle needs app version code ' + web.minAppVersionCode + ' or newer.');
      } else if (state.webBundleId && web.bundleId === state.webBundleId) {
        // already installed
      } else {
        result.web = {
          bundleId: web.bundleId,
          runtimeVersion: web.runtimeVersion,
          url: web.url,
          sha256: String(web.sha256).toLowerCase(),
          size: web.size,
          signature: web.signature
        };
      }
    }

    var content = manifest.content;
    if (content) {
      if (Number(content.minAppVersionCode) > installedCode) {
        result.blocked.push('Content package needs app version code ' + content.minAppVersionCode + ' or newer.');
      } else if (state.contentVersion && compareVersions(content.version, state.contentVersion) <= 0) {
        // Already installed, or older than what this device already has.
      } else {
        result.content = {
          version: content.version,
          url: content.url,
          sha256: String(content.sha256).toLowerCase(),
          size: content.size,
          signature: content.signature
        };
      }
    }

    return result;
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    validate: validate,
    selectUpdates: selectUpdates,
    compareVersions: compareVersions,
    isHttpsUrl: isHttpsUrl,
    isHex64: isHex64
  };

  global.UpdateManifest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
