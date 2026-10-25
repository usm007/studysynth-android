# STUDYSYNTH REPAIR 002 — Repair Report

**Status: implementation + regression tests complete, Phase 8 re-run
inspected, and PUSHED to GitHub main on 2026-10-25 as commit
`00a79d50dd6e2f67891990e236c489b83ef39705` ("fix(engine): repair
production pipeline integrity and regenerate NCERT Class 8 banks
(Repair 002)"), on top of remote main `2e5442b`. Phase 8 final: 132
questions (120 production + 12 V2), with the targeted defects gone —
no truncated multi-statement stems, no figure-reference or running
title excerpts, no merged numeric answers, and no fragment V2
distractors in the final scan. V2 counts fell honestly (40 → 12;
hees203 and hees209 have 0 V2) rather than by lowering validation.
No history was rewritten and no force-push was used.**

## Starting and ending state

- Starting commit (cloned, clean tree): `75706893a3c566bf7197d61e90a14e401e46953a`
  (`fix(engine): repair page boundaries, subject quality, and reasoning
  validation (Repair 001)`, branch `main`, remote `origin`
  `https://github.com/usm007/studysynth-android.git`)
- Ending state: **pushed to main** as commit
  `00a79d50dd6e2f67891990e236c489b83ef39705` on 2026-10-25, on top of
  remote main `2e5442b` (the NCERT folder commit). No history rewrite,
  no force-push was performed. The files below were the files in that
  commit (plus the report itself, updated to record the push).

## Files changed

- `pwa/engine/pdfParser.js` — Phase 2: single shared geometry-aware layout
  extractor `extractLayoutFromTextContent(content, pageNumber, viewport)` and
  `extractPageLayout(page, pageNumber)`, exposed via `OfflineDocParser`.
  Uses real PDF.js text content + viewport geometry (bottom-up transform to
  top-down bbox), median-height line tolerance `max(2.5pt, 0.4 × median
  height)`, horizontal-gap line segmentation, dynamic gutter
  (>=4% page width, >=3 blocks each side, <=15% crossing), heading /
  caption / table / diagram / page_furniture / fragment / ambiguous
  classification (conservative: unclassifiable blocks become `ambiguous`,
  never merged into body prose), reading order (full-width headings in
  geometric segments, then left, then right, then full-width concluding
  content), `==Page N==` serialisation of body + heading blocks with blank
  lines between paragraphs. `extractWithPdfJs()` now uses it. Fallback
  rule fixed: a successfully parsed selectable-text PDF with any accepted
  body text does NOT fall back to the unstructured extractor merely because
  the text is short; fallback is only for actual primary failure or zero
  accepted body text, and fallback output is marked low-confidence
  (`fallbackUsed`, `lowConfidence`, diagnostics). `loadPdfJs()` no longer
  crashes in Node on `document.baseURI` and no longer caches a rejected
  loader.
- `pwa/engine/generator.js` — Phase 3: `parseRawDocument()` blank lines
  flush paragraphs, page markers flush paragraph + section and update page
  metadata, headings flush sections; section text joins paragraphs with
  blank lines and each section now also carries `paragraphMeta`
  (`{text, page, title}` per paragraph); wrapped lines stay connected.
  Phase 4: `classifySentenceRole(text)` exported (shared mirror of
  `ReasoningLinguistics.classifySentenceRole`; the generator prefers the
  shared V2 implementation when available). `parseFactRelations()` and
  `extractSourceFacts()` gate on sentence role before any factual
  extraction; non-assertion units produce no facts and no fallback facts.
  Facts and sentence units carry `sentence_role`. Phase 4 causal fix:
  `parseCause()` no longer treats bare supports / helps / allows / makes /
  affects as direct CAUSES; only two narrow causative constructions remain
  (`allows` + infinitive effect clause, `makes` + base-verb effect clause,
  cause -> effect order preserved). This preserves the existing Fixture C
  (`allows … to move more easily`) while satisfying the spec's
  "not automatically" rule. Phase 5: `generateQuestionBank()` no longer
  merges raw `ReasoningV2.generateReasoningCandidates(graph, context)`;
  it calls `ReasoningV2.generateReasoningQuestionBank(sectionsForV2,
  {facts, targetCount})`, then runs every returned candidate through
  existing production `validateQuestion()` as well, so only candidates
  passing BOTH V2 proof validation and production validation publish.
  Evidence/source metadata are preserved as returned; V2 exceptions are
  recorded as `v2Failed` / `v2Error` / `v2Generation` in generation
  metrics and as `v2_error` in rejection counts, never silently swallowed.
  Metrics now report `totalCandidates` (production + V2),
  `productionCandidates` and `v2Candidates` separately.
- `pwa/engine/reasoning/linguistics.js` — Phase 4: `classifySentenceRole`
  exported, with the spec's deterministic rules: terminal `?` (including
  following closing quotes/brackets) = interrogative; initial
  what/who/whom/whose/which/when/where/why/how or auxiliary-verb openings
  = interrogative (with a subordinate-clause exception: a when/where/why/
  how sentence with a comma followed by a main clause, e.g.
  "When light intensity increases, the rate … increases.", is an
  assertion — without this exception the existing V2 Suite 4 sample lost
  propositions and its count fell from 5 to 2); initial imperatives
  (consider, imagine, take, look at, observe, discuss, think about,
  explain, compare, answer, try, use, draw, write, describe, suppose,
  assume) = instruction, checked before interrogative words so
  "Explain why …" is an instruction; fragments / prompt-like text /
  unclear roles = ambiguous (including a 3-word fragment rule that
  distinguishes "Map of India" from "Rain helps farmers." /
  "The river floods.").
