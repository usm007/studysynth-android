# StudySynth Phase 2C Results — Typed Knowledge Recovery from Reconstructed Sources

Shadow-only knowledge extraction on the Phase 2B baseline. No production
path, bank, stem, distractor, quota, candidate-selection, validation rule,
template, or V2 eligibility gate was changed. No LLM, network, or
nondeterministic operation was introduced.

- Baseline commit: `7fa41d1f7752f97a816be0931bf259b29eda848a` (Phase 2B).
- PDF: `ncert_pdfs/hees203.pdf`, 40 pages, SHA-256
  `547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec`
  (verified on every harness run; a mismatch aborts, never substitutes).
  The spec path `NCERT/hees203.pdf` does not exist in the checkout
  (`NCERT/` holds only `.gitkeep`); no PDF is committed to the repo.
- Harness: `diagnostics/tools/diagnose_chapter3_phase2c.js`. Machine-readable
  outputs: `diagnostics/chapter_3_phase2c_metrics.json`,
  `diagnostics/chapter_3_phase2c_typed_fact_comparison.json`.
- Tests: `pwa/tests/test_phase2c.js` (41 checks), wired into `npm test`
  via `pwa/package.json`. Full suite green (see §8).

## 1. Headline counts: Phase 2B baseline vs Phase 2C

| Measure | Phase 2B (adapter baseline options) | Phase 2C (defaults) |
|---|---|---|
| Reconstructed units in | 129 | 129 |
| Typed facts, raw | 21 | 29 |
| Typed facts, unique (deduped) | 20 | 28 |
| Duplicates discarded | 0 (diagnostic only) | 1 |
| Units with unique facts | 16 | 20 |
| Unparsed records | 380 | 372 |
| Typed-layer (bodyText) facts, for reference | 16 | 16 (unchanged) |

The adapter baseline run inside the 2C harness reproduces Phase 2B exactly
(21 raw, 20 unique), so the comparison below is measured, not quoted.

Typed facts by type — Phase 2C: definition 4 (was 1), entity_attribute 18
(was 14), membership 2 (unchanged), numeric 3 (unchanged), date 1
(unchanged). By evidence source — Phase 2C: reconstructed_prose 22 (was
18), caption 3 (was 2), glossary 3 (was 0), cross_page_merged 0 (was 1 —
the merged duplicate is now collapsed into its per-page fact, §6).

## 2. Retained / new / lost fact keys

Two key schemes are reported (both in the comparison JSON):

- **Phase 2B scheme** (`fact_type|normalized subject|normalized object`,
  relation excluded, as in Phase 2B): Phase 2A keys retained **16/16**,
  Phase 2B unique keys retained **20/20**, lost **0**, new keys **8**.
- **Phase 2C spec scheme** (adds relation, polarity, temporal scope):
  new keys also **8** — the two schemes agree here.

No Phase 2A or 2B fact key was lost. The only intentional collapse is the
cross-page duplicate in §6, which retains its unique fact with per-page
provenance.

## 3. Newly typed facts (8), with auditable evidence

| Fact | Evidence (original sentence) | Unit / source |
|---|---|---|
| definition: Harappan architecture → carefully laid-out cities, standardised urban concepts, and an emphasis on drainage, water management, and civic organisation | "It is characterised by carefully laid-out cities, …" — pronoun `It` resolved to the explicit antecedent "Harappan architecture" in the same unit (method `pronoun_resolution_same_unit`) | RU-015, p.6, reconstructed_prose |
| entity_attribute: a tradition of stepwells —developed_in→ Gujarat and Rajasthan (temporal_scope "classical times") | "In classical times, a tradition of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan, …" — parenthetical transliterated alternates removed from the subject only after the remainder passed subject quality; full sentence kept as evidence | RU-039, p.14, reconstructed_prose |
| entity_attribute: the imposing Bṛihadīśhvara Temple —built_by→ Rājarāja Chola I (temporal_scope "around 1010") | "In Thanjavur, Tamil Nadu, the imposing Bṛihadīśhvara Temple (Fig. 3.20) was built by Rājarāja Chola I around 1010." — place prefix stripped, figure reference removed from the subject phrase, remainder explicit and meaningful | RU-050, p.17, reconstructed_prose |
| definition: Corbelled → Constructed by stacking blocks as in a staircase pattern | Glossary unit metadata, term + definition (second glossary unit; not individually verified in Phase 2B) | RU-070, p.24, glossary |
| definition: Latticework → Open framework with criss-crossing or decorative designs | Glossary unit metadata, primary definition sentence only | RU-077, p.26, glossary |
| entity_attribute: Latticework —attribute→ both functional (allowing ventilation) and aesthetic in design | "Here, it is both functional (allowing ventilation) and aesthetic in design." — `it` resolved to the glossary term by the unit's own metadata, same unit only | RU-077, p.26, glossary |
| entity_attribute: According to tradition, the first churches —built_in→ the coastal areas of Kerala | "According to tradition, the first churches were built in the coastal areas of Kerala." — the attribution phrase is kept inside the subject deliberately: stripping it would misrepresent a tradition-based claim as an established fact | RU-111, p.36, reconstructed_prose |
| entity_attribute: The red sandstone facade —features→ Islamic arches and intricate screens alongside carvings and pillars in Hindu temple style | Caption sentence, evidence source `caption`, figure_ref `fig 3.52` | RU-117, p.38, caption |

