// StudySynth Phase 2D tests — Remaining Fact Recovery and Eight-Chapter
// Shadow Telemetry (Workstream A patterns + production safety).
// Self-contained: every fixture is inline. No fixture depends on a
// machine path or on an external PDF (PDF-backed diagnostics live in
// diagnostics/tools/diagnose_chapter3_phase2d.js and
// diagnostics/tools/diagnose_corpus_phase2d.js, not here).
// Run as: node tests/test_phase2d.js  (from pwa/) or via npm test.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Engine = require('../engine/generator.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

function unit(id, type, text, extra) {
  return Object.assign({
    unit_id: id, type: type, text: text, pages: [1], block_ids: ['b1'],
    section_id: 's1', section_title: 'T'
  }, extra || {});
}
function run(units, options) {
  return Engine.buildTypedKnowledgeFromReconstructedUnits(units, options);
}
function factsByMethod(result, method) {
  return result.typed_facts.filter((f) => f.classification.method === method);
}

const RANI = 'The stepwell at Rani ki Vav (Fig. 3.16) has multiple pillared levels and hundreds of magnificent statues.';
const SOCIAL = 'Besides harvesting and storing rainwater, stepwells offered a social space where people could sit together, enjoy cooler temperatures and exchange all the news.';
const RESERVOIRS = 'Temples often had water reservoirs or puṣhkariṇīs attached to them, which were used for water harvesting as well as water-based rituals.';
const NANDI_BUILDER = 'In Thanjavur, Tamil Nadu, the imposing Bṛihadīśhvara Temple (Fig. 3.20) was built by Rājarāja Chola I around 1010.';
const NANDI = 'It is renowned for its vast maṇḍapas, a huge vimāna, over 60 metres high, and a massive Nandi (sacred bull) statue carved from a single stone, which sits in a pavilion facing the main shrine.';
const SKETCH = 'A sketch made in 1809 by a British army officer shows the mosque’s full-size minarets.';
const THREATS = 'Many of these traditional water structures suffer today from depleted water sources, maintenance issues, pollution, waste dumping, etc. Environmentalists, locals, and NGOs sometimes join hands to preserve them, but much remains to be done.';
const MODEST = 'Until the 8th or 9th century, temples were modest in size.';
const GREW = 'From the 10th century onward, in different parts of India they grew in scale and began incorporating multiple shrines.';

// ---- A1. Rani ki Vav "has" attributes ----

check('A1 genuine Rani ki Vav sentence types exactly two has attributes', () => {
  const r = run([unit('RU-039', 'body_prose', RANI)]);
  const has = factsByMethod(r, 'has_attribute');
  assert.strictEqual(has.length, 2);
  assert.ok(has.every((f) => f.subject === 'The stepwell at Rani ki Vav'));
  assert.deepStrictEqual(has.map((f) => f.object).sort(),
    ['hundreds of magnificent statues', 'multiple pillared levels']);
  assert.ok(has.every((f) => f.evidence === RANI));
  assert.ok(has.every((f) => (f.derivation.figure_refs_removed || []).join(' ').indexOf('Fig. 3.16') !== -1));
  assert.strictEqual(r.unparsed_units.length, 0);
});

check('A1 figure-only subject yields no has fact', () => {
  const r = run([unit('RU-001', 'body_prose', '(Fig. 3.16) has multiple pillared levels and hundreds of statues.')]);
  assert.strictEqual(r.typed_facts.filter((f) => f.classification.method === 'has_attribute').length, 0);
});

check('A1 empty attribute and multi-and lists yield no has fact', () => {
  const empty = run([unit('RU-001', 'body_prose', 'The hall has and domes.')]);
  assert.strictEqual(empty.typed_facts.filter((f) => f.classification.method === 'has_attribute').length, 0);
  const multi = run([unit('RU-001', 'body_prose', 'The hall has pillars and arches and domes.')]);
  assert.strictEqual(multi.typed_facts.filter((f) => f.classification.method === 'has_attribute').length, 0);
});

check('A1 pronoun subject yields no has fact', () => {
  const r = run([unit('RU-001', 'body_prose', 'It has multiple pillared levels and hundreds of statues.')]);
  assert.strictEqual(r.typed_facts.filter((f) => f.classification.method === 'has_attribute').length, 0);
});

