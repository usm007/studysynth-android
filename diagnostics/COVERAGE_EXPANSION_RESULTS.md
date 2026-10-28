# Coverage Expansion Results — Chapter 3 focus (local, unpushed)

Date: 2026-10-27. Baseline: delivery-pivot commit
`69a891b901ed099cd8d5bfd56b9c73e9c3f17b10` (remote head, verified
before work). **No commit, no push, no bank promoted** — this
milestone stays local by explicit user boundary. Regenerated Chapter 3
outputs live ONLY in the staging directory outside the repo
(`/home/hatch/workspace/candidate_staging_covexp/run1` and `run2`);
the pushed candidate directory `pwa/data/ncert_8_2_candidates/` is
intact (12 files) and the production staged banks are untouched
(hashes re-verified below).

## Headline numbers (strict metric, unchanged rules)

Chapter 3, denominator **143** (inventory untouched: 160 entries):

| Measure | Pivot baseline | This milestone (final) |
|---|---|---|
| Typed facts, Ch3 | 40 (validation `facts_in`) | **51** |
| Candidate questions, Ch3 | 15 | **23** |
| Strictly covered inventory | 8 (5.6%) | **14 (9.8%)** |
| `evidence_exists_unconverted` | 57 | 67 |
| `extraction_incomplete` | 78 | 62 |
| `requires_human_review` / `excluded` | 1 / 16 | 1 / 16 |

Corpus (all 8 chapters, same run): **118 questions from 313 typed
facts** (pivot: 106 from 300). Per chapter, questions / facts:
hees201 24/69 (pivot 24/69), hees202 13/43 (13/43), hees203 23/51
(15/40), hees204 17/31 (16/30), hees205 13/26 (13/26), hees206 7/26
(7/26), hees207 5/27 (5/27), hees209 16/40 (13/39). No chapter lost
questions or facts against the pivot. Determinism: the two staging
runs are byte-identical (`diff -r` clean).

Baseline precision: the pivot's Chapter 3 `facts_in` was 40; the Phase
2E adapter alone reported 41 raw / 40 unique facts for Chapter 3.
This milestone's 51 is unique typed facts from the same adapter path
with the new producers enabled.

## Newly covered inventory entries (all `evidence_span_match`)

| Entry | Question | Fact | What it is |
|---|---|---|---|
| INV-3-100 | Q-CAND-3-015 | TF-REC-071-003 (layer, newly typed after the fragment-gate fix) | Walls and arches decorated with calligraphy of verses from the Qur'an |
| INV-3-112 | Q-CAND-3-018 | TF-REC-082-003 (`designed_include_ce`) | Agra Fort designed to include palaces/gardens/quarters/halls |
| INV-3-117 | Q-CAND-3-019 | TF-REC-086-001 (`features_list_ce`) | Orchha complex: three main palaces (Raja, Jahangir, Rai Praveen Mahal) |
| INV-3-118 | Q-CAND-3-020 | TF-REC-086-003 (`has_list_ce`) | Jahangir Mahal: ornate chambers, intricate stone carvings, beautiful courtyards |
| INV-3-128 | Q-CAND-3-022 | TF-REC-094-001 (`membership_list_ce`) | Tomb common features: arches, floral motifs, latticework, Qur'an calligraphy |
| INV-3-154 | Q-CAND-3-023 | TF-REC-116-002 (`caption_view_subject_correction`) | Madras High Court completed 1892 (Fig. 3.52 caption) |

No previously covered entry was lost. Linking rules were NOT changed:
`evidence_span_match` / `block_match` / `page_content_match` only;
partial similarity never counts.

## What was implemented (all in `pwa/engine/generator.js`)

Adapter-gated supplementary producers (run only on segments with no
layer facts, or on pronoun-substituted text; never on caption units
except the caption correction). Every new producer keeps evidence
verbatim, records each strip/truncation in its derivation, and still
passes unchanged `classifyTypedDraft`.

- `membership_list_ce` — listed verbs mirroring the layer's set
  EXCEPT `cover(s)` (deliberately excluded: a "covers" list is usually
  document scope, not a domain membership claim); subject
  parenthetical-strip + trailing-"also"-strip + Within-strip;
  clause-tail truncation; rejects subject exactly `features`.