All eight pass the unchanged `classifyTypedDraft` gates and carry
fact_type, subject, relation, object, evidence, extraction method,
evidence source, reconstructed unit ID, ordered block IDs, page range,
and derivation metadata (stripped prefix / prefix kind / figure refs
removed / parenthetical removed / antecedent text / glossary term as
applicable). Layer facts carry no `derivation` field; supplementary facts
do, so the two populations stay distinguishable.

## 4. Recovery outcomes A–E

### A. Glossary definition recovery — COMPLETE

- Latticework (RU-077, p.26): 2 facts, 0 unparsed (was 2 unparsed,
  `unsupported_pattern`). Primary definition sentence is the definition
  fact; the "Here, it…" sentence is the attribute fact. No explanatory
  prose is merged into the definition answer.
- Corbelled (RU-070, p.24): 1 definition fact from unit metadata.
- The harness covers the second glossary unit that Phase 2B left
  unverified; no glossary unit remains untyped in Chapter 3.
- Negative cases (unit tests): empty definition → 0 facts, unparsed
  retained; missing term metadata → 0 glossary facts; two-term cluster →
  only the first entry's definition fact, the second entry never combined
  into it; punctuation variation (hyphenated term) handled.

### B. Passive-voice attribute recovery — MEASURED, PARTIAL BY DESIGN

Wells/stepwells unit RU-039, sentence by sentence (baseline 6 unparsed →
Phase 2C 1 typed, 5 unparsed, all `unsupported_pattern`):

| Sentence | Outcome | Reason |
|---|---|---|
| Wells have been constructed in many sizes and shapes from bricks, stones, or terracotta ring. | Unparsed | "in" object ("many sizes and shapes") fails the place/period guard — correctly rejected, not a location claim |
| In classical times, a tradition of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan, … | **Typed** (`developed_in`, temporal_scope "classical times") | |
| The stepwell at Rani ki Vav (Fig. 3.16) has multiple pillared levels and hundreds of magnificent statues. | Unparsed | "has" attribute, not a passive form in scope |
| Besides harvesting and storing rainwater, stepwells offered a social space where people could sit together, … | Unparsed | "offered", not a passive form in scope |
| Temples often had water reservoirs or puṣhkariṇīs attached to them, which were used for water harvesting as well as water-based rituals. | Unparsed | Relative-clause passive ("which were used for"), not in the spec's It/They/This/These pronoun list |
| Many of them were also works of art, with numerous stairways built into them (Fig. 3.17). | Unparsed | Pronoun-containing subject ("Many of them") plus a participle phrase, not a listed resolvable pronoun form |

The threats continuation unit RU-040 stays 0 facts, 1 unparsed
(`unsupported_pattern`): its two threats sentences arrive as one record
because the segmenter does not split on "etc.", and neither sentence is a
passive-agent/location claim. Only the patterns demonstrated by the source
were implemented; no broad natural-language parser was built.

### C. Local pronoun resolution + figure-reference cleanup — BOUNDED, AS SPECIFIED

- Nandi passage RU-050: builder fact typed (§3); unit unparsed goes from
  6 (3 `unsupported_pattern`, 2 `ambiguous_relation`, 1 `fragment`) to 5
  (3 `unsupported_pattern`, 2 `ambiguous_relation`) — the `fragment`
  builder sentence is the one recovered.
- The Nandi "It is renowned for…" sentence resolves its pronoun to "the
  imposing Bṛihadīśhvara Temple" (recorded attempt
  `pronoun_resolution` / `resolved_no_pattern`) but has no supported
  pattern for a "renowned for" claim, so it stays unparsed rather than
  forcing a fact. Resolution success without a pattern is recorded, not
  hidden.
