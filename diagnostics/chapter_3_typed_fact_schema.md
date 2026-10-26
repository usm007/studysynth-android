# StudySynth Phase 2A — Typed-Fact + Unparsed-Unit Schema

Version: `phase2a-1`. Implementations: `pwa/engine/generator.js`
(`buildTypedKnowledge`, `parseAllFactRelations`, `classifyTypedDraft`),
`pwa/engine/documentModel.js` (`buildStructuredDocument`),
`pwa/engine/reasoning/representation.js` (`classifyPropositionEligibility`).

This schema is diagnostic/telemetry in Phase 2A. It does **not** feed
`buildQuestionCandidates`, distractor selection, or validation, so it
cannot change which questions are accepted or rejected. The one
production-facing boundary it informs is the V2 proposition gate, which
is quantified in `CHAPTER_3_PHASE_2A_RESULTS.md`.

## 1. Governing principle

Every extracted source block and every meaningful text unit has exactly
one traceable disposition:

- preserved as a usable block (document model), or
- converted to typed knowledge records, or
- preserved as an unparsed unit with an explicit reason, or
- classified as intentionally excluded with an explicit reason, or
- marked `REVIEW_REQUIRED` / `review_required`.

Nothing meaningful disappears between stages. Unparsed material is never
misrepresented as a confidently extracted fact. A sentence is not a fact
merely for containing a noun and a verb.

## 2. Structured document model (`documentModel.js`)

Built from `pdfParser.extractPageLayout` output — the same parsing path
the browser/worker uses. The production text path is untouched: the batch
keeps receiving exactly the `bodyText` it receives today.

### 2.1 Block record

| Field | Meaning |
|---|---|
| `block_id` | Stable within a run: `<document_id>:<classifier block id>` (e.g. `hees203:p14-b30`). |
| `source_block_id` | The classifier's own block id (`pN-bM`). |
| `page` | PDF page number (1-based). Page boundaries are data, never section boundaries. |
| `type` | Classifier type: `body`, `heading`, `caption`, `table`, `diagram`, `fragment`, `ambiguous`, `page_furniture`. |
| `text` | Original block text, whitespace-collapsed. Never rewritten by the model. |
| `bbox`, `item_count`, `confidence`, `classification_reason` | Geometry and classifier diagnostics, carried through when present. |
| `disposition` | Exactly one of §2.2. |
| `disposition_reason` | The deterministic reason for the disposition (§2.2). |
| `section_id`, `section_title` | Semantic section from headings (§2.3), or `sec_unknown` before the first heading. |
| `eligible_for_fact_extraction` | True only for `body` blocks. Headings define sections; captions/tables/diagrams are structured evidence; fragments/ambiguous blocks are preserved but never sent to the fact extractor as assertions; furniture is excluded. |
| `list_items` | Item strings when a body block matches the conservative list detector (≥2 explicit markers, each item 2–300 chars), else `null`. |
| `table_rows` | Cell arrays when the block parses as rows (` ; `) × cells (` | `) with a uniform column count, else `null` (block preserved, relationship flagged unresolved). |
| `association` | For captions: `{ figure_ref, body_block_id, evidence }` when a same-page body block references the figure, else `null` + review flag `caption_unassociated`. Association is never guessed from proximity alone. |
| `review_flags` | `needs_review` (ambiguous), `table_relationship_unresolved`, `caption_unassociated`, `possible_furniture_contamination` (running-title pattern inside a body block; text is flagged, never rewritten). |

### 2.2 Dispositions (exactly one per block)

