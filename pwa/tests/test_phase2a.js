/**
 * StudySynth Phase 2A tests — Source Fidelity, Typed Knowledge and
 * Coverage Telemetry.
 *
 * Maps to the 16 required Phase 2A tests:
 *  1. Every classified block has exactly one recorded disposition.
 *  2. Per-page and document totals reconcile.
 *  3. Page and section identity preserved separately.
 *  4. Running headers/footers never enter reconstructed sentences.
 *  5. Captions, tables, lists remain available as structured blocks.
 *  6. Source-unit IDs + evidence spans traceable and deterministic.
 *  7. Every typed fact has valid supported type, meaningful subject,
 *     valid relation, grounded object/value.
 *  8. Unclassified content appears in unparsed_units with a reason,
 *     never as a fake fact.
 *  9. A multi-claim sentence does not silently lose later claims.
 * 10. Negation, direction, units, approximators, date qualifiers
 *     survive extraction + normalization.
 * 11. No empty/vacuous propositions enter V2.
 * 12. Unparsed + visually dependent units remain visible in diagnostics.
 * 13. Reference entries trace to source blocks or get an explicit
 *     unresolved-match disposition (matcher unit tests; the full
 *     matrix completeness is asserted by the Phase 2A harness run).
 * 14. Repeated runs on identical inputs produce deterministic output
 *     (hash-compare).
 * 15. Existing engine tests continue to pass — proven by the full
 *     `npm test` run (this file is wired into that chain); the spot
 *     check here proves the production question path still loads and
 *     still builds candidates from the same fixture.
 * 16. No staged production bank, consolidated bank, or previous
 *     reference audit overwritten (hash comparison against the
 *     verified Phase 2A baseline).
 *
 * Run: node tests/test_phase2a.js (or npm test from pwa/).
 */
'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine/generator.js');
const DocumentModel = require('../engine/documentModel.js');
const Representation = require('../engine/reasoning/representation.js');
const harness = require('../../diagnostics/tools/diagnose_chapter3_phase2a.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function twoPageLayouts() {
  return [
    {
      pageNumber: 1,
      blocks: [
        { id: 'p1-b1', type: 'heading', text: 'What role has architecture', bbox: null, itemCount: 1, confidence: 1, reason: 'heading' },
        { id: 'p1-b2', type: 'body', text: 'See Fig. 3.1 for the marble inlay. The Taj Mahal is located in Agra.', bbox: null, itemCount: 1, confidence: 1, reason: 'body' },
        { id: 'p1-b3', type: 'caption', text: 'Fig. 3.1 The Taj Mahal at dawn.', bbox: null, itemCount: 1, confidence: 1, reason: 'caption' },
        { id: 'p1-b4', type: 'page_furniture', text: '85', bbox: null, itemCount: 1, confidence: 1, reason: 'furniture' }
      ],
      stats: {}
    },
    {
      pageNumber: 2,
      blocks: [
        { id: 'p2-b1', type: 'heading', text: 'What role has architecture', bbox: null, itemCount: 1, confidence: 1, reason: 'heading' },
        { id: 'p2-b2', type: 'body', text: 'See Fig. 3.1 for the marble inlay. The hall is 50 metres long.', bbox: null, itemCount: 1, confidence: 1, reason: 'body' },
        { id: 'p2-b3', type: 'table', text: 'Feature | Value ; Height | 73 metres ; Built | 1653', bbox: null, itemCount: 1, confidence: 1, reason: 'table' },
        { id: 'p2-b4', type: 'diagram', text: 'Map of the complex', bbox: null, itemCount: 1, confidence: 1, reason: 'diagram' },
        { id: 'p2-b5', type: 'fragment', text: 'north wing', bbox: null, itemCount: 1, confidence: 1, reason: 'fragment' },
        { id: 'p2-b6', type: 'ambiguous', text: '??', bbox: null, itemCount: 1, confidence: 1, reason: 'ambiguous' }
      ],
      stats: {}
    }
  ];
}

console.log('Phase 2A tests:');