// ---- A2. Social function of stepwells ----

check('A2 social-space sentence types one offered fact with full object', () => {
  const r = run([unit('RU-039', 'body_prose', SOCIAL)]);
  const offered = factsByMethod(r, 'offered_social_space');
  assert.strictEqual(offered.length, 1);
  assert.strictEqual(offered[0].subject, 'stepwells');
  assert.strictEqual(offered[0].object,
    'a social space where people could sit together, enjoy cooler temperatures and exchange all the news');
  assert.strictEqual(offered[0].derivation.stripped_prefix, 'Besides harvesting and storing rainwater');
  assert.strictEqual(offered[0].evidence, SOCIAL);
});

check('A2 offered without a social space or where-clause yields no fact', () => {
  const plain = run([unit('RU-001', 'body_prose', 'Stepwells offered water to travellers.')]);
  assert.strictEqual(plain.typed_facts.filter((f) => f.classification.method === 'offered_social_space').length, 0);
  const bare = run([unit('RU-001', 'body_prose', 'Stepwells offered a social space.')]);
  assert.strictEqual(bare.typed_facts.filter((f) => f.classification.method === 'offered_social_space').length, 0);
});

// ---- A3. Relative-clause passive ----

check('A3 reservoirs sentence types had + used_for with the full antecedent preserved', () => {
  const r = run([unit('RU-039', 'body_prose', RESERVOIRS)]);
  const had = factsByMethod(r, 'relative_clause_attachment');
  const used = factsByMethod(r, 'relative_clause_used_for');
  assert.strictEqual(had.length, 1);
  assert.strictEqual(used.length, 1);
  assert.strictEqual(had[0].subject, 'Temples');
  assert.strictEqual(had[0].object, 'water reservoirs or puṣhkariṇīs');
  assert.strictEqual(had[0].derivation.attached_to_them, true);
  assert.strictEqual(had[0].derivation.frequency, 'often');
  assert.strictEqual(used[0].subject, 'water reservoirs or puṣhkariṇīs');
  assert.strictEqual(used[0].object, 'water harvesting as well as water-based rituals');
  assert.strictEqual(used[0].derivation.antecedent_text, 'water reservoirs or puṣhkariṇīs');
  assert.ok(used[0].object.indexOf('water-based rituals') !== -1);
  assert.ok(had[0].evidence === RESERVOIRS && used[0].evidence === RESERVOIRS);
});

check('A3 number mismatch keeps the had fact but rejects used_for', () => {
  const r = run([unit('RU-001', 'body_prose',
    'Temples often had a reservoir attached to them, which were used for water harvesting.')]);
  assert.strictEqual(factsByMethod(r, 'relative_clause_attachment').length, 1);
  assert.strictEqual(factsByMethod(r, 'relative_clause_used_for').length, 0);
});

check('A3 missing plural antecedent keeps had but rejects used_for', () => {
  const r = run([unit('RU-001', 'body_prose',
    'Temples often had water attached to them, which were used for rituals.')]);
  assert.strictEqual(factsByMethod(r, 'relative_clause_attachment').length, 1);
  assert.strictEqual(factsByMethod(r, 'relative_clause_used_for').length, 0);
});

check('A3 a which-they clause never binds to an unrelated subject', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The hall had lamps attached to them, which they used for light.')]);
  assert.strictEqual(factsByMethod(r, 'relative_clause_used_for').length, 0);
});

check('A3 attachment to a named target instead of them yields no relative facts', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The temple had a reservoir attached to the hall, which was used for rituals.')]);
  assert.strictEqual(factsByMethod(r, 'relative_clause_attachment').length, 0);
  assert.strictEqual(factsByMethod(r, 'relative_clause_used_for').length, 0);
});

// ---- A4. Renowned + temporal scale ----