- `pwa/engine/reasoning/representation.js` — Phase 4: re-exports
  `classifySentenceRole`; `compileSemanticRepresentation()` skips
  non-assertion sentences before causal / conditional / comparative /
  definition / sequence / exception extraction, tags fresh propositions
  with `sentence_role`, and does not bridge existing facts explicitly
  tagged with a non-assertion role. Its causal verb list already excluded
  supports / helps / allows / makes / affects, so no change was needed
  there; that was verified, not assumed.
- `pwa/engine/worker.js` — Phase 6: `importScripts()` now loads the full
  Reasoning V2 chain in dependency order before `generator.js` /
  `analyze.js`, exactly once.
- `pwa/index.html` — Phase 6: the same 10 reasoning scripts, in dependency
  order (Types -> Linguistics -> Representation, Graph, Distractors ->
  Operators -> Constructors -> Validator -> Ranking -> Engine V2),
  inserted before `generator.js`, each exactly once.
- `pwa/sw.js` — Phase 6: cache version bumped `studysynth-v36` ->
  `studysynth-v37`; all 10 reasoning modules added to `CORE_ASSETS`.
- `pwa/tests/batch_generate_all_ncert.js` — Phase 2: the duplicate
  `extractPageLayoutText()` / `buildBlockParagraphs()` implementation was
  deleted and replaced with a thin wrapper calling the shared
  `Parser.extractPageLayout()`. Source directory is now configurable via
  `NCERT_PDF_DIR` (Windows default kept). Report header updated to
  Repair 002. Safety fix found during Phase 8: the manifest is no longer
  overwritten when every chapter is skipped (an all-skipped run previously
  overwrote `summary_manifest.json` with `[]`; the file was restored from
  git during this work and the fix prevents recurrence).
- `pwa/tests/test_integration.js` — Phase 6: the worker assertion that
  required the exact two-file `importScripts('./generator.js',
  './analyze.js')` was replaced with an ordered-chain assertion that
  still requires the real engine and shared analysis, plus all reasoning
  modules in order. This is a strengthening, not a weakening, of the test.
- `pwa/tests/test_repair002.js` — NEW, Phase 7 regression tests (see below).
- `pwa/package.json` — `npm test` now also runs `test_repair002.js`.