// 1. Every classified block has exactly one recorded disposition.
check('1. every classified block has exactly one recorded disposition', () => {
  const doc = DocumentModel.buildStructuredDocument(twoPageLayouts(), { documentId: 'test-doc' });
  const valid = new Set(Object.values(DocumentModel.DISPOSITIONS));
  for (const block of doc.blocks) {
    assert.ok(valid.has(block.disposition), 'unknown disposition: ' + block.disposition);
    assert.ok(block.disposition_reason, 'block ' + block.block_id + ' lacks a reason');
  }
  assert.strictEqual(doc.blocks.length, 10);
  assert.ok(doc.reconciliation.ok);
});

// 2. Per-page and document totals reconcile.
check('2. per-page and document totals reconcile', () => {
  const doc = DocumentModel.buildStructuredDocument(twoPageLayouts(), { documentId: 'test-doc' });
  const pageTotal = doc.pages.reduce((sum, page) => sum + page.block_ids.length, 0);
  assert.strictEqual(pageTotal, doc.accounting.blocks_total);
  const dispositionSum = Object.values(doc.accounting.dispositions)
    .reduce((sum, n) => sum + n, 0);
  assert.strictEqual(dispositionSum, doc.accounting.blocks_total);
  assert.strictEqual(doc.accounting.pages_encountered, 2);
});

// 3. Page and section identity preserved separately.
check('3. page and section identity preserved separately', () => {
  const doc = DocumentModel.buildStructuredDocument(twoPageLayouts(), { documentId: 'test-doc' });
  // The repeated running heading on page 2 must NOT open a second section.
  assert.strictEqual(doc.sections.length, 1);
  assert.strictEqual(doc.sections[0].section_id, 'docsec_001');
  const page2Body = doc.blocks.find((b) => b.block_id === 'test-doc:p2-b2');
  assert.strictEqual(page2Body.page, 2);
  assert.strictEqual(page2Body.section_id, 'docsec_001');
  const repeated = doc.blocks.find((b) => b.block_id === 'test-doc:p2-b1');
  assert.strictEqual(repeated.disposition, DocumentModel.DISPOSITIONS.PRESERVED_REPEATED_HEADING);
});

// 4. Running headers/footers never enter reconstructed sentences.
check('4. running headers/footers never enter reconstructed sentences', () => {
  const doc = DocumentModel.buildStructuredDocument(twoPageLayouts(), { documentId: 'test-doc' });
  const furniture = doc.blocks.filter((b) => b.type === 'page_furniture');
  assert.strictEqual(furniture.length, 1);
  assert.strictEqual(furniture[0].disposition, DocumentModel.DISPOSITIONS.EXCLUDED_FURNITURE);
  assert.strictEqual(furniture[0].eligible_for_fact_extraction, false);
  // A body sentence contaminated by a merged running title is flagged
  // and, at the typed layer, becomes an unparsed unit — never a fact.
  const contaminated = DocumentModel.hasFurnitureContamination(
    'Exploring Society: India and Beyond | G rade 8 Part 2 launched in 1906.');
  assert.strictEqual(contaminated, true);
  const tk = Engine.buildTypedKnowledge(
    [{ id: 'sec_1', title: 'T', page: 1, text: 'Exploring Society: India and Beyond | G rade 8 Part 2 launched in 1906.' }],
    { sourceMeta: { type: 'textbook' }, documentId: 'test-doc' });
  assert.strictEqual(tk.typed_facts.length, 0);
  assert.strictEqual(tk.unparsed_units.length, 1);
  assert.strictEqual(tk.unparsed_units[0].reason, 'furniture_contamination');
});

