# Split StudySynth Lite into Two Projects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `E:\studysynth-lite` (agent skill only, existing git history) and `E:\studysynth-android` (Android app only, fresh git history), each building and testing with no reference to the other.

**Architecture:** The skill project is a clone of the current repository with every app path removed in a single commit. The app project is a copy of the app paths into a new repository whose generated artifacts (`www/`, `output/`, `node_modules/`, Gradle output) are rebuilt rather than moved. `E:\studysynth-lite-main` stays untouched until both pass.

**Tech Stack:** Python 3.12 + pytest, Node 22 + Capacitor 8, Gradle 8.14.3 + JDK 21 + Android SDK 36, PowerShell.

**Spec:** `docs/superpowers/specs/2026-10-24-project-split-design.md`

## Global Constraints

- Targets: `E:\studysynth-lite`, `E:\studysynth-android`. Source: `E:\studysynth-lite-main` (read-only for this plan).
- No feature, content, or UI changes. Only the doc/comment edits listed below.
- Never copy: `node_modules/`, `www/`, `output/`, `android/build/`, `android/.gradle/`, `android/app/src/main/assets/public/`, `__pycache__/`, `.pytest_cache/`.
- Never delete or modify anything inside `E:\studysynth-lite-main`.
- Shipped APK artifact name is `StudySynth.apk`; no `debug` in that name.
- `git` lives at `C:\Program Files\Git\cmd\git.exe`; prepend `C:\Program Files\Git\cmd` to `$env:Path` in every shell.
- Set `$env:PYTHONIOENCODING='utf-8'` before any Python command that may print non-ASCII.
- No GitHub repository creation and no push.
- Existing git history belongs to the skill project; the app project starts fresh.

## Review Focus

- **Untracked app content exists only on disk.** `pwa/ctet/`, `pwa/ctet_index.js`, `pwa/ctet_manifest.js`, `pwa/assets/material/icons.txt`, `data/ctet_gate/`, and 10 CTET scripts are untracked. A copy that misses them silently ships an app with no bundled sets. Task 2 verifies each one exists in the copy before anything else runs.
- **A hardcoded absolute path to the old folder.** The PYQ builder writes to `e:\studysynth-lite-main\output\ctet_modules`; left as-is, regenerating content in the new project writes into the backup. Task 2 fixes it and greps for the old path.
- **The skill clone carries only committed content.** Any skill file edited but not committed would vanish from the clone. Task 1 checks skill paths are clean before cloning.
- **Artifact naming.** Gradle writes `app-debug.apk`; the shipped copy must be `output/StudySynth.apk`. Task 2 copies and records it.
- **Cross-project test leakage.** The app's pytest run must not need the skill's dependencies (`openpyxl`, `reportlab`), and the skill's pytest run must not need Node. Each task runs its tests in the new folder with the other project absent from the machine's PATH.

---

### Task 1: Skill project at `E:\studysynth-lite`

**Files:**
- Clone: `E:\studysynth-lite` (from `E:\studysynth-lite-main`)
- Delete: `pwa/`, `android/`, `package.json`, `package-lock.json`, `capacitor.config.json`, `scripts/build-web.js`, `scripts/generate-android-assets.ps1`
- Modify: `.gitignore`, `README.md`, `SKILL.md`, `prompts/lite-generate.md`, `scripts/generate_lite.py`, `scripts/pipeline_lite.py`

**Interfaces:**
- Consumes: committed HEAD `a23c5a9` of the current repository.
- Produces: a repository whose only tracked content is the skill; later tasks grep it for app vocabulary.

- [ ] **Step 1: Confirm skill paths are clean at HEAD**

```powershell
cd E:\studysynth-lite-main
$env:Path = "C:\Program Files\Git\cmd;$env:Path"
git status --porcelain --untracked-files=no -- SKILL.md config.default.json requirements.txt scripts prompts schemas profiles examples templates tests/test_skill_lite.py tests/fixtures
```

Expected: no output (the only modified tracked file is `.gitignore`, which is not in this path list). Any output means a skill file would not reach the clone — stop and report.

- [ ] **Step 2: Clone and point the remote at GitHub**

```powershell
git clone --no-hardlinks E:\studysynth-lite-main E:\studysynth-lite
git -C E:\studysynth-lite remote set-url origin git@github.com:usm007/studysynth-lite.git
git -C E:\studysynth-lite log --oneline -1
```

Expected: `a23c5a9 Release v1.2.0 (versionCode 3)`.

- [ ] **Step 3: Remove every app path from the clone**

```powershell
cd E:\studysynth-lite
git rm -r -q pwa android
git rm -q package.json package-lock.json capacitor.config.json scripts/build-web.js scripts/generate-android-assets.ps1
```

