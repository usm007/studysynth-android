# AI Source Gate for Bundled Chapters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all 58 source-derived Library sets from AI-selected slices of their own text, so bundled questions come from prose worth questioning, with every evidence quote still verbatim.

**Architecture:** A Python gate tool extracts a chapter's page text, strips furniture and running heads, splits it into numbered sentences, and rebuilds text from a committed list of chosen sentence numbers. Both chapter converters ask the gate for their input text; when a committed keep list exists they feed the engine that text instead of the raw pages. Gate decisions are committed as integer lists plus one audit manifest; no source text is committed and the build never calls an AI.

**Tech Stack:** Python 3.12 (stdlib + `pypdf`), Node 18+ (engine contract via a stdin worker), vanilla PWA + service worker + IndexedDB, `pytest`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-24-ctet-ai-source-gate-design.md`

## Global Constraints

- Evidence must stay verbatim: gated text is the chosen sentences, unchanged, in original order. Never reword, summarise or splice.
- The engine contract is unchanged: `analyzeSource(rawText, title, sourceMeta, 25)` for NCERT chapters, `... , 30)` for pedagogy chapters.
- Exactly 58 sets take the gate: 49 NCERT chapters (`ctet_c6_ch01`…`ctet_c8_ch15`) + 9 pedagogy chapters (`ctet_ped_ch01`…`ctet_ped_ch09`). The 12 `ctet_pyq_*` sets and their 470 questions must be byte-identical afterwards.
- Committed gate data is integers only: `data/ctet_gate/<id>.keep.txt` (one ascending integer per line) and `data/ctet_gate/manifest.json`. No chapter text is committed to the public repo.
- `output/`, `www/`, `node_modules/` and Android assets are gitignored; only `data/`, `scripts/`, `tests/`, `pwa/` and `docs/` changes are tracked by this plan.
- The service worker cache name must be bumped to `studysynth-v34` in the same change that alters runtime assets. The existing test asserts the name matches `studysynth-v[3-9]\d`.
- The payload must still publish **70 sets**. Library behaviour, deletion, revision state and the solved-paper sets must not change.
- Existing test contracts hold: every `document.getElementById` in `pwa/app.js` exists in `pwa/index.html`; exactly one `aria-label="With love, usm007"`; no emoji in `pwa/index.html`; `data-mode="library"` is the default; every asset listed in `pwa/sw.js` exists on disk.
- No new dependencies. No OCR.
- The working tree already holds uncommitted work from fixes #1/#2/#4. Never `git add -A`; stage only the exact files named in a task, and never revert or reformat files a task does not own.

## Review Focus

1. **Stale keep file.** The candidate numbering changes whenever the splitter or furniture rules are touched. Expected: the build fails loudly, naming the chapter, and never silently generates from different text.
2. **A source set with no keep file** (a chapter added later). Expected: it falls back to today's raw-text behaviour and stays buildable, and the report names it.
3. **Pedagogy bullet-heavy notes.** Expected: one candidate per bullet, not one wall of text; a bullet block never collapses into a single "sentence".
4. **A chapter the gate starves.** Expected: the set may become revision-only, it still opens in the app, and the before/after report shows the drop rather than hiding it.
5. **Keep files with duplicates or out-of-range numbers.** Expected: duplicates collapse silently; out-of-range numbers abort with the offending index.

---

### Task 1: Shared source tables

**Files:**
- Create: `scripts/ctet_sources.py`
- Modify: `scripts/convert_ncert_ctet.py:10-77` (replace `BASE_NCERT` + `CHAPTERS` with an import), `scripts/convert_pedagogy_chapters.py:11-70` (replace `book_pdf` + `PEDAGOGY_CHAPTERS` with an import)
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Produces: `NCERT_BASE: str`, `NCERT_BOOK_TITLE: str`, `NCERT_CHAPTERS: list[dict]` (keys `id`, `class`, `pdf`, `title`), `PEDAGOGY_BOOK: str`, `PEDAGOGY_BOOK_TITLE: str`, `PEDAGOGY_CHAPTERS: list[dict]` (keys `id`, `title`, `start_page`, `end_page`), `all_chapters() -> list[dict]` (each entry adds `"kind": "ncert"|"pedagogy"`), `chapter_entry(chapter_id: str) -> dict`, `chapter_source(chapter_id: str) -> tuple[str, str, str]` returning `(raw_text, chapter_title, book_title)`.
- `chapter_source` extracts with `pypdf`; for pedagogy it reads `start_page-1 .. end_page` of the single book and applies `txt.replace('□', ' ')` exactly as the converter does today.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ctet_gate.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import ctet_sources

def test_source_tables_cover_58_sets():
    ncert = ctet_sources.NCERT_CHAPTERS
    ped = ctet_sources.PEDAGOGY_CHAPTERS
    assert len(ncert) == 49
    assert len(ped) == 9
    ids = [c["id"] for c in ncert] + [c["id"] for c in ped]
    assert len(ids) == len(set(ids)) == 58
    assert ctet_sources.chapter_entry("ctet_c6_ch01")["title"].endswith("Locating Places on the Earth")
    assert ctet_sources.chapter_entry("ctet_ped_ch09")["end_page"] == 190
    assert all(c["kind"] == "ncert" for c in ctet_sources.all_chapters()[:49])

def test_pedagogy_entries_have_page_ranges():
    for chapter in ctet_sources.PEDAGOGY_CHAPTERS:
        assert 0 < chapter["start_page"] < chapter["end_page"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k source_tables -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ctet_sources'`