// Note: a bare "The temple is renowned for ..." sentence is already
// typed by the layer as a weak role fact, so the supplementary
// renowned pattern (which runs only on segments the layer left
// untyped) does not duplicate it. The explicit-subject case below
// uses a figure-reference subject, which the layer rejects — the
// supplementary pattern then strips the reference (recorded) and
// types the claim precisely.
check('A4 explicit renowned subject with a figure reference types renowned_for', () => {
  const r = run([unit('RU-001', 'body_prose', 'The temple (Fig. 2.1) is renowned for its carvings and paintings.')]);
  const ren = factsByMethod(r, 'renowned_for');
  assert.strictEqual(ren.length, 1);
  assert.strictEqual(ren[0].subject, 'The temple');
  assert.strictEqual(ren[0].object, 'its carvings and paintings');
  assert.ok((ren[0].derivation.figure_refs_removed || []).join(' ').indexOf('Fig. 2.1') !== -1);
});

check('A4 renowned with a truncated object yields no fact', () => {
  const r = run([unit('RU-001', 'body_prose', 'The temple is renowned for.')]);
  assert.strictEqual(factsByMethod(r, 'renowned_for').length, 0);
});

check('A4 renowned pronoun without an antecedent stays unparsed', () => {
  const r = run([unit('RU-001', 'body_prose', 'It is renowned for its carvings.')]);
  assert.strictEqual(factsByMethod(r, 'renowned_for').length, 0);
  assert.strictEqual(r.unparsed_units.length, 1);
});

check('A4 Nandi renowned sentence types via the bounded same-unit resolver', () => {
  const r = run([unit('RU-050', 'body_prose', NANDI_BUILDER + ' ' + NANDI)]);
  const ren = factsByMethod(r, 'renowned_for');
  assert.strictEqual(ren.length, 1);
  assert.ok(ren[0].subject.indexOf('Bṛihadīśhvara Temple') !== -1);
  assert.ok(ren[0].derivation.pronoun_resolution, 'resolution derivation preserved');
  assert.strictEqual(ren[0].derivation.pronoun_resolution.original_subject, 'It');
  assert.strictEqual(ren[0].evidence, NANDI);
});

check('A4 modest-size claim types with an until temporal scope', () => {
  const r = run([unit('RU-050', 'body_prose', MODEST)]);
  const modest = factsByMethod(r, 'temporal_scale_modest');
  assert.strictEqual(modest.length, 1);
  assert.strictEqual(modest[0].subject, 'temples');
  assert.strictEqual(modest[0].object, 'modest in size');
  assert.strictEqual(modest[0].qualifiers.temporal_scope, 'until the 8th or 9th century');
});

check('A4 grew-in-scale claim types with a from-onward scope via they-resolution', () => {
  const r = run([unit('RU-050', 'body_prose', MODEST + ' ' + GREW)]);
  const grew = factsByMethod(r, 'temporal_scale_grew');
  assert.strictEqual(grew.length, 1);
  assert.strictEqual(grew[0].subject, 'temples');
  assert.strictEqual(grew[0].object, 'grew in scale');
  assert.strictEqual(grew[0].qualifiers.temporal_scope, 'from the 10th century onward');
  assert.strictEqual(grew[0].derivation.pronoun_resolution.original_subject, 'they');
});

check('A4 grew-in-scale without an antecedent or without a temporal prefix stays unparsed', () => {
  const noAntecedent = run([unit('RU-001', 'body_prose',
    'From the 10th century onward, in different parts of India they grew in scale.')]);
  assert.strictEqual(factsByMethod(noAntecedent, 'temporal_scale_grew').length, 0);
  const noPrefix = run([unit('RU-001', 'body_prose', 'Temples grew in scale.')]);
  assert.strictEqual(factsByMethod(noPrefix, 'temporal_scale_grew').length, 0);
});

// ---- A5. Fig 3.29 sketch claims, no mosque binding ----

check('A5 sketch sentence types date + maker and binds nothing to a mosque', () => {
  const r = run([unit('RU-064', 'caption', 'Fig. 3.29. ' + SKETCH, { figure_ref: 'fig 3.29' })]);
  const date = factsByMethod(r, 'sketch_claim_date');
  const maker = factsByMethod(r, 'sketch_claim_maker');
  assert.strictEqual(date.length, 1);
  assert.strictEqual(date[0].subject, 'A sketch');
  assert.strictEqual(date[0].object, '1809');
  assert.strictEqual(date[0].fact_type, 'date');
  assert.strictEqual(maker.length, 1);
  assert.strictEqual(maker[0].subject, 'A sketch');
  assert.strictEqual(maker[0].object, 'a British army officer');
  assert.ok(maker[0].derivation.mosque_unbound, 'mosque explicitly left unbound');
  assert.ok(!r.typed_facts.some((f) =>
    /mosque|jama|ahmedabad/i.test(f.subject + ' ' + f.object)),
    'no fact names a mosque identity');
});