Expected: both commands exit 0.

- [ ] **Step 4: Verify no app path is tracked**

```powershell
git ls-files | Select-String -Pattern '^(pwa|android)/|^(package\.json|package-lock\.json|capacitor\.config\.json)$|^scripts/(build-web\.js|generate-android-assets\.ps1)$'
```

Expected: no output.

- [ ] **Step 5: Replace `.gitignore` with the skill-only version**

```gitignore
__pycache__/
*.pyc
.pytest_cache/
build/
output/
dist/
```

- [ ] **Step 6: Remove the app vocabulary from skill docs and comments**

Apply these exact replacements.

`SKILL.md` — three replacements:

1. Delete this table row entirely:
```
| **Mobile PWA** | **0 AI passes** | Offline, deterministic practice on a phone |
```
2. Replace:
```
The deterministic rule-based generator (`scripts/generate_lite.py`) is the **PWA engine**
and a test-fixture generator. It is not the default Lite Python generation path.
```
with:
```
The deterministic rule-based generator (`scripts/generate_lite.py`) is a fixture
generator. It is not the default Lite Python generation path.
```
3. Change `## 1. Three execution layers` to `## 1. Two execution layers`.

`SKILL.md:150` — `This is the explicit deterministic path for tests, demos, and PWA parity fixtures. It is` becomes `This is the explicit deterministic path for tests, demos, and fixture parity runs. It is`.

`prompts/lite-generate.md:10` — `that deterministic engine is only for the offline mobile PWA and explicit test fixtures.` becomes `that deterministic engine is only for offline fixtures and explicit test runs.`

`scripts/generate_lite.py`:
- line 1: `"""StudySynth Lite - deterministic offline/PWA inventory and question engine.` → `"""StudySynth Lite - deterministic offline inventory and question engine.`
- lines 3–4: `This module is the zero-LLM engine intended for the offline mobile PWA and for` / `deterministic test fixtures. It is NOT the default Lite Python generation path.` → `This module is the zero-LLM engine intended for deterministic test fixtures. It is` / `NOT the default Lite Python generation path.`
- line 1165: `"StudySynth Lite offline/PWA fixture generator (not the default agent generation path)"` → `"StudySynth Lite offline fixture generator (not the default agent generation path)"`

`scripts/pipeline_lite.py`:
- line 91: `"Use the deterministic offline/PWA fixture generator instead of the agent generation pass (demo/test only)"` → `"Use the deterministic offline fixture generator instead of the agent generation pass (demo/test only)"`
- line 229: `# deterministic PWA/fixture engine; no model call` → `# deterministic fixture engine; no model call`

- [ ] **Step 7: Rewrite `README.md` for the skill only**

Keep these sections, in this order, using the existing skill text where it already applies: what the skill does; the two execution layers (full Python edition, Lite Python edition); what one Lite run does (prepare → hand off → generate → validate → repair once → package); Quickstart (the `pipeline_lite.py` commands already in the file); the `--offline-engine` fixture note; repository layout; how to run tests.

Rules: no mention of PWA, Android, Capacitor, phones, or an app; the layout tree lists only skill paths; the test command is `python -m pytest tests/test_skill_lite.py -q`.

- [ ] **Step 8: Run the skill tests in the new project**

```powershell
cd E:\studysynth-lite
$env:PYTHONIOENCODING='utf-8'
python -m pytest tests/test_skill_lite.py -q
```

Expected: `17 passed`.

- [ ] **Step 9: Verify no app vocabulary remains**

```powershell
Get-ChildItem -Recurse -File |
  Where-Object { $_.FullName -notmatch '\\\.git\\|__pycache__|\.pytest_cache|\\build\\' } |
  Select-String -Pattern 'ctet|capacitor|android|\bpwa\b' -CaseSensitive:$false
```

Expected: no output. Any hit is a leftover reference to fix before committing.

- [ ] **Step 10: Commit**

```powershell
git add -A
git commit -m "Split: keep only the StudySynth Lite agent skill"
git status --short
```

Expected: commit created; `git status --short` empty.

---

### Task 2: App project at `E:\studysynth-android`

**Files:**
- Create: `E:\studysynth-android\` with `pwa/`, `android/`, `scripts/` (12 app scripts), `tests/` (2 app test files), `data/`, `docs/`, `.superpowers/`, `capacitor.config.json`, `package.json`, `package-lock.json`, `README.md`, `.gitignore`, `requirements.txt`
- Modify: `scripts/build_ctet_pyqs.py` (absolute path), `package.json` (name), `pwa/README.md` (one note)

**Interfaces:**
- Consumes: the working tree of `E:\studysynth-lite-main`, including its untracked files.
- Produces: a repository that builds `www/`, passes four Node suites and two Python test files, and produces `output/StudySynth.apk`.

- [ ] **Step 1: Copy the app trees**

```powershell
$src = 'E:\studysynth-lite-main'
$dst = 'E:\studysynth-android'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

