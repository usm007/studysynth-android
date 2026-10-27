// StudySynth Phase 2C tests — Typed Knowledge Recovery from Reconstructed Sources.
// Self-contained: every fixture is inline. No fixture depends on a machine
// path or on an external PDF (PDF-backed diagnostics live in
// diagnostics/tools/diagnose_chapter3_phase2c.js, not here).
// Run as: node tests/test_phase2c.js  (from pwa/) or via npm test.
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
function facts(result) {
  return result.typed_facts;
}
function factByMethod(result, method) {
  return result.typed_facts.find((f) => f.classification.method === method);
}

const WELLS_TEXT = 'Wells have been constructed in many sizes and shapes from bricks, stones, or terracotta ring. '
  + 'In classical times, a tradition of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan, many of them engineering marvels as well as spectacular works of art. '
  + 'The stepwell at Rani ki Vav (Fig. 3.16) has multiple pillared levels and hundreds of magnificent statues. '
  + 'Besides harvesting and storing rainwater, stepwells offered a social space where people could sit together, enjoy cooler temperatures and exchange all the news. '
  + 'Temples often had water reservoirs or puṣhkariṇīs attached to them, which were used for water harvesting as well as water-based rituals. '
  + 'Many of them were also works of art, with numerous stairways built into them (Fig. 3.17).';
const WELLS_S2 = 'In classical times, a tradition of stepwells (vāvs or bāorīs) developed in Gujarat and Rajasthan, many of them engineering marvels as well as spectacular works of art.';
const BUILDER = 'In Thanjavur, Tamil Nadu, the imposing Bṛihadīśhvara Temple (Fig. 3.20) was built by Rājarāja Chola I around 1010.';
const NANDI = 'It is renowned for its vast maṇḍapas, a huge vimāna, over 60 metres high, and a massive Nandi (sacred bull) statue carved from a single stone, which sits in a pavilion facing the main shrine.';
const GLOSS_TEXT = 'Latticework: Open framework with criss-crossing or decorative designs. Here, it is both functional (allowing ventilation) and aesthetic in design.';
const GLOSS_DEF = 'Open framework with criss-crossing or decorative designs. Here, it is both functional (allowing ventilation) and aesthetic in design.';
const FIG352 = 'Fig. 3.52. A general view of the Madras High Court, completed in 1892. The red sandstone facade features Islamic arches and intricate screens alongside carvings and pillars in Hindu temple style.';
const FIG353 = 'Fig. 3.53. A close-up of some of its domes and towers.';

// ---- A. Glossary definition recovery ----

check('A1 latticework entry types definition + Here-it attribute', () => {
  const r = run([unit('RU-077', 'glossary_definition', GLOSS_TEXT, {
    term: 'Latticework', definition: GLOSS_DEF,
    block_ids: ['p26-b18', 'p26-b1', 'p26-b20', 'p26-b2', 'p26-b22', 'p26-b24', 'p26-b3', 'p26-b25', 'p26-b4']
  })]);
  assert.strictEqual(r.typed_facts.length, 2);
  const def = factByMethod(r, 'glossary_term_definition');
  assert.ok(def, 'definition fact present');
  assert.strictEqual(def.subject, 'Latticework');
  assert.strictEqual(def.object, 'Open framework with criss-crossing or decorative designs');
  assert.strictEqual(def.fact_type, 'definition');
  assert.strictEqual(def.source.evidence_source, 'glossary');
  assert.deepStrictEqual(def.source.block_ids.slice(0, 3), ['p26-b18', 'p26-b1', 'p26-b20']);
  assert.strictEqual(def.evidence, 'Latticework: Open framework with criss-crossing or decorative designs.');
  const attr = factByMethod(r, 'glossary_term_reference');
  assert.ok(attr, 'Here-it attribute fact present');
  assert.strictEqual(attr.subject, 'Latticework');
  assert.strictEqual(attr.object, 'both functional (allowing ventilation) and aesthetic in design');
  assert.strictEqual(attr.derivation.term, 'Latticework');
  assert.strictEqual(attr.derivation.original_subject, 'it');
  assert.strictEqual(r.unparsed_units.length, 0);
});

check('A2 glossary punctuation variation (hyphenated term)', () => {
  const r = run([unit('RU-001', 'glossary_definition',
    'Mother-of-pearl: Shiny inner layer of shells. Here, it is used in jewellery.',
    { term: 'Mother-of-pearl', definition: 'Shiny inner layer of shells. Here, it is used in jewellery.' })]);
  assert.strictEqual(r.typed_facts.length, 2);
  assert.strictEqual(factByMethod(r, 'glossary_term_definition').object, 'Shiny inner layer of shells');
  assert.strictEqual(factByMethod(r, 'glossary_term_reference').subject, 'Mother-of-pearl');
});