// 5. Captions, tables, lists remain available as structured blocks.
check('5. captions, tables, lists remain available as structured blocks', () => {
  const doc = DocumentModel.buildStructuredDocument(twoPageLayouts(), { documentId: 'test-doc' });
  const caption = doc.blocks.find((b) => b.type === 'caption');
  assert.strictEqual(caption.disposition, DocumentModel.DISPOSITIONS.INCLUDED_CAPTION);
  // Same-page body text references Fig. 3.1, so the caption associates.
  assert.ok(caption.association);
  assert.strictEqual(caption.association.body_block_id, 'test-doc:p1-b2');
  const table = doc.blocks.find((b) => b.type === 'table');
  assert.strictEqual(table.disposition, DocumentModel.DISPOSITIONS.INCLUDED_TABLE);
  assert.deepStrictEqual(table.table_rows, [
    ['Feature', 'Value'], ['Height', '73 metres'], ['Built', '1653']
  ]);
  const listDoc = DocumentModel.buildStructuredDocument([{
    pageNumber: 1,
    blocks: [{ id: 'p1-b1', type: 'body', text: '• Red sandstone • White marble • Carved pillars', bbox: null, itemCount: 1, confidence: 1, reason: 'body' }],
    stats: {}
  }], { documentId: 'list-doc' });
  assert.deepStrictEqual(listDoc.blocks[0].list_items,
    ['Red sandstone', 'White marble', 'Carved pillars']);
});

// 6. Source-unit IDs + evidence spans traceable and deterministic.
check('6. source-unit IDs and evidence spans traceable and deterministic', () => {
  const sections = [{ id: 'sec_1', title: 'T', page: 3, text: 'The Taj Mahal is located in Agra. Mining contributes to the GDP.' }];
  const first = Engine.buildTypedKnowledge(sections, { sourceMeta: { type: 'textbook' }, documentId: 'trace-doc' });
  const second = Engine.buildTypedKnowledge(sections, { sourceMeta: { type: 'textbook' }, documentId: 'trace-doc' });
  assert.strictEqual(JSON.stringify(first), JSON.stringify(second));
  for (const fact of first.typed_facts) {
    assert.match(fact.fact_id, /^TF-LITE-\d+$/);
    assert.strictEqual(fact.source.sentence_id.slice(0, 7), 'KU-LITE');
    assert.strictEqual(fact.source.page, 3);
    assert.strictEqual(fact.source.document_id, 'trace-doc');
    assert.ok(fact.evidence_span.start >= 0 && fact.evidence_span.end > fact.evidence_span.start);
    assert.strictEqual(
      sections[0].text.slice(fact.evidence_span.start, fact.evidence_span.end), fact.evidence);
  }
});

// 7. Every typed fact has valid supported type, meaningful subject,
//    valid relation, grounded object/value.
check('7. every typed fact is structurally valid', () => {
  const sections = [{
    id: 'sec_1', title: 'T', page: 1,
    text: 'The Taj Mahal is located in Agra. The hall was completed in 1653. Mining contributes to the GDP. The river is approximately 2,500 km long.'
  }];
  const tk = Engine.buildTypedKnowledge(sections, { sourceMeta: { type: 'textbook' }, documentId: 'valid-doc' });
  assert.ok(tk.typed_facts.length >= 4);
  for (const fact of tk.typed_facts) {
    assert.ok(Engine.TYPED_FACT_TYPES.includes(fact.fact_type), 'unsupported type: ' + fact.fact_type);
    assert.ok(fact.subject && fact.subject.trim().length >= 2);
    assert.strictEqual(Engine.checkSubjectQuality(fact.subject).valid, true);
    assert.ok(fact.relation && fact.relation !== 'unclassified');
    assert.ok(fact.object != null && String(fact.object).trim() !== '');
    assert.ok(fact.evidence && fact.evidence.length > 0);
    assert.strictEqual(fact.normalized_subject, fact.normalized_subject.toLowerCase());
  }
});