- `includes_attribute_ce` — `X (also) includes <single object>`; fires
  ONLY when the truncated object splits to exactly one member, so
  multi-member lists stay with `membership_list_ce` and never
  double-type. The trailing second clause is truncated, not typed
  (one safe claim per segment).
- `features_list_ce` — `X features <list>` for body prose; the list
  must be delimited by an em/en dash separating a count phrase from
  the list (count phrase recorded, never a member) or by commas.
  Without a dash or comma there is no trusted list structure (a fused
  "screens alongside carvings and pillars" phrase must not split).
- `showcases_ce` — `X showcases Y`, Y a plain noun phrase (≤25 words,
  no finite verb/clause marker). Needed both as a real fact and to
  type the immediately-preceding segment so the Orchha pronoun chain
  resolves correctly.
- `has_list_ce` — `X has <comma list>`, the multi-item companion to
  the 2D `hasAttributeDrafts` (exactly two " and "-joined attributes,
  left untouched). A comma is required, so bare pairs stay with
  `hasAttributeDrafts` and never duplicate. Guards H1/H2 mirrored.
  Result is ONE membership fact for the whole list.
- `made_of_ce` — `X was (originally) made of Y` with clause-tail
  truncation. Its role in the Agra chain is to type the first segment
  so the pronoun resolver has an antecedent.
- `designed_include_ce` — `X was designed to include <list>` with the
  same member guards; runs on plain segments and pronoun-substituted
  text.
- Pronoun-block extension — after the existing passive → layer-parse
  → renowned attempts fail, and ONLY when the resolved antecedent
  comes from the **immediately preceding segment** and the unit is not
  a caption, try `hasListDrafts`, then `hasAttributeDrafts`, then
  `designedIncludeDrafts` on the substituted text, recording
  `pronoun_resolution` + `immediate_predecessor_only: true`. Rationale
  (proven by the Orchha unit): the sentence before "It has ornate
  chambers…" is about the Jahangir Mahal, while an earlier segment is
  about "the complex"; resolving across the intervening sentence
  would misattribute the chambers to the complex. When the preceding
  segment is untyped, the pronoun stays unresolved rather than
  guessing.
- `caption_view_subject_correction` — in caption units with a
  `figure_ref`, for each layer date fact with relation
  `completion_year` whose subject matches `^(A|An|The)? (general)?view
  of X$`, emit the same claim with subject X (only when X passes
  subject quality and is not itself a view-of phrase), evidence = the
  unchanged caption sentence, derivation records `original_subject` +
  `figure_ref`. Only `completion_year` is corrected (a view is never
  the thing completed). The original view-subject fact is KEPT and
  prefiltered as `weak_subject` downstream, so no duplicate question
  arises. Sketch subjects, body-prose view-of dates, and the Fig. 3.53
  close-up caption are all excluded by test.

Helpers: `truncateListTail`, `stripSubjectParenthetical`,
`stripWithinPrefix`, `stripParticipialInsert`, `cleanListMembers`
(with the hygiene guards below), `membershipDraftFromList`.

Chapter 3 fact decomposition (adapter with `{supplementary: false}`
vs default): layer-only 21 facts, supplementary-only 30, **0 layer
facts lost**. The +11 vs the pivot's 40 = 10 new-pattern facts
(TF-REC-052-001, 077-001, 082-002, 082-003, 086-001, 086-002, 086-003,
086-004, 094-001, 116-002) + 1 layer fact newly typed after the
fragment-gate fix (TF-REC-071-003, walls and arches; see below).

## Shared-gate fixes (narrow, with production impact — see decision item)

1. `isFragmentPhrase`: the dangling-word rule misread the "an" inside
   "Qur'an" as a dangling article, because the apostrophe creates a
   `\b` word boundary. Fix: negative lookbehind
   `(?<![A-Za-z]['\u2019])` before `\b`, so only a genuine dangling
   word after whitespace (or at string start) fires; a quoted
   dangling article still fires. This is what lets the Common features
   list type at all (its joined object ends with "Qur'an") and newly
   types the layer walls-and-arches fact.
2. `validateQuestion` fragment rule: the validator had its own
   independent copy of the same regex with the same artifact, which
   rejected the Common features membership question as
   `fragment_excerpt` even after fix 1. Same lookbehind applied.