| Disposition | Reason | Applies to |
|---|---|---|
| `included_prose` | `body_text` | Body blocks. |
| `included_prose` | `section_heading` | Heading blocks that open a new section. |
| `preserved_repeated_heading` | `repeated_heading_not_new_section` | A heading whose normalized text equals the current section title (e.g. NCERT running heads). Preserved, keeps the current section, opens nothing. |
| `included_caption` | `caption_first_class` | Caption blocks. First-class: never concatenated into prose. |
| `included_table` | `table_rows_parsed` / `table_relationship_unresolved` | Table blocks, by whether rows parse. |
| `included_diagram_visual` | `diagram_visual_dependency` | Diagram blocks. Visual content is recorded as a dependency, never manufactured from labels. |
| `preserved_fragment` | `fragment_preserved_not_assertion` | Fragment blocks. |
| `preserved_ambiguous` | `ambiguous_preserved_for_review` | Ambiguous blocks (also flagged `needs_review`). |
| `excluded_furniture` | `page_furniture` | Page furniture (running headers/footers/page numbers). Exclusion records are kept; the block text is preserved in the model even though it is excluded from prose. |

Accounting rule: disposition counts sum to the total block count, per
page and for the document (`reconciliation.ok`). Block counts,
sentence counts, fact counts, candidate counts and question counts are
never mixed into one rejection total.

### 2.3 Sections and source identity

- Sections come **only** from heading blocks. A page break never creates
  a section, and a repeated heading never creates a duplicate section.
- Section IDs are `docsec_001`, `docsec_002`, … in order of first
  appearance within the run. They are never derived from page numbers.
- Blocks before the first heading get `section_id: sec_unknown` — an
  explicit unknown state, never a fake page-slice boundary.
- A knowledge unit is traceable to: document ID, PDF page,
  section ID, sentence/clause ID (`ku_id`), and exact evidence with
  section-relative character spans (`evidence_span`, `object_span`).
  Block IDs are attached when the block mapping is available; the typed
  layer itself works on parsed sections, so its `block_ids` field is
  empty and block linkage is computed by evidence matching in the
  harness (see §6).
- Cross-page continuations are recorded as candidates only
  (`from_block_id`, `to_block_id`, `support: strong|weak`): the last
  body block of a page ends without terminal punctuation and the first
  body block of the next page starts lowercase. Text is **never**
  merged in Phase 2A; both parts keep their own page/block references.
  Merging is deferred to a later phase with stitching rules.

## 3. Typed facts (`buildTypedKnowledge`)

One record per accepted parser draft. A unit may yield several facts;
multi-claim units are flagged (`multi_claim_unit`), never collapsed.

| Field | Meaning |
|---|---|
| `fact_id` | `TF-LITE-###`, sequential in unit order, deterministic. |
| `source_fact_ids` | Production baseline facts for the same unit with the same type, normalized subject and normalized object (comparison aid; may be empty). |
| `fact_type` | One of §3.1. |
| `subject`, `relation`, `object` | Raw (parser-cleaned) subject, relation, object/value. |
| `normalized_subject`, `normalized_relation`, `normalized_object` | Production normalizers (`normalizeSubject`, `normalizeRelation`, `normalizeObject`). |
| `evidence` | The exact source sentence text. |
| `evidence_span` | `{ start, end }` offsets of the sentence within its section text. |
| `object_span` | `{ start, end }` of the object within the section text (falls back to the sentence span when the object is not found verbatim). |
| `source` | `{ document_id, page, section_id, section_title, block_ids, sentence_id (ku_id), table_id?, table_header?, table_row? }`. `page` is the section's page (production sectioning), not necessarily the sentence's own page — see limitation L5. |
| `qualifiers` | `{ polarity, precision, numeric_kind, relation_verb, causal_direction, attribute, temporal_scope, comparison, members, sequence_items }`. Each is carried from the draft when present, else a documented default (`positive`, `exact`, `null`). See §3.2. |
| `classification` | `{ method: draft.extraction_method, rule_id: 'phase2a-typed-v1' }`. |
| `validation_state` | `factConfidenceClass` result: `verified`, `ocr-confirmed`, or `ocr-unverified`. For textbook input this is `verified`. |
| `multi_claim_unit` | True when the unit produced more than one typed fact. |

### 3.1 Supported fact types

`date`, `numeric`, `definition`, `entity_attribute`, `membership`,
`sequence`, `causal`, `comparison`, `table`. Deliberately absent:
`fallback`. An unclassified unit is an unparsed unit (§4), never a fact.

### 3.2 Relations and qualifier preservation