// 8. Unclassified content appears in unparsed_units with a reason,
//    never as a fake fact.
check('8. unclassified content is unparsed with a reason, never a fake fact', () => {
  const tk = Engine.buildTypedKnowledge(
    [{ id: 'sec_1', title: 'T', page: 1, text: 'The blorp flibberty wozzecks the quux. What is the capital? Look at the map.' }],
    { sourceMeta: { type: 'textbook' }, documentId: 'unparsed-doc' });
  assert.strictEqual(tk.typed_facts.length, 0);
  assert.ok(tk.unparsed_units.length >= 1);
  for (const unit of tk.unparsed_units) {
    assert.ok(Object.values(Engine.UNPARSED_REASON_CODES).includes(unit.reason),
      'unknown reason: ' + unit.reason);
    assert.ok(unit.original_text.length > 0);
    assert.ok(unit.source_unit_id);
  }
  const reasons = tk.unparsed_units.map((u) => u.reason);
  assert.ok(reasons.includes('unsupported_pattern'));
  assert.ok(reasons.includes('interrogative_or_instruction'));
  // And no typed fact anywhere in this run is a fallback in disguise.
  assert.ok(!tk.typed_facts.some((f) => f.fact_type === 'fallback'
    || !f.subject || !f.object || f.relation === 'unclassified'));
});

// 9. A multi-claim sentence does not silently lose later claims.
check('9. multi-claim sentence keeps later claims', () => {
  const sentence = 'First 5 members joined, then 10 members joined, and finally 15 members joined.';
  const oldFacts = Engine.parseFactRelations(sentence, {});
  const newFacts = Engine.parseAllFactRelations(sentence, {});
  assert.strictEqual(oldFacts.length, 1);
  assert.strictEqual(oldFacts[0].fact_type, 'sequence');
  assert.ok(newFacts.length >= 4);
  assert.ok(newFacts.some((f) => f.fact_type === 'sequence'));
  assert.strictEqual(newFacts.filter((f) => f.fact_type === 'numeric').length, 3);
  const tk = Engine.buildTypedKnowledge(
    [{ id: 'sec_1', title: 'T', page: 1, text: sentence }],
    { sourceMeta: { type: 'textbook' }, documentId: 'multi-doc' });
  assert.strictEqual(tk.accounting.multi_claim_units, 1);
  assert.ok(tk.typed_facts.length >= 4);
});

// 10. Negation, direction, units, approximators, date qualifiers survive.
check('10. negation, direction, units, approximators, dates survive', () => {
  const tk = Engine.buildTypedKnowledge([{
    id: 'sec_1', title: 'T', page: 1,
    text: 'The region does not receive more than 100 cm of rainfall. Mining contributes to the GDP. The hall was completed in 1653.'
  }], { sourceMeta: { type: 'textbook' }, documentId: 'qual-doc' });
  const numeric = tk.typed_facts.find((f) => f.fact_type === 'numeric');
  assert.ok(numeric);
  assert.strictEqual(numeric.qualifiers.polarity, 'negative');
  assert.strictEqual(numeric.qualifiers.precision, 'approximate');
  assert.ok(numeric.object.includes('cm'), 'unit lost: ' + numeric.object);
  const causal = tk.typed_facts.find((f) => f.fact_type === 'causal');
  assert.ok(causal);
  assert.strictEqual(causal.qualifiers.relation_verb, 'contributes to');
  assert.strictEqual(causal.qualifiers.causal_direction, 'cause_to_effect');
  const date = tk.typed_facts.find((f) => f.fact_type === 'date');
  assert.ok(date);
  assert.strictEqual(date.object, '1653');
});

// 11. No empty/vacuous propositions enter V2.
check('11. no empty or vacuous propositions enter V2', () => {
  const ineligible = [
    { fact_id: 'F-1', fact_type: 'fallback', extraction_method: 'fallback', subject: '', object: '', sentence_role: 'assertion' },
    { fact_id: 'F-2', fact_type: 'entity_attribute', subject: 'It', object: 'Agra', relation: 'location', sentence_role: 'assertion' },
    { fact_id: 'F-3', fact_type: 'entity_attribute', subject: 'The Taj Mahal', object: '', relation: 'location', sentence_role: 'assertion' }
  ];
  for (const fact of ineligible) {
    assert.strictEqual(Representation.classifyPropositionEligibility(fact).eligible, false);
    assert.strictEqual(Representation.mapFactToProposition(fact), null);
  }
  const compiled = Representation.compileSemanticRepresentation(
    [{ id: 'sec_1', title: 'T', page: 1, text: 'The Taj Mahal is located in Agra.' }],
    ineligible);
  assert.ok(!compiled.propositions.some((p) => !p.subject || !p.object));
  assert.strictEqual(compiled.graphRejections.filter((r) => r.source === 'fact_bridge').length, 3);
  // Direct extraction with a pronoun subject is caught by the guard.
  const direct = Representation.compileSemanticRepresentation(
    [{ id: 'sec_1', title: 'T', page: 1, text: 'This is larger than the previous hall.' }]);
  assert.strictEqual(direct.propositions.length, 0);
  assert.ok(direct.graphRejections.some((r) => r.reason === 'fragment_subject'));
});

