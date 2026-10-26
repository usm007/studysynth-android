# StudySynth Phase 2A — Chapter 3 Results: Source Fidelity, Typed Knowledge and Coverage Telemetry

Version: `phase2a-1`. Baseline: remote main `a536a3c9` (Phase 1 audit
diagnostics). This is foundation work only: no question generation, no
distractor-policy change, no validator relaxation, no new templates,
no quotas, no gap-closure pass, no bank regeneration, no UI redesign,
no LLM. The parent agent verifies and pushes; this report does not
commit or push anything.

## 0. Input resolution (read this first)

- The spec's `NCERT/hees203.pdf` **does not exist** in the checkout:
  `NCERT/` on main holds only `.gitkeep`. As in Phase 1, the audit used
  `/home/hatch/workspace/ncert_pdfs/hees203.pdf`, 40 pages, sha256
  `547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec`
  (re-verified on every harness run). **No PDF is committed to the repo.**
- Production bank baseline (before Phase 2A work, re-verified after):
  hees203 bank sha256
  `94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4`;
  consolidated file sha256
  `b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87`.
  All 8 staged banks + consolidated file + manifest + all 5 Phase 1
  diagnostics files are byte-identical after this phase (proven by
  `pwa/tests/test_phase2a.js` check 16, which hashes every one of them).
- The batch generator was **never run in write mode**. Diagnostic runs
  wrote only to `diagnostics/` and `/tmp` (`/tmp/phase2a-legacy/` holds
  a read-only copy of the pre-Phase-2A reasoning modules fetched from
  remote main for the V2 comparison).

## 1. What was built (files created / modified)

Created:

- `pwa/engine/documentModel.js` — structured document representation
  (§3).
- `pwa/tests/test_phase2a.js` — the 16 required Phase 2A tests (§9).
- `diagnostics/tools/diagnose_chapter3_phase2a.js` — the corrected
  Phase 2A harness (§2). The Phase 1 harness
  (`diagnostics/tools/diagnose_chapter3.js`) is byte-identical.
- `diagnostics/chapter_3_phase2a_metrics.json` — versioned metrics.
- `diagnostics/chapter_3_phase2a_coverage_matrix.json` — fresh
  versioned coverage matrix. The Phase 1 matrix is untouched.
- `diagnostics/chapter_3_typed_fact_schema.md` — the schema document.
- `diagnostics/CHAPTER_3_PHASE_2A_RESULTS.md` — this report.

