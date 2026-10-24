# Split StudySynth Lite into two projects

Date: 2026-10-24
Status: approved

## Intent

The repository today contains two unrelated products: the **StudySynth Lite agent
skill** (Python pipeline that turns a source document into a validated question
bank and study package) and the **StudySynth Android app** (offline PWA wrapped in
a Capacitor Android project). They share no code. The owner wants them to be two
independent projects with their own folders and repositories, so that neither
carries the other's files, dependencies, or release history.

## Goals

- `E:\studysynth-lite` contains only the agent skill, with its own tests and docs.
- `E:\studysynth-android` contains only the Android app, with its own tests, build,
  and content tooling.
- Each project builds and tests on its own, with no path pointing at the other.
- Nothing is lost: the current folder remains untouched until both new projects
  are verified.

## Non-goals

- No feature changes, no content regeneration, no UI changes.
- No rewrite of either product.
- No GitHub repository creation or push in this task.

## Anti-goals

- Copying the other project's files "just in case" — that recreates the tangle.
- Deleting the current folder before both new projects pass their tests.
- Moving generated artifacts (`www/`, `output/`, `node_modules`, Gradle caches)
  instead of rebuilding them.

## Approaches considered

1. **Two sibling folders, each its own repo (chosen).** Clean ownership; the
   existing history goes to the skill because the repository is named
   `studysynth-lite`; the app starts a fresh repository whose first commit is the
   current app.
2. Two subfolders in the current repo. Rejected: they would still ship together
   and share one history.
3. A parent `E:\StudySynth\` folder. Rejected by the owner in favour of siblings.

## Target layout

### `E:\studysynth-lite` — agent skill

| Path | Contents |
|---|---|
| `SKILL.md`, `README.md` | Skill instructions and a skill-only README (rewritten) |
| `config.default.json`, `requirements.txt` | Pipeline configuration and dependencies |
| `scripts/` | The 27 skill scripts only: `pipeline_lite.py`, `pipeline.py`, `generate_lite.py`, `ingest.py`, `anchors.py`, `quality.py`, `audit.py`, `coverage.py`, `gate.py`, `package.py`, `package_delivery.py`, `build_web.py`, `build_pdf.py`, `build_newspaper_package.py`, `dashboard.py`, `dedupe.py`, `cache.py`, `check_pdf.py`, `desktop_shortcut.py`, `inventory_check.py`, `lib_common.py`, `lib_quiz.py`, `llm_trace.py`, `naming.py`, `record_lite_pass.py`, `report.py`, `validate_package_delivery.py`, `validate_questions.py` |
| `prompts/`, `schemas/`, `profiles/`, `examples/`, `templates/` | Skill inputs and reference material |
| `tests/test_skill_lite.py`, `tests/fixtures/` | Skill tests and fixtures |

Git: cloned from the current repository, so the existing history is preserved;
one commit removes the app paths and adds the skill-only README.

### `E:\studysynth-android` — Android app

| Path | Contents |
|---|---|
| `pwa/` | Screens, engine, bundled CTET bodies, assets, PWA tests (no `node_modules`) |
| `android/` | Capacitor Android project (no `build/`, no `.gradle/`; `local.properties` copied but gitignored) |
| `capacitor.config.json`, `package.json`, `package-lock.json` | App identity and build scripts |
| `scripts/` | App tooling only: `build-web.js`, `build_ctet_payload.py`, `build_ctet_pyqs.py`, `build_icon_font.py`, `convert_ncert_ctet.py`, `convert_pedagogy_chapters.py`, `ctet_gate_report.py`, `ctet_quality.py`, `ctet_sources.py`, `ctet_source_gate.py`, `ctet_subject_quality.py`, `generate-android-assets.ps1` |
| `data/ctet_gate/` | Committed gate decisions |
| `tests/test_ctet_gate.py`, `tests/test_ctet_question_stems.py` | App content tests |
| `docs/`, `.superpowers/` | App design docs and the CTET work ledger |
| `README.md` | App-only README (rewritten) |

Rebuilt, not copied: `www/` (from `pwa/`), `output/StudySynth.apk`, `node_modules`.

Git: new repository, one initial commit.

## Verification

Skill:
- `python -m pytest tests/test_skill_lite.py -q` passes in `E:\studysynth-lite`.
- No file in the skill folder references `pwa`, `android`, or `ctet`.

App:
- `npm install` (root and `pwa/`).
- `npm run web:build` produces `www/`.
- `npm test --prefix pwa` passes all four suites.
- `python -m pytest tests/ -q` passes both app test files.
- `npm run android:apk` produces `output/StudySynth.apk`.
- No file in the app folder references the skill scripts, `prompts/`, `schemas/`,
  `profiles/`, `examples/`, or `templates/`.

## Cleanup

After both projects pass, the owner confirms deletion of
`E:\studysynth-lite-main`. Until then it is the backup.

## Calls made by the builder

- The existing git history goes to the skill project.
- The app project starts a fresh repository.
- Generated artifacts are rebuilt rather than moved.
- The app keeps its Python content tooling, because that tooling is what
  publishes the bundled chapters; removing it would freeze the content forever.