- [ ] **Step 3: Create `scripts/ctet_sources.py`**

Move `BASE_NCERT`, `NCERT_BOOK_TITLE = "Exploring Society: India and Beyond"`, the `CHAPTERS` list (`NCERT_CHAPTERS`), `book_pdf` (`PEDAGOGY_BOOK`), `PEDAGOGY_BOOK_TITLE = ""`, and `PEDAGOGY_CHAPTERS` out of the two converters verbatim. `all_chapters()` returns NCERT entries first, then pedagogy. `chapter_source` caches nothing and always re-extracts.

- [ ] **Step 4: Point both converters at the shared table**

In `convert_ncert_ctet.py` replace the literal list with `from ctet_sources import NCERT_BASE as BASE_NCERT, NCERT_CHAPTERS as CHAPTERS` and keep `CHAPTERS` usage unchanged. Do the same in `convert_pedagogy_chapters.py` for `PEDAGOGY_BOOK as book_pdf, PEDAGOGY_CHAPTERS`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_ctet_gate.py -k "source_tables or page_ranges" -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add scripts/ctet_sources.py scripts/convert_ncert_ctet.py scripts/convert_pedagogy_chapters.py tests/test_ctet_gate.py
git commit -m "refactor: single source-of-truth table for bundled chapters"
```

---

### Task 2: Usability rule as committed code

**Files:**
- Create: `scripts/ctet_subject_quality.py`
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Produces: `usable_subject(subject: str) -> bool`, `module_quality(module: dict) -> dict` returning `{"usable": int, "questions": int, "inventory": int, "usable_rate": float}`.
- `module_quality` mirrors the spike: for each question, take `question["evidence"]["fact_ids"]`, resolve them against `revision_facts` by `fact_id`, ignore ids with no `subject`, and count the question usable only if every referenced typed fact has a usable subject.

- [ ] **Step 1: Write the failing test**

```python
import pytest
import ctet_subject_quality as q

@pytest.mark.parametrize("subject", [
    "we say", "= 500 m", "years", "high", "There", "This", "months",
    "Instead, a symbol",
    "In Bengal, the Anushilan Samiti was set up in 1902, with centres in numerous towns and villages to",
    "Popular hill stations, such as Nainital (Uttarakhand), Darjeeling (West Bengal), Shimla (Himachal Pradesh), and Mussoorie (Uttarakhand)",
])
def test_usable_subject_rejects_known_junk(subject):
    assert q.usable_subject(subject) is False