No other files were changed. In particular, the staged bank files under
`pwa/data/ncert_8_2_staged/` were NOT edited, and no generated question
text was manually edited.

## Tests executed and actual results

Baseline (before any edit, `npm test` in `pwa/`): all 5 existing suites
passed, 0 errors (engine, integration, processing, revision,
Reasoning V2). No pre-existing failures were found in those suites.

After implementation, `npm test` in `pwa/` (exit 0):

- `test_engine.js` — ALL PASSED, including Fixture C (allows-infinitive)
  and Repair 001 Test 16.
- `test_integration.js` — ALL PASSED (0 errors), after the worker-chain
  assertion update described above. Before that update, Test 6 failed
  only on the exact two-file import string, because the worker now
  correctly loads the reasoning chain first; no other assertion failed.
- `test_processing.js` — ALL PASSED (0 errors).
- `test_revision.js` — ALL PASSED.
- `test_reasoning_v2.js` — ALL PASSED (0 errors); Suite 4 determinism
  restored to 5 identical verified questions after the subordinate-clause
  exception (see linguistics note above; it transiently fell to 2 while
  the exception was missing, which is how the defect was caught).
- `test_repair002.js` — NEW, **40 checks + 3 end-to-end checks, all passed**:
  PDF layout (two-column reading order, full-width heading + two
  columns, diagram/map labels, captions + headers/footers, paragraph
  across visual lines, ambiguous block preserved, structured-output
  shape); paragraph boundaries (separate paragraphs, heading flush,
  page-marker flush + page metadata, line wrap, plain text + Markdown);
  sentence-role (all spec examples, missing-question-mark interrogatives,
  subordinate-clause assertion, ambiguous fragments, causal-verb
  questions, supports/helps/affects not causation, allows-infinitive
  preserved); V2 integration (validated API used, raw-candidate merge
  removed, production-rejected candidates not published, forced V2
  failure recorded as `v2Failed`/`v2Error` while production questions
  still publish, deterministic output, browser/worker load order,
  service-worker cache, batch shared-parser use); end-to-end through
  the real parser API (a handcrafted PDF parsed by the bundled PDF.js
  vendor build through `extractTextFromPDFDetailed`, a short selectable
  PDF with no unstructured fallback, and a real worker `generate` job
  through the `importScripts` chain in a vm context).

Browser / worker verification (not Node-only):

- Browser-style global loading: scripts were loaded in a Node `vm`
  context with no CommonJS `module`/`require` and with `window` set, in
  index.html order. Result: `StudySynthReasoningV2`,
  `StudySynthEngine` (with `ReasoningV2` present) and
  `StudySynthAnalysis` were all present, and `analyzeSource()` on a
  causal sample produced questions. This verifies load order and global
  capture, which CommonJS tests cannot.
- Worker initialisation: `worker.js` was loaded in a `vm` context with
  a fake `importScripts`/`self`, then a real `generate` job was sent.
  Result: a `result` message was posted with questions and generation
  metrics through the shared analysis pipeline.
- Offline assets: `sw.js` CORE_ASSETS now includes all 10 reasoning
  modules, each verified to exist on disk, under cache `studysynth-v37`.
  A real browser service-worker install was NOT run in this environment
  (no live browser is available to a subagent); offline caching is
  verified by asset list + on-disk existence + the vm loading checks,
  not by a browser install test. That is a remaining verification gap
  for the parent agent if it has browser access.

## Phase 8 — Regeneration: first attempt BLOCKED, second attempt RAN but NOT CLEAN

### Update 2026-10-25: regeneration ran from the other branch — banks are not clean, do NOT push yet

