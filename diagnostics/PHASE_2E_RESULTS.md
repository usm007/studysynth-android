# StudySynth Phase 2E — Source Boundary Recovery and Shadow Pipeline Telemetry

**Baseline:** remote main `5d96b38449d346d48c37983a80f70d9c9c1a7c1d` (Phase 2D).
**Scope:** source fidelity + observability ONLY. No production question
generation, selection, stems, distractors, validation rules, quotas, or
templates changed. No V2 eligibility change. No default `bodyText`
processing change. No bank, consolidated-file, or manifest change. No
LLM, network calls (except the read-only legacy-file fetch for the V2
regression, below), nondeterminism, or external services. No facts from
visual proximity, map positions, chart-axis positions, figure numbers,
or unresolved pronouns.

**What changed (and only this):**

- `pwa/engine/sourceReconstruction.js` — Phase 2E rules, version
  `phase2b-1` → `phase2e-1` (all Phase 2B fields unchanged; Phase 2B–2D
  diagnostics remain readable):
  - R-LEGEND: whole-block legend artifacts excluded (≥2 semicolon
    "Label: value" pairs, no terminal punctuation).
  - R-ART-LEAD: leading artifact runs excluded at passage-join time
    (all artifact-shaped, ≥1 strongly artifact, no auxiliary verb, no
    terminal punctuation, not lowercase-start).
  - R-ART-MARGIN: margin-positioned short label blocks excluded.
  - R-ART-DUP: duplicate-label fragments excluded (fragment text =
    opening words of the next block).
  - R-HEAD-PROSE: heading-classified prose runs recovered as
    `body_prose` only when ≥2 blocks, height ≤ 14.5pt, same x ±5pt,
    y-gaps ≤ 45pt, and the joined text contains a validated complete
    sentence.
  - Gutter epsilon: gutter-branch snapping ±1.0pt (measured 0.02pt
    rounding was merging columns on hees201 p.16).
  - Every excluded block keeps its full text in `exclusions[]` and in
    the owning unit's `fragments_excluded`, and lands in exactly one
    `excluded:*` accounting bucket. No block is counted twice; no span
    is silently discarded.
- `pwa/engine/generator.js` — adapter-only supplementary segmentation
  (`splitPhase2eBoundary`, behind the existing adapter options; shared
  parsers untouched):
  - R-BND-SEE: unclosed "(see" + capital sentence start (closed
    references never split).
  - R-BND-DASH: em/en dash as sentence separator (a second dash in
    the tail means parenthetical structure, never splits).
  - R-BND-TAIL: last period + lowercase fragment tail.
  - R-BND-PERIOD: missing period before "The" + noun phrase +
    copula/auxiliary (every "The" start tried in order; head must end
    noun-like; word tokens are non-space runs so diacritic names match).
  - A "This is why/because" discourse-connective guard on the pronoun
    resolver (added after the dash rescue exposed a false
    "The Earth is why all maps have some distortion" fact via pronoun
    substitution; the guard returns the segment to unparsed).
  - Unflagged split halves are never re-parsed (truncated fragments by
    construction); flagged halves go through `parseAllFactRelations` +
    `classifyTypedDraft` exactly as the layer does.
- `pwa/tests/batch_generate_all_ncert.js` — opt-in `--shadow-telemetry`
  branch placed BEFORE staged-dir creation and the production loop; it
  calls the shared harness module and returns. Without the flag, the
  production path is byte-identical (proven by sandbox run, below).
- `pwa/tests/test_phase2e.js` (28 checks) + `pwa/package.json` wiring.
- `diagnostics/tools/diagnose_corpus_phase2e.js` (standalone harness;
  also the batch flag's implementation, so the two entry points cannot
  diverge).

## 1. The 11 boundary cases — explicit outcomes, no unexplained losses

