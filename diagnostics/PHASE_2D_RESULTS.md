# StudySynth Phase 2D Results — Remaining Fact Recovery and Eight-Chapter Shadow Telemetry

Shadow-only phase. Baseline commit `135808e5` (Phase 2C). No production
question generation was changed, no bank, manifest, consolidated file,
stem or distractor was modified, no validator was weakened, no V2 gate
was changed, no LLM or network dependency was introduced. All new
fact-pattern recovery lives inside the supplementary reconstructed-unit
adapter in `pwa/engine/generator.js`; the shared production parsers
(`parseDefinition`, `parseEntityAttributes`, `parseFactRelations`,
`parseAllFactRelations`) keep their current behaviour exactly, and
`pwa/engine/sourceReconstruction.js` was **not modified**.

Companion outputs (same directory unless noted):

- `diagnostics/tools/diagnose_chapter3_phase2d.js` — Chapter 3 harness
- `diagnostics/tools/diagnose_corpus_phase2d.js` — eight-chapter harness
- `diagnostics/chapter_3_phase2d_metrics.json` — Chapter 3 metrics
- `diagnostics/chapter_3_phase2d_typed_fact_comparison.json` — Chapter 3 key comparison
- `diagnostics/corpus_phase2d_metrics.json` — corpus metrics
- `diagnostics/corpus_phase2d_fact_comparison.json` — corpus key comparison

All PDF inputs are the files under `/home/hatch/workspace/ncert_pdfs/`
(the spec path `NCERT/*.pdf` does not exist in the checkout; `NCERT/`
holds only `.gitkeep`). Every hash below was verified before
processing; a mismatch would have stopped that chapter, and no
substitute PDF was ever used. No PDF is committed.

## 1. Chapter 3 per-target verdicts (Workstream A)

Chapter 3 PDF `hees203.pdf`, SHA-256
`547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec`,
40 pages. Reconstruction unchanged from Phase 2B: 129 units,
reconciliation ok. Typed layer baseline 16 facts; Phase 2B adapter
baseline 21 raw; **Phase 2D adapter 40 raw / 39 unique** (Phase 2C was
29 raw / 28 unique). Duplicates discarded: 1 (the same single
cross-page duplicate as Phase 2C). Unparsed records 365 (Phase 2C:
372 — 8 sentences newly typed, plus 1 extra record from the threats
split: 372 − 8 + 1 = 365, reconciling exactly).

