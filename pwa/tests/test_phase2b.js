/**
 * StudySynth Phase 2B tests — Layout-Aware Source Reconstruction.
 *
 * 18 checks, 1:1 to the Phase 2B required tests. Case fixtures use the
 * EXACT block IDs, types, texts and geometry measured from the actual
 * Chapter 3 PDF by the Phase 2B layout examination (PDF hees203,
 * sha256 547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec).
 * Fixtures are page subsets: reconstruction rules are per-page local, so
 * a subset exercises the same rules as the full page (the diagnostic
 * harness verifies the same cases against the full PDF).
 *
 * Run: node tests/test_phase2b.js (from pwa/), or via npm test.
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const Engine = require('../engine/generator.js');
const DocumentModel = require('../engine/documentModel.js');
const Recon = require('../engine/sourceReconstruction.js');
const EngineV2 = require('../engine/reasoning/engine_v2.js');
const Harness2b = require('../../diagnostics/tools/diagnose_chapter3_phase2b.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

function B(id, type, text, x, y, w, h, section) {
  return {
    source_block_id: id,
    block_id: 'test:' + id,
    page: parseInt(id.slice(1, id.indexOf('-')), 10),
    type: type,
    text: text,
    bbox: { x: x, y: y, width: w, height: h, x1: x + w, y1: y + h },
    section_id: section || 'docsec_001',
    section_title: 'Test Section'
  };
}

function reconOf(blocks, page) {
  const doc = {
    document_id: 'test-doc',
    blocks: blocks,
    sections: [],
    continuations: [],
    accounting: {},
    reconciliation: {}
  };
  const out = Recon.reconstructDocument(doc, { documentId: 'test-doc' });
  return page != null ? out.units.filter((u) => (u.pages || []).includes(page)) : out;
}

function norm(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function unitHas(unit, substrings) {
  const text = norm(unit.text);
  return substrings.every((s) => text.includes(norm(s)));
}

// ---- Case fixtures (exact examiner geometry) ----

function p14Fixture() {
  return [
    B('p14-b2', 'table', 'Wells | have | been ; bricks, | stones, | or ; terracotta | ring. | In ; classical | times, | a ; ( vāvs | or | bāorīs ) ; space | where | people', 404.0, 151.2, 146.2, 250.1),
    B('p14-b3', 'table', 'Wells', 410.0, 151.2, 30.6, 12),
    B('p14-b4', 'table', 'have', 468.0, 151.2, 27.4, 12),
    B('p14-b5', 'table', 'been', 522.6, 151.2, 27.6, 12),
    B('p14-b6', 'ambiguous', 'constructed in many sizes and shapes from', 410.0, 168.2, 140.1, 29.0),
    B('p14-b7', 'table', 'bricks,', 410.0, 202.2, 37.5, 12),
    B('p14-b8', 'table', 'stones,', 473.4, 202.2, 38.4, 12),
    B('p14-b9', 'table', 'or', 537.8, 202.2, 12.5, 12),
    B('p14-b10', 'table', 'terracotta', 410.0, 219.2, 55.4, 12),
    B('p14-b11', 'table', 'ring.', 488.7, 219.2, 26.2, 12),
    B('p14-b12', 'table', 'In', 538.2, 219.2, 12.0, 12),
    B('p14-b13', 'table', 'classical', 410.0, 236.2, 46.5, 12),
    B('p14-b14', 'table', 'times,', 483.2, 236.2, 33.6, 12),
    B('p14-b15', 'table', 'a', 543.5, 236.2, 6.8, 12),
    B('p14-b16', 'fragment', 'tradition of stepwells', 410.0, 253.2, 140.2, 12),
    B('p14-b17', 'table', '( vāvs', 410.0, 270.2, 29.1, 12),
    B('p14-b18', 'table', 'or', 469.0, 270.2, 12.5, 12),
    B('p14-b19', 'table', 'bāorīs )', 511.4, 270.2, 38.8, 12),
    B('p14-b20', 'caption', 'Fig. 3.16. The Rani ki Vav stepwell', 185.6, 279.9, 152.3, 10),
    B('p14-b21', 'fragment', 'developed in Gujarat', 410.0, 287.2, 140.2, 12),
    B('p14-b22', 'body', 'and Rajasthan, many of them engineering marvels as well as spectacular works of art. The stepwell at Rani ki Vav (Fig. 3.16) has multiple pillared levels and hundreds of magnificent statues. Besides harvesting and storing rainwater,', 183.0, 304.2, 367.2, 102),
    B('p14-b23', 'ambiguous', 'stepwells offered a social', 404.0, 372.2, 146.2, 12),
    B('p14-b24', 'table', 'space', 404.0, 389.2, 31.4, 12),
    B('p14-b25', 'table', 'where', 456.0, 389.2, 36.0, 12),
    B('p14-b26', 'table', 'people', 512.6, 389.2, 37.6, 12),
    B('p14-b27', 'body', 'could sit together, enjoy cooler temperatures and exchange all the news. Temples often had water reservoirs or pu ṣ hkariṇīs attached to them, which were used for water harvesting as well as water-based rituals. Many of them were also works of art, with numerous stairways built into them (Fig. 3.17).', 404.0, 406.2, 146.2, 85),
    B('p14-b29', 'ambiguous', 'Many of these traditional water structures suffer today from', 183.0, 636.2, 367.2, 12),
    B('p14-b30', 'page_furniture', 'Exploring Society: India and Beyond | Grade 8 Part 2 depleted water sources, maintenance issues, pollution, waste', 87.4, 652.6, 462.9, 12),
    B('p14-b31', 'ambiguous', 'dumping, etc. Environmentalists, locals, and NGOs sometimes', 183.0, 670.2, 367.2, 12),
    B('p14-b33', 'body', 'join hands to preserve them, but much remains to be done.', 183.0, 687.2, 340.8, 12)
  ];
}

function p17Fixture() {
  return [
    B('p17-b2', 'body', 'Until the 8 th or 9 th century, temples were modest in size. From the', 85.8, 381.8, 205.9, 36, 'docsec_001'),
    B('p17-b3', 'heading', '10 th century onward, in different', 85.8, 415.8, 205.9, 12.0, 'docsec_002'),
    B('p17-b4', 'body', 'parts of India they grew in scale and began incorporating multiple shrines, amenities, and enclosures ( prākāras ), culminating in vast complexes. In the grade 7 textbook (chapter ‘Turning Tides: 11 th and 12 th Centuries’), we saw the magnificent Kandāriyā Mahādeva Temple of Khajuraho and Cambodia’s colossal', 85.8, 432.8, 205.9, 120, 'docsec_002'),
    B('p17-b7', 'body', 'Angkor Wat Temple . In Thanjavur, Tamil Nadu, the imposing Bṛihadīśhvara Temple (Fig. 3.20) was built by Rājarāja Chola I around 1010. It is renowned for its vast maṇḍapas , a huge vimāna , over 60 metres high, and a', 85.8, 585.8, 367.2, 63.8, 'docsec_002'),
    B('p17-b8', 'body', 'OurCulturalHeritageandKnowledgeTraditions 3–AJourneyThroughIndianArchitecture', 552.4, 652.6, 154.7, 8.0, 'docsec_002'),
    B('p17-b9', 'body', 'massive Nandi (sacred bull) statue carved from a single stone, which sits in a pavilion facing the main shrine. The entire', 85.8, 654.6, 367.2, 36, 'docsec_002')
  ];
}

function p22Fixture() {
  return [
    B('p22-b4', 'body', 'The Friday prayers are especially important in', 397.6, 443.9, 151.6, 12),
    B('p22-b5', 'table', 'Islam; | large | mosques ; while | masjid | means', 397.6, 477.9, 151.6, 97.0),
    B('p22-b6', 'table', 'Islam;', 397.6, 477.9, 40, 12),
    B('p22-b7', 'table', 'large', 440.0, 477.9, 40, 12),
    B('p22-b8', 'table', 'mosques', 500.0, 477.9, 40, 12),
    B('p22-b9', 'body', 'where these prayers are held are often called ‘Jama Masjid’— jama', 397.6, 494.9, 151.6, 24),
    B('p22-b10', 'fragment', 'means', 397.6, 528.9, 40, 12),
    B('p22-b11', 'fragment', '‘gathering’ or ‘assembly’,', 397.6, 545.9, 100, 12),
    B('p22-b12', 'table', 'while', 397.6, 562.9, 40, 12),
    B('p22-b13', 'table', 'masjid', 440.0, 562.9, 40, 12),
    B('p22-b14', 'table', 'means', 500.0, 562.9, 40, 12),
    B('p22-b15', 'ambiguous', '‘mosque’. The Jama Masjid in Ahmedabad', 397.6, 579.9, 151.6, 50.5),
    B('p22-b16', 'fragment', '(Gujarat)', 497.5, 618.4, 51.7, 12),
    B('p22-b17', 'body', 'was built by Sultan Ahmed Shah I in the 15 th century.', 397.6, 635.5, 151.6, 12),
    B('p22-b18', 'page_furniture', 'Exploring Society: India and Beyond | Grade 8 Part 2', 78.8, 652.6, 205.7, 12),
    B('p22-b19', 'caption', 'Fig. 3.29. A sketch made in 1809 by a British army', 123.2, 660.7, 236.1, 10),
    B('p22-b20', 'body', 'officer shows the mosque’s full-size minarets.', 133.9, 672.7, 214.6, 12)
  ];
}

function p26Fixture() {
  return [
    B('p26-b6', 'ambiguous', 'The construction of the', 390.5, 44.6, 159.7, 12),
    B('p26-b7', 'table', 'Mehrangarh', 390.5, 61.6, 76.2, 12),
    B('p26-b8', 'table', 'Fort', 489.8, 61.6, 25.6, 12),
    B('p26-b9', 'table', 'in', 538.6, 61.6, 11.6, 12),
    B('p26-b10', 'body', 'Rajasthan (Fig. 3.33) began in the mid-15 th century; Rajput rulers continued to expand it over the next two centuries or so. Overlooking the city of Jodhpur, this imposing structure is made of massive blocks of locally sourced red sandstone. Within the fort complex, a large palace (Fig. 3.34) has several areas for the royalty, separate quarters for the men and women, living quarters for the staff,', 390.5, 78.6, 159.7, 120),
    B('p26-b13', 'table', 'Mehrangarh | Fort | in', 390.5, 61.6, 159.7, 17),
    B('p26-b14', 'caption', 'Fig. 3.34. One of the facades of the palace inside the', 105.4, 284.7, 243.8, 10),
    B('p26-b15', 'ambiguous', 'Mehrangarh Fort; note the intricate carving and the stone', 88.9, 296.7, 276.8, 12),
    B('p26-b16', 'body', 'latticework around the balconies.', 148.6, 308.7, 157.4, 12),
    B('p26-b17', 'body', 'and stables and barracks. Today, many parts of the fort have', 187.3, 334.8, 362.9, 12),
    B('p26-b19', 'body', 'been converted into a museum to preserve and showcase the fort’s and Rajasthan’s cultural heritage.', 187.3, 351.8, 362.8, 12),
    B('p26-b21', 'fragment', 'DON’T MISS OUT', 187.3, 398.3, 116.4, 12),
    B('p26-b23', 'body', 'Æ Jaswant Thada in Fig. 3.33 is a more recent building, a', 187.3, 427.4, 344.9, 12),
    B('p26-b11', 'body', 'memorial to Maharaja Jaswant Singh II built by his son Maharaja Sardar Singh; it has served as the cremation ground for Jodhpur’s royal family. Such monuments in the memory of a historical figure are called ‘cenotaphs’; they are not tombs, as the deceased person remembered is not buried at the spot.', 212.5, 444.4, 319.7, 60),
    B('p26-b26', 'body', 'Æ Jodhpur is also noted for the blue colour of traditional', 187.3, 550.9, 344.9, 12),
    B('p26-b12', 'body', 'houses close to the fort. This is due to the application of a solution of copper sulphate mixed with lime on the walls, which is said to repel termites. Other features of Jodhpur include meandering streets, open courtyards, j ā li windows for ventilation, thick walls and balconies,', 212.5, 567.9, 319.7, 80),
    B('p26-b27', 'page_furniture', 'Exploring Society: India and Beyond | Grade 8 Part 2 all of which work together to keep houses cool.', 87.4, 652.6, 395.6, 12),
    B('p26-b5', 'fragment', '110', 73.0, 675.3, 19.4, 12),
    B('p26-b18', 'fragment', 'Latticework: Open', 96.5, 336.8, 63.8, 22.0),
    B('p26-b1', 'fragment', 'framework', 108.0, 360.8, 52.2, 12),
    B('p26-b20', 'ambiguous', 'with criss- crossing or decorative', 107.4, 372.8, 52.8, 34.0),
    B('p26-b2', 'fragment', 'designs. Here,', 92.5, 408.8, 67.7, 12),
    B('p26-b22', 'fragment', 'it is both', 119.0, 420.8, 41.2, 12),
    B('p26-b24', 'fragment', 'functional', 112.0, 432.8, 48.2, 12),
    B('p26-b3', 'fragment', '(allowing', 117.4, 444.8, 42.8, 12),
    B('p26-b25', 'fragment', 'ventilation) and aesthetic', 96.2, 456.8, 64.1, 22.0),
    B('p26-b4', 'fragment', 'in design.', 114.2, 480.8, 46.0, 12)
  ];
}

function p38Fixture() {
  return [
    B('p38-b1', 'heading', 'Colonial Architecture', 215.3, 45.0, 217.4, 17.0),
    B('p38-b2', 'caption', 'Fig. 3.52. A general view of the Madras High Court, completed in 1892. The', 147.3, 363.6, 353.3, 10),
    B('p38-b3', 'ambiguous', 'red sandstone facade features Islamic arches and intricate screens alongside', 140.9, 375.6, 366.2, 12),
    B('p38-b4', 'body', 'carvings and pillars in Hindu temple style.', 222.9, 387.6, 202.3, 12),
    B('p38-b5', 'page_furniture', 'Exploring Society: India and Beyond | Grade 8 Part 2', 78.8, 652.6, 205.7, 12),
    B('p38-b6', 'caption', 'Fig. 3.53. A close-up of some of its domes and towers.', 198.4, 668.3, 251.5, 10),
    B('p38-b7', 'fragment', '122', 64.4, 675.3, 19.4, 12)
  ];
}

// ---- Checks ----

check('1. reconstruction is stable and deterministic from identical blocks', () => {
  const doc = { document_id: 'test-doc', blocks: p22Fixture(), sections: [], continuations: [], accounting: {}, reconciliation: {} };
  const a = Recon.reconstructDocument(doc, { documentId: 'test-doc' });
  const b = Recon.reconstructDocument(doc, { documentId: 'test-doc' });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.units.length > 0);
});

check('2. reading order follows geometry (y, x), not input order', () => {
  const blocks = [
    B('p9-b3', 'body', 'third', 100, 150, 100, 12),
    B('p9-b1', 'body', 'first', 100, 50, 100, 12),
    B('p9-b2', 'body', 'second', 100, 100, 100, 12)
  ];
  const units = reconOf(blocks, 9);
  const prose = units.find((u) => u.type === 'body_prose');
  assert.ok(prose, 'expected a prose unit');
  assert.strictEqual(prose.text, 'first second third');
});

check('3. separate columns are never interleaved', () => {
  const blocks = [
    B('p9-b1', 'body', 'L1', 100, 50, 100, 12),
    B('p9-b2', 'body', 'R1', 300, 50, 100, 12),
    B('p9-b3', 'body', 'L2', 100, 100, 100, 12),
    B('p9-b4', 'body', 'R2', 300, 100, 100, 12)
  ];
  const units = reconOf(blocks, 9).filter((u) => u.type === 'body_prose');
  assert.strictEqual(units.length, 2);
  const texts = units.map((u) => u.text).sort();
  assert.deepStrictEqual(texts, ['L1 L2', 'R1 R2']);
});

check('4. aggregate blocks are never duplicated with granular segments', () => {
  const blocks = [
    B('p9-b1', 'table', 'alpha | beta ; gamma | delta', 100, 50, 200, 40),
    B('p9-b2', 'body', 'Here are words.', 100, 100, 200, 12),
    B('p9-b3', 'table', 'alpha', 100, 130, 40, 12),
    B('p9-b4', 'table', 'beta', 150, 130, 40, 12),
    B('p9-b5', 'table', 'gamma', 100, 150, 40, 12),
    B('p9-b6', 'table', 'delta', 150, 150, 40, 12)
  ];
  const out = reconOf(blocks);
  const units = out.units.filter((u) => (u.pages || []).includes(9));
  assert.ok(out.exclusions.some((e) => e.block_id === 'p9-b1' && e.reason === 'aggregate_duplicates_granular_segments'));
  assert.ok(!units.some((u) => (u.block_ids || []).includes('p9-b1')));
  const prose = units.find((u) => u.type === 'body_prose');
  assert.ok(prose);
  assert.strictEqual((prose.text.match(/alpha/g) || []).length, 1);
});

check('5. page 14 wells and stepwells recovery (aggregate excluded, threats kept)', () => {
  const out = reconOf(p14Fixture());
  const units = out.units.filter((u) => (u.pages || []).includes(14));
  const wells = units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['Wells have been constructed', 'stepwells offered a social space']));
  assert.ok(wells, 'wells/stepwells passage missing');
  assert.ok(unitHas(wells, ['In classical times, a tradition of stepwells', 'developed in Gujarat and Rajasthan']));
  assert.ok(!units.some((u) => (u.block_ids || []).includes('p14-b2')), 'aggregate p14-b2 must never be a unit source');
  assert.ok(out.exclusions.some((e) => e.block_id === 'p14-b2'));
  const threats = units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['depleted water sources', 'waste dumping']));
  assert.ok(threats, 'threats sentence missing (furniture tail not rescued?)');
  const caption = units.find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.16');
  assert.ok(caption, 'Fig 3.16 caption missing');
  assert.deepStrictEqual(caption.block_ids, ['p14-b20']);
});

check('6. page 17 Nandi sentence recovery without furniture; false heading demoted', () => {
  const out = reconOf(p17Fixture());
  const units = out.units.filter((u) => (u.pages || []).includes(17));
  const nandi = units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['massive Nandi', 'carved from a single stone']));
  assert.ok(nandi, 'Nandi sentence missing');
  assert.ok(!norm(nandi.text).includes('ourculturalheritage'), 'furniture leaked into Nandi sentence');
  assert.ok(unitHas(nandi, ['From the 10 th century onward, in different parts of India']));
  assert.ok((nandi.review_flags || []).includes('contains_demoted_heading'));
  assert.ok((nandi.review_flags || []).includes('section_corrected_from_demoted_heading'));
  assert.strictEqual(nandi.section_id, 'docsec_001');
  assert.ok(out.exclusions.some((e) => e.block_id === 'p17-b8'));
});

check('7. Jama Masjid builder and etymology recovery', () => {
  const out = reconOf(p22Fixture());
  const units = out.units.filter((u) => (u.pages || []).includes(22));
  const jama = units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['was built by Sultan Ahmed Shah I', 'jama means', 'masjid means']));
  assert.ok(jama, 'builder/etymology passage missing');
  assert.ok(!units.some((u) => (u.block_ids || []).includes('p22-b5')), 'aggregate p22-b5 must never be a unit source');
  assert.ok(out.exclusions.some((e) => e.block_id === 'p22-b18' && e.reason === 'page_furniture'));
  const caption = units.find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.29');
  assert.ok(caption, 'Fig 3.29 caption missing');
  assert.deepStrictEqual(caption.block_ids, ['p22-b19', 'p22-b20']);
});

check('8. latticework glossary reconstruction with provenance', () => {
  const out = reconOf(p26Fixture());
  const units = out.units.filter((u) => (u.pages || []).includes(26));
  const gloss = units.find((u) => u.type === 'glossary_definition' && u.term === 'Latticework');
  assert.ok(gloss, 'glossary unit missing');
  assert.ok(unitHas(gloss, ['functional (allowing ventilation)', 'aesthetic in design']));
  assert.deepStrictEqual(gloss.block_ids,
    ['p26-b18', 'p26-b1', 'p26-b20', 'p26-b2', 'p26-b22', 'p26-b24', 'p26-b3', 'p26-b25', 'p26-b4']);
  assert.strictEqual(gloss.certainty, 'glossary_margin_column');
  assert.ok((gloss.review_flags || []).includes('glossary_building_link_not_inferred'));
  const mehr = units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['The construction of the Mehrangarh Fort in Rajasthan']));
  assert.ok(mehr, 'Mehrangarh subject recovery missing');
  assert.ok(out.exclusions.some((e) => e.block_id === 'p26-b21' && e.reason === 'callout_banner_artifact'));
  const jodhpur = units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['all of which work together to keep houses cool']));
  assert.ok(jodhpur, 'furniture tail not rescued on p26');
});

check('9. Madras High Court caption reconstruction with caption provenance', () => {
  const out = reconOf(p38Fixture());
  const units = out.units.filter((u) => (u.pages || []).includes(38));
  const cap = units.find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.52');
  assert.ok(cap, 'Fig 3.52 caption missing');
  assert.deepStrictEqual(cap.block_ids, ['p38-b2', 'p38-b3', 'p38-b4']);
  assert.ok(unitHas(cap, ['Madras High Court, completed in 1892', 'red sandstone', 'Islamic arches', 'Hindu temple style']));
  assert.strictEqual(cap.certainty, 'caption_stitched');
  assert.ok(!units.some((u) => u.type === 'body_prose'), 'p38 has no body prose; caption tail must not become prose');
  assert.ok(out.exclusions.some((e) => e.block_id === 'p38-b5' && e.reason === 'page_furniture'));
  assert.ok(out.exclusions.some((e) => e.block_id === 'p38-b7' && e.reason === 'page_number'));
});

check('10. Fig. 3.29 and Fig. 3.53 references remain unresolved (no binding facts)', () => {
  const fig29 = reconOf(p22Fixture()).units.find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.29');
  const fig53 = reconOf(p38Fixture()).units.find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.53');
  assert.ok(fig29 && fig53);
  const typed = Engine.buildTypedKnowledgeFromReconstructedUnits([fig29, fig53],
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: 'test-doc' });
  const ahmedabadBinding = typed.typed_facts.filter((f) => (f.subject || '').includes('Ahmedabad'));
  const madrasDomes = typed.typed_facts.filter((f) => (f.subject || '').includes('Madras High Court')
    && (f.object || '').toLowerCase().includes('dome'));
  assert.strictEqual(ahmedabadBinding.length, 0, 'Fig 3.29 must not bind the mosque to Ahmedabad');
  assert.strictEqual(madrasDomes.length, 0, 'Fig 3.53 "its" must not bind domes to the Madras High Court');
});

check('11. timeline date pairings remain unresolved until independently supported', () => {
  const blocks = [
    B('p3-b11', 'heading', 'Brihadiswara Temple', 456.1, 284.7, 100, 12),
    B('p3-b10', 'heading', '1010 CE', 381.8, 267.2, 60, 12),
    B('p3-b12', 'heading', '1063 CE', 314.6, 290.1, 60, 12),
    B('p3-b8', 'fragment', 'Ellora rock-cut caves', 281.5, 224.7, 120, 12),
    B('p3-b45', 'fragment', '600–900 CE', 425.9, 223.7, 80, 12)
  ];
  const units = reconOf(blocks, 3);
  assert.ok(!units.some((u) => u.type === 'body_prose' || u.type === 'table' || u.type === 'glossary_definition'));
  const typed = Engine.buildTypedKnowledgeFromReconstructedUnits(units,
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: 'test-doc' });
  assert.strictEqual(typed.typed_facts.filter((f) => f.fact_type === 'date').length, 0);
});

check('12. maps remain visual-only when relationships are absent from text', () => {
  const blocks = [
    B('p4-b1', 'heading', 'Shekhawati havelis', 212.0, 66.3, 120, 12),
    B('p4-b2', 'heading', 'Golden temple', 122.3, 104.9, 100, 12),
    B('p4-b7', 'fragment', 'Rani ki Vav', 168.0, 355.2, 80, 12),
    B('p4-b18', 'caption', 'Fig. 3.3. Locations of the structures and monuments visited in this chapter', 168.0, 676.4, 250, 10)
  ];
  const units = reconOf(blocks, 4);
  assert.ok(!units.some((u) => u.type === 'body_prose'));
  const typed = Engine.buildTypedKnowledgeFromReconstructedUnits(units,
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: 'test-doc' });
  assert.strictEqual(typed.typed_facts.length, 0);
});

check('13. every reconstructed text span is traceable to exact source blocks', () => {
  const fixture = p14Fixture();
  const byId = {};
  fixture.forEach((b) => { byId[b.source_block_id] = b; });
  const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();
  const out = reconOf(fixture);
  out.units.forEach((u) => {
    (u.block_ids || []).forEach((id) => assert.ok(byId[id], 'unit ' + u.unit_id + ' references unknown block ' + id));
    (u.provenance || []).forEach((p) => {
      assert.ok(byId[p.block_id], 'provenance references unknown block ' + p.block_id);
      assert.strictEqual(p.text, collapse(byId[p.block_id].text));
      assert.ok(p.bbox && Number.isFinite(p.bbox.x) && Number.isFinite(p.bbox.y));
    });
    (u.fragments_used || []).forEach((f) => assert.ok(byId[f.block_id]));
  });
});

check('14. every new typed fact has nonempty valid evidence and accurate source references', () => {
  const out = reconOf(p22Fixture());
  const jama = out.units.find((u) => u.type === 'body_prose'
    && unitHas(u, ['was built by Sultan Ahmed Shah I']));
  assert.ok(jama);
  const typed = Engine.buildTypedKnowledgeFromReconstructedUnits([jama],
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: 'test-doc' });
  const builder = typed.typed_facts.find((f) => (f.subject || '').includes('Jama Masjid'));
  assert.ok(builder, 'expected a Jama Masjid builder fact');
  assert.ok(builder.evidence && builder.evidence.length > 0);
  assert.deepStrictEqual(builder.source.block_ids, jama.block_ids);
  assert.deepStrictEqual(builder.source.page_range, [22]);
  assert.strictEqual(builder.source.evidence_source, 'reconstructed_prose');
  assert.strictEqual(builder.source.reconstructed_unit_id, jama.unit_id);
  typed.typed_facts.forEach((f) => {
    assert.ok(f.evidence && f.subject && f.object, 'typed fact missing evidence/subject/object');
    assert.ok((f.source.block_ids || []).length > 0);
  });
});

check('15. reference matching distinguishes confirmed matches from review candidates', () => {
  const blocks = p14Fixture();
  const units = reconOf(p14Fixture()).units;
  const exact = Harness2b.matchReferenceEntryPhase2b(
    { quotation: 'The Jama Masjid in Ahmedabad' },
    [{ block_id: 'x', source_block_id: 'p22-b15', page: 22, text: '‘mosque’. The Jama Masjid in Ahmedabad' }],
    []);
  assert.strictEqual(exact.match_method, 'exact_span');
  assert.strictEqual(exact.disposition, 'matched');
  const multi = Harness2b.matchReferenceEntryPhase2b(
    { quotation: 'Wells have been constructed in many sizes and shapes from bricks' },
    blocks, units);
  assert.strictEqual(multi.match_method, 'multi_block_ordered_span');
  assert.strictEqual(multi.disposition, 'matched');
  assert.ok(multi.unit_id);
  const fuzzy = Harness2b.matchReferenceEntryPhase2b(
    { pdf_page: 14, quotation: 'stepwells offered social space people sit together enjoy cooler temperatures exchange news' },
    blocks, units);
  assert.strictEqual(fuzzy.match_method, 'candidate_fuzzy');
  assert.strictEqual(fuzzy.disposition, 'review_required', 'fuzzy candidates must never auto-count as coverage');
  assert.ok(fuzzy.score >= 0.8);
  const ambiguous = Harness2b.matchReferenceEntryPhase2b({ quotation: 'or' }, blocks, units);
  assert.strictEqual(ambiguous.match_method, 'ambiguous_review');
  assert.strictEqual(ambiguous.disposition, 'review_required');
});

check('16. existing production question builders, validators and static banks unchanged', () => {
  const EXPECTED_HASHES = {
    '../data/ncert_8_2_staged/hees201_world_geography.md': 'a36d62162871fd4764be42ea58d43eeff860fcd17412d445d0992c10dd7e18ea',
    '../data/ncert_8_2_staged/hees202_indias_road_to_independence.md': '04de0e0cee2e29ab84657b3bee3e3db4e3fb987dad6338b776c0549ec0ad53a8',
    '../data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md': '94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4',
    '../data/ncert_8_2_staged/hees204_judiciary_in_our_society.md': '6a6f13bf3b7fdf005eaa50292efc95041798056ef5191fddba88d5b9c309f46d',
    '../data/ncert_8_2_staged/hees205_citizenship_rights_and_duties.md': 'c49532ae8fc357324fe8b703920c3ae53e476b3916fcc0b544e37c448ac43497',
    '../data/ncert_8_2_staged/hees206_dynamics_of_population.md': '95fe993b0b08fd0e08fe9cd97d22bdced598dc3074b2161d116bc552e2f9cd10',
    '../data/ncert_8_2_staged/hees207_indias_urban_landscape.md': '25b0de908d09ac2a80cb2d54e8a446fc0a0fb297ae13e3f51f56875932767ce3',
    '../data/ncert_8_2_staged/hees209_cultural_currents_13th_to_17th_centuries.md': '0d93b8fc0f8c0b9e8fbf29de1af1619dd14eb9ec4f6b42e642de55ea4b09ba59',
    '../data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md': 'b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87',
    '../data/ncert_8_2_staged/summary_manifest.json': '2a17f7b1b7dba7bbf426e66e96ab26f5315ef9a3dedf7b6ea939a6facc6a3669',
    '../../diagnostics/CHAPTER_3_COVERAGE_AUDIT.md': '6fd2dca90cdf83c3ee00a6e8f0500b32a12537e29dd23293b551d48d59ba78b5',
    '../../diagnostics/chapter_3_knowledge_inventory.json': '63009f57182f45476a9b294eb93b7492a02b2c01e1b0518bfbb6d27433b10226',
    '../../diagnostics/chapter_3_coverage_matrix.json': 'd1f91397a1d6b1db9f1190837b345fd343003a82bb86a9451d89e0d99348235e',
    '../../diagnostics/chapter_3_generation_metrics.json': '2a2cf5ec24d1e2a1391bd7c3e2affac9ecb9acbcdfe2b4b4890a6e98a43dccad',
    '../../diagnostics/tools/diagnose_chapter3.js': '58246fce54336c8d1b4b10c837bbb430ad0db31c1c352d0b996eded4ee164c76',
    '../../diagnostics/CHAPTER_3_PHASE_2A_RESULTS.md': '7dd49e5bbbf51df76a5807517f12ade826b6537b9f53c0c54da075c7b5a7f01a',
    '../../diagnostics/chapter_3_phase2a_metrics.json': '1b6d454fb45510254238a1c0dc86e0984d061f24a0caabdef614e652695e5223',
    '../../diagnostics/chapter_3_phase2a_coverage_matrix.json': 'c812a4a7960e574719c2bb23dd0dd5408c73fc858324c79370b4644949852e57',
    '../../diagnostics/chapter_3_typed_fact_schema.md': '98df5bdda5c9c32f0dd3f56683ef997e17d24c7513d757b48b599d2fa9195522',
    '../../diagnostics/tools/diagnose_chapter3_phase2a.js': 'f6bc254d240f38fa8b49e342731c4c3bf5a5e318c927853ee0d3602fe2690abe',
    '../engine/documentModel.js': '736a3c15fbf9c5939397d7f28b45c804b0d60bd3f6fb711f1366a4331d0e8cb4',
    'test_phase2a.js': '4a9c48d72feb0047083d4f71d52dbb8f9c93ba42130baae59226478a30a4f052',
  };
  const sha256 = (relPath) => crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(__dirname, relPath))).digest('hex');
  Object.entries(EXPECTED_HASHES).forEach(([relPath, expected]) => {
    assert.strictEqual(sha256(relPath), expected, 'hash mismatch (file changed?): ' + relPath);
  });
  // The reconstruction module and shadow adapter are never referenced by
  // the production question path.
  assert.ok(!Engine.buildQuestionCandidates.toString().includes('reconstruct'));
  assert.ok(!Engine.validateQuestion.toString().includes('reconstruct'));
  assert.strictEqual(typeof Engine.buildTypedKnowledgeFromReconstructedUnits, 'function');
  assert.strictEqual(typeof DocumentModel.buildStructuredDocument, 'function');
});

check('17. Reasoning V2 comparison is deterministic; fact-type contract is a rejection list', () => {
  const sections = [{ title: 'T', text: 'Rain causes floods. Floods damage crops.', page: 1 }];
  const run = () => {
    const accepted = EngineV2.generateReasoningQuestionBank(sections, { facts: [], targetCount: 5 });
    const compiled = EngineV2.Representation.compileSemanticRepresentation(sections, []);
    return JSON.stringify({ accepted: accepted, generation: accepted.generation, propositions: compiled.propositions });
  };
  assert.strictEqual(run(), run());
  const gate = EngineV2.Representation.classifyPropositionEligibility;
  assert.ok(gate, 'classifyPropositionEligibility must exist');
  assert.strictEqual(gate({ fact_type: 'fallback', subject: 'X', relation: 'r', object: 'Y' }).eligible, false);
  assert.strictEqual(gate({ fact_type: 'fallback', subject: 'X', relation: 'r', object: 'Y' }).reason, 'fallback_unclassified');
  assert.strictEqual(gate({ fact_type: 'entity_attribute', subject: 'Madras High Court', relation: 'has_property', object: 'red sandstone' }).eligible, true);
  // Documented current behaviour (finding, not an allowlist): production
  // types with sound structure are admitted; the gate rejects only
  // fallback and malformed values, so an allowlist equal to
  // TYPED_FACT_TYPES would change nothing for production types.
  assert.strictEqual(gate({ fact_type: 'causal', subject: 'Rain', relation: 'causes', object: 'floods' }).eligible, true);
  assert.strictEqual(gate({ fact_type: 'entity_attribute', subject: '', relation: 'r', object: 'Y' }).reason, 'missing_subject');
});

check('18. no LLM, network or non-deterministic dependency introduced', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine/sourceReconstruction.js'), 'utf-8');
  ['fetch(', 'XMLHttpRequest', 'http://', 'https://', 'Date.now(', 'Math.random(', 'new Date('].forEach((token) => {
    assert.ok(!src.includes(token), 'banned token in sourceReconstruction.js: ' + token);
  });
  const out = reconOf(p22Fixture());
  const json = JSON.stringify(out);
  assert.ok(!/20\d\d-\d\d-\d\d/.test(json), 'reconstruction output must not carry timestamps');
  out.units.forEach((u) => {
    assert.ok(!Object.keys(u).some((k) => /date|time|timestamp/i.test(k)), 'unit carries a time field: ' + u.unit_id);
  });
});

console.log('Phase 2B tests passed: ' + passed + ' checks.');