- A relation is supported when it is nonempty and not `unclassified`.
  Relation vocabularies are the parsers' own (e.g. `location`,
  `initial_location`, `destination_location`, `numeric_value`,
  `establishment_year`, `completion_year`, `move_year`, generic verbs
  such as `originates_from`, `protects`).
- Qualifiers are never stripped or coerced by the typed layer:
  - **Negation** survives as `polarity: negative` (numeric drafts detect
    a governing negation in the quantity prefix; causal drafts with a
    negated causal verb are rejected by the parser, not flipped).
  - **Approximation** survives as `precision: approximate` (never
    rewritten to exact).
  - **Values + units** survive verbatim in `object` (e.g. `2,500 km`,
    `100 cm`); `numeric_kind` records currency/percentage/measurement/
    count.
  - **Dates/periods** survive as the date object with a typed relation
    (`establishment_year`, `move_year`, …); `temporal_scope`
    (`initial`/`later`) is carried for initial-move facts.
  - **Comparison direction** survives in `comparison` and the
    comparative relation; **relationship direction** in
    `causal_direction` (`cause_to_effect` / `effect_because_cause`).
  - **Conditions** survive on conditional drafts; **modality/scope**
    via `polarity`, `precision`, `temporal_scope`.
- Known production-parser artifact, carried unchanged (not repaired in
  Phase 2A): a causal fact's coarse `relation` is `causes` even when
  the source verb is contributory; the original verb is preserved in
  `relation_verb` (`contributes to`, `influences`, …) and in V2
  predicates. The typed layer does not re-collapse anything itself, but
  it does not rename the parser's label either. Finer-grained causal
  relations are next-phase work.
- A sentence with multiple independently supported claims keeps every
  distinct claim: `parseAllFactRelations` runs every parser without
  production's early returns (sequence, initial-move, cause/conditional/
  comparison acceptance no longer stop later parsers). The two weaker
  fallbacks (generic relational verb, pattern-enriched) still run only
  when nothing else matched, and numerics still run only when no dates
  matched — those guards prevent over-splitting into invented
  relationships. Claims inside sequence items that do not match a
  whole-sentence parser are not separately typed, but they are not
  lost: the sequence fact preserves them in `sequence_items`.

## 4. Unparsed units

One record per source unit that produced **zero** typed facts.