| Target | Verdict | Evidence |
|---|---|---|
| A1 Rani ki Vav attributes (RU-039, p.14) | **Typed, 2 facts.** `The stepwell at Rani ki Vav —has→ multiple pillared levels`; `—has→ hundreds of magnificent statues`. Figure reference removed from the subject only (remainder independently valid); full sentence kept as evidence; page, unit, ordered block IDs and reconstruction provenance preserved. | `TF-REC-039-002`, `TF-REC-039-003` |
| A2 Social function of stepwells (RU-039) | **Typed, 1 fact.** `stepwells —offered→ a social space where people could sit together, enjoy cooler temperatures and exchange all the news`. The stated activities and benefits stay inside the object; nothing is generalised to every stepwell beyond what the sentence states, and no geographical/historical fact is inferred from nearby text. | `TF-REC-039-004` |
| A3 Relative-clause passive (RU-039) | **Typed, 2 facts, kept separate.** (a) `Temples —had→ water reservoirs or pu ṣ hkariṇīs` (antecedent preserved verbatim, both alternatives, not narrowed to one); (b) `water reservoirs or pu ṣ hkariṇīs —used_for→ water harvesting as well as water-based rituals`. The attachment fact's object is the bare antecedent phrase with `attached_to_them: true` in the derivation, because a trailing "them" would fail the fragment gate; the full sentence is the evidence for both. | `TF-REC-039-005`, `TF-REC-039-006` |
| A4a Nandi "renowned for" (RU-050, p.17) | **Typed, 1 fact.** `the imposing Bṛihadīśhvara Temple —renowned_for→ its vast maṇḍapas, a huge vimāna, over 60 metres high, and a massive Nandi (sacred bull) statue carved from a single stone, which sits in a pavilion facing the main shrine`. Subject resolved by the bounded same-unit resolver (`It` → the temple, immediately preceding sentence); original pronoun evidence and resolution derivation preserved; no figure identity inferred from proximity. | `TF-REC-050-004` |
| A4b Temporal-scale claims (RU-050) | **Typed, 2 facts.** `temples —attribute→ modest in size`, temporal scope `until the 8th or 9th century`; `temples —attribute→ grew in scale`, temporal scope `from the 10th century onward`. Only the explicit size/scale claims, with the source's periods (PDF spacing "8 th"/"10 th" normalised in the scope only; evidence text untouched). No precise date invented, no generalisation beyond "temples". | `TF-REC-050-001`, `TF-REC-050-002` |
| A5 Fig. 3.29 sketch claims (RU-064, p.22) | **Typed, 2 facts, zero mosque binding.** `A sketch —made_in→ 1809` (date fact); `A sketch —made_by→ a British army officer`. Both carry `mosque_unbound: true`. No fact names Jama Masjid, Ahmedabad, or any particular mosque; nothing is taken from adjacency to the Jama Masjid passage. | Caption-sourced, figure `fig 3.29` |
| A6 Threats "etc." split (RU-040, p.14) | **Split, 0 facts invented.** One unparsed record became two, both `unsupported_pattern`, with exact contiguous spans: `UU-REC-040-001` (span 0–135, "...waste dumping, etc.") and `UU-REC-040-001-b` (span 136–239, "Environmentalists, locals, and NGOs sometimes join hands to preserve them, but much remains to be done."). Neither half independently passes a typed-draft check, so no fact was created to reduce the count. The rule fires only for a capital-letter sentence after "etc." in a segment with no layer facts and a layer unparsed entry; production segmentation is unchanged. | Spans recorded in `chapter_3_phase2d_metrics.json` |
| A7a "characterised by" semantics | **Corrected, not hidden.** The Phase 2C fact that labelled a "characterised by" statement a `definition` is now `entity_attribute / characterised_by` with `derivation.semantic_correction = 'characterised_by_not_definition'`, alongside the untouched genuine layer definition fact for the same subject. The shared production definition parser was **not** altered; the relabel applies to supplementary drafts only. See §2. | Harappan architecture fact |
| A7b "According to tradition" attribution | **Corrected, not hidden.** The Phase 2C subject `"According to tradition, the first churches"` is now subject `the first churches` with `qualifiers.attribution = 'According to tradition'` and the attribution recorded in the derivation. The tradition-based claim is not upgraded to an unqualified confirmed fact, and the attribution is not part of the entity name. See §2. | First-churches fact |
| A7c/d Figure refs, polarity, dates | Figure references and contextual prefixes are stripped only when the remainder is independently valid (A1, A4a, A5 all record removals in derivations); polarity, date/period and approximation qualifiers are preserved on every new fact (temporal scopes above; `around 1010` on the retained builder fact). | Derivations in metrics |
| A8 Safety cases | **All pass.** Fig. 3.29: 0 facts binding its mosque to Jama Masjid/Ahmedabad. Fig. 3.53 (`RU-118`): 0 facts binding domes/towers to the Madras High Court. Timeline (PDF p.3): 0 date facts. Map (PDF pp.4–5): 0 facts. Truncated sentences ("The entire", grade-7-textbook sentence) remain visible as unparsed with reasons (`ambiguous_relation`). All Phase 2C safety tests (D2, D3) still pass. | 15/15 harness case checks pass |

Wells/stepwells unit RU-039, sentence by sentence (Phase 2C → Phase 2D):
6 typed / 2 unparsed (was 1 typed / 5 unparsed among the sentences
that were unparsed in 2C, plus the already-typed `developed_in`
sentence). Still unparsed, with reasons: "Wells have been constructed
in many sizes and shapes..." (`unsupported_pattern` — sizes/materials
enumeration, no supported pattern) and "Many of them were also works
of art..." (`unsupported_pattern` — pronoun subject with a
multi-clause object the bounded resolver does not resolve). Both are
honest gaps, not defects: no pattern was stretched to cover them.

One further Phase 2D pattern hit inside Chapter 3, not a named target
but a genuine recovery: RU-091, "The palace is renowned for its
intricately carved wooden doors, ornate ceiling paintings,
stained-glass windows, and the spectacular golden throne
(singhāsana) displayed during the Dasara festival." The layer had
left this sentence untyped (it types bare "X is renowned for ..."
sentences as weak role facts only in some shapes); the supplementary
renowned pattern typed it exactly as stated. It is counted among the
11 new keys below, not hidden inside another target.

## 2. Corrected key comparison (never hidden as gain/loss)