| # | Case | Outcome | Mechanism (verified, not assumed) |
|---|------|---------|-----------------------------------|
| 1 | hees201 oblate spheroid, legend prefix | **Correctly recovered**: `entity_attribute\|The Earth\|role\|oblate spheroid` | R-LEGEND excludes `p2-b2`; R-BND-DASH splits "colours — The Earth is an oblate spheroid." |
| 2 | hees201 ocean vast body, "Plankton:" label | **Correctly recovered**: `entity_attribute\|The ocean\|role\|vast body of saltwater … 71 per cent …` | `p4-b15` excluded (leading-run in the real page); ocean sentence clean; the chlorophyll gloss sentence is also now coherent |
| 3 | hees201 Mountains formed, "(see" fusion | **Correctly recovered**: `entity_attribute\|Mountains\|role\|formed by tectonic forces, volcanic activity, and erosion` | R-BND-SEE; "The Urals" correctly NOT excluded (not artifact-shaped) |
| 4 | hees201 Colorado Plateau, map-scale fusion | **Correctly recovered**: `entity_attribute\|The Colorado Plateau\|role\|large highland region …` | R-ART-LEAD excludes all 11 leading map/scale blocks; the false `numeric\|ap ap plateau canyon 0 1000\|2,000 km` fact is eliminated |
| 5 | hees201 savannah, map-scale subject prefix | **Correctly recovered**: `entity_attribute\|The savannah\|role\|tropical grassland ecosystem` | R-ART-LEAD excludes `1000` + `2,000 km`; the polluted-subject fact `1000 2,000 km the savannah` is eliminated |
| 6 | hees201 map projection, representation discrepancy | **AUDITED — representation difference, adapter-correct, NOT new knowledge** | Adapter subject "The process of showing the Earth on a flat surface" is more faithful than layer subject "Earth on a flat surface". Layer key remains "lost" in strict comparison; recorded as a representation candidate, never silently matched |
| 7 | hees201 Urals, ". and methane" tail | **Corrected representation, now retained** | Gutter epsilon separates p.16 columns: left unit reads "… carbon dioxide and methane. As global warming …", right unit ends "… economic importance."; the clean causal fact matches the layer key. The polluted 2D adapter key (object ending ". and methane") is eliminated |
| 8 | hees206 population-pyramid comparison, chart axes | **Correctly recovered**: `comparison\|the term 'population pyramid'\|comparison\|the representation on paper looks more like a triangle …` | R-ART-LEAD excludes the year axis + value axis blocks |
| 9 | hees209 paṭṭachitra themes, preceding prose fusion | **Correctly recovered**: `entity_attribute\|The traditional themes of the pa ṭṭ achitra\|role\|usually scenes from the Rāmāyaṇa, Mahābhārata and the Purāṇās` | **Mechanism corrected during verification:** NOT the R-BND-PERIOD split. The 2E reconstruction now joins the missing middle block `p9-b18` ("in Rajasthan and pa ṭṭ achitra … in Odisha, West Bengal and Andhra Pradesh.") into the passage, so the sentences separate cleanly and the plain layer parser types the fact. R-BND-PERIOD is separately proven on real text by the Chapter 3 Gurudwara recovery (below) |
| 10 | hees209 walls/ceilings convex mirrors, following-text fusion | **Correctly recovered**: `membership\|The walls and ceilings\|members\|inlaid with tiny convex mirrors …` | R-BND-TAIL splits at ". and palaces of the North …"; tail stays unparsed |
| 11 | hees209 Sufism duplicated subject | **Correctly recovered**: `entity_attribute\|Sufism\|role\|path of Islam` | R-ART-DUP excludes fragment `p7-b3` "Sufism" before "Sufism is …"; the polluted "Sufism Sufism" fact is eliminated |

**No case is left "still contaminated or missing".** Zero regressions:
every fact lost in 2E was already lost in 2D (verified by exact key-set
comparison; see §5).

## 2. Heading-prose recovery (Workstream B)

| Block(s) | Outcome |
|----------|---------|
| hees201 `p5-b11` + `p5-b12` ("Oceans are constantly moving! …") | Recovered as RU-019 `body_prose`; fact `entity_attribute\|Oceans\|role\|constantly moving` typed. (The "They can be:" list fragments stay section markers: they are not standalone sentences.) |
| hees201 `p9-b29` + `p9-b31` + `p9-b32` (Suez Canal) | Recovered as RU-039 `body_prose` with `heading_run_sections_disagree` flag (blocks carried three false sections). Fact typed with the FULLER object ("human-made passage (opened in 1869) connecting the Red Sea with the Mediterranean …"); the layer's shorter-object key remains "lost" — a representation difference, adapter-correct, recorded as a candidate (see §5). |
| hees201 p.11 "LET'S EXPLORE …" run (RU-056) + hees206 p.24 "What can you infer from this? …" (RU-083) | Recovered as prose units (they ARE misclassified prose, not headings) but yield **zero facts** — all segments unparsed as interrogative/instruction/unsupported. Honest recovery, no false facts. |
| Genuine-heading controls ("Colonial Architecture", "Ocean currents", "The oceans", "LE T'S REMEMBER") | Never recovered: fail the terminal-punctuation, multi-block, all-caps, or height tests. Verified by fixture tests. |

