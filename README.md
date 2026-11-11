# StudySynth

**A fully offline study workspace and exam simulator for UGC NET Education (Code 09) and CTET Paper-II.**

StudySynth runs as a signed Android app and as a static web app from the same
source. There is no server, no account, and no network dependency at runtime.

---

## What it does

- **8,519 verified questions**
  - **UGC NET Education (Code 09):** 2,024 questions across all 10 official
    NTA syllabus units.
  - **CTET Paper-II:** 6,495 questions across Child Development & Pedagogy and
    Social Studies / Social Science.
- **Exam simulation**
  - UGC NET Paper 2 mock: 100 questions, 120 minutes, 200 marks (+2 / 0).
  - CTET Paper-II mock: 90 questions, 90 minutes, 90 marks (+1 / 0).
  - CTET CDP section mock: 30 questions, 30 minutes.
  - Custom tests: choose scope, question count, and pace.
- **Practice mode** with instant feedback, answer keys, and explanations.
- **Adaptive revision** backed by source excerpts and spaced scheduling.
- **Progress** across attempts: accuracy, strengths, and gaps.
- **Offline first**: the library, practice, revision, and progress all work with
  no network on a fresh install.

### New in 2.1.0

- A mobile-first shell with four thumb-reachable destinations: Home, Library,
  Revision, Progress.
- A Home screen that resumes the last set and surfaces what matters now.
- An Update Centre for app, interface, and question-bank updates.
- Signed, checksummed updates with rollback and an exam guard.
- A mark-for-review control and a submit confirmation in timed tests.

---

## Run locally

```bash
npm ci
npm ci --prefix pwa
node scripts/build-web.js
python -m http.server 8899 --directory www
```

Open `http://localhost:8899`. To develop against the source directly, serve
`pwa/` instead of `www/`.

---

## Test

```bash
npm test --prefix pwa          # engine, integration, processing, revision, updates, content
node scripts/check-ids.js      # every DOM id used by app.js exists in the shell
node scripts/verify-ui.js      # headless Chrome: layout, tabs, exam shell, service worker
```

`verify-ui.js` writes screenshots to `output/ui/` at 360×800 and 412×915, light
and dark. It needs Chrome; set `CHROME_PATH` if it is not in the default
location.

---

## Build the Android app

```bash
npm run web:build
npx cap sync android
cd android
./gradlew assembleRelease --no-daemon
```

The signed APK is written to
`android/app/build/outputs/apk/release/app-release.apk`.

Release builds require a signing identity (`keystore.properties` at the
repository root, or the `ANDROID_KEYSTORE_*` environment variables). A release
build without signing fails on purpose. See `docs/RELEASE_GUIDE.md`.

---

## Updates

StudySynth updates three things independently:

| Artifact | Delivered by | Requires a new APK? |
| --- | --- | --- |
| App (APK) | GitHub Releases + in-app download | Yes |
| Web bundle | Capacitor LiveUpdate (signed ZIP) | No |
| Question bank | Signed content package | No |

Everything is described by one signed manifest published on GitHub Pages.
Android always shows its own installer for app updates; StudySynth never claims
to install silently. See `docs/UPDATE_SYSTEM.md`.

---

## Repository layout

```
studysynth-android/
├── android/                  Capacitor Android project and native plugins
├── pwa/
│   ├── assets/               icons, logos, bundled icon font
│   ├── ctet/                 20 question modules (UGC NET and CTET)
│   ├── engine/               generator, reasoning, OCR, jobs, revision, storage
│   ├── tests/                automated suites
│   ├── updates/              manifest, crypto, services, policy, UI
│   ├── app.js                controller and state machine
│   ├── app.css               mobile shell and design layer
│   ├── index.html            app shell
│   ├── styles.css            base component styles
│   └── sw.js                 service worker (web build only)
├── scripts/                  build, release, verification tooling
├── docs/                     architecture, updates, release guide, audit
├── version.json              single source of truth for version identity
└── capacitor.config.json     Capacitor and LiveUpdate configuration
```

---

## Documentation

- `docs/ARCHITECTURE.md` — runtime layers, navigation, storage, boundaries.
- `docs/UPDATE_SYSTEM.md` — manifest, signatures, policy, rollback, failure modes.
- `docs/RELEASE_GUIDE.md` — versioning, signing, CI secrets, release checklist.
- `docs/IMPLEMENTATION_AUDIT.md` — what the 2.1.0 work changed and why.
- `docs/COMPLETION_REPORT.md` — requirement-by-requirement status with evidence.

---

## License

MIT.
