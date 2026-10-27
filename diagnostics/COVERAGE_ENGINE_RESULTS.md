# Coverage Engine Results — Delivery Pivot (candidate banks, not production)

**Baseline:** remote `main` head `b063e58230cd257fee92707b24cfb778bf18c6d6` (Phase 2E).
No Phase 1/2A/2B/2C/2D/2E file was modified. No production bank, manifest, or
consolidated file was modified. Candidate outputs live only in
`pwa/data/ncert_8_2_candidates/` and are **not** production banks.

## The command

From `pwa/`:

```
NCERT_PDF_DIR=/path/to/ncert_pdfs node tests/generate_candidate_banks.js
```

Optional: `--pdf-dir <dir>` and `--out-dir <dir>` flags. The command verifies
all eight PDF SHA-256 hashes **before processing anything** and aborts with a
clear error, writing nothing, if any PDF is missing or mismatched. Per chapter
it runs: `extractPageLayout` per page → `buildStructuredDocument` →
`reconstructDocument` → `buildTypedKnowledgeFromReconstructedUnits` (default
adapter options) → `coverageBuilder.buildCandidateBank` (Chapter 3 additionally
links the untouched 160-entry inventory via the Phase 2A matrix). Outputs
contain no timestamps and no absolute paths.

## What was built

- `pwa/engine/coverageBuilder.js` (new): pure, deterministic builder.
  `adaptTypedFact` hoists typed facts into the production fact shape (verbatim
  evidence into both `source_text` and `supporting_excerpt`, section/page,
  extraction method, confidence, polarity/precision, temporal scope,
  attribution; ids namespaced `ADP-<chapter>-<TF-REC-id>`). Pipeline: adapt +
  prefilter → conflict detection → production `buildQuestionCandidates` →
  single-choice only (structured forms counted, not emitted) → full
  `validateQuestion` per candidate → one candidate per fact (direct subtypes
  preferred) → stem baking → stem-collision resolution → answer-key rotation
  by question index mod 4 → full re-validation after rotation → ids
  `Q-CAND-<chapterNum>-<NNN>`.
- `pwa/tests/generate_candidate_banks.js` (new): the command above, plus a
  staged-schema-compatible markdown renderer (Subtype, Difficulty, Cognitive
  Category, Answer Key, Fact, Source page/unit/blocks/evidence source,
  Generation Rule, Stem, Options, Supporting Textbook Excerpt, Explanation).
- `pwa/tests/test_coverage_engine.js` (new, wired into `npm test`): 19 checks.
- `pwa/engine/generator.js` (additive changes only, no existing behaviour
  altered):
  - `entityStem`: 12 new relation stems (`built_by`, `built_in`, `made_by`,
    `developed_in`, `renowned_for`, `characterised_by`, `attribute`,
    `features`, `has`, `had`, `offered`, `used_for`). Every pre-existing stem
    is byte-identical. This was the single largest measured blocker: before
    it, 25 of 38 adapted Chapter 3 facts produced zero raw candidates because
    the maker had no stem for the typed layer's relation vocabulary.
  - `dateStem`: fallback for facts without `event_base` (typed date facts).
    Without it, such facts rendered "undefineded" in the stem — found in a
    real Chapter 3 caption question and fixed before reporting. Production
    date facts always carry `event_base`, so this branch never triggers for
    them (verified: no "undefined" string exists in any staged bank).
- `pwa/package.json`: test chain extended with `test_coverage_engine.js`.

## Design choices (routine engineering decisions, recorded)

- **Context is baked into stems.** The shipped question schema has stems only
  and no context field, so section context, source attribution, and temporal
  scope are baked into the stem itself (section first, then attribution, then
  the stem, then scope as a trailing clause). The app's question model was
  not redesigned in this milestone.