check('A5 sketch date and maker are independent', () => {
  const noMaker = run([unit('RU-001', 'caption', 'A sketch made in 1809 shows the mosque’s minarets.', { figure_ref: 'fig 3.29' })]);
  assert.strictEqual(factsByMethod(noMaker, 'sketch_claim_date').length, 1);
  assert.strictEqual(factsByMethod(noMaker, 'sketch_claim_maker').length, 0);
  const noYear = run([unit('RU-001', 'caption', 'A sketch by a British army officer shows the mosque’s minarets.', { figure_ref: 'fig 3.29' })]);
  assert.strictEqual(factsByMethod(noYear, 'sketch_claim_date').length, 0);
  assert.strictEqual(factsByMethod(noYear, 'sketch_claim_maker').length, 1);
});

// ---- A6. "etc." sentence boundary ----

check('A6 splitEtcBoundary splits only a capital-letter sentence after etc.', () => {
  const split = Engine.splitEtcBoundary(THREATS);
  assert.ok(split, 'threats text splits');
  assert.strictEqual(split.first,
    'Many of these traditional water structures suffer today from depleted water sources, maintenance issues, pollution, waste dumping, etc.');
  assert.strictEqual(split.second,
    'Environmentalists, locals, and NGOs sometimes join hands to preserve them, but much remains to be done.');
  assert.strictEqual(Engine.splitEtcBoundary('Waste dumping, etc., and other problems continued for years here.'), null);
  assert.strictEqual(Engine.splitEtcBoundary('Waste dumping, etc. environmentalists joined the effort here.'), null);
  assert.strictEqual(Engine.splitEtcBoundary('The list ends with waste dumping, etc.'), null);
  assert.strictEqual(Engine.splitEtcBoundary('Waste, etc. Go now.'), null);
});

check('A6 threats unit splits into two unparsed records with exact spans', () => {
  const r = run([unit('RU-040', 'body_prose', THREATS)]);
  assert.strictEqual(r.typed_facts.length, 0);
  assert.strictEqual(r.unparsed_units.length, 2);
  // Unparsed IDs derive from unit position in the run (single-unit
  // fixture => 001); the full-chapter harness run yields UU-REC-040-*
  // for the real threats unit.
  assert.strictEqual(r.unparsed_units[0].unparsed_id, 'UU-REC-001-001');
  assert.strictEqual(r.unparsed_units[1].unparsed_id, 'UU-REC-001-001-b');
  assert.ok(r.unparsed_units[0].original_text.endsWith('etc.'));
  assert.ok(r.unparsed_units[1].original_text.indexOf('Environmentalists') === 0);
  assert.ok(r.unparsed_units[1].source.sentence_span.start > r.unparsed_units[0].source.sentence_span.start);
  assert.ok(r.unparsed_units.every((u) => u.reason === 'unsupported_pattern'));
});

check('A6 a split half that types rescues only that half', () => {
  const r = run([unit('RU-001', 'body_prose',
    'Many structures suffer from pollution, etc. The temple was built by Rajaraja Chola I.')]);
  assert.ok(r.typed_facts.some((f) => f.relation === 'built_by'));
  const built = r.typed_facts.find((f) => f.relation === 'built_by');
  assert.strictEqual(built.evidence, 'The temple was built by Rajaraja Chola I.');
  assert.strictEqual(r.unparsed_units.length, 1);
  assert.ok(r.unparsed_units[0].original_text.indexOf('suffer from pollution') !== -1);
});

check('A6 baseline options do not split: joined threats record survives', () => {
  const r = run([unit('RU-040', 'body_prose', THREATS)], { supplementary: false, deduplicate: false });
  assert.strictEqual(r.unparsed_units.length, 1);
  assert.strictEqual(r.unparsed_units[0].original_text, THREATS);
});

// ---- A7. Epistemic qualifiers and fact semantics ----

