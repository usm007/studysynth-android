// StudySynth Phase 2E tests — Source Boundary Recovery and Shadow
// Pipeline Telemetry (Workstream A boundary splits, Workstream B
// heading-prose recovery, Workstream C telemetry placement, production
// safety). Self-contained: every fixture is inline. No fixture depends
// on a machine path or on an external PDF (PDF-backed behaviour is
// measured by diagnostics/tools/diagnose_corpus_phase2e.js, whose
// outputs this file verifies; the full corpus run precedes npm test in
// the Phase 2E workflow, as in Phase 2D).
// Run as: node tests/test_phase2e.js (from pwa/) or via npm test.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const Engine = require('../engine/generator.js');
const Recon = require('../engine/sourceReconstruction.js');

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
function factKey(f) {
  return [f.fact_type, f.subject, f.relation, f.object].join('|');
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
function reconOf(blocks, pages) {
  const doc = {
    document_id: 'test-doc',
    blocks: blocks,
    sections: [],
    continuations: [],
    accounting: {},
    reconciliation: {},
    pages: pages || []
  };
  return Recon.reconstructDocument(doc, { documentId: 'test-doc' });
}

// ---- A. Adapter boundary splits (function level) ----

check('A splitPhase2eBoundary exported and splits dangling (see', () => {
  assert.strictEqual(typeof Engine.splitPhase2eBoundary, 'function');
  const split = Engine.splitPhase2eBoundary(
    'The Urals We now travel a little westward to the Ural Mountains (see Mountains are formed by tectonic forces, volcanic activity, and erosion.');
  assert.ok(split);
  assert.strictEqual(split.rule_id, 'R-BND-SEE');
  assert.strictEqual(split.reparseFirst, false);
  assert.strictEqual(split.reparseSecond, true);
  assert.ok(split.second.indexOf('Mountains are formed by') === 0);
});

check('A closed (see Section 3) reference never splits', () => {
  const split = Engine.splitPhase2eBoundary(
    'The temple is described in the guide (see Section 3) The structure was built by Rajaraja Chola I around 1010.');
  assert.strictEqual(split, null);
});

check('A em-dash sentence separator splits, parenthetical double dash does not', () => {
  const split = Engine.splitPhase2eBoundary(
    'Physical maps have their own language that use colours — The Earth is an oblate spheroid.');
  assert.ok(split);
  assert.strictEqual(split.rule_id, 'R-BND-DASH');
  assert.strictEqual(split.second, 'The Earth is an oblate spheroid.');
  const parenthetical = Engine.splitPhase2eBoundary(
    'The capital of India — New Delhi — is a large city with many monuments and gardens.');
  assert.strictEqual(parenthetical, null);
});

check('A lowercase tail splits at the last period+lowercase boundary', () => {
  const split = Engine.splitPhase2eBoundary(
    'The walls and ceilings are inlaid with tiny convex mirrors that sparkle even with the light of a single lamp, creating a starry effect. and palaces of the North, each structure reflected');
  assert.ok(split);
  assert.strictEqual(split.rule_id, 'R-BND-TAIL');
  assert.ok(split.first.endsWith('starry effect.'));
  assert.ok(split.second.indexOf('and palaces of the North') === 0);
  assert.strictEqual(split.reparseFirst, true);
  assert.strictEqual(split.reparseSecond, false);
});

check('A decimal and abbreviation periods never split a tail', () => {
  assert.strictEqual(Engine.splitPhase2eBoundary('The ratio is 3.5 and above the mean value.'), null);
  assert.strictEqual(Engine.splitPhase2eBoundary('See Fig. 1.2 and notes on the map projection method used here.'), null);
});

check('A missing period before The + noun + copula splits; verb-ending head does not', () => {
  // Real firing: Chapter 3 RU-032 "The Golden Temple, Punjab The
  // gurudwara is the place of worship of the Sikhs."
  const split = Engine.splitPhase2eBoundary(
    'Æ The Golden Temple, Punjab The gurudwara is the place of worship of the Sikhs.');
  assert.ok(split);
  assert.strictEqual(split.rule_id, 'R-BND-PERIOD');
  assert.ok(split.first.endsWith('Punjab'));
  assert.ok(split.second.indexOf('The gurudwara is the place of worship') === 0);
  // Diacritic names must not break the noun-phrase match.
  const diacritic = Engine.splitPhase2eBoundary(
    'Traditional storytelling was also accompanied by song, dance and drama, varying from region to region, such as puppetry The traditional themes of the paṭṭachitra were usually scenes from the Rāmāyaṇa, Mahābhārata and the Purāṇās.');
  assert.ok(diacritic);
  assert.strictEqual(diacritic.rule_id, 'R-BND-PERIOD');
  assert.strictEqual(Engine.splitPhase2eBoundary('He visited The Hague was beautiful and old.'), null);
});

// ---- B. Adapter boundary splits (fact level, no duplicates) ----

check('B dangling-see split recovers the Mountains fact and nothing else', () => {
  const r = run([unit('RU-089', 'body_prose',
    'The Urals We now travel a little westward to the Ural Mountains (see Mountains are formed by tectonic forces, volcanic activity, and erosion.')]);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.strictEqual(r.typed_facts[0].fact_type, 'entity_attribute');
  assert.strictEqual(r.typed_facts[0].subject, 'Mountains');
  assert.strictEqual(r.typed_facts[0].object, 'formed by tectonic forces, volcanic activity, and erosion');
  assert.strictEqual(r.typed_facts[0].classification.method, 'phase2e_boundary_reparse');
  assert.strictEqual(r.unparsed_units.length, 1);
  assert.ok(r.unparsed_units[0].original_text.indexOf('(see') !== -1);
});

check('B dash split recovers the oblate fact and leaves the head unparsed', () => {
  const r = run([unit('RU-006', 'body_prose',
    'Physical maps have their own language that use colours — The Earth is an oblate spheroid.')]);
  const oblate = r.typed_facts.filter((f) => f.subject === 'The Earth' && f.object === 'oblate spheroid');
  assert.strictEqual(oblate.length, 1);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.ok(r.unparsed_units.some((u) => u.original_text.indexOf('Physical maps have their own language') === 0));
});

check('B lowercase-tail split recovers the mirrors membership fact', () => {
  const r = run([unit('RU-139', 'body_prose',
    'The walls and ceilings are inlaid with tiny convex mirrors that sparkle even with the light of a single lamp, creating a starry effect. and palaces of the North, each structure reflected')]);
  const mirrors = r.typed_facts.filter((f) => f.fact_type === 'membership'
    && /walls and ceilings/i.test(f.subject) && /convex mirrors/i.test(f.object));
  assert.strictEqual(mirrors.length, 1);
  assert.strictEqual(r.typed_facts.length, 1);
  assert.ok(r.unparsed_units.some((u) => u.original_text.indexOf('and palaces of the North') === 0));
});

check('B missing-period split recovers the paṭṭachitra fact exactly once', () => {
  const r = run([unit('RU-036', 'body_prose',
    'Traditional storytelling was also accompanied by song, dance and drama, varying from region to region, such as puppetry The traditional themes of the paṭṭachitra were usually scenes from the Rāmāyaṇa, Mahābhārata and the Purāṇās.')]);
  const facts = r.typed_facts.filter((f) => /paṭṭachitra/i.test(f.subject) && /scenes from/i.test(f.object));
  assert.strictEqual(facts.length, 1);
  assert.strictEqual(facts[0].fact_type, 'entity_attribute');
  assert.strictEqual(r.typed_facts.length, 1);
});

check('B discourse connective This is why is never pronoun-resolved', () => {
  const r = run([unit('RU-006', 'body_prose',
    'The Earth is an oblate spheroid. This is why all maps have some distortion.')]);
  assert.ok(!r.typed_facts.some((f) => /why all maps/i.test(f.object || '')));
  assert.ok(r.unparsed_units.some((u) => u.original_text.indexOf('This is why all maps') === 0));
});

// ---- C. No false facts from labels, chart values, map scale, running titles ----

check('C legend text, chart axes, map scale and running titles yield no facts', () => {
  const r = run([
    unit('RU-001', 'body_prose', 'Blue: water bodies (oceans, seas, lakes, rivers); Green: plains; Yellow/Brown: plateaus; Dark brown: high mountains; Light yellow: deserts; White: ice and glaciers'),
    unit('RU-002', 'body_prose', '1919 1924 1929 1934 1939 1944 1949 1954 1959 1964 1969 1974 1979 1984 1989 1994 1999 2004 2009 2014 2019 2024'),
    unit('RU-003', 'body_prose', '1000 2,000 km'),
    unit('RU-004', 'body_prose', 'Exploring Society: India and Beyond | Grade 8 Part 2')
  ]);
  assert.strictEqual(r.typed_facts.length, 0);
});

check('C adapter runs deterministically on the boundary fixture set', () => {
  const units = [
    unit('RU-001', 'body_prose', 'The walls and ceilings are inlaid with tiny convex mirrors that sparkle even with the light of a single lamp, creating a starry effect. and palaces of the North, each structure reflected'),
    unit('RU-002', 'body_prose', 'Physical maps have their own language that use colours — The Earth is an oblate spheroid.'),
    unit('RU-003', 'body_prose', 'Traditional storytelling was also accompanied by song, dance and drama, varying from region to region, such as puppetry The traditional themes of the paṭṭachitra were usually scenes from the Rāmāyaṇa, Mahābhārata and the Purāṇās.')
  ];
  const a = run(units);
  const b = run(units);
  assert.deepStrictEqual(a.typed_facts.map(factKey).sort(), b.typed_facts.map(factKey).sort());
  assert.deepStrictEqual(
    a.unparsed_units.map((u) => u.unparsed_id + '|' + u.reason).sort(),
    b.unparsed_units.map((u) => u.unparsed_id + '|' + u.reason).sort());
});

// ---- D. Reconstruction: legend, leading run, margin label, duplicate label ----

check('D whole-block legend is excluded, never joined into prose', () => {
  const out = reconOf([
    B('p2-b2', 'body', 'Blue: water bodies (oceans, seas, lakes, rivers); Green: plains; Yellow/Brown: plateaus; Dark brown: high mountains; Light yellow: deserts; White: ice and glaciers', 208.44, 329.08, 300, 76.51),
    B('p2-b11', 'body', 'The Earth is an oblate spheroid. When we draw a map, we try to show the Earth on a flat surface.', 85.8, 450, 367, 40)
  ]);
  assert.ok(out.exclusions.some((e) => e.block_id === 'p2-b2' && e.reason === 'legend_block'));
  const prose = out.units.filter((u) => u.type === 'body_prose');
  assert.ok(prose.every((u) => u.text.indexOf('Blue: water bodies') === -1));
  assert.ok(prose.some((u) => u.text.indexOf('The Earth is an oblate spheroid') !== -1));
  assert.strictEqual(out.reconciliation.ok, true);
});

check('D legitimate prose with one colon pair and terminal punctuation survives', () => {
  const out = reconOf([
    B('p2-b11', 'body', 'The result is: water covers most of the Earth. The oceans hold most of the water.', 85.8, 450, 367, 40)
  ]);
  assert.ok(!out.exclusions.some((e) => e.block_id === 'p2-b11'));
  assert.ok(out.units.some((u) => u.text.indexOf('The result is: water covers most of the Earth') !== -1));
});

check('D leading map/scale run is excluded and the body sentence stays clean', () => {
  // The real p26 map-label blocks are table-typed (the callout-banner
  // rule only claims fragment/ambiguous blocks), so the fixture uses
  // table types to exercise the leading-run rule itself, as the real
  // page does. The numeric fragment has digits, so callout-banner
  // (no-digits guard) does not claim it either.
  const out = reconOf([
    B('p26-b13', 'table', 'LAKES LAKES', 100, 100, 80, 12),
    B('p26-b14', 'table', 'A A', 100, 120, 40, 12),
    B('p26-b29', 'fragment', '1000 2,000 km', 100, 140, 80, 12),
    B('p26-b41', 'body', 'The Colorado Plateau is a large highland region in the southwestern United States.', 183, 160, 367, 40)
  ]);
  const unit = out.units.find((u) => u.text.indexOf('The Colorado Plateau is a large highland region') !== -1);
  assert.ok(unit);
  assert.ok(unit.text.indexOf('LAKES') === -1);
  assert.ok(unit.text.indexOf('2,000 km') === -1);
  assert.deepStrictEqual(
    unit.fragments_excluded.filter((f) => f.reason === 'leading_artifact_run').map((f) => f.block_id).sort(),
    ['p26-b13', 'p26-b14', 'p26-b29']);
  assert.strictEqual(out.reconciliation.ok, true);
});

check('D shattered prose with auxiliaries is NOT excluded as a leading run', () => {
  const out = reconOf([
    B('p14-b3', 'fragment', 'Wells', 410, 151, 30, 12),
    B('p14-b4', 'fragment', 'have', 468, 151, 27, 12),
    B('p14-b5', 'fragment', 'been', 522, 151, 27, 12),
    B('p14-b22', 'body', 'constructed in many sizes and shapes from bricks and stones.', 183, 170, 367, 40)
  ]);
  assert.ok(!out.exclusions.some((e) => ['p14-b3', 'p14-b4', 'p14-b5'].indexOf(e.block_id) !== -1));
  const unit = out.units.find((u) => u.block_ids.indexOf('p14-b22') !== -1);
  assert.ok(unit);
  assert.ok(unit.text.indexOf('Wells') !== -1);
  assert.ok(unit.text.indexOf('have') !== -1);
});

check('D margin label excluded, margin continuations survive', () => {
  // Mid-passage label: the leading-run rule cannot apply, and the
  // gloss rule cannot apply either (the y-ordered margin cluster
  // starts with a lowercase continuation, so no Term: match). The
  // body column starts at x=183; the label sits entirely left of it.
  const out = reconOf([
    B('p4-b10', 'body', 'The ocean is a vast body of saltwater covering about 71 per cent of the Earth’s surface.', 183, 100, 367, 40),
    B('p4-b2', 'fragment', 'and use sunlight', 108.88, 130, 70, 12),
    B('p4-b15', 'fragment', 'Plankton:', 108.88, 160, 48.43, 12),
    B('p4-b12', 'body', 'Oceans give us almost half the oxygen we breathe.', 183, 200, 367, 40)
  ]);
  assert.ok(out.exclusions.some((e) => e.block_id === 'p4-b15' && e.reason === 'margin_label'));
  const ocean = out.units.find((u) => u.text.indexOf('The ocean is a vast body') !== -1);
  assert.ok(ocean);
  assert.ok(ocean.text.indexOf('Plankton:') === -1);
  assert.ok(ocean.text.indexOf('and use sunlight') !== -1);
  assert.ok(!out.exclusions.some((e) => e.block_id === 'p4-b2'));
});

check('D duplicate label excluded, body sentence keeps its single subject', () => {
  const out = reconOf([
    B('p7-b2', 'body', 'spreading the message of bhakti?', 183, 100, 367, 12),
    B('p7-b3', 'fragment', 'Sufism', 108, 120, 50, 12),
    B('p7-b19', 'body', 'Sufism is a path of Islam that focuses on devotion, and an inner and personal search for god.', 183, 140, 367, 40)
  ]);
  assert.ok(out.exclusions.some((e) => e.block_id === 'p7-b3' && e.reason === 'duplicate_label'));
  const r = run(out.units.filter((u) => u.type === 'body_prose'));
  assert.ok(r.typed_facts.some((f) => f.subject === 'Sufism' && /path of Islam/i.test(f.object || '')));
  assert.ok(!r.typed_facts.some((f) => /Sufism Sufism/.test(f.subject || '')));
});

check('D gutter epsilon keeps sub-point-overshooting columns apart', () => {
  const pages = [{ page: 16, layout_stats: { gutter: { gapStart: 242.7277, gapEnd: 270.84 } } }];
  const out = reconOf([
    B('p16-b7', 'body', 'The Urals are rich in mineral resources, including iron ore and copper.', 270.84, 436, 280, 40),
    B('p16-b11', 'fragment', 'and methane.', 176.71, 532, 66, 12),
    B('p16-b12', 'body', 'As global warming causes the planet to heat up, the permafrost melts.', 119.34, 550, 123, 40)
  ], pages);
  const prose = out.units.filter((u) => u.type === 'body_prose');
  assert.strictEqual(prose.length, 2);
  assert.ok(prose.some((u) => u.text.indexOf('The Urals are rich') !== -1 && u.text.indexOf('methane') === -1));
  assert.ok(prose.some((u) => u.text.indexOf('and methane') !== -1));
  assert.strictEqual(out.reconciliation.ok, true);
});

// ---- E. Reconstruction: heading-prose recovery + genuine-heading controls ----

function headingFixture() {
  return [
    B('p5-b9', 'body', 'The oceans cover most of the Earth. They hold almost all of the water on the planet.', 85.8, 500, 367, 40),
    B('p5-b11', 'heading', 'Oceans are constantly moving! Ocean currents are like giant', 85.8, 579.32, 367.16, 12, 'docsec_016'),
    B('p5-b12', 'heading', 'rivers flowing through the ocean. They can be:', 85.8, 596, 367, 12, 'docsec_016'),
    B('p9-b29', 'heading', 'The Suez Canal is a human-made passage (opened in 1869)', 85.8, 637.58, 367.2, 12, 'docsec_030'),
    B('p9-b31', 'heading', 'connecting the Red Sea with the Mediterranean, creating a', 85.8, 654, 367, 12, 'docsec_031'),
    B('p9-b32', 'heading', 'waterway from the Indian Ocean to Europe.', 85.8, 671, 367, 12, 'docsec_032')
  ];
}

check('E heading-prose runs recover as body_prose with provenance and flags', () => {
  const out = reconOf(headingFixture());
  const recovered = out.units.filter((u) => u.rule_id === 'reconstruct-v2e/heading-prose');
  assert.strictEqual(recovered.length, 2);
  const oceans = recovered.find((u) => u.text.indexOf('Oceans are constantly moving!') !== -1);
  assert.ok(oceans);
  assert.deepStrictEqual(oceans.block_ids, ['p5-b11', 'p5-b12']);
  assert.ok(oceans.provenance.every((p) => p.bbox && Number.isFinite(p.bbox.x)));
  const suez = recovered.find((u) => u.text.indexOf('The Suez Canal is a human-made passage') !== -1);
  assert.ok(suez);
  assert.deepStrictEqual(suez.block_ids, ['p9-b29', 'p9-b31', 'p9-b32']);
  assert.ok(suez.review_flags.indexOf('heading_run_sections_disagree') !== -1);
  assert.strictEqual(out.reconciliation.ok, true);
});

check('E genuine headings never become prose', () => {
  const out = reconOf([
    B('p3-b1', 'body', 'The chapter describes many buildings. They stand across the country.', 85.8, 100, 367, 40),
    B('p3-b2', 'heading', 'Colonial Architecture', 85.8, 200, 200, 17, 'docsec_005'),
    B('p3-b3', 'heading', 'Ocean currents', 85.8, 300, 150, 15, 'docsec_006'),
    B('p3-b4', 'heading', 'The oceans', 99.984, 400, 120, 12, 'docsec_007')
  ]);
  assert.ok(!out.units.some((u) => u.rule_id === 'reconstruct-v2e/heading-prose'));
  assert.ok(!out.units.some((u) => u.type === 'body_prose' && u.text.indexOf('Colonial Architecture') !== -1));
});

check('E recovered heading prose types facts through the adapter', () => {
  const out = reconOf(headingFixture());
  const r = run(out.units.filter((u) => u.rule_id === 'reconstruct-v2e/heading-prose'));
  assert.ok(r.typed_facts.some((f) => f.subject === 'Oceans' && /constantly moving/i.test(f.object || '')));
  assert.ok(r.typed_facts.some((f) => /Suez Canal/i.test(f.subject || '') && /human-made passage/i.test(f.object || '')));
});

check('E block accounting: every fixture block in exactly one bucket', () => {
  const blocks = headingFixture();
  const out = reconOf(blocks);
  assert.strictEqual(out.reconciliation.ok, true);
  const seen = {};
  out.units.forEach((u) => {
    u.block_ids.forEach((id) => {
      assert.ok(!seen[id], 'block counted twice: ' + id);
      seen[id] = true;
    });
  });
  out.exclusions.forEach((e) => {
    assert.ok(!seen[e.block_id], 'excluded block also in a unit: ' + e.block_id);
    seen[e.block_id] = true;
  });
  blocks.forEach((b) => {
    assert.ok(seen[b.source_block_id], 'block unaccounted: ' + b.source_block_id);
  });
});

// ---- F. Production safety, batch placement, corpus outputs ----

check('F production banks, manifest and consolidated file byte-identical', () => {
  const repo = path.join(__dirname, '..', '..');
  // All hashes are the Phase 2D delegation baseline, verified unchanged
  // on disk before Phase 2E work began.
  const expected = {
    'pwa/data/ncert_8_2_staged/hees201_world_geography.md': 'a36d62162871fd4764be42ea58d43eeff860fcd17412d445d0992c10dd7e18ea',
    'pwa/data/ncert_8_2_staged/hees202_indias_road_to_independence.md': '04de0e0cee2e29ab84657b3bee3e3db4e3fb987dad6338b776c0549ec0ad53a8',
    'pwa/data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md': '94e18899dd5569f4d830fbb4a47885fce8a839c27eb5deaffb6f8026cb15bbc4',
    'pwa/data/ncert_8_2_staged/hees204_judiciary_in_our_society.md': '6a6f13bf3b7fdf005eaa50292efc95041798056ef5191fddba88d5b9c309f46d',
    'pwa/data/ncert_8_2_staged/hees205_citizenship_rights_and_duties.md': 'c49532ae8fc357324fe8b703920c3ae53e476b3916fcc0b544e37c448ac43497',
    'pwa/data/ncert_8_2_staged/hees206_dynamics_of_population.md': '95fe993b0b08fd0e08fe9cd97d22bdced598dc3074b2161d116bc552e2f9cd10',
    'pwa/data/ncert_8_2_staged/hees207_indias_urban_landscape.md': '25b0de908d09ac2a80cb2d54e8a446fc0a0fb297ae13e3f51f56875932767ce3',
    'pwa/data/ncert_8_2_staged/hees209_cultural_currents_13th_to_17th_centuries.md': '0d93b8fc0f8c0b9e8fbf29de1af1619dd14eb9ec4f6b42e642de55ea4b09ba59',
    'pwa/data/ncert_8_2_staged/summary_manifest.json': '2a17f7b1b7dba7bbf426e66e96ab26f5315ef9a3dedf7b6ea939a6facc6a3669',
    'pwa/data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md': 'b454e919c549c614aebdbc6529bc49c4a750b3b3f11652f0866928bf61ea0c87'
  };
  Object.keys(expected).forEach((rel) => {
    const full = path.join(repo, rel);
    assert.ok(fs.existsSync(full), 'missing: ' + rel);
    const buf = fs.readFileSync(full);
    assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), expected[rel], 'hash mismatch: ' + rel);
  });
});