Modified (production code, all serialized in one agent's hands):

- `pwa/engine/generator.js` — added `parseAllFactRelations`,
  `buildTypedKnowledge`, `classifyTypedDraft`,
  `isFurnitureContaminated`, plus the `TYPED_FACT_*` /
  `UNPARSED_REASON_CODES` constants and exports. No existing function
  was changed in meaning; `buildQuestionCandidates`, distractor
  policies and validators are untouched.
- `pwa/engine/reasoning/representation.js` — added the V2 graph
  boundary (§6) and rejection recording. The diff against remote main
  is 114 changed lines, of which only 4 are removals (one comment
  line, two bare `continue;` lines now wrapped with rejection
  recording, and the `count:` return line now followed by
  `graphRejections`). No old logic was deleted.
- `pwa/engine/reasoning/engine_v2.js` — additive V2 telemetry only
  (`graphRejectionCount`, `graphRejectionsByReason`, non-enumerable
  `graphRejections` on the accepted array). Candidate selection is
  unchanged.
- `pwa/package.json` — `test_phase2a.js` appended to the `npm test`
  chain (it is not left unwired).

Deliberately **not** done in this phase, with reasons:

- The batch wrapper was **not** rewired to the document model. Wiring
  it without running it would be untested wiring; running it would
  regenerate banks (forbidden). The model is exercised by the
  diagnostic harness; batch wiring is Phase 2B work (§10).
- The layout classifier was **not** repaired, even though §7 shows it
  is now the largest fidelity loss. Classifier repair changes
  production `bodyText` and therefore production banks; it belongs in
  its own measured phase, not smuggled into a telemetry phase.

## 2. The `sourceMeta` nesting correction (stated precisely)

The known Phase 1 harness defect is fixed by construction in the new
harness, which never mixes forms. The precise chain, confirmed by a
read-only code trace, is:

- The batch calls `analyzeSource(rawText, title,
  { sourceMeta: { type, grade, subject } }, 15)` — a **singly-wrapped**
  object as the `sourceMeta` argument.
- `analyzeSource` then re-wraps it (`{ sourceMeta: sourceMeta }`) for
  `extractSourceFacts`, `buildKnowledgeInventory` and
  `generateQuestionBank`, so by the time `factConfidenceClass` reads
  `.origin`, an OCR origin (if any) is buried two levels deep and
  reads as `undefined` → `verified`.
- The Phase 1 harness's `analyzeSource` calls are **shape-identical**
  to the batch's. The only genuinely differing line is the harness's
  own wrapper-only unwrap (`diagnose_chapter3.js:154`,
  `sourceMeta: sourceMeta.sourceMeta`) for its independent
  `buildQuestionCandidates` call — and that difference is
  result-neutral for non-OCR input, because neither form carries an
  `origin` field and `generator.js` never reads
  `sourceMeta.type/grade/subject`. The defect was therefore narrower
  than the audit's framing suggested: a wrapper-only inconsistency,
  not a production-path discrepancy.
- **Production reproduction** in the new harness replicates
  production exactly, including `analyzeSource`'s re-wrap, so the
  reproduction is faithful.
- **Typed-knowledge run** uses the corrected singly-nested form
  `{ type: 'textbook', grade: 8, subject: 'art & heritage' }`, so an
  OCR origin, if present, would actually reach `factConfidenceClass`.
- For this textbook (non-OCR) input both forms yield identical
  results: all 16 typed facts have validation state `verified`, and
  all baseline facts have confidence class `verified`. The harness
  asserts this equivalence for the run.
- **Latent production issue, documented not changed:** through
  `analyzeSource`'s re-wrap, an OCR `origin` never reaches
  `factConfidenceClass`. Fixing the batch call would alter production
  behaviour for OCR sources, so it is recorded here for a later phase,
  not changed in 2A.

## 3. Structured document representation (475 blocks, fully accounted)

From the application's actual parsing path (`pdfParser.extractPageLayout`
via the vendored pdf.js build under Node, with the batch's polyfills):

| Measure | Value |
|---|---|
| Pages encountered | 40 / 40 |
| Blocks total | 475 (reconciliation: disposition sum = 475, per-page ok) |
| Blocks by type | body 132, heading 70, fragment 109, ambiguous 27, caption 52, table 57, page furniture 28 |
| Dispositions | included_prose 202 (132 body + 70 heading), preserved_fragment 109, preserved_ambiguous 27, included_caption 52, included_table 57, excluded_furniture 28 |
| Blocks with usable text | 475 (every block's text is preserved in the model, including excluded furniture) |
| Blocks requiring review | 114 |
| Blocks with unknown section | 1 (content before the first heading) |
| Paragraphs reconstructed | 132 (one per body block) |
| Captions associated / unassociated | 18 / 34 (association needs a same-page explicit figure reference; proximity alone never associates) |
| Tables with parsed rows / unresolved | 4 / 53 |
| Lists detected | 0 |
| Cross-page continuation candidates | 10 (4 strong, 6 weak; text never merged) |
| Sections reconstructed (heading-based) | 70 |

Improvements over Phase 1: every block now has exactly one disposition
with a reason; nothing is silently dropped (Phase 1's prose path
discarded captions, fragments, ambiguous blocks and furniture without
a record); sections are derived from content, not page flushes; the 13
prose sections the audit identified (Beginnings, Structural Stupa,
Rock-Cut, Water Structures, Classical Temple, Mosques, Forts and
Palaces, Tombs, Traditional Houses, Churches, Colonial, …) are
recovered as heading-delimited sections.

Regressions / honest caveats (these are classifier findings the model
faithfully surfaces, not model bugs):

- **70 sections is not "better" than the audit's 43 in raw terms.**
  The heading classifier over-fires on timeline/map pages: PDF p. 3
  alone contributes 29 heading blocks (timeline labels such as
  `1 st BCE–`, `1010 CE`, `Brihadiswara Temple`, `Madras High Court`),
  and bare page numbers become sections (`86 86`, `88`, `89`,
  `123 123`). A sentence split across blocks becomes a fragment
  section title (`10 th century onward, in different` on p. 17).
  Heading classification needs a label-vs-section distinction (§10).
- **Table parsing succeeds for only 4 of 57 table blocks** because
  most "table" blocks are not tables at all (§7, p. 14).
- **Lists: 0 detected.** The detector is conservative (explicit
  markers only) and found no list-like body block on Chapter 3; it
  produces no false positives, but list recovery is unproven.
- **Caption association 18/52** is conservative by design.

## 4. Typed knowledge: 16 certified facts from 368 units

Sentence units: 368 — exactly matching Phase 1's unit count, which
cross-validates the section/text path. Roles: assertion 269,
ambiguous 79, interrogative 18, instruction 2.

| Measure | Value |
|---|---|
| Typed facts | 16 (entity_attribute 11, membership 2, numeric 3; date 0, causal 0, comparison 0, sequence 0, definition 0, table 0) |
| Typed facts with complete evidence | 16 / 16 |
| Units with ≥1 typed fact | 16 |
| Units unparsed | 352 |
| Multi-claim units | 0 (no multi-claim sentence occurs in Chapter 3 prose; the mechanism is proven by unit test 9) |
| Partial rejections (rejected drafts from units that did yield a fact) | 1 (fragment) |
| Production baseline, same sections | 179 facts: 30 usable, 149 fallback, 0 table |

Unparsed units by reason (denominator: 352 unparsed units):

- `unsupported_pattern` 149 — assertion units no parser could draft.
  (Note: this equals the fallback count, because every fallback unit
  is an assertion unit with no draft; the typed layer just names it.)
- `fragment` 96 — lowercase starts, missing terminal punctuation,
  fragment subjects/objects.
- `ambiguous_relation` 78 — non-assertion ambiguous units.
- `interrogative_or_instruction` 20.
- `cross_page_continuation_unresolved` 7 — lowercase starts after
  unterminated units on earlier pages (block-level candidates: 10).
- `layout_relationship_unresolved` 2 — ragged pipe-delimited units /
  layout-artifact subjects.
- `furniture_contamination` 0 — no sentence unit in Chapter 3
  `bodyText` contains the running-title pattern (§7, p. 17).

### 4.1 The 30 → 16 gap, explained exactly

Production usable facts span 29 distinct units. The typed layer
certifies facts on 16 of those units. The other **13 units are dropped
with explicit reasons** — every one is a case the manual-read gates
already distrust:

- Fragment subjects: `most others` (comparison), `Above the
  garbhagṛiha`, `In Thanjavur, Tamil Nadu, the imposing Bṛihadīśhvara
  Temple (Fig. 3.20)`, `As the few examples below`, `It` (pronoun).
- Layout-artifact subjects: `Æ Sharada Peetha Temple …` and
  `Æ Jageshwar Group of Temples …` (`INVALID_START` — the `Æ` is a
  layout artifact), `3.41 and 3.42)` (unbalanced parens — a figure
  fragment), `The Mysuru Palace … (Fig. 3.40)` (figure reference in
  subject position).
- Other subject failures: `Made of white marble … that` (dummy
  pronoun inside), `The walls and arches was designed to` (finite-verb
  subject), `The complex also` (dangling correlative), `The walls and
  arches` (fragment object).

Consequences, stated plainly:

- **Typed causal/comparison/date facts on Chapter 3: zero.** The
  baseline's 2 causal and 1 comparison facts are all among the 13
  dropped (fragment subjects/objects); the baseline has **zero** date
  facts at all — timeline dates never became facts in either layer.
  The typed layer does not invent causal, comparative or chronological
  knowledge the parsers cannot support.
- **All 5 shipped Chapter 3 bank questions survive the typed gate.**
  Each bank question's supporting excerpt matches a typed fact's
  evidence exactly (5/5, verified mechanically): main alignment,
  Mohenjo-daro, present structure (Mysuru Palace), Harmandir Sahib,
  and the 4,500-years numeric. So a future typed gate on question
  building would remove **no** shipped Chapter 3 question — while
  refusing 13 units production currently treats as usable.
- **Structural validity is not semantic quality (limitation).** Typed
  facts still include weak subjects that pass the structural gates:
  `people → 25,000 people`, `years → 4,500 years`,
  `used waters → taken out of the city …`,
  `mined from Dholpur in Rajasthan, some → 60 km`. The typed layer
  certifies structure, not semantic adequacy; subject semantics is
  next-phase work.
- **Causal verb labeling (carried artifact).** A causal typed fact's
  coarse `relation` is `causes` while `relation_verb` preserves
  `contributes to` / `influences`. The typed layer preserves the verb;
  it does not rename the parser's label (schema §3.2).

### 4.2 Multi-claim recovery (mechanism proven, not exercised on Ch. 3)

Production's early returns (sequence sentences, initial-move
sentences, cause/conditional/comparison sentences whose claim was
rejected) silently drop later claims. `parseAllFactRelations` runs
every parser without those returns. Unit test 9 proves it on
`First 5 members joined, then 10 members joined, and finally 15 members
joined.`: production yields 1 fact (sequence only); the typed layer
yields 4 (sequence + 3 numerics). Chapter 3 prose contains no such
sentence (multi-claim units: 0), so this is a proven mechanism with
zero measured effect on Chapter 3 — reported as such, not inflated.

### 4.3 Qualifier preservation (proven by unit test 10)

- Negation: `The region does not receive more than 100 cm of
  rainfall.` → numeric fact, `polarity: negative`,
  `precision: approximate`, object `100 cm` (unit preserved).
- Direction: causal fact, `relation_verb: contributes to`,
  `causal_direction: cause_to_effect` — `contributes to` is not
  collapsed, and the direction is explicit.
- Dates: date facts carry the year as the object with a typed relation
  (`completion_year`, `move_year`, …) and `temporal_scope` where the
  parser provides it.

## 5. Production reproduction: unchanged (5/5, deterministic)

Running the exact production path (batch call forms, doubly-nested
`sourceMeta`) on the Chapter 3 PDF reproduces the staged bank:

- Production questions: 5; staged bank stems: 5; reproduced: 5/5.
- Two consecutive runs produce identical stems + keys (deterministic).
- Standalone V2 (target 5): 0 accepted — as in Phase 1.
- This proves the Phase 2A edits did not change the production
  question path: `buildQuestionCandidates`, distractor policies and
  validators are untouched, and the V2 gate's effect on the production
  bank path is nil for Chapter 3 (its 5 questions are production
  questions, not V2 questions).

## 6. V2 behaviour-change quantification (old vs new, true side-by-side)

Method: the pre-Phase-2A `representation.js` was fetched read-only
from remote main (`a536a3c9`) into `/tmp/phase2a-legacy/` alongside
unchanged sibling modules, and both engines ran on identical sections
+ facts (target 5). This is a true old-vs-new run, not an estimate.

| Measure | Legacy (pre-2A) | Current (2A gate) |
|---|---|---|
| Propositions | 180 | 28 |
| Total candidates | 0 | 0 |
| Validated candidates | 0 | 0 |
| Accepted questions | 0 | 0 |
| Graph rejections | — (silent) | 153 (149 `fallback_unclassified` + 4 `fragment_subject`, all from fact bridging; 0 from direct extraction) |
| Propositions from fact bridging | — | 26 |
| Propositions from direct extraction | — | 2 |

Reading: the gate removes **152 vacuous propositions** (180 → 28)
with **zero effect on Chapter 3 V2 output** (0 candidates either way).
The 26 surviving bridged propositions are exactly the 30 usable facts
minus the 4 fragment-subject rejections — clean arithmetic. The 2
direct-extraction propositions confirm Phase 1's V2-vacuity finding
from the other side: direct extraction finds almost nothing in this
prose; nearly all legacy propositions were bridged fallback facts.

Exposure for other chapters' shipped V2 items (no bank regenerated):
other chapters currently ship 5 V2 items in total (across the 8 banks).
Those items were built under the legacy bridge, so on a future
regeneration with the gate, any V2 item whose source proposition came
from a fallback-derived fact would not regenerate. The shipped banks
are byte-identical and unaffected; the exposure cannot be quantified
per-item from bank files alone (banks do not record which propositions
fed each item), so the honest statement is: **future V2 regeneration
will produce fewer-or-equal V2 candidates everywhere, and Chapter 3
measures that delta as −152 propositions / −0 questions.** Chapters
with richer causal/conditional prose may see larger candidate deltas;
that must be measured per chapter at regeneration time, not assumed
from Chapter 3.

## 7. Reference-inventory connection (fresh matrix, Phase 1 preserved)

Fresh matrix: `chapter_3_phase2a_coverage_matrix.json` (160 rows).
Phase 1 matrix untouched; its verdicts are carried with provenance,
not re-judged.

| Measure | Value |
|---|---|
| Reference entries | 160 |
| Block-matched (exact_span / normalized_text) | 68 |
| Block ambiguous (review_required) | 0 |
| Block unresolved | 92 |
| — of which contiguous in joined block text (`spanning_blocks`) | 9 |
| — of which absent from joined layout text | 83 |
| Unresolved with ≥80% of content words on their own page | 80 / 92 |
| Unresolved with 40–80% | 11 / 92 |
| Unresolved with <40% | 1 / 92 (INV-3-009, an auditor-composed map-label summary, not a quotation) |
| Typed-fact linked | 25 / 160 |
| Typed-fact unlinked | 135 / 160 |
| Question coverage carried from Phase 1 | COVERED 5, PARTIALLY_COVERED 1, UNCOVERED 137, NOT_QUESTION_WORTHY 16, REVIEW_REQUIRED 1 (denominator 143 question-worthy; matches Phase 1 exactly) |

Reading: single-block exact/normalized matching traces 68/160. The
fuzzy analysis shows the gap is overwhelmingly a **matcher
limitation, not missing content**: 80 of the 92 unresolved entries
have ≥80% of their content words on their own page, and 9 match
contiguously once blocks are joined. The content is present but split
across blocks, reordered, or lightly reworded (auditor-composed
quotations, hyphenation, figure prefixes). Multi-block span matching
and fuzzy matching are next-phase work (§10). `linked` (25) is a
subset of block-matched (68) by construction and does **not** mean
question-covered. No comprehensive-coverage claim is made: 137 entries
remain UNCOVERED by questions, and typed linkage (25) is a different,
smaller denominator.

## 8. The 7 known extraction problems, evaluated against the actual PDF

### PDF p. 3 / book p. 87 — timeline labels + date relationships

64 blocks: 29 headings, 17 tables, 14 fragments, 1 body, 2 ambiguous,
1 caption. The timeline page is almost entirely labels: timeline
entries became heading blocks (hence the 70-section inflation) and
table-band blocks. **0 typed facts, 0 date facts** (baseline also 0).
The timeline caption (`Fig. 3.2 …`) is preserved but unassociated.
The PDF examination (reconciled after the first draft) confirms and
sharpens this: every label and date exists as text (28 labels, 17
date strings), but **pairing follows the graphic's winding path, not
text order or geometry** — adjacency in `bodyText` order, Euclidean
nearest-neighbour, and the aggregate table block all give mutually
inconsistent pairings. Traps: `1010 CE` sits adjacent to
`Brihadiswara Temple` in `bodyText` while `1063 CE` is a separate
heading, so order alone cannot assign the date; aggregate table block
`p3-b48` merges unrelated items across most of the page
(`1424 CE` sits between `Mehrangarh` and `Ahmedabad` in its string,
proving nothing). Spelling drift alone breaks string matching
(timeline `Brihadiswara Temple`, map `Brihadeswara temple`, body
`Bṛihadīśhvara Temple`; `Sharada Peeth` vs `Sharada Peetha`). The
page's single `body` block is itself misclassified furniture (the
spaceless series title). The three INV-3-007 conflicts, quoted
without adjudication: Brihadisvara timeline `1063 CE` vs body book
p. 101 (`built by Rājarāja Chola I around 1010`); Ahmedabad Jama
Masjid timeline `1424 CE` vs body book p. 106 (`built by Sultan Ahmed
Shah I in the 15th century`); Bishnupur timeline `17th–19th
centuries` vs body book p. 103 (`Built in the 17th and 18th
centuries`).
**Verdict: explicitly unresolved — genuinely ambiguous from text
alone, visual reading of the graphic required.** Timeline
label–value–date relationships need a dedicated timeline parser (or
visual confirmation); they must not be forced into sentence facts.
INV-3-007 stays REVIEW_REQUIRED.