robocopy "$src\pwa" "$dst\pwa" /E /XD node_modules /NFL /NDL /NJH /NJS /NP
robocopy "$src\android" "$dst\android" /E /XD build .gradle public /NFL /NDL /NJH /NJS /NP
robocopy "$src\data" "$dst\data" /E /NFL /NDL /NJH /NJS /NP
robocopy "$src\docs" "$dst\docs" /E /NFL /NDL /NJH /NJS /NP
robocopy "$src\.superpowers" "$dst\.superpowers" /E /NFL /NDL /NJH /NJS /NP
robocopy "$src\tests" "$dst\tests" /E /XD fixtures __pycache__ .pytest_cache /XF test_skill_lite.py /NFL /NDL /NJH /NJS /NP
```

`robocopy` exits 1 when files were copied — treat exit codes 0–7 as success.

- [ ] **Step 2: Copy the 12 app scripts and the root config files**

```powershell
$appScripts = @(
  'build-web.js','build_ctet_payload.py','build_ctet_pyqs.py','build_icon_font.py',
  'convert_ncert_ctet.py','convert_pedagogy_chapters.py','ctet_gate_report.py',
  'ctet_quality.py','ctet_sources.py','ctet_source_gate.py','ctet_subject_quality.py',
  'generate-android-assets.ps1')