check('A3 glossary empty definition yields no facts, unit stays unparsed', () => {
  const r = run([unit('RU-001', 'glossary_definition', 'Latticework:', { term: 'Latticework', definition: '' })]);
  assert.strictEqual(r.typed_facts.length, 0);
  assert.ok(r.unparsed_units.length >= 1);
});

check('A4 glossary without term metadata yields no glossary facts', () => {
  const r = run([unit('RU-001', 'glossary_definition', 'Alpha: Some definition text here.',
    { term: null, definition: 'Some definition text here.' })]);
  assert.strictEqual(r.typed_facts.length, 0);
  assert.ok(!r.typed_facts.some((f) => f.classification.method.indexOf('glossary_') === 0));
});

check('A5 glossary cluster never combines two entries into one fact', () => {
  const r = run([unit('RU-001', 'glossary_definition', 'Alpha: First definition. Beta: Second definition.',
    { term: 'Alpha', definition: 'First definition. Beta: Second definition.' })]);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.strictEqual(r.typed_facts[0].object, 'First definition');
  assert.ok(!r.typed_facts.some((f) => f.object.indexOf('Beta') !== -1));
  assert.ok(r.unparsed_units.some((u) => u.original_text.indexOf('Beta: Second definition.') !== -1));
});

// ---- B. Passive-voice attribute recovery ----

check('B1 builder sentence types built_by with agent, date and cleaned subject', () => {
  const r = run([unit('RU-050', 'body_prose', BUILDER)]);
  const f = factByMethod(r, 'passive_built_by');
  assert.ok(f, 'built_by fact present');
  assert.strictEqual(f.subject, 'the imposing Bṛihadīśhvara Temple');
  assert.ok(f.subject.indexOf('Fig.') === -1, 'figure reference removed from subject');
  assert.strictEqual(f.object, 'Rājarāja Chola I');
  assert.strictEqual(f.qualifiers.temporal_scope, 'around 1010');
  assert.strictEqual(f.derivation.stripped_prefix, 'Thanjavur, Tamil Nadu');
  assert.strictEqual(f.derivation.prefix_kind, 'place');
  assert.deepStrictEqual(f.derivation.figure_refs_removed, ['(Fig. 3.20)']);
  assert.strictEqual(f.evidence, BUILDER);
});

check('B2 constructed_by types when the layer cannot (prefixed subject)', () => {
  const r = run([unit('RU-001', 'body_prose', 'In Mysuru, the palace was constructed by King X in 1200.')]);
  const f = factByMethod(r, 'passive_constructed_by');
  assert.ok(f, 'constructed_by fact present');
  assert.strictEqual(f.subject, 'the palace');
  assert.strictEqual(f.object, 'King X');
  assert.strictEqual(f.qualifiers.temporal_scope, 'in 1200');
});

check('B3 plain constructed-by is NOT relabelled when the layer already typed the agent claim', () => {
  const r = run([unit('RU-001', 'body_prose', 'The temple was constructed by King X in 1200.')]);
  assert.ok(r.typed_facts.some((f) => f.relation === 'launched_by' && f.object === 'King X'), 'layer agent fact present');
  assert.ok(!r.typed_facts.some((f) => f.relation === 'constructed_by'), 'no relabel duplicate');
});

check('B4 developed_by types exactly once', () => {
  const r = run([unit('RU-001', 'body_prose', 'The garden was developed by the king.')]);
  const found = r.typed_facts.filter((f) => f.relation === 'developed_by');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].object, 'the king');
});

check('B5 wells developed_in sentence types with temporal scope and recorded parenthetical removal', () => {
  const r = run([unit('RU-039', 'body_prose', WELLS_S2)]);
  const f = factByMethod(r, 'passive_developed_in');
  assert.ok(f, 'developed_in fact present');
  assert.strictEqual(f.subject, 'a tradition of stepwells');
  assert.strictEqual(f.object, 'Gujarat and Rajasthan');
  assert.strictEqual(f.qualifiers.temporal_scope, 'classical times');
  assert.deepStrictEqual(f.derivation.parenthetical_removed, ['(vāvs or bāorīs)']);
  assert.strictEqual(f.evidence, WELLS_S2);
});