Corpus-wide heading recovery: **4 units, 11 blocks** (hees201 ×3,
hees206 ×1). No other chapter fires the rule.

## 3. Shadow telemetry in the batch path (Workstream C)

- Flag: `--shadow-telemetry` (any argv position). The branch sits
  before staged-dir creation and the production loop, calls
  `diagnostics/tools/diagnose_corpus_phase2e.js#runShadowTelemetry`,
  and returns. It writes ONLY `diagnostics/corpus_phase2e_metrics.json`
  and `diagnostics/corpus_phase2e_fact_comparison.json`.
- **Flag-run proof:** banks/manifest/consolidated hashes byte-identical
  before vs after the flag run; flag-run outputs byte-identical to the
  standalone harness run (same implementation, both entry points).
- **Default-batch proof (sandbox):** a copy of `pwa/` (engine, tests,
  vendor) run WITHOUT the flag produced all 8 banks byte-identical to
  production (counts 17, 14, 5, 17, 9, 5, 10, 11 = 88) and a manifest
  identical except the machine-specific absolute `stagedFile` path
  prefix (sandbox path vs repo path). Chapter 3: 5/5 stems identical
  (`Q-P3-001`…`Q-P3-005`). The consolidated file is not a batch output
  (built by a separate script) and was untouched.

## 4. Eight-chapter corpus results (all 8 PDFs hash-verified, 0 missing, 0 mismatched)

| Chapter | Pages | Blocks | Recon units | Layer facts | Adapter raw / unique | Retained | New | Lost |
|---------|-------|--------|-------------|-------------|----------------------|----------|-----|------|
| hees201 | 34 | 663 | 249 | 53 | 70 / 69 | 49 | 20 | 4 |
| hees202 | 50 | 532 | 151 | 33 | 50 / 43 | 33 | 10 | 0 |
| hees203 | 40 | 475 | 128 | 16 | 41 / 40 | 16 | 24 | 0 |
| hees204 | 18 | 252 | 53 | 28 | 30 / 30 | 27 | 3 | 1 |
| hees205 | 24 | 334 | 85 | 22 | 26 / 26 | 21 | 5 | 1 |
| hees206 | 24 | 718 | 91 | 18 | 30 / 26 | 16 | 10 | 0 |
| hees207 | 24 | 288 | 86 | 19 | 28 / 27 | 18 | 9 | 1 |
| hees209 | 35 | 610 | 181 | 20 | 42 / 39 | 20 | 19 | 0 |
| **Total** | **249** | **3,872** | **1,024** (was 1,032) | **209** (unchanged) | **317 / 300** (was 304 / 288) | **200** (was 188) | **100** (same count, changed composition) | **7** (was 19) |

- **Determinism:** every chapter's adapter run repeated twice inside the
  harness (identical keys + unparsed identities + reconstruction text);
  the whole harness run repeated end-to-end gives byte-identical
  metrics + comparison files (run2 = run3 = batch-flag run). One
  run1→run2 delta is a code-change effect, not nondeterminism: the
  R-BND-PERIOD regex fix (multi-candidate + non-ASCII tokens) splits one
  extra hees201 segment into two unparsed halves (unparsed 2746 → 2747,
  zero fact change).
- **Accounting:** all 8 documents reconcile (`reconciliation.ok`);
  every block in exactly one bucket. Artifact exclusions corpus-wide:
  **93 blocks** — margin_label 45, leading_artifact_run 44,
  legend_block 1, duplicate_label 3.
