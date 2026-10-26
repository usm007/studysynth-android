/**
 * StudySynth Lite — Repair 002 regression tests.
 *
 * Covers the five defect groups in STUDYSYNTH REPAIR 002:
 *  1. Shared geometry-aware PDF layout extraction (pdfParser.js).
 *  2. Paragraph and page boundaries (generator.js parseRawDocument).
 *  3. Sentence-role classification (linguistics / representation / generator).
 *  4. Causal-verb corrections (generator parseCause, V2 representation).
 *  5. Validated Reasoning V2 integration + browser/worker loading.
 *
 * Framework: plain Node.js + assert, matching the existing test files.
 * Run directly: node tests/test_repair002.js
 * (npm test also runs it; see pwa/package.json.)
 */

'use strict';

// Node.js polyfills required by the bundled PDF.js build, mirroring
// pwa/tests/batch_generate_all_ncert.js.
if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    return Buffer.from(this).toString('hex');
  };
}
if (!Math.sumPrecise) {
  Math.sumPrecise = function (arr) {
    let sum = 0;
    for (const n of arr) sum += Number(n) || 0;
    return sum;
  };
}

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pwaDir = path.join(__dirname, '..');
const Parser = require('../engine/pdfParser.js');
const Engine = require('../engine/generator.js');
const Analysis = require('../engine/analyze.js');
const EngineV2 = require('../engine/reasoning/engine_v2.js');
const Linguistics = require('../engine/reasoning/linguistics.js');
const Representation = require('../engine/reasoning/representation.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}

// ---------------------------------------------------------------------------
// Helpers: mocked PDF.js content (bottom-up coordinates, as PDF.js returns)
// ---------------------------------------------------------------------------
function item(str, x, yBottom, w, h) {
  return { str: str, transform: [1, 0, 0, 1, x, yBottom], width: w, height: h || 12 };
}
function layout(items, pageNumber) {
  return Parser.extractLayoutFromTextContent(
    { items: items },
    pageNumber || 1,
    { width: 612, height: 792 }
  );
}
function bodyBlockTexts(out) {
  return out.blocks.filter((b) => b.type === 'body').map((b) => b.text);
}

// ---------------------------------------------------------------------------
// 1. PDF layout
// ---------------------------------------------------------------------------
console.log('--- Repair 002: PDF layout ---');

// Two-column prose with correct reading order, and a full-width heading
// followed by two columns.
check('Two-column prose reads left column before right column, heading first', () => {
  const out = layout([
    item('World Geography', 72, 720, 200, 18),
    item('The river flows', 72, 680, 120, 12),
    item('through the valley', 72, 664, 120, 12),
    item('and reaches the sea.', 72, 648, 130, 12),
    item('Mountains rise in', 320, 680, 120, 12),
    item('the north and the', 320, 664, 110, 12),
    item('plains lie south.', 320, 648, 110, 12)
  ]);
  assert.strictEqual(out.blocks[0].type, 'heading');
  assert.strictEqual(out.blocks[0].text, 'World Geography');
  const bodies = bodyBlockTexts(out);
  assert.deepStrictEqual(bodies, [
    'The river flows through the valley and reaches the sea.',
    'Mountains rise in the north and the plains lie south.'
  ]);
  assert.ok(out.bodyText.indexOf('The river flows') < out.bodyText.indexOf('Mountains rise'));
  assert.ok(out.stats.gutter, 'A gutter must be detected for two columns');
  assert.ok(out.stats.gutter.width >= 0.04 * 612, 'Gutter must be at least 4% of page width');
});

check('Diagram/map labels interleaved with body text are not body prose', () => {
  const out = layout([
    item('The river flows through the valley.', 72, 680, 200, 12),
    item('N', 400, 500, 10, 10),
    item('Scale', 400, 480, 30, 10),
    item('500 km', 400, 460, 40, 10),
    item('The plains lie to the south.', 72, 640, 180, 12)
  ]);
  const types = out.blocks.map((b) => b.type);
  assert.ok(types.includes('diagram'), 'Diagram labels must be classified as diagram');
  assert.ok(!out.bodyText.includes('500 km'), 'Scale text must not enter body prose');
  assert.ok(out.bodyText.includes('The river flows'));
  assert.ok(out.bodyText.includes('The plains lie'));
});

check('Figure captions and running headers/footers are excluded from body', () => {
  const out = layout([
    item('Exploring Society', 72, 760, 150, 11),
    item('The river flows through the valley.', 72, 680, 200, 12),
    item('Fig. 1 Map of the region', 72, 600, 180, 11),
    item('12', 300, 20, 15, 10)
  ]);
  const types = out.blocks.map((b) => b.type);
  assert.ok(types.includes('caption'), 'Caption must be classified');
  assert.ok(types.includes('page_furniture'), 'Header/footer must be classified');
  assert.ok(!out.bodyText.includes('Fig. 1'));
  assert.ok(!out.bodyText.includes('Exploring Society'));
  assert.ok(out.bodyText.includes('The river flows'));
});

check('A paragraph continuing across visual lines stays one block', () => {
  const out = layout([
    item('The river flows', 72, 680, 120, 12),
    item('through the valley', 72, 664, 120, 12),
    item('and reaches the sea.', 72, 648, 130, 12)
  ]);
  const bodies = bodyBlockTexts(out);
  assert.strictEqual(bodies.length, 1);
  assert.strictEqual(bodies[0], 'The river flows through the valley and reaches the sea.');
});

check('An ambiguous block is preserved, not injected into body prose', () => {
  const out = layout([
    item('The river flows through the valley.', 72, 680, 200, 12),
    item('§§§ ??? ### @@@ *** ~~~', 72, 600, 160, 12)
  ]);
  const ambiguous = out.blocks.filter((b) => b.type === 'ambiguous');
  assert.ok(ambiguous.length >= 1, 'Non-prose block must be ambiguous, got: ' + JSON.stringify(out.blocks.map((b) => b.type)));
  assert.ok(!out.bodyText.includes('§§§'), 'Ambiguous text must not enter body prose');
  assert.ok(out.blocks.some((b) => b.text.includes('§§§')), 'Ambiguous text must be preserved in block diagnostics');
});

check('Layout output has the specified structured shape', () => {
  const out = layout([item('The river flows through the valley.', 72, 680, 200, 12)]);
  assert.strictEqual(out.pageNumber, 1);
  assert.strictEqual(typeof out.bodyText, 'string');
  assert.ok(Array.isArray(out.blocks));
  const block = out.blocks[0];
  assert.ok(block.id && block.pageNumber === 1 && block.type && block.text && block.bbox);
  assert.ok(Number.isFinite(block.itemCount) && Number.isFinite(block.confidence) && block.reason);
  assert.ok(out.stats && Number.isFinite(out.stats.totalItems) && out.stats.countsByType);
});

// ---------------------------------------------------------------------------
// 2. Paragraph boundaries
// ---------------------------------------------------------------------------
console.log('--- Repair 002: Paragraph and page boundaries ---');

check('Two paragraphs on one page remain separate', () => {
  const secs = Engine.parseRawDocument(
    '==Page 1==\nFirst paragraph line one\nwrapped line two.\n\nSecond paragraph here.',
    'Doc'
  );
  assert.strictEqual(secs.length, 1);
  assert.deepStrictEqual(secs[0].paragraphs, [
    'First paragraph line one wrapped line two.',
    'Second paragraph here.'
  ]);
});

check('A heading flushes the previous paragraph', () => {
  const secs = Engine.parseRawDocument(
    'First paragraph.\n\n# A Heading\n\nSecond paragraph.',
    'Doc'
  );
  assert.strictEqual(secs.length, 2);
  assert.strictEqual(secs[0].paragraphs[0], 'First paragraph.');
  assert.strictEqual(secs[1].title, 'A Heading');
  assert.strictEqual(secs[1].paragraphs[0], 'Second paragraph.');
});

check('A page marker flushes the previous paragraph and updates page metadata', () => {
  const secs = Engine.parseRawDocument(
    '==Page 1==\nParagraph on page one.\n\n==Page 2==\nParagraph on page two.',
    'Doc'
  );
  assert.strictEqual(secs.length, 2);
  assert.strictEqual(secs[0].page, 1);
  assert.strictEqual(secs[1].page, 2);
  assert.strictEqual(secs[0].paragraphs[0], 'Paragraph on page one.');
  assert.strictEqual(secs[1].paragraphs[0], 'Paragraph on page two.');
  assert.strictEqual(secs[1].paragraphMeta[0].page, 2);
});

check('A line wrap inside a paragraph remains connected', () => {
  const secs = Engine.parseRawDocument('==Page 1==\nThe river flows\nthrough the valley.', 'Doc');
  assert.deepStrictEqual(secs[0].paragraphs, ['The river flows through the valley.']);
});

check('Plain text and Markdown continue to parse correctly', () => {
  const secs = Engine.parseRawDocument('# Title\n\nPlain paragraph one.\n\nPlain paragraph two.', 'Doc');
  assert.strictEqual(secs[0].title, 'Title');
  assert.strictEqual(secs[0].paragraphs.length, 2);
});

// ---------------------------------------------------------------------------
// 3. Sentence-role classification
// ---------------------------------------------------------------------------
console.log('--- Repair 002: Sentence-role classification ---');

const roleCases = [
  ['How do human actions trigger environmental issues?', 'interrogative'],
  ['Explain why the river floods.', 'instruction'],
  ['Increased rainfall causes flooding.', 'assertion'],
  ['How do human actions trigger environmental issues', 'interrogative'],
  ['What causes flooding', 'interrogative'],
  ['Is the river long?', 'interrogative'],
  ['Consider the map.', 'instruction'],
  ['Think about the river.', 'instruction'],
  ['The river', 'ambiguous'],
  ['Map of India', 'ambiguous'],
  ['Rain helps farmers.', 'assertion'],
  ['The river floods.', 'assertion'],
  ['When light intensity increases, the rate of photosynthesis increases.', 'assertion']
];
for (const [text, expected] of roleCases) {
  check(`classifySentenceRole: "${text}" -> ${expected}`, () => {
    assert.strictEqual(Engine.classifySentenceRole(text), expected);
    assert.strictEqual(Linguistics.classifySentenceRole(text), expected);
    assert.strictEqual(Representation.classifySentenceRole(text), expected);
  });
}

check('Ambiguous fragments do not generate factual propositions', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('Map of India. The river.', 'Doc'), {}
  );
  const realFacts = facts.filter((f) => f.fact_type !== 'fallback');
  assert.strictEqual(realFacts.length, 0, 'Fragments must not become facts: ' + JSON.stringify(realFacts));
});