New-Item -ItemType Directory -Force -Path "$dst\scripts" | Out-Null
$appScripts | ForEach-Object { Copy-Item "$src\scripts\$_" "$dst\scripts\" -Force }
Copy-Item "$src\capacitor.config.json","$src\package.json","$src\package-lock.json" $dst
```

- [ ] **Step 3: Verify the untracked content arrived and the artifacts did not**

```powershell
$must = @(
  'pwa\ctet_index.js','pwa\ctet_manifest.js','pwa\assets\material\icons.txt',
  'data\ctet_gate\manifest.json','scripts\ctet_sources.py',
  'tests\test_ctet_gate.py','tests\test_ctet_question_stems.py',
  'docs\superpowers\specs\2026-10-24-project-split-design.md')
$must | ForEach-Object { "$_ = $(Test-Path (Join-Path $dst $_))" }

$mustNot = @('node_modules','www','output','pwa\node_modules','android\build','android\.gradle','android\app\src\main\assets\public','tests\fixtures','tests\test_skill_lite.py')
$mustNot | ForEach-Object { "$_ = $(Test-Path (Join-Path $dst $_))" }
```

Expected: every `$must` line `True`; every `$mustNot` line `False`. Also confirm `(Get-ChildItem "$dst\pwa\ctet" -File).Count` is `70`.

- [ ] **Step 4: Replace the absolute path in the PYQ builder**

In `scripts/build_ctet_pyqs.py`, replace

```python
output_dir = r"e:\studysynth-lite-main\output\ctet_modules"
```

with

```python
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_dir = os.path.join(ROOT, "output", "ctet_modules")
```

- [ ] **Step 5: Verify no path points at the old folder**

```powershell
Select-String -Path "$dst\scripts\*.py","$dst\scripts\*.js","$dst\scripts\*.ps1" -Pattern 'studysynth-lite-main' -CaseSensitive:$false
```

Expected: no output.

- [ ] **Step 6: Create `.gitignore` and `requirements.txt`**

`.gitignore`:

```gitignore
__pycache__/
*.pyc
.pytest_cache/
node_modules/
output/
www/
build/
.superpowers/
```

`requirements.txt`:

```
# StudySynth Android content tooling
pypdf>=6.0
fonttools>=4.50
brotli>=1.1
pytest>=8.0
```

- [ ] **Step 7: Rename the package and drop the skill note from the PWA readme**

- `package.json`: `"name": "studysynth-lite"` → `"name": "studysynth-android"`.
- `pwa/README.md`: delete the blockquote note that begins `> This PWA is the zero-LLM layer. The Python Lite skill uses one combined agent`. Leave the rest of the file unchanged.

- [ ] **Step 8: Rewrite `README.md` for the app only**

Sections, in order: what the app is (offline study workspace + exam simulator, zero network, zero AI); run it locally (`python -m http.server 8899 --directory pwa` — the server must be threaded for the service worker); tests (`npm test --prefix pwa`, `python -m pytest tests/ -q`); build the APK (`npm install`, `npm run android:apk`, then copy `android/app/build/outputs/apk/debug/app-debug.apk` to `output/StudySynth.apk`); requirements (Node 22+, JDK 21, Android SDK platform 36 + build-tools 36); content pipeline (`scripts/convert_ncert_ctet.py`, `scripts/convert_pedagogy_chapters.py`, `scripts/build_ctet_payload.py`, `scripts/build_icon_font.py --check`); repository layout (app paths only).

Rules: no mention of the Python Lite skill, `prompts/`, `schemas/`, `profiles/`, `examples/`, or `templates/`; the artifact is always named `StudySynth.apk`.

- [ ] **Step 9: Initialize the repository and commit**

```powershell
cd E:\studysynth-android
$env:Path = "C:\Program Files\Git\cmd;$env:Path"
git init -b main
git add -A
git commit -m "Initial commit: StudySynth Android app"
git ls-files | Measure-Object -Line
git status --short
```

Expected: one commit; `git status --short` empty; the file count is between 200 and 300. Confirm with `git ls-files | Select-String -Pattern 'node_modules|^www/|^output/'` returning nothing.

- [ ] **Step 10: Install dependencies**

```powershell
cd E:\studysynth-android
npm install
npm install --prefix pwa
```

Expected: both exit 0.

- [ ] **Step 11: Build the web payload and run the PWA suites**

```powershell
npm run web:build
npm test --prefix pwa
```

Expected: `PWA web payload ready: www (...)` and all four suites pass with no failures.

- [ ] **Step 12: Run the app's Python tests**

```powershell
cd E:\studysynth-android
$env:PYTHONIOENCODING='utf-8'
python -m pytest tests/ -q
```

Expected: all tests pass; record the count. If collection pulls in anything from the skill, stop — the copy is wrong.

- [ ] **Step 13: Build the APK and publish the artifact**

```powershell
cd E:\studysynth-android
npm run android:apk
```

Expected: `BUILD SUCCESSFUL` and `android\app\build\outputs\apk\debug\app-debug.apk` exists. If Gradle fails on a socket/network error, retry once with `cd android; .\gradlew.bat assembleDebug --offline`.

```powershell
New-Item -ItemType Directory -Force -Path E:\studysynth-android\output | Out-Null
Copy-Item E:\studysynth-android\android\app\build\outputs\apk\debug\app-debug.apk E:\studysynth-android\output\StudySynth.apk -Force
Get-Item E:\studysynth-android\output\StudySynth.apk | Select-Object Name,Length
```

Expected: `StudySynth.apk`, roughly 24–25 MB.

- [ ] **Step 14: Verify no skill references remain in shipped code**

```powershell
$dst = 'E:\studysynth-android'
Get-ChildItem "$dst\pwa","$dst\scripts","$dst\tests","$dst\android" -Recurse -File |
  Where-Object { $_.FullName -notmatch 'node_modules|\\build\\|\\\.gradle\\|assets\\public' } |
  Select-String -Pattern 'pipeline_lite|generate_lite|test_skill_lite|prompts/|schemas/|profiles/|examples/|templates/'
```

Expected: no output. (Matches inside `docs/` and `.superpowers/` are out of scope — they are history, not shipped code.)

- [ ] **Step 15: Commit anything the install or build changed**

```powershell
cd E:\studysynth-android
git status --short
```

If `package-lock.json` or any tracked file changed, `git add -A; git commit -m "Refresh lockfile after install"`. Otherwise stop here.

---

### Task 3: Cross-check and hand off

**Files:**
- Read: both new projects, `E:\studysynth-lite-main`

**Interfaces:**
- Consumes: the verified results of Tasks 1 and 2.
- Produces: a report and the decision to delete the backup.

- [ ] **Step 1: Confirm the backup is unchanged**

```powershell
cd E:\studysynth-lite-main
$env:Path = "C:\Program Files\Git\cmd;$env:Path"
git status --porcelain
git log --oneline -1
```

Expected: exactly the same 12 modified files and 18 untracked entries as before the split, and HEAD still `a23c5a9`.

- [ ] **Step 2: Confirm neither project can see the other**

```powershell
Test-Path E:\studysynth-lite\pwa          # False
Test-Path E:\studysynth-lite\android      # False
Test-Path E:\studysynth-android\SKILL.md  # False
Test-Path E:\studysynth-android\prompts   # False
```

- [ ] **Step 3: Report**

Report to the owner: skill test count, app test counts, the four Node suite result, APK path and size, both repository states (skill: history preserved + one split commit; app: one initial commit), and the two isolation greps. Then ask for explicit confirmation before deleting `E:\studysynth-lite-main`.
