# StudySynth v2.1.0 — Redesign and Update System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship StudySynth v2.1.0 as a production Android release with a four-tab mobile-first interface, a signed OTA web-update channel, a verified APK updater, and independently versioned content packages — without changing the question engine or existing user data.

**Architecture:** The web app keeps its plain-script, no-bundler shape. The existing controller is preserved; a new shell replaces the desktop topbar/rail/livebar with an app bar, four screens and a bottom nav, and new modules under `pwa/updates/` implement manifest validation, RSA verification, staging and rollback. Android gains a local Capacitor plugin (`ApkUpdate`) that downloads, hashes, identity-checks and hands the APK to the system installer. Content packages are signed JSON packages imported into an additive IndexedDB overlay.

**Tech Stack:** Capacitor 8.5, @capawesome/capacitor-live-update 8.8, plain JS/CSS, IndexedDB, Node 22+ build scripts (no runtime deps), Android Java 21, Gradle 8.14, GitHub Actions.

**Spec:** This document plus `docs/IMPLEMENTATION_AUDIT.md`.

**Status:** Implemented. See `docs/COMPLETION_REPORT.md` for verification evidence and the limits of that verification.

## Global Constraints

- `applicationId` stays `com.usm007.studysynth`; signing identity stays the certificate with SHA-256 `62377a571b33c348a2ed61f08e538108b0b76338dcdaa7e029e0e3172a17a374`.
- `versionCode` 4, `versionName` 2.1.0 (published: 3 / 1.2).
- Every existing element ID bound by `initDOM()` must still exist in `index.html`.
- No new runtime dependencies in the web app; no framework; no bundler.
- IndexedDB changes are additive only; `StudySynthLiteDB` goes from v3 to v4.
- Never commit keystores, private keys or credentials.
- Reject any update whose checksum, signature, runtime or version fails validation.
- Never reload or interrupt an active, unsubmitted mock test.
- Update checks: 12 h minimum interval, manual override, Wi-Fi preferred for large downloads.
- All tests must be executed before being reported as passing.

## Review Focus

1. A device with no network at first launch must still reach the library and open a bundled set.
2. An APK downloaded over a flaky connection must never be installed partially or with a mismatched hash.
3. A learner mid-mock must not be interrupted by any update path, including service-worker activation.
4. Existing bookmarks, attempts and revision history must survive an APK update and a content update.
5. A malformed or hostile manifest/content package must be rejected without touching the active data set.

---

### Task 1: Single version source and build stamping

**Files:** create `version.json`, `scripts/version.js`; modify `scripts/build-web.js`, `pwa/index.html`, `android/app/build.gradle`, `package.json`.

**Interfaces:**
- Produces: `version.json` `{ versionName, versionCode, minSupportedVersionCode, runtimeVersion, contentVersion }`; `www/version.js` defining `window.STUDYSYNTH_VERSION`.
- Consumes: nothing.

- [x] Write `version.json` with `2.1.0` / `4`.
- [x] `scripts/version.js` reads and validates it; throws if `versionCode` is not a positive integer.
- [x] `build-web.js` copies `pwa/updates` and writes `www/version.js`.
- [x] Gradle reads `version.json` for `versionCode`/`versionName`.
- [x] Verify: `node scripts/build-web.js` prints the payload size and `www/version.js` contains 2.1.0.

### Task 2: Signing and canonical serialization (build-time)

**Files:** create `scripts/updates/canonical.js`, `scripts/updates/keys.js`, `scripts/updates/sign.js`, `scripts/updates/keygen.js`; modify `android/app/build.gradle`, create `android/keystore.properties.example`.

**Interfaces:**
- Produces: `canonicalize(value) -> string` (sorted keys, no whitespace), `signBytes(buffer) -> {signature, publicKey}`, `verifyBytes(publicKey, buffer, sig) -> boolean`.
- Consumes: `version.json`.

- [x] `canonicalize` is deterministic for nested objects/arrays.
- [x] `keygen.js` writes an RSA-3072 key pair outside the repo and prints the SPKI public key.
- [x] Gradle release signing reads `keystore.properties` or `ANDROID_KEYSTORE_*` env vars; release build fails loudly when absent.
- [x] Verify: canonical round-trip and stable ordering covered by `pwa/tests/test_updates.js`.

### Task 3: Update manifest schema and validator

**Files:** create `pwa/updates/UpdateManifest.js`, `pwa/updates/keys.js`, `pwa/tests/test_updates.js`.

