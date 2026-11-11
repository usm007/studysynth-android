# StudySynth — Implementation Audit

**Audit date:** 2026-11-11
**Branch audited:** `education-version` (commit `0bbb1af`)
**Published release:** `v2.0.0-education`
**Audit method:** every claim below was verified against the checked-out source, the published
GitHub release assets, and the APKs present in the repository working tree. Nothing here is
copied from the README or from earlier descriptions.

---

## 1. Verified release identity (critical)

| Property | Verified value | How it was verified |
|---|---|---|
| Published APK asset | `Studysynth-Education.apk`, 26,465,767 bytes | GitHub Release API (`v2.0.0-education`) |
| Package ID | `com.usm007.studysynth` | `aapt2 dump badging` on all three local APKs |
| versionCode | `3` | `aapt2 dump badging` |
| versionName | `1.2` | `aapt2 dump badging` |
| minSdk / targetSdk | `24` / `36` | `aapt2 dump badging` |
| Signing scheme | APK Signature Scheme v2 only (no v1, no v3) | `apksigner verify --print-certs` |
| Signing certificate | `CN=Android Debug, O=Android, C=US` | `apksigner verify --print-certs` |
| Certificate SHA-256 | `62377a571b33c348a2ed61f08e538108b0b76338dcdaa7e029e0e3172a17a374` | `apksigner` |
| Key available? | **Yes** — `%USERPROFILE%\.android\debug.keystore`, alias `androiddebugkey`, store/key password `android` | `keytool -list -v`; certificate digest matches the APK exactly |
| Release asset digest | `sha256:55f923cca7c1783ae914748e28ed9c87644ab2a2747cd591473c5b8e148029d3` | GitHub Release API |

### 1.1 The published app is debug-signed

The current production artifact is an **Android debug build**:

- `package.json` → `"android:apk": "... gradlew.bat assembleDebug"`.
- `android/app/build.gradle` has no `signingConfigs` block, so `assembleRelease` would produce an
  **unsigned** APK. There is no keystore in the repository and no CI signing.
- The APK on the release page therefore carries the standard Android debug certificate.

### 1.2 Consequence, stated plainly

Android only installs an update over an existing app when the new APK is signed by the **same**
certificate. Two options exist, and they are not interchangeable:

1. **Keep the existing signing identity.** Sign v2.1.0 with the debug keystore that produced
   `v2.0.0-education`. Existing installs update in place and keep all user data. This is what
   this implementation does, because it is the only option that preserves user data and the
   only option compatible with the released APK.
2. **Switch to a new release key.** Every existing install must be uninstalled first, which
   deletes IndexedDB, bookmarks and attempts unless the user backs them up. The app can never
   update the old install directly.

The debug key is weak by construction (its password is public and it is shared by every Android
development machine). The upgrade path is preserved, but this key must be treated as a
**legacy identity**, not as a security boundary. The migration to a proper release key should
be planned as an explicit, user-visible major release (export → uninstall → reinstall), not
done silently. See `docs/RELEASE_GUIDE.md`.

### 1.3 Application ID mismatch

| Source | Value |
|---|---|
| `capacitor.config.json` → `appId` | `in.ugcnet.education` |
| `android/app/build.gradle` → `applicationId` | `com.usm007.studysynth` |
| `android/app/build.gradle` → `namespace` | `com.usm007.studysynth` |
| `res/values/strings.xml` → `package_name` / `custom_url_scheme` | `in.ugcnet.education` |
| Published APK | `com.usm007.studysynth` |

`capacitor.config.json` `appId` is only consumed when scaffolding a new Android project, so the
mismatch never reached the APK. It is still a trap: a future `cap add android` into a clean
directory would produce an app that cannot update the installed one. **Correction applied:**
`appId` now matches the installed package, and the package ID is asserted at build time.

### 1.4 Versioning is inconsistent across four files

| File | Version |
|---|---|
| `package.json` | `1.2.0` |
| `pwa/package.json` | `1.2.0` |
| `android/app/build.gradle` | `versionCode 3`, `versionName "1.2"` |
| Git tag / release | `v2.0.0-education` |

Nothing reads a single source of truth. **Correction applied:** `version.json` at the repository
root is now authoritative, Gradle reads it, the web build stamps it, and the update manifest is
generated from it. `versionCode` is derived from it as well.

---

## 2. Repository structure (verified)