Source: the 8 PDFs were found not on `main` but on
`origin/fix/repair-002-semantic-integrity` at
`554acc5a279730752d3bfe5357d12a7bd3bd6e24` ("chore(repo): add NCERT Class 8.2
source PDFs"). They were extracted with `git show <branch>:NCERT/<file>` into
`~/workspace/ncert_pdfs` (outside the working tree, so the uncommitted
Repair 002 changes were untouched; no branch checkout was performed).
Verified: all 8 files, total 47,238,228 bytes, each starting `%PDF-1.6`.

Run: `NCERT_PDF_DIR=/home/hatch/workspace/ncert_pdfs node
tests/batch_generate_all_ncert.js` from `pwa/`, exit 0, no chapters skipped.

Per-chapter regenerated counts (all 8, from `summary_manifest.json`):

- hees201 World Geography: 34/34 pages, 15 production + 5 V2 = 20
- hees202 India's Road to Independence: 50/50 pages, 15 + 5 = 20
- hees203 Journey Through Indian Architecture: 40/40 pages, 15 + 5 = 20
- hees204 Judiciary in Our Society: 18/18 pages, 15 + 5 = 20
- hees205 Citizenship Rights and Duties: 23/24 pages, 15 + 5 = 20
- hees206 Dynamics of Population: 24/24 pages, 15 + 5 = 20
- hees207 India's Urban Landscape: 23/24 pages, 15 + 5 = 20 (was 24/24 in
  Repair 001; one page now dropped by the kept `>30` character page filter)
- hees209 Cultural Currents 13th–17th Centuries: 35/35 pages, 15 + 5 = 20

Total: 160 questions (120 production + 40 V2). Structural check (all 8
files): every question has 4 options, exactly 1 marked correct, 0 duplicate
stems per file. No supporting excerpt ends with `?`, and no excerpt starts
with an instruction verb, in this regeneration — the specific
interrogative/instruction-as-statement corruption from Repair 001 was not
found in the same form.

Rejection metrics, obtained by re-running `analyzeSource` with the same
extraction (the batch script itself does not print them): production
generation, all chapters combined, 650 total candidates, 120 accepted,
530 rejected (total − accepted). Per chapter: hees201 103/15/88, hees202
109/15/94, hees203 59/15/44, hees204 75/15/60, hees205 75/15/60, hees206
76/15/61, hees207 72/15/57, hees209 81/15/66 (totalCandidates / accepted /
rejected). `v2Failed: false` for all chapters. The returned
`rejectionCounts` keys (e.g. `unsupported_facts`, `missing_options`,
`target_limit`) are build-stage counts as returned by the generator and
do not sum to the candidate totals, so they are not summed here; they are
recorded in `/tmp/metrics_phase8.json` from the metrics run, not in the
repository.

Inspection defects found — these are why the banks must NOT be pushed as
clean, despite the green test suite:

1. **Truncated `multi_statement` stems (9 questions, one in every chapter
   except hees204 which has 2).** Subtype `multi_statement`, options are
   only "1 only / 2 only / Both 1 and 2 / Neither 1 nor 2", but the stem
   never lists statements 1 and 2. Examples: hees201 Q-P1-007 "Consider
   the following statements based on What are the unique physical:";
   hees202 Q-P2-008 "Consider the following statements based on What
   issues did the leading freedom:"; hees204 Q-P4-013 "Consider the
   following statements based on Why is it important for a just and
   harmonious Society? 3. What is the structure and role of the judiciary
   in India? 4. What are the alternative:" — i.e. chapter learning
   objectives merged into a stem and cut off. A student cannot answer
   these from the stem alone; the explanation refers to statements that
   are not presented.
2. **All 40 V2 items are `causal_reasoning`, and most have nonsensical
   stems.** Examples: hees201 Q-C1-001 "what causal mechanism directly
   produces the monsoon in the Gangetic Plains?" with correct answer
   "Human lives" — the excerpt itself says the Southern Indian Ocean
   influences the monsoon, not human lives; hees201 Q-C1-002 "produces us
   to gauge size, shape, location, and distance across the whole world?";
   hees207 "produces of the?"; hees204 "produces if needed?". The V2
   causal extraction is picking the wrong subject/effect from real
   textbook sentences, and both V2 proof validation and production
   validation let these through because they are internally consistent
   with the (wrong) extracted proposition.