Comparison uses two key schemes. The Phase 2C spec scheme
(`type|subject|relation|object|polarity|temporal_scope`) gives:
**28 Phase 2C keys → 26 retained, 2 corrected, 0 lost; 11 new keys;
39 Phase 2D keys total** (26 + 2 corrected-new + 11 = 39, reconciling
exactly). The Phase 2B scheme (relation excluded) gives: Phase 2A
keys **16/16 retained**, Phase 2B keys **20/20 retained**, 0 lost.

Explicit corrections (old key → new key, with reason):

1. `definition | Harappan architecture | definition | carefully
   laid-out cities, standardised urban concepts, and an emphasis on
   drainage, water management, and civic organisation`
   → `entity_attribute | Harappan architecture | characterised_by |
   <same object>`. Reason: `characterised_by_not_definition`.
2. `entity_attribute | According to tradition, the first churches |
   built_in | the coastal areas of Kerala`
   → `entity_attribute | the first churches | built_in | the coastal
   areas of Kerala` + `qualifiers.attribution = 'According to
   tradition'`. Reason: `attribution_moved_to_qualifier`.

The 11 new spec-scheme keys: RU-039 `has` ×2, `offered` ×1, `had` ×1,
`used_for` ×1; RU-050 `attribute` (modest) ×1, `attribute` (grew) ×1,
`renowned_for` ×1; RU-064 `made_in` (1809) ×1, `made_by` ×1; RU-091
`renowned_for` ×1. By type, Chapter 3 moved from
definition 1 / entity_attribute 14 (2B) → definition 4 /
entity_attribute 18 (2C) → **definition 3 / entity_attribute 29 /
membership 2 / date 2 / numeric 3** (2D, 39 unique; the definition
count drops by one because of correction 1, not because a fact was
lost). By evidence source: reconstructed prose 31, caption 5,
glossary 3.

## 3. Eight-chapter shadow telemetry (Workstream B)

All 8 PDFs hash-verified against the recorded manifest before
processing (hashes in §6); 8/8 processed, 8/8 reproducible (the
adapter was run twice per chapter; sorted fact keys and unparsed
record IDs matched every time). Totals: 249 pages, 3,872 blocks,
1,032 reconstructed units, all reconciliations ok (no mismatch
between block totals and accounted buckets in any chapter).

Per chapter — layer = body-text typed layer facts; adapter = Phase 2D
shadow adapter (raw / unique); ret/new/lost = strict-key comparison
against the layer (a key difference is a representation difference
until audited — see §4, not a proven knowledge gain or loss):

| Chapter | Pages | Blocks | Units | Layer | Adapter raw/unique | Retained | New | Lost | Dedup |
|---|---|---|---|---|---|---|---|---|---|
| hees201 World Geography | 34 | 663 | 247 | 53 | 65 / 64 | 42 | 22 | 11 | 1 |
| hees202 India's Long Road to Independence | 50 | 532 | 151 | 33 | 48 / 42 | 33 | 9 | 0 | 6 |
| hees203 Indian Architecture | 40 | 475 | 129 | 16 | 40 / 39 | 16 | 23 | 0 | 1 |
| hees204 Judiciary | 18 | 252 | 54 | 28 | 29 / 29 | 27 | 2 | 1 | 0 |
| hees205 Citizenship | 24 | 334 | 86 | 22 | 26 / 26 | 21 | 5 | 1 | 0 |
| hees206 Dynamics of Population | 24 | 718 | 92 | 18 | 31 / 27 | 15 | 12 | 1 | 4 |
| hees207 India's Urban Landscape | 24 | 288 | 86 | 19 | 28 / 27 | 17 | 10 | 2 | 1 |
| hees209 Cultural Currents 13th–17th C | 35 | 610 | 187 | 20 | 37 / 34 | 17 | 17 | 3 | 3 |
| **Total** | **249** | **3,872** | **1,032** | **209** | **304 / 288** | **188** | **100** | **19** | **16** |

Aggregate fact types (unique adapter facts): entity_attribute 154,
numeric 50, definition 31, causal 22, comparison 18, membership 17,
date 3. By evidence source: reconstructed prose 253, caption 26,
glossary 12, reconstructed list 2, cross-page merged 2. Unparsed
records 2,733 by reason: `unsupported_pattern` 1,738,
`interrogative_or_instruction` 283, `fragment` 454,
`ambiguous_relation` 248, `layout_relationship_unresolved` 5,
`furniture_contamination` 1.