// 12. Unparsed + visually dependent units remain visible in diagnostics.
check('12. unparsed and visual units remain visible in diagnostics', () => {
  const doc = DocumentModel.buildStructuredDocument(twoPageLayouts(), { documentId: 'vis-doc' });
  const diagram = doc.blocks.find((b) => b.type === 'diagram');
  assert.strictEqual(diagram.disposition, DocumentModel.DISPOSITIONS.INCLUDED_DIAGRAM);
  assert.strictEqual(diagram.disposition_reason, 'diagram_visual_dependency');
  assert.strictEqual(diagram.eligible_for_fact_extraction, false);
  const tk = Engine.buildTypedKnowledge(
    [{ id: 'sec_1', title: 'T', page: 1, text: 'The blorp flibberty wozzecks the quux.' }],
    { sourceMeta: { type: 'textbook' }, documentId: 'vis-doc' });
  assert.strictEqual(tk.unparsed_units.length, 1);
  assert.strictEqual(tk.unparsed_units[0].potential_learning_relevance, true);
  assert.ok(doc.accounting.blocks_requiring_review >= 1);
});

// 13. Reference entries trace to source blocks or get an explicit
//     unresolved-match disposition.
check('13. reference matching traces or marks unresolved explicitly', () => {
  const blocks = [
    { block_id: 'd:p1-b2', text: 'The Taj Mahal is located in Agra.' },
    { block_id: 'd:p1-b3', text: 'The Taj Mahal is located in Agra.' }
  ];
  const exact = harness.matchReferenceEntry(
    { entry_id: 'INV-001', quotation: 'The Taj Mahal is located in Agra.' },
    [blocks[0], { block_id: 'd:p1-b9', text: 'Unrelated sentence here.' }]);
  assert.strictEqual(exact.match_method, 'exact_span');
  assert.strictEqual(exact.block_id, 'd:p1-b2');
  const normalized = harness.matchReferenceEntry(
    { entry_id: 'INV-002', quotation: 'the taj mahal is located in agra' },
    [{ block_id: 'd:p1-b9', text: 'The Taj Mahal is located in Agra!' }]);
  assert.strictEqual(normalized.match_method, 'normalized_text');
  const ambiguous = harness.matchReferenceEntry(
    { entry_id: 'INV-003', quotation: 'The Taj Mahal is located in Agra.' }, blocks);
  // Two identical blocks: the matcher must NOT silently pick one.
  assert.strictEqual(ambiguous.match_method, 'ambiguous_review');
  assert.strictEqual(ambiguous.disposition, 'review_required');
  const unresolved = harness.matchReferenceEntry(
    { entry_id: 'INV-004', quotation: 'No such sentence exists anywhere.' }, blocks);
  assert.strictEqual(unresolved.match_method, 'unresolved_match');
  assert.strictEqual(unresolved.disposition, 'unresolved_match');
  assert.strictEqual(unresolved.block_id, null);
});

// 14. Repeated runs on identical inputs produce deterministic output.
check('14. repeated runs are deterministic (hash-compare)', () => {
  const layouts = twoPageLayouts();
  const sections = [{ id: 'sec_1', title: 'T', page: 1, text: 'The Taj Mahal is located in Agra. Mining contributes to the GDP.' }];
  const docA = DocumentModel.buildStructuredDocument(layouts, { documentId: 'det-doc' });
  const docB = DocumentModel.buildStructuredDocument(layouts, { documentId: 'det-doc' });
  assert.strictEqual(sha256(JSON.stringify(docA)), sha256(JSON.stringify(docB)));
  const tkA = Engine.buildTypedKnowledge(sections, { sourceMeta: { type: 'textbook' }, documentId: 'det-doc' });
  const tkB = Engine.buildTypedKnowledge(sections, { sourceMeta: { type: 'textbook' }, documentId: 'det-doc' });
  assert.strictEqual(sha256(JSON.stringify(tkA)), sha256(JSON.stringify(tkB)));
});