check('A7 characterised-by is an attribute, not a definition', () => {
  const r = run([unit('RU-015', 'body_prose',
    'Harappan architecture is located in the Indus valley. It is characterised by planned streets and drainage.')]);
  const ch = r.typed_facts.find((f) => f.relation === 'characterised_by');
  assert.ok(ch, 'characterised_by fact present');
  assert.strictEqual(ch.fact_type, 'entity_attribute');
  assert.strictEqual(ch.subject, 'Harappan architecture');
  assert.strictEqual(ch.object, 'planned streets and drainage');
  assert.strictEqual(ch.derivation.semantic_correction, 'characterised_by_not_definition');
  assert.ok(!r.typed_facts.some((f) => f.fact_type === 'definition'
    && (f.evidence || '').indexOf('characterised by') !== -1),
    'no definition fact from a characterised-by sentence');
});

check('A7 According to tradition becomes a structured qualifier, not the entity name', () => {
  const r = run([unit('RU-111', 'body_prose',
    'According to tradition, the first churches were built in the coastal areas of Kerala.')]);
  const f = r.typed_facts.find((x) => x.relation === 'built_in');
  assert.ok(f, 'built_in fact present');
  assert.strictEqual(f.subject, 'the first churches');
  assert.strictEqual(f.qualifiers.attribution, 'According to tradition');
  assert.strictEqual(f.derivation.attribution, 'According to tradition');
});

check('A7 shared definition parser is not broadened by the correction', () => {
  const drafts = Engine.parseAllFactRelations('Harappan architecture is characterised by planned streets.', { previousSubject: '' });
  assert.ok(drafts.some((d) => d.fact_type === 'definition'),
    'shared parser still labels characterised-by as definition; only the supplementary draft is corrected');
});

// ---- A8. Absolute safety cases ----

check('A8 Fig 3.53 pronoun never binds domes and towers to the Madras High Court', () => {
  const r = run([unit('RU-118', 'caption', 'Fig. 3.53. A close-up of some of its domes and towers.', { figure_ref: 'fig 3.53' })]);
  assert.strictEqual(r.typed_facts.length, 0);
  assert.ok(!r.typed_facts.some((f) => /madras/i.test(f.subject + ' ' + f.object)));
});

check('A8 timeline-style label text yields no date pairings', () => {
  const r = run([unit('RU-003', 'body_prose', 'Brihadisvara Temple 1010 CE Ahmedabad 1424 Bishnupur 17th century')]);
  assert.strictEqual(r.typed_facts.filter((f) => f.fact_type === 'date').length, 0);
});

check('A8 truncated sentences stay visible as unparsed', () => {
  const r = run([unit('RU-050', 'body_prose', 'The entire')]);
  assert.strictEqual(r.typed_facts.length, 0);
  assert.strictEqual(r.unparsed_units.length, 1);
  assert.ok(r.unparsed_units[0].reason, 'a reason is recorded');
});

// ---- Corpus audit: narrowed patterns (Phase 2D Workstream B) ----
// The eight-chapter telemetry run exposed false positives from the
// Workstream A patterns on other chapters' prose. These tests pin the
// narrowing guards (generator.js guards H1/H2/H3 and the passive
// temporal + fragment-subject guards) at helper level, plus one
// adapter-level check. Every fixture is a real corpus sentence shape;
// none depends on a PDF.

check('Corpus H1: a subordinate-clause has never binds the sentence subject', () => {
  const drafts = Engine.hasAttributeDrafts(
    'Duties are not only about obeying laws or following rules, they are about the responsibility each one of us has towards our family, our community, our country, and even the environment.');
  assert.strictEqual(drafts.length, 0);
});

check('Corpus H2: auxiliary has (has called / has thus endured) yields no has fact', () => {
  const called = Engine.hasAttributeDrafts(
    'The UN has called this waste problem ‘an environmental and social emergency’.');
  assert.strictEqual(called.length, 0);
  const endured = Engine.hasAttributeDrafts(
    'Indian culture has thus endured even in times of political instability and invasions.');
  assert.strictEqual(endured.length, 0);
});