**Interfaces:**
- Produces: `UpdateManifest.validate(manifest, context) -> {ok, errors[]}`, `UpdateManifest.compareVersions(a,b) -> -1|0|1`, `UpdateManifest.selectUpdates(manifest, installed) -> {apk, web, content}`.
- Consumes: `window.STUDYSYNTH_VERSION`, `window.STUDYSYNTH_UPDATE_PUBLIC_KEY`.

- [x] Validator enforces schemaVersion, packageId, channel, integer versionCodes, hex SHA-256, https URLs, and required fields.
- [x] `selectUpdates` rejects downgrades and runtime mismatch.
- [x] Tests cover: valid manifest, wrong package, downgrade, bad hash format, incompatible runtime, missing signature.

### Task 4: Signature verification and checksum utilities

**Files:** create `pwa/updates/UpdateCrypto.js`; extend `pwa/tests/test_updates.js`.

**Interfaces:**
- Produces: `UpdateCrypto.sha256Hex(buffer)`, `UpdateCrypto.verifySignature(payloadObject, signatureB64)`, `UpdateCrypto.timingSafeEqualHex(a,b)`.
- Consumes: embedded public key.

- [x] Uses `crypto.subtle.digest('SHA-256')` and `crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'})`.
- [x] Returns `false` (never throws) on malformed signatures.
- [x] Tests sign with a throwaway key generated in the test process and verify both accept and reject paths.

### Task 5: Update storage, coordinator and update centre

**Files:** create `pwa/updates/UpdateStorage.js`, `pwa/updates/UpdateCoordinator.js`, `pwa/updates/LiveUpdateService.js`, `pwa/updates/ApkUpdateService.js`, `pwa/updates/ContentUpdateService.js`, `pwa/updates/UpdateUI.js`.

**Interfaces:**
- Produces: `UpdateCoordinator.start({isBusy,onEvent})`, `.checkNow({manual})`, `.getStatus()`, `.applyWeb()`, `.applyContent()`, `.downloadApk()`, `.installApk()`.
- Consumes: Tasks 3–4, `window.Capacitor`, `@capawesome/capacitor-live-update`.

- [x] Check interval 12 h, persisted in `localStorage["studysynth_updates_state"]`.
- [x] Wi-Fi preference: large downloads deferred on metered connections unless the setting allows it.
- [x] Web activation deferred while `State.activeMode === 'test' && testStarted && !testSubmitted`.
- [x] Update Centre sheet renders versions, statuses, progress, release notes, retry.
- [x] Verify: unit test for interval gating and deferral.

### Task 6: Content package format, validation and atomic activation

**Files:** create `pwa/updates/ContentUpdateService.js`, `scripts/updates/build-content-package.js`; modify `pwa/engine/storage.js` (DB v4 + overlay), `pwa/tests/test_content.js`.

**Interfaces:**
- Produces: `ContentUpdateService.validatePackage(pkg)`, `.activatePackage(pkg)`, `.rollback()`, `.getState()`. Storage gains `getContentMeta`, `saveContentMeta`, `putContentModules`, `deleteContentPack`, `getContentModule`.
- Consumes: bundled index/bodies.

- [x] DB_VERSION 4 adds `contentMeta` and `contentModules` without touching existing stores.
- [x] `getBundledIndex()` merges the active pack index over the bundled index.
- [x] `fetchBundledBody()` returns an overlay body first.
- [x] Activation is one transaction, then a pointer swap; failure leaves the previous pack active.
- [x] Bookmarks, attempts and revision stores are never written by a content update.
- [x] Tests: valid delta, invalid answer key, missing question id, duplicate ids, rollback.

### Task 7: Native APK download and install plugin

**Files:** create `android/app/src/main/java/com/usm007/studysynth/{ApkUpdatePlugin,ApkDownloader,ApkVerifier}.java`; modify `MainActivity.java`, `AndroidManifest.xml`, `res/xml/file_paths.xml`.

**Interfaces:**
- Produces: JS plugin `ApkUpdate` with `getInstallPermissionStatus()`, `openInstallPermissionSettings()`, `download({url,sha256,size,versionCode,packageId,certSha256})`, `install()`, `cancel()`, `getState()`, events `downloadProgress`.
- Consumes: manifest APK block.

- [x] Download to `cacheDir/updates/`, resume with `Range`, progress events, cancel.
- [x] Verify SHA-256, `PackageManager.getPackageArchiveInfo` package/versionCode, and signing certificate digest before install.
- [x] Reject if `canRequestPackageInstalls()` is false, and route the user to settings.
- [x] Install via FileProvider + `ACTION_VIEW` with `FLAG_GRANT_READ_URI_PERMISSION`.
- [x] Verify: `gradlew assembleRelease` compiles; manifest declares `REQUEST_INSTALL_PACKAGES`.