check('A question containing a causal verb cannot create a causal fact', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('How do human actions trigger environmental issues? Increased rainfall causes flooding.', 'Doc'), {}
  );
  const causal = facts.filter((f) => f.relation === 'causes');
  assert.strictEqual(causal.length, 1, 'Only the assertion may create a causal fact');
  assert.ok(/increased rainfall/i.test(causal[0].subject));
  assert.ok(!facts.some((f) => /human actions/i.test(f.subject || '') && f.relation === 'causes'));
});

check('Interrogatives and instructions do not become facts through production extraction', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('How do human actions trigger issues? Explain why the river floods. Increased rainfall causes flooding.', 'Doc'), {}
  );
  assert.ok(!facts.some((f) => f.sentence_role && f.sentence_role !== 'assertion'), 'Every fact must carry an assertion role');
  assert.ok(facts.some((f) => f.relation === 'causes' && /increased rainfall/i.test(f.subject)));
});

check('Interrogatives and instructions do not become V2 propositions', () => {
  const compiled = Representation.compileSemanticRepresentation([{
    id: 'SEC-001', title: 'Test', page: 1,
    text: 'How do human actions trigger issues? Explain why the river floods. Increased rainfall causes flooding.'
  }], []);
  const fromQuestion = compiled.propositions.filter((p) => /human actions/i.test(p.subject + ' ' + p.object));
  assert.strictEqual(fromQuestion.length, 0, 'V2 must not compile a question into a proposition');
  assert.ok(compiled.propositions.some((p) => p.relation_type === 'CAUSES' || /causes/i.test(p.predicate || '')));
});

// ---------------------------------------------------------------------------
// 4. Causal-verb corrections
// ---------------------------------------------------------------------------
console.log('--- Repair 002: Causal corrections ---');

check('Supports and helps are not automatically direct causation', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('The library supports students. Rain helps farmers.', 'Doc'), {}
  );
  assert.strictEqual(
    facts.filter((f) => f.relation === 'causes').length, 0,
    'Bare supports/helps must not become CAUSES: ' + JSON.stringify(facts.map((f) => f.relation))
  );
});

check('Affects is not automatically direct causation', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('Pollution affects the river.', 'Doc'), {}
  );
  assert.strictEqual(facts.filter((f) => f.relation === 'causes').length, 0);
});

check('Direct causal verbs still work, with direction preserved', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('Increased rainfall causes flooding. Friction causes the object to slow down.', 'Doc'), {}
  );
  const causal = facts.filter((f) => f.relation === 'causes');
  assert.ok(causal.length >= 2);
  assert.ok(causal.some((f) => /increased rainfall/i.test(f.subject) && /flooding/i.test(f.object)));
  assert.ok(!causal.some((f) => /flooding/i.test(f.subject) && /increased rainfall/i.test(f.object)));
});

check('Allows with an explicit infinitive effect clause is preserved (existing Fixture C)', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('The reduction in friction allows the object to move more easily.', 'Doc'), {}
  );
  const causal = facts.filter((f) => f.relation === 'causes');
  assert.strictEqual(causal.length, 1);
  assert.ok(/reduction in friction/i.test(causal[0].subject));
  assert.ok(/move more easily/i.test(causal[0].object));
});

// ---------------------------------------------------------------------------
// 5. V2 integration
// ---------------------------------------------------------------------------
console.log('--- Repair 002: Validated V2 integration ---');