check('Corpus H2 positive control: participial adjectives still type as attributes', () => {
  const drafts = Engine.hasAttributeDrafts('The hall has carved panels and painted ceilings.');
  assert.strictEqual(drafts.length, 2);
  assert.deepStrictEqual(drafts.map((d) => d.draft.object).sort(),
    ['carved panels', 'painted ceilings']);
});

check('Corpus H3: trailing with-having clause and split comma are trimmed from has objects', () => {
  const india = Engine.hasAttributeDrafts(
    'India has a long tradition of weaving and unique textiles, with every region having its own speciality.');
  assert.strictEqual(india.length, 2);
  assert.deepStrictEqual(india.map((d) => d.draft.object).sort(),
    ['a long tradition of weaving', 'unique textiles']);
  const bkc = Engine.hasAttributeDrafts(
    'The Bandra Kurla Complex, Mumbai, has banks, corporate offices, and financial institutions.');
  assert.strictEqual(bkc.length, 2);
  assert.deepStrictEqual(bkc.map((d) => d.draft.object).sort(),
    ['banks, corporate offices', 'financial institutions']);
});

check('Corpus adapter: the UN sentence types no has fact end to end', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The UN has called this waste problem ‘an environmental and social emergency’.')]);
  assert.strictEqual(r.typed_facts.filter((f) => f.classification.method === 'has_attribute').length, 0);
});

check('Corpus passive: a century is not a developed_in place; a fragment subject is rejected', () => {
  const century = Engine.passiveDraftsForSegment(
    'enturies C developed in the early 17 th century with terraces.');
  assert.strictEqual(century.length, 0);
  const fragment = Engine.passiveDraftsForSegment('The kings C developed in Gujarat.');
  assert.strictEqual(fragment.length, 0);
});

check('Corpus passive controls: place objects and regnal numerals still type', () => {
  const place = Engine.passiveDraftsForSegment(
    'In classical times, a tradition of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan.');
  assert.strictEqual(place.length, 1);
  assert.strictEqual(place[0].draft.relation, 'developed_in');
  assert.strictEqual(place[0].draft.object, 'Gujarat and Rajasthan');
  const regnal = Engine.passiveDraftsForSegment('King Chola I developed in Gujarat.');
  assert.strictEqual(regnal.length, 1);
  assert.strictEqual(regnal[0].draft.subject, 'King Chola I');
  assert.strictEqual(regnal[0].draft.relation, 'developed_in');
});

// ---- Production safety, determinism, bank hashes ----

check('P1 typed layer alone produces none of the Phase 2D supplementary facts', () => {
  const sections = Engine.parseRawDocument(
    '# T\n\n' + RANI + ' ' + SOCIAL + ' ' + RESERVOIRS + ' ' + SKETCH, 'T');
  const layer = Engine.buildTypedKnowledge(sections, { documentId: 'test' });
  const hasPair = (subject, relation) => layer.typed_facts.some((f) =>
    f.subject === subject && f.relation === relation);
  assert.ok(!hasPair('The stepwell at Rani ki Vav', 'has'),
    'typed layer must not produce the supplementary has facts');
  assert.ok(!hasPair('stepwells', 'offered'),
    'typed layer must not produce the supplementary offered fact');
  assert.ok(!layer.typed_facts.some((f) => f.relation === 'used_for'),
    'typed layer must not produce the supplementary used_for fact');
  assert.ok(!layer.typed_facts.some((f) => f.relation === 'renowned_for'),
    'typed layer must not produce the supplementary renowned_for fact');
  assert.ok(!hasPair('A sketch', 'made_by') && !hasPair('A sketch', 'made_in'),
    'typed layer must not produce the supplementary sketch facts');
});

check('P2 baseline options reproduce the Phase 2B adapter on the wells unit', () => {
  const r = run([unit('RU-039', 'body_prose',
    'Wells have been constructed in many sizes and shapes from bricks, stones, or terracotta ring. '
    + 'In classical times, a tradition of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan, many of them engineering marvels as well as spectacular works of art. '
    + RANI + ' ' + SOCIAL + ' ' + RESERVOIRS + ' '
    + 'Many of them were also works of art, with numerous stairways built into them (Fig. 3.17).')],
    { supplementary: false, deduplicate: false });
  assert.strictEqual(r.typed_facts.length, 0);
  assert.strictEqual(r.unparsed_units.length, 6);
});