- **Section titles are filtered, not trusted blindly.** `isCleanSectionTitle`
  rejects fragment titles (length, trailing punctuation, ellipsis, single
  word) plus, after inspection, fused headings (a lowercase content word
  followed by a capitalised word, e.g. "Shift to secondary and Attracts
  people"), clause headings (over 6 words, or a lowercase finite verb, e.g.
  "Guru Nanak journeyed across regions, spreading the message"). Rejection
  loses only the section prefix, never the question.
- **Validation runs with empty sections.** Evidence spans from the adapter
  are unit-relative and 3 of 40 Chapter 3 facts have spans that do not slice
  to their evidence, so the validator's `source_offsets` check (which needs
  section text) is inapplicable; it is skipped by passing no sections. All
  other evidence checks apply in full, and unit/block/page traceability
  compensates.
- **No new extraction rules, no V2 items, no production changes.** Coverage
  in this milestone comes from converting the existing 300 typed facts.
  Structured forms (multi-statement, Assertion–Reason as a rendered form is
  emitted only where the maker produces a single-choice question; multi,
  matching, chronology, table forms) are counted in the validation summary
  but not emitted. Timeline and map facts remain zero by design.
- **Stem-level vs fact-level filtering.** Facts removed from the registry
  stop contributing distractors. Measured 2026-10-27: prefiltering
  bare-generic subjects ("the mosque", "the palace") starved a good Jama
  Masjid question of its only same-section distractor. So subject-quality
  problems that live in the *stem* ("the city", "Given below") are filtered
  at the finished-question stage (`weak_stem`), while facts stay in the
  distractor pool. Fact-level prefilters are reserved for facts that are
  unusable as facts (missing fields, chart-label dumps, mangled objects).

## Results: candidate banks (106 questions from 300 typed facts)

| Chapter | Facts | Accepted | Rejected | Structured (not emitted) | Not selected per fact |
|---|---|---|---|---|---|
| hees201 World Geography | 69 | 24 | 13 | 15 | 10 |
| hees202 Independence | 43 | 13 | 3 | 14 | 7 |
| hees203 Architecture | 40 | 15 | 7 | 14 | 6 |
| hees204 Judiciary | 30 | 16 | 0 | 16 | 5 |
| hees205 Citizenship | 26 | 13 | 0 | 14 | 6 |
| hees206 Population | 26 | 7 | 2 | 14 | 7 |
| hees207 Urban Landscape | 27 | 5 | 3 | 19 | 7 |
| hees209 Cultural Currents | 39 | 13 | 6 | 23 | 6 |
| **Total** | **300** | **106** | **34** | **129** | **54** |

Rejection rules across the corpus (one candidate can carry two rules):
`fragment_excerpt` 11, `length_giveaway` 10, `figure_reference` 8,
`stem_source_reference` 5, `answer_contradicts_excerpt` 1. Stem collisions:
0. Duplicates removed: 0. Post-rotation failures: 0. Stem-bake fallbacks: 0.
Weak-stem filtered: 4. Mangled-answer filtered: 0 (the one mangled fact was
caught earlier as `mangled_object`).

Fact dispositions (all 300 facts, exactly one state each): covered 106,
`no_valid_candidate` 135, `weak_subject` 30, `fragment_excerpt` 10,
`figure_reference` 6, `length_giveaway` 6, `weak_stem` 4,
`stem_source_reference` 1, `answer_contradicts_excerpt,stem_source_reference`
1, `mangled_object` 1.

The dominant loss is `no_valid_candidate` (135): makers return no candidate
for the fact. The measured causes, in order: relations the makers cannot
phrase (partly fixed by the 12 new stems; remaining cases are bare-definite
subjects the maker correctly refuses, membership-list gaps, and
distractor-pool exhaustion in small sections), followed by validation
rejections above. This is a conversion bottleneck, not a counting problem.

## Results: Chapter 3 coverage against the 143 denominator

Inventory untouched (160 entries). Statuses reconcile exactly:

| Status | Count |
|---|---|
| Covered (≥1 validated question, strict link) | **8 (5.6% of 143)** |
| Source evidence exists but cannot yet be safely converted | 57 |
| Source evidence or extraction incomplete | 78 |
| Requires human review | 1 |
| Excluded (not question-suitable) | 16 |
| **Total** | **160** (denominator 143 = 8 + 57 + 78) |

Link methods (only these count as confirmed coverage; partial similarity
never counts): `block_match` (question fact shares a Phase 2A block match)
0, `evidence_span_match` (question evidence literally contained in the
entry's quoted source span, same page) 8, `page_content_match` (same page +
every distinctive word + subject overlap) 0. Covered entries: INV-3-010,
INV-3-011, INV-3-013, INV-3-029, INV-3-048, INV-3-059, INV-3-086, INV-3-110.

Two honesty notes on this number:

1. An earlier run showed 9 covered. The ninth (INV-3-154, the Fig. 3.52
   caption entry) was covered only by a broken question (stem rendered
   "undefineded"; subject "a general view of the Madras High Court"). Both
   defects were fixed, the question correctly disappeared, and the entry
   moved to `evidence_exists_unconverted` (its facade fact exists but
   converts to no question). Corrected coverage is 8, not 9.
2. The 57 `evidence_exists_unconverted` entries use a deliberately weak
   bar, stated here exactly: the entry shares at least one distinctive word
   (length ≥ 4, not a stopword) with a typed fact on the same page. It is an
   upper bound on "evidence exists", not a claim that those points are
   nearly covered. A looser word-overlap estimate (≥80% of entry words in a
   question excerpt) touches only 5 entries, one of them (INV-3-090) outside
   the strict 8 — so strict linking is not materially under-counting.

Gap causes, in order: (1) only 40 typed facts exist for 143 question-worthy
points — most points have no typed fact at all; (2) of those 40, 15 convert
to questions and 25 do not (figure-referencing evidence 5, weak subjects 5,
no valid candidate 14, fragment excerpt 1 — dispositions in
`traceability.json`); (3) of the 15 questions, 8 link to inventory entries
under the strict rules and 7 do not (their facts cover points the inventory
describes differently, or at a different granularity). No chapter is fully
covered, and none is claimed to be.

## Inspection findings: correctness failures found and fixed

Every bank was inspected question by question for stems, answers,
distractors, and excerpts (not just aggregate counts). Four clear failures
were found in real output and fixed in code with regression tests, then the
banks were regenerated:

1. **Chart-axis label dump as a question (hees206).** A fertility-rate
   chart's fused axis labels became a "question" whose four options were
   identical label dumps differing only in the final year. Fixed: prefilter
   rejects any fact whose object carries ≥ 3 year tokens
   (`chart_label_dump`). This is the known Phase 2E mid-passage chart-label
   fusion case, now blocked at the question layer.
2. **"Given below" as a question subject (hees201).** Evidence "Given below
   are two projections." produced "which of the following correctly
   describes Given below?" Fixed: stem-level filter (`weak_stem`) for
   discourse-fragment stems.
3. **"The city" as a question subject (hees207).** "which of the following
   correctly describes the city?" names no city. Fixed: stem-level filter
   for bare definite generic nouns (city, town, village, river, mountain,
   district, site, mosque, palace, temple, fort, building, structure,
   church, tomb, monument), with a guard keeping "the building of X"
   constructions. The same filter removed 3 hees207 questions and 1 hees201
   question; their facts remain in distractor pools.
4. **Mangled correct answer (hees205).** "What does Living in a place make
   possible?" had correct option "you a resident, but citizenship is a
   formal, legal membership in a country" — the verb was lost in extraction.
   Fixed: prefilter rejects objects starting pronoun + article
   (`mangled_object`), so the text cannot become a question or leak into
   other questions' distractors; a candidate-level backstop
   (`mangled_answer_filtered`) covers maker-introduced cases.