- **Chapter 3 gate (corrected with evidence):** totals move 40/39 →
  41/40, lost stays 0. The +1 is a genuine R-BND-PERIOD recovery:
  "The gurudwara is the place of worship of the Sikhs." from the fused
  "The Golden Temple, Punjab The gurudwara …" segment in RU-032.
  Chapter 3's 160-entry inventory / 143-point denominator are untouched.
  Three Ch3 margin labels (`p1-b4`, `p1-b10`, `p15-b5`) were excluded
  with zero fact change.
- **Boundary-reparse facts:** all carry `classification.method =
  phase2e_boundary_reparse` with `rule_id` (R-BND-SEE / DASH / TAIL /
  PERIOD) for audit.

## 5. Fact-change review (2D adapter → 2E adapter, exact key sets)

**12 facts moved into retained** (were lost or polluted-new in 2D, now
match layer keys): hees201 ×7 (Mountains, Oceans, Colorado, oblate,
ocean-vast, savannah, Urals-clean), hees206 ×1 (pyramid), hees207 ×1
(cities launched_by — 2D subject was polluted "chapter cities"),
hees209 ×3 (Sufism, paṭṭachitra, mirrors). **12 = the entire lost-count
drop (19 → 7).**

**8 adapter-only facts appeared** (new vs layer, each verified genuine):

- hees201 Suez-full (representation, see below).
- hees202 Tilak sentenced in Mandalay (R-BND-DASH; clean sentence).
- hees203 Gurudwara place of worship (R-BND-PERIOD; clean sentence).
- hees204 litigants membership (shared layer parser on a cleaned unit;
  wording "called litigants" for "litigants" is a pre-existing layer
  wording quirk, claim true).
- hees207 BPO full definition ("business process outsourcing",
  replacing the 2D truncated "process outsourcing").
- hees209 pashmina woven + exported (existing 2C pronoun resolver with
  verified-correct antecedent "Pashmina shawls", enabled by 2E unit
  composition) and names-of-god membership (shared layer parser, clean
  sentence).

**8 adapter-only facts disappeared** (all false or polluted, all
eliminated by 2E fixes): hees201 Urals-polluted, savannah-polluted,
Colorado-numeric; hees206 chart numerics "79.4 children" and "5 years"
(both from table cells only — `p10-b20`, `p10-b33` — never prose);
hees207 BPO-truncated and "chapter cities" polluted subject; hees209
"Sufism Sufism".

**Representation-change candidates (2, both adapter-correct):**
map-projection (fuller subject) and Suez (fuller object). Neither is
counted as new knowledge; their layer keys remain "lost" in strict
terms and are listed as candidates in the comparison file.

**Still lost (7, all pre-existing 2D losses, 0 regressions):** hees201
map-projection + Suez-short (the 2 representation cases above),
hees201 lakes-members + varied-landscapes-members, hees204
governments-members, hees205 not-every-resident-members, hees207
spaces-members. The 5 non-representation cases are membership-list
parser gaps on multi-entity sentences — outside 2E's boundary scope.

## 6. Tests

- New `pwa/tests/test_phase2e.js`: **28 checks**, all passing —
  all four split rules (positive + negative: closed "(see",
  parenthetical double dash, decimals, abbreviations, verb-ending
  heads), fact-level split outcomes with exact counts (no duplicates),
  discourse-connective guard, no-facts negatives (legend, chart axes,
  map scale, running titles), reconstruction fixtures (legend, leading
  run, shattered-prose negative, margin label + continuations,
  duplicate label, gutter epsilon, heading runs + genuine-heading
  controls, full block accounting), batch placement, bank/manifest/
  consolidated hashes, corpus outputs + Chapter 3 gate, 2B V2 artifact
  untouched.
- Full `npm test` green: Repair 002 (83 + 3) + 2A (16) + 2B (18) +
  2C (41) + 2D (43) + 2E (28). No existing test changed.
- Two implementation defects were caught by tests and fixed in code
  (not bypassed): the R-BND-PERIOD regex fixed on the earliest "The"
  and masked later genuine split points (now tries every "The" start);
  an ASCII-only word class failed on diacritic names (now non-space
  tokens).

## 7. V2 cross-chapter regression (re-run, actual results)