### PDF pp. 4–5 / book pp. 88–89 — map content + visual dependencies

p. 4: 18 blocks (9 headings, 6 fragments, 1 ambiguous, 1 caption,
1 furniture). p. 5: 20 blocks (8 headings, 9 fragments, 2 ambiguous,
1 furniture). No body prose, no typed facts. Map labels are preserved
as heading/fragment blocks; the map's meaning is visual. The PDF
examination adds: there is no compass, scale, legend, or route text
in the text layer at all, and no text states any state, region,
direction, distance, or relative position for any label — a label's
position is encoded only in its (x, y) against the drawn outline of
India, split across the two-page gutter. The only text-supported fact
is the caption's own claim, that these are "the structures and
monuments visited in this chapter".
**Verdict: visual-only, correctly unresolved.** No labels were
manufactured into facts.

### PDF p. 14 / book p. 98 — water structures + table-classified prose

33 blocks: 4 body, 19 table, 4 ambiguous, 3 fragments, 2 captions,
1 furniture. The key finding: **the wells/stepwell paragraph was
shattered into word-blocks by the table-band detector.** Block
`p14-b2` is a mangled concatenation
(`Wells | have | been ; bricks, | stones, | or ; terracotta | ring. | In ; …`)
and `p14-b3`…`p14-b26` are its individual words, each labeled
`table`. Because `bodyText` excludes table blocks, **this paragraph
is absent from production prose** — its facts are unrecoverable in
this phase, and the table-row parser rightly fails on it (ragged).
Separately, block `p14-b30` is a furniture block trapping real
content: `Exploring Society: India and Beyond | Grade 8 Part 2
depleted water sources, maintenance issues, pollution, waste` —
a running footer merged with body text, excluded as furniture with
its content preserved in the model but lost to prose. The threats
sentence is split across ambiguous `p14-b29`, that furniture block,
ambiguous `p14-b31`, and body `p14-b33`.
**Verdict: classifier defect, precisely located — but the content
is recoverable, not lost.** The PDF examination demonstrates the
full sentences reconstruct exactly in y-order across block types
(e.g. "Wells have been constructed in many sizes and shapes from
bricks, stones, or terracotta ring. In classical times, a tradition
of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan,
many of them engineering marvels as well as spectacular works of
art."). Two qualifications: the aggregate table block's own text is
**not** reliable (it merges non-adjacent lines and skips intervening
ones) — only the individual segments in y-order reconstruct the
source; and the social-function sentence survives in `bodyText`
only as a subjectless tail. So the next step is a prose-recovery
pass over all blocks in y-order (using individual segments, not
aggregate table text), with or without classifier repair — the
content is present, and the recovery rule is now specified. Until
that pass exists, the water-structures paragraph stays explicitly
unrecovered from the production path, not silently missing.

### PDF p. 17 / book p. 101 — running-header contamination inside a sentence

**Correction to the first draft of this report (which wrongly
concluded this page was clean): the contamination is real, but in a
different form than the `Exploring Society | Grade 8` pattern the
first draft searched for.** `bodyText` on p. 17 indeed contains
neither `Exploring Society` nor `Grade 8` — but the page's running
title is a different string, and it **is** inserted mid-sentence in
`bodyText` order. The source sentence (book p. 101) is: "It is
renowned for its vast maṇḍapas, a huge vimāna, over 60 metres high,
and a massive Nandi (sacred bull) statue carved from a single stone,
which sits in a pavilion facing the main shrine." In the pipeline
it reads: "…over 60 metres high, and a" [`p17-b7`, body] —
"OurCulturalHeritageandKnowledgeTraditions
3–AJourneythroughIndianArchitecture" [`p17-b8`, typed **body**, not
furniture] — "massive Nandi (sacred bull) statue carved from a
single stone, which sits in a pavilion facing the main shrine. The
entire" [`p17-b9`, body]. The furniture block defeats both
classifier defenses: the spaceless join matches neither the
running-title pattern nor the margin test (yTop 653 on a 784.8 pt
page is inside the 9%/91% band), and because the page has no gutter
the blocks order top-down, so the furniture lands inside the
sentence. The sentence is recoverable from layout alone: the
furniture is a separate right-margin column (x ≥ 543, vs body
x ≤ 453), so x-separation removes it and blocks `p17-b7 + p17-b9`
give the complete sentence — the Nandi single-stone fact and the
Bṛihadīśhvara `around 1010` fact are fully text-supported from
layout. Separately, the keyword hit block `p17-b4` is legitimate
prose (`In the grade 7 textbook (chapter 'Turning Tides: 11 th and
12 th Centuries'), we saw the magnificent Kandāriyā Mahādeva Temple
…`) — a cross-reference the sentence-role discourse rule excludes
from facts (`ambiguous_relation`), by design. And a sentence split
across blocks `p17-b3` (heading: `10 th century onward, in
different`) and `p17-b4` (body: `parts of India they grew …`)
creates a fragment section title.
**Verdict: confirmed — furniture-as-body inserted mid-sentence in
`bodyText` order; recoverable from layout via x-separation.**
Consequence for the typed layer, stated plainly: the typed layer
records **0** `furniture_contamination` units on Chapter 3 because
its detector is pattern-bound (`Exploring Society … Grade …`,
`| G rade`) and this spaceless series title matches none of them.
The Nandi sentence instead surfaces as unparsed fragments (an
unterminated unit ending "…and a" and a lowercase-start continuation
on the same page). Furniture detection needs a spaceless-join rule
and/or a geometric (right-margin column) rule — a detector gap, not
evidence the page is clean. The `p14-b30` merged-furniture pattern
(co-existing footer + body line in one furniture block) is a second,
distinct furniture failure mode on top of this one.