```text
studysynth-android/
  capacitor.config.json          Capacitor 8.5.x, webDir "www"
  package.json                   build scripts (android:apk -> assembleDebug)
  pwa/                           the real source of the web app
    index.html                   672 lines, full shell markup
    app.js                       3,767 lines, single IIFE controller
    styles.css                   3,286 lines, one stylesheet
    sw.js                        service worker v38 comment / cache v45
    engine/                      question engine, OCR, PDF, storage, revision
    ctet/                        20 content JSON bodies (8,519 questions)
    tests/                       Node test suites
  www/                           generated copy of pwa/ (git-ignored)
  android/                       Capacitor Android project
  scripts/                       build + one-off Python/JS data scripts
  .github/                       ABSENT
  docs/                          ABSENT
```

- `www/` is git-ignored and generated by `scripts/build-web.js` (file-by-file copy + 4 dirs).
- `android/app/src/main/assets/public/` is a Capacitor sync output and is committed to the
  working tree, which means the APK can silently ship stale assets if `cap sync` is skipped.

---

## 3. Status by area

### 3.1 Already implemented (works, verified)

| Area | Evidence |
|---|---|
| Question engine (deterministic, zero-LLM) | `pwa/engine/generator.js` (172 KB) + `engine/reasoning/*`; reasoning suite passes |
| Content bank | 20 modules / 8,519 questions in `pwa/ctet/*.json`, indexed by `ctet_index.js` |
| Practice mode with instant feedback and explanations | `renderQuestion()` + `.study-note` |
| Timed exam mode | `startTimer`, `tickTimer`, auto-submit, `computeScore`, `saveAttempt` |
| Question palette | `renderPalette()` into `#livePalette` |
| Bookmarks | `localStorage["studysynth_bookmarks"]` via `OfflineStorage.toggleBookmark` |
| Adaptive revision (SM-2 style) | `engine/revision.js`, `openRevision()`, session persistence |
| Analysis / progress | `renderAnalysis()` from stored attempts |
| Offline storage | IndexedDB `StudySynthLiteDB` v3, 7 stores + localStorage fallback |
| Offline service worker | cache-first shell + 8.5 k content bodies manifest |
| PDF / OCR import | `engine/pdfParser.js`, `engine/ocr.js`, Tesseract bundled locally |
| Android hardware back handling | `MainActivity` → `window.__studysynthBack()` |
| Existing test suites | 6 Node suites, all passing at audit time (see §7) |

### 3.2 Partially implemented

| Area | What exists | What is missing |
|---|---|---|
| Offline-first content | Bodies fetched lazily from `./ctet/*.json`, cached by SW | No content versioning, no update channel, no integrity check on content |
| Service worker updates | `updatefound` → `SKIP_WAITING` message | No user-visible state, no rollback, no checksum |
| PWA install | `beforeinstallprompt` + install badge | Badge is visible inside the Android app where it can never work |
| Version display | None | About dialog has no version, OTA or content version |
| Release automation | Manual `assembleDebug` + manual upload | No CI, no signing, no checksums, no manifest |

### 3.3 Not implemented

- Any update mechanism: no APK updater, no OTA web updates, no content packages.
- Any signature or checksum verification anywhere in the codebase.
- GitHub Actions, GitHub Pages, update manifests.
- `REQUEST_INSTALL_PACKAGES`, FileProvider cache path, download service.
- Single source of truth for versions.
- Dark-theme-aware Android system bar sync is present, but no `values-night` resources.

### 3.4 Needs correction (defects found)

| # | Defect | Impact | Location |
|---|---|---|---|
| D1 | `updateExamTabs()` attaches click listeners to the exam tabs on **every** call, and `initEvents()` attaches them again | Duplicate handlers accumulate; each tab click re-renders the library multiple times, and `updateExamTabs` → `renderLibrary` → `updateExamTabs` grows the listener count on every render | `pwa/app.js:2738-2770`, `3673-3688` |
| D2 | `renderPalette()` re-creates a listener per button on every render | Correct but wasteful on 100-question mocks; full palette DOM rebuild on each answer | `pwa/app.js:1463-1495` |
| D3 | Production build is `assembleDebug` | Debug-signed release artifact; not a production build | `package.json` |
| D4 | No signing configuration | `assembleRelease` emits an unsigned APK | `android/app/build.gradle` |
| D5 | Four disagreeing version numbers | Update logic cannot compare versions reliably | see §1.4 |
| D6 | `appId` mismatch | Future scaffolding produces an incompatible package | `capacitor.config.json` |
| D7 | `sw.js` header says v38 while `CACHE_NAME` is `studysynth-v45` | Cache bumps are error-prone | `pwa/sw.js:2,11` |
| D8 | `CORE_ASSETS` precaches `./?mode=standalone` | Caches a redirect-prone query URL; wasted cache entry | `pwa/sw.js` |
| D9 | Mojibake in user-visible strings (`UGC NET Education �?" ...`) | Broken en-dashes/emoji in `index.html`, `manifest.webmanifest`, `README.md`, `release_notes.md` | multiple |
| D10 | `www/` and `android/.../assets/public` are stale-prone copies | APK can ship old web assets | build pipeline |
| D11 | No `.github`, no CI, no branch protection | Releases are manual and unverified | repository |
| D12 | `installBadge` is shown inside the native app | Dead control in the primary distribution channel | `pwa/app.js:394` |
| D13 | `body[data-mode]` drives all view visibility; there is no Home screen and no bottom navigation | Information architecture is desktop-first | `pwa/index.html` |