- Resolver rules enforced and tested: unique antecedent resolves; two
  plausible antecedents → reject (ambiguous); pronoun-first text with no
  antecedent → unresolved, not ambiguous; antecedents never cross units,
  sections, captions, pages, or documents; number compatibility is a
  deliberate heuristic that errs toward unresolved.
- Figure references: a parenthetical `(Fig. 3.XX)` is removed from a
  subject phrase only when the remainder passes subject quality on its
  own. A figure-only subject yields no fact.
- **No false bindings:** Fig. 3.53 (RU-118) has 0 facts and 0 Madras High
  Court bindings; Fig. 3.29 (RU-064) has 0 facts and 0 Jama Masjid
  bindings. The Fig. 3.29 caption's only claim ("A sketch made in 1809 by
  a British army officer shows the mosque's full-size minarets.") stays
  unparsed (`unsupported_pattern`) — the mosque is never identified.

### D. Explicit caption-claim typing — COMPLETE FOR FIG. 3.52

- Fig. 3.52 caption RU-117: 2 facts — the layer date fact (Madras High
  Court, completion_year 1892, caption source) plus the supplementary
  `features` fact (§3). "Fig. 3.52." stays `ambiguous_relation`.
  Unparsed for the unit goes from 2 to 1.
- Fig. 3.53 caption RU-118: 0 facts ("Fig. 3.53." `ambiguous_relation`;
  "A close-up of some of its domes and towers." `unsupported_pattern` —
  the pronoun has no unambiguous local antecedent and is never bound to
  the Madras High Court).
- Caption rules enforced and tested: caption units with a non-null
  `figure_ref` only; `X features Y` only; pronoun subjects rejected; a
  caption without `figure_ref` yields no features fact; a figure
  reference is provenance, never proof two figures depict the same entity.

### E. Cross-page duplicate suppression — COMPLETE

- One duplicate detected and collapsed: fact key
  `entity_attribute|leaning against a stupa|role|massive statue of a
  seated buddha in a teaching pose` — discarded `TF-REC-124-001`
  (RU-124, `cross_page_merged`), kept `TF-REC-030-001` (RU-030, complete
  per-page prose). The discarded record (fact IDs, units, evidence
  sources, key, reason `duplicate_fact_key`) is preserved in the
  comparison JSON and metrics.
- Dedup key: fact_type | normalized subject | normalized relation |
  normalized object | polarity | temporal_scope, so facts sharing a
  subject but differing in relation, value, qualifier, or date are never
  collapsed (tested: same subject + different relations both kept;
  genuinely split cross-page sentence kept with `cross_page_merged`
  source and 0 discarded).
- Raw counts are preserved alongside unique counts everywhere (raw 29,
  unique 28).

## 5. Before/after unparsed counts by reason (target units)

| Unit | Phase 2B unparsed | Phase 2C unparsed |
|---|---|---|
| RU-077 Latticework glossary | 2 × unsupported_pattern | 0 |
| RU-039 wells/stepwells | 6 × unsupported_pattern | 5 × unsupported_pattern |
| RU-040 threats continuation | 1 × unsupported_pattern | 1 × unsupported_pattern |
| RU-050 Nandi passage | 3 × unsupported_pattern, 2 × ambiguous_relation, 1 × fragment | 3 × unsupported_pattern, 2 × ambiguous_relation |
| RU-117 Fig. 3.52 caption | 1 × ambiguous_relation, 1 × unsupported_pattern | 1 × ambiguous_relation |
| RU-118 Fig. 3.53 caption | 1 × ambiguous_relation, 1 × unsupported_pattern | unchanged |
| RU-064 Fig. 3.29 caption | 1 × ambiguous_relation, 1 × unsupported_pattern | unchanged |

Chapter-wide unparsed: 380 → 372 (unsupported_pattern 218 → 212,
fragment 71 → 69; ambiguous_relation, interrogative_or_instruction,
layout_relationship_unresolved, and furniture_contamination unchanged).
No new unparsed reason code was needed; the existing taxonomy covered
every remaining record.

## 6. Remaining unparsed source claims (target units, full list)

- RU-039: the five wells sentences in §4B, each `unsupported_pattern`.
- RU-040: the joined threats record, `unsupported_pattern`.
- RU-050: "Until the 8th or 9th century, temples were modest in size."
  (`unsupported_pattern`); "From the 10th century onward, … they grew in
  scale …" (`unsupported_pattern`); the grade-7-textbook cross-reference
  sentence (`ambiguous_relation`, sentence role ambiguous); "It is
  renowned for …" (`unsupported_pattern`, pronoun resolved, no pattern);
  "The entire" (`ambiguous_relation`, truncated cross-page sentence tail).