check('B6 aux built_in types', () => {
  const r = run([unit('RU-001', 'body_prose', 'The fort was built in Rajasthan.')]);
  const f = r.typed_facts.find((x) => x.relation === 'built_in');
  assert.ok(f, 'built_in fact present');
  assert.strictEqual(f.subject, 'The fort');
  assert.strictEqual(f.object, 'Rajasthan');
});

check('B7 passive negatives stay unparsed', () => {
  const negatives = [
    'Wells have been constructed in many sizes and shapes from bricks, stones, or terracotta ring.',
    'The plan was developed in order to improve the city.',
    'The temple was built by them.',
    'Developed countries are rich.',
    'The fort was built in which region is unknown.'
  ];
  negatives.forEach((text) => {
    const r = run([unit('RU-001', 'body_prose', text)]);
    assert.ok(!r.typed_facts.some((f) => f.classification.rule_id === 'phase2c-shadow-v1'),
      'no supplementary fact for: ' + text);
  });
});

// Phase 2D supersedes this measurement (see test_phase2d.js): the five
// sentences Phase 2C left unparsed are now recovered by the Phase 2D
// supplementary patterns (has attributes, offered social space,
// relative-clause had + used_for). The Phase 2C measurement (1 typed,
// 5 unparsed) is preserved in the Phase 2C report and in the Phase 2D
// typed-fact comparison; this check pins the new measured outcome so
// the suite stays green without hiding the change.
check('B8 wells passage measured sentence by sentence: 6 typed, 2 unparsed (Phase 2D supersession)', () => {
  const r = run([unit('RU-039', 'body_prose', WELLS_TEXT)]);
  assert.strictEqual(r.typed_facts.length, 6);
  const relations = r.typed_facts.map((f) => f.relation).sort();
  assert.deepStrictEqual(relations, ['developed_in', 'had', 'has', 'has', 'offered', 'used_for']);
  assert.strictEqual(r.unparsed_units.length, 2);
  assert.ok(r.unparsed_units.every((u) => u.reason === 'unsupported_pattern'));
  assert.ok(!r.unparsed_units.some((u) => u.original_text.indexOf('developed in Gujarat and Rajasthan') !== -1),
    'the typed sentence is rescued from unparsed');
});

// ---- C. Local pronoun resolution + figure-reference cleanup ----

check('C1 pronoun with a unique antecedent resolves and types', () => {
  const r = run([unit('RU-900', 'body_prose',
    'The Brihadisvara Temple is located in Thanjavur. It was built by Rajaraja Chola I.')]);
  const f = factByMethod(r, 'pronoun_resolution_same_unit');
  assert.ok(f, 'pronoun-resolved fact present');
  assert.strictEqual(f.subject, 'The Brihadisvara Temple');
  assert.strictEqual(f.relation, 'built_by');
  assert.strictEqual(f.object, 'Rajaraja Chola I');
  assert.strictEqual(f.derivation.antecedent_text, 'The Brihadisvara Temple');
  assert.strictEqual(f.derivation.original_subject, 'It');
  assert.strictEqual(f.evidence, 'It was built by Rajaraja Chola I.');
});

check('C2 resolver rejects two plausible antecedents', () => {
  const res = Engine.resolveLocalPronounAntecedent([['A Temple', 'A Palace']], 1, 'It');
  assert.strictEqual(res.antecedent, null);
  assert.strictEqual(res.ambiguous, true);
});

check('C3 pronoun-first text without an antecedent stays unparsed with a recorded attempt', () => {
  const r = run([unit('RU-001', 'body_prose', 'It was built by Rajaraja.')]);
  assert.strictEqual(r.typed_facts.length, 0);
  assert.strictEqual(r.unparsed_units.length, 1);
  const attempts = r.unparsed_units[0].classification_attempts || [];
  assert.ok(attempts.some((a) => a.parser === 'pronoun_resolution' && a.outcome === 'no_antecedent'));
});

check('C4 antecedents never carry across units', () => {
  const r = run([
    unit('RU-001', 'body_prose', 'The temple is located in Thanjavur.'),
    unit('RU-002', 'body_prose', 'It was built by Rajaraja.')
  ]);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.strictEqual(r.typed_facts[0].relation, 'location');
});

check('C5 figure reference in a subject is cleaned, not bound', () => {
  const r = run([unit('RU-001', 'body_prose', BUILDER)]);
  const f = factByMethod(r, 'passive_built_by');
  assert.ok(f);
  assert.ok(f.subject.indexOf('Fig.') === -1);
  assert.ok(f.derivation.figure_refs_removed.length === 1);
});