3. Maker stem templates (`entityStem` table, additive only, no
   existing stem changed): `showcases: "what does ${subject}
   showcase?"`, `includes: "what does ${subject} include?"`,
   `made_of: "what is ${subject} made of?"`. Without a stem, a fact
   silently produces no candidate (the pivot added stems for its new
   relations for exactly this reason).

## The list-hygiene fix (found by corpus spot-check, fixed in this milestone)

The first staging run (126 questions) contained four WRONG questions
from the new `has_list_ce` producer, all from comma lists that are
not membership lists. All four were caught by reading the new
questions, not by tests, and all four are fixed in code with
regression tests (the second staging run, 118 questions, contains
none of them):

- Q-CAND-4-022 (hees204): "Which of the following is included in a
  mediator?" with correct answer "no power to make any decision" —
  a NEGATED possession presented as a member. This is the P0
  negation-defect class from the full-path repair. Fact
  TF-REC-049-002, evidence "A mediator has no power to make any
  decision, or impose a view on the parties."
- Q-CAND-4-004 (hees204): "which one is mentioned as belonging to
  Society?" with correct answer "professional" — a fragment of "both
  personal and professional" plus a "therefore" member and a modal
  consequence clause ("disputes may arise…") as members. Fact
  TF-REC-007-002.
- Q-CAND-4-011 (hees204): "included in the Supreme Court?" with a
  mid-sentence-truncated answer ("…from any judgment") plus a purpose
  infinitive ("to do substantive justice…") as a member. Fact
  TF-REC-027-002.
- Q-CAND-1-004 (hees201): "belonging to the seafloor?" with correct
  answer "very deep" — an adjective modifier as a member, chosen by
  the maker as the answer. Fact TF-REC-029-003.

Fix (in `cleanListMembers`, applying to all list producers, plus
single-object guards in `includesAttributeDrafts`, `madeOfDrafts`,
`showcasesDrafts`, and the 2D `hasAttributeDrafts` — the last is
adapter-only, so it has no production path): any member rejects the
whole draft if it starts with a negation (`no|not|never` + space),
starts with a correlative fragment (`both|either|neither`), starts
with a purpose infinitive (`to `), starts with an intensifier
adverb (`very|quite|rather|extremely|highly|particularly|
especially`), is exactly a discourse connective
(`therefore|however|moreover|…|also|…`), or contains a modal/auxiliary
(`may|might|can|could|will|would|shall|should|must|do|does|did`,
extending the existing finite-verb guard). Open-list markers
(`etc`, `and so on`, `and others`, `among others`) are DROPPED, not
members: a list with ≥2 real members survives without them (this
cleans the Fundamental Rights fact TF-REC-022-001, whose question now
has legitimate court-category distractors instead of "therefore" /
"both personal" / "professional"). A comma list whose structure is
not a clean membership list is left untyped rather than repaired by
guessing (false negatives preferred over false positives).

Pool effect, stated plainly: removing the four polluted facts also
removed four pool-effect questions that had converted only because
the polluted members enlarged the distractor pool (hees201 ×2,
hees204 ×2: the Arbitration/Mediation entity questions and two
others). The final corpus (118) is therefore SMALLER than the
intermediate run (126) and CORRECT — the intermediate count is
superseded and must not be cited.

Residual comma-list limitation (not fixed): commas separate list
items AND clauses, so a truncated mid-phrase member can still occur
in principle (e.g. a continuation fragment that passes every guard).
The guards are a first line; future has-list questions should still
be spot-checked. The pre-existing layer behaviour of keeping a
trailing ", all of which…" clause as a member (it handles ", which"
but not ", all of which" in `stripTrailingPurpose`) is unchanged and
remains a future-phase fix location.

## Targeted gaps A / B / C — resolved vs remaining

- **Gap B (INV-3-154 caption): RESOLVED.** The caption correction fact
  converts to a valid `date_recall` question and links via
  `evidence_span_match`. The facade fact itself still does not
  convert (maker/distractor-pool limitation: production
  `buildQuestionCandidates` on the adapted facade fact alone yields 0
  candidates, `missingOptions: 1` — a maker limitation, not a
  validation rejection, and not chased by weakening rules).