Chapter notes:

- **hees201** has 140 `unresolved` units out of 247 — inspected
  samples are map labels ("PACIFIC", "OCEAN", "Equator ..."), i.e.
  map furniture, not lost prose. Its 64 body-prose units still yield
  64 unique facts against the layer's 53. The 11 "lost" keys are
  audited in §4, not assumed to be missing knowledge.
- **hees202** is the cleanest chapter: 0 lost keys, 33/33 layer keys
  retained, 9 newly recovered, 6 duplicates suppressed.
- **hees206** has the highest block count (718) for only 92 units:
  dense tables/figures dominate; 4 duplicates suppressed.
- **hees203** is the only chapter whose adapter output exceeds the
  layer by more than double (39 vs 16) — expected, since Workstream A
  targeted it.

No gold-standard chapter coverage is calculated or claimed for any
chapter. Chapter 3 retains its Phase 1 inventory (160 entries,
143-point question-worthy denominator); all other chapters report
extraction counts only. Extracted sentence counts are never treated
as learning-point coverage.

## 4. Corpus audit: false positives found and fixed, losses decomposed

### 4.1 False positives fixed in code (7 facts removed)

The first corpus run exposed 7 false facts from the new patterns on
other chapters' prose. Each was fixed or narrowed in `generator.js`
(adapter-only helpers) and pinned by a regression test in
`pwa/tests/test_phase2d.js` ("Corpus" section, 7 checks). A second
corpus run confirms all 7 are gone and no Chapter 3 fact changed
(§1 totals identical before and after narrowing).

1. **"The UN has called this waste problem ..." (hees201, ×2).**
   `has_attribute` treated auxiliary "has called" as possession and
   split inside a quoted phrase. Guard H2: after skipping leading
   adverbs, a verb-like first word (regular -ed/-en form or irregular
   participle) not directly followed by a noun/adjective is an
   auxiliary construction and rejects the segment. "called this ..."
   (determiner follows) rejects; "carved panels" (noun follows)
   still accepts.
2. **"Duties are not only about ..., they are about the
   responsibility each one of us has towards ..." (hees205, ×2).**
   `has_attribute` bound a subordinate-clause "has" to the
   sentence-initial subject "Duties". Guard H1: if a finite
   auxiliary/copula already appears in the subject span, the "has"
   is not the sentence's main verb and the segment rejects. (Known
   conservative loss: a relative-clause subject that genuinely owns
   a "has" is now left unparsed rather than risk a wrong subject.)
3. **"Indian culture has thus endured even in times of ..."
   (hees209, ×2).** Same H2 guard via the adverb skip: "thus
   endured even ..." rejects ("endured" followed by an adverb).
4. **"enturies C developed in the early 17th century with terraces
   ..." (hees209, ×1).** Two guards: (a) a `*_in` relation here is a
   place relation, so temporal objects (century, era, period,
   decade, millennium, year) reject — "developed in the early 17th
   century" is a date claim, not a place claim; (b) a subject ending
   in a lone capital letter after a lowercase word ("enturies C")
   is a running-title fragment and rejects, while a regnal numeral
   after a capitalised name ("Rājarāja Chola I", "King Chola I")
   is explicitly allowed.

Remaining 2D-pattern spillover after narrowing: 6 facts, all
audited legitimate and kept — hees207 "The Bandra Kurla Complex,
Mumbai, has banks, corporate offices, and financial institutions"
(2 facts, objects now comma-trimmed by guard H3); hees209 "The
Kerala School of Mathematics is renowned for path-breaking
contributions ..." (1); hees209 "India has a long tradition of
weaving and unique textiles ..." (2 facts; the second object's
trailing ", with every region having its own speciality" clause is
now trimmed to "unique textiles" by guard H3); hees209 "The
stunning Sheesh Mahal or 'Palace of Mirrors', was built in the Amer
Fort" (1 `passive_built_in` fact — the evidence segment ends with a
comma, i.e. the sentence continues, but the built-in claim itself
is complete and supported). The most specific 2D patterns
(`offered_social_space`, `relative_clause_*`, `temporal_scale_*`,
`sketch_claim_*`, `passive_built_by`) fired only in Chapter 3.

### 4.2 The 19 "lost" strict keys, decomposed with evidence

A strict-key "loss" means the body-text layer produced a key the
adapter did not reproduce exactly. Auditing all 19 against the
adapter's facts and unparsed records for the same evidence:

- **4 — representation differences (claim IS present in the adapter,
  under a different key).** hees201 "Earth on a flat surface is
  called a map projection" (adapter: subject "The process of showing
  the Earth on a flat surface"); hees201 "The varied landscapes ...
  make the Urals significant ..." (adapter: same subject/relation,
  object extended with trailing "and methane" from merged text);
  hees201 "The savannah is a tropical grassland ecosystem"
  (adapter: subject polluted with a map-scale prefix, "1000 2,000 km
  The savannah"); hees209 "Sufism is a path of Islam" (adapter:
  subject duplicated from a label fusion, "Sufism Sufism"). Strict
  keys count each as lost + new; the knowledge is not lost, but the
  subject/object boundaries are polluted by fused furniture — a
  real quality defect in boundary hygiene, not a coverage loss.
- **7 — merge / furniture-segment cases (sentence inside a longer
  adapter segment, claim unparsed).** hees201: "The Earth is an
  oblate spheroid" (merged with a colour-legend prefix into one
  unparsed segment), "The ocean is a vast body of saltwater ..."
  (merged with a "Plankton:" label prefix → `fragment`),
  "Mountains are formed by tectonic forces ..." (fused with a
  preceding fragment, truncated at "(see"), "The Colorado Plateau
  is a large highland region ..." (merged segment yielded an
  unrelated map-scale numeric fact instead); hees206: the
  population-pyramid comparison (segment fused with chart-axis
  numbers "1919 1924 ..."); hees209: "The traditional themes of the
  paṭṭachitra were usually scenes ..." (fused with the preceding
  storytelling sentence) and "The walls and ceilings are inlaid with
  tiny convex mirrors ..." (fused with following text into a
  `fragment` segment). In each case the sentence sits inside a
  longer adapter segment, so the layer's standalone-sentence parse
  does not transfer. Root cause: legend/label/map text fused to
  prose by the layout (see §5).
- **2 — sentence present in the document model but in no
  reconstructed unit (heading-block gap).** hees201: "Oceans are
  constantly moving!" (block `hees201:p5-b11`) and "The Suez Canal
  is a human-made passage (opened in 1869)" (block
  `hees201:p9-b29`). Both blocks are classified `heading` with
  disposition `included_prose` and contain a full sentence plus
  following prose, but reconstruction emits no unit from them.
  Measured, not fixed: changing the classifier/reconstruction is
  out of this phase's scope (see §5).
- **1 — different pronoun binding, both runs wrong.** hees201 "It
  covers parts of several countries": the body-text layer binds "It"
  to "The varied landscapes ..." (section context) and the adapter
  binds it to "Valleys" (layer `membership_list` via running subject
  context). The true antecedent in the unit text is "The European
  Plain" ("... The European Plain, or the Great European Plain, is
  one of the largest flat lands in the world. It covers ..."), whose
  sentence is merged with a "Together, plains and river" fragment,
  defeating subject extraction in both runs. This binding comes
  from the shared layer's subject tracking, not from a Phase 2D
  pattern, so it is reported, not patched here: altering shared
  parser behaviour is explicitly out of scope for this phase.
- **4 — bounded-resolver strictness (by design, Phase 2C rules).**
  hees201 "It comprises several desert areas ..." ("The lakes"),
  hees204 "This included access to water fountains ..." 
  ("Governments"), hees205 "These include the right to equality ..."
  ("Not every resident of a country"), hees207 "It includes data on
  various pollutants ..." ("Spaces"): the layer resolves the pronoun
  from wider section context; the adapter's same-unit rule leaves
  the sentence unparsed (in the lakes case, substitution would also
  break subject–verb agreement: "The lakes comprises"). These are
  deliberate safety refusals, visible as unparsed records, not
  silent drops.
