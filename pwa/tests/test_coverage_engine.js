/**
 * StudySynth — Coverage Engine tests (Delivery Pivot).
 *
 * Self-contained: all fixtures are inline. No test here reads a PDF, uses
 * the local NCERT folder, or depends on a machine-specific path. Production
 * bank preservation is asserted via repo-relative paths only.
 *
 * Run: node tests/test_coverage_engine.js  (also wired into `npm test`).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Builder = require('../engine/coverageBuilder.js');

let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log('✓ ' + name);
}

function typedFact(overrides) {
  const base = {
    fact_id: 'TF-REC-001-001',
    fact_type: 'definition',
    subject: 'Latticework',
    relation: 'definition',
    object: 'an open framework with criss-crossing or decorative designs',
    normalized_subject: 'latticework',
    normalized_relation: 'definition',
    normalized_object: 'an open framework with criss-crossing or decorative designs',
    evidence: 'Latticework is an open framework with criss-crossing or decorative designs.',
    evidence_span: { start: 0, end: 76 },
    source: {
      document_id: 'hees203', page: 26, section_id: 'docsec_001',
      section_title: 'Traditional Houses', block_ids: ['p26-b1', 'p26-b2'],
      sentence_id: 'KU-LITE-001', reconstructed_unit_id: 'RU-001',
      reconstructed_unit_type: 'glossary_definition', page_range: [26],
      evidence_source: 'glossary', figure_ref: null,
    },
    qualifiers: {
      polarity: 'positive', precision: 'exact', numeric_kind: null,
      relation_verb: null, causal_direction: null, attribute: null,
      temporal_scope: null, comparison: null, members: null, sequence_items: null,
    },
    classification: { method: 'definition_explicit', rule_id: 'phase2a-typed-v1' },
    validation_state: 'verified',
    derivation: null,
  };
  return Object.assign({}, base, overrides || {});
}

function entityFact(id, subject, relation, object, evidence, sectionTitle) {
  return typedFact({
    fact_id: id,
    fact_type: 'entity_attribute',
    subject: subject,
    relation: relation,
    object: object,
    normalized_subject: subject.toLowerCase().replace(/^(the|a|an)\s+/, ''),
    normalized_relation: relation,
    normalized_object: object.toLowerCase(),
    evidence: evidence,
    evidence_span: { start: 0, end: evidence.length },
    source: {
      document_id: 'hees203', page: 14, section_id: 'docsec_002',
      section_title: sectionTitle || 'Water Structures', block_ids: ['p14-b1'],
      sentence_id: 'KU-LITE-' + id, reconstructed_unit_id: 'RU-039',
      reconstructed_unit_type: 'body_prose', page_range: [14],
      evidence_source: 'reconstructed_prose', figure_ref: null,
    },
  });
}

// 1. Adapter mapping: production shape, verbatim evidence, namespaced ids.
check('adapter hoists typed fields into the production shape', () => {
  const a = Builder.adaptTypedFact(typedFact(), 'hees203');
  assert.strictEqual(a.fact_id, 'ADP-hees203-TF-REC-001-001');
  assert.strictEqual(a.section_id, 'docsec_001');
  assert.strictEqual(a.section_title, 'Traditional Houses');
  assert.strictEqual(a.source_page, 26);
  assert.strictEqual(a.source_text, typedFact().evidence);
  assert.strictEqual(a.supporting_excerpt, typedFact().evidence);
  assert.strictEqual(a.confidence_class, 'verified');
  assert.strictEqual(a._adapter.unit_id, 'RU-001');
  assert.deepStrictEqual(a._adapter.block_ids, ['p26-b1', 'p26-b2']);
  assert.deepStrictEqual(a._adapter.page_range, [26]);
});

// 2. Stem baking: temporal, attribution, clean section title, dirty titles.
check('bakeStem appends temporal scope once', () => {
  const a = Builder.adaptTypedFact(typedFact(), 'hees203');
  a.temporal_scope = 'around 1010';
  a.section_title = '';
  assert.strictEqual(
    Builder.bakeStem('Who built the temple?', a),
    'Who built the temple, around 1010?');
  assert.strictEqual(
    Builder.bakeStem('Who built the temple, around 1010?', a),
    'Who built the temple, around 1010?');
});

check('bakeStem prefixes source attribution without breaking the stem rule', () => {
  const a = Builder.adaptTypedFact(typedFact(), 'hees203');
  a.attribution = 'According to tradition';
  a.section_title = '';
  assert.strictEqual(
    Builder.bakeStem('Where were the first churches built?', a),
    'According to tradition, where were the first churches built?');
});

check('bakeStem uses clean section titles and rejects dirty ones', () => {
  assert.strictEqual(Builder.isCleanSectionTitle('Water Structures'), true);
  assert.strictEqual(Builder.isCleanSectionTitle('Classical Temple Architecture'), true);
  assert.strictEqual(Builder.isCleanSectionTitle('10 th century onward, in different'), false);
  assert.strictEqual(Builder.isCleanSectionTitle('The Beginnings …'), false);
  assert.strictEqual(Builder.isCleanSectionTitle('Architecture'), false);
  const a = Builder.adaptTypedFact(typedFact(), 'hees203');
  a.section_title = 'Water Structures';
  assert.strictEqual(
    Builder.bakeStem('Which of the following correctly describes the stepwell?', a),
    'In Water Structures, which of the following correctly describes the stepwell?');
  const b = Builder.adaptTypedFact(typedFact(), 'hees203');
  b.section_title = '10 th century onward, in different';
  assert.strictEqual(
    Builder.bakeStem('Which of the following correctly describes the stepwell?', b),
    'Which of the following correctly describes the stepwell?');
});

// 3. Key rotation preserves the answer and reassigns keys.
check('rotateOptions rotates keys and preserves the correct answer text', () => {
  const opts = [
    { key: 'A', text: 'alpha', is_correct: true },
    { key: 'B', text: 'beta', is_correct: false },
    { key: 'C', text: 'gamma', is_correct: false },
    { key: 'D', text: 'delta', is_correct: false },
  ];
  const r0 = Builder.rotateOptions(opts, 0);
  assert.strictEqual(r0.answer_key, 'A');
  assert.strictEqual(r0.options[0].text, 'alpha');
  const r1 = Builder.rotateOptions(opts, 1);
  assert.strictEqual(r1.answer_key, 'D');
  assert.strictEqual(r1.options[3].text, 'alpha');
  assert.deepStrictEqual(r1.options.map((o) => o.key), ['A', 'B', 'C', 'D']);
  assert.strictEqual(r1.options.filter((o) => o.is_correct).length, 1);
});

// 4. Stem-collision resolution.
check('resolveStemCollisions keeps same-answer duplicates once and rejects ambiguous stems', () => {
  const mk = (stem, answer) => ({ candidate: { stem: stem, expected_answer: answer }, fact: {} });
  const same = Builder.resolveStemCollisions([mk('What is X?', 'red'), mk('What is X?', 'red')]);
  assert.strictEqual(same.kept.length, 1);
  assert.strictEqual(same.duplicates_removed, 1);
  assert.strictEqual(same.stem_collisions_rejected, 0);
  const amb = Builder.resolveStemCollisions([mk('What is X?', 'red'), mk('What is X?', 'blue')]);
  assert.strictEqual(amb.kept.length, 0);
  assert.strictEqual(amb.stem_collisions_rejected, 2);
  const diff = Builder.resolveStemCollisions([mk('What is X?', 'red'), mk('What is Y?', 'blue')]);
  assert.strictEqual(diff.kept.length, 2);
});

// 5. End-to-end builder on synthetic facts: evidence, uniqueness, keys.
check('buildCandidateBank produces validated, evidence-attached, key-balanced questions', () => {
  const facts = [
    typedFact(),
    entityFact('TF-REC-039-001', 'The stepwell at Rani ki Vav', 'has',
      'multiple pillared levels',
      'The stepwell at Rani ki Vav has multiple pillared levels.'),
    entityFact('TF-REC-039-002', 'The stepwell at Rani ki Vav', 'has',
      'hundreds of magnificent statues',
      'The stepwell at Rani ki Vav has hundreds of magnificent statues.'),
    entityFact('TF-REC-050-001', 'The Brihadisvara Temple', 'built_by',
      'Rajaraja Chola I',
      'The Brihadisvara Temple was built by Rajaraja Chola I.'),
    typedFact({
      fact_id: 'TF-REC-117-001', fact_type: 'date', subject: 'The Madras High Court',
      relation: 'completion_year', object: '1892',
      normalized_subject: 'madras high court', normalized_relation: 'completion_year',
      normalized_object: '1892',
      evidence: 'The Madras High Court was completed in 1892.',
      source: {
        document_id: 'hees203', page: 38, section_id: 'docsec_009',
        section_title: 'Colonial Architecture', block_ids: ['p38-b1'],
        sentence_id: 'KU-LITE-117', reconstructed_unit_id: 'RU-117',
        reconstructed_unit_type: 'caption', page_range: [38],
        evidence_source: 'caption', figure_ref: 'Fig. 3.52',
      },
    }),
  ];
  const bank = Builder.buildCandidateBank({
    chapterCode: 'hees203', chapterNum: 3, title: 'Test Chapter', pdfFile: 'hees203.pdf',
    pagesProcessed: '40/40', typedFacts: facts,
  });
  assert.ok(bank.questions.length >= 2, 'expected at least 2 questions, got ' + bank.questions.length);
  const keys = new Set();
  for (const q of bank.questions) {
    assert.ok(q.stem && q.stem.length > 10, 'stem present');
    assert.ok(!/according to the (passage|source|text)/i.test(q.stem), 'no passage scaffolding in stem');
    assert.strictEqual(q.options.length, 4, 'exactly 4 options');
    assert.strictEqual(q.options.filter((o) => o.is_correct).length, 1, 'exactly 1 correct option');
    assert.strictEqual(new Set(q.options.map((o) => o.text.toLowerCase())).size, 4, 'options unique');
    assert.strictEqual(q.options.find((o) => o.key === q.answer_key).is_correct, true, 'key points at correct option');
    assert.strictEqual(q.expected_answer, q.options.find((o) => o.key === q.answer_key).text, 'expected answer matches keyed text');
    assert.ok(q.supporting_excerpt && q.supporting_excerpt.length > 0, 'evidence attached');
    assert.ok(q.traceability && q.traceability.fact_id, 'traceability attached');
    assert.ok(q.traceability.block_ids.length > 0, 'block provenance attached');
    keys.add(q.answer_key);
  }
  assert.ok(keys.size > 1, 'answer keys are not all identical (rotation works)');
  // No two questions share a stem with different answers.
  const stemAnswers = new Map();
  for (const q of bank.questions) {
    const s = q.stem.toLowerCase().replace(/\s+/g, ' ').trim();
    if (stemAnswers.has(s)) {
      assert.strictEqual(stemAnswers.get(s), q.expected_answer.toLowerCase(), 'no ambiguous stem survives');
    } else {
      stemAnswers.set(s, q.expected_answer.toLowerCase());
    }
  }
  // Every adapted fact ends in exactly one disposition.
  assert.strictEqual(bank.traceability.fact_dispositions.length, facts.length);
  const dispIds = bank.traceability.fact_dispositions.map((d) => d.fact_id);
  assert.strictEqual(new Set(dispIds).size, dispIds.length, 'dispositions unique per fact');
});

// 6. Determinism: identical output across repeated builds.
check('buildCandidateBank is deterministic across repeated runs', () => {
  const facts = [typedFact(), entityFact('TF-REC-039-001', 'The stepwell at Rani ki Vav', 'has',
    'multiple pillared levels', 'The stepwell at Rani ki Vav has multiple pillared levels.')];
  const input = {
    chapterCode: 'hees203', chapterNum: 3, title: 'Test Chapter', pdfFile: 'hees203.pdf',
    pagesProcessed: '40/40', typedFacts: facts,
  };
  const a = Builder.buildCandidateBank(input);
  const b = Builder.buildCandidateBank(input);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

// 7. Coverage linking: block match, page-content match, excluded, incomplete.
check('linkInventory reconciles to the denominator with explicit methods', () => {
  const entries = [
    { id: 'INV-T-001', importance: 'Core', section: 'S', pdf_page: 14, book_page: 98,
      quote: 'The stepwell at Rani ki Vav has multiple pillared levels.',
      description: 'Rani ki Vav stepwell attributes.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
    { id: 'INV-T-002', importance: 'Core', section: 'S', pdf_page: 14, book_page: 98,
      quote: 'Stepwells offered a social space where people could sit together.',
      description: 'Social function of stepwells.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
    { id: 'INV-T-003', importance: 'Minor-reference', section: 'S', pdf_page: 1, book_page: 85,
      quote: 'Epigraph text.', description: 'Epigraph.', question_suitable: 'no',
      question_suitability_reason: 'Epigraph, not examinable.', visual_dependency: 'none' },
    { id: 'INV-T-004', importance: 'Core', section: 'S', pdf_page: 30, book_page: 114,
      quote: 'A completely unrecorded temple feature with zqxwv words.',
      description: 'Unrecorded feature.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
  ];
  const rows2a = [
    { inventory_id: 'INV-T-001', block_match: { block_id: 'hees203:p14-b1' } },
  ];
  const questions = [{ id: 'Q-CAND-3-001' }, { id: 'Q-CAND-3-002' }];
  const questionFacts = {
    'Q-CAND-3-001': {
      subject: 'The stepwell at Rani ki Vav', supporting_excerpt: 'The stepwell at Rani ki Vav has multiple pillared levels.',
      _adapter: { block_ids: ['p14-b1'], page_range: [14] },
    },
    'Q-CAND-3-002': {
      subject: 'Stepwells', supporting_excerpt: 'Stepwells offered a social space where people could sit together and exchange news.',
      _adapter: { block_ids: ['p14-b9'], page_range: [14] },
    },
  };
  const linked = Builder.linkInventory(entries, rows2a, questions, questionFacts);
  assert.strictEqual(linked.summary.total, 4);
  assert.strictEqual(linked.summary.denominator, 3);
  assert.strictEqual(linked.summary.covered, 2);
  assert.strictEqual(linked.summary.excluded, 1);
  assert.strictEqual(linked.summary.covered + linked.summary.evidence_exists_unconverted +
    linked.summary.extraction_incomplete,
    linked.summary.denominator);
  assert.strictEqual(linked.summary.denominator + linked.summary.requires_human_review +
    linked.summary.excluded, linked.summary.total);
  const byId = {};
  for (const r of linked.rows) byId[r.inventory_id] = r;
  assert.strictEqual(byId['INV-T-001'].coverage_status, 'covered');
  assert.strictEqual(byId['INV-T-001'].link_method, 'block_match');
  assert.strictEqual(byId['INV-T-002'].coverage_status, 'covered');
  assert.strictEqual(byId['INV-T-003'].coverage_status, 'excluded');
  assert.strictEqual(byId['INV-T-004'].coverage_status, 'extraction_incomplete');
});

// 9. Coverage-engine entity stems: every typed relation added in
// generator.js produces a validated question with a relation-faithful stem.
check('new entity-relation stems produce validated questions', () => {
  const facts = [
    entityFact('TF-REC-050-001', 'The Brihadisvara Temple', 'built_by',
      'Rajaraja Chola I', 'The Brihadisvara Temple was built by Rajaraja Chola I.'),
    entityFact('TF-REC-050-002', 'The Brihadisvara Temple', 'renowned_for',
      'its vast halls', 'The Brihadisvara Temple is renowned for its vast halls.'),
    entityFact('TF-REC-039-004', 'stepwells', 'offered',
      'a cool social space', 'Stepwells offered a cool social space.'),
    entityFact('TF-REC-039-005', 'Temples', 'had',
      'water reservoirs', 'Temples often had water reservoirs attached to them.'),
    entityFact('TF-REC-039-006', 'water reservoirs', 'used_for',
      'water harvesting and rituals', 'Water reservoirs were used for water harvesting and rituals.'),
    entityFact('TF-REC-039-001', 'a tradition of stepwells', 'developed_in',
      'Gujarat and Rajasthan', 'A tradition of stepwells developed in Gujarat and Rajasthan.'),
    entityFact('TF-REC-015-002', 'Harappan architecture', 'characterised_by',
      'carefully laid-out cities', 'Harappan architecture is characterised by carefully laid-out cities.'),
    entityFact('TF-REC-076-002', 'Latticework', 'attribute',
      'a functional and aesthetic design', 'Latticework has a functional and aesthetic design.'),
    entityFact('TF-REC-116-002', 'The red sandstone facade', 'features',
      'Islamic arches', 'The red sandstone facade features Islamic arches.'),
    entityFact('TF-REC-110-001', 'the first churches', 'built_in',
      'the coastal areas of Kerala', 'The first churches were built in the coastal areas of Kerala.'),
    entityFact('TF-REC-064-001', 'the bronze Nandi statue', 'made_by',
      'a Chola craftsman', 'The bronze Nandi statue was made by a Chola craftsman.'),
    entityFact('TF-REC-039-002', 'The stepwell at Rani ki Vav', 'has',
      'multiple pillared levels', 'The stepwell at Rani ki Vav has multiple pillared levels.'),
  ];
  const bank = Builder.buildCandidateBank({
    chapterCode: 'hees203', chapterNum: 3, title: 'Test Chapter', pdfFile: 'hees203.pdf',
    pagesProcessed: '40/40', typedFacts: facts,
  });
  const byFact = {};
  for (const q of bank.questions) byFact[q.traceability.fact_id] = q;
  const stems = {
    'TF-REC-050-001': 'who built',
    'TF-REC-050-002': 'renowned for',
    'TF-REC-039-004': 'what did stepwells offer',
    'TF-REC-039-005': 'what did temples have',
    'TF-REC-039-006': 'what purpose did',
    'TF-REC-039-001': 'where did a tradition of stepwells develop',
    'TF-REC-015-002': 'characterises',
    'TF-REC-076-002': 'correctly describes',
    'TF-REC-116-002': 'what does the red sandstone facade feature',
    'TF-REC-110-001': 'where did the building of the first churches take place',
    'TF-REC-064-001': 'who made',
    'TF-REC-039-002': 'what does the stepwell at Rani ki Vav have',
  };
  for (const [fid, phrase] of Object.entries(stems)) {
    assert.ok(byFact[fid], 'expected a question for ' + fid);
    assert.ok(byFact[fid].stem.toLowerCase().includes(phrase.toLowerCase()),
      'stem for ' + fid + ' should include "' + phrase + '", got: ' + byFact[fid].stem);
  }
});

// 10. Bare caption artefacts cannot anchor a question.
check('bare-artifact subjects are prefiltered as weak subjects', () => {
  const facts = [
    entityFact('TF-REC-064-002', 'A sketch', 'made_by',
      'a British army officer', 'A sketch made in 1809 by a British army officer shows the minarets.'),
    entityFact('TF-REC-039-002', 'The stepwell at Rani ki Vav', 'has',
      'multiple pillared levels', 'The stepwell at Rani ki Vav has multiple pillared levels.'),
    entityFact('TF-REC-050-001', 'The Brihadisvara Temple', 'built_by',
      'Rajaraja Chola I', 'The Brihadisvara Temple was built by Rajaraja Chola I.'),
    typedFact(),
  ];
  const bank = Builder.buildCandidateBank({
    chapterCode: 'hees203', chapterNum: 3, title: 'Test Chapter', pdfFile: 'hees203.pdf',
    pagesProcessed: '40/40', typedFacts: facts,
  });
  const disp = {};
  for (const d of bank.traceability.fact_dispositions) disp[d.fact_id] = d;
  assert.strictEqual(disp['TF-REC-064-002'].reason, 'weak_subject');
  assert.ok(!bank.questions.some((q) => q.traceability.fact_id === 'TF-REC-064-002'),
    'no question may be built from the bare-artifact fact');
});

// 11. Evidence-span coverage link: literal containment, same page only.
check('linkInventory evidence_span_match links literal spans, not fuzzy text', () => {
  const entries = [
    { id: 'INV-T-010', importance: 'Core', section: 'S', pdf_page: 14, book_page: 98,
      quote: 'In the chapter text it is recorded that the stepwell at Rani ki Vav has multiple pillared levels and hundreds of statues, as described here.',
      description: 'Rani ki Vav attributes.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
    { id: 'INV-T-011', importance: 'Core', section: 'S', pdf_page: 30, book_page: 114,
      quote: 'In the chapter text it is recorded that the stepwell at Rani ki Vav has multiple pillared levels and hundreds of statues, as described here.',
      description: 'Same quote, different page.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
  ];
  const questions = [{ id: 'Q-CAND-3-001' }];
  const questionFacts = {
    'Q-CAND-3-001': {
      subject: 'The stepwell at Rani ki Vav',
      supporting_excerpt: 'The stepwell at Rani ki Vav has multiple pillared levels.',
      _adapter: { block_ids: ['p14-b7'], page_range: [14] },
    },
  };
  const linked = Builder.linkInventory(entries, [], questions, questionFacts);
  const byId = {};
  for (const r of linked.rows) byId[r.inventory_id] = r;
  assert.strictEqual(byId['INV-T-010'].coverage_status, 'covered');
  assert.strictEqual(byId['INV-T-010'].link_method, 'evidence_span_match');
  assert.strictEqual(byId['INV-T-011'].coverage_status, 'extraction_incomplete',
    'same quote on a different page must not link');
});

// 12. Existing entity stems unchanged (role).
check('existing role stem is unchanged', () => {
  const facts = [
    entityFact('TF-REC-090-001', 'temple priests', 'role',
      'ritual duties', 'Temple priests performed ritual duties.'),
    entityFact('TF-REC-039-002', 'The stepwell at Rani ki Vav', 'has',
      'multiple pillared levels', 'The stepwell at Rani ki Vav has multiple pillared levels.'),
    entityFact('TF-REC-050-001', 'The Brihadisvara Temple', 'built_by',
      'Rajaraja Chola I', 'The Brihadisvara Temple was built by Rajaraja Chola I.'),
    typedFact(),
  ];
  const bank = Builder.buildCandidateBank({
    chapterCode: 'hees203', chapterNum: 3, title: 'Test Chapter', pdfFile: 'hees203.pdf',
    pagesProcessed: '40/40', typedFacts: facts,
  });
  const q = bank.questions.find((x) => x.traceability.fact_id === 'TF-REC-090-001');
  assert.ok(q, 'expected a role question');
  assert.ok(q.stem.toLowerCase().includes('what role is associated with'),
    'role stem unchanged, got: ' + q.stem);
});

// 13. Section-title guards: fused and clause headings lose the prefix
// (never the question), while genuine Title-Case and sentence-case
// topic titles are kept.
check('isCleanSectionTitle rejects fused and clause headings', () => {
  assert.strictEqual(Builder.isCleanSectionTitle('Shift to secondary and Attracts people'), false,
    'fused heading with capital after lowercase content word');
  assert.strictEqual(Builder.isCleanSectionTitle('Guru Nanak journeyed across regions, spreading the message'), false,
    'clause heading, too long and verb-led');
  assert.strictEqual(Builder.isCleanSectionTitle('The Complexity of Mapping the Earth'), true);
  assert.strictEqual(Builder.isCleanSectionTitle('Fundamental Rights in the Indian Constitution'), true);
  assert.strictEqual(Builder.isCleanSectionTitle('Birth and fertility rates'), true);
  assert.strictEqual(Builder.isCleanSectionTitle('Water Structures'), true);
});

// 14. Builder filters: chart dumps, bare-generic and discourse subjects,
// and mangled objects never become questions (or distractors).
check('prefilter removes chart dumps, generic subjects and mangled objects', () => {
  const facts = [
    typedFact({
      fact_id: 'TF-REC-900-001', fact_type: 'numeric', subject: 'Fertility rate',
      relation: 'numeric_value', object: '2000 2001 2002 2003 2023 Year',
      normalized_subject: 'fertility rate', normalized_relation: 'numeric_value',
      normalized_object: '2000 2001 2002 2003 2023 year',
      evidence: '2000 2001 2002 2003 2023 Year fertility chart.',
      source: { document_id: 'hees206', page: 7, section_id: 'docsec_001',
        section_title: 'Birth and fertility rates', block_ids: ['p7-b1'],
        sentence_id: 'KU-LITE-900', reconstructed_unit_id: 'RU-900',
        reconstructed_unit_type: 'body_prose', page_range: [7],
        evidence_source: 'reconstructed_prose', figure_ref: null },
    }),
    entityFact('TF-REC-901-001', 'the city', 'attribute',
      'designed with wide streets', 'The city was designed with wide streets.'),
    entityFact('TF-REC-902-001', 'Given below', 'role',
      'two projections', 'Given below are two projections.'),
    entityFact('TF-REC-903-001', 'Living in a place', 'attribute',
      'you a resident, but citizenship is formal', 'Living in a place makes you a resident.'),
    entityFact('TF-REC-039-002', 'The stepwell at Rani ki Vav', 'has',
      'multiple pillared levels', 'The stepwell at Rani ki Vav has multiple pillared levels.'),
    typedFact(),
  ];
  const bank = Builder.buildCandidateBank({
    chapterCode: 'hees206', chapterNum: 6, title: 'Test Chapter', pdfFile: 'hees206.pdf',
    pagesProcessed: '24/24', typedFacts: facts,
  });
  const disp = {};
  for (const d of bank.traceability.fact_dispositions) disp[d.fact_id] = d;
  assert.strictEqual(disp['TF-REC-900-001'].reason, 'chart_label_dump');
  // Bare-generic and discourse subjects are dropped at the STEM stage,
  // not the fact stage, so their objects stay usable as distractors.
  assert.strictEqual(disp['TF-REC-901-001'].reason, 'weak_stem');
  assert.strictEqual(disp['TF-REC-902-001'].reason, 'weak_stem');
  assert.strictEqual(disp['TF-REC-903-001'].reason, 'mangled_object');
  for (const fid of ['TF-REC-900-001', 'TF-REC-901-001', 'TF-REC-902-001', 'TF-REC-903-001']) {
    assert.ok(!bank.questions.some((q) => q.traceability.fact_id === fid),
      'no question may be built from ' + fid);
  }
  // The mangled text must not leak into other questions as a distractor.
  const dump = JSON.stringify(bank.questions);
  assert.ok(dump.indexOf('you a resident') === -1, 'mangled text absent from all questions');
  // ...but the stem-dropped city fact's object DOES remain a distractor
  // for the surviving Rani ki Vav question (pool retention).
  const rani = bank.questions.find((q) => q.traceability.fact_id === 'TF-REC-039-002');
  assert.ok(rani, 'Rani ki Vav question survives');
  assert.ok(rani.options.some((o) => o.text === 'designed with wide streets'),
    'city-fact object retained as a distractor');
});

// 15. Date stems without event_base never render "undefined"; caption
// fragment subjects ("a general view of X") cannot anchor a question.
check('dateStem fallback avoids undefineded; view-of subjects prefiltered', () => {
  const dateFact = (id, subject, relation, object, evidence) => typedFact({
    fact_id: id, fact_type: 'date', subject: subject, relation: relation, object: object,
    normalized_subject: subject.toLowerCase().replace(/^(the|a|an)\s+/, ''),
    normalized_relation: relation, normalized_object: object,
    evidence: evidence, evidence_span: { start: 0, end: evidence.length },
    source: { document_id: 'hees203', page: 38, section_id: 'docsec_009',
      section_title: 'Colonial Architecture', block_ids: ['p38-b1'],
      sentence_id: 'KU-LITE-' + id, reconstructed_unit_id: 'RU-116',
      reconstructed_unit_type: 'caption', page_range: [38],
      evidence_source: 'caption', figure_ref: 'Fig. 3.52' },
  });
  const facts = [
    dateFact('TF-REC-116-001', 'The Madras High Court', 'completion_year', '1892',
      'The Madras High Court was completed in 1892.'),
    dateFact('TF-REC-116-002', 'The Jama Masjid', 'made_in', '1562',
      'The Jama Masjid was made in 1562.'),
    dateFact('TF-REC-116-003', 'A general view of the Madras High Court', 'completion_year', '1892',
      'A general view of the Madras High Court, completed in 1892.'),
    typedFact(),
  ];
  const bank = Builder.buildCandidateBank({
    chapterCode: 'hees203', chapterNum: 3, title: 'Test Chapter', pdfFile: 'hees203.pdf',
    pagesProcessed: '40/40', typedFacts: facts,
  });
  const byFact = {};
  for (const q of bank.questions) byFact[q.traceability.fact_id] = q;
  assert.ok(byFact['TF-REC-116-001'], 'completion_year question exists');
  assert.ok(byFact['TF-REC-116-001'].stem.toLowerCase().includes('in which year was the madras high court completed'),
    'completion stem, got: ' + byFact['TF-REC-116-001'].stem);
  assert.ok(byFact['TF-REC-116-002'], 'made_in question exists');
  assert.ok(byFact['TF-REC-116-002'].stem.toLowerCase().includes('in which year was the jama masjid made'),
    'made stem, got: ' + byFact['TF-REC-116-002'].stem);
  for (const q of bank.questions) {
    assert.ok(q.stem.indexOf('undefined') === -1, 'no undefined in stem: ' + q.stem);
  }
  const disp = {};
  for (const d of bank.traceability.fact_dispositions) disp[d.fact_id] = d;
  assert.strictEqual(disp['TF-REC-116-003'].reason, 'weak_subject');
  assert.ok(!byFact['TF-REC-116-003'], 'no question from the view-of fact');
});

// 16. Temporal baking supplies the missing preposition only when needed.
check('bakeStem appends temporal scope with a preposition when bare', () => {
  const base = { section_title: '', attribution: '' };
  assert.strictEqual(
    Builder.bakeStem('Where did a tradition of stepwells develop?',
      Object.assign({}, base, { temporal_scope: 'classical times' })),
    'Where did a tradition of stepwells develop, in classical times?');
  assert.strictEqual(
    Builder.bakeStem('Which of the following correctly describes temples?',
      Object.assign({}, base, { temporal_scope: 'until the 8th century' })),
    'Which of the following correctly describes temples, until the 8th century?');
});

// 17. Fact-level fallback: a same-page typed fact (no question) means
// conversion, not extraction, is the blocker.
check('linkInventory fact fallback distinguishes conversion from extraction gaps', () => {
  const entries = [
    { id: 'INV-T-020', importance: 'Core', section: 'S', pdf_page: 38, book_page: 122,
      quote: 'The red sandstone facade features Islamic arches and intricate screens.',
      description: 'Madras High Court facade.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
    { id: 'INV-T-021', importance: 'Core', section: 'S', pdf_page: 39, book_page: 123,
      quote: 'A wholly unrecorded pavilion feature with zqxwv words.',
      description: 'Unrecorded.', question_suitable: 'yes',
      question_suitability_reason: '', visual_dependency: 'none' },
    { id: 'INV-T-022', importance: 'REVIEW_REQUIRED', section: 'S', pdf_page: 40, book_page: 124,
      quote: 'Timeline pairing under review.',
      description: 'Review entry.', question_suitable: 'no',
      question_suitability_reason: 'Flagged for review.', visual_dependency: 'none' },
  ];
  const linked = Builder.linkInventory(entries, [], [], {}, [
    { subject: 'The red sandstone facade',
      supporting_excerpt: 'The red sandstone facade features Islamic arches.',
      _adapter: { block_ids: ['p38-b2'], page_range: [38] } },
  ]);
  const byId = {};
  for (const r of linked.rows) byId[r.inventory_id] = r;
  assert.strictEqual(byId['INV-T-020'].coverage_status, 'evidence_exists_unconverted');
  assert.strictEqual(byId['INV-T-021'].coverage_status, 'extraction_incomplete');
  assert.strictEqual(byId['INV-T-022'].coverage_status, 'requires_human_review',
    'REVIEW_REQUIRED stays out of both denominator and excluded');
});

// 18. Production bank preservation (repo-relative paths only).
check('candidate generation inputs leave production banks untouched', () => {
  const sha = (rel) => crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(__dirname, rel))).digest('hex');
  assert.strictEqual(
    sha('../data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md'),
    '94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4');
  assert.strictEqual(
    sha('../data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md'),
    'b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87');
  assert.strictEqual(
    sha('../data/ncert_8_2_staged/summary_manifest.json'),
    '2a17f7b1b7dba7bbf426e66e96ab26f5315ef9a3dedf7b6ea939a6facc6a3669');
});

console.log('Coverage engine tests passed: ' + checks + ' checks.');