check('C6 figure-only subject yields no fact', () => {
  const r = run([unit('RU-001', 'body_prose', '(Fig. 3.20) was built by Rajaraja Chola I.')]);
  assert.strictEqual(r.typed_facts.length, 0);
});

// Phase 2D supersedes this measurement (see test_phase2d.js): the
// "renowned for" sentence Phase 2C left as resolved-but-unpatterned
// now types via the Phase 2D renowned_for pattern under the same
// bounded pronoun resolution. The Phase 2C outcome is preserved in
// the Phase 2C report and in the Phase 2D typed-fact comparison.
check('C7 Nandi passage: builder fact + renowned_for fact via resolved pronoun (Phase 2D supersession)', () => {
  const r = run([unit('RU-050', 'body_prose', BUILDER + ' ' + NANDI)]);
  assert.ok(r.typed_facts.some((f) => f.relation === 'built_by' && f.object === 'Rājarāja Chola I'));
  const ren = r.typed_facts.find((f) => f.relation === 'renowned_for');
  assert.ok(ren, 'renowned_for fact present');
  assert.ok(ren.subject.indexOf('Bṛihadīśhvara Temple') !== -1);
  assert.ok(ren.object.indexOf('vast maṇḍapas') !== -1);
  assert.ok(ren.object.indexOf('massive Nandi') !== -1);
  assert.strictEqual(ren.evidence, NANDI);
  assert.ok(ren.derivation && ren.derivation.pronoun_resolution, 'resolution derivation preserved');
  assert.strictEqual(ren.derivation.pronoun_resolution.original_subject, 'It');
  assert.ok(!r.unparsed_units.some((u) => u.original_text.indexOf('It is renowned') === 0),
    'renowned sentence is rescued from unparsed');
});

// ---- D. Explicit caption-claim typing ----

check('D1 Fig 3.52 caption types date (layer) + facade features claim (supplementary)', () => {
  const r = run([unit('RU-117', 'caption', FIG352, { figure_ref: 'fig 3.52' })]);
  const date = r.typed_facts.find((f) => f.fact_type === 'date');
  assert.ok(date, 'date fact present');
  assert.strictEqual(date.object, '1892');
  assert.strictEqual(date.source.evidence_source, 'caption');
  const feat = factByMethod(r, 'caption_explicit_claim_features');
  assert.ok(feat, 'features fact present');
  assert.strictEqual(feat.subject, 'The red sandstone facade');
  assert.strictEqual(feat.object, 'Islamic arches and intricate screens alongside carvings and pillars in Hindu temple style');
  assert.strictEqual(feat.source.evidence_source, 'caption');
  assert.strictEqual(feat.source.figure_ref, 'fig 3.52');
  assert.strictEqual(feat.evidence, 'The red sandstone facade features Islamic arches and intricate screens alongside carvings and pillars in Hindu temple style.');
});

check('D2 Fig 3.53 pronoun stays unresolved with zero binding facts', () => {
  const r = run([unit('RU-118', 'caption', FIG353, { figure_ref: 'fig 3.53' })]);
  assert.strictEqual(r.typed_facts.length, 0);
});

check('D3 Fig 3.29 caption acquires no Jama Masjid binding', () => {
  const r = run([
    unit('RU-001', 'caption', 'Fig. 3.29. A sketch of the mosque.', { figure_ref: 'fig 3.29' }),
    unit('RU-002', 'body_prose', 'The Jama Masjid in Ahmedabad was launched by Sultan Ahmed Shah I.')
  ]);
  assert.strictEqual(r.typed_facts.filter((f) => f.source.evidence_source === 'caption').length, 0);
});

check('D4 caption features require a figure reference', () => {
  const r = run([unit('RU-001', 'caption', 'The red sandstone facade features Islamic arches.')]);
  assert.strictEqual(r.typed_facts.length, 0);
});

check('D5 caption pronoun subject yields no features fact', () => {
  const r = run([unit('RU-001', 'caption', 'It features Islamic arches.', { figure_ref: 'fig 3.52' })]);
  assert.strictEqual(r.typed_facts.length, 0);
});

// ---- E. Cross-page duplicate suppression ----

