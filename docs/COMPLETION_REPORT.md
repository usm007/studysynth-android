# StudySynth 2.1.0 — completion report

Date: 2026-11-11
Branch: `feat/v2.1.0-redesign`
Base: `education-version` (published release `v2.0.0-education`)
Release: `v2.1.0`, published 2026-11-11T14:53:41Z

This report states what was built, what was verified, and what was not. Nothing
below is marked verified unless the command or check was actually run.

---

## 1. Status by requirement

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Work on a new branch, never modify the published tag | Done | `feat/v2.1.0-redesign` created from `education-version`; `v2.0.0-education` untouched |
| 2 | Preserve question engine, answers, explanations, banks, bookmarks, exam logic, revision | Done | 6 original suites pass unchanged; storage DB v4 is additive; `verify-ui.js` exercises practice and a full timed exam |
| 3 | Three destinations: Home, Library, Progress; bottom nav on mobile | Done | Shell check: exactly 3 tabs, each shows exactly one view at 360 and 412 px |
| 4 | Practice/exam keeps timer, palette, mark-for-review, unanswered indicators, submit confirmation, results | Done | `verify-ui.js`: timer running, palette lists 20 cells, mark flags the palette cell, submit asks first, cancel keeps the exam, results scorecard appears |
| 5 | Offline-first, fast, minimal dependencies, no new UI framework | Done | No framework added; one dev dependency (`puppeteer-core`); service worker activates with one versioned cache; library opens from bundled data |
| 6 | APK updates via GitHub Releases + static manifest, SHA-256 + identity + version checks, supported install flow | Published, device flow pending | Release `v2.1.0` published; live APK checksum and certificate match the manifest; `ApkUpdatePlugin` compiles into the signed APK; install flow not driven on the phone (see §5) |
| 7 | OTA via Capawesome Live Update, signed, checksummed, staged, rollback, never interrupts a mock test | Published, device flow pending | Plugin `8.8.1` configured with the RSA public key; live web bundle verifies over HTTPS; 38 update tests cover exam guard, fail-closed policy, metered deferral, forged manifest rejection, content downgrade rejection |
| 8 | Content updates: signed, atomic, preserve bookmarks/attempts/revision, retain previous | Published, device flow pending | Live content package verifies over HTTPS; 20 content tests cover activation, rollback, missing-body rejection, hostile package rejection, data preservation |
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

### Update artifacts (published)

The release workflow rebuilds from the tagged commit, so the published
checksums below are the ones the app actually sees. They differ from any local
build of the same commit because the bundle and package embed a build timestamp.

| Artifact | Value |
| --- | --- |
| OTA bundle | `2.1.0-4-28363f59320c`, 18,929,017 bytes |
| OTA SHA-256 | `28363f59320cad0be23955610857868c7ca7acac8803569aa500f35f6e44296a` |
| Content package | `2026.11.1`, 11,607,741 bytes, 20 modules, 8,519 questions |
| Content SHA-256 | `893d6920504eb6afafa813688aa4a12641e8071aec220904812e168aebdf9262` |
| APK SHA-256 | `7b9a8da6262665cabc8f5260c257f8e505feecd1386f9a336274b15d709c5693` |
| APK size | 23,725,812 bytes |
| Manifest generated | `2026-11-11T14:53:37.048Z` |
| Manifest URL | `https://usm007.github.io/studysynth-android/updates/stable/manifest.json` |
| GitHub Release | `v2.1.0`, published `2026-11-11T14:53:41Z` |

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

### Published and re-verified over HTTPS

Release workflow run `43042536826` (`v2.1.0`, manual dispatch) finished
successfully and published the GitHub Release and the Pages deployment. Every
artifact was then downloaded from the live site and checked again with the
embedded public key:

```
manifest signature verifies : true
.sig sidecar matches        : true
web  size 18929017 expected 18929017 OK
web  sha256 OK
web  sig    OK
cont size 11607741 expected 11607741 OK
cont sha256 OK
cont sig    OK
apk  size 23725812 expected 23725812 OK
apk  sha256 OK
```

`GET` of the manifest returns `200` with `Access-Control-Allow-Origin: *`, and
`manifest.json.sig` is served alongside it.

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
| `node scripts/verify-ui.js` | 74 checks passed (13 per viewport × 4, 3 service worker, 14 exam shell) |
| Icon font contract | 70 symbols present, includes every icon used by the shell and the home screen |
| Browser console | Zero page errors, zero console errors, zero failed local requests in all four passes |
| Horizontal overflow | None at 360 px or 412 px |
| Service worker | Active, exactly one cache: `studysynth-2.1.0-capacitor-8-r2` |

Screenshots are in `output/ui/`:

- `home-{360,412}-{light,dark}.png`
- `library-{360,412}-{light,dark}.png`, `analysis-{360,412}-{light,dark}.png`, `updates-{360,412}-{light,dark}.png`
- `exam-palette-412-light.png`
- `exam-results-412-light.png`

---

## 5. What was not verified

These are the honest limits of this work:

1. **The on-device update flow has not been run end to end.** The release is
   published and every artifact verifies over HTTPS, but the app has not yet
   been driven through check → download → verify → install on the phone.
2. **The native `ApkUpdate` plugin was not executed on a device.** It compiles
   into the release APK; its download, resume, verification, and installer
   hand-off paths have not run on Android hardware.
3. **The APK install-over-existing flow was run once, not as an upgrade from the
   published 2.0.0 build.** A signed 2.1.0 APK installed over the existing
   install with data intact; the published 2.0.0 APK was not reinstalled first
   to replay the full upgrade path.
4. **OTA activation and native rollback were not exercised on a device.** The
   web-side policy, manifest validation, and signature verification are unit
   tested; the plugin's own staging and rollback are delegated to Capawesome and
   configured, not demonstrated here.
5. **Content activation was tested against a fake IndexedDB**, not on a device.
   The browser run uses real IndexedDB for normal app data but does not apply a
   downloaded content package.
6. **No automatic check has been observed firing on a device.** The scheduler,
   the exam guard and the "never interrupt a mock test" rule are unit tested,
   not watched in real time.

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