- **Gap A (membership lists): PARTLY RESOLVED.** Four membership/list
  facts now exist and convert + link (INV-3-112, 117, 118, 128). The
  Mehrangarh palace list fact (TF-REC-077-001) exists but is blocked
  by `figure_reference` in its evidence ("(Fig. 3.34)" — incidental,
  the claim does not depend on the figure, but the rule is absolute
  and the pivot explicitly did not bypass it). The 5 lost
  multi-entity membership facts from the 2D reports (hees201 ×2,
  hees204, hees205, hees207) were NOT individually verified: the two
  read-only analyst reports commissioned for this milestone had not
  arrived by report time (see below). The corpus regression is
  no-harm evidence, not a per-fact recovery claim for those five.
- **Gap C (has / relative-clause): PARTLY RESOLVED.** The Orchha
  pronoun chain works end-to-end (showcases → has-list, correct
  antecedent, distance-1 guard tested). The Agra chain works
  end-to-end (made-of → designed-include). Relative-clause patterns
  beyond the 2D set were not extended: no new representative
  relative-clause passage was found that supports a safe rule, and
  none was invented.

## Chapter 3 acceptance / rejection (final staging run)

`facts_in` 51, `facts_adapted` 46, `facts_prefiltered` 5 (unchanged
weak-subject set: sketch date, sketch maker, 071-002, 104-001, and the
original view-subject date fact), `candidates_built` 60,
`build_metrics` `missingOptions` 17 / `unsafeFacts` 0 /
`unsupportedFacts` 0, `structured_not_emitted` multi_statement 8 +
multi_statement_3 6, `rejected_by_rule` figure_reference 9 /
fragment_excerpt 1 / length_giveaway 4 / stem_source_reference 1,
`rejected_candidates` 15, `not_selected_per_fact` 8, `accepted` 23.
Subtype distribution: definition 2, entity_attribute 13,
assertion_reason 2, classification_membership 5, date_recall 1.
Fact dispositions (51): covered 23, no_valid_candidate 15,
figure_reference 7, weak_subject 5, fragment_excerpt 1.

Why the remaining new facts did not convert (measured):
- TF-REC-077-001 (Mehrangarh has-list) → `figure_reference` (see above).
- TF-REC-086-002 (showcases), TF-REC-052-001 (showcases, subject
  "structure" — a sentence-fragment subject from a mid-sentence unit
  start), TF-REC-082-002 (made-of) → `no_valid_candidate` even with
  the new stems (distractor-pool / candidate-shape limits, not
  validation rejections).
- TF-REC-086-004 (includes chhatris) DOES convert (Q-CAND-3-021,
  "what does the complex include?", correct answer exact, clean
  distractors) but does NOT link to INV-3-119: the inventory quote
  spells "chhatris" (no macron) and "town's" (ASCII apostrophe) while
  the question evidence has "chhatrīs" (macron ī) and "town’s" (curly
  ’), so strict literal containment fails. This is a
  linking-normalisation gap (diacritic/curly-quote folding in the
  linker only), NOT a reason to weaken the rule; it is a future-phase
  linker change with its own validation, not made here.

## Production-hash verification + DECISION ITEM (do not hide)

Sandbox production reproduction (`/tmp/prodcheck`, disposable, never
copied back): `NCERT_PDF_DIR=… node tests/batch_generate_all_ncert.js`,
exit 0, totals 17+14+6+17+9+5+10+11 = 89.

- 7 of 8 banks byte-identical to the repo (hees201 `a36d6216…`,
  hees202 `04de0e0c…`, hees204 `6a6f13bf…`, hees205 `c49532ae…`,
  hees206 `95fe993b…`, hees207 `25b0de90…`, hees209 `0d93b8fc…`).
- hees203 differs: 5 → 6 questions. The one new production question
  is VALID, not pollution: "Which of the following correctly
  describes the walls and arches?" with correct answer "decorated
  with calligraphy (decorative writing) of verses from the Qur'an",
  same-section distractors, verbatim evidence — the TF-REC-071-003
  layer fact, previously blocked by the apostrophe artifact. The 5
  pre-existing production questions are all still present with
  identical stems/options/explanations (Q-P3-006 "main alignment"
  moved to position 6 with answer key rotated A→B purely by
  deterministic index rotation after insertion).