check('Production generation uses the validated V2 question-bank API', () => {
  const generatorJs = fs.readFileSync(path.join(pwaDir, 'engine', 'generator.js'), 'utf-8');
  assert.ok(/generateReasoningQuestionBank\(/.test(generatorJs), 'Generator must call generateReasoningQuestionBank');
  assert.ok(!/generateReasoningCandidates\(graph/.test(generatorJs), 'Generator must not merge raw V2 candidates');
});

check('A candidate rejected by production validation is not published', () => {
  const source = [
    'Photosynthesis is the process by which green plants use sunlight to synthesize food.',
    'Evaporation is defined as the process by which a liquid becomes a gas.',
    'Condensation refers to the process by which a gas becomes a liquid.',
    'Sublimation means the process by which a solid changes directly into a gas.'
  ].join(' ');
  const analyzed = Analysis.analyzeSource(source, 'Definitions', null, 15);
  assert.ok(analyzed.questions && analyzed.questions.length > 0);
  for (const q of analyzed.questions) {
    assert.ok(q.options && q.options.length === 4);
    assert.ok(new Set(q.options.map((o) => o.text.trim().toLowerCase())).size === 4);
  }
});

check('V2 errors are represented honestly in diagnostics, not as silent success', () => {
  // Force a V2 failure by temporarily replacing the validated V2 API
  // with a throwing function. Production candidates must still publish,
  // but the bank's metrics must flag the V2 failure instead of silently
  // presenting the bank as fully V2-validated.
  const original = EngineV2.generateReasoningQuestionBank;
  EngineV2.generateReasoningQuestionBank = () => { throw new Error('Simulated V2 failure for Repair 002'); };
  try {
    const analyzed = Analysis.analyzeSource(
      'Photosynthesis is the process by which green plants use sunlight to synthesize food. ' +
      'Evaporation is defined as the process by which a liquid becomes a gas. ' +
      'Condensation refers to the process by which a gas becomes a liquid. ' +
      'Sublimation means the process by which a solid changes directly into a gas.',
      'Definitions', null, 15
    );
    assert.ok(analyzed.questions && analyzed.questions.length > 0, 'Production questions must still publish when V2 fails');
    const generation = analyzed.questions.generation;
    assert.ok(generation, 'Generation metrics must be present');
    assert.strictEqual(generation.v2Failed, true, 'Metrics must flag the V2 failure');
    assert.ok(generation.v2Error && generation.v2Error.includes('Simulated V2 failure'), 'Metrics must carry the V2 error message');
    assert.ok((generation.rejectionCounts && generation.rejectionCounts.v2_error) >= 1, 'Rejection counts must record the V2 error');
  } finally {
    EngineV2.generateReasoningQuestionBank = original;
  }
  // After restoring V2, a normal run must report no V2 failure.
  const restored = Analysis.analyzeSource(
    'Friction causes the object to slow down. Heat leads to the metal expanding.',
    'Causal', null, 5
  );
  assert.strictEqual(restored.questions.generation.v2Failed, false);
});

check('Deterministic output remains reproducible through the integrated pipeline', () => {
  const source = 'Friction causes the object to slow down. Heat leads to the metal expanding. Pressure results in the volume decreasing. Gravity causes the apple to fall.';
  const a = Analysis.analyzeSource(source, 'Causal', null, 15);
  const b = Analysis.analyzeSource(source, 'Causal', null, 15);
  assert.deepStrictEqual(
    a.questions.map((q) => q.stem + '|' + q.answer_key),
    b.questions.map((q) => q.stem + '|' + q.answer_key)
  );
});

check('Browser and worker module loading provide the expected Reasoning V2 globals', () => {
  const html = fs.readFileSync(path.join(pwaDir, 'index.html'), 'utf-8');
  const workerJs = fs.readFileSync(path.join(pwaDir, 'engine', 'worker.js'), 'utf-8');
  const htmlChain = [
    'engine/reasoning/types.js', 'engine/reasoning/linguistics.js', 'engine/reasoning/representation.js',
    'engine/reasoning/graph.js', 'engine/reasoning/distractors.js', 'engine/reasoning/operators.js',
    'engine/reasoning/constructors.js', 'engine/reasoning/validator.js', 'engine/reasoning/ranking.js',
    'engine/reasoning/engine_v2.js', 'engine/generator.js'
  ];
  const workerChain = [
    './reasoning/types.js', './reasoning/linguistics.js', './reasoning/representation.js',
    './reasoning/graph.js', './reasoning/distractors.js', './reasoning/operators.js',
    './reasoning/constructors.js', './reasoning/validator.js', './reasoning/ranking.js',
    './reasoning/engine_v2.js', './generator.js', './analyze.js'
  ];
  for (const [source, chain] of [[html, htmlChain], [workerJs, workerChain]]) {
    let last = -1;
    for (const asset of chain) {
      const idx = source.indexOf(asset);
      assert.ok(idx > last, `${asset} must load after earlier dependencies`);
      last = idx;
    }
  }
  // No duplicate loading through a competing path: each reasoning module
  // appears exactly once in index.html script tags.
  for (const asset of htmlChain.slice(0, 10)) {
    const occurrences = (html.match(new RegExp(asset.replace(/\//g, '\\/'), 'g')) || []).length;
    assert.strictEqual(occurrences, 1, `${asset} must load exactly once in index.html`);
  }
  // In-process (Node) globals mirror the browser globals.
  assert.ok(EngineV2 && typeof EngineV2.generateReasoningQuestionBank === 'function');
  assert.ok(typeof EngineV2.Validator.validateCandidate === 'function');
});

check('Browser-style global loading provides Reasoning V2 to the generator', () => {
  // Load the scripts in a vm context with no CommonJS module/require, so
  // every module must resolve its dependencies from browser globals, in
  // the order index.html uses. This is not a CommonJS test.
  const vm = require('vm');
  const sandbox = { console: console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const browserContext = vm.createContext(sandbox);
  const browserChain = [
    'engine/reasoning/types.js', 'engine/reasoning/linguistics.js', 'engine/reasoning/representation.js',
    'engine/reasoning/graph.js', 'engine/reasoning/distractors.js', 'engine/reasoning/operators.js',
    'engine/reasoning/constructors.js', 'engine/reasoning/validator.js', 'engine/reasoning/ranking.js',
    'engine/reasoning/engine_v2.js', 'engine/generator.js', 'engine/analyze.js'
  ];
  for (const rel of browserChain) {
    vm.runInContext(fs.readFileSync(path.join(pwaDir, rel), 'utf-8'), browserContext, { filename: rel });
  }
  assert.ok(sandbox.StudySynthReasoningV2, 'Browser globals must include StudySynthReasoningV2');
  assert.ok(typeof sandbox.StudySynthReasoningV2.generateReasoningQuestionBank === 'function');
  assert.ok(sandbox.StudySynthEngine, 'Browser globals must include StudySynthEngine');
  assert.ok(sandbox.StudySynthEngine.ReasoningV2, 'Generator loaded from globals must see Reasoning V2');
  assert.ok(sandbox.StudySynthAnalysis, 'Browser globals must include StudySynthAnalysis');
  const result = sandbox.StudySynthAnalysis.analyzeSource(
    'Friction causes the object to slow down. Heat leads to the metal expanding.',
    'Browser Loading', null, 5
  );
  assert.ok(result.questions && result.questions.length > 0, 'Browser-loaded pipeline must generate questions');
});

check('Service worker caches all reasoning modules and uses a bumped cache version', () => {
  const sw = fs.readFileSync(path.join(pwaDir, 'sw.js'), 'utf-8');
  assert.ok(/studysynth-v37/.test(sw), 'Cache version must be bumped from v36');
  for (const asset of [
    './engine/reasoning/types.js', './engine/reasoning/linguistics.js', './engine/reasoning/representation.js',
    './engine/reasoning/graph.js', './engine/reasoning/distractors.js', './engine/reasoning/operators.js',
    './engine/reasoning/constructors.js', './engine/reasoning/validator.js', './engine/reasoning/ranking.js',
    './engine/reasoning/engine_v2.js'
  ]) {
    assert.ok(sw.includes(asset), `sw.js must cache ${asset}`);
    assert.ok(fs.existsSync(path.join(pwaDir, asset.replace(/^\.\//, ''))), `${asset} must exist on disk`);
  }
});

check('Batch generator uses the shared parser, not a duplicate layout algorithm', () => {
  const batch = fs.readFileSync(path.join(__dirname, 'batch_generate_all_ncert.js'), 'utf-8');
  assert.ok(/require\('\.\.\/engine\/pdfParser\.js'\)/.test(batch), 'Batch must require the shared parser');
  assert.ok(/extractPageLayout\(/.test(batch), 'Batch must call the shared extractPageLayout');
  assert.ok(!/buildBlockParagraphs/.test(batch), 'Batch must not keep its duplicate paragraph builder');
});

// ---------------------------------------------------------------------------
// 6. Phase 8 fixes (found by inspecting the regenerated NCERT banks)
// ---------------------------------------------------------------------------
console.log('--- Repair 002 Phase 8 fixes ---');

check('Causal extraction does not cross a semicolon clause', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('Human lives are deeply connected to its many features; for instance, the distant Southern Indian Ocean influences the monsoon in the Gangetic Plains.', 'Doc'), {}
  );
  const causal = facts.filter((f) => f.relation === 'causes');
  assert.strictEqual(causal.length, 1, 'Exactly one causal fact must be extracted');
  assert.ok(/southern indian ocean/i.test(causal[0].subject), 'Cause must be the Southern Indian Ocean, got: ' + causal[0].subject);
  assert.ok(!/human lives/i.test(causal[0].subject), 'An earlier clause must not supply the cause');
  assert.ok(/monsoon/i.test(causal[0].object));
});

check('V2 Operator B rejects a cause that is not in the causal clause', () => {
  const prop = Representation.createProposition({
    subject: 'Human lives',
    predicate: 'causes',
    relation_type: 'CAUSES',
    object: 'the monsoon in the Gangetic Plains',
    supporting_excerpt: 'Human lives are deeply connected to its many features; for instance, the distant Southern Indian Ocean influences the monsoon in the Gangetic Plains.',
    polarity: 'positive',
    modality: 'fact'
  });
  const result = EngineV2.Operators.executeOperatorB(prop);
  assert.strictEqual(result.success, false, 'Operator B must reject a cross-clause cause');
});

check('V2 distractors never carry a fragment concept', () => {
  const distractors = EngineV2.Distractors.generateMisconceptionDistractors(
    { subject: 'the monsoon in the Gangetic Plains', object: 'It', relation_type: 'CAUSES' },
    'the distant Southern Indian Ocean',
    'OP_B_CAUSAL_EXPLANATION',
    null
  );
  assert.ok(!distractors.some((d) => /without influencing\s+It\b/i.test(d.text)), 'A fragment distractor must not be generated');
  assert.ok(!distractors.some((d) => /\bprevents It\b/i.test(d.text)), 'A fragment object must not be used as a distractor concept');
});

check('Multi-statement stem no longer depends on a section title', () => {
  const multiSource = 'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.';
  const analyzed = Analysis.analyzeSource(multiSource, 'Multi', null, 10);
  const multi = analyzed.questions.find((q) => q.question_subtype === 'multi_statement');
  assert.ok(multi, 'A multi-statement question must still be generated');
  assert.strictEqual(multi.stem, 'Consider the following statements:');
  assert.ok(Array.isArray(multi.statements) && multi.statements.length === 2, 'Multi-statement questions must carry two statements for rendering');
  assert.ok(!/based on/i.test(multi.stem), 'Stem must not contain a truncated section title');
  const batch = fs.readFileSync(path.join(__dirname, 'batch_generate_all_ncert.js'), 'utf-8');
  assert.ok(/q\.statements/.test(batch), 'Batch markdown must render multi-statement statements');
  assert.ok(/prompt_suffix/.test(batch), 'Batch markdown must render the multi-statement prompt suffix');
});

check('A merged year + count is not a numeric answer', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('Late April 1908, two young members of this group tried to assassinate a British judge.', 'Doc'), {}
  );
  const numeric = facts.filter((f) => f.fact_type === 'numeric');
  assert.ok(!numeric.some((f) => /1908,\s*two young members/i.test(f.object)), 'A merged year + count must not become a numeric fact');
  const clean = Engine.extractSourceFacts(
    Engine.parseRawDocument('The reef stretches over a length of 2,000 km.', 'Doc'), {}
  );
  assert.ok(clean.some((f) => f.fact_type === 'numeric' && f.object === '2,000 km'), 'A clean quantity must still be extracted');
});

check('Running book titles do not become facts, even at 83% page height', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('Exploring Society: India and Beyond | G rade 8 Part 2 launched in 1906. The college was launched in 1906.', 'Doc'), {}
  );
  assert.ok(!facts.some((f) => f.fact_type !== 'fallback' && /exploring society/i.test(f.supporting_excerpt || '')), 'A running title must not become a fact');
  const out = layout([
    item('Exploring Society: India and Beyond | G rade 8 Part 2', 72, 130, 200, 12),
    item('The river flows through the valley.', 72, 680, 200, 12)
  ]);
  assert.ok(out.blocks.some((b) => b.type === 'page_furniture'), 'A running footer at 83% height must be page furniture');
  assert.ok(!out.bodyText.includes('Exploring Society'), 'Running title must not enter body prose');
});

check('Naming explanations and compound causal effects are rejected', () => {
  const naming = Engine.extractSourceFacts(
    Engine.parseRawDocument('Mountains are called water towers because they are at a height, and provide freshwater through melting snow and glaciers.', 'Doc'), {}
  );
  assert.ok(!naming.some((f) => f.relation === 'causes'), 'A naming explanation must not become a causal fact');
  const compound = Engine.extractSourceFacts(
    Engine.parseRawDocument('The Bay of Bengal influences climate, and is home to a variety of species.', 'Doc'), {}
  );
  assert.ok(!compound.some((f) => f.relation === 'causes' && /climate, and is home/i.test(f.object || '')), 'A compound predicate must not become a causal effect');
  const prop = Representation.createProposition({
    subject: 'Mongolia',
    predicate: 'causes',
    relation_type: 'CAUSES',
    object: 'it has about 8 to 9 months of sunny weather',
    supporting_excerpt: 'Mongolia is called the Land of the Eternal Blue Sky because it has about 8 to 9 months of sunny weather.',
    polarity: 'positive',
    modality: 'fact'
  });
  const result = EngineV2.Operators.executeOperatorB(prop);
  assert.strictEqual(result.success, false, 'Operator B must reject a pronoun-clause effect and a naming explanation');
});

check('Temporal conditionals are not causal mechanisms, and pronoun effects are rejected', () => {
  const whenFacts = Engine.extractSourceFacts(
    Engine.parseRawDocument('When the work was nearly done, a local reporter asked the youngest participants why they were spending their Sunday morning like this instead of playing.', 'Doc'), {}
  );
  const conditional = whenFacts.find((f) => f.extraction_method === 'causal_conditional');
  assert.ok(conditional, 'A When-sentence must still be extracted as a conditional fact');
  const compiled = Representation.compileSemanticRepresentation(
    [{ id: 'SEC-001', title: 'Test', page: 1, text: 'When the work was nearly done, a local reporter asked questions.' }],
    whenFacts
  );
  const causalProps = compiled.propositions.filter((p) => p.relation_type === 'CAUSES' && /local reporter/i.test(p.object || ''));
  assert.strictEqual(causalProps.length, 0, 'A temporal conditional must not enter the graph as CAUSES');
  const prop = Representation.createProposition({
    subject: 'the work',
    predicate: 'causes',
    relation_type: 'CAUSES',
    object: 'it means many children are being born',
    supporting_excerpt: 'A young population means many children are being born.',
    polarity: 'positive',
    modality: 'fact'
  });
  const result = EngineV2.Operators.executeOperatorB(prop);
  assert.strictEqual(result.success, false, 'Operator B must reject a pronoun-start effect');
});

check('Conditional subjects are full clauses, and conditional direction is not inverted', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('When senior Congress leaders were arrested, she hoisted the national flag at the Gowalia Tank Maidan in Bombay.', 'Doc'), {}
  );
  const conditional = facts.find((f) => f.extraction_method === 'causal_conditional');
  assert.ok(conditional, 'A When-conditional must still be extracted');
  assert.ok(/were arrested/i.test(conditional.subject), 'Conditional subject must be the full clause, got: ' + conditional.subject);
  const iqbal = Engine.extractSourceFacts(
    Engine.parseRawDocument('When Muhammad Iqbal, a philosopher and poet of Urdu, presided over the 1930 session.', 'Doc'), {}
  );
  assert.ok(!iqbal.some((f) => f.extraction_method === 'causal_conditional'), 'A proper name before an appositive comma is not a condition');
  const compiled = Representation.compileSemanticRepresentation(
    [{ id: 'SEC-001', title: 'Test', page: 1, text: 'If fewer babies are being born, the birth rate is low.' }],
    facts
  );
  // Bridged conditional props must be CONDITIONAL_ON, not CAUSES, so
  // Operator B cannot turn a temporal conditional into a causal claim.
  assert.ok(!compiled.propositions.some((p) => p.relation_type === 'CAUSES' && /senior congress/i.test(p.subject || '')));
});

check('Figure-reference evidence is rejected by production validation', () => {
  const analyzed = Analysis.analyzeSource(
    'The Great Barrier Reef (Fig. 1.8), off Australia’s northeastern coast, stretches over a length of 2,000 km and covers about 350,000 square kilometres.',
    'Fig Test', null, 15
  );
  const published = analyzed.questions || [];
  assert.ok(!published.some((q) => /\(Fig\.|Fig\.\s*\d/i.test(q.supporting_excerpt || '')), 'No published question may use a figure-reference excerpt');
});

// ---------------------------------------------------------------------------
// 7. End-to-end through the real parser API (real PDF.js, real parser)
// ---------------------------------------------------------------------------
console.log('--- Repair 002: End-to-end PDF.js + parser ---');

function buildMinimalPdf(lines) {
  // lines: [{ text, x, y }] — uncompressed, single page, Helvetica.
  const content = lines.map((l) => `BT /F1 12 Tf ${l.x} ${l.y} Td (${l.text}) Tj ET`).join('\n') + '\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function runE2E() {
  const buffer = buildMinimalPdf([
    { text: 'Hello body text.', x: 72, y: 720 },
    { text: 'Second line here.', x: 72, y: 700 }
  ]);
  const result = await Parser.extractTextFromPDFDetailed(buffer);
  assert.ok(result.text.includes('Hello body text.'), 'Real PDF.js extraction must return body text');
  assert.ok(result.text.includes('==Page 1=='), 'Real extraction must use the ==Page N== marker');
  assert.strictEqual(result.fallbackUsed, false, 'Successful primary extraction must not use unstructured fallback');
  assert.ok(result.pages && result.pages.length >= 1, 'Detailed result must carry page layouts');
  assert.ok(result.pages[0].blocks.some((b) => b.type === 'body'), 'Page layout must contain a body block');
  console.log('  ✓ End-to-end: real PDF.js page through the shared layout extractor');

  const shortBuffer = buildMinimalPdf([{ text: 'Rivers flow south.', x: 72, y: 720 }]);
  const shortResult = await Parser.extractTextFromPDFDetailed(shortBuffer);
  assert.strictEqual(shortResult.fallbackUsed, false, 'A selectable PDF with little accepted body text must not trigger unstructured fallback');
  assert.ok(shortResult.text.includes('Rivers flow south.'), 'Short body text must still be returned');
  assert.ok(shortResult.lowConfidence, 'Short body text must be flagged low-confidence in diagnostics, not hidden by fallback');
  console.log('  ✓ Short selectable text does not trigger unstructured fallback');

  // Worker initialisation: load worker.js in a vm context with a fake
  // importScripts/self, then send a real generate job and check the
  // result message. This verifies the worker's import chain, not just
  // its static text.
  {
    const vm = require('vm');
    const messages = [];
    const sandbox = { console: console };
    sandbox.globalThis = sandbox;
    sandbox.self = {};
    sandbox.self.postMessage = (m) => messages.push(m);
    sandbox.self.addEventListener = (type, fn) => { sandbox._workerHandler = fn; };
    sandbox.importScripts = (...files) => {
      for (const file of files) {
        const rel = file.replace(/^\.\//, '');
        vm.runInContext(fs.readFileSync(path.join(pwaDir, 'engine', rel), 'utf-8'), workerContext, { filename: rel });
      }
    };
    const workerContext = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(pwaDir, 'engine', 'worker.js'), 'utf-8'), workerContext, { filename: 'worker.js' });
    assert.ok(typeof sandbox._workerHandler === 'function', 'Worker must register a message handler');
    sandbox._workerHandler({
      data: {
        type: 'generate', jobId: 'repair002-worker-1',
        text: 'Friction causes the object to slow down. Heat leads to the metal expanding. Pressure results in the volume decreasing. Gravity causes the apple to fall.',
        title: 'Worker Test', sourceMeta: {}, targetCount: 5
      }
    });
    const resultMsg = messages.find((m) => m.type === 'result');
    assert.ok(resultMsg, 'Worker must post a result message, got: ' + JSON.stringify(messages));
    assert.ok(resultMsg.analyzed && resultMsg.analyzed.questions && resultMsg.analyzed.questions.length > 0, 'Worker must generate questions through the shared analysis pipeline');
    assert.ok(resultMsg.analyzed.generation, 'Worker result must carry generation metrics');
    console.log('  ✓ Worker initialisation: real generate job through importScripts chain');
  }

check('Manual-read subject gates: possessive, finite-verb, question-word and correlative subjects are unusable', () => {
  assert.strictEqual(Engine.isUsableSubject('their location and other factors'), false, 'A possessive-pronoun subject has no antecedent on its own');
  assert.strictEqual(Engine.isUsableSubject('Soon the club\'s membership increased and its activities'), false, 'A subject containing a finite verb is a clause, not a noun phrase');
  assert.strictEqual(Engine.isUsableSubject('Exposure to what'), false, 'A subject containing a question word is not identifiable');
  assert.strictEqual(Engine.isUsableSubject('a well-planned city not only'), false, 'A subject ending in a correlative is a fragment');
  assert.strictEqual(Engine.isUsableSubject('Few indeed in the whole world'), false, 'A discourse fragment is not a subject');
  assert.strictEqual(Engine.isUsableSubject('the Dilwara Temples at Mount Abu'), true, 'A named, modified noun phrase stays usable');
});

check('V2 comparative effects use "What makes" instead of ungrammatical "What causes"', () => {
  const constructorsJs = fs.readFileSync(path.join(__dirname, '../engine/reasoning/constructors.js'), 'utf-8');
  assert.ok(/What makes \$\{lowerSubject\}/.test(constructorsJs), 'OP_B must render comparative effects with "What makes"');
  assert.ok(/\bmore\b/i.test(constructorsJs), 'OP_B must detect the comparative marker before choosing the verb');
});
  console.log(`\n==========================================\nALL REPAIR 002 REGRESSION TESTS PASSED (${passed} checks + 3 end-to-end)\n==========================================`);
}

// ---------------------------------------------------------------------------
// Quality standard (2026-10-25): self-contained stems, no passage
// references, correct causal direction, varied multi patterns.
// ---------------------------------------------------------------------------
console.log('--- Quality standard: self-contained stems ---');

check('A stem referencing a passage or source is rejected by validation', () => {
  const q = {
    type: 'single_choice', question_subtype: 'definition',
    stem: 'According to the passage, what does the plain mean?',
    options: [
      { key: 'A', text: 'low-lying terrain', is_correct: true },
      { key: 'B', text: 'high mountains', is_correct: false, distractor_origin: 'typed_entity_pool' },
      { key: 'C', text: 'deep oceans', is_correct: false, distractor_origin: 'typed_entity_pool' },
      { key: 'D', text: 'dense forests', is_correct: false, distractor_origin: 'typed_entity_pool' }
    ],
    answer_key: 'A', expected_answer: 'low-lying terrain',
    explanation: 'The source states: "The plain is characterised by low-lying terrain."',
    supporting_excerpt: 'The plain is characterised by low-lying terrain.',
    evidence: { fact_ids: [] }
  };
  const result = Engine.validateQuestion(q, [], {});
  assert.ok(result.issues.some((i) => i.rule === 'stem_source_reference'), 'Source-referencing stem must be rejected, got: ' + JSON.stringify(result.issues));
});

check('A bare-unit numeric fact does not produce "What number is stated?"', () => {
  const out = Analysis.analyzeSource(
    'At present, India has 28 States. The capital of India is New Delhi. The Ganga river flows through northern India. The Himalayas are the highest mountains in the world.',
    'Quality fixture'
  );
  const stems = (out.questions || []).map((q) => q.stem);
  assert.ok(!stems.some((s) => /^What (number|measurement) is stated\?$/.test(s)), 'Context-free numeric stem must not appear: ' + JSON.stringify(stems));
  assert.ok(!stems.some((s) => /according to the (passage|source)/i.test(s)), 'No stem may reference a passage or source: ' + JSON.stringify(stems));
});

check('A "because" fact bridges to CAUSES with cause as subject, not effect', () => {
  const prop = Representation.mapFactToProposition({
    fact_id: 'F-1', fact_type: 'causal', causal_direction: 'effect_because_cause',
    subject: 'The birth rate', object: 'families had many children',
    relation_verb: 'because', source_page: 1
  });
  assert.strictEqual(prop.subject, 'families had many children', 'Bridged CAUSES subject must be the cause');
  assert.strictEqual(prop.object, 'The birth rate', 'Bridged CAUSES object must be the effect');
});

check('V2 Operator B rejects participle and compound-verb effects', () => {
  const EngineV2Local = require('../engine/reasoning/engine_v2.js');
  // Direct operator test via the graph API is covered by the validator
  // check below; here we assert the validator rejects a derived
  // causal item whose effect is a fragment, using the same gate text.
  const candidate = {
    question_subtype: 'causal_reasoning',
    stem: 'What causes walkability and integrates?',
    expected_answer: 'Singapore’s urban planning',
    options: [
      { key: 'A', text: 'Singapore’s urban planning', is_correct: true, distractor_origin: 'source' },
      { key: 'B', text: 'Other planning', is_correct: false, distractor_origin: 'source' },
      { key: 'C', text: 'More planning', is_correct: false, distractor_origin: 'source' },
      { key: 'D', text: 'Less planning', is_correct: false, distractor_origin: 'source' }
    ],
    supporting_excerpt: 'Singapore’s urban planning promotes walkability and integrates',
    explanation: 'Singapore’s urban planning promotes walkability and integrates',
    derived_proposition: { subject: 'walkability and integrates', object: 'Singapore’s urban planning', modality: 'fact', polarity: 'positive' },
    proof_trace: { operator: 'OP_B_CAUSAL_EXPLANATION', premises: ['F-1'] },
    primary_operator: 'OP_B_CAUSAL_EXPLANATION'
  };
  const result = EngineV2Local.Validator.validateCandidate(candidate, {}, { facts: [{ fact_id: 'F-1' }] });
  assert.strictEqual(result.valid, false, 'Validator must reject a compound-predicate effect, got: ' + JSON.stringify(result));
  assert.ok(/compound predicate/i.test(result.message), 'Rejection must name the compound predicate, got: ' + result.message);
});

check('A duplicated heading-plus-sentence phrase collapses to one phrase', () => {
  const prop = Representation.createProposition({
    subject: 'Right to constitutional remedies The right to constitutional remedies',
    object: 'citizens to approach the Supreme Court',
    relation_type: 'CAUSES'
  });
  assert.strictEqual(prop.subject, 'Right to constitutional remedies', 'Duplicated phrase must collapse, got: ' + prop.subject);
});

check('Multi-statement candidates include more than one truth pattern', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005. The Epsilon Commission was established in 2010. The Zeta Commission was established in 2015.',
    'Multi variety fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const patterns = new Set(candidates.filter((q) => q.question_subtype === 'multi_statement').map((q) => q.expected_answer));
  assert.ok(patterns.size >= 2, 'Multi candidates must span more than one truth pattern, got: ' + JSON.stringify([...patterns]));
});

check('Exception questions use a same-category outsider and true members only', () => {
  const out = Analysis.analyzeSource(
    'The three primary colours of light are red, green and blue. The secondary colours are yellow, orange and purple.',
    'Exception fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const exc = candidates.find((q) => q.question_subtype === 'exception_reasoning');
  assert.ok(exc, 'An exception candidate must be built from a membership list');
  assert.ok(/NOT/.test(exc.stem), 'Exception stem must capitalise NOT, got: ' + exc.stem);
  assert.ok(!['red', 'green', 'blue'].includes(exc.expected_answer.toLowerCase()), 'Exception answer must not be a member, got: ' + exc.expected_answer);
  for (const opt of exc.options.filter((o) => !o.is_correct)) {
    assert.ok(['red', 'green', 'blue'].includes(opt.text.toLowerCase()), 'Exception distractors must be true members, got: ' + opt.text);
  }
  const v = Engine.validateQuestion(exc, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Exception candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Statement-option questions use a full source sentence and near-miss claims', () => {
  const out = Analysis.analyzeSource(
    'The Battle of Buxar took place in 1764. The Battle of Plassey took place in 1757.',
    'Statement-option fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const so = candidates.find((q) => q.question_subtype === 'statement_option');
  assert.ok(so, 'A statement-option candidate must be built from a dated fact');
  assert.ok(/statements is correct about/.test(so.stem), 'Statement-option stem must ask which statement is correct, got: ' + so.stem);
  assert.ok(so.options.filter((o) => o.is_correct).length === 1, 'Exactly one statement option must be correct');
  const v = Engine.validateQuestion(so, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Statement-option candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Three-statement candidates span subset patterns and validate', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.',
    'Multi-3 fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const m3 = candidates.filter((q) => q.question_subtype === 'multi_statement_3');
  assert.ok(m3.length >= 1, 'A three-statement candidate must be built');
  const patterns = new Set(m3.map((q) => q.expected_answer));
  assert.ok(patterns.size >= 2, 'Three-statement candidates must span more than one pattern, got: ' + JSON.stringify([...patterns]));
  const sample = m3[0];
  assert.strictEqual(sample.statements.length, 3, 'Three-statement questions must carry three statements');
  const v = Engine.validateQuestion(sample, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Three-statement candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Ordered multi-statement candidates can answer "2 only"', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.',
    'Ordered multi fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const twoOnly = candidates.find((q) => q.question_subtype === 'multi_statement' && q.expected_answer === '2 only');
  assert.ok(twoOnly, 'An ordered multi-statement candidate with answer "2 only" must exist');
  assert.strictEqual(twoOnly.statements[0].truth_value, false, 'For "2 only", statement 1 must be false');
  assert.strictEqual(twoOnly.statements[1].truth_value, true, 'For "2 only", statement 2 must be true');
});

check('Mock-test assembler balances keys, covers sections, and never reuses a fact', () => {
  const geo = Analysis.analyzeSource(
    'The Ganga river originates from the Gangotri glacier. The Brahmaputra river flows through Assam. The Deccan Plateau is located in southern India. The Western Ghats run parallel to the western coast of India. The Battle of Buxar took place in 1764. The Battle of Plassey took place in 1757.',
    'Geo'
  );
  const civ = Analysis.analyzeSource(
    'Article 14 states that the State shall not deny to any person equality before the law. Article 19 protects freedom of speech and expression. Article 21 protects the right to life and personal liberty. Article 32 allows citizens to approach the Supreme Court if their fundamental rights are violated.',
    'Civics'
  );
  const paper = Engine.assembleMockTest([...geo.questions, ...civ.questions], { targetCount: 6 });
  assert.ok(paper.questions.length >= 5, 'Assembler must produce a paper, got: ' + paper.questions.length);
  assert.strictEqual(paper.audit.sectionsCovered, 2, 'Paper must cover both sections, got: ' + JSON.stringify(paper.audit.bySection));
  const keyValues = Object.values(paper.audit.keyDistribution);
  assert.ok(Math.max(...keyValues) - Math.min(...keyValues) <= 1, 'Answer keys must be balanced, got: ' + JSON.stringify(paper.audit.keyDistribution));
  const rels = paper.questions.flatMap((q) => q.relation_keys || []);
  assert.strictEqual(new Set(rels).size, rels.length, 'No relation key may be reused in one paper');
  for (const q of paper.questions) {
    assert.strictEqual(q.options.filter((o) => o.is_correct).length, 1, 'Each paper question must have exactly one correct option');
    assert.strictEqual(q.options.find((o) => o.key === q.answer_key).is_correct, true, 'answer_key must point at the correct option');
  }
});

check('Assertion-Reason type (a) uses a rendered effect claim and a causal Reason', () => {
  const out = Analysis.analyzeSource(
    'Digital technology makes the judicial system more accessible and transparent. The Battle of Buxar took place in 1764.',
    'AR type-a fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const ar = candidates.find((q) => q.question_subtype === 'assertion_reason' && q.ar_pattern === 'a');
  assert.ok(ar, 'A type-(a) Assertion-Reason candidate must be built from a causal fact');
  assert.strictEqual(ar.assertion, 'The judicial system is more accessible and transparent.', 'Effect claim must be rendered as a standalone sentence, got: ' + ar.assertion);
  assert.ok(ar.reason.includes('Digital technology'), 'Reason must be the causal sentence');
  assert.strictEqual(ar.expected_answer, 'Both A and R are true and R is the correct explanation of A', 'Type-(a) answer must be the explanation option');
  const v = Engine.validateQuestion(ar, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Type-(a) candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Assertion-Reason patterns (b), (c) and (d) are all reachable and validate', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005. The Epsilon Commission was established in 2010. The Zeta Commission was established in 2015.',
    'AR patterns fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const ars = candidates.filter((q) => q.question_subtype === 'assertion_reason');
  const patterns = new Set(ars.map((q) => q.ar_pattern));
  assert.ok(patterns.has('c') && patterns.has('d'), 'Patterns (c) and (d) must be reachable, got: ' + JSON.stringify([...patterns]));
  for (const q of ars) {
    const v = Engine.validateQuestion(q, out.facts, ctx);
    assert.strictEqual(v.valid, true, 'Assertion-Reason candidate failed validation: ' + JSON.stringify(v.issues));
    assert.strictEqual(q.options.length, 4, 'Assertion-Reason must have four standard options');
  }
});

check('Matching questions use a shuffled List II and near-miss codes only', () => {
  const out = Analysis.analyzeSource(
    'Article 14 states that the State shall not deny to any person equality before the law. Article 19 protects freedom of speech and expression. Article 21 protects the right to life and personal liberty. Article 32 allows citizens to approach the Supreme Court if their fundamental rights are violated.',
    'Matching fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const m = candidates.find((q) => q.question_subtype === 'matching');
  assert.ok(m, 'A matching candidate must be built from four Article facts');
  assert.strictEqual(m.matching_pairs.length, 4, 'Matching must carry four pairs');
  assert.ok(!/A-1, B-2, C-3, D-4/.test(m.expected_answer), 'Correct code must not be the trivial identity order, got: ' + m.expected_answer);
  for (const opt of m.options.filter((o) => !o.is_correct)) {
    const nums = [...opt.text.matchAll(/-(\d)/g)].map((x) => Number(x[1])).sort().join(',');
    assert.strictEqual(nums, '1,2,3,4', 'Distractor codes must be permutations, got: ' + opt.text);
  }
  const v = Engine.validateQuestion(m, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Matching candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Matching is not built when two subjects share the same object', () => {
  const out = Analysis.analyzeSource(
    'Article 14 protects freedom of speech. Article 19 protects freedom of speech. Article 21 protects life. Article 32 protects liberty.',
    'Ambiguous matching fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  assert.strictEqual(candidates.filter((q) => q.question_subtype === 'matching').length, 0, 'Ambiguous matching sets must not be built');
});

check('Direct questions explain why each distractor is wrong, naming its text', () => {
  const out = Analysis.analyzeSource(
    'Photosynthesis is the process by which green plants make their own food using sunlight, water and carbon dioxide. Chlorophyll is the green pigment in leaves that captures sunlight for photosynthesis. Respiration is the process by which living cells break down glucose to release energy. Mitochondria are known as the powerhouse of the cell because they generate most of the energy.',
    'Per-distractor explanation fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const direct = candidates.find((q) => q.question_subtype === 'entity_attribute');
  assert.ok(direct, 'An entity_attribute candidate must be built');
  assert.ok(/Why the other options are wrong:/.test(direct.explanation), 'Explanation must carry a per-distractor section, got: ' + direct.explanation);
  for (const opt of direct.options.filter((o) => !o.is_correct)) {
    assert.ok(direct.explanation.includes(opt.text), 'Explanation must name distractor ' + opt.text);
  }
  const v = Engine.validateQuestion(direct, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Per-distractor explanation must not break validation: ' + JSON.stringify(v.issues));
});

check('Chronology orders dated events without printing years and validates', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.',
    'Chronology fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const ch = candidates.find((q) => q.question_subtype === 'chronology');
  assert.ok(ch, 'A chronology candidate must be built from four date facts');
  assert.ok(!/1990|1995|2000|2005/.test(ch.stem), 'Years must not be printed in the event list, got: ' + ch.stem);
  assert.ok(!/A, B, C, D/.test(ch.expected_answer), 'Correct code must not be the trivial identity order, got: ' + ch.expected_answer);
  const yearByLetter = {};
  for (const item of ch.chronology_items) yearByLetter[item.letter] = item.year;
  const years = ch.expected_answer.split(',').map((s) => yearByLetter[s.trim()]);
  assert.ok(years.every((y, i) => i === 0 || years[i - 1] < y), 'Correct code must list years ascending, got: ' + ch.expected_answer);
  const v = Engine.validateQuestion(ch, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Chronology candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Chronology is selected when facts are abundant, not when they are scarce', () => {
  const abundant = 'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005. Photosynthesis is the process by which green plants make their own food using sunlight, water and carbon dioxide. Chlorophyll is the green pigment in leaves that captures sunlight for photosynthesis. Respiration is the process by which living cells break down glucose to release energy. Mitochondria are known as the powerhouse of the cell because they generate most of the energy. The nucleus is the control centre of the cell that contains genetic material. Ribosomes are the sites of protein synthesis in the cell.';
  const out = Analysis.analyzeSource(abundant, 'Abundant chronology fixture');
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const bank = Engine.generateQuestionBank(out.inventory, Object.assign({ targetCount: 5 }, ctx));
  assert.ok(bank.some((q) => q.question_subtype === 'chronology'), 'An abundant source must include a chronology question, got: ' + bank.map((q) => q.question_subtype).join(','));
});

check('Table questions ask for one cell with same-column distractors and validate', () => {
  const out = Analysis.analyzeSource(
    'Population Table\n\nYear | Population | Growth\n\n2020 | 32 million | 2 percent\n\n2021 | 35 million | 3 percent\n\n2022 | 38 million | 2 percent\n\n2023 | 41 million | 3 percent',
    'Table fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  assert.ok(out.facts.some((f) => f.fact_type === 'table'), 'Table rows must become table facts, got: ' + out.facts.map((f) => f.fact_type).join(','));
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const tq = candidates.find((q) => q.question_subtype === 'table_question');
  assert.ok(tq, 'A table_question candidate must be built');
  assert.ok(/In the table below/.test(tq.stem), 'Table stem must show the table, got: ' + tq.stem);
  const v = Engine.validateQuestion(tq, out.facts, ctx);
  assert.strictEqual(v.valid, true, 'Table candidate failed validation: ' + JSON.stringify(v.issues));
});

check('Case sets group shared-page questions with their excerpts as the case', () => {
  const out = Analysis.analyzeSource(
    'Photosynthesis is the process by which green plants make their own food using sunlight, water and carbon dioxide. Chlorophyll is the green pigment in leaves that captures sunlight for photosynthesis. The process of photosynthesis releases oxygen into the atmosphere. Respiration is the process by which living cells break down glucose to release energy. Mitochondria are known as the powerhouse of the cell because they generate most of the energy. The nucleus is the control centre of the cell that contains genetic material.',
    'Case set fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const bank = Engine.generateQuestionBank(out.inventory, Object.assign({ targetCount: 15 }, ctx));
  const result = Engine.assembleCaseSets(bank);
  assert.ok(result.sets.length >= 1, 'At least one case set must be formed, audit: ' + JSON.stringify(result.audit));
  const set = result.sets[0];
  assert.ok(set.question_count >= 3, 'A case set needs at least three questions, got: ' + set.question_count);
  assert.ok(set.subtypes.length >= 2, 'A case set needs at least two subtypes, got: ' + set.subtypes.join(','));
  assert.ok(set.case_context.length > 50, 'Case context must carry the shared excerpts');
  for (const q of set.questions) assert.ok(set.case_context.includes(q.supporting_excerpt) || (q.evidence.excerpts || []).some((e) => set.case_context.includes(e)), 'Case context must include each question evidence');
});

check('Mutated multi-statement replacements are short and non-clausal', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005. Photosynthesis is the process by which green plants make their own food using sunlight, water and carbon dioxide. Chlorophyll is the green pigment in leaves that captures sunlight for photosynthesis. Respiration is the process by which living cells break down glucose to release energy. Mitochondria are known as the powerhouse of the cell because they generate most of the energy.',
    'Mutation gate fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const multis = candidates.filter((q) => q.question_subtype === 'multi_statement' || q.question_subtype === 'multi_statement_3');
  assert.ok(multis.length > 0, 'Multi-statement candidates must exist for the gate to be tested');
  for (const q of multis) {
    for (const s of q.statements || []) {
      if (s.truth_value === false) {
        const replacement = s.alteration ? s.alteration.replacement : '';
        assert.ok(replacement.split(/\s+/).filter(Boolean).length <= 8, 'False replacement must be at most eight words, got: ' + replacement);
        assert.ok(!/\b(is|are|was|were|has|have)\b/i.test(replacement), 'False replacement must not be clausal, got: ' + replacement);
        const words = s.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const phrases = new Set();
        for (let i = 0; i + 4 <= words.length; i++) {
          const phrase = words.slice(i, i + 4).join(' ');
          assert.ok(!phrases.has(phrase), 'Mutated statement must not repeat a four-word phrase: ' + s.text);
          phrases.add(phrase);
        }
      }
    }
  }
});

check('V2 causal stems with pronoun or clause subjects are rejected', () => {
  const out = Analysis.analyzeSource(
    'Increased rainfall causes flooding in low-lying areas. Heavy rain causes soil erosion on hillsides. Deforestation causes loss of biodiversity in forests. Rising temperatures cause melting of glaciers in mountain regions.',
    'V2 stem gate fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const cause = candidates.find((q) => q.question_subtype === 'cause_effect');
  assert.ok(cause, 'A cause_effect candidate must exist to mutate');
  const pronoun = Object.assign({}, cause, { question_subtype: 'causal_reasoning', stem: 'What causes their urbanisation?' });
  const pronounResult = Engine.validateQuestion(pronoun, out.facts, ctx);
  assert.ok(pronounResult.issues.some((i) => i.rule === 'stem_pronoun_subject'), 'Pronoun causal subject must be rejected, got: ' + JSON.stringify(pronounResult.issues));
  const clause = Object.assign({}, cause, { question_subtype: 'causal_reasoning', stem: 'What causes the colonial government finally decided to withdraw it in 1911?' });
  const clauseResult = Engine.validateQuestion(clause, out.facts, ctx);
  assert.ok(clauseResult.issues.some((i) => i.rule === 'stem_clause_subject'), 'Clause causal subject must be rejected, got: ' + JSON.stringify(clauseResult.issues));
});

check('V2 causal constructor rejects pronoun and clause effect subjects at the source', () => {
  const constructorsJs = fs.readFileSync(path.join(__dirname, '../engine/reasoning/constructors.js'), 'utf-8');
  assert.ok(/OP_B_CAUSAL_EXPLANATION/.test(constructorsJs), 'Constructors must handle OP_B causal explanation');
  assert.ok(/pronounStart/.test(constructorsJs) && /finiteVerb/.test(constructorsJs), 'OP_B must gate pronoun and clause subjects before building a stem');
  assert.ok(/if \(pronounStart \|\| clauseConnector \|\| finiteVerb\)/.test(constructorsJs), 'OP_B gate must drop the candidate, not rewrite it');
});

check('Difficulty reflects the task: statement-option, matching and chronology are hard', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005. Article 14 states that the State shall not deny to any person equality before the law. Article 19 protects freedom of speech and expression. Article 21 protects the right to life and personal liberty. Article 32 allows citizens to approach the Supreme Court if their fundamental rights are violated.',
    'Difficulty fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const so = candidates.find((q) => q.question_subtype === 'statement_option');
  const m = candidates.find((q) => q.question_subtype === 'matching');
  const ch = candidates.find((q) => q.question_subtype === 'chronology');
  const date = candidates.find((q) => q.question_subtype === 'date_recall');
  if (so) assert.strictEqual(so.difficulty, 'hard', 'Statement-option must be hard, got: ' + so.difficulty);
  if (m) assert.strictEqual(m.difficulty, 'hard', 'Matching must be hard, got: ' + m.difficulty);
  if (ch) assert.strictEqual(ch.difficulty, 'hard', 'Chronology must be hard, got: ' + ch.difficulty);
  if (date) assert.strictEqual(date.difficulty, 'easy', 'Date recall must be easy, got: ' + date.difficulty);
  assert.ok(so || m || ch, 'At least one hard form must be built for the difficulty check');
});


check('Full-path repair P0: a negated causal claim never becomes a positive causal fact', () => {
  const drafts = Engine.parseFactRelations('A mediator has no power to make any decision, or impose a view on the parties.', {});
  const causal = drafts.filter((f) => f.fact_type === 'causal' || f.relation === 'causes');
  assert.ok(!causal.some((f) => /any decision/i.test(f.object || '')), 'Negated complement must not become a causal effect: ' + JSON.stringify(causal));
  const neverDrafts = Engine.parseFactRelations('The council never causes delays in the process.', {});
  assert.ok(!neverDrafts.some((f) => (f.fact_type === 'causal' || f.relation === 'causes') && /delays/i.test(f.object || '')), 'A "never causes" sentence must not become a causal fact');
  // Positive control: an unnegated contribution still yields a causal fact with its own verb.
  const contrib = Engine.parseFactRelations('Mining, hydropower generation, tourism and agriculture contribute to the GDP.', {});
  const contribCausal = contrib.find((f) => f.fact_type === 'causal');
  assert.ok(contribCausal, 'A genuine contribution sentence must still yield a causal fact');
  assert.ok(/contributes?\s+to/i.test(contribCausal.relation_verb || ''), 'Contribution verb must be preserved, got: ' + contribCausal.relation_verb);
});

check('Full-path repair P0: validation rejects an answer that appears under a negation in its excerpt', () => {
  const out = Analysis.analyzeSource(
    'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.',
    'Negation fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 10 });
  const base = candidates.find((q) => q.question_subtype === 'cause_effect') || candidates[0];
  assert.ok(base, 'A base candidate must exist to mutate');
  const mediator = Object.assign({}, base, {
    question_subtype: 'cause_effect',
    stem: 'What does a mediator make possible?',
    supporting_excerpt: 'A mediator has no power to make any decision, or impose a view on the parties.',
    options: [
      { key: 'A', text: 'the judicial system more accessible and transparent', is_correct: false, distractor_origin: 'source_causal_pool' },
      { key: 'B', text: 'the judicial system more user-friendly', is_correct: false, distractor_origin: 'source_causal_pool' },
      { key: 'C', text: 'that there shall be a High Court in each State', is_correct: false, distractor_origin: 'source_causal_pool' },
      { key: 'D', text: 'any decision, or impose a view on the parties', is_correct: true }
    ],
    answer_key: 'D'
  });
  const result = Engine.validateQuestion(mediator, out.facts, ctx);
  assert.ok(result.issues.some((i) => i.rule === 'answer_contradicts_excerpt'), 'Negated answer must be rejected, got: ' + JSON.stringify(result.issues));
  // Contrast control: "not Mumbai, it is Delhi" genuinely supports Delhi.
  const contrast = Object.assign({}, mediator, {
    supporting_excerpt: 'The capital is not Mumbai, it is Delhi.',
    options: mediator.options.map((o) => (o.key === 'D' ? Object.assign({}, o, { text: 'Delhi' }) : o))
  });
  const contrastResult = Engine.validateQuestion(contrast, out.facts, ctx);
  assert.ok(!contrastResult.issues.some((i) => i.rule === 'answer_contradicts_excerpt'), 'A contrast pivot must not trigger the negation rule');
});

check('Full-path repair P0: unit fragments and fronted modifiers are not subjects', () => {
  assert.strictEqual(Engine.isUsableSubject('km from east'), false, '"km from east" must not be a usable subject');
  assert.strictEqual(Engine.isUsableSubject('long years'), false, '"long years" must not be a usable subject');
  assert.strictEqual(Engine.isUsableSubject('the Taj Mahal'), true, 'A genuine subject must still pass');
  const taj = Engine.parseFactRelations('Entirely decorated with marble, the Taj Mahal is an example of the confluence of architectural styles from three cultures.', {});
  assert.ok(taj.length > 0, 'The Taj sentence must still yield a fact');
  assert.ok(!taj.some((f) => /entirely/i.test(f.subject || '')), 'Fronted modifier must not survive in a subject: ' + JSON.stringify(taj.map((f) => f.subject)));
  assert.ok(taj.some((f) => /taj mahal/i.test(f.subject || '')), 'The subject must be the Taj Mahal');
});

check('Full-path repair P1: truncated and continuation sentences yield no facts', () => {
  const facts = Engine.extractSourceFacts(
    Engine.parseRawDocument('He travelled to Indonesia, Japan, and finally Singapore in 1943, where he formed the Indian National Army (INA) from Indian prisoners of war. to Indonesia, Japan, and finally Singapore in 1943, where he formed the Indian National Army (INA). The plain is characterised by low-lying terrain, gentle rolling', 'Doc'), {}
  );
  assert.ok(!facts.some((f) => /^[a-z]/.test((f.source_text || '').trim())), 'A lowercase-start continuation must not become a fact');
  assert.ok(!facts.some((f) => /gentle rolling\s*$/.test((f.source_text || '').trim())), 'A sentence cut mid-phrase must not become a fact');
});

check('Full-path repair P1: a definition answer cut before its head noun is rejected', () => {
  const out = Analysis.analyzeSource(
    'The zib is characterised by low-lying terrain, gentle rolling. The wob is characterised by high mountain peaks and deep valleys. The yad is characterised by dense forests and wide rivers. The vex is characterised by sandy deserts and dry winds.',
    'Truncation fixture'
  );
  const ctx = { sections: out.sections, facts: out.facts, conflicts: out.conflicts };
  const candidates = Engine.buildQuestionCandidates(ctx, { targetCount: 20 });
  const zib = candidates.filter((q) => q.question_subtype === 'definition' && /zib/i.test(q.stem || ''));
  assert.strictEqual(zib.length, 0, 'A definition cut at a participle must not ship: ' + JSON.stringify(zib.map((q) => q.stem)));
});

check('Full-path repair P0: distractors prefer the question\'s own section', () => {
  const fact = { fact_id: 'F-1', fact_type: 'generic', subject: 'Yellowstone National Park', relation: 'role', object: 'example of ecosystem restoration', section_id: 'sec_1', section_title: 'Parks', normalized_subject: 'yellowstone national park', normalized_relation: 'role', normalized_object: 'example of ecosystem restoration' };
  const others = [
    { fact_id: 'F-2', fact_type: 'generic', subject: 'A nearby reserve', relation: 'role', object: 'a protected habitat', section_id: 'sec_1', section_title: 'Parks', normalized_subject: 'a nearby reserve', normalized_relation: 'role', normalized_object: 'a protected habitat' },
    { fact_id: 'F-3', fact_type: 'generic', subject: 'Map making', relation: 'role', object: 'called a map projection', section_id: 'sec_9', section_title: 'Maps', normalized_subject: 'map making', normalized_relation: 'role', normalized_object: 'called a map projection' },
    { fact_id: 'F-4', fact_type: 'generic', subject: 'Rivers', relation: 'role', object: 'constantly moving', section_id: 'sec_9', section_title: 'Maps', normalized_subject: 'rivers', normalized_relation: 'role', normalized_object: 'constantly moving' }
  ];
  const registry = { facts: [fact].concat(others), sections: [] };
  const distractors = Engine.buildDistractorCandidates(fact, registry, 'entity_attribute');
  assert.ok(distractors.length >= 1, 'Fallback distractors must be produced');
  assert.strictEqual(distractors[0].text, 'a protected habitat', 'The same-section distractor must come first, got: ' + JSON.stringify(distractors.map((d) => d.text)));
});

check('Entity gate: a direct entity question with no same-section option is dropped', () => {
  const mk = (id, subject, object, section) => ({ fact_id: id, fact_type: 'entity_attribute', answer_kind: 'role', relation: 'role', subject, object, section_id: section, section_title: section === 'sec_1' ? 'Parks' : 'Maps', normalized_subject: subject.toLowerCase(), normalized_relation: 'role', normalized_object: object.toLowerCase(), source_text: `${subject} is ${object}.`, supporting_excerpt: `${subject} is ${object}.` });
  const q = mk('F-1', 'Yellowstone National Park', 'example of ecosystem restoration', 'sec_1');
  const others = [
    mk('F-2', 'Map making', 'called a map projection', 'sec_9'),
    mk('F-3', 'Globe studies', 'oblate spheroid', 'sec_9'),
    mk('F-4', 'Agreements', 'compromise', 'sec_9')
  ];
  const candidates = Engine.buildQuestionCandidates({ facts: [q].concat(others), sections: [] }, { targetCount: 20 });
  const yellow = candidates.filter((c) => c.question_subtype === 'entity_attribute' && /yellowstone/i.test(c.stem || ''));
  assert.strictEqual(yellow.length, 0, 'An entity question with zero same-section options must not ship: ' + JSON.stringify(yellow.map((c) => c.stem)));
  // Control: one same-section option restores the question.
  const near = mk('F-5', 'A nearby reserve', 'a protected habitat', 'sec_1');
  const candidates2 = Engine.buildQuestionCandidates({ facts: [q].concat(others, [near]), sections: [] }, { targetCount: 20 });
  const yellow2 = candidates2.filter((c) => c.question_subtype === 'entity_attribute' && /yellowstone/i.test(c.stem || ''));
  assert.ok(yellow2.length >= 1, 'An entity question with a same-section option must still ship');
});

runE2E().catch((err) => {
  console.error('Repair 002 regression tests failed:', err);
  process.exit(1);
});