check('P3 production builders and validators do not reference reconstruction', () => {
  const sources = [
    Engine.buildQuestionCandidates.toString(),
    Engine.validateQuestion.toString(),
    Engine.buildDistractorCandidates.toString()
  ].join('\n');
  assert.ok(sources.indexOf('reconstruct') === -1, 'no reconstruct reference in production builders');
});

check('P4 adapter runs are deterministic', () => {
  const units = [unit('RU-039', 'body_prose', RANI + ' ' + SOCIAL + ' ' + RESERVOIRS),
    unit('RU-040', 'body_prose', THREATS)];
  const a = run(units);
  const b = run(units);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

check('P5 production banks, manifest, consolidated file and Phase 2C outputs byte-identical', () => {
  const repo = path.join(__dirname, '..', '..');
  const expected = {
    'pwa/data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md': 'b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87',
    'pwa/data/ncert_8_2_staged/hees201_world_geography.md': 'a36d62162871fd4764be42ea58d43eeff860fcd17412d445d0992c10dd7e18ea',
    'pwa/data/ncert_8_2_staged/hees202_indias_road_to_independence.md': '04de0e0cee2e29ab84657b3bee3e3db4e3fb987dad6338b776c0549ec0ad53a8',
    'pwa/data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md': '94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4',
    'pwa/data/ncert_8_2_staged/hees204_judiciary_in_our_society.md': '6a6f13bf3b7fdf005eaa50292efc95041798056ef5191fddba88d5b9c309f46d',
    'pwa/data/ncert_8_2_staged/hees205_citizenship_rights_and_duties.md': 'c49532ae8fc357324fe8b703920c3ae53e476b3916fcc0b544e37c448ac43497',
    'pwa/data/ncert_8_2_staged/hees206_dynamics_of_population.md': '95fe993b0b08fd0e08fe9cd97d22bdced598dc3074b2161d116bc552e2f9cd10',
    'pwa/data/ncert_8_2_staged/hees207_indias_urban_landscape.md': '25b0de908d09ac2a80cb2d54e8a446fc0a0fb297ae13e3f51f56875932767ce3',
    'pwa/data/ncert_8_2_staged/hees209_cultural_currents_13th_to_17th_centuries.md': '0d93b8fc0f8c0b9e8fbf29de1af1619dd14eb9ec4f6b42e642de55ea4b09ba59',
    'pwa/data/ncert_8_2_staged/summary_manifest.json': '2a17f7b1b7dba7bbf426e66e96ab26f5315ef9a3dedf7b6ea939a6facc6a3669',
    'diagnostics/chapter_3_phase2c_metrics.json': '021a175984559b1d6aa0c0b5214294c5f6f10cf25868ca29df85073dbeb93ee9',
    'diagnostics/chapter_3_phase2c_typed_fact_comparison.json': 'da1aca2e1952133f77dfefb3b12c2fd180ca6a45fec8493d6bc41d160b768d78',
    'diagnostics/CHAPTER_3_PHASE_2C_RESULTS.md': '2e0adec67298c1241be5de0d4920e974bb337457953bfe053b103cd935115625',
    'pwa/tests/test_phase2c.js': '182c4a35392682d2b35f7e7f7cdd1dea41400f6e753e74b24a763c73fe3bb9a5',
    'diagnostics/v2_cross_chapter_comparison_phase2b.json': '89d3aac1c60f3cd8e5f17bc2852276010f1bfa64d418b1914473ba4406a5f3b9'
  };
  Object.keys(expected).forEach((rel) => {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, rel))).digest('hex');
    assert.strictEqual(actual, expected[rel], 'hash mismatch: ' + rel);
  });
});

check('P6 Phase 2D helpers are exported', () => {
  ['hasAttributeDrafts', 'offeredSocialSpaceDrafts', 'relativeClauseDrafts',
    'renownedDrafts', 'temporalScaleDrafts', 'sketchClaimDrafts',
    'splitEtcBoundary', 'relabelCharacterisedBy', 'normalizeOrdinals',
    'stripAttributionPrefix'].forEach((name) => {
    assert.strictEqual(typeof Engine[name], 'function', name + ' exported');
  });
});

console.log('Phase 2D tests passed: ' + passed + ' checks.');