| Field | Meaning |
|---|---|
| `unparsed_id` | `UU-LITE-###`, sequential, deterministic. |
| `source_unit_id` | The unit's `ku_id`. |
| `original_text` | The exact unit text. |
| `source` | `{ document_id, page, section_id, section_title, sentence_span }`. |
| `sentence_role` | `assertion`, `interrogative`, `instruction`, or `ambiguous`. |
| `reason` | One code from §4.1 (the unit's first rejection reason). |
| `detail` | Human-readable reason detail (e.g. the subject-quality code). |
| `classification_attempts` | Every draft/attempt for the unit with its outcome, so a rejected unit's full history is inspectable. |
| `potential_learning_relevance` | True when the unit is an assertion of ≥20 characters — a triage flag for later phases, not a quality judgement. |
| `related_units` | `{ previous_unit_id, next_unit_id }` in document order. |

Units that produced ≥1 typed fact but also had rejected drafts do **not**
become unparsed units; their rejected drafts are recorded separately as
`partial_rejections` (with reason + detail), so unit denominators never
double-count: `units_typed + units_unparsed = units_total`.

### 4.1 Reason-code taxonomy (deterministic)

| Code | When it applies |
|---|---|
| `unsupported_pattern` | Assertion unit, no parser produced a draft. |
| `missing_subject` | A draft exists but has no subject. |
| `missing_object` | A draft exists but has no object/value. |
| `fragment` | Unit or draft is a sentence fragment: lowercase start, missing terminal punctuation, fragment subject (pronoun start, dummy pronoun, unit fragment, fronted modifier, finite-verb subject, dangling correlative, question-word subject, vague reference), or fragment object. |
| `ambiguous_relation` | Sentence role is `ambiguous` (exercise markers, discourse pointers, ≤2-word units, etc.). |
| `interrogative_or_instruction` | Sentence role is `interrogative` or `instruction`. |
| `cross_page_continuation_unresolved` | Lowercase-start unit after an unterminated unit on an **earlier** page. Same-page lowercase starts are `fragment`. |
| `layout_relationship_unresolved` | Pipe-delimited unit outside any clean table group (ragged table row), or a subject that is a layout artifact (running furniture, map legend, figure/table reference, all-caps label concatenation, compass sequence, numeric map artifact, page-number prefix). |
| `visual_dependency` | (Reserved for visually dependent content; diagram blocks carry this as a disposition reason in the document model. Sentence units from visual-only content surface here when identified.) |
| `classification_conflict` | A draft fails subject quality with a code that is neither fragment-like nor a layout artifact. |
| `insufficient_evidence` | (Reserved; not emitted by the Phase 2A typed layer.) |
| `furniture_contamination` | **Phase 2A extension, documented here.** The unit contains a running book title merged into body text (`Exploring Society … Grade …`, `| G rade`, `Exploring Society:`). Checked before the pipe test, because merged furniture contains a `|` that is not a table divider. |

Subject-quality codes map to reasons as follows: fragment-like codes
(`TOO_SHORT`, `INVALID_START`, `TERMINAL_PUNCTUATION_FRAGMENT`,
`INTERNAL_SENTENCE_BOUNDARY`, `FORBIDDEN_START_WORD`, `DUMMY_PRONOUN`,
`UNIT_FRAGMENT`, `FRONTED_MODIFIER`, `DISCOURSE_FRAGMENT`,
`QUESTION_WORD_SUBJECT`, `FINITE_VERB_SUBJECT`,
`DANGLING_CORRELATIVE`, `VAGUE_REFERENCE_SUBJECT`,
`IMPERATIVE_SUBJECT`, `UNBALANCED_QUOTES`, `UNBALANCED_PARENS`,
`INSUFFICIENT_LETTERS`, `DANGLING_CONNECTOR`) → `fragment`;
artifact codes (`RUNNING_FURNITURE`, `MAP_LEGEND_ARTIFACT`,
`ALL_CAPS_LABEL_CONCATENATION`, `NUMERIC_HEADER_PREFIX`,
`CALLOUT_BANNER_ARTIFACT`, `FIGURE_REFERENCE_ARTIFACT`,
`NUMERIC_MAP_ARTIFACT`, `COMPASS_DIRECTION_SEQUENCE`,
`EXCESSIVE_SINGLE_LETTERS`) → `layout_relationship_unresolved`;
anything else → `classification_conflict`.

## 5. V2 graph boundary (`representation.js`)

Only eligible, validated typed facts become propositions.
`classifyPropositionEligibility(fact)` returns `{ eligible, reason }`:

- Ineligible: `missing_fact`, `fallback_unclassified` (type or method
  `fallback`), `missing_subject`, `missing_object`,
  `fragment_subject` (bare pronoun or preposition/conjunction start),
  `fragment_object` (same test on the object), `conflicting_values`
  (`conflict_status: conflicting`), `ocr_unverified`.
- Eligible otherwise. Polarity and precision do **not** block
  eligibility: negative and approximate propositions are meaningful
  and their qualifiers are preserved on the proposition.
- `mapFactToProposition` returns `null` for ineligible facts.
- `compileSemanticRepresentation` records every rejection in
  `graphRejections` (`{ source: fact_bridge|direct_extraction,
  fact_id, reason, subject, source_page, section_id }` or, for direct
  extraction, `source_sentence` + `rule_id`). Previously silent skips
  (non-assertion role, fragment causal) are now also recorded
  (`non_assertion_role`, `fragment_causal`). Direct extraction has a
  narrow guard only: empty or bare-pronoun subject/object.
- The return value gains the additive field `graphRejections`;
  `.propositions` and `.count` are unchanged in meaning.
- `engine_v2.js` surfaces `graphRejectionCount` and
  `graphRejectionsByReason` in generation metrics (additive telemetry).

This boundary is an intentional behaviour change for future V2
regeneration: chapters that currently ship V2 items built partly from
fallback-derived propositions will regenerate fewer V2 candidates. The
Phase 2A diagnostic quantifies it for Chapter 3 (180 → 28 propositions,
0 → 0 accepted candidates). Bank files are never rewritten by the gate.

## 6. Reference-inventory connection

Four concepts stay separate:

1. **Reference inventory** — the human-reviewed expected points
   (`chapter_3_knowledge_inventory.json`, 160 entries; provisional
   regression fixture, never rewritten by the extractor).
2. **Runtime source inventory** — blocks/sections/units the engine
   extracts (document model + `collectSentenceUnits`).
3. **Typed knowledge inventory** — reliably representable facts
   (`typed_facts`).
4. **Question coverage matrix** — the fresh versioned matrix
   (`chapter_3_phase2a_coverage_matrix.json`); the Phase 1 matrix is
   preserved untouched.

Matching (deterministic, in the Phase 2A harness):

- `exact_span` — the quotation (whitespace-collapsed) is a substring
  of exactly one block's text.
- `normalized_text` — the normalized quotation (lowercased,
  punctuation-stripped) is a substring of exactly one block's
  normalized text.
- `ambiguous_review` — more than one block matches: disposition
  `review_required`, no block silently picked.
- `unresolved_match` — no block matches: disposition
  `unresolved_match`, with `unresolved_class` `spanning_blocks`
  (quotation appears contiguously in the joined block text) or
  `absent_from_layout_text`, plus `page_word_overlap` (fraction of the
  quotation's content words present in the entry's own page blocks —
  a matcher-limitation signal, not a match claim).
- Typed-fact linkage: a typed fact links to a matched block when its
  normalized evidence is a substring of the block's normalized text.
  `linked` does **not** mean question-covered.
- Question coverage verdicts are **carried** from the Phase 1 matrix
  (`coverage_status`) with provenance, not re-judged in Phase 2A.

## 7. Accounting denominators

- Document level: pages encountered; blocks by type; blocks with usable
  text; blocks excluded; blocks requiring review; dispositions by type
  and reason; sections/paragraphs reconstructed; continuation
  candidates (strong/weak).
- Fact level: sentence/clause units discovered; units by role; units
  typed / unparsed / table; typed facts by type; typed facts with
  complete evidence; units producing no facts by reason; units
  producing multiple facts; partial rejections by reason; facts
  eligible for and admitted to the V2 graph (via §5).
- Baseline comparison (same sections): production facts total, usable,
  fallback, table — so old-vs-new deltas are computed on identical
  inputs, never across different runs.
- Coverage level: reference entries total (160); block-matched /
  ambiguous-review / unresolved; typed-linked / unlinked; question
  coverage carried from Phase 1 (denominator 143 question-worthy).
  Never claim comprehensive coverage merely because every typed fact
  has a question; extracted material and important source content are
  different denominators.

## 8. Known limitations of this schema version

- **L1 — Structural validity is not semantic quality.** Typed facts
  pass subject/object structural gates, but weak subjects
  (`people`, `years`, `used waters`) still pass. Semantic subject
  validation is next-phase work.
- **L2 — Typed `page` is the section's page.** Production sections
  are page-flushed, so a typed fact's `source.page` is the page where
  its section started, not necessarily the sentence's own page.
  Sentence-level page attribution needs section reconstruction from
  the document model (next phase).
- **L3 — Single-block matching only.** Reference quotations spanning
  blocks, or differing in word order/punctuation, do not match; the
  fuzzy overlap signal exists but is not a match claim.
- **L4 — Caption association is conservative.** Only same-page
  explicit figure references associate; proximity and figure-prefix-less
  captions stay unassociated for review.
- **L5 — No timeline, glossary, or visual parsers.** Timeline
  label-value-date relationships, margin glosses, and map content have
  no typed representation in this version and stay explicitly
  unresolved — by design, not by oversight.
- **L6 — Browser path.** Layout classifications in Phase 2A come from
  the vendored pdf.js build under Node (the same code the
  browser/worker uses) with the batch's polyfills. A real browser run
  has not been performed; browser behaviour is not claimed from Node
  tests alone.
