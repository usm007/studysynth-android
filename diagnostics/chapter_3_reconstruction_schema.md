# StudySynth Phase 2B — Reconstructed Source Unit Schema

Version: `phase2b-1`. Implementation: `pwa/engine/sourceReconstruction.js`
(`reconstructDocument`), typed adapter
`pwa/engine/generator.js` (`buildTypedKnowledgeFromReconstructedUnits`).

## 1. What a reconstructed unit is

A reconstructed unit is a NEW derived representation built from Phase 2A
document-model blocks. It never overwrites a block's text and never
changes a block's disposition. Original blocks stay exactly as the
document model recorded them; the unit records how they were grouped
and what was excluded, so every reconstruction decision is auditable.

## 2. Unit record

| Field | Meaning |
|---|---|
| `unit_id` | Stable ID: `RU-` + zero-padded sequence in document order. Deterministic: same blocks in, same IDs out. |
| `type` | `body_prose` \| `list` \| `table` \| `caption` \| `glossary_definition` \| `cross_page_continuation` \| `cross_page_continuation_candidate` \| `unresolved`. |
| `text` | Reconstructed text (joined blocks, punctuation-spacing normalised; see §4). Empty for weak cross-page candidates (text deliberately NOT merged). |
| `block_ids` | Ordered source block IDs that compose the unit. |
| `fragments_used` | Per block: `{ block_id, text, role }`. `text` is what was USED (for rescued furniture tails, the tail only). |
| `fragments_excluded` | Blocks inside the unit's y-span that were NOT used (e.g. a caption interleaved in y-order), each with a reason. |
| `pages` | `[page]` for single-page units, `[from_page, to_page]` for cross-page units. |
| `section_id`, `section_title` | Majority section among contributing blocks — EXCEPT passages containing a demoted heading, which take the section of their first non-demoted block (flagged `section_corrected_from_demoted_heading`). `sec_unknown` when genuinely unknown. |
| `method` | Human-readable reconstruction method (e.g. `column_passage_join`). |
| `rule_id` | Stable rule identifier, e.g. `reconstruct-v1/column-passage`. |
| `certainty` | Deterministic certainty class (see §5) with `certainty_explanation`. |
| `review_flags` | E.g. `contains_demoted_heading`, `glossary_building_link_not_inferred`, `merged_text_overlaps_passages`, `cross_page_weak_unmerged`, `no_body_anchor`. |
| `figure_ref` | Captions only: `fig 3.52` etc. (normalised `fig <number>`). |
| `term`, `definition` | Glossary units only: the term before the colon and the definition after it. |
| `table_rows` | Table units only: rows as cell arrays, or `null` when unresolved. |
| `provenance` | Per contributing block: `{ block_id, page, type, text, bbox }` with the EXACT original block text (for rescued furniture tails, the full original text including the stripped furniture prefix) and its bbox (`x, y, width, height, x1, y1`, top-down y, PDF points). |

## 3. Rule order (each step claims blocks; later steps see leftovers)

| Rule | ID | Behaviour |
|---|---|---|
| Aggregate exclusion | `reconstruct-v1/aggregate-duplicate` | A table block containing ` \| ` is excluded when ≥90% of its words occur in granular blocks on the same page, or when it is a multi-row block taller than 2.5× median body height. Retained in `exclusions[]` for diagnostics; never a prose source. |
| Page numbers | `reconstruct-v1/page-number` | Pure-digit block, width ≤ 30pt, at a side margin (x ≤ 110 or x ≥ 520). |
| Spaceless running titles | `reconstruct-v1/spaceless-title` | Block with a spaceless token ≥ 25 chars that starts with a running book title (`OurCulturalHeritage…`, `ExploringSociety…`, …). Defeats the parser's spaced pattern and margin test; excluded wherever it sits. |
| Right-margin furniture | `reconstruct-v1/right-margin-column` | Block starting > 40pt beyond the page's own body right edge, height ≤ 0.75× median body height, with a spaceless token ≥ 25 chars. Uses the page's own body extent — never a fixed x-threshold. |
| Callout banners | `reconstruct-v1/callout-banner` | Short (≤ 40 chars) multi-word fragment with no lowercase letters and no digits (`DON'T MISS OUT`). The no-digits guard keeps date strings (`2600 BCE`) out of this rule. |
| Furniture-prefix strip | (part of furniture handling) | A furniture block whose text starts with a running-title prefix (`… | Grade 8 Part 2 `) has exactly that prefix stripped and the surviving tail kept as a fragment. Geometry cannot do this split (furniture and body x-intervals overlap). A furniture-only block (empty tail) is excluded whole. |
| False-heading demotion | (prose rule) | A `heading` block is demoted to a prose continuation iff: height ≤ 14.5pt (body line height; genuine NCERT headings are 17pt) AND x equals the modal body x (within 5pt) AND its predecessor ends without terminal punctuation AND its successor starts lowercase. Demoted headings join prose but never anchor a passage alone, and their section is corrected (see §2). |
| Caption stitching | `reconstruct-v1/caption-continuation` | A caption block plus its IMMEDIATE next unclaimed block in y-order, repeatedly, while: y-step ≤ 30pt, x-overlap ≥ 30pt, previous block does not end with terminal punctuation, and the next block starts lowercase or the previous block ends with a function word (`the`, `alongside`, …). Only the immediate successor is considered — skipping ahead stole a body block on p.14 in an earlier draft. The whole unit is caption-derived (`figure_ref` preserved); subjects are extracted only from inside the caption text. |
| Margin glosses | `reconstruct-v1/margin-gloss` | Fragment/ambiguous blocks linked by x-overlap (y-gaps ≤ 60pt), sitting entirely on one side of the unclaimed body column, whose joined text matches `Term: definition`. Joined in y-order with line-break de-hyphenation (`criss- crossing` → `criss-crossing`). A second `Term:` after a sentence end refuses the gloss. NO link to any nearby building or image is inferred from proximity (flagged). |
| Column passages | `reconstruct-v1/column-passage` | Remaining prose-eligible blocks (body, fragment, ambiguous, table word-blocks without ` \| `, demoted headings, rescued tails) grouped by column, joined in (y, x) order, split only when the previous block ends with terminal punctuation AND the next starts uppercase/Æ AND the y-top gap exceeds 60pt. A passage needs a body block or rescued tail to count as prose; otherwise it is an unresolved fragment passage. List-like passages (explicit markers only) become `list` units. |
| Column grouping | (prose rule) | With parser gutter stats: blocks strictly left of `gapStart` go left, strictly right of `gapEnd` go right, spanning/in-gutter blocks continue the previous block's cluster. Without gutter stats: span-proximity merging (within 40pt of a cluster's span; word gaps are ~27pt). |
| Table units | `reconstruct-v1/table-rows` / `reconstruct-v1/table-unresolved` | Surviving ` \| ` table blocks: rows parsed when every row shares a column count, else preserved unresolved with reason `table_relationship_unresolved`. |
| Leftovers | `reconstruct-v1/leftover-unresolved` / `reconstruct-v1/unresolved-fragment-passage` | Every unconsumed non-heading block becomes an explicit unresolved unit. Genuine headings are section markers, not units, and are counted in accounting instead. |
| Cross-page | `reconstruct-v1/cross-page-strong` / `reconstruct-v1/cross-page-weak` | From document-model continuations. Strong: merged text, flagged `merged_text_overlaps_passages` (parts also appear in per-page passages; merged facts are deduped by fact key in reporting). Weak: parts preserved and linked, text NOT merged. Continuations whose endpoint was excluded as furniture are skipped (recorded in `cross_page_continuations_skipped`). |

