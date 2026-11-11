# StudySynth 2.1.0 — completion report

Date: 2026-11-11
Branch: `feat/v2.1.0-redesign`
Base: `education-version` (published release `v2.0.0-education`)

This report states what was built, what was verified, and what was not. Nothing
below is marked verified unless the command or check was actually run.

---

## 1. Status by requirement

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Work on a new branch, never modify the published tag | Done | `feat/v2.1.0-redesign` created from `education-version`; `v2.0.0-education` untouched |
| 2 | Preserve question engine, answers, explanations, banks, bookmarks, exam logic, revision | Done | 6 original suites pass unchanged; storage DB v4 is additive; `verify-ui.js` exercises practice and a full timed exam |
| 3 | Four destinations: Home, Library, Revision, Progress; bottom nav on mobile | Done | Shell check: exactly 4 tabs, each shows exactly one view at 360 and 412 px |
| 4 | Practice/exam keeps timer, palette, mark-for-review, unanswered indicators, submit confirmation, results | Done | `verify-ui.js`: timer running, palette lists 20 cells, mark flags the palette cell, submit asks first, cancel keeps the exam, results scorecard appears |
| 5 | Offline-first, fast, minimal dependencies, no new UI framework | Done | No framework added; one dev dependency (`puppeteer-core`); service worker activates with one versioned cache; library opens from bundled data |
| 6 | APK updates via GitHub Releases + static manifest, SHA-256 + identity + version checks, supported install flow | Implemented, locally verified | `ApkUpdatePlugin` compiles into the signed APK; `check-apk.js` and `verify-release.js` pass; install flow not run on a device (see §5) |
| 7 | OTA via Capawesome Live Update, signed, checksummed, staged, rollback, never interrupts a mock test | Implemented, locally verified | Plugin `8.8.1` configured with RSA public key; 38 update tests cover exam guard, fail-closed policy, metered deferral, forged manifest rejection, content downgrade rejection |
| 8 | Content updates: signed, atomic, preserve bookmarks/attempts/revision, retain previous | Implemented, unit verified | 20 content tests cover activation, rollback, missing-body rejection, hostile package rejection, data preservation |
| 9 | Never change application ID or signing identity casually | Done | APK id `com.usm007.studysynth`, certificate `62377a57…a374`, matching the published 1.2 APK |
| 10 | No fabricated results, no placeholder implementations | Done | See §5 for the exact limits of verification |
| 11 | Audit doc, docs, workflows, Update Centre, tests, production build, exact secrets, completion table | Done | `docs/IMPLEMENTATION_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/UPDATE_SYSTEM.md`, `docs/RELEASE_GUIDE.md`, `.github/workflows/*`, this report |

---

## 2. Version and identity

| Field | Value |
| --- | --- |
| Package id | `com.usm007.studysynth` |
| Version name | `2.1.0` |
| Version code | `4` |
| Min supported version code | `3` |
| Runtime version | `capacitor-8` |
| Content version | `2026.11.1` |
| Signing certificate SHA-256 | `62377a571b33c348a2ed61f08e538108b0b76338dcdaa7e029e0e3172a17a374` |
| APK Signature Scheme v2 | true |

The certificate digest is identical to the published 1.2 APK, so 2.1.0 installs
over an existing copy. The identity is the inherited legacy debug key; this is a
documented compatibility decision, not a security claim.

---

## 3. Build evidence

### APK

```
APK OK: com.usm007.studysynth 2.1.0 (4)
cert=62377a571b33c348a2ed61f08e538108b0b76338dcdaa7e029e0e3172a17a374
v2=true size=23734092
```

Path: `android/app/build/outputs/apk/release/app-release.apk`

### Update artifacts

| Artifact | Value |
| --- | --- |
| OTA bundle | `2.1.0-4-358be1bb43b6`, 18,937,139 bytes |
| OTA SHA-256 | `358be1bb43b6464b60df5542598e9557bc843e68e3164a38e282110e6f51d27c` |
| Content package | `2026.11.1`, 11,607,741 bytes, 20 modules, 8,519 questions |
| Content SHA-256 | `99398f6ee60a1e8b2bbc7e7edafca035bb2a047970acbfb12797efc64e8dcb90` |
| APK SHA-256 | `6243cad21c73b7d0f168f25179e20f836fe55b684da7c858f7a6f8e0b93cd72d` |
| Manifest generated | `2026-11-11T13:27:51.165Z` |
| Manifest signature | `XA006rsbmx/OmpwKz…` (512-char base64) |

### Verification output

```
OK   manifest signature verified
OK   release 2.1.0 (4), min supported 3
OK   content: manifest 2026.11.1 is not older than the bundled 2026.11.1
OK   apk: SHA-256 verified (22.63 MB)
OK   apk: com.usm007.studysynth 2.1.0 (4), cert 62377a571b33c348…
OK   web: SHA-256 verified (18.06 MB)
OK   web: artifact signature verified
OK   content: SHA-256 verified (11.07 MB)
OK   content: artifact signature verified

All checks passed.
```