### 3.5 Potentially dangerous to change

| Area | Why |
|---|---|
| `pwa/engine/*` (especially `generator.js`, `reasoning/*`) | Question correctness and answer keys depend on it. Tests exist; do not refactor for style. |
| Answer-key semantics (`computeScore`, marking `+2 / 0`, CTET `+1 / 0`) | Directly affects reported results and stored attempts. |
| IndexedDB schema and key paths | Existing user data lives here. Schema changes must be additive only (`DB_VERSION` bump + new stores, never a delete/recreate of `modules`, `attempts`, `revisionProgress`, `revisionSessions`). |
| Bookmark storage key `studysynth_bookmarks` | User data; shape must stay compatible. |
| Revision scheduling data | Losing it resets the learner's spaced-repetition history. |
| `applicationId` / signing identity | An update signed by a different key cannot install. |
| Bundled content JSON shape | The engine and storage layer read `questions[].id/answer_key/options[]`. Content packages must validate against the same shape. |
| Service worker cache-first strategy | A wrong cache name or a bad precache list can brick offline startup. |

---

## 4. Architecture risks

1. **Monolithic controller.** `app.js` is 3,767 lines with rendering, state, timers, storage and
   DOM wiring interleaved. A full rewrite would put the question engine and exam logic at risk.
   This redesign therefore **replaces the shell and the styles, not the engine**, and adds new
   modules beside it.
2. **DOM-as-contract.** Rendering functions write into fixed element IDs. Any shell rewrite must
   preserve every ID that `initDOM()` binds, or the app fails at startup. The new shell keeps all
   142 IDs and adds new ones.
3. **No build step for the web app.** Assets are copied verbatim. Introducing a bundler would be a
   new risk on budget devices and in CI; the implementation keeps plain ES5-compatible scripts
   and adds files instead.
4. **Content size.** 8,519 questions in 20 files (largest 5 MB). Loading everything at startup
   would be fatal on budget devices. The existing lazy body fetch is correct and is preserved.
5. **No integrity story.** Nothing verifies that a downloaded byte string is the one that was
   published. This is the largest security gap and is addressed by the update system.
6. **WebView version variance.** Android WebView on API 24 devices may be old. Update code must
   avoid APIs that are not broadly available (no `Ed25519` in WebCrypto, no `structuredClone`
   assumptions). ECDSA P-256 + SHA-256 is used instead, which is available in every WebView that
   supports `crypto.subtle`.

---

## 5. Build and release state

| Item | State |
|---|---|
| Web build | `node scripts/build-web.js` → copies `pwa/*` into `www/` |
| Android sync | `npx cap sync android` |
| APK build | `cd android && gradlew.bat assembleDebug` |
| Gradle | wrapper present; AGP `8.13.0`; compile/target SDK `36`; Java **21** required by `capacitor.build.gradle` |
| Local JDK | only JDK 17 installed at audit time → **release builds fail locally until a JDK 21 is available** |
| Signing | none configured |
| Checksums | none |
| Release automation | none |

---

## 6. Test baseline (executed at audit time)

Command: `npm test --prefix pwa` (runs `test_engine`, `test_integration`, `test_processing`,
`test_revision`, `test_reasoning_v2`, `test_repair_002`).

Result: **all six suites passed**; the reasoning suite reported
`ALL REASONING ENGINE V2 TESTS PASSED SUCCESSFULLY (0 ERRORS)` and the repair suite reported
`ALL REPAIR 002 REGRESSION TESTS PASSED SUCCESSFULLY`.

No test covers: the UI, the service worker, storage migration, or anything update-related
(there was nothing to cover).

---

## 7. Summary

The educational engine and content are genuinely complete and must be preserved. The release
engineering, the interface, and the entire update story are not. The published APK is
debug-signed with a key that is still available, so a data-preserving upgrade to v2.1.0 is
possible — but only by reusing that exact certificate, and that fact has to be documented rather
than papered over.