check('F batch --shadow-telemetry branch precedes all bank writes', () => {
  const src = fs.readFileSync(path.join(__dirname, 'batch_generate_all_ncert.js'), 'utf-8');
  const flagAt = src.indexOf('--shadow-telemetry');
  const stagedAt = src.indexOf('const outDirStaged');
  assert.ok(flagAt !== -1, 'flag missing from batch script');
  assert.ok(flagAt < stagedAt, 'telemetry branch must precede staged-dir creation');
  const branch = src.slice(flagAt, stagedAt);
  assert.ok(branch.indexOf('diagnose_corpus_phase2e') !== -1, 'branch must call the shared harness');
  assert.ok(branch.indexOf('return;') !== -1, 'branch must return before the production loop');
  assert.ok(branch.indexOf('outDirStaged') === -1, 'branch must not reference staged output');
});

check('F Phase 2E corpus outputs exist, deterministic, reconciled, Chapter 3 gated', () => {
  const repo = path.join(__dirname, '..', '..');
  const metrics = JSON.parse(fs.readFileSync(path.join(repo, 'diagnostics/corpus_phase2e_metrics.json'), 'utf-8'));
  assert.strictEqual(metrics.version, 'phase2e-1');
  assert.strictEqual(metrics.aggregate.chapters_complete, 8);
  assert.strictEqual(metrics.aggregate.all_deterministic, true);
  assert.strictEqual(metrics.aggregate.all_reconciled, true);
  const ch3 = metrics.chapters.find((c) => c.chapter === 'hees203');
  assert.ok(ch3);
  assert.strictEqual(ch3.status, 'complete');
  // Chapter 3 gate: zero losses against the layer baseline, and exactly
  // one genuine gain over Phase 2D (40 raw / 39 unique -> 41 / 40):
  // the R-BND-PERIOD recovery of "The gurudwara is the place of
  // worship of the Sikhs." from the fused "The Golden Temple, Punjab
  // The gurudwara ..." segment in RU-032. No Phase 2E case is in
  // Chapter 3, but the missing-period rule demonstrably fires there on
  // a genuine sentence; the gain is recorded, not hidden, and the
  // inventory (160 entries / 143 denominator) is untouched.
  assert.strictEqual(ch3.comparison_vs_baseline_strict_keys.lost, 0);
  assert.strictEqual(ch3.shadow_adapter_2e.raw_total, 41);
  assert.strictEqual(ch3.shadow_adapter_2e.unique_total, 40);
  const comparison = JSON.parse(fs.readFileSync(path.join(repo, 'diagnostics/corpus_phase2e_fact_comparison.json'), 'utf-8'));
  assert.strictEqual(comparison.version, 'phase2e-1');
  assert.strictEqual(comparison.aggregate.chapters_complete, 8);
});

check('F Phase 2B V2 comparison artifact untouched', () => {
  const repo = path.join(__dirname, '..', '..');
  const buf = fs.readFileSync(path.join(repo, 'diagnostics/v2_cross_chapter_comparison_phase2b.json'));
  assert.strictEqual(
    crypto.createHash('sha256').update(buf).digest('hex'),
    '89d3aac1c60f3cd8e5f17bc2852276010f1bfa64d418b1914473ba4406a5f3b9');
});

console.log('Phase 2E tests passed: ' + passed + ' checks.');