- RU-117: "Fig. 3.52." (`ambiguous_relation`).
- RU-118: "Fig. 3.53." (`ambiguous_relation`); "A close-up of some of
  its domes and towers." (`unsupported_pattern`, pronoun unresolved).
- RU-064: "Fig. 3.29." (`ambiguous_relation`); the 1809 sketch sentence
  (`unsupported_pattern`, mosque never identified).

The full chapter-wide unparsed list (372 records with unit, reason,
detail, original text, and classification attempts) is in
`chapter_3_phase2c_metrics.json` (`unparsed_2c`).

## 7. Defects found by auditing the full-PDF output (fixed in code, with tests)

Two supplementary facts in the first full-PDF run were wrong and were
removed by code fixes, not by weakening tests:

1. **Truncated object (Mysuru Palace).** The figure-cleanup re-parse
   produced "magnificent example of Indo-Saracenic architecture (see
   further below the section" — the shared role pattern stops its object
   capture at the stop-word "under", leaving an unbalanced parenthesis.
   `classifyTypedDraft` does not check object balance, so this would have
   shipped. Fix: a supplementary-only object-balance guard in
   `acceptSupplementary` (unbalanced parentheses → draft rejected, segment
   stays unparsed with its layer reason,
   `layout_relationship_unresolved` — the layer's figure-reference
   subject rejection, already the segment's reason in Phase 2B). The
   underlying Indo-Saracenic claim is already covered by
   the shipped Indo-Saracenic architecture fact, so no knowledge is lost.
   Tests G3 (rejection) and G4 (balanced-parenthesis objects still pass).
2. **Century phrase inside an agent name (Jama Masjid).** The
   supplementary `built_by` draft carried object "Sultan Ahmed Shah I in
   the 15th century", duplicating the layer's `launched_by` fact for the
   same agent (the layer-agent guard compares normalized objects, so the
   polluted object escaped it). Fix: `splitTrailingDate` now also splits
   a trailing "in the Nth century" phrase (including PDF spacing "15 th
   century") into `temporal_scope`; with a clean agent object the guard
   correctly skips the supplementary draft, leaving only the layer
   `launched_by` fact. Tests G1 (century split, both spacings) and G2
   (no relabelling).

## 8. Source changes, tests, and regression evidence

### Source changes (all in `pwa/engine/generator.js`; `sourceReconstruction.js` untouched)

No reconstruction defect blocking a specified recovery was demonstrated,
so no reconstruction change was made. Shared parsers
(`parseDefinition`, `parseEntityAttributes`, `parseFactRelations`,
`parseAllFactRelations`) are untouched; supplementary patterns live
behind the reconstructed-unit adapter only, behind `{supplementary,
deduplicate}` options (both default true; both false reproduces Phase 2B
adapter behaviour exactly — proven on the wells unit: 0 facts, 6
unparsed, and on the full chapter: 21 raw).

New helpers (all inside the generator IIFE, exported for tests):
`stripFigureReferences`, `stripLeadingContextPrefix`, `isPlausibleInObject`,
`isPlausibleAgent`, `splitTrailingDate` (extended with the century form,
§7), `passiveDraftsForSegment`, `captionFeatureDrafts`,
`glossaryDraftsForUnit`, `resolveLocalPronounAntecedent`, `phase2cFactKey`,
`deduplicatePhase2cFacts`. Adapter changes: per-segment supplementary
producers in fixed order (passive → figure-cleanup + generic re-parse
for segments without layer facts → pronoun substitution + parse → caption
features for caption units with `figure_ref`); supplementary facts
appended after layer facts so layer `TF-REC` numbering is unchanged;
rescued segments' unparsed entries removed with original `UU-REC`
numbering preserved for retained entries; `classification_attempts`
extended with pronoun-resolution attempts; `multi_claim_unit` recomputed
across layer + supplementary facts; dedup diagnostics and recomputed
accounting on the final arrays.

### Tests

- New `pwa/tests/test_phase2c.js`: **41 checks, all passing** —
  A1–A5 glossary, B1–B8 passive + wells measurement, C1–C7
  pronoun/figure, D1–D5 caption, E1–E5 dedup, F1–F7
  invariance/determinism/production safety/bank hashes/exports, G1–G4
  audit fixes. Fixtures are inline; no committed test depends on
  `/home/hatch/workspace/` or any machine-specific path.
- Full `npm test` from `pwa/`: **green, exit 0**, including Repair 002
  (83 + 3), Phase 2A (16), Phase 2B (18), Phase 2C (41). The
  `QuotaExceededError` lines in the output are simulated-error output
  inside `test_processing.js`, not failures.
- Production reproduction (exact production call form, re-run):
  **5/5 staged hees203 stems**. Production builders' sources contain no
  `reconstruct` reference (test F5).
- Production banks byte-identical: all 8 banks + manifest + consolidated
  file re-hashed after the phase; hees203
  `94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4`
  and consolidated
  `b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87`
  match the pre-phase values (full hash list in the metrics JSON).
- V2 cross-chapter regression: **re-run, unchanged.** Legacy engine
  re-prepared from pinned ref `a536a3c9` (blob SHA
  `7137688d73574670c14671d6956f7e7e9d7ac305` verified) because the
  `/tmp` copy had expired; the 2B V2 script was run from a temporary
  copy inside `diagnostics/tools/` with output redirected to
  `/tmp/v2_cross_chapter_2c.json`, so the Phase 2B comparison file was
  not overwritten, and the temporary script was deleted. Results
  identical to Phase 2B for all 8 chapters, deterministic for both
  engines: hees201 234→69 props, 2→2 candidates/validated/accepted;
  hees202 471→73, 0→0; hees203 180→28, 0→0; hees204 144→42, 2→2;
  hees205 227→59, 0→0; hees206 136→41, 1→1; hees207 140→29, 0→0;
  hees209 202→33, 0→0; totals 1734→374 props, 5→5 candidates, 5→5
  validated, 5→5 accepted; 8/8 chapters complete, no missing inputs.
  No V2 gate change was made, and the generator changes are adapter-only,
  so this confirms the baseline rather than merely asserting it.

### Known limitations (carried forward, not smoothed over)

- Browser layout path not verified: layouts come from the vendored pdf.js
  build under Node (the same code the browser/worker uses) with batch
  polyfills. No real browser run was performed and none is claimed; the
  exact manual/browser test from the Phase 2B report §11 is still
  required.
- Batch wiring of the document model + typed layer is deliberately
  deferred; the production path still uses `bodyText`.
- Merged cross-page facts can duplicate passage facts; they are now
  deduped in the shadow adapter with raw counts kept, but the underlying
  overlap is a reconstruction property, not a typed-layer one.
- Second glossary unit (Corbelled) is now typed, but its evidence has no
  trailing period in the source text — a source-text property, preserved
  verbatim rather than normalised.
- Figure-cleanup re-parsing is restricted to segments without layer
  facts, so a genuine second fig-ref claim inside an already-typed
  segment is a known limitation.
- The Nandi "renowned for" claim stays untyped even though pronoun
  resolution succeeded — no supported pattern covers it, and none was
  invented for it.
- Wells/stepwells sentences outside the demonstrated passive forms
  (§4B) remain unparsed by design; recovering them needs typed-parser
  coverage for "has" attributes, social-function verbs, and
  relative-clause passives, each with its own positive/negative tests.
- Timeline dates remain blocked (0 date facts from p.3; pairings still
  ambiguous) and the map remains visual-only (0 facts from pp.4–5).
- No GitHub CI result is claimed: no CI check was reported for this phase.

## 9. Recommended next phase (ordered, based on measured results)

1. Typed-parser coverage for the remaining demonstrated patterns, in this
   order: caption-claim typing beyond `features` (the 1809-sketch
   sentence and similar explicit caption claims, with the same
   no-binding restrictions); "has" attribute claims ("has multiple
   pillared levels"); relative-clause passives ("which were used for");
   social-function verbs ("offered a social space"). Each behind the
   same adapter-only gate with positive and negative tests, and each
   measured sentence by sentence against the Chapter 3 units first.
2. Batch telemetry wiring alongside — never replacing — `bodyText`,
   with a typed-gate evaluation on all 8 chapters (the typed layer is now
   28 unique facts on Chapter 3, but its effect on bank generation is
   still unmeasured).
3. Classifier repair measured on all 8 chapters first (the p.14
   classifier-shattering and p.17 furniture cases are recovered, but
   classifier quality on other chapters is unmeasured).
4. Timeline parser or visual confirmation for INV-3-007, then
   real-browser layout confirmation (Phase 2B report §11).