5. **"Undefineded" date stem (hees203).** See generator.js change above.
   Also fixed: temporal-scope baking now supplies the missing preposition
   ("develop, classical times?" → "develop, in classical times?"), while
   scopes that already carry one ("until the 8th century") are unchanged.
6. **Fused/clause section titles baked into stems (hees207, hees209).**
   "In Shift to secondary and Attracts people, …" and "In Guru Nanak
   journeyed across regions, spreading the message, …" Fixed by the
   title guards above; affected questions keep their validated unbaked stems.

Deliberately **not** changed (weaknesses, not errors): Assertion–Reason
items pair unrelated true statements (e.g. Baba Ram Singh's arrest with
Aurobindo Ghose's principalship) and key them "both true but R is not the
correct explanation of A". No AR key in the corpus claims a false
explanation link (verified: zero AR questions keyed "R is the correct
explanation of A" were found to be mismatched — in fact no AR question in
the corpus is keyed that way at all). The items are valid but test
explanation-judgement weakly; pairing quality is production-maker behaviour
left for a future phase. "What did Temples have?" (capitalised generic
plural) and "which of the following correctly describes Mosques?" are
awkward but intelligible and source-grounded; left as-is.

## Verification

- **Determinism:** two full runs into separate directories are byte-identical
  (`diff -r` clean) across all 12 output files.
- **Full test suite green, exit 0:** engine, integration, processing,
  revision, reasoning V2 suites; Repair 002 (83 + 3); Phase 2A (16), 2B (18),
  2C (41), 2D (43), 2E (28); coverage engine (19, new).
- **Production banks unchanged:** all 8 staged banks, the consolidated file
  (`b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87`),
  and the manifest (`2a17f7b1b7dba7bbf426e66e96ab26f5315ef9a3dedf7b6ea939a6facc6a3669`)
  re-hashed byte-identical, including hees203
  (`94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4`).
- **Change set:** created `pwa/engine/coverageBuilder.js`,
  `pwa/tests/generate_candidate_banks.js`,
  `pwa/tests/test_coverage_engine.js`, `pwa/data/ncert_8_2_candidates/`
  (12 files), this report; modified `pwa/engine/generator.js` (additive
  only) and `pwa/package.json` (test chain). `git status` 65 → 70 lines
  (4 new entries + this report); all other modified entries pre-date this
  milestone (snapshot-push precedent: local HEAD is stale at Repair 001).

## Limitations that genuinely remain

- **Browser layout path still unverified.** All layout results use the
  vendored pdf.js build under Node only. No parity with a real browser run
  is claimed; the exact browser test from Phase 2E §11 is still outstanding.
- **Weak typed subjects persist** as a known limitation (e.g. "used waters",
  "the main alignment" produce no questions, correctly, but the underlying
  facts stay weak).
- **Structured question forms are counted, not emitted** (129 multi/matching/
  chronology/table candidates in this run). Emitting them needs renderer
  work per form.
- **Second-claim-in-typed-segment limitation unchanged** from Phase 2E.
- **Timeline/map facts remain zero by design** (no inferred pairings).
- **No gold-standard coverage is claimed for the other seven chapters:**
  they have candidate banks + diagnostics only, no validated inventory.
- **Coverage is low and honestly so: 8 of 143 for Chapter 3.** The binding
  constraint is now typed-fact coverage (40 facts for 143 points), not
  question conversion. Further gains need more typed facts per point
  (extraction/parser coverage), not more aggressive linking or weaker
  validation.

## Recommended next step

Typed-fact coverage expansion for Chapter 3, measured against the same 143
denominator: membership-list parser coverage (the 5 remaining Phase 2D lost
facts are of this class), caption claims beyond facade features (the
Fig. 3.52 entry INV-3-154 is the concrete case), and "has"-attribute /
relative-clause patterns that still leave facts unparsed — each landed only
if it raises the strict-linked covered count without weakening any
validator. In parallel, the real-browser layout confirmation should be run
before any candidate bank is promoted toward production.
