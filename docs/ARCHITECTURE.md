# StudySynth architecture

StudySynth is an offline-first study workspace and exam simulator. It ships as a
Capacitor Android app and as a plain static web app from the same source. There
is no server, no account system, and no network dependency at runtime.

This document describes how the pieces fit together and where the boundaries
are. It is written for the next maintainer, not as an API reference.

---

## 1. Runtime layers

```
┌─────────────────────────────────────────────────────────────┐
│ Shell            pwa/index.html + app.css                    │
│                  four destinations, bottom navigation,       │
│                  sheets, modals, safe-area layout            │
├─────────────────────────────────────────────────────────────┤
│ Controller       pwa/app.js                                  │
│                  state machine, rendering, exam logic,       │
│                  revision flow, update wiring                │
├─────────────────────────────────────────────────────────────┤
│ Engines          pwa/engine/*                                │
│                  generator, reasoning v2, analyzer, OCR,     │
│                  jobs, revision, storage                     │
├─────────────────────────────────────────────────────────────┤
│ Data             pwa/ctet/*.json + ctet_index.js             │
│                  bundled question modules and index          │
├─────────────────────────────────────────────────────────────┤
│ Updates          pwa/updates/*                               │
│                  manifest, verification, services, policy    │
├─────────────────────────────────────────────────────────────┤
│ Native           android/ (Capacitor 8)                      │
│                  LiveUpdate plugin + local ApkUpdate plugin  │
└─────────────────────────────────────────────────────────────┘
```

Everything below the shell is plain browser JavaScript. There is no framework,
no bundler, and no transpile step. `pwa/` is served as-is; `scripts/build-web.js`
copies it into `www/`, and Capacitor copies `www/` into the APK.

---

## 2. Navigation and screens

Four primary destinations, always reachable from the bottom bar:

| Destination | View | Purpose |
| --- | --- | --- |
| Home | `#homeView` | Resume, start a mock, quick actions, device stats |
| Library | `#libraryView` | Browse UGC NET and CTET sets, search, start practice/test |
| Revision | `#revisionView` | Adaptive recall sessions with evidence excerpts |
| Progress | `#analysisView` | Attempt history, accuracy, strengths and gaps |

`switchMode(mode)` is the single navigation entry point. It sets
`body[data-mode]`, toggles exactly one view, updates the tab bar, and renders the
destination. Practice and exam screens (`#quizView`) are not destinations: they
are entered from the Library and keep their own full-screen layout.

`body[data-mode]` drives most layout rules in CSS. Adding a mode means adding a
view and a tab, not a second navigation system.

### Exam shell

`State` holds the live exam: question list, answers, marked-for-review flags,
timer bounds, and submission state. The exam strip (`#examStrip` markup lives in
`#quizView`) exposes the timer, answered count, palette, mark-for-review, and
submit action. Auto-submit on expiry calls `completeTest()` directly; a manual
submit asks for confirmation first.

Mark-for-review is session-only. It never changes answers or scoring and is
cleared when a new test starts.

---

## 3. Question data flow

Two layers of content exist at runtime:

1. **Bundled content** — `ctet_index.js` (metadata) and `ctet/<id>.json`
   (bodies) inside the app package. Always present, always offline.
2. **Content overlay** — an optional signed package downloaded by the update
   system, stored in IndexedDB. When active, it wins over the bundled copy for
   the modules it contains.

Lookups go through `engine/storage.js`:

```
resolveModuleBody(entry)
  ├─ overlay module in contentModules?  → use it
  └─ otherwise                          → fetch bundled ctet/<id>.json
```

The overlay is additive: activating or rolling back a package never touches
bookmarks, attempts, revision progress, or user-generated modules.

---

## 4. Storage

IndexedDB, database version 4. Upgrades are additive; existing stores are never
dropped or recreated.