- Consolidated file byte-identical (`b454e919…` — the batch does not
  regenerate it). Manifest identical except the machine-specific
  `stagedFile` path prefix.
- Repo staged banks re-hashed after all sandbox runs and confirmed
  UNCHANGED (`94e18899…` hees203, `b454e919…` consolidated,
  `2a17f7b1…` manifest). No repo bank was touched; nothing promoted.

**DECISION ITEM for the parent/user:** the two apostrophe-lookbehind
fixes and the three stem templates are KEPT in the code, with the
production impact documented exactly as above. The hygiene guards
are adapter-only and provably production-neutral (7/8 banks
identical; the hees203 delta is solely the lookbehind fix, same hash
`02f45fbf…` as the pre-hygiene sandbox run). Reverting the
lookbehinds would deliberately preserve a known regex bug
(misreading "Qur'an" as a dangling article) in two shared gates
purely to keep a byte-hash stable, which inverts the project's
discipline (never conceal generator defects). The fixes cannot be
made adapter-only without forking `isFragmentPhrase` /
`validateQuestion` into divergent gates, which is worse engineering
and would leave the production defect in place. The inseparability
point: any fix letting the candidate Common-features fact through
also lets the production walls-and-arches fact through (same regex,
same artifact); narrowing is impossible without hardcoding
chapter/fact exceptions (unacceptable). The parent/user must decide
at the next regeneration whether to accept the +1 valid production
question as a defect-fix side effect or to revert the two
lookbehinds in favour of byte-stability. The stem templates added no
production questions in any chapter (only hees203 changed).

## Tests

Full `npm test` green, exit 0: Repair 002 (83 checks + 3 end-to-end),
Phase 2A 16, 2B 18, 2C 41, 2D 43, 2E 28, coverage engine 19, coverage
expansion **40** (31 original + 9 new list-hygiene checks: negated
has-list, connective+modal, purpose-infinitive, intensifier-adjective,
etc-drop, genuine-list positive control, negated has-attribute,
negated includes, negated showcases). The `QuotaExceededError` lines
in `test_processing.js` output are expected quota-simulation output,
not failures. Test-design lesson recorded: supplementary-producer
positive tests MUST use a sentence the layer itself rejects, because
a clean list sentence is typed by the layer first and the
supplementary producer never runs.

## Known limitations / defects found but NOT fixed here (with evidence)

- Layer gaps parallel to the fixed adapter gaps (isolated probes,
  `/tmp/probe_guards.js`): the layer's `membership_list` keeps "etc"
  as a member ("…Freedom of Religion, etc." → members include "etc")
  and types "The list includes no sugar" as members ["no sugar"].
  These are SHARED production parser behaviours; fixing them needs
  its own production-neutrality proof and is a future phase, not
  smuggled into this milestone. In the real corpus run the
  Fundamental Rights fact came from the adapter (`membership_list_ce`),
  so the adapter fix DOES clean the real fact.