check('E1 exact cross-page duplicate collapses to the per-page fact', () => {
  const passage = unit('RU-030', 'body_prose',
    'Ellora’s cave no. 10 (Fig. 3.12) is of enormous proportions; leaning against a stupa is a massive statue of a seated Buddha in a teaching pose.');
  const merged = unit('RU-124', 'cross_page_continuation',
    'complexes. Those at Ajanta and Ellora are renowned for their massive scale. Ellora’s cave no. 10 (Fig. 3.12) is of enormous proportions; leaning against a stupa is a massive statue of a seated Buddha in a teaching pose.',
    { pages: [10, 11], block_ids: ['p10-b13', 'p11-b1'] });
  const r = run([passage, merged]);
  assert.strictEqual(r.accounting.typed_facts_raw_total, 2);
  assert.strictEqual(r.accounting.typed_facts_total, 1);
  assert.strictEqual(r.typed_facts[0].source.reconstructed_unit_id, 'RU-030');
  assert.strictEqual(r.typed_facts[0].source.evidence_source, 'reconstructed_prose');
  assert.strictEqual(r.deduplication.duplicates_discarded.length, 1);
  assert.strictEqual(r.deduplication.duplicates_discarded[0].discarded_unit_id, 'RU-124');
  assert.strictEqual(r.deduplication.duplicates_discarded[0].kept_unit_id, 'RU-030');
});

check('E2 normalized duplicate (article variation) collapses', () => {
  const r = run([
    unit('RU-001', 'body_prose', 'The temple is located in Thanjavur.'),
    unit('RU-002', 'body_prose', 'Temple is located in Thanjavur.')
  ]);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.strictEqual(r.deduplication.duplicates_discarded.length, 1);
  assert.strictEqual(r.deduplication.duplicates_discarded[0].discarded_unit_id, 'RU-002');
});

check('E3 genuinely split cross-page sentence keeps its merged fact', () => {
  const r = run([
    unit('RU-001', 'body_prose', 'The temple is located'),
    unit('RU-002', 'cross_page_continuation', 'The temple is located in Thanjavur.',
      { pages: [10, 11], block_ids: ['b1', 'b2'] })
  ]);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.strictEqual(r.typed_facts[0].source.evidence_source, 'cross_page_merged');
  assert.strictEqual(r.deduplication.duplicates_discarded.length, 0);
});

check('E4 same subject with different relations stays separate', () => {
  const r = run([unit('RU-001', 'body_prose', 'The temple is located in Thanjavur. The temple was built by Rajaraja.')]);
  assert.ok(r.typed_facts.some((f) => f.relation === 'location'));
  assert.ok(r.typed_facts.some((f) => f.relation === 'launched_by'));
  assert.strictEqual(r.typed_facts.length, 2);
});

check('E5 dedup key includes qualifiers: same claim, different dates stay separate', () => {
  const keyA = Engine.phase2cFactKey({
    fact_type: 'date', subject: 'X', relation: 'completion_year', object: '1892',
    qualifiers: { polarity: 'positive', temporal_scope: null }
  });
  const keyB = Engine.phase2cFactKey({
    fact_type: 'date', subject: 'X', relation: 'completion_year', object: '1892',
    qualifiers: { polarity: 'positive', temporal_scope: 'around 1010' }
  });
  assert.notStrictEqual(keyA, keyB);
});

// ---- F. Invariance, determinism, production safety ----

check('F1 supplementary gain is adapter-only: shared parsers yield nothing on wells S2', () => {
  assert.deepStrictEqual(Engine.parseFactRelations(WELLS_S2, {}), []);
  const layer = Engine.buildTypedKnowledge([{ id: 's', title: 'T', text: WELLS_S2, page: 14 }]);
  assert.strictEqual(layer.typed_facts.length, 0);
  const adapted = run([unit('RU-039', 'body_prose', WELLS_S2)]);
  assert.strictEqual(adapted.typed_facts.length, 1);
  assert.strictEqual(adapted.typed_facts[0].relation, 'developed_in');
});

check('F2 shared definition parser is NOT broadened to Term: form', () => {
  const layer = Engine.buildTypedKnowledge([{
    id: 's', title: 'T',
    text: 'Latticework: Open framework with criss-crossing or decorative designs.', page: 26
  }]);
  assert.strictEqual(layer.typed_facts.length, 0);
});

check('F3 baseline options reproduce Phase 2B adapter behaviour exactly', () => {
  const r = run([unit('RU-039', 'body_prose', WELLS_TEXT)], { supplementary: false, deduplicate: false });
  assert.strictEqual(r.typed_facts.length, 0);
  assert.strictEqual(r.unparsed_units.length, 6);
  assert.ok(r.unparsed_units.every((u) => u.reason === 'unsupported_pattern'));
});