- **1 — layer mis-parse correctly not reproduced (a good loss).**
  hees207 "Cities have the capability of providing something for
  everybody ..." was typed by the layer as `Cities —launched_by→
  everybody`. The adapter does not reproduce that relation. Counting
  it as a "loss" would reward an error.
Net assessment (4 + 7 + 2 + 1 + 4 + 1 = 19, reconciling exactly):
**zero of the 19 losses is a Phase 2D pattern regression** (Phase 2D
patterns only add facts on segments the layer left untyped; they
cannot remove layer facts), and **4 of the 19 are not losses of
knowledge at all** — the claim is present in the adapter under a
different key. The remaining 15 decompose into fused-segment
parsing gaps (7), a heading-block reconstruction gap (2), a shared
layer pronoun-binding difference (1), deliberate bounded-resolver
refusals (4), and one layer error correctly not reproduced (1).
They are pre-existing adapter/layer representation differences, now
measured per case instead of reported as a single "lost" count.

## 5. Limitations (carried forward, with evidence)

- **Browser layout path not verified.** Layouts come from the
  vendored pdf.js build under Node (same code as browser/worker)
  with batch polyfills. No real-browser run was performed and none
  is claimed. The exact browser test from Phase 2B §11 is still
  outstanding.
- **Batch wiring still deferred.** The adapter remains shadow-only;
  production generation still uses its current body-text path.
  Production batch integration, production question generation from
  reconstructed facts, and question-builder redesign were explicitly
  excluded and were not started.
- **Timeline and map remain at zero facts** (0 date facts from
  Chapter 3 p.3; 0 facts from pp.4–5), by design — no pairing or
  positional inference was attempted.
- **Legend/label fusion.** Sentences fused to a preceding legend,
  label, chart axis or map text ("White: ice and glaciers The Earth
  is ...", "Plankton: The ocean is ...", "1919 1924 ... While the
  term 'population pyramid' ...") are left unparsed by the adapter
  as merged segments, or typed with polluted subject/object
  boundaries (§4.2). A legend/label-prefix strip in reconstruction
  or adapter segmentation is a concrete next step, measured here by
  7 unparsed cases plus 4 boundary-pollution cases.
- **Heading-block prose gap.** Full sentences inside
  heading-classified blocks (hees201 p5-b11, p9-b29) never become
  reconstructed units. A heading-block prose-recovery rule (split a
  heading block at sentence boundaries when it contains following
  prose) is a concrete next step, measured here by 2 cases.
- **Cross-segment pronoun membership.** Four cases (§4.2) where the
  layer resolves a pronoun from wider context and the adapter
  refuses under same-unit rules. Any relaxation must preserve the
  agreement and uniqueness checks; the Valleys case shows what
  happens when a resolver reaches past a subject-less merged
  segment.
- **Second-claim-in-typed-segment limitation (unchanged).** Phase 2D
  producers run only on segments the typed layer left untyped, so a
  genuine second claim inside an already-typed segment is still not
  recovered (it is not duplicated either). The RU-091 palace
  renowned fact was recovered only because that sentence itself was
  untyped by the layer.
- **"etc." split scope.** The split applies only to segments with no
  layer facts and a layer unparsed entry, and only before a
  capital-letter sentence. Other abbreviation boundaries are
  unchanged.
- **No GitHub CI claimed.** No CI result exists for this work.

## 6. Production safety and regression evidence

- **Full test suite, from `pwa/`, exit 0:** engine, integration
  (0 errors), processing (0 errors), revision, reasoning V2
  (0 errors), Repair 002 (83 checks + 3 end-to-end), Phase 2A (16),
  Phase 2B (18), Phase 2C (41), Phase 2D (**43**, was 36; +7 corpus
  narrowing checks). The `QuotaExceededError` lines in output are
  simulated-error output inside `test_processing.js`, not failures.
- **Production reproduction (exact production call form, re-run,
  not assumed): 5/5 staged Chapter 3 stems** after all changes.
- **Bank hashes byte-identical before and after** (recorded in the
  Chapter 3 metrics and pinned by test P5): hees203 bank
  `94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4`,
  consolidated file
  `b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87`;
  all 8 banks, manifest and consolidated file unchanged.
- **Phase 2C outputs untouched** (metrics, typed-fact comparison,
  results report, `test_phase2c.js` — only its B8/C7 measurements
  were superseded during implementation, before this report, and
  are pinned by test P5; no further change was made here).
- **V2 cross-chapter regression, re-run after all changes:**
  legacy engine re-prepared from pinned ref `a536a3c9`
  (`representation.js` blob SHA
  `7137688d73574670c14671d6956f7e7e9d7ac305`, verified
  byte-identical via git blob hash; no gate markers; contains
  `compileSemanticRepresentation`), 2B V2 script run from a
  temporary copy with output redirected to `/tmp`
  (Phase 2B file untouched — SHA-256 still
  `89d3aac1c60f3cd8e5f17bc2852276010f1bfa64d418b1914473ba4406a5f3b9`).
  Result **unchanged in all 8 chapters**: propositions 1734 → 374,
  candidates 5 → 5, validated 5 → 5, accepted 5 → 5, deterministic
  both engines, every chapter.
- **Files created/modified in Phase 2D** (full phase; nothing else
  was touched): modified `pwa/engine/generator.js` (Phase 2D
  helpers, adapter integration, corpus narrowing guards),
  `pwa/package.json` (test chain ends with `test_phase2d.js`),
  `pwa/tests/test_phase2c.js` (B8 and C7 measurements only, both
  documented supersessions — see the Phase 2C report note in those
  tests); created `pwa/tests/test_phase2d.js`,
  `diagnostics/tools/diagnose_chapter3_phase2d.js`,
  `diagnostics/tools/diagnose_corpus_phase2d.js`,
  `diagnostics/chapter_3_phase2d_metrics.json`,
  `diagnostics/chapter_3_phase2d_typed_fact_comparison.json`,
  `diagnostics/corpus_phase2d_metrics.json`,
  `diagnostics/corpus_phase2d_fact_comparison.json`,
  `diagnostics/PHASE_2D_RESULTS.md` (this file).
  `pwa/engine/sourceReconstruction.js` was **not modified**
  (mtime 15:06 2026-10-26, 47,585 bytes, SHA-256
  `5f8b4e2db3a6896112135fc2f44d618bd3cccdd1a160909097d8d5309422cd32`).
  No Phase 1/2A/2B/2C diagnostic file was overwritten. No PDF was
  committed. Nothing was committed or pushed by this phase (the main
  agent verifies and pushes).

Verified input hashes (all 8, re-checked at delegation and again
before each harness run):

| Chapter | SHA-256 |
|---|---|
| hees201 | `68f119b33395c16a5c63819596d46aacadde9a17aec5c4cf978d0b03e85a84a4` |
| hees202 | `5a02c626a57ba3222cf90204cbeb065b0d46ff081f117269a4bb212527b74eae` |
| hees203 | `547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec` |
| hees204 | `87f5e404e8c2dbf6c95612068ef78108653946b761ebf62b4f4bdd8825845184` |
| hees205 | `4567ca3602ac05a7b45cf78e21528a66fd0bc380830561209d767e777f11ac28` |
| hees206 | `832a4ee039e5d79c61c4259e38593378ed4f295699df864bdffc599a6562317f` |
| hees207 | `0ed56f0852d29059962d3d581bd52fb340c4a319fe21c09bb32ceaa2bc9eb540` |
| hees209 | `cfdd8e4a732582926a6e06f6f779b28732a0ae23c8383e3136f4ba612933ff29` |

## 7. Recommended next phase (ordered)

1. **Legend/label-prefix recovery** in reconstruction or adapter
   segmentation (fused legend/label + sentence segments), measured
   on all 8 chapters — the largest measured adapter gap class (§4.2,
   7 unparsed cases plus 4 boundary-pollution cases).
2. **Heading-block prose recovery** (sentence-bearing heading
   blocks, hees201 p5-b11/p9-b29 pattern), measured on all 8
   chapters — small, precisely scoped, and it removes a
   reconstruction blind spot rather than a parser gap.
3. **Batch telemetry wiring alongside `bodyText`** (the deferred
   Phase 2C recommendation, still unstarted): emit the shadow
   adapter's per-chapter counts, unparsed reasons and losses as
   pipeline telemetry without changing generated output, so future
   regressions are visible to the batch operator instead of
   discovered by audit.
4. **Classifier repair measured on all 8 chapters** (table-band and
   heading rules — the heading misclassification in §4.2 is one
   instance of this class).
5. **Timeline parser or visual confirmation** for the Chapter 3
   timeline (still 0 facts), and **real-browser layout
   confirmation** (Phase 2B §11 test), in either order — both are
   verification work, not new extraction scope.
6. Only after 1–3: **typed-parser coverage for the remaining
   demonstrated patterns** (caption claims beyond `features`, "has"
   attributes beyond the narrowed rule, "inlaid with" membership,
   cross-segment pronoun membership with agreement checks) — each
   with the same corpus-audit discipline used here: no pattern
   expands without positive + negative tests and a full-corpus
   false-positive check.

Still awaiting user decisions (unchanged): context as a separate
field vs baked into the stem; gold-standard ownership
(human-reviewed inventory vs structural heuristic); OCR review stop;
elapsed-time display; question-count choice.