- INV-3-109 (Jodhpur "Other features…") REMAINS BLOCKED by design:
  the subject "Other features of Jodhpur" fails the shared
  `checkSubjectQuality` FORBIDDEN_START_WORD gate (`other` is in
  `UNUSABLE_SUBJECT_START`), and `isUsableSubject` (the maker's gate)
  is the same check, so no fact with that subject can convert through
  the maker either. Rephrasing the subject to "Jodhpur" would distort
  the claim and the stem, so it was not done. Fixing this needs a
  maker-gate policy decision (whether a leading "Other" grounded by an
  "of <entity>" phrase is identifiable) — a decision item, NOT a
  silent exception.
- Validator `figure_reference` scope question (future phase, NOT
  decided): whether incidental figure mentions in evidence (e.g.
  "(Fig. 3.34)" in the Mehrangarh sentence) should be distinguished
  from load-bearing figure dependence — this alone blocks INV-3-104's
  conversion.
- Linker normalisation gap: diacritic/curly-quote folding (see
  INV-3-119 above).
- Two read-only analyst reports commissioned for this milestone
  (membership-list parser gap; caption + has/relative-clause
  passages) had NOT arrived by report time. Their absence means: the
  5 lost multi-entity membership facts are not individually claimed
  as recovered, and no analyst-identified passage has been reconciled
  against the implemented patterns. If they arrive later, reconcile
  them before citing this report's gap-A verdict as final.
- Browser layout path STILL UNVERIFIED (see below). Node `vm`
  results do not count as browser verification.

## Remaining blockers (ordered)

1. Production-impact decision (above): accept +1 valid Ch3 question
   or revert the two lookbehinds.
2. Maker-gate policy decision for leading "Other" (INV-3-109).
3. Validator figure-reference scope decision (INV-3-104).
4. Linker normalisation (diacritic/curly-quote folding) for INV-3-119.
5. Layer membership hygiene (etc / negation members) with
   production-neutrality proof.
6. Real-browser layout confirmation (below) before any production use
   of reconstructed geometry.
7. Membership-list parser coverage for the 5 remaining lost facts
   (pending analyst reconciliation).
8. Mid-passage chart-label fusion (hees206 fertility-rate polluted
   fact, present in both 2D and 2E, not a regression).

## Addendum — analyst reconciliation arrived after this report (2026-10-27, main agent)

The two read-only analyst reports commissioned for this milestone
arrived after the report above was written. Their reconciliation
supersedes the "had NOT arrived" note in the Known limitations
section. Headline numbers are UNCHANGED (14/143, 118 questions from
313 facts, full suite green). Key corrections and refinements:

- **The 5 lost corpus membership facts are now individually
  verified — and must NOT be recovered as keyed.** None of the 5
  layer subjects is the grammatically correct antecedent (the
  layer's `previousSubject` chain is unchecked for agreement or
  topic). Four need a corrected noun-phrase binding, not key
  recovery: hees201 "It covers parts of several countries" →
  The European Plain (same unit RU-100); hees201 "It comprises
  several desert areas" → the Great Australian Desert (RU-224);
  hees205 "These include the right to equality" → fundamental
  rights (RU-012); hees207 "It includes data on various
  pollutants" → Air Quality Index (RU-049, `Label:` head). The
  fifth (hees204 "governments" / "access to water fountains")
  MUST stay unparsed: "This" refers to the prohibition in the
  preceding sentence, so the membership framing would invert the
  passage (denial of access, not provision).
- **Latent false fact (no bad question ships).** The adapter emits
  a Valleys membership fact (TF-REC-100-002, "parts of several
  countries", true antecedent The European Plain). In the final
  staging run its disposition is `length_giveaway`, so it produces
  no question — but it persists at fact level and could convert
  if pool conditions change. The proposed R1b agreement guard on
  the layer chain remains the fix.
- **Chapter 3 membership gaps C1–C6, reconciled:** C4 (Red Fort
  designed-include, INV-3-112), C5a (Orchha three palaces,
  INV-3-117), C5b (Orchha includes, converts as Q-CAND-3-021 but
  unlinked to INV-3-119 on the diacritic/curly-quote gap), and C6
  (tomb common features, INV-3-128) are RESOLVED by this
  milestone. C1 (Dilwara pronoun + fronted participial) correctly
  stays unparsed; C2 (Gothic unit text visibly corrupted) is not a
  parser gap; C3 (Jodhpur "Other features", INV-3-109) remains
  open but now has a concrete adapter-only proposal (strip
  leading "Other " for membership drafts only, subject "features
  of Jodhpur", plus clause-tail cuts).
- **Caption / has / relative-clause refinements:** the facade fact
  still does not convert; the mechanism is now precise (fallback
  pool re-sorted by length-closeness and truncated to 3 drops the
  sole same-section distractor, then the entity gate returns
  null; `features` is not single-valued). The caption correction
  is broader than the proposed building-type-noun guard, but the
  over-breadth is theoretical only (it fired solely for Madras
  High Court in the corpus). H1 single-has (Lingaraja), R1
  "revered as", and R4 "which means" gloss are concrete
  follow-up patterns. H2 (Mehrangarh palace list) has a SECOND
  independent block beyond `figure_reference`: the subject "a
  large palace" is unidentified, so the question would fail
  self-containment anyway. H3 exposes a `hasAttributeDrafts`
  mis-split ("a blend of X and Y" → fragment object) needing an
  indivisible-blend guard.
- **Follow-up order after reconciliation:** (1) production-impact
  decision; (2) browser verification (now BLOCKED, see below);
  (3) R1 noun-phrase resolver + R1b agreement guard; (4) R3(a)(c)
  Other-strip carve-out (INV-3-109); (5) H1 single-has + R1 + R4
  patterns; (6) caption building-type tightening + blend guard;
  (7) figure-reference scope (INV-3-104); (8) linker
  normalisation (INV-3-119); (9) layer membership hygiene;
  (10) mid-passage chart-label fusion.

## Browser verification — BLOCKED (main agent, 2026-10-27)

**No browser result is claimed or fabricated.** The main agent
attempted the real-browser run three ways and all three failed
for environment reasons; the full evidence is appended to
`diagnostics/BROWSER_VERIFICATION_BRIEF.md` under "Browser
results". In short: the agent browser cannot reach the VM's
localhost (localhost navigation rejected, loopback alias
refused, external sites fine); the VM's headless Chromium
(version 152) cannot complete navigation/rendering in this
container (no output even for a trivial page or `data:` URL);
and a `cloudflared` quick tunnel is blocked by the egress proxy
(TLS handshake failure to `api.trycloudflare.com`). Browser
layout parity therefore remains UNVERIFIED. The harness built for
the run is preserved in `~/workspace/browser_verify/` for a
future environment where a real browser can reach it. The
precise brief and the Node reference data are in:

- `diagnostics/BROWSER_VERIFICATION_BRIEF.md` (this milestone, local,
  unpushed) — exact procedure, page list, what to record, and how to
  classify discrepancies.
- `diagnostics/browser_reference_node.json` (1,139,715 bytes,
  machine-readable) — Node reference outputs generated from the
  actual hash-verified PDFs with the repo's own layout path
  (`extractPageLayout` → `buildStructuredDocument` →
  `reconstructDocument`, sourceReconstruction `phase2e-1`): for 21
  pages across 4 chapters, every layout block (id, text, bounding
  box), every structured block (all fields including `disposition`,
  `disposition_reason`, `classification_reason`), and every
  reconstructed unit touching the page (unit_id, type, text,
  block_ids, method, rule_id, certainty, figure_ref,
  fragments_used/excluded, review_flags). Pages: hees201 pp. 2, 4, 5,
  9, 15, 16, 20, 26, 27, 31; hees206 pp. 15, 16, 17; hees209 pp. 7, 9,
  29; hees203 pp. 14, 17, 22, 26, 38 (controls). Pages marked
  "candidate" in the file are pages that contain the case text but
  were not block-pinned in the Phase 2E report; the browser run
  should confirm which page carries each case if the reference does
  not match.

## Files created / modified (this milestone only, local, unpushed)

**Modified:**

- `pwa/engine/generator.js` — new supplementary producers + helpers
  + pronoun-block extension + caption correction + `isFragmentPhrase`
  lookbehind + validator lookbehind + three stem templates + list
  hygiene guards + single-object negation guards.
- `pwa/package.json` — appended
  `&& node tests/test_coverage_expansion.js` to the explicit test
  chain.

**Created:**

- `pwa/tests/test_coverage_expansion.js` — 40 checks, self-contained,
  inline fixtures only, no machine paths, no external PDFs.
- `diagnostics/COVERAGE_EXPANSION_RESULTS.md` — this file.
- `diagnostics/BROWSER_VERIFICATION_BRIEF.md` — browser brief.
- `diagnostics/browser_reference_node.json` — Node reference data.

**Staging (outside the repo, regenerated twice, byte-identical):**

- `/home/hatch/workspace/candidate_staging_covexp/run1/` (12 files)
- `/home/hatch/workspace/candidate_staging_covexp/run2/` (12 files)

**Explicitly NOT modified:** `diagnostics/chapter_3_knowledge_inventory.json`
(160 entries, 143 denominator — the run itself confirms total 160 /
denominator 143); `pwa/data/ncert_8_2_candidates/` (pushed candidate
outputs, 12 files intact); `pwa/data/ncert_8_2_staged/` (production
banks, hashes re-verified above); `pwa/engine/sourceReconstruction.js`;
shared parsers other than the two documented lookbehinds and the
three additive stem templates (no changes to `parseMembership`,
`parseEntityAttributes`, `parseDefinition`, `parseFactRelations`,
`parseAllFactRelations`, or the sentence segmenter); any PDF.