3. **Every V2 item (40/40) carries the same malformed distractor:**
   "It operates independently without influencing <fragment>" (e.g.
   "… without influencing It", "… without influencing to", "… without
   influencing The Bay of Bengal"). This is a systematic V2 distractor
   defect, not a one-off.
4. **Page-furniture / fragment facts still leak through in places.**
   hees202 Q-P2-005 is a `fill_blank` whose excerpt and answer are
   "Exploring Society: India and Beyond | G rade 8 Part 2 launched in
   1906." — a book-title line (with "G rade" split by layout) merged
   with an unrelated year. hees202 Q-P2-009's correct answer is
   "1908, two young members" (not a number) with offset distractors
   "1,907 two young members" etc. hees204 Q-P4-013's excerpt is the
   fragment "The Judiciary is the institution which".
5. **Figure references remain in 2 excerpts** (not pure captions):
   hees201 "(Fig. 1.8)" in the Great Barrier Reef sentence and hees203
   "(Fig. 3.35)" in the red-sandstone sentence. These are body sentences
   that mention a figure, so they are less severe than a caption used as
   evidence, but they are still figure-dependent evidence.

Consequence: **Definition of Done is NOT met.** The repaired pipeline
ran end-to-end and hit its target counts, and `npm test` passes (see
below), but a green test suite without clean generated output is not
sufficient, per the specification. The remaining work is generator/V2
defects — multi-statement stem construction, V2 causal subject/effect
extraction, the `extended_speculation` distractor template, and
fragment/page-furniture facts — not another PDF upload. No staged bank
was manually edited to hide any of this.

### Phase 8 fix + re-run, 2026-10-25 (user-authorised fix, then re-run)

Fixes made in production code only; no staged bank was manually edited:

- **Multi-statement:** generator stem is now exactly "Consider the
  following statements:" (no section title, so no truncated learning
  objective), and the batch markdown report now prints the two
  statements and the prompt suffix, as the app renderer already did.
  Final scan: 1 multi-statement question per chapter, 0 stems with
  "based on", each with 2 statements printed.
- **Causal clause boundary:** `cleanFactSubject` and `parseCause` now
  work on the clause after the last semicolon / "for instance", so
  "Human lives are ...; for instance, the distant Southern Indian
  Ocean influences the monsoon" now gives the Southern Indian Ocean
  as the cause, not Human lives. Operator B also rejects a cause that
  does not co-occur in the causal clause of the excerpt.
- **Fragment / compound / pronoun causal arguments:** causal subjects
  and effects that are bare pronouns, preposition phrases, dangling
  fragments, pronoun clauses ("it has sunny weather"), compound
  predicates ("climate, and is home to a variety"), heading subjects
  ("Water towers: Mountains"), naming explanations ("is called ...
  because ..."), or sentence-long arguments (>12 words, second
  sentences, list markers) are rejected in production extraction,
  Operator B, and the V2 validator.