@pytest.mark.parametrize("subject", [
    "Tropic of Cancer", "the scale", "Anushilan Samiti", "Himalayan Range", "Rowlatt Act",
])
def test_usable_subject_accepts_good_topics(subject):
    assert q.usable_subject(subject) is True

def test_module_quality_counts_only_typed_questions():
    fact = lambda fid, subj: {"fact_id": fid, "subject": subj}
    module = {
        "inventory": [
            {"revision_facts": [fact("f1", "Tropic of Cancer")]},
            {"revision_facts": [fact("f2", "we say")]},
            {"revision_facts": [{"fact_id": "f3", "object": "no subject"}]},
        ],
        "questions": [
            {"evidence": {"fact_ids": ["f1"]}},
            {"evidence": {"fact_ids": ["f2"]}},
            {"evidence": {"fact_ids": ["f3"]}},
            {"evidence": {"fact_ids": []}},
        ],
    }
    result = q.module_quality(module)
    assert result == {"usable": 1, "questions": 2, "inventory": 3, "usable_rate": 0.5}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k "usable_subject or module_quality" -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ctet_subject_quality'`

- [ ] **Step 3: Implement `scripts/ctet_subject_quality.py`**

Port the rule exactly: strip quotes; reject empty, `> 45` chars, `> 6` words, any of `,;:=`, any verb/auxiliary from `{is, are, was, were, be, been, being, will, shall, would, should, can, could, may, might, must, has, have, had, do, does, did, means, mean, made, make, say, says, said, become, becomes, became}`, a leading pronoun/determiner from the spike's `PRON` set, a single lowercase word, or 3+ digits in a phrase longer than 3 words.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ctet_gate.py -k "usable_subject or module_quality" -v`
Expected: PASS (16 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/ctet_subject_quality.py tests/test_ctet_gate.py
git commit -m "feat: commit the usable-topic rule so quality numbers are auditable"
```

---

### Task 3: Gate API — keep files, gated source, audit manifest

**Files:**
- Modify: `scripts/ctet_source_gate.py` (add after `gated_text`, replace the CLI section)
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Produces: `KEEP_DIR: str` (`<repo>/data/ctet_gate`), `read_keep(path: str) -> list[int]`, `write_keep(chapter_id: str, numbers: list[int], meta: dict) -> None`, `load_keep(chapter_id: str) -> list[int] | None`, `gated_source(chapter_id: str, raw_text: str, chapter_title: str, book_title: str) -> str | None`, `record_result(chapter_id: str, questions: int, inventory: int) -> None`.
- `load_keep` resolves `os.path.join(KEEP_DIR, chapter_id + ".keep.txt")` at call time so tests can monkeypatch `KEEP_DIR`.
- `gated_source` returns `None` when no keep file exists. It raises `ValueError` when the file is empty or an index falls outside the prepared sentence list, with the message `"<id>: keep index <n> out of range (1..<total>)"`. Duplicates are deduplicated.
- Manifest shape: `{id: {"source": str, "title": str, "offered": int, "kept": int, "fingerprint": "sha256:<hex>", "questions": int, "inventory": int}}`; `fingerprint` is the SHA-256 of `"\n".join(sentences)` for the offered set.

- [ ] **Step 1: Write the failing test**

```python
import json, os
import pytest
import ctet_source_gate as gate

BODY = "One fact about maps. Another fact about the scale. A third fact about India."

def test_keep_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    gate.write_keep("ctet_x", [3, 1, 2, 3],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c"]})
    assert gate.load_keep("ctet_x") == [1, 2, 3]
    assert (tmp_path / "ctet_x.keep.txt").read_text().split() == ["1", "2", "3"]

def test_gated_source_returns_none_without_keep(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    assert gate.gated_source("ctet_x", BODY, "Chapter", "Book") is None

def test_gated_source_keeps_verbatim_sentences_in_order(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    gate.write_keep("ctet_x", [3, 1],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c"]})
    assert gate.gated_source("ctet_x", BODY, "Chapter", "Book") == "One fact about maps.\nA third fact about India."

def test_gated_source_allows_a_single_sentence(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    gate.write_keep("ctet_x", [2],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c"]})
    assert gate.gated_source("ctet_x", BODY, "Chapter", "Book") == "Another fact about the scale."

def test_gated_source_rejects_out_of_range(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    gate.write_keep("ctet_x", [4],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c"]})
    with pytest.raises(ValueError, match=r"ctet_x: keep index 4 out of range \(1\.\.3\)"):
        gate.gated_source("ctet_x", BODY, "Chapter", "Book")

def test_gated_source_rejects_empty_keep(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    (tmp_path / "ctet_x.keep.txt").write_text("\n")
    with pytest.raises(ValueError, match="ctet_x: keep file is empty"):
        gate.gated_source("ctet_x", BODY, "Chapter", "Book")

def test_record_result_updates_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    gate.write_keep("ctet_x", [1],
                    {"source": "a.pdf", "title": "T", "sentences": ["a"]})
    gate.record_result("ctet_x", questions=7, inventory=42)
    data = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert data["ctet_x"]["questions"] == 7 and data["ctet_x"]["inventory"] == 42
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k "keep or gated_source or record_result" -v`
Expected: FAIL with `AttributeError: module 'ctet_source_gate' has no attribute 'KEEP_DIR'`

- [ ] **Step 3: Implement the API in `scripts/ctet_source_gate.py`**

`write_keep` creates `KEEP_DIR`, writes sorted-deduplicated integers one per line, and upserts the manifest entry with `offered = meta["offered"]`, `kept = len(numbers)`, `fingerprint = "sha256:" + hashlib.sha256("\n".join(meta["sentences"]).encode()).hexdigest()`; `meta["sentences"]` is required. `record_result` reads-modifies-writes the manifest and is a no-op when the entry is absent.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ctet_gate.py -k "keep or gated_source or record_result" -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/ctet_source_gate.py tests/test_ctet_gate.py
git commit -m "feat: gate keep files, gated source and audit manifest"
```

---

### Task 4: Gate CLI and bullet-list splitting

**Files:**
- Modify: `scripts/ctet_source_gate.py` (replace `prepare_from_table`)
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Produces: `prepare_all(chapter_ids: list[str]) -> list[dict]` writing `output/ctet_gate/<id>.candidates.txt` and returning `{"id", "offered", "chars", "file"}` per chapter; CLI `python scripts/ctet_source_gate.py prepare [ids...]` (defaults to `all_chapters()`), `python scripts/ctet_source_gate.py import [ids...]`.
- `import` reads each `output/ctet_gate/<id>.keep.txt`, validates against a freshly prepared sentence list, calls `write_keep`, and prints `id kept/offered`.
- `-`, `–` and `—` followed by a space count as bullet markers, so coaching-note bullets become separate candidates.

- [ ] **Step 1: Write the failing test**

```python
def test_bullet_block_splits_per_bullet():
    text = ("Growth and Development\n"
            "- Piaget gave four stages of cognitive growth.\n"
            "- Vygotsky stressed language and social interaction.\n"
            "- Kohlberg studied stages of moral reasoning.")
    sentences = gate.split_sentences(gate.reflow(text, "Other Title", ""))
    assert sentences == ["Piaget gave four stages of cognitive growth.",
                         "Vygotsky stressed language and social interaction.",
                         "Kohlberg studied stages of moral reasoning."]

def test_prepare_all_writes_numbered_candidates(tmp_path, monkeypatch):
    monkeypatch.setattr(gate, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(gate, "chapter_source", lambda cid: (BODY, "Chapter", "Book"))
    rows = gate.prepare_all(["ctet_x"])
    assert rows[0]["offered"] == 3
    assert (tmp_path / "ctet_x.candidates.txt").read_text().splitlines()[1] == "2. Another fact about the scale."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k "bullet_block or prepare_all" -v`
Expected: FAIL (`prepare_all` missing; bullet test yields fewer than 3 sentences)

- [ ] **Step 3: Implement the CLI**

Rename the existing `GATE_DIR` to `OUTPUT_DIR`, make it monkeypatchable, and build `prepare_all` from `ctet_sources.all_chapters()`. `chapter_source` and `all_chapters` must be module-level names in `ctet_source_gate` (import them at the top) and called unqualified, so tests can monkeypatch them. Keep `split_sentences`' 25-character floor. Treat `-`, `–` and `—` followed by a space at line start as bullet markers, strip the marker from the emitted text, and make the bullet its own hard break; a bullet's continuation lines still join that bullet because buffering already continues until terminal punctuation.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ctet_gate.py -k "bullet_block or prepare_all" -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Prepare all 58 candidate lists**

Run: `python scripts/ctet_source_gate.py prepare`
Expected: 58 lines `id offered=… chars=…`, 58 files under `output/ctet_gate/`. Record the offered/size table for the final report.

- [ ] **Step 6: Commit**

```bash
git add scripts/ctet_source_gate.py tests/test_ctet_gate.py
git commit -m "feat: gate CLI prepares candidates for every bundled chapter"
```

---

### Task 5: Converters consume gated text

**Files:**
- Modify: `scripts/convert_ncert_ctet.py` (argparse, cache check, source selection), `scripts/convert_pedagogy_chapters.py` (same)
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Produces in each converter: `_should_process(out_file: str, force: bool, only: set[str], chapter_id: str) -> bool` and `_source_text(chapter_id: str, raw_text: str, title: str, book_title: str) -> tuple[str, bool]` where the flag is `used_gate`.
- CLI: `--force` (ignore cache) and `--only ctet_c6_ch01,ctet_c7_ch04` (restrict ids). No flags keeps today's cached-run behaviour.
- After each module is written the converter calls `gate.record_result(chapter_id, len(questions), len(inventory))` and prints `gated 96/299` or `raw (no keep file)` next to the chapter line.

- [ ] **Step 1: Write the failing test**

```python
def test_should_process_respects_cache_force_and_only(tmp_path):
    import convert_ncert_ctet as conv
    cached = tmp_path / "ctet_a.json"
    cached.write_text("{}", encoding="utf-8")
    assert conv._should_process(str(cached), force=False, only=set(), chapter_id="ctet_a") is False
    assert conv._should_process(str(cached), force=True, only=set(), chapter_id="ctet_a") is True
    assert conv._should_process(str(cached), force=False, only={"ctet_b"}, chapter_id="ctet_a") is False

def test_source_text_prefers_gated_when_keep_exists(tmp_path, monkeypatch):
    import convert_ncert_ctet as conv, ctet_source_gate as gate
    monkeypatch.setattr(gate, "KEEP_DIR", str(tmp_path))
    gate.write_keep("ctet_x", [2], {"source": "a.pdf", "title": "T", "sentences": gate.split_sentences(BODY)})
    text, used = conv._source_text("ctet_x", BODY, "Chapter", "Book")
    assert used is True and text == "Another fact about the scale."
    text, used = conv._source_text("ctet_y", BODY, "Chapter", "Book")
    assert used is False and text == BODY
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k "should_process or source_text" -v`
Expected: FAIL with `AttributeError: module 'convert_ncert_ctet' has no attribute '_should_process'`

- [ ] **Step 3: Implement**

Importing `convert_ncert_ctet` must not start a conversion: move the module-level `print`, worker spawn, and loop into `main(argv)`, guarded by `if __name__ == "__main__":`. Do the same for the pedagogy converter. Wire the two helpers into the loop and add the two flags.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ctet_gate.py -k "should_process or source_text" -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/convert_ncert_ctet.py scripts/convert_pedagogy_chapters.py tests/test_ctet_gate.py
git commit -m "feat: chapter converters can build from gated text"
```

---

### Task 6: Generate the 58 keep sets

**Files:**
- Create: `data/ctet_gate/<id>.keep.txt` ×58, `data/ctet_gate/manifest.json`
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Consumes: `output/ctet_gate/<id>.candidates.txt` from Task 4, `ctet_sources.all_chapters()`, `gate.write_keep`.

- [ ] **Step 1: Add the completeness test**

```python
def test_every_gated_set_has_a_well_formed_keep_file():
    import ctet_sources
    for chapter in ctet_sources.all_chapters():
        path = pathlib.Path("data/ctet_gate") / (chapter["id"] + ".keep.txt")
        numbers = [int(line) for line in path.read_text(encoding="utf-8").split()]
        assert numbers, chapter["id"]
        assert numbers == sorted(set(numbers)), chapter["id"]
        assert numbers[0] >= 1

def test_manifest_covers_every_keep_file():
    import ctet_sources
    manifest = json.loads(pathlib.Path("data/ctet_gate/manifest.json").read_text(encoding="utf-8"))
    assert set(manifest) == {c["id"] for c in ctet_sources.all_chapters()}
    for entry in manifest.values():
        assert entry["kept"] and entry["offered"] >= entry["kept"]
        assert entry["fingerprint"].startswith("sha256:")
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k "keep_file or manifest_covers" -v`
Expected: FAIL with `FileNotFoundError`

- [ ] **Step 3: Dispatch gate passes in batches of six, NCERT first**

For each batch, dispatch one subagent per chapter with the validated spike prompt: read `output/ctet_gate/<id>.candidates.txt`, keep only items that state a checkable fact about the subject, drop questions/instructions, headings, tables of contents, timeline and figure dumps, fragments, narrative filler and meta-commentary about the book, write ascending numbers one per line to `output/ctet_gate/<id>.keep.txt`, and report kept/dropped plus up to six polluted-but-valuable items. Batches: `c6_ch01–06`, `c6_ch07–12`, `c6_ch13–14 + c7_ch01–04`, `c7_ch05–10`, `c7_ch11–16`, `c7_ch17–20 + c8_ch01–02`, `c8_ch03–08`, `c8_ch09–14`, `c8_ch15 + ped_ch01–05`, `ped_ch06–09`.

- [ ] **Step 4: Import and validate**

Run: `python scripts/ctet_source_gate.py import`
Expected: 58 lines `<id> kept/offered`; aborts naming any out-of-range index. Then run `python -m pytest tests/test_ctet_gate.py -k "keep_file or manifest_covers" -v` → PASS.

- [ ] **Step 5: Report the gate coverage**

Report per chapter: offered, kept, kept share, and the five lowest kept shares. Anything under 15% is a signal the gate starved the chapter — re-run that chapter's pass with a less strict instruction before moving on.

- [ ] **Step 6: Commit**

```bash
git add data/ctet_gate tests/test_ctet_gate.py
git commit -m "feat: gate decisions for all 58 bundled chapter sets"
```

---

### Task 7: Snapshot, regenerate, publish, rebuild

**Files:**
- Modify: `pwa/sw.js` (cache name), `pwa/ctet_index.js`, `pwa/ctet_manifest.js`, `pwa/ctet/*.json` (generated), `www/**` (generated)
- Test: existing suites

- [ ] **Step 1: Snapshot today's module output**

Copy `output/ctet_modules` to `%LOCALAPPDATA%\Temp\opencode\ctet_modules_before_gate\`. This is the "before" fixture for Task 8 and the rollback point.

- [ ] **Step 2: Regenerate the 49 NCERT chapters from gated text**

Run: `python scripts/convert_ncert_ctet.py --force --only ctet_c6_ch01,ctet_c6_ch02,ctet_c6_ch03,ctet_c6_ch04,ctet_c6_ch05,ctet_c6_ch06,ctet_c6_ch07,ctet_c6_ch08,ctet_c6_ch09,ctet_c6_ch10,ctet_c6_ch11,ctet_c6_ch12,ctet_c6_ch13,ctet_c6_ch14,ctet_c7_ch01,ctet_c7_ch02,ctet_c7_ch03,ctet_c7_ch04,ctet_c7_ch05,ctet_c7_ch06,ctet_c7_ch07,ctet_c7_ch08,ctet_c7_ch09,ctet_c7_ch10,ctet_c7_ch11,ctet_c7_ch12,ctet_c7_ch13,ctet_c7_ch14,ctet_c7_ch15,ctet_c7_ch16,ctet_c7_ch17,ctet_c7_ch18,ctet_c7_ch19,ctet_c7_ch20,ctet_c8_ch01,ctet_c8_ch02,ctet_c8_ch03,ctet_c8_ch04,ctet_c8_ch05,ctet_c8_ch06,ctet_c8_ch07,ctet_c8_ch08,ctet_c8_ch09,ctet_c8_ch10,ctet_c8_ch11,ctet_c8_ch12,ctet_c8_ch13,ctet_c8_ch14,ctet_c8_ch15`
Expected: 49 lines, each showing `gated <kept>/<offered>` and a question count. No line may say `raw (no keep file)`.

- [ ] **Step 3: Regenerate the 9 pedagogy chapters**

Run: `python scripts/convert_pedagogy_chapters.py --force --only ctet_ped_ch01,ctet_ped_ch02,ctet_ped_ch03,ctet_ped_ch04,ctet_ped_ch05,ctet_ped_ch06,ctet_ped_ch07,ctet_ped_ch08,ctet_ped_ch09`
Expected: 9 lines with `gated …`. Inspect the first chapter's questions for pedagogy-shaped junk; if the splitter clearly failed (whole bullet blocks as single candidates), stop and fix Task 4's splitter before publishing.

- [ ] **Step 4: Bump the service worker cache name**

Change `CACHE_NAME` in `pwa/sw.js` from `studysynth-v33` to `studysynth-v34`.

- [ ] **Step 5: Rebuild the web bundle**

Run: `node scripts/build-web.js`
Expected: finishes without error and reports the copied asset count.

- [ ] **Step 6: Verify the payload**

Run: `python -m pytest tests/ -q`
Expected: all tests pass. Then confirm 70 sets and unchanged paper sets:

```bash
node -e "const f=require('fs');const s=f.readFileSync('pwa/ctet_index.js','utf8');const i=JSON.parse(s.match(/CTET_INDEX = (\[[\s\S]*?\]);/)[1]);console.log('sets',i.length,'questions',i.reduce((a,x)=>a+x.questionCount,0));console.log('pyq',i.filter(x=>x.id.includes('pyq')).map(x=>x.id+':'+x.questionCount).join(' '))"
```

Expected: `sets 70`; the 12 `pyq` entries keep their previous counts (470 total).

- [ ] **Step 7: Commit**

```bash
git add pwa/sw.js pwa/ctet_index.js pwa/ctet_manifest.js pwa/ctet
git commit -m "feat: rebuild bundled chapters from AI-selected source text"
```

---

### Task 8: Before/after report

**Files:**
- Create: `scripts/ctet_gate_report.py`
- Test: `tests/test_ctet_gate.py`

**Interfaces:**
- Produces: `compare(before_dir: str, after_dir: str, ids: list[str]) -> list[dict]` returning `{"id", "before", "after"}` where each side is `module_quality`'s dict; CLI `python scripts/ctet_gate_report.py <before_dir> <after_dir>` printing a table and totals.

- [ ] **Step 1: Write the failing test**

```python
def test_compare_pairs_before_and_after_modules(tmp_path):
    import json
    import ctet_gate_report as rep
    before = tmp_path / "before"; after = tmp_path / "after"
    before.mkdir(); after.mkdir()
    module = {"inventory": [{"revision_facts": [{"fact_id": "f1", "subject": "we say"}]}],
              "questions": [{"evidence": {"fact_ids": ["f1"]}}]}
    (before / "ctet_x.json").write_text(json.dumps(module), encoding="utf-8")
    module["inventory"][0]["revision_facts"][0]["subject"] = "Tropic of Cancer"
    (after / "ctet_x.json").write_text(json.dumps(module), encoding="utf-8")
    rows = rep.compare(str(before), str(after), ["ctet_x"])
    assert rows[0]["before"]["usable"] == 0 and rows[0]["after"]["usable"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ctet_gate.py -k compare_pairs -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ctet_gate_report'`

- [ ] **Step 3: Implement the report**

Print columns: `id`, `questions before→after`, `usable before→after`, `rate before→after`, `inventory before→after`. Print totals and the five chapters with the largest usable-count drop. Missing files are listed as `missing` and do not abort.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ctet_gate.py -k compare_pairs -v`
Expected: PASS

- [ ] **Step 5: Produce the real report**

Run: `python scripts/ctet_gate_report.py "$env:LOCALAPPDATA\Temp\opencode\ctet_modules_before_gate" output/ctet_modules`
Expected: 58 rows plus totals. Report the table, the totals, and the honest caveat that usable counts may fall in some chapters by design.

- [ ] **Step 6: Commit**

```bash
git add scripts/ctet_gate_report.py tests/test_ctet_gate.py
git commit -m "feat: before/after quality report for gated chapters"
```

---

### Task 9: End-to-end verification

**Files:** none created; verification only.

- [ ] **Step 1: Run every suite**

Run: `python -m pytest tests/ -q` then `npm test --prefix pwa`
Expected: all green. Record the exact counts.

- [ ] **Step 2: Confirm the offline manifest matches disk**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('pwa/ctet_manifest.js','utf8');const m=JSON.parse(t.slice(t.indexOf('= ')+2).trim().replace(/;$/,''));console.log(m.length, m.filter(p=>!fs.existsSync('pwa/'+p)).length)"`
Expected: `70 0`

- [ ] **Step 3: Serve the built bundle with a threaded server**

Run: `python -c "import http.server,socketserver,functools;socketserver.ThreadingTCPServer(('127.0.0.1',8100),functools.partial(http.server.SimpleHTTPRequestHandler,directory='www'),bind_and_activate=True).serve_forever()"` in the background from the repo root. Stop any earlier server on that port first (`Get-NetTCPConnection -LocalPort 8100` then `Stop-Process`).
Expected: serves `www` on `http://127.0.0.1:8100`; a single-threaded server must not be used.

- [ ] **Step 4: Verify in the browser**

Clear IndexedDB, `localStorage` and the service worker, reload, then check: Library lists 3 subjects and 70 sets; opening a rebuilt chapter loads its body; a practice question shows a readable topic and its evidence quote matches the textbook; Revision shows items with source references; a solved-paper set still shows its questions; the service worker reports 99 cached entries (29 core + 70 bodies); no console errors.

- [ ] **Step 5: Confirm nothing outside the 58 changed**

Diff `output/ctet_modules` against the Task 7 snapshot for the 12 `ctet_pyq_*` files: byte-identical. Report any other unexpected file differences.

- [ ] **Step 6: Commit any verification-only fixes, otherwise stop**

If verification found no defects, no commit is needed. Report the results, including which checks passed and any limitation observed.