| Store | Key | Contents |
| --- | --- | --- |
| `modules` | `id` | User-generated or imported study sets |
| `attempts` | `id` | Completed test attempts and scores |
| `jobs` | `id` | Background generation jobs |
| `jobPages` | `key` | Per-page OCR state for long documents |
| `jobInputs` | `key` | Original inputs for resumable jobs |
| `revisionProgress` | `key` | Per-question scheduling state |
| `revisionSessions` | `key` | Paused revision sessions |
| `contentMeta` | fixed key | Active and previous content package pointers |
| `contentModules` | `moduleId` | Module bodies from the active package |

`contentMeta` is the single source of truth for which package is active. A
package is activated by writing its modules and then swapping the pointer in one
transaction. The previous pointer is retained for rollback.

Browser storage is requested as persistent where the platform allows it. The app
never deletes user data as part of an update.

---

## 5. Update system boundaries

The update system is deliberately split into small, testable services:

| File | Responsibility |
| --- | --- |
| `UpdateCrypto.js` | SHA-256 helpers and RSA signature verification |
| `UpdateManifest.js` | Manifest schema validation and `selectUpdates()` |
| `UpdateStorage.js` | Persisted check state, settings, installed bundle id |
| `LiveUpdateService.js` | Thin wrapper over the Capacitor LiveUpdate plugin |
| `ApkUpdateService.js` | Wrapper over the local `ApkUpdate` native plugin |
| `ContentUpdateService.js` | Download, validate, activate, roll back content |
| `UpdateCoordinator.js` | Policy: when to check, what to apply, exam guard |
| `UpdateUI.js` | Update Centre rendering and user actions |

`UpdateCoordinator` is the only component that decides *whether* something may
happen. Services perform one operation and fail loudly. The UI never calls a
service directly except through coordinator actions.

The policy is intentionally conservative:

- Automatic checks at most every 12 hours.
- No download on metered or save-data connections when Wi-Fi-only is on.
- No download, activation, reload, or install while a timed exam is unsubmitted.
- A failed check leaves the last known-good state untouched.
- Every artifact is verified before it is used; verification failure is a hard
  stop, not a warning.

See `docs/UPDATE_SYSTEM.md` for the artifact formats and failure behavior.

---

## 6. Native bridge

Capacitor 8 hosts the web app in a WebView over `https://localhost`.

Two native capabilities matter:

- **LiveUpdate** (`@capawesome/capacitor-live-update`) verifies and activates web
  bundles natively. The public key is configured in `capacitor.config.json`.
- **ApkUpdate** (local Java plugin in `android/app/src/main/java/...`) downloads
  an APK with resume support, verifies SHA-256, package identity, version code,
  and signing certificate digest, then hands it to Android's installer through a
  FileProvider. It never installs silently; Android always shows its installer.

Native changes require a new APK. Web and content updates cannot add native
code.

---

## 7. Build and release pipeline

```
version.json ──► scripts/version.js ──► www/version.js
     │
     ├── scripts/build-web.js   pwa/ → www/
     ├── scripts/updates/build-ota-bundle.js   www/ → signed ZIP
     ├── scripts/updates/build-content-package.js   ctet/ → signed JSON
     ├── scripts/updates/build-manifest.js   artifacts → signed manifest
     └── scripts/updates/verify-release.js   end-to-end verification
```

`version.json` is the single source of truth for the package id, channel,
version name, version code, runtime version, and content version. Gradle reads it
directly; the web build generates `version.js` from it and fails if the committed
copy drifts.

Release workflows live in `.github/workflows/`. See `docs/RELEASE_GUIDE.md`.

---

## 8. Design constraints

These are not preferences; breaking them breaks the product:

- **Offline first.** The library, practice, revision, and progress must work with
  no network on a fresh install.
- **No new UI framework.** The shell is hand-written HTML, CSS, and DOM code to
  keep the APK small and startup fast on budget devices.
- **One state machine.** Navigation goes through `switchMode`; exam state lives
  in one place.
- **Preserve identity.** The application id and signing identity must not change
  without a deliberate migration release, or installed users cannot upgrade.
- **No silent behavior.** The app never claims to install updates silently, never
  hides a verification failure, and never replaces user data without consent.