## 4. Text normalisation (joined text only)

Joined text collapses whitespace and repairs item-join punctuation
spacing (`Temple .` → `Temple.`, `( vāvs` → `(vāvs`). Diacritics,
hyphenation and `15 th` tokenisation are kept verbatim. Original block
texts in `provenance` are never normalised beyond whitespace collapsing.

## 5. Certainty classes

| Certainty | Meaning |
|---|---|
| `verbatim_column_join` | Prose passage from y-ordered blocks in one column. |
| `caption_stitched` | Caption + contiguous continuations. |
| `glossary_margin_column` | Margin-column `Term: definition` unit. |
| `table_rows_parsed` | Table with recovered rows/cells. |
| `cross_page_strong` | Merged strong cross-page continuation. |
| `unresolved_fragment` | Preserved but not interpretable as prose (fragment passage, leftover, weak continuation, unresolved table). |
| `unresolved_visual` | Diagram/visual block: relationships cannot come from text alone. |

## 6. Block accounting (reconciliation)

Every document block lands in exactly one bucket: `unit_block`
(in a unit's `block_ids`), `excluded:<reason>` (aggregate, furniture,
page number, callout, running title), `section_marker` (genuine
heading), or `stripped_furniture_tail` (original block whose tail is
in a unit). `reconciliation.ok` is true only when bucketed blocks
equal total blocks. Cross-page merged units re-reference passage
blocks and are NOT double-counted.

## 7. Typed-fact adapter record (shadow only)

`buildTypedKnowledgeFromReconstructedUnits(units, options)` feeds one
synthetic section per reconstructed unit through the UNCHANGED
`buildTypedKnowledge` gates, then remaps IDs and attaches provenance.
Unresolved units and weak cross-page candidates are never typed input
(they appear in `skipped_units`); units the segmenter reduces to zero
units appear in `dropped_units`.

| Field (added to the Phase 2A typed-fact `source`) | Meaning |
|---|---|
| `reconstructed_unit_id`, `reconstructed_unit_type` | The unit the fact came from. |
| `block_ids` | The unit's ordered block IDs. |
| `page_range` | `[page]` or `[from, to]`. |
| `evidence_source` | `reconstructed_prose` \| `caption` \| `glossary` \| `cross_page_merged` \| `table` \| `reconstructed_list`. |
| `typed_layer_fact_id` | The adapter-internal `TF-LITE-` ID before remapping. |
| `fact_id` | `TF-REC-<unit>-<n>`; unparsed units get `UU-REC-<unit>-<n>`. |

## 8. Reference-match levels (Phase 2B matrix)

1. `exact_span` — confirmed. 2. `normalized_text` — confirmed.
3. `multi_block_ordered_span` — confirmed (single reconstructed unit
contains the normalised quotation). 4. `candidate_fuzzy` — REVIEW ONLY
(best content-word overlap ≥ 0.80 with a unit on the entry's own page;
never auto-counted as coverage). 5. `ambiguous_review` — multiple
matches at the best level; review required, never an arbitrary choice.
6. `unresolved_match` — no match at any level.