- **Temporal conditionals are not causal mechanisms:** production
  "When X, Y" / "If X, Y" facts are now bridged to CONDITIONAL_ON,
  not CAUSES, so Operator B cannot turn "When the work was nearly
  done, a reporter asked ..." into "the work causes a reporter ...".
  Operator D direction was also corrected (outcome conditional on
  condition, not the converse), and `parseConditional` now requires a
  full clause condition (≥3 words), so "When senior Congress leaders
  were arrested, she hoisted ..." now gives the complete stem "what
  happens when senior Congress leaders were arrested?" instead of
  "what happens when senior Congress leaders?", and a proper name
  before an appositive comma ("When Muhammad Iqbal, a philosopher
  ...") is no longer treated as a condition.
- **Numeric:** a comma followed by a word ("1908, two young members")
  is no longer a clean quantity, so that merged year + count fact is
  gone; "2,000 km" (comma followed by a digit) still works.
- **Running titles:** the PDF parser now treats a segment starting
  with a running book title as page furniture wherever it sits, not
  only in the extreme margin (NCERT footers sit at ~83% page height),
  and production extraction and validation also reject running-title
  sentences. Extracted characters fell accordingly (e.g. hees202
  79,127 → 76,261 in the first re-run, before the later gates).
- **Figure references:** production and V2 validation now reject
  excerpts containing "(Fig." / "Fig. N" / "Figure N" as non-standalone
  evidence.
- **Distractors:** V2 distractors with a fragment object ("without
  influencing It / to / of the", marker-start "Æ ...", or a dangling
  modal "… division would") are rejected, and production causal
  distractors from the source pool are filtered the same way.

Regression tests: Repair 002 tests grew from 40 + 3 end-to-end to
**50 checks + 3 end-to-end**, all passing, and the full `npm test`
suite passes (exit 0). Note: V2 Suite 4 determinism now reports 4
identical questions instead of 5 in one earlier run, because one
previously accepted candidate is now rejected by the stricter gates
— that is the intended behaviour, not a failure.

Final re-run (same PDFs, same batch command, exit 0):

- hees201: 34/34 pages, 15 production + 2 V2 = 17
- hees202: 50/50 pages, 15 + 2 = 17
- hees203: 40/40 pages, 15 + 0 = 15
- hees204: 18/18 pages, 15 + 2 = 17
- hees205: 23/24 pages, 15 + 1 = 16
- hees206: 24/24 pages, 15 + 3 = 18
- hees207: 23/24 pages, 15 + 2 = 17
- hees209: 35/35 pages, 15 + 0 = 15
- **Total: 132 questions (120 production + 12 V2), down from 160.**
  The drop is entirely in V2 (40 → 12); production stayed at 15 per
  chapter. Per the specification, fewer questions are correct when
  the source does not support enough safe ones.

Final inspection scan (all 8 files): 0 figure-reference excerpts,
0 running-title excerpts, 0 multi-statement stems with "based on",
0 merged numeric answers, 0 V2 distractors with a bare fragment
object. The monsoon V2 item now answers "the distant Southern Indian
Ocean". Remaining known limitations (not hidden): V2 stems remain
templated and a few are still loose phrases ("walkability and
integrates", "their urbanisation", "involving many thousands of
personnel") — they are short concepts with supporting excerpts, not
the truncated/wrong/fragment defects listed above; hees203 and
hees209 have no V2 items at all under the stricter gates; production
distractor pools outside the causal pool can still be loose (e.g.
comparison distractors in hees209), which is pre-existing generator
style, not the Phase 8 corruption. No bank was manually edited.

### Original first attempt (kept for history)

Attempted: `NCERT_PDF_DIR=/tmp/nonexistent-ncert node
tests/batch_generate_all_ncert.js` and the default Windows path.

Result: **all 8 chapters skipped** — `[SKIP] Missing file:` for
`hees201.pdf` through `hees207.pdf` and `hees209.pdf`. The source PDFs
are not in the repository and are not present anywhere under
`/home/hatch` (searched with `find` for `hees*.pdf`). The batch script
hardcodes `C:/Users/Admin/Desktop/NCERT/8.2` by default; the new
`NCERT_PDF_DIR` override makes the script runnable on Linux, but it
cannot conjure the textbooks.

Consequences, stated plainly:

- **Per-chapter regenerated counts for Repair 002: 0 for all 8 chapters.
  No Repair 002 bank was generated, and no rejection counts/reasons for
  a Repair 002 regeneration exist, because no regeneration ran.**
- The files still in `pwa/data/ncert_8_2_staged/` are the Repair 001
  outputs. Their Repair 001 manifest counts are 15 production + 5 V2 =
  20 per chapter, 160 total, across: hees201 World Geography,
  hees202 India's Road to Independence, hees203 Journey Through Indian
  Architecture, hees204 Judiciary in Our Society, hees205 Citizenship
  Rights and Duties, hees206 Dynamics of Population, hees207 India's
  Urban Landscape, hees209 Cultural Currents 13th–17th Centuries.
  **These are NOT Repair 002 outputs and must not be presented as such.**
- Inspection of those 8 existing files (all 8, not just the first) still
  shows the corruption Repair 002 is meant to remove, for example:
  figure captions inside evidence (`(Fig. 1.19)`, `(Fig. 1.8)`),
  merged timeline fragments used as a single distractor/answer in
  hees202 (a whole chronology from 1935–1947 joined into one option),
  merged chart text in hees206, interrogatives used as statements
  (e.g. "What are the unique physical features of the continents?" and
  "how will you manage to carve arched beams into …" appearing as
  supporting excerpts for statements), and instructions used as
  statements ("Take an orange; imagine that shape …"). This confirms
  the need for regeneration once sources are available; it does not
  mean the repaired pipeline produced these — it did not run on them.
- To complete Phase 8, the parent agent must supply the 8 source PDFs
  (hees201, hees202, hees203, hees204, hees205, hees206, hees207,
  hees209) in a directory and run:
  `NCERT_PDF_DIR=<dir> node pwa/tests/batch_generate_all_ncert.js`
  from `pwa/`, then inspect the regenerated staged files before
  committing/pushing. No manual editing of generated question text was
  done, and none should be done as a substitute for regeneration.

Sample pipeline rejection metrics (for transparency, NOT bank counts):
on a 6-fact science sample through `analyzeSource`, generation reported
34 total candidates (30 production + 4 V2), 6 accepted, 28 rejected
(`stem_relation`: 3, `duplicate_relation`: 25), `v2Failed: false`,
V2 generation 4/4 validated. On a 4-fact causal sample: 12 total
candidates (4 production + 8 V2), 6 accepted, 6 rejected
(`multi_missing`: 1, `stem_relation`: 6), V2 8/8 validated. On a mixed
sample containing an interrogative, an instruction, a causal assertion
and supports/helps assertions: 3 facts, 2 questions, 1 rejected, and
no causal fact from the interrogative, instruction, supports or helps
sentences.

## Remaining known limitations

1. Phase 8 regeneration was re-run after the fixes above, and the
   targeted defects are gone on inspection (see Phase 8 fix + re-run).
   The remaining limitations are: hees203 and hees209 have no V2 items
   under the stricter gates, a few V2 stems remain templated phrases,
   and production distractor pools outside the causal pool can still
   be loose. The repair was committed and pushed to main on 2026-10-25
   as `00a79d5` (see status at the top); a follow-up commit updating
   this report to record the push followed.
2. Real-browser service-worker install / offline page load was not
   tested (no live browser for a subagent); see browser/worker section.
3. The layout extractor is heuristic: table detection requires runs of
   >=2 bands with >=3 segments; single-row tables, complex multi-column
   tables and rotated text may be classified as fragment/ambiguous
   rather than table, which is conservative (excluded from body prose)
   but may under-extract some tabular content.
4. Sentence-role classification is deterministic and rule-based, not
   linguistic parsing: it handles the spec's cases and the
   subordinate-clause exception, but unusual constructions (e.g.
   questions with heavy comma punctuation and no question mark) may
   still be misclassified; such units fall back to ambiguous only when
   the fragment rules trigger, otherwise they are treated as assertions
   and must still pass production/V2 validation.
5. `allows` and `makes` retain narrow causative exceptions (see
   generator note). A bare "X supports Y", "X helps Y" or "X affects Y"
   never becomes CAUSES, but "X allows Y to …" and "X makes Y …"
   (with a >=3-word effect clause) do. If a stricter reading is wanted,
   those two exceptions can be removed at the cost of breaking the
   existing Fixture C test, which asserts the allows-infinitive case.
6. V2's proposition deduplication in `representation.js` keys existing
   facts by id but checks extracted propositions by
   subject|relation|object, so an extracted duplicate of a legacy fact
   is not suppressed by that check (pre-existing, out of Repair 002
   scope; candidate selection still deduplicates by relation key).
7. The batch script's per-page `>30` character filter for pages was
   kept (it is a page-inclusion filter, not the PDF fallback rule);
   diagram-only pages with very little body text will still be dropped
   from a chapter's raw text, and will be visible as a lower
   pages-processed count in the batch log.
