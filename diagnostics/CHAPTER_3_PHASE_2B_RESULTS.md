# StudySynth Phase 2B — Chapter 3 Results: Layout-Aware Source Reconstruction and Knowledge Recovery

Version: `phase2b-1`. Baseline: remote main `59e53722` (Phase 2A).
This is STILL a shadow pipeline: no production question-generation path
change, no bank regeneration, no validation weakening, no question-
builder redesign, no LLM. The parent agent verifies and pushes; this
report does not commit or push anything.

## 0. Input resolution (read this first)

- The spec's `NCERT/hees203.pdf` **does not exist** in the checkout:
  `NCERT/` on main holds only `.gitkeep`. As in Phases 1–2A, the run used
  `/home/hatch/workspace/ncert_pdfs/hees203.pdf`, 40 pages, sha256
  `547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec`
  (re-verified on every harness run). **No PDF is committed to the repo.**
- All 8 chapter PDFs were present in `/home/hatch/workspace/ncert_pdfs/`
  (hees201–hees207, hees209), so the V2 cross-chapter comparison is
  COMPLETE — no missing inputs, no substitutions.
- Production bank baseline (before Phase 2B work, re-verified after):
  hees203 bank sha256
  `94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4`;
  consolidated file sha256
  `b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87`.
  All 8 staged banks + consolidated file + manifest are byte-identical
  after this phase (proven by `pwa/tests/test_phase2b.js` check 16, which
  also hashes all Phase 1 and Phase 2A diagnostics files).
- The batch generator was **never run in write mode**. Diagnostic runs
  wrote only to `diagnostics/` and `/tmp` (`/tmp/phase2b-legacy/` holds
  the read-only legacy reasoning copy for the V2 comparison).

## 1. What was built (files created / modified)

Created:

- `pwa/engine/sourceReconstruction.js` — the reconstruction module (§3).
- `pwa/tests/test_phase2b.js` — the 18 required Phase 2B tests (§9).
- `diagnostics/tools/diagnose_chapter3_phase2b.js` — the Chapter 3
  shadow harness (production reproduction, reconstruction, typed
  adapter, reference matching, case verification). The Phase 2A harness
  is byte-identical.
- `diagnostics/tools/v2_cross_chapter_phase2b.js` — the 8-chapter V2
  legacy-vs-current harness (§6).
- `diagnostics/chapter_3_phase2b_metrics.json` — versioned metrics
  with SEPARATE accounting for reconstructed text and typed facts.
- `diagnostics/chapter_3_phase2b_coverage_matrix.json` — fresh
  versioned matrix. Phase 1 and Phase 2A matrices are untouched.
- `diagnostics/chapter_3_reconstruction_schema.md` — the schema
  document (unit record, rule order, certainty classes, accounting).
- `diagnostics/v2_cross_chapter_comparison_phase2b.json` — the
  machine-readable V2 report for all 8 chapters (§6).
- `diagnostics/CHAPTER_3_PHASE_2B_RESULTS.md` — this report.