Manifest schema check:

```
Manifest OK: com.usm007.studysynth 2.1.0 (4) channel=stable artifacts=apk,web,content
```

---

## 4. Test evidence

| Suite | Result |
| --- | --- |
| Engine | All engine tests passed |
| Integration and contract | Passed, 0 errors |
| Processing jobs | Passed, 0 errors |
| Revision engine | Passed |
| Reasoning engine v2 | Passed, 0 errors |
| Repair 002 regression | Passed |
| Update system | 38 passed, 0 failed |
| Content packages | 20 passed, 0 failed |

Supporting checks:

| Check | Result |
| --- | --- |
| `node scripts/check-ids.js` | 163 ids used, 0 missing |
| `node scripts/verify-ui.js` | 69 checks passed (13 per viewport × 4, 3 service worker, 14 exam shell) |
| Icon font contract | 70 symbols present, includes every icon used by the shell and the home screen |
| Browser console | Zero page errors, zero console errors, zero failed local requests in all four passes |
| Horizontal overflow | None at 360 px or 412 px |
| Service worker | Active, exactly one cache: `studysynth-2.1.0-capacitor-8-r1` |

Screenshots are in `output/ui/`:

- `home-{360,412}-{light,dark}.png`
- `library-…`, `revision-…`, `analysis-…`, `updates-…`
- `exam-palette-412-light.png`
- `exam-results-412-light.png`

---

## 5. What was not verified

These are the honest limits of this work:

1. **GitHub Actions have not run.** The three workflows are written and their
   YAML parses, but they have not executed on GitHub. Secrets and Pages are not
   configured on the repository.
2. **Nothing has been published.** The APK is not uploaded to GitHub Releases,
   and the update site is not deployed. Publishing requires the owner to add the
   five secrets and enable Pages (see `docs/RELEASE_GUIDE.md`).
3. **The APK install-over-existing flow was not run on a device.** The signing
   certificate matches the published APK, which is the condition for an upgrade,
   but no physical install was performed.
4. **The native `ApkUpdate` plugin was not executed on a device.** It compiles
   into the release APK; its download, resume, verification, and installer
   hand-off paths have not run on Android hardware.
5. **OTA activation and native rollback were not exercised on a device.** The
   web-side policy, manifest validation, and signature verification are unit
   tested; the plugin's own staging and rollback are delegated to Capawesome and
   configured, not demonstrated here.
6. **Content activation was tested against a fake IndexedDB**, not on a device.
   The browser run uses real IndexedDB for normal app data but does not apply a
   downloaded content package.
7. **The update manifest was verified from the local staging directory**, not
   over HTTPS from GitHub Pages.

---

## 6. Deferred items

| Item | Reason | Recommended follow-up |
| --- | --- | --- |
| Dedicated release signing key | Changing identity now would break upgrades and force data loss | Plan an explicit migration release with an in-app export/import path |
| App Bundle (AAB) for Play Store | Distribution is GitHub Releases + direct APK | Add a bundle job if Play distribution is chosen |
| Delta web bundles | Full bundles are 18 MB and acceptable on Wi-Fi | Revisit if update size becomes a complaint |
| Content update UI for per-module updates | Current package updates the whole bank atomically | Already supported by the package format; add selection UI later |
| Automated accessibility audit | Manual checks only | Add axe-core to `verify-ui.js` |

---

## 7. Files added or changed

Documentation:

- `docs/IMPLEMENTATION_AUDIT.md`
- `docs/ARCHITECTURE.md`
- `docs/UPDATE_SYSTEM.md`
- `docs/RELEASE_GUIDE.md`
- `docs/COMPLETION_REPORT.md`
- `docs/release-notes/2.1.0.md`
- `README.md`

Update system:

- `pwa/updates/{keys,UpdateCrypto,UpdateManifest,UpdateStorage,LiveUpdateService,ApkUpdateService,ContentUpdateService,UpdateCoordinator,UpdateUI}.js`
- `scripts/updates/{canonical,zip,keys,keygen,sign,apk-info,build-ota-bundle,build-content-package,build-manifest,verify-release,check-manifest,check-apk}.js`

Native:

- `android/app/src/main/java/com/usm007/studysynth/{ApkUpdatePlugin,ApkDownloader,ApkVerifier}.java`
- `android/app/src/main/AndroidManifest.xml` (FileProvider, install permission)
- `android/app/build.gradle` (version from `version.json`, signing guard)

Shell and app:

- `pwa/index.html`, `pwa/app.css`, `pwa/app.js`, `pwa/sw.js`, `pwa/version.js`
- `pwa/engine/storage.js` (DB v4 content overlay)

Tooling and CI:

- `version.json`, `scripts/version.js`, `scripts/build-web.js`, `scripts/check-ids.js`, `scripts/verify-ui.js`
- `.github/workflows/{test,build-ota,release-android}.yml`
- `updates-site/` (site shell and signed manifest)
- `pwa/tests/{test_updates,test_content}.js`, `pwa/tests/helpers/fake-idb.js`
