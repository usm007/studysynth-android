/**
 * StudySynth Lite — Repair 002 regression suite.
 *
 * Locks the semantic-integrity repairs in place:
 * 1. Geometry-aware layout extraction and block typing (body only as prose).
 * 2. Assertion-only fact extraction (questions, prompts, captions never donate facts).
 * 3. Numeric direction and sign association (no cross-sentence value reuse).
 * 4. Production reasoning operator allowlist.
 * 5. Distractor integrity (four distinct, safe, source-typed options).
 * 6. Offline load order for the reasoning modules.
 * 7. Batch output isolation under ncert_8_2_repair_002.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Engine = require('../engine/generator.js');
const DocParser = require('../engine/pdfParser.js');
const EngineV2 = require('../engine/reasoning/engine_v2.js');
const Linguistics = EngineV2.Linguistics;

console.log('--- Running StudySynth Lite Repair 002 Regression Suite ---');

const PWA_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(PWA_ROOT, '..');
const REPAIR_DIR = path.join(PWA_ROOT, 'data', 'ncert_8_2_repair_002');

const FILLER_PHRASES = [
  'in accordance with statutory guidelines',
  'under applicable norms',
  'nodal oversight of competent statutory authority',
  'regulatory framework is strictly deferred',
  'jurisdiction applies exclusively to foreign commercial enterprises',
  'provisions are restricted to emergency measures'
];

function normalize(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFixture(text, title) {
  const sections = Engine.parseRawDocument(text, title || 'Fixture');
  const facts = Engine.extractSourceFacts(sections);
  const conflictResult = Engine.detectFactConflicts(facts);
  const inventory = Engine.buildKnowledgeInventory(sections, {
    facts: conflictResult.facts,
    conflicts: conflictResult.conflicts
  });
  return { sections, facts: conflictResult.facts, conflicts: conflictResult.conflicts, inventory };
}

function generateBank(text, title, targetCount) {
  const fixture = buildFixture(text, title);
  const bank = Engine.generateQuestionBank(fixture.inventory, {
    targetCount: targetCount || 15,
    sections: fixture.sections,
    facts: fixture.facts,
    conflicts: fixture.conflicts
  });
  return Object.assign({ bank }, fixture);
}

function textItem(str, x, y, width, height, options) {
  const opts = options || {};
  const transform = opts.rotated ? [0, 1, -1, 0, x, y] : [1, 0, 0, 1, x, y];
  return {
    str,
    transform,
    width,
    height,
    fontName: opts.font || 'g_d0_f1'
  };
}

// =========================================================================
// 1. Layout extraction: block types and body-only prose
// =========================================================================
console.log('\n[Suite 1] Geometry-aware layout extraction...');
{
  const viewport = {
    width: 600,
    height: 800,
    convertToViewportPoint: (x, y) => [x, y]
  };
  const content = {
    items: [
      textItem('World Geography', 72, 100, 220, 14),
      textItem('The Ganges is a major river that flows across the northern plains of India.', 72, 140, 470, 14),
      textItem('Its basin supports millions of people who depend on farming and fishing.', 72, 156, 470, 14),
      textItem('Figure 1.2: The Ganges basin', 72, 200, 220, 12),
      textItem('River Ganges length 2525 kilometres', 72, 250, 300, 12),
      textItem('River Yamuna length 1376 kilometres', 72, 264, 300, 12),
      textItem('River Brahmaputra length 2900 kilometres', 72, 278, 300, 12),
      textItem('ASIA', 72, 330, 60, 12),
      textItem('Himalaya', 520, 380, 80, 12, { rotated: true }),
      textItem('alpha beta', 520, 440, 55, 11),
      textItem('gamma delta', 520, 452, 55, 11),
      textItem('epsilon zeta', 520, 464, 55, 11),
      textItem('eta theta', 520, 476, 55, 11),
      textItem('See figure 4 for details about the northern plains and their rivers.', 72, 540, 420, 13),
      textItem('42', 300, 780, 20, 12)
    ]
  };

  const page = DocParser.extractPageLayout(content, viewport, 1);
  const types = new Set(page.blocks.map((block) => block.type));

  for (const block of page.blocks) {
    assert(DocParser.BLOCK_TYPES.indexOf(block.type) !== -1, `Unknown block type: ${block.type}`);
  }
  for (const expected of ['body', 'heading', 'caption', 'table', 'diagram', 'page_furniture', 'fragment', 'ambiguous']) {
    assert(types.has(expected), `Layout classification missed "${expected}" (saw ${Array.from(types).join(', ')})`);
  }

  assert(page.stats.bodyBlockCount >= 1, 'A prose block must be classified as body');
  assert(/Ganges is a major river/.test(page.bodyText), 'Body prose must reach bodyText');
  assert(/basin supports millions/.test(page.bodyText), 'Wrapped body line must reach bodyText');
  assert(!/World Geography/.test(page.bodyText), 'Headings must never become body prose');
  assert(!/Figure 1\.2/.test(page.bodyText), 'Captions must never become body prose');
  assert(!/River Ganges length/.test(page.bodyText), 'Table cells must never become body prose');
  assert(!/ASIA/.test(page.bodyText), 'Diagram labels must never become body prose');
  assert(!/alpha beta/.test(page.bodyText), 'Sidebar fragments must never become body prose');
  assert(!/See figure 4/.test(page.bodyText), 'Ambiguous blocks must never become body prose');
  assert(!/^\s*42\s*$/.test(page.bodyText), 'Page furniture must never become body prose');

  const furniture = page.blocks.filter((block) => block.type === 'page_furniture');
  assert(furniture.length >= 1 && /42/.test(furniture[0].text), 'Page number must be page_furniture');
  console.log('  ✓ Eight block types classified; bodyText contains prose only.');
}

// =========================================================================
// 2. Layout extraction: genuine two-column reading order
// =========================================================================
console.log('\n[Suite 2] Column-aware reading order...');
{
  const viewport = {
    width: 600,
    height: 800,
    convertToViewportPoint: (x, y) => [x, y]
  };
  const left = [
    'Left column sentence number one is written right here on the page.',
    'Left column sentence number two is written right here on the page.',
    'Left column sentence number three is written right here on the page.',
    'Left column sentence number four is written right here on the page.',
    'Left column sentence number five is written right here on the page.',
    'Left column sentence number six is written right here on the page.'
  ];
  const right = [
    'Right column sentence number one is written right here on the page.',
    'Right column sentence number two is written right here on the page.',
    'Right column sentence number three is written right here on the page.',
    'Right column sentence number four is written right here on the page.',
    'Right column sentence number five is written right here on the page.',
    'Right column sentence number six is written right here on the page.'
  ];
  const items = [];
  left.forEach((line, index) => {
    items.push(textItem(line, 60, 100 + index * 40, 220, 14));
  });
  right.forEach((line, index) => {
    items.push(textItem(line, 320, 100 + index * 40, 220, 14));
  });

  const page = DocParser.extractPageLayout({ items }, viewport, 1);
  assert(page.stats.gutter, 'A genuine column gutter must be detected from geometry');
  assert(page.bodyText.indexOf('Left column sentence number one') < page.bodyText.indexOf('Right column sentence number one'),
    'Left column must be read before the right column');
  console.log('  ✓ Column gutter detected; left column read before right.');
}

// =========================================================================
// 3. Assertion-only fact extraction
// =========================================================================
console.log('\n[Suite 3] Assertion-only fact extraction...');
{
  const fixture = buildFixture(
    'The Ganges is a major river in India. What is the length of the Ganges? ' +
    'Read the following passage carefully. Figure 1.2: The Ganges basin. ' +
    'The Ganges flows eastward across the northern plains.',
    'Rivers'
  );

  assert(fixture.facts.length >= 1, 'A declarative assertion must still donate facts');
  for (const fact of fixture.facts) {
    assert.strictEqual(fact.sentence_role, 'assertion', `${fact.fact_id}: only assertions may donate facts`);
    assert(!/what is the length/i.test(fact.supporting_excerpt), 'A question must never donate a fact');
    assert(!/read the following/i.test(fact.supporting_excerpt), 'An instruction must never donate a fact');
    assert(!/figure 1\.2/i.test(fact.supporting_excerpt), 'A caption must never donate a fact');
  }
  assert(fixture.facts.some((fact) => /Ganges is a major river/i.test(fact.supporting_excerpt)),
    'The declarative sentence must be extracted');

  assert.strictEqual(Linguistics.classifySentenceRole('What is the length of the Ganges?'), 'question');
  assert.strictEqual(Linguistics.classifySentenceRole('Read the following passage carefully.'), 'instruction');
  assert.strictEqual(Linguistics.classifySentenceRole('Figure 1.2: The Ganges basin'), 'caption');
  assert.strictEqual(Linguistics.classifySentenceRole('The Ganges is a major river in India.'), 'assertion');
  console.log('  ✓ Questions, instructions and captions are excluded; assertions survive.');
}

// =========================================================================
// 4. Numeric direction and sign association
// =========================================================================
console.log('\n[Suite 4] Numeric direction and sign association...');
{
  // A value range must never be re-used as the subject of the other value.
  const rangeFixture = buildFixture(
    'The temperature varies from 40°C during the day to 5°C at night.',
    'Climate'
  );
  const rangeNumeric = rangeFixture.facts.filter((fact) => fact.fact_type === 'numeric');
  assert(!rangeNumeric.some((fact) => /\b40\b/.test(fact.subject)),
    'A numeric subject must never contain the other value from the same range');
  assert(!rangeNumeric.some((fact) => /40°C during the day/i.test(fact.subject)),
    'A numeric subject must never be "40°C during the day" when the answer is "5°C"');

  // Directional extent keeps the measured axis.
  const plateau = generateBank(
    'The Tibetan Plateau is the highest and largest plateau on Earth. ' +
    'The plateau stretches about 2,500 km from east to west and 1,000 km from north to south, ' +
    'with an average height of over 4,500 metres above sea level.',
    'Plateaus',
    15
  );
  const northSouth = plateau.facts.find((fact) =>
    fact.fact_type === 'numeric' && /north-south extent$/i.test(fact.subject));
  assert(northSouth, 'Directional extent must keep the north-south axis');
  assert.strictEqual(northSouth.object, '1,000 km');
  const northSouthQuestion = plateau.bank.find((question) => /north-south extent/i.test(question.stem));
  assert(northSouthQuestion, 'The north-south extent must be asked as a numeric question');
  assert.strictEqual(
    northSouthQuestion.options.find((option) => option.is_correct).text,
    '1,000 km',
    'The north-south question must answer 1,000 km'
  );

  // Sign is recorded, not silently dropped.
  const minus = buildFixture('The temperature dropped to minus 30°C at night.', 'Climate');
  const minusFact = minus.facts.find((fact) => fact.fact_type === 'numeric');
  assert(minusFact, 'A signed measurement must still be extracted');
  assert.strictEqual(minusFact.polarity, 'negative', '"minus 30°C" must be negative');

  const belowZero = buildFixture('The temperature fell to 5°C below zero during the night.', 'Climate');
  const belowFact = belowZero.facts.find((fact) => fact.fact_type === 'numeric');
  assert(belowFact, 'A below-zero measurement must still be extracted');
  assert.strictEqual(belowFact.polarity, 'negative', '"below zero" must be negative');

  const rawMinus = buildFixture('In winter the temperature can fall to -40°C in the Gobi Desert.', 'Climate');
  const rawMinusFact = rawMinus.facts.find((fact) => fact.fact_type === 'numeric');
  assert(rawMinusFact, 'A raw negative measurement must still be extracted');
  assert.strictEqual(rawMinusFact.polarity, 'negative', '"-40°C" must be negative');
  console.log('  ✓ Range values are not cross-associated; direction and sign are preserved.');
}

// =========================================================================
// 5. Production reasoning operator allowlist
// =========================================================================
console.log('\n[Suite 5] Production reasoning operator allowlist...');
{
  const expected = [
    'OP_B_CAUSAL_EXPLANATION',
    'OP_C_CAUSAL_CHAIN',
    'OP_F_PROCESS_SEQUENCE',
    'OP_H_CATEGORY_INFERENCE',
    'OP_I_EXCEPTION_REASONING',
    'OP_J_CONTRASTIVE_EXPLANATION'
  ];
  assert.deepStrictEqual(EngineV2.PRODUCTION_OPERATORS.slice(), expected,
    'Only the six proven operators may publish questions');

  const sections = Engine.parseRawDocument(
    'Photosynthesis is the process by which green plants make food using sunlight. ' +
    'Chlorophyll absorbs light energy. The light reactions produce oxygen and ATP. ' +
    'The Calvin cycle fixes carbon dioxide into glucose. ' +
    'Mitochondria release energy through cellular respiration. ' +
    'Cellular respiration produces carbon dioxide and water. ' +
    'C3 plants exhibit the carbon pathway in cooler regions, whereas C4 plants exhibit the carbon pathway in hot regions. ' +
    'If stomata close, then transpiration stops.',
    'Biology'
  );
  const facts = Engine.extractSourceFacts(sections);
  const propositions = EngineV2.Representation.compileSemanticRepresentation(sections, facts).propositions;
  const graph = EngineV2.GraphModule.buildGraphFromPropositions(propositions);
  const candidates = EngineV2.generateReasoningCandidates(graph, {
    facts,
    sections,
    sourceTitle: 'Biology'
  });

  assert(candidates.length > 0, 'The allowlisted operators must still produce candidates');
  for (const candidate of candidates) {
    assert(expected.indexOf(candidate.primary_operator) !== -1,
      `Disabled operator published a candidate: ${candidate.primary_operator}`);
  }

  const v2Bank = EngineV2.generateReasoningQuestionBank(sections, { facts, targetCount: 5 });
  for (const question of v2Bank) {
    assert(expected.indexOf(question.primary_operator) !== -1,
      `Disabled operator published a question: ${question.primary_operator}`);
    assert.strictEqual(question.verification.status, 'verified',
      'Only proof-validated V2 questions may be published');
  }
  console.log('  ✓ Candidate generation and publication are restricted to OP_B, C, F, H, I, J.');
}

// =========================================================================
// 6. Distractor integrity
// =========================================================================
console.log('\n[Suite 6] Distractor integrity...');
{
  const generated = generateBank(
    'Photosynthesis is the process by which green plants make food using sunlight. ' +
    'Chlorophyll absorbs light energy. The light reactions produce oxygen and ATP. ' +
    'The Calvin cycle fixes carbon dioxide into glucose. ' +
    'Mitochondria release energy through cellular respiration. ' +
    'Cellular respiration produces carbon dioxide and water.',
    'Biology',
    10
  );

  assert(generated.bank.length >= 1, 'The fixture must produce questions');
  const seenStems = new Set();
  for (const question of generated.bank) {
    const options = question.options || [];
    assert.strictEqual(options.length, 4, `${question.id}: exactly four options are required`);
    assert.strictEqual(options.filter((option) => option.is_correct === true).length, 1,
      `${question.id}: exactly one option must be correct`);
    assert.strictEqual(options.filter((option) => option.key === question.answer_key).length, 1,
      `${question.id}: answer_key must select exactly one option`);

    const normalizedOptions = options.map((option) => normalize(option.text));
    assert.strictEqual(new Set(normalizedOptions).size, 4, `${question.id}: options must be distinct`);

    for (const option of options) {
      const text = String(option.text || '').trim();
      assert(text.length >= 2, `${question.id}: empty option text`);
      assert(Linguistics.isSafeSpan(text, 140), `${question.id}: unsafe option span "${text}"`);
      for (const filler of FILLER_PHRASES) {
        assert(!normalize(text).includes(normalize(filler)),
          `${question.id}: controlled filler leaked into options ("${filler}")`);
      }
    }

    const stemKey = normalize(question.stem);
    assert(!seenStems.has(stemKey), `${question.id}: duplicate stem "${question.stem}"`);
    seenStems.add(stemKey);
  }
  console.log('  ✓ Every question has four distinct, safe, non-filler options and one answer.');
}

// =========================================================================
// 7. Offline load order
// =========================================================================
console.log('\n[Suite 7] Offline reasoning module load order...');
{
  const reasoningModules = [
    'engine/reasoning/types.js',
    'engine/reasoning/linguistics.js',
    'engine/reasoning/representation.js',
    'engine/reasoning/graph.js',
    'engine/reasoning/operators.js',
    'engine/reasoning/distractors.js',
    'engine/reasoning/constructors.js',
    'engine/reasoning/validator.js',
    'engine/reasoning/ranking.js',
    'engine/reasoning/engine_v2.js'
  ];

  const indexHtml = fs.readFileSync(path.join(PWA_ROOT, 'index.html'), 'utf8');
  const generatorAt = indexHtml.indexOf('./engine/generator.js');
  assert(generatorAt !== -1, 'index.html must load the generator');
  for (const modulePath of reasoningModules) {
    const at = indexHtml.indexOf('./' + modulePath);
    assert(at !== -1, `index.html is missing ${modulePath}`);
    assert(at < generatorAt, `${modulePath} must load before generator.js`);
  }

  const worker = fs.readFileSync(path.join(PWA_ROOT, 'engine', 'worker.js'), 'utf8');
  const workerGeneratorAt = worker.indexOf("'./generator.js'");
  assert(workerGeneratorAt !== -1, 'worker.js must import the generator');
  for (const modulePath of reasoningModules) {
    const at = worker.indexOf("'./" + modulePath.replace('engine/', '') + "'");
    assert(at !== -1, `worker.js is missing ${modulePath}`);
    assert(at < workerGeneratorAt, `${modulePath} must load before generator.js in the worker`);
  }

  const serviceWorker = fs.readFileSync(path.join(PWA_ROOT, 'sw.js'), 'utf8');
  assert(/studysynth-v37/.test(serviceWorker), 'The offline cache must be versioned for Repair 002');
  for (const modulePath of reasoningModules.concat(['engine/generator.js'])) {
    assert(serviceWorker.includes("'./" + modulePath + "'"),
      `The offline cache is missing ${modulePath}`);
  }
  console.log('  ✓ Reasoning modules load before the generator and are cached offline.');
}

// =========================================================================
// 8. Batch output isolation
// =========================================================================
console.log('\n[Suite 8] Batch output isolation...');
{
  const manifestPath = path.join(REPAIR_DIR, 'summary_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const chapters = Array.isArray(manifest)
      ? manifest
      : (manifest.chapters || manifest.chapter_results || []);
    assert.strictEqual(chapters.length, 8, 'The batch must cover all eight chapters');

    const auditPath = path.join(REPAIR_DIR, 'audit_report.json');
    if (fs.existsSync(auditPath)) {
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      const totals = audit.totals || audit.summary || {};
      const errors = Number(totals.errors == null ? audit.errors : totals.errors) || 0;
      const warnings = Number(totals.warnings == null ? audit.warnings : totals.warnings) || 0;
      assert.strictEqual(errors, 0, 'The published batch must have zero audit errors');
      assert.strictEqual(warnings, 0, 'The published batch must have zero audit warnings');
    }

    for (const chapter of chapters) {
      const output = String(chapter.output || chapter.output_path ||
        chapter.stagedFile || chapter.dataFile || chapter.file || '');
      if (!output) continue;
      assert(output.indexOf('ncert_8_2_repair_002') !== -1,
        `Repair 002 output escaped its directory: ${output}`);
    }
    console.log('  ✓ Repair 002 output stays in its own directory and audits clean.');
  } else {
    console.log('  • No generated batch present; isolation check skipped.');
  }
}

console.log('\n======================================================');
console.log('ALL REPAIR 002 REGRESSION TESTS PASSED SUCCESSFULLY');
console.log('======================================================');