Modified (production code, all serialized in one agent's hands):

- `pwa/engine/generator.js` — ADDED `buildTypedKnowledgeFromReconstructedUnits`
  (shadow adapter, §4) and its export. No existing function was changed
  in meaning; `buildQuestionCandidates`, distractor policies and
  validators are untouched, and production reproduction is 5/5 (§5).
- `pwa/package.json` — `test_phase2b.js` appended to the `npm test`
  chain (it is not left unwired).

Deliberately **not** done in this phase, with reasons:

- The batch wrapper was **not** rewired to reconstruction. Wiring it
  without running it would be untested wiring; running it would
  regenerate banks (forbidden). Reconstruction is exercised by the
  diagnostic harness; batch wiring is later-phase work (§10).
- The layout classifier was **not** repaired. Reconstruction recovers
  content DESPITE the classifier (it works from the classifier's own
  blocks); classifier repair still belongs in its own measured phase.
- The V2 gate was **not** changed to an allowlist. §6 proves no gate
  change is justified: the gate already removes exactly the vacuous
  propositions, and an allowlist would change nothing for production
  fact types.

## 2. Corrections to Phase 2A framing (from the layout examination)

The read-only PDF examination corrected the Phase 2A report in
details that matter for implementation; all are incorporated above:

- p.14: NOT "b3…b26 individual words, each labeled table". Only 18 of
  b3–b26 are table word-blocks; b6 is ambiguous, b16/b21 fragments,
  b20 caption, b22 body, b23 ambiguous. The aggregate b2 is a 19th
  table block. The reconstruction rules handle mixed-type word blocks,
  not a uniform table run.
- p.17 furniture text: `3–AJourneyThroughIndianArchitecture`
  (capital T), not `…Journeythrough…` as printed in Phase 2A §8.
- p.26 gloss: NOT nine single-word fragments — b18 spans 2 raw lines,
  b20 spans 3, b25 spans 2, and b20 is `ambiguous`, not `fragment`.
- p.3 adjacency: 1010 CE and 1063 CE are BOTH adjacent to Brihadiswara
  in block order (before and after); nearest-centre gives a THIRD
  answer (600–900 CE). No text rule can pair timeline labels — the
  unresolved verdict stands on stronger evidence than Phase 2A stated.
- p.3 "28 labels" is the inventory's count of legible labels; the block
  layer holds 41 non-date fragments, several merged, several split.

## 3. Reconstruction: 129 units from 475 blocks, reconciled

From the application's actual parsing path (`pdfParser.extractPageLayout`
via the vendored pdf.js build under Node, with the batch's polyfills):

| Measure | Value |
|---|---|
| Pages covered | 40 / 40 |
| Blocks total | 475 (reconciliation ok: bucketed = 475) |
| Units total | 129 (body_prose 58, caption 52, glossary_definition 2, unresolved 10, cross_page_continuation 4, cross_page_continuation_candidate 3) |
| Table units / list units | 0 / 0 (table blocks on Ch. 3 are aggregates or prose word-blocks; lists 0 as in Phase 2A) |
| Blocks in units (unique) | 323 |
| Exclusions | 87 (page_furniture 18, running_title_furniture 13, page_number 38, aggregate_duplicates 6, callout_banner_artifact 12) |
| Section markers | 65 (genuine headings; not units) |
| Stripped furniture tails | 10 (original block kept whole in provenance; tail used) |
| Cross-page continuations skipped | 3 (endpoint excluded as furniture — a series-title block typed as body is not prose) |

Block accounting buckets sum exactly: 313 unit_block + 10 stripped
tails + 87 excluded + 65 section markers = 475. No block is counted
twice; cross-page merged units re-reference passage blocks and are not
double-counted.

Three implementation defects were found by testing the module against
the real pages and fixed in the module, not bypassed:

1. Caption continuation skipped ahead to the next PASSING block and
   stole a body block on p.14 (caption Fig. 3.16 swallowed the
   `and Rajasthan…` body block). Fixed: only the IMMEDIATE next
   unclaimed block in y-order may continue a caption.
2. Column clustering by pairwise x-overlap stranded single words
   (`or`, `In`, `a`) as orphan clusters, and incremental span growth
   stranded the first words until a wide block bridged them. Fixed:
   parser-gutter column assignment when gutter stats exist, else
   span-proximity merging (within 40pt; word gaps are ~27pt).
3. The furniture-prefix strip backtracked on furniture-only blocks
   (`… | Grade 8 Part 2` with nothing after it) and returned the bogus
   tail `Part 2` into prose on pp. 22 and 38. Fixed: the
   Part-consuming pattern is tried first.
4. A furniture endpoint resurrected inside merged cross-page units
   (3 blocks were both excluded and in units). Fixed: continuations
   with an excluded endpoint are skipped and counted.

## 4. Shadow typed knowledge: 21 raw / 20 unique facts, zero lost

The adapter feeds one synthetic section per reconstructed unit through
the UNCHANGED `buildTypedKnowledge` gates, then remaps IDs and attaches
provenance (unit ID, ordered block IDs, page range, evidence source).
Reconstruction success and classification success are SEPARATE
outcomes, reported separately:

| Measure | Phase 2A (bodyText) | Phase 2B (reconstructed) |
|---|---|---|
| Typed facts | 16 | 21 raw / 20 unique (1 duplicate from a cross-page merge of a passage sentence) |
| By type | entity 11, membership 2, numeric 3 | entity 14, membership 2, numeric 3, definition 1, date 1 |
| Shared fact keys | — | 16 (ALL Phase 2A facts survive) |
| New-only fact keys | — | 4 |
| Lost fact keys | — | 0 |

The 4 new facts are exactly the recovery wins: the Harappan
definition, the Jama Masjid builder (`launched_by Sultan Ahmed Shah I`),
the Madras High Court completion date (1892, caption-sourced), and
Indo-Saracenic architecture. The duplicate merged fact is the Buddha
statue fact appearing once from a passage and once from a merged
cross-page unit whose from-block already contains the complete
sentence — deduped by fact key in reporting, raw counts kept alongside.

What reconstruction recovered as TEXT but the parsers still cannot
type (honest gaps, not failures of reconstruction):

- Wells/stepwells passage (p.14): 0 typed facts — all 6 sentences
  `unsupported_pattern` (passive constructions, `developed` patterns).
- Nandi sentence (p.17): unparsed — the sentence's subject is the
  pronoun `It`, and the builder sentence's subject carries a figure
  reference. The TEXT is recovered; the parsers cannot yet type it.
- Latticework gloss (p.26): 0 facts — `parseDefinition` does not
  handle the `Term: definition` pattern yet. The gloss unit exists and
  is typed-input-ready; the definition parser is next-phase work.
- Caption typing is partial: only the Fig. 3.52 date fact types from
  captions in this chapter; other caption claims (red sandstone
  facade, Fig. 3.29 sketch, Fig. 3.34 facade) remain unparsed with
  reasons.

## 5. Production path unchanged (5/5, deterministic)

Running the exact production call form on the Chapter 3 PDF reproduces
the staged bank: 5/5 staged stems. Full `npm test` is green (§9), and
test 16 hashes prove every bank, the consolidated file, the manifest,
and all Phase 1 + Phase 2A diagnostics files byte-identical.

## 6. V2 cross-chapter comparison — the Phase 2A gap, closed

Method: the `a536a3c9` `representation.js` was fetched read-only at the
PINNED ref (the Phase 2A harness passed no ref; this harness pins and
verifies: no `classifyPropositionEligibility`/`graphRejections`
markers, contains `compileSemanticRepresentation`, and byte-identical
to the Phase 2A legacy copy). The whole reasoning directory was copied
to `/tmp/phase2b-legacy/` with only `representation.js` replaced.
Both engines ran on IDENTICAL analyzeSource sections + facts per
chapter (target 5), each comparison run twice (deterministic both
engines, all chapters). Per-subtype counts come from running
`generateReasoningCandidates` + `Validator` directly, since
`.generation` carries totals only.

| Chapter | Legacy props | Current props | Candidates L → C | Validated L → C | Accepted L → C |
|---|---|---|---|---|---|
| hees201 | 234 | 69 | 2 → 2 (causal_reasoning) | 2 → 2 | 2 → 2 |
| hees202 | 471 | 73 | 0 → 0 | 0 → 0 | 0 → 0 |
| hees203 | 180 | 28 | 0 → 0 | 0 → 0 | 0 → 0 |
| hees204 | 144 | 42 | 2 → 2 (causal_reasoning) | 2 → 2 | 2 → 2 |
| hees205 | 227 | 59 | 0 → 0 | 0 → 0 | 0 → 0 |
| hees206 | 136 | 41 | 1 → 1 (causal_reasoning) | 1 → 1 | 1 → 1 |
| hees207 | 140 | 29 | 0 → 0 | 0 → 0 | 0 → 0 |
| hees209 | 202 | 33 | 0 → 0 | 0 → 0 | 0 → 0 |
| **Total** | **1734** | **374** | **5 → 5** | **5 → 5** | **5 → 5** |

Reading: the gate removes **1360 vacuous propositions** across 8
chapters and changes NO candidate, validated, or accepted count in ANY
chapter. Phase 2A's "fewer-or-equal" bound resolves to EQUAL
everywhere: the 5 regenerable V2 questions (2 + 2 + 1, all
`causal_reasoning`) regenerate identically. The removed propositions
were fallback-derived or fragment/conflicting facts that never became
candidates (largest rejection reason everywhere:
`fallback_unclassified`, 85–385 per chapter).

### Fact-type taxonomy + the allowlist question (measured, not assumed)

Production facts across the 8 chapters use exactly 8 types: fallback
1298 (all rejected `fallback_unclassified`), entity_attribute 171,
causal 59, membership 50, numeric 40, comparison 25, definition 20,
date 1. Sequence and table types NEVER occur in production facts here
(no clean table groups, no surviving sequence facts); `multi_statement`
and `numeric_statistic` have no producers at all.
`classifyPropositionEligibility` is a REJECTION list, not an allowlist:
it rejects fallback, missing/fragment subject/object, conflicting
values and OCR-unverified, and admits every other type with sound
structure. An allowlist equal to `TYPED_FACT_TYPES` would therefore
change NOTHING for production types — it would only affect
non-production inputs that currently pass when structurally sound.
**No V2 gate change is justified by this evidence**, and none was
made. Any future gate change needs a demonstrated reason (a production
fact type that currently passes but should not) plus regression
coverage.

## 7. Reference-inventory matching: confirmed 91, review 54, unresolved 15

Fresh matrix (160 rows; Phase 1 and 2A matrices untouched; question
coverage carried from Phase 1, not re-judged):

| Measure | Phase 2A | Phase 2B |
|---|---|---|
| Confirmed: exact_span | 38 | 38 |
| Confirmed: normalized_text | 30 | 30 |
| Confirmed: multi_block_ordered_span | — (not implemented) | 23 |
| **Confirmed total** | **68** | **91** |
| Review: candidate_fuzzy (≥ 0.80, same page) | — | 53 |
| Review: ambiguous (multiple matches) | 0 | 1 |
| **Review total** | **0** | **54** |
| Unresolved | 92 | 15 |
| Typed-fact linked | 25 | 37 |
| Typed-fact unlinked | 135 | 123 |

Reading: multi-block span matching confirms 23 entries Phase 2A could
not trace, and the fuzzy tier moves 53 more from "unresolved" to
"review candidate with a score and unit" — explicitly NOT counted as
verified coverage. The 15 remaining unresolved entries are the
genuinely hard core (including the auditor-composed map summary
INV-3-009 and timeline/map content). No coverage claim is made from
reconstructed text volume: question coverage is still Phase 1's
5 COVERED + 1 PARTIAL + 137 UNCOVERED, carried unchanged, because
reconstruction does not create questions.

## 8. The 5 cases + 2 must-remain-unresolved cases (all 13 checks pass)

- **Case 1, p.14 wells/stepwells:** passage recovered from individual
  segments in reading order (blocks p14-b3…b27 minus caption b20 and
  aggregate b2); aggregate b2 appears in NO unit; threats sentence
  recovered complete via the rescued b30 tail.
- **Case 2, p.17 Nandi:** sentence recovered from b7 + b9 with the
  spaceless furniture block b8 removed by the spaceless-title rule;
  fragmentary heading b3 demoted to a prose continuation (body-column
  geometry + 12pt height + unterminated predecessor + lowercase
  successor) and its section corrected to the surrounding section.
- **Case 3, p.22 Jama Masjid:** builder sentence and etymology
  recovered from individual fragments (aggregate b5 excluded);
  Fig. 3.29 caption stitched (b19 + b20) with NO referent assigned
  (0 binding facts; the settling evidence is off-page on book p. 107).
- **Case 4, p.26 latticework:** gloss recovered verbatim as an explicit
  glossary unit with all 9 contributing block IDs; Mehrangarh subject
  recovered (`The construction of the Mehrangarh Fort in Rajasthan`);
  furniture tail rescued; callout `DON'T MISS OUT` excluded with a
  reason; NO glossary-to-building link inferred (flagged).
- **Case 5, p.38 Madras High Court:** Fig. 3.52 caption stitched
  (b2 + b3 + b4) with subject, 1892 date, red sandstone and mixed
  styles, preserved as CAPTION-derived evidence; Fig. 3.53's `its`
  left unresolved (0 binding facts).
- **Timeline (p.3):** no body-prose/table/gloss units, no date facts
  from p.3 units. Labels, dates and positions are preserved as
  unresolved visual records (block-level lists in the metrics JSON);
  three pairing rules were shown to disagree on the same labels.
- **Map (pp.4–5):** no typed facts from pp.4–5 units. Labels and the
  caption claim preserved; no position, region or distance inferred.

## 9. Tests

Full `npm test` (from `pwa/`) passes with the Phase 2B file wired in:

- `test_engine.js` — ALL PWA ENGINE TESTS PASSED.
- `test_integration.js` — ALL INTEGRATION & CONTRACT TESTS PASSED
  (0 errors).
- `test_processing.js` — ALL PROCESSING JOB TESTS PASSED (0 errors).
- `test_revision.js` — ALL REVISION ENGINE TESTS PASSED.
- `test_reasoning_v2.js` — ALL REASONING ENGINE V2 TESTS PASSED
  (0 errors).
- `test_repair002.js` — ALL REPAIR 002 REGRESSION TESTS PASSED
  (83 checks + 3 end-to-end).
- `test_phase2a.js` — 16 checks, all passing.
- `test_phase2b.js` — 18 checks, all passing, mapping 1:1 to the 18
  required Phase 2B tests. Case fixtures use the exact examiner block
  geometry; the harness verifies the same cases against the full PDF.

Two test-side defects were found by the tests themselves and fixed in
the implementation, not bypassed: (1) provenance for rescued furniture
tails showed the stripped tail instead of the original block text —
fixed so provenance always carries the original text; (2) check 18's
banned-token list matched the module's own documentation comment
("no Math.random") — tightened to call forms (`Math.random(`).

## 10. Recommended next phase (from measured results, in order)

1. **Typed-parser coverage for recovered patterns.** Reconstruction now
   recovers the text; the parsers type only 21 of its facts. Highest
   value, in order: `Term: definition` parsing (gloss facts),
   passive-voice entity attributes (wells/stepwells sentences),
   pronoun-subject resolution across the previous-subject chain
   (Nandi sentence), figure-reference subjects. Measure each against
   the Phase 2B typed set (21 → target, with zero regressions on the
   16 Phase 2A facts).
2. **Caption-claim typing.** Only 1 of the chapter's caption claims
   types today. Caption-internal subjects (Fig. 3.52 pattern) plus
   caption-order resolution (Fig. 3.53 pattern, labelled as
   caption-order provenance, not body evidence) are the next step.
3. **Batch telemetry wiring** (alongside, never replacing, `bodyText`):
   run reconstruction + typed adapter as batch telemetry and evaluate
   a typed gate on question building, now that reconstructed typed
   facts are a strict superset of Phase 2A typed facts (16/16 kept,
   4 new, 0 lost).
4. **Classifier repair — table-band detection and heading rules**,
   measured on all 8 chapters first (53/57 table blocks unparseable in
   Phase 2A; reconstruction works around the classifier but does not
   fix production `bodyText`).
5. **Timeline parser or visual confirmation** for INV-3-007 dates
   (still blocked: text pairing is affirmatively unsafe).
6. **Real-browser layout confirmation** (pp. 87, 98, 110 and furniture
   handling generally), which Node runs cannot substitute for.

Still awaiting user decisions from earlier phases (unchanged): context
as a separate question field vs baked into the stem; gold-standard
ownership (human-reviewed inventory recommended vs structural
heuristic); low-confidence OCR review stop vs auto-generate with
warning; elapsed-time display; inline question-count choice.

## 11. Unresolved failures, regressions and limitations

- **No regressions vs Phase 2A typed facts:** 16/16 kept, 0 lost.
  Reconstruction adds 4 new facts and 23 confirmed reference matches.
- **Regression vs the first reconstruction draft (fixed):** the draft
  stole a body block into a caption, stranded single words, emitted a
  bogus `Part 2` tail, and resurrected furniture blocks in merged
  units. All four are fixed in the module and covered by tests (§3).
- **Merged cross-page facts duplicate passage facts** when the
  from/to block already contains complete sentences (1 duplicate in
  this chapter). Raw and deduped counts are both reported; a future
  dedup step should drop merged-unit facts whose sentences already
  appear complete in passages, keeping only genuinely split sentences.
- **Reference matching is not coverage:** 53 fuzzy candidates are
  review items, not verified matches; question coverage is unchanged
  (Phase 1 verdicts carried, not re-judged).
- **Browser-path honesty:** layout classifications come from the
  vendored pdf.js build under Node — the same code the browser/worker
  uses — with the batch's polyfills. No real browser run was performed
  here, and none is claimed. The browser re-confirmation gap from
  Phases 1–2A remains open. The exact manual/browser test still
  required: load the PWA in a real browser, import hees203.pdf, and
  compare the browser's `extractPageLayout` block types and geometry
  for PDF pp. 3, 14, 17, 22, 26, 38 against
  `diagnostics/chapter_3_phase2b_metrics.json` (document-model block
  inventory); any divergence in table-band, heading or furniture
  classification on those pages is a browser-path finding, not a
  Node artefact.
- **No quality rule was weakened.** No validator, distractor policy,
  template, quota, or question builder changed in meaning; no bank
  was regenerated; no Phase 1 or 2A file was overwritten; no PDF was
  committed. Every hard restriction in the Phase 2B specification
  held; the proof is §5 (5/5 reproduction), §9 (full suite green)
  and test 16 (hash proof).