Legacy = `a536a3c9` `representation.js`, re-fetched read-only via the
GitHub connector and verified byte-identical to the pinned blob SHA
`7137688d73574670c14671d6956f7e7e9d7ac305`, run from a `/tmp` copy
with output to `/tmp` (the Phase 2B file untouched, hash re-verified
`89d3aac1…`). Per-chapter counts match Phase 2B **exactly**:
propositions 1734 → 374, candidates 5 → 5, validated 5 → 5, accepted
5 → 5 (per chapter: 2, 0, 0, 2, 0, 1, 0, 0). **No V2 gate change, and
none justified.**

## 8. Production-bank proof

All 8 banks + manifest + consolidated file byte-identical before vs
after Phase 2E (hashes in the test file). Sandbox default batch
reproduces all 8 banks byte-identically (§3). No production file was
modified in the phase window.

## 9. Browser path verification — BLOCKER (not verified, not claimed)

As a subagent, this coordinator has **no live-browser control tools**
and cannot operate the PWA import path. No browser result is claimed
or fabricated. The exact test still required (parent agent to arrange
via browser-task delegation, following the Phase 2B §11 pattern): real
browser, import `hees203.pdf` and the fixed-case pages, compare
`extractPageLayout` blocks/geometry for hees201 pp. 5 and 9, hees201
colour-legend / ocean-label / mountain / map-scale / savannah pages,
hees206 population-pyramid page, hees209 paṭṭachitra + Sufism cases,
and hees203 pp. 14, 17, 22, 26, 38 as unchanged controls, against the
Node diagnostic outputs; document any differences in block IDs, text,
bounding boxes, disposition, and recovered spans. Node results here use
the vendored pdf.js build under Node only.

## 10. Known limitations carried forward (honest residuals)

- Mid-passage chart-label fusion remains: e.g. hees206 still carries a
  polluted adapter-only fact with subject "01 02 Fertility rate Birth
  rate The birth rate …" (present in both 2D and 2E; not a regression).
  The 2E rules cover leading runs and margin labels, not labels fused
  mid-passage.
- Timeline + map facts remain zero by design (no visual-proximity facts).
- The "second claim in a typed segment" limitation is unchanged.
- The two non-target heading recoveries (activity prompts) add units
  but no facts; if activity prose should never become `body_prose`,
  that is a product decision, not a correctness defect.
- Browser layout path unverified (§9); batch wiring of the document
  model + typed layer into production generation remains deferred by
  scope (telemetry only).

## 11. Recommended next phase (ordered)

1. Mid-passage label fusion: extend artifact handling to labels fused
   inside (not just leading) passages, measured on all 8 chapters with
   the hees206 fertility case as the regression test.
2. Membership-list parser coverage for the 5 remaining lost
   multi-entity membership facts (hees201 ×2, hees204, hees205, hees207).
3. Batch telemetry wiring alongside `bodyText` is now available via
   `--shadow-telemetry`; the next decision is whether production
   generation ever consumes reconstructed units (needs the two open
   user decisions: context field vs stem, gold-standard ownership).
4. Real-browser layout confirmation (§9) before any production use of
   reconstructed geometry.
5. Only then: further typed-parser coverage (caption claims beyond
   features, "inlaid with" membership is already recovered via
   R-BND-TAIL; cross-segment pronoun membership with agreement checks).

## Files created / modified (Phase 2E only; no commit, no push)

**Created:**

- `pwa/tests/test_phase2e.js`
- `diagnostics/tools/diagnose_corpus_phase2e.js`
- `diagnostics/corpus_phase2e_metrics.json`
- `diagnostics/corpus_phase2e_fact_comparison.json`
- `diagnostics/PHASE_2E_RESULTS.md` (this file)

**Modified:**

- `pwa/engine/sourceReconstruction.js` (Phase 2E rules, version
  `phase2e-1`)
- `pwa/engine/generator.js` (adapter-only boundary splits +
  discourse-connective guard; shared parsers untouched)
- `pwa/tests/batch_generate_all_ncert.js` (`--shadow-telemetry`
  branch only)
- `pwa/package.json` (test chain + `test_phase2e.js`)

**Explicitly NOT modified:** all 8 banks, `summary_manifest.json`,
`ALL_NCERT_CLASS_8_QUESTIONS.md`, all Phase 1/2A/2B/2C/2D files,
`pwa/engine/documentModel.js`, `pwa/engine/pdfParser.js`, any shared
parser function, any V2 file, any PDF.