### Task 8: Mobile shell, four-screen navigation and design system

**Files:** rewrite `pwa/index.html`; create `pwa/app.css`; modify `pwa/app.js` (home rendering, nav wiring, palette sheet, duplicate-listener removal), `pwa/manifest.webmanifest`.

**Interfaces:**
- Produces: `renderHome()`, `#homeView`, `#tabbar`, `#updateSheet`, `switchMode('home'|'library'|'revision'|'analysis'|'practice'|'test'|'generator')`.
- Consumes: every existing ID in `initDOM()`.

- [x] All IDs preserved; `initDOM()` unchanged except additive bindings.
- [x] Bottom nav has exactly Home, Library, Revision, Progress.
- [x] Practice screen: progress, question, large options, bookmark, prev/next, explanation, palette sheet.
- [x] Exam keeps timer, palette, mark-for-review, unanswered indicators, submit confirmation, results.
- [x] `updateExamTabs` becomes idempotent (no listener registration).
- [x] Verify: headless Chrome load, zero console errors, screenshots at 360×800 and 412×915, dark and light.

### Task 9: Service worker, offline integrity and cache versioning

**Files:** modify `pwa/sw.js`.

- [x] Cache name derived from `STUDYSYNTH_VERSION`; precache includes `updates/*` and `version.js`.
- [x] Navigation requests are network-first with cache fallback so OTA bundles are not shadowed.
- [x] Update manifest requests bypass the cache.
- [x] Verify: offline reload serves the shell; `caches.keys()` shows one cache.

### Task 10: GitHub infrastructure and updates site

**Files:** create `.github/workflows/test.yml`, `build-ota.yml`, `release-android.yml`; create `updates-site/index.html`, `updates-site/updates/stable/manifest.json`, `updates-site/.nojekyll`; create `scripts/updates/build-ota-bundle.js`, `build-content-package.js`, `build-manifest.js`, `verify-release.js`, `check-manifest.js`, `check-apk.js`.

- [x] `test.yml`: node tests + build + manifest schema check + headless browser job.
- [x] `build-ota.yml`: build web payload, zip, sign, publish to Pages with the manifest written last.
- [x] `release-android.yml`: signed `assembleRelease`, APK identity check, checksum, GitHub Release upload, manifest regeneration, Pages deploy.
- [x] Verify: `node scripts/updates/verify-release.js` against the produced APK set.

### Task 11: Documentation and release process

**Files:** create `docs/ARCHITECTURE.md`, `docs/UPDATE_SYSTEM.md`, `docs/RELEASE_GUIDE.md`, `docs/COMPLETION_REPORT.md`; update `README.md`.

- [x] Document exact secrets, manual steps, rollback, and the signing-identity decision.
- [x] Document that a native change requires a new APK.

### Task 12: Final validation

- [x] Run all six existing suites + new suites.
- [x] Build production APK with JDK 21; verify package, versionCode 4, certificate SHA-256.
- [x] Verify web build loads offline with no console errors.
- [x] Produce the completion report with real evidence.

---

## Deviations from this plan

These are intentional, and each is reflected in the code and docs:

1. **RSA-3072 instead of ECDSA P-256.** The Capacitor LiveUpdate plugin verifies
   bundles natively with `SHA256withRSA`. Using ECDSA would have required
   abandoning the plugin or adding a second verification path. RSA-3072 with
   PKCS#1 v1.5 is used everywhere: manifest, web bundle, content package.
2. **No `scripts/bump-version.js`.** `node scripts/version.js --sync` rewrites
   `pwa/version.js` from `version.json`, which is the only duplicated value.
   Release builds still verify the stamp independently.
3. **Native plugin files live at the package root**, not in a `updates/`
   subpackage, matching the existing `MainActivity` layout.
4. **Mark-for-review and submit confirmation were added**, not preserved. The
   base version had neither; the plan listed them as exam requirements, so they
   were implemented as session-only exam state.
5. **Content packages are full or self-contained deltas**, not incremental
   patches. A delta still contains every module that should exist after
   activation, which removes silent stale-content fallback.
6. **`check-ids.js` now fails the build on a missing id.** The old version
   printed the list and exited 0.
7. **Content rollback holds the rejected version.** Restoring the previous set
   also stops the automatic policy from reinstalling the same version; the
   explicit "Update question bank" action clears the hold.
8. **The update policy fails closed.** Until the host registers the exam
   predicate, downloads and activations are treated as blocked.