### PDF p. 22 / book p. 106 — Jama Masjid text + fragmented captions

21 blocks: 5 body, 2 captions, 7 tables, 4 fragments, 1 ambiguous,
1 heading, 1 furniture. The opening mosque paragraph survives
intact as body `p22-b3` — it is the source of the typed p. 22 facts
(`Mosques → places of worship …`, membership fact about domes and
minarets; p. 24: `The mosque → made from red sandstone …`,
`people → 25,000 people`). The PDF examination upgrades the rest
from "partial" to layout-recoverable: the Ahmedabad builder
sentence ("The Jama Masjid in Ahmedabad (Gujarat) was built by
Sultan Ahmed Shah I in the 15th century.") is split across
ambiguous `p22-b15`, fragment `p22-b16`, and body `p22-b17` — only
the verb clause survives in `bodyText`, subjectless; and the
etymology sentence ("…often called 'Jama Masjid'—jama means
'gathering' or 'assembly', while masjid means 'mosque'.") is split
across body, table segments, and fragments, leaving `bodyText` with
a dangling "jama" and no definitions. Both are fully recoverable
from all blocks in y-order (with the same aggregate-table caveat as
p. 14: block `p22-b5` merges non-adjacent lines, so individual
segments, not aggregate text, must be used). Caption fragmentation
is real: Fig. 3.29's caption is split into caption `p22-b19`
("Fig. 3.29. A sketch made in 1809 by a British army") + body
`p22-b20` ("officer shows the mosque's full-size minarets.") — the
tail enters `bodyText` as if it were prose while its figure number
and date are excluded, and which mosque "the mosque" refers to
cannot be settled from p. 22 alone (it is settled by book p. 107's
text).
**Verdict: etymology + builder layout-recoverable (all blocks,
y-order); Fig. 3.29's referent genuinely ambiguous on this page
alone.** Caption stitching (continuation rules for split captions)
is next-phase work; no caption text was forced into a fact.

### PDF p. 26 / book p. 110 — latticework terminology

27 blocks: 10 fragments, 8 body, 4 tables, 3 ambiguous, 1 caption,
1 furniture. 0 linked typed facts on the page. The PDF examination
upgrades the diagnosis: the gloss exists **in full** in a narrow
left-margin column below the Fig. 3.34 caption — "Latticework: Open
framework with criss-crossing or decorative designs. Here, it is
both functional (allowing ventilation) and aesthetic in design."
— shattered across 9 non-body blocks (fragments + ambiguous) and
entirely absent from `bodyText`. As a self-contained labelled
definition in its own column, in reading order, with no missing
word, it supports a definition fact directly from layout. The
caption itself is also split (caption + ambiguous + body tail), so
the only latticework words in `bodyText` are the orphan tail
"latticework around the balconies."; and the main Mehrangarh
paragraph loses its subject the same way (ambiguous + table
segments leave `bodyText` starting at "Rajasthan (Fig. 3.33) began
in the mid-15 th century; …"). The gloss-to-balcony link itself
rests on the shared term and the caption immediately above the
gloss — term/proximity, not a stated relationship. Separately, the
page's furniture block swallows a sentence tail ("all of which work
together to keep houses cool.").
**Verdict: gloss definition layout-recoverable (margin-column
fragment re-joining); unrecovered by the current pipeline, not
absent.** The audit's "lost" framing should be narrowed: the
content is present and joinable; what is missing is the
margin-gloss recovery rule. The terms were not forced into facts.

### PDF p. 38 / book p. 122 — Madras High Court caption + subject relationship

7 blocks: 1 heading, 2 captions, 1 body, 1 ambiguous, 1 fragment,
1 furniture. This page has **no body prose whatsoever** — only a
section heading and two figure captions over photographs.
`bodyText` is just "Colonial Architecture / carvings and pillars in
Hindu temple style." — a subjectless clause. The PDF examination
refines the verdict in two directions. Fig. 3.52 **is**
layout-recoverable with caption provenance: joining its three
contiguous y-ordered lines (caption `p38-b2` "Fig. 3.52. A general
view of the Madras High Court, completed in 1892. The" + ambiguous
`p38-b3` "red sandstone facade features Islamic arches and
intricate screens alongside" + body `p38-b4` "carvings and pillars
in Hindu temple style.") yields a complete text-supported set —
subject (the Madras High Court), date (1892), material (red
sandstone), mixed styles — where the caption's own noun phrase is
the subject. The 1892 completion date occurs **only** in this
caption anywhere in the chapter (full-text search), so caption
provenance matters: these would be caption-sourced facts, not body
facts, and must carry that label. Fig. 3.53 ("A close-up of some
of its domes and towers.") is the genuinely ambiguous half: "its"
has no subject on the page except by caption order (the preceding
caption's court) or visually.
**Verdict: Fig. 3.52 facts layout-recoverable with caption
provenance (caption-internal subject pattern, not body reference);
Fig. 3.53's referent genuinely ambiguous on-page.** The
association rule's miss here is structural — it looks for body
references to figures, but this pattern needs caption-internal
subject extraction plus caption-order resolution, both next-phase
work.

## 9. Tests

Full `npm test` (from `pwa/`) passes with the Phase 2A file wired in:

- `test_engine.js` — ALL PWA ENGINE TESTS PASSED.
- `test_integration.js` — ALL INTEGRATION & CONTRACT TESTS PASSED
  (0 errors).
- `test_processing.js` — ALL PROCESSING JOB TESTS PASSED (0 errors).
- `test_revision.js` — ALL REVISION ENGINE TESTS PASSED.
- `test_reasoning_v2.js` — ALL REASONING ENGINE V2 TESTS PASSED
  (0 errors).
- `test_repair002.js` — ALL REPAIR 002 REGRESSION TESTS PASSED
  (83 checks + 3 end-to-end).
- `test_phase2a.js` — 16 checks, all passing, mapping 1:1 to the 16
  required Phase 2A tests (check 15 is a spot check that the
  production question path still loads and builds; full-suite green
  is the proof for required test 15).

Two test-authoring defects were found by the tests themselves and
fixed in the implementation, not bypassed: (1) the typed layer's
furniture check ran after the pipe test, so a merged running title
containing `|` was misclassified as a ragged table row — order
corrected, with the rationale documented in code; (2) the document
model's figure-reference regex expected literal dots in numbers after
normalization had turned them into spaces — fixed to match normalized
text. A third defect was in the test's own recorded hash (one
transcription character for hees209); the bank file itself was
verified unchanged against the independent baseline listing.

## 10. Recommended next phase (from measured results, in order)

1. **Prose-recovery pass over all blocks in y-order.** The PDF
   examination proves the highest-value recovery does not require
   classifier repair first: the p. 14 wells paragraph, the p. 22
   etymology + builder sentences, the p. 26 latticework gloss, the
   p. 38 Fig. 3.52 caption facts, and the p. 17 Nandi sentence are
   all reconstructable from existing blocks in y-order. Rules that
   must be honored: use **individual segments, never aggregate table
   text** (aggregate blocks merge non-adjacent lines and skip
   intervening ones); re-join margin-column fragments as gloss
   units; join contiguous caption/ambiguous/body lines as
   caption-sourced units with provenance; remove right-margin
   furniture columns by **x-separation** (p. 17) and split
   furniture blocks that swallow body lines (p. 14, p. 26) instead of
   dropping or keeping them whole. Furniture detection additionally
   needs a spaceless-join rule — the p. 17 series title defeats both
   the pattern match and the margin test.
2. **Classifier repair — table-band detection and heading rules.**
   Still needed for production `bodyText` correctness (53/57 table
   blocks unparseable, 70 sections from label/page-number/fragment
   headings), but item 1 may deliver more recovered content sooner
   and with less production-text risk. Measure on all 8 chapters,
   not just Chapter 3, before changing production text.
3. **Multi-block span + fuzzy reference matching.** 80/92 unresolved
   entries have their content on-page; single-block matching is the
   bottleneck, not content absence.
4. **Caption stitching, caption-internal subjects, and caption-order
   resolution.** Split captions (p. 22 Fig. 3.29, p. 26 Fig. 3.34,
   p. 38 Fig. 3.52) need continuation rules; Fig. 3.52 shows the
   subject can live inside the caption itself; Fig. 3.53 shows
   "its" needs caption-order resolution (or visual confirmation).
5. **Timeline parser.** Label–value–date relationships (p. 3) with
   INV-3-007's date conflict still blocking timeline dates as facts;
   pairing follows the graphic path, so a text-order/geometric
   pairing rule is affirmatively unsafe — visual confirmation is
   required for any timeline date used as a fact.
6. **Glossary labeling on top of item 1.** The re-joining pass
   recovers gloss text; labelling a joined margin unit as a
   definition (term + definition) and linking it to same-term body
   mentions by term/proximity (not as a stated relationship) is the
   remaining step.
7. **Then wire the document model + typed layer into the batch as
   telemetry** (alongside, never replacing, `bodyText`), and evaluate
   a typed gate on question building — with the measured Chapter 3
   result that all 5 shipped questions survive it.
8. **Real-browser confirmation run** of layout classification
   (pp. 87, 98, 110 and furniture handling generally), which Node
   runs cannot substitute for.

Still awaiting user decisions from earlier phases (unchanged): context
as a separate question field vs baked into the stem; gold-standard
ownership (human-reviewed inventory recommended vs structural
heuristic); low-confidence OCR review stop vs auto-generate with
warning; elapsed-time display; inline question-count choice.

## 11. Unresolved failures, regressions and limitations

- **Regressions vs production fact counts (intended, measured):**
  typed certifies 16 facts vs production's 30 usable (13 units
  dropped, §4.1); typed causal/comparison/date facts are zero on
  Chapter 3. This is strictness, not data loss: the 13 units are
  reason-coded and preserved, and all 5 shipped questions survive.
- **Regressions vs Phase 1 section counts (classifier, not model):**
  70 heading-sections vs 43 page-slice sections; the model is
  faithful to classifier output, and the classifier over-fires (§3).
- **Not yet measured:** per-chapter V2 deltas beyond Chapter 3
  (exposure statement in §6 is a bound, not a measurement); list
  recovery (0 detected); multi-block reference matching (designed,
  not implemented); caption stitching; timeline/glossary parsing.
- **Typed `source.page` is the section's page**, not the sentence's
  own page (production page-flush sectioning). Sentence-level page
  attribution awaits document-model section reconstruction (§10.7).
- **Browser-path honesty:** layout classifications come from the
  vendored pdf.js build under Node — the same code the browser/worker
  uses — with the batch's polyfills. No real browser run was
  performed here, and none is claimed. The browser re-confirmation gap
  from Phase 1 remains open.
- **Delegated read-only analyses — both reconciled.** The code-trace
  report confirms the mechanisms this phase relies on (page-marker
  section flushes, one fallback per surviving assertion unit with no
  drafts, uncounted silent skips, previous-subject priority date >
  entity_attribute > membership > numeric, fallback facts bridging
  into empty `HAS_PROPERTY` V2 propositions, the 100-pair V2
  traversal cap, constructor evidence/distractor gates, and the
  absence of per-candidate/per-proposition diagnostics in either
  pipeline) and corrects three points, all incorporated above:
  (a) the `sourceMeta` chain is now stated precisely in §2 — the
  Phase 1 harness's `analyzeSource` calls are shape-identical to the
  batch's, and only its wrapper-only unwrap differs, result-neutral
  for non-OCR input; (b) Phase 1's `duplicate_relation` label is a
  fallback bucket, not a diagnosis — validated-but-unselected
  candidates are labelled `duplicate_relation` solely because the
  bank is below target, so relation-key collisions, stem collisions
  and the 40% subtype cap all collapse into that label and the
  "37 discarded as duplicate_relation" does **not** prove 37 duplicate
  relations; (c) the trace's early-return table mischaracterizes the
  cause/conditional/comparison returns as "returns the causal-only /
  conditional-only set" — the code returns only when the parsed claim
  was **rejected** by `add()`; on acceptance parsing continues. Only
  sequence and initial-move sentences always return. §4.2 follows
  the code, not the trace's table, on this point. The PDF-examination
  report (same PDF hash, `pdftotext` in both modes plus the repo's
  own classifier under Node via the vendored `pdf.mjs`, throwaway
  scripts in `/tmp` only, no repo writes) was reconciled into §8 and
  §10: it confirms the timeline/map verdicts, proves pp. 14/22/26/38
  content layout-recoverable via y-order re-joining (upgrading
  "unrecovered" to "recoverable with a specified rule"), and
  **corrects the first draft's p. 17 verdict** — the contamination is
  real (furniture-as-body inserted mid-sentence), not absent; the
  first draft searched for the wrong furniture string. It also
  corrects a task premise (not this report's text): Phase 1 used the
  vendored `pdf.mjs`, not `pdfjs-dist`. No remaining delegated report
  is outstanding.
- **No quality rule was weakened.** No validator, distractor policy,
  template, quota, or question builder changed in meaning; no bank
  was regenerated; no Phase 1 file was overwritten; no PDF was
  committed. Every hard restriction in the Phase 2A specification
  held; the proof is §5 (5/5 reproduction), §9 (full suite green)
  and test 16 (hash proof).