check('F4 adapter runs are deterministic', () => {
  const units = [
    unit('RU-039', 'body_prose', WELLS_TEXT),
    unit('RU-077', 'glossary_definition', GLOSS_TEXT, { term: 'Latticework', definition: GLOSS_DEF }),
    unit('RU-117', 'caption', FIG352, { figure_ref: 'fig 3.52' })
  ];
  const a = run(units);
  const b = run(units);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

check('F5 production builders do not reference reconstruction', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine/generator.js'), 'utf8');
  function bodyOf(name) {
    const start = src.indexOf('function ' + name);
    assert.ok(start !== -1, name + ' found');
    const end = src.indexOf('\n  function ', start + 10);
    return src.slice(start, end === -1 ? undefined : end);
  }
  assert.ok(bodyOf('buildQuestionCandidates').indexOf('reconstruct') === -1);
  assert.ok(bodyOf('validateQuestion').indexOf('reconstruct') === -1);
});

check('F6 production banks byte-identical across this run', () => {
  function sha(rel) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, rel))).digest('hex');
  }
  assert.strictEqual(
    sha('../data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md'),
    '94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4');
  assert.strictEqual(
    sha('../data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md'),
    'b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87');
});

// G-series: fixes found by auditing the full-PDF diagnostic output.
check('G1 passive by-form splits a trailing century into temporal scope', () => {
  const drafts = Engine.passiveDraftsForSegment(
    'The Jama Masjid in Ahmedabad (Gujarat) was built by Sultan Ahmed Shah I in the 15 th century.');
  assert.strictEqual(drafts.length, 1);
  assert.strictEqual(drafts[0].draft.object, 'Sultan Ahmed Shah I');
  assert.strictEqual(drafts[0].draft.temporal_scope, 'in the 15th century');
  const drafts2 = Engine.passiveDraftsForSegment(
    'The mosque was built by Sultan Ahmed Shah I in the 15th century.');
  assert.strictEqual(drafts2.length, 1);
  assert.strictEqual(drafts2[0].draft.object, 'Sultan Ahmed Shah I');
  assert.strictEqual(drafts2[0].draft.temporal_scope, 'in the 15th century');
});

check('G2 layer agent claim is not relabelled when century is split', () => {
  const units = [unit('RU-066', 'body_prose',
    'The Jama Masjid in Ahmedabad (Gujarat) was built by Sultan Ahmed Shah I in the 15th century.')];
  const result = run(units);
  // The layer types launched_by; the supplementary built_by for the same
  // agent object must be skipped, not kept as a second fact.
  assert.strictEqual(result.typed_facts.length, 1);
  assert.strictEqual(result.typed_facts[0].relation, 'launched_by');
  assert.strictEqual(result.typed_facts[0].object, 'Sultan Ahmed Shah I');
});

check('G3 truncated object with unbalanced parenthesis is rejected', () => {
  const units = [unit('RU-091', 'body_prose',
    'The Mysuru Palace, also known as Amba Vilas Palace (Fig. 3.40), is a magnificent example of Indo-Saracenic architecture (see further below the section under that name).')];
  const result = run(units);
  assert.strictEqual(result.typed_facts.length, 0);
  assert.strictEqual(result.unparsed_units.length, 1);
  assert.ok(result.unparsed_units[0].original_text.indexOf('Mysuru Palace') !== -1);
});

check('G4 balanced-parenthesis objects still pass the supplementary guard', () => {
  const units = [unit('RU-077', 'glossary_definition',
    'Latticework: Open framework with criss-crossing or decorative designs. Here, it is both functional (allowing ventilation) and aesthetic in design.',
    { term: 'Latticework', definition: 'Open framework with criss-crossing or decorative designs. Here, it is both functional (allowing ventilation) and aesthetic in design.' })];
  const result = run(units);
  assert.strictEqual(result.typed_facts.length, 2);
  assert.ok(result.typed_facts[1].object.indexOf('(allowing ventilation)') !== -1);
});

check('F7 Phase 2C helpers are exported and baseline options exist', () => {
  assert.strictEqual(typeof Engine.resolveLocalPronounAntecedent, 'function');
  assert.strictEqual(typeof Engine.phase2cFactKey, 'function');
  assert.strictEqual(typeof Engine.passiveDraftsForSegment, 'function');
  assert.strictEqual(typeof Engine.captionFeatureDrafts, 'function');
  assert.strictEqual(typeof Engine.glossaryDraftsForUnit, 'function');
});

console.log('Phase 2C tests passed: ' + passed + ' checks.');