// 15 (spot check). The production question path still loads and builds.
check('15 (spot). production question path unchanged and working', () => {
  assert.strictEqual(typeof Engine.buildQuestionCandidates, 'function');
  assert.strictEqual(typeof Engine.validateQuestion, 'function');
  const facts = Engine.extractSourceFacts(
    [{ id: 'sec_1', title: 'T', page: 1, text: 'The Taj Mahal is located in Agra. The hall was completed in 1653.' }],
    { sourceMeta: { type: 'textbook' } });
  assert.ok(facts.length >= 2);
});

// 16. No staged production bank, consolidated bank, or previous
//     reference audit overwritten (hash comparison vs the verified
//     Phase 2A baseline).
check('16. production banks and Phase 1 audit files unchanged', () => {
  const expected = {
    'data/ncert_8_2_staged/hees201_world_geography.md': 'a36d62162871fd4764be42ea58d43eeff860fcd17412d445d0992c10dd7e18ea',
    'data/ncert_8_2_staged/hees202_indias_road_to_independence.md': '04de0e0cee2e29ab84657b3bee3e3db4e3fb987dad6338b776c0549ec0ad53a8',
    'data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md': '94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4',
    'data/ncert_8_2_staged/hees204_judiciary_in_our_society.md': '6a6f13bf3b7fdf005eaa50292efc95041798056ef5191fddba88d5b9c309f46d',
    'data/ncert_8_2_staged/hees205_citizenship_rights_and_duties.md': 'c49532ae8fc357324fe8b703920c3ae53e476b3916fcc0b544e37c448ac43497',
    'data/ncert_8_2_staged/hees206_dynamics_of_population.md': '95fe993b0b08fd0e08fe9cd97d22bdced598dc3074b2161d116bc552e2f9cd10',
    'data/ncert_8_2_staged/hees207_indias_urban_landscape.md': '25b0de908d09ac2a80cb2d54e8a446fc0a0fb297ae13e3f51f56875932767ce3',
    'data/ncert_8_2_staged/hees209_cultural_currents_13th_to_17th_centuries.md': '0d93b8fc0f8c0b9e8fbf29de1af1619dd14eb9ec4f6b42e642de55ea4b09ba59',
    'data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md': 'b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87',
    'data/ncert_8_2_staged/summary_manifest.json': '2a17f7b1b7dba7bbf426e66e96ab26f5315ef9a3dedf7b6ea939a6facc6a3669',
    '../diagnostics/CHAPTER_3_COVERAGE_AUDIT.md': '6fd2dca90cdf83c3ee00a6e8f0500b32a12537e29dd23293b551d48d59ba78b5',
    '../diagnostics/chapter_3_knowledge_inventory.json': '63009f57182f45476a9b294eb93b7492a02b2c01e1b0518bfbb6d27433b10226',
    '../diagnostics/chapter_3_coverage_matrix.json': 'd1f91397a1d6b1db9f1190837b345fd343003a82bb86a9451d89e0d99348235e',
    '../diagnostics/chapter_3_generation_metrics.json': '2a2cf5ec24d1e2a1391bd7c3e2affac9ecb9acbcdfe2b4b4890a6e98a43dccad',
    '../diagnostics/tools/diagnose_chapter3.js': '58246fce54336c8d1b4b10c837bbb430ad0db31c1c352d0b996eded4ee164c76'
  };
  for (const [rel, hash] of Object.entries(expected)) {
    const full = path.join(__dirname, '..', rel);
    assert.ok(fs.existsSync(full), 'missing baseline file: ' + rel);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    assert.strictEqual(actual, hash, 'baseline file changed: ' + rel);
  }
});

console.log('Phase 2A tests passed: ' + passed + ' checks.');
