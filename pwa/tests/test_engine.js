/**
 * StudySynth Lite PWA Engine Test Suite
 *
 * These tests exercise source-grounded fact extraction, conflict detection,
 * verified question construction, typed distractors, and deterministic output.
 * They deliberately assert answers, evidence, and explanations rather than only
 * checking that a question has four options.
 */

const assert = require('assert');
const path = require('path');

const Engine = require('../engine/generator.js');
const DocParser = require('../engine/pdfParser.js');
const SampleData = require('../sample_data.js');

console.log('--- Running StudySynth Lite PWA Engine Tests ---');

const FILLER_PHRASES = [
  'in accordance with statutory guidelines',
  'under applicable norms',
  'nodal oversight of competent statutory authority',
  'regulatory framework is strictly deferred',
  'jurisdiction applies exclusively to foreign commercial enterprises',
  'provisions are restricted to emergency measures'
];

function parse(text, title = 'Fixture') {
  return Engine.parseRawDocument(text, title);
}

function analyze(text, title = 'Fixture', options = {}) {
  const sections = parse(text, title);
  const facts = Engine.extractSourceFacts(sections, options);
  const conflictResult = Engine.detectFactConflicts(facts);
  const inventory = Engine.buildKnowledgeInventory(sections, {
    facts: conflictResult.facts,
    conflicts: conflictResult.conflicts,
    sourceMeta: options.sourceMeta
  });
  const context = {
    sections,
    facts: conflictResult.facts,
    conflicts: conflictResult.conflicts
  };
  let bank = null;
  let error = null;
  try {
    bank = Engine.generateQuestionBank(inventory, Object.assign({
      targetCount: 15
    }, context, options));
  } catch (err) {
    error = err;
  }
  let validation = null;
  if (bank) {
    validation = Engine.validateQuestionBank(bank, Object.assign({
      candidateCount: bank.generation ? bank.generation.totalCandidates : bank.length
    }, context));
  }
  return { sections, facts: conflictResult.facts, conflicts: conflictResult.conflicts, conflictResult, inventory, bank, error, validation, context };
}

function normalize(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function factsOfType(facts, type) {
  return facts.filter((f) => f.fact_type === type);
}

function findFact(facts, relation, object) {
  return facts.find((f) =>
    f.relation === relation &&
    (object === undefined || normalize(f.object) === normalize(object))
  );
}

function correctOption(question) {
  const matches = (question.options || []).filter((o) => o.key === question.answer_key);
  assert.strictEqual(matches.length, 1, `${question.id}: answer_key must select exactly one option`);
  assert.strictEqual(matches[0].is_correct, true, `${question.id}: selected option must be the correct option`);
  return matches[0];
}

function assertQuestionContract(question, facts) {
  assert(question.id, 'Question must have a stable id');
  assert(question.type === 'single_choice' || question.type === 'multi_statement', `${question.id}: unsupported renderer type ${question.type}`);
  assert(question.question_subtype, `${question.id}: question_subtype is required`);
  assert(question.stem && question.stem.length > 12, `${question.id}: stem is missing`);
  assert(Array.isArray(question.options) && question.options.length === 4, `${question.id}: expected exactly four options`);
  assert(Array.isArray(question.knowledge_units) && question.knowledge_units.length > 0, `${question.id}: knowledge unit reference is required`);
  assert(question.source_title, `${question.id}: source_title is required`);
  assert(question.source_page != null, `${question.id}: source_page is required`);
  assert(question.supporting_excerpt, `${question.id}: supporting_excerpt is required`);
  assert(question.explanation && question.explanation.length > 20, `${question.id}: explanation is required`);
  assert(question.evidence && Array.isArray(question.evidence.fact_ids), `${question.id}: evidence fact ids are required`);
  assert.strictEqual((question.options || []).filter((o) => o.is_correct).length, 1, `${question.id}: exactly one option must be correct`);

  const good = correctOption(question);
  const normalizedOptions = question.options.map((o) => normalize(o.text));
  assert.strictEqual(new Set(normalizedOptions).size, 4, `${question.id}: options must be distinct after normalization`);
  assert.strictEqual(normalizedOptions.filter((t) => t === normalize(good.text)).length, 1, `${question.id}: correct option must not be duplicated`);
  assert(!FILLER_PHRASES.some((p) => normalize(good.text).includes(p)), `${question.id}: correct option must not be filler`);

  for (const option of question.options) {
    assert(option.key && option.text, `${question.id}: every option needs a key and text`);
    assert(!FILLER_PHRASES.some((p) => normalize(option.text).includes(p)), `${question.id}: option uses forbidden generic filler: ${option.text}`);
    if (!option.is_correct) {
      assert(option.distractor_origin && option.distractor_origin !== 'generic_filler', `${question.id}: distractor origin must be typed`);
    }
  }

  const referenced = (question.evidence.fact_ids || []).map((id) => facts.find((f) => f.fact_id === id));
  assert(referenced.every(Boolean), `${question.id}: every evidence fact id must exist`);

  for (const fact of referenced) {
    if (!fact) continue;
    assert.notStrictEqual(fact.conflict_status, 'conflicting', `${question.id}: question uses a conflicting fact`);
    assert(normalize(question.explanation).includes(normalize(fact.supporting_excerpt)), `${question.id}: explanation must quote the exact source excerpt`);
  }

  if (question.question_subtype === 'multi_statement') {
    assert(Array.isArray(question.statements) && question.statements.length === 2, `${question.id}: expected two independently verified statements`);
    const identified = question.statements.filter((s) => s.truth_value === true).length;
    const expectedText = identified === 2
      ? 'Both 1 and 2'
      : identified === 1
        ? (question.statements[0].truth_value ? '1 only' : '2 only')
        : 'Neither 1 nor 2';
    assert.strictEqual(good.text, expectedText, `${question.id}: answer option must match the statement truth pattern`);
    assert(question.prompt_suffix, `${question.id}: multi-statement renderer needs a prompt suffix`);
    question.statements.forEach((statement, index) => {
      assert.strictEqual(statement.number, index + 1, `${question.id}: statements need renderer numbers`);
    });
    for (const statement of question.statements) {
      assert(statement.fact_id, `${question.id}: every statement needs a fact id`);
      assert(typeof statement.truth_value === 'boolean', `${question.id}: every statement needs a truth value`);
      assert(statement.source_excerpt, `${question.id}: every statement needs source evidence`);
      if (!statement.truth_value) {
        assert(statement.alteration && statement.alteration.original && statement.alteration.replacement, `${question.id}: false statement must record its exact alteration`);
        assert.notStrictEqual(normalize(statement.alteration.original), normalize(statement.alteration.replacement), `${question.id}: false statement alteration must change the value`);
      }
    }
    return;
  }

  const fact = referenced[0];
  assert(fact, `${question.id}: primary source fact is required`);
  assert.strictEqual(question.expected_answer, good.text, `${question.id}: expected answer must equal the keyed option`);

  // Proof-carrying V2 questions answer with the verified derived proposition,
  // not with a single extracted fact value. The proof contract replaces the
  // single-fact equality check while keeping evidence and answer binding.
  if (question.proof_trace && question.derived_proposition) {
    const derived = question.derived_proposition;
    const allowed = [derived.object, derived.subject, derived.condition]
      .filter(Boolean)
      .map(normalize);
    assert(allowed.includes(normalize(good.text)), `${question.id}: keyed answer must equal the verified derived proposition`);
    assert(question.primary_operator, `${question.id}: proof-carrying question must name its operator`);
    assert(Array.isArray(question.proof_trace.premises) && question.proof_trace.premises.length > 0, `${question.id}: proof trace must carry premises`);
    return;
  }

  if (question.question_subtype === 'sequence_order') {
    assert.strictEqual(good.text, fact.sequence_items.join(' → '), `${question.id}: sequence answer must preserve source order`);
  } else if (question.question_subtype === 'classification_membership') {
    assert(fact.members.some((m) => normalize(m) === normalize(good.text)), `${question.id}: membership answer must be a stated member`);
  } else {
    assert.strictEqual(normalize(good.text), normalize(fact.object), `${question.id}: keyed answer must equal the extracted fact value`);
  }
}

// ---------------------------------------------------------------------------
// Public API compatibility
// ---------------------------------------------------------------------------
console.log('[Test 1] Verifying the preserved public API...');
for (const name of [
  'cleanText', 'splitSentences', 'extractAnchors', 'balanceDistractorLength',
  'buildKnowledgeInventory', 'generateQuestionBank', 'validateQuestionBank',
  'parseRawDocument', 'extractSourceFacts', 'parseFactRelations',
  'detectFactConflicts', 'buildDistractorCandidates', 'buildQuestionCandidates',
  'validateQuestion'
]) {
  assert.strictEqual(typeof Engine[name], 'function', `StudySynthEngine.${name} must remain available`);
}
console.log('  ✓ Public API is complete.');

// ---------------------------------------------------------------------------
// Fixture A: dates and temporal scope
// ---------------------------------------------------------------------------
console.log('[Test 2] Fixture A — dates, initial location, destination, and move year...');
const fixtureA = 'The Reserve Bank of India was established in 1935. Its central office was initially in Kolkata and moved to Mumbai in 1937.';
const analyzedA = analyze(fixtureA, 'RBI History');
assert.strictEqual(analyzedA.facts.length >= 4, true, 'Fixture A must yield at least four facts');
const establishment = findFact(analyzedA.facts, 'establishment_year', '1935');
const initialLocation = findFact(analyzedA.facts, 'initial_location', 'Kolkata');
const destination = findFact(analyzedA.facts, 'destination_location', 'Mumbai');
const moveYear = findFact(analyzedA.facts, 'move_year', '1937');
assert(establishment, 'Establishment year 1935 must be extracted');
assert(initialLocation, 'Initial office location Kolkata must be extracted');
assert(destination, 'Destination office location Mumbai must be extracted');
assert(moveYear, 'Office move year 1937 must be extracted');
assert.notStrictEqual(establishment.normalized_relation, moveYear.normalized_relation, 'Establishment and move years must not share a relation');
assert.strictEqual(analyzedA.conflicts.length, 0, 'Fixture A has no conflict');
for (const fact of analyzedA.facts) {
  const section = analyzedA.sections.find((s) => s.id === fact.section_id);
  assert(section, `${fact.fact_id}: section must exist`);
  assert.strictEqual(section.text.slice(fact.source_start, fact.source_end), fact.source_text, `${fact.fact_id}: source offsets must select the exact source text`);
  assert(normalize(fact.source_text).includes(normalize(fact.supporting_excerpt)), `${fact.fact_id}: excerpt must occur in the source text`);
}
assert(analyzedA.bank, `Fixture A must produce verified questions: ${analyzedA.error && analyzedA.error.message}`);
assert(analyzedA.bank.length >= 2, 'Fixture A must support more than one non-conflicting fact question');
for (const question of analyzedA.bank) assertQuestionContract(question, analyzedA.facts);
assert(analyzedA.bank.some((q) => /established|1935/i.test(q.stem + q.explanation)), 'At least one question must use the establishment fact');
console.log('  ✓ Temporal scope and source offsets verified.');

// ---------------------------------------------------------------------------
// Fixture B: definitions
// ---------------------------------------------------------------------------
console.log('[Test 3] Fixture B — explicit definitions...');
const fixtureB = 'Photosynthesis is the process by which green plants use sunlight to synthesize food from carbon dioxide and water.';
const analyzedB = analyze(fixtureB, 'Biology');
const definition = findFact(analyzedB.facts, 'definition');
assert(definition, 'Definition fact must be extracted');
assert(/green plants use sunlight/i.test(definition.object), 'Definition object must preserve the source definition');
assert.strictEqual(analyzedB.conflicts.length, 0, 'A single definition has no conflict');
if (analyzedB.bank) {
  for (const question of analyzedB.bank) {
    assertQuestionContract(question, analyzedB.facts);
    if (question.question_subtype === 'definition') {
      assert.strictEqual(normalize(correctOption(question).text), normalize(definition.object), 'Definition answer must equal the extracted definition');
    }
  }
}
console.log('  ✓ Definition evidence preserved.');

// A multi-definition source must be able to produce a typed definition MCQ.
const definitionBankSource = [
  'Photosynthesis is the process by which green plants use sunlight to synthesize food.',
  'Evaporation is defined as the process by which a liquid becomes a gas.',
  'Condensation refers to the process by which a gas becomes a liquid.',
  'Sublimation means the process by which a solid changes directly into a gas.'
].join(' ');
const analyzedDefinitions = analyze(definitionBankSource, 'Definitions');
assert(analyzedDefinitions.bank, `Definition bank failed: ${analyzedDefinitions.error && analyzedDefinitions.error.message}`);
assert(analyzedDefinitions.bank.some((q) => q.question_subtype === 'definition'), 'A source with four definitions must produce a definition question');
for (const question of analyzedDefinitions.bank) assertQuestionContract(question, analyzedDefinitions.facts);
console.log('  ✓ Definition MCQ generated from multiple verified definitions.');

// ---------------------------------------------------------------------------
// Fixture C: causation
// ---------------------------------------------------------------------------
console.log('[Test 4] Fixture C — explicit cause and effect...');
const fixtureC = 'The reduction in friction allows the object to move more easily.';
const analyzedC = analyze(fixtureC, 'Physics');
const causal = findFact(analyzedC.facts, 'causes');
assert(causal, 'Causal fact must be extracted');
assert(/reduction in friction/i.test(causal.subject), 'Causal subject must be the reduction in friction');
assert(/move more easily/i.test(causal.object), 'Causal object must preserve the stated effect');
assert(!/reduction in friction/i.test(causal.object), 'Cause and effect must not be reversed');
if (analyzedC.bank) {
  for (const question of analyzedC.bank) {
    assertQuestionContract(question, analyzedC.facts);
    if (question.question_subtype === 'cause_effect') {
      assert.strictEqual(normalize(correctOption(question).text), normalize(causal.object), 'Causal answer must preserve direction');
    }
  }
}
console.log('  ✓ Cause and effect direction preserved.');

// Four explicit causal relationships provide a verified relation pool.
const causalSource = [
  'Friction causes the object to slow down.',
  'Heat leads to the metal expanding.',
  'Pressure results in the volume decreasing.',
  'Gravity causes the apple to fall.'
].join(' ');
const analyzedCausal = analyze(causalSource, 'Causal Relations');
assert(analyzedCausal.bank, `Causal bank failed: ${analyzedCausal.error && analyzedCausal.error.message}`);
assert(analyzedCausal.bank.some((q) => q.question_subtype === 'cause_effect'), 'A causal pool must produce a cause-effect question');
for (const question of analyzedCausal.bank) assertQuestionContract(question, analyzedCausal.facts);
console.log('  ✓ Cause-effect MCQ generated from a verified causal pool.');

// ---------------------------------------------------------------------------
// Fixture D: classification
// ---------------------------------------------------------------------------
console.log('[Test 5] Fixture D — explicit classification...');
const fixtureD = 'The three primary colours of light are red, green and blue.';
const analyzedD = analyze(fixtureD, 'Optics');
const membership = findFact(analyzedD.facts, 'members');
assert(membership, 'Membership fact must be extracted');
assert.deepStrictEqual(membership.members.map(normalize), ['red', 'green', 'blue'], 'Only the three stated members may be extracted');
assert.strictEqual(membership.exhaustive, true, 'The explicit three-member list must be marked as source-exhaustive');
assert(analyzedD.bank, `Classification bank failed: ${analyzedD.error && analyzedD.error.message}`);
const classification = analyzedD.bank.find((q) => q.question_subtype === 'classification_membership');
assert(classification, 'A classification question must be generated from the explicit list');
for (const question of analyzedD.bank) assertQuestionContract(question, analyzedD.facts);
assert(membership.members.map(normalize).includes(normalize(correctOption(classification).text)), 'Classification answer must be a stated member');
const oxfordFacts = Engine.extractSourceFacts(parse('The approved flags are red, white, and blue.', 'Oxford List'));
const oxfordMembership = findFact(oxfordFacts, 'members');
assert.deepStrictEqual(oxfordMembership.members.map(normalize), ['red', 'white', 'blue'], 'An Oxford comma must not merge the final two members');
const clauseFacts = Engine.extractSourceFacts(parse('The priorities include Safety vs Speed: the faster the process, the more risk it creates.', 'Clause List'));
const clauseMembership = findFact(clauseFacts, 'members');
assert.strictEqual(clauseMembership.members.length, 1, 'A colon explanation must remain one member');
assert(/the more risk it creates/.test(clauseMembership.members[0]), 'A colon explanation must not be truncated at its comma');
console.log('  ✓ Membership remains limited to the stated list, including Oxford and colon forms.');

// ---------------------------------------------------------------------------
// Fixture E: explicit sequence
// ---------------------------------------------------------------------------
console.log('[Test 6] Fixture E — explicit ordered sequence...');
const fixtureE = 'The procedure consists of three ordered steps: first inspect the sample, then record the mass, and finally calculate the density.';
const analyzedE = analyze(fixtureE, 'Procedure');
const sequence = findFact(analyzedE.facts, 'sequence');
assert(sequence, 'Sequence fact must be extracted');
assert.deepStrictEqual(sequence.sequence_items.map(normalize), [
  'inspect the sample', 'record the mass', 'calculate the density'
], 'Sequence must preserve source order');
assert(analyzedE.bank, `Sequence bank failed: ${analyzedE.error && analyzedE.error.message}`);
const sequenceQuestion = analyzedE.bank.find((q) => q.question_subtype === 'sequence_order');
assert(sequenceQuestion, 'A sequence question must be generated');
for (const question of analyzedE.bank) assertQuestionContract(question, analyzedE.facts);
assert.strictEqual(correctOption(sequenceQuestion).text, sequence.sequence_items.join(' → '), 'Sequence answer must be exact source order');
console.log('  ✓ Sequence order verified.');

// ---------------------------------------------------------------------------
// Fixture F: conflicts
// ---------------------------------------------------------------------------
console.log('[Test 7] Fixture F — contradictory facts...');
const fixtureF = 'The event occurred in 1935. The same event occurred in 1937.';
const analyzedF = analyze(fixtureF, 'Conflict');
assert(analyzedF.conflicts.length >= 1, 'A year conflict must be detected');
const conflictFacts = analyzedF.facts.filter((f) => f.conflict_status === 'conflicting');
assert(conflictFacts.length >= 2, 'Both contradictory facts must be marked conflicting');
assert(analyzedF.error, 'No year question may be published from the conflicting relation');
assert.strictEqual(analyzedF.error.code, 'NO_VERIFIED_QUESTIONS', 'Conflict-only source must abort with a clear code');
const conflictMessage = (analyzedF.error.message || '').toLowerCase();
assert(/conflict|ambiguous|reliably/.test(conflictMessage), 'Conflict error must explain the source problem');
console.log('  ✓ Conflict excluded without arbitrary selection.');

// ---------------------------------------------------------------------------
// Fixture G: option and explanation correctness
// ---------------------------------------------------------------------------
console.log('[Test 8] Fixture G — options, answer keys, and explanations...');
const contractData = [analyzedDefinitions, analyzedCausal, analyzedD, analyzedE, analyzedA];
for (const data of contractData) {
  assert(data.bank && data.bank.length > 0, 'Contract fixture must produce at least one question');
  for (const question of data.bank) assertQuestionContract(question, data.facts);
}
console.log('  ✓ Four unique options, one key, typed distractors, and quoted evidence verified.');

// ---------------------------------------------------------------------------
// Fixture H: multi-statement verification
// ---------------------------------------------------------------------------
console.log('[Test 9] Fixture H — multi-statement truth values...');
const multiSource = 'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.';
const analyzedMulti = analyze(multiSource, 'Multi');
const candidateList = Engine.buildQuestionCandidates(analyzedMulti.context, { targetCount: 10 });
const multiCandidate = candidateList.find((q) => q.question_subtype === 'multi_statement');
assert(multiCandidate, 'A multi-statement candidate must be built from unambiguous facts');
assert.strictEqual(multiCandidate.statements.length, 2, 'Multi-statement questions use two independently verified statements');
assert.strictEqual(multiCandidate.statements[0].truth_value, true, 'The first statement is the verified source statement');
assert.strictEqual(multiCandidate.statements[1].truth_value, false, 'The second statement must be an explicit alteration');
assert(multiCandidate.statements[1].alteration, 'False statement must record its alteration');
const multiValidation = Engine.validateQuestion(multiCandidate, analyzedMulti.facts, analyzedMulti.context);
assert.strictEqual(multiValidation.valid, true, `Multi candidate failed validation: ${JSON.stringify(multiValidation.issues)}`);
assertQuestionContract(multiCandidate, analyzedMulti.facts);
console.log('  ✓ Multi-statement key derives from verified truth values.');

// ---------------------------------------------------------------------------
// Fixture I: determinism
// ---------------------------------------------------------------------------
console.log('[Test 10] Fixture I — deterministic generation...');
const deterministicSource = fixtureA + ' ' + fixtureD + ' ' + fixtureE + ' ' + 'The Alpha Commission was established in 1990. The Beta Commission was established in 1995.';
const firstRun = analyze(deterministicSource, 'Determinism');
const secondRun = analyze(deterministicSource, 'Determinism');
assert(firstRun.bank && secondRun.bank, 'Deterministic fixture must generate a bank');
assert.deepStrictEqual(
  firstRun.facts.map((f) => ({ id: f.fact_id, relation: f.relation, object: f.object, start: f.source_start, end: f.source_end })),
  secondRun.facts.map((f) => ({ id: f.fact_id, relation: f.relation, object: f.object, start: f.source_start, end: f.source_end })),
  'Fact registry must be deterministic'
);
const strip = (bank) => bank.map((q) => ({
  id: q.id,
  subtype: q.question_subtype,
  stem: q.stem,
  options: q.options.map((o) => ({ key: o.key, text: o.text, correct: o.is_correct })),
  answer_key: q.answer_key,
  explanation: q.explanation
}));
assert.deepStrictEqual(strip(firstRun.bank), strip(secondRun.bank), 'Question bank must be deterministic');
console.log('  ✓ Two identical runs produced identical facts and questions.');

// ---------------------------------------------------------------------------
// Fixture J: unsupported material
// ---------------------------------------------------------------------------
console.log('[Test 11] Fixture J — unsupported prose abstains...');
const fixtureJ = 'A remarkable development occurred, producing several important consequences for society.';
const analyzedJ = analyze(fixtureJ, 'Unsupported');
assert(analyzedJ.inventory.length >= 1, 'Unsupported prose must still remain available as revision material');
assert(analyzedJ.inventory[0].statement.includes('remarkable development'), 'Revision material must preserve the original sentence');
assert(analyzedJ.error, 'Unsupported prose must not produce a fabricated MCQ');
assert.strictEqual(analyzedJ.error.code, 'NO_VERIFIED_QUESTIONS', 'Unsupported prose must abort with NO_VERIFIED_QUESTIONS');
console.log('  ✓ Unsupported prose preserved for revision but skipped for MCQs.');

// ---------------------------------------------------------------------------
// Fixture K: negative, decimal, percentage, and comparative values
// ---------------------------------------------------------------------------
console.log('[Test 12] Fixture K — unsafe transformations are refused...');
const fixtureK = [
  'The chamber cannot exceed 45.5 degrees.',
  'The success rate was not 25 percent.',
  'The sample is less than 10 km from the base.',
  'The rule applies to not only students but also teachers.'
].join(' ');
const analyzedK = analyze(fixtureK, 'Negative Values');
assert(analyzedK.inventory.length >= 1, 'Negative prose must remain in the inventory');
for (const fact of analyzedK.facts) {
  if (fact.fact_type === 'numeric') {
    assert(
      fact.polarity === 'negative' || fact.precision === 'approximate' || fact.extraction_method === 'fallback',
      `${fact.fact_id}: negative or approximate numeric facts must be marked unsafe`
    );
  }
}
if (analyzedK.bank) {
  for (const question of analyzedK.bank) {
    assertQuestionContract(question, analyzedK.facts);
    const answer = normalize(correctOption(question).text);
    assert(!/48\.5|30 percent|15 km/.test(answer), `Unsafe transformed answer escaped validation: ${answer}`);
  }
}

const decimalSections = parse('The reported rate was 12.5 percent. The chamber reading was 45.5 degrees.', 'Decimal Values');
const decimalFacts = Engine.extractSourceFacts(decimalSections);
const decimalFact = decimalFacts.find((fact) => fact.fact_type === 'numeric' && /12\.5\s+percent/i.test(fact.object));
assert(decimalFact, 'A decimal percentage must be extracted as one source value');
assert.strictEqual(decimalFact.source_text, 'The reported rate was 12.5 percent.', 'Decimal points must not split a sentence');
assert.strictEqual(
  decimalSections[0].text.slice(decimalFact.source_start, decimalFact.source_end),
  decimalFact.source_text,
  'Decimal facts must retain exact source offsets'
);
const multiBank = analyzedMulti.bank;
if (multiBank) {
  for (const question of multiBank.filter((q) => q.question_subtype === 'multi_statement')) {
    for (const statement of question.statements.filter((s) => !s.truth_value)) {
      const fact = analyzedMulti.facts.find((f) => f.fact_id === statement.fact_id);
      assert(fact, 'False statement must reference a real fact');
      assert.strictEqual(normalize(statement.alteration.original), normalize(fact.object), 'False statement must alter the original value');
      assert.notStrictEqual(normalize(statement.alteration.replacement), normalize(fact.object), 'False replacement must differ');
      const supported = analyzedMulti.facts.some((f) =>
        f.fact_id !== fact.fact_id &&
        f.normalized_subject === fact.normalized_subject &&
        f.normalized_relation === fact.normalized_relation &&
        f.normalized_object === normalize(statement.alteration.replacement) &&
        (f.temporal_scope || '') === (fact.temporal_scope || '')
      );
      assert.strictEqual(supported, false, 'A false value must not be supported elsewhere under the same scope');
    }
  }
}
console.log('  ✓ Negatives, decimals, percentages, and comparisons remain source-bound.');

// ---------------------------------------------------------------------------
// Fixture L: low-confidence OCR must be confirmed or corrected
// ---------------------------------------------------------------------------
console.log('[Test 12b] Fixture L — low-confidence OCR is never published as verified...');
const lowOcrSource = [
  'The Alpha Commission was established in 1990.',
  'The Beta Commission was established in 1995.',
  'The Gamma Commission was established in 2000.',
  'The Delta Commission was established in 2005.',
  'The situation remained unclear.'
].join(' ');
const lowMeta = { origin: 'ocr', confidence: 72, confirmed: false, edited: false };
const analyzedLow = analyze(lowOcrSource, 'Low OCR', { sourceMeta: lowMeta });
assert(analyzedLow.facts.length >= 4, 'Low-confidence OCR must still extract source facts for review');
for (const fact of analyzedLow.facts) {
  assert.notStrictEqual(fact.confidence_class, 'verified', `${fact.fact_id}: low-confidence OCR must not be marked verified`);
  assert.strictEqual(fact.confidence_class, 'ocr-unverified', `${fact.fact_id}: unconfirmed OCR must be ocr-unverified`);
}
assert(analyzedLow.error, 'Unconfirmed low-confidence OCR must not publish questions');
assert.strictEqual(analyzedLow.error.code, 'NO_VERIFIED_QUESTIONS', 'Unconfirmed OCR must abort with NO_VERIFIED_QUESTIONS');
for (const unit of analyzedLow.inventory) {
  assert.notStrictEqual(unit.confidence_class, 'verified', 'Low-confidence knowledge units must not be marked verified');
  assert.strictEqual(unit.confidence_class, 'ocr-unverified', 'Low-confidence knowledge units must retain OCR provenance');
}

const confirmedMeta = { origin: 'ocr', confidence: 72, confirmed: true, edited: false };
const analyzedConfirmed = analyze(lowOcrSource, 'Confirmed OCR', { sourceMeta: confirmedMeta });
assert(analyzedConfirmed.bank && analyzedConfirmed.bank.length > 0, 'Explicitly confirmed OCR must be allowed to generate');
for (const fact of analyzedConfirmed.facts) {
  assert.strictEqual(fact.confidence_class, 'ocr-confirmed', `${fact.fact_id}: confirmed OCR must stay ocr-confirmed, not verified`);
  assert.notStrictEqual(fact.confidence_class, 'verified', 'Confirmed OCR must not be reclassified as verified');
}
for (const unit of analyzedConfirmed.inventory) {
  assert.strictEqual(unit.confidence_class, 'ocr-confirmed', 'Confirmed OCR knowledge units must retain their provenance');
}
console.log('  ✓ Low-confidence OCR is blocked until confirmed and never marked verified.');

// ---------------------------------------------------------------------------
// Distractor length compatibility
// ---------------------------------------------------------------------------
console.log('[Test 13] Distractor balancing never invents wording...');
const short = 'Short statement.';
const balanced = Engine.balanceDistractorLength('A longer correct answer that should not be padded.', short);
assert.strictEqual(balanced, 'Short statement.', 'balanceDistractorLength must not add invented filler or truncate meaning');
assert(!FILLER_PHRASES.some((p) => normalize(balanced).includes(p)), 'balanceDistractorLength must not invent regulatory language');

// ---------------------------------------------------------------------------
// Validation gate
// ---------------------------------------------------------------------------
console.log('[Test 14] Strict validation rejects structural look-alikes...');
const validatorSource = 'The Alpha Commission was established in 1990. The Beta Commission was established in 1995. The Gamma Commission was established in 2000. The Delta Commission was established in 2005.';
const validatorData = analyze(validatorSource, 'Validator');
assert(validatorData.bank && validatorData.bank.length > 0, 'Validator fixture must generate questions');
const validatorQuestion = JSON.parse(JSON.stringify(validatorData.bank[0]));
validatorQuestion.options[1].text = validatorQuestion.options[0].text;
validatorQuestion.options[1].is_correct = false;
const badValidation = Engine.validateQuestion(validatorQuestion, validatorData.facts, validatorData.context);
assert.strictEqual(badValidation.valid, false, 'Duplicate option text must fail validation');
assert(badValidation.issues.some((issue) => issue.rule === 'option_uniqueness'), 'Duplicate option must report option_uniqueness');

const badBankQuestion = JSON.parse(JSON.stringify(validatorData.bank[0]));
badBankQuestion.explanation = 'This answer is correct.';
const badBank = Engine.validateQuestionBank([badBankQuestion], {
  facts: validatorData.facts,
  sections: validatorData.sections,
  candidateCount: 1
});
assert.strictEqual(badBank.valid, false, 'Explanation without quoted source evidence must fail bank validation');
assert(badBank.issues.some((issue) => issue.rule === 'explanation_evidence'), 'Missing evidence must report explanation_evidence');

const goodValidation = Engine.validateQuestionBank(validatorData.bank, {
  facts: validatorData.facts,
  sections: validatorData.sections,
  candidateCount: validatorData.bank.generation ? validatorData.bank.generation.totalCandidates : validatorData.bank.length
});
assert.strictEqual(goodValidation.valid, true, `Verified bank must pass: ${JSON.stringify(goodValidation.issues)}`);
assert.strictEqual(goodValidation.accepted, validatorData.bank.length, 'Accepted count must equal the verified bank');
assert(goodValidation.totalCandidates >= goodValidation.accepted, 'Candidate count must account for rejected candidates');
assert(goodValidation.rejected >= 0, 'Rejected count must be reported');
assert(goodValidation.subtypeDistribution && Object.keys(goodValidation.subtypeDistribution).length > 0, 'Subtype distribution must be reported');
assert(goodValidation.keyDistribution, 'Key distribution must be reported');
console.log('  ✓ Duplicate options and unsupported explanations are rejected.');

// ---------------------------------------------------------------------------
// Fixture M: a stem that points at a passage must show that passage, with the
// tested value blanked, and must never be about a pronoun or a loose fragment
// ---------------------------------------------------------------------------
console.log('[Test 14b] Passage stems show masked source context...');
const fixtureContext = 'The University of Calcutta was established in 1857 as the first modern university in South Asia. The University of Bombay was established in 1887 near the docks of the growing city.';
const analyzedContext = analyze(fixtureContext, 'Battle of Plassey');
const passageStems = (analyzedContext.bank || []).filter((question) => /^According to the passage/i.test(question.stem));
assert(passageStems.length >= 1, 'Fixture must produce at least one passage-referencing stem');
for (const question of passageStems) {
  assert(
    typeof question.context === 'string' && question.context.trim().length > 0,
    `Passage stem shows no source context: ${question.stem}`
  );
  assert(question.context.includes('______'), `Context must blank the tested value: ${question.context}`);
  assert(
    !normalize(question.context).includes(normalize(question.expected_answer)),
    `Context must not hand over the answer: ${question.context}`
  );
  assert(
    normalize(question.context) !== normalize(question.supporting_excerpt),
    'Context must be the masked excerpt, not the raw one'
  );
}
console.log(`  ✓ ${passageStems.length} passage stem(s) carry masked source context.`);

console.log('[Test 14c] Stems never ask about a pronoun or a loose fragment...');
const fixturePronoun = [
  'Each centimetre on the map represents a certain distance on the ground.',
  'Let us suppose it is 500 metres; we say that the scale is 1 cm = 500 m.',
  'A map is a representation of the earth surface on a flat sheet of paper.',
  'A globe is a model of the earth.',
  'An atlas is a collection of maps.',
  'A compass is an instrument for finding direction.',
  'The direction of north is shown by an arrow in the map.'
].join(' ');
const analyzedPronoun = analyze(fixturePronoun, 'Map Scale');
assert((analyzedPronoun.bank || []).length >= 1, 'Map scale fixture must still produce questions');
for (const question of analyzedPronoun.bank) {
  assert(
    !/\b(?:for|with|of|to|about)\s+(?:we|you|they|it|this|that|these|those|there)\b/i.test(question.stem),
    `Stem asks about a pronoun instead of a subject: ${question.stem}`
  );
  assert(
    !/\b(?:for|with|of|to|about)\s*[=;:,]/.test(question.stem),
    `Stem asks about a punctuation fragment: ${question.stem}`
  );
}
assert(
  analyzedPronoun.bank.some((question) => /\bmap\b/i.test(question.stem)),
  'Dropping unusable stems must not remove the usable questions from the same passage'
);
console.log('  ✓ Pronoun and fragment subjects never reach a stem.');

console.log('[Test 14d] An unmaskable answer drops the passage reference...');
assert.strictEqual(typeof Engine.buildStemContext, 'function', 'buildStemContext must be exported');
const unmaskable = Engine.buildStemContext(
  'According to the passage, what is stated for the port?',
  'The port handled cargo.',
  'coastal trade'
);
assert.strictEqual(unmaskable.context, null, 'An answer absent from the excerpt cannot be masked');
assert(!/According to the passage/i.test(unmaskable.stem), `Stem must stand alone: ${unmaskable.stem}`);
assert.strictEqual(unmaskable.stem, 'What is stated for the port?', 'Removing the reference must keep the rest of the stem intact');
assert.strictEqual(
  Engine.maskExpectedAnswer('The port handled 4500 tonnes of cargo each year.', '450'),
  null,
  'A value that only appears inside a larger number must not be blanked'
);
console.log('  ✓ Unmaskable answers produce a self-contained stem.');

console.log('[Test 14e] A bare unit is never used as the subject of a stem...');
const fixtureUnit = 'The temple was built 1,500 years ago by a famous astronomer. The festival was attended by 800 people from nearby villages.';
const analyzedUnit = analyze(fixtureUnit, 'Observatory');
assert(analyzedUnit.bank && analyzedUnit.bank.length >= 1, 'Unit fixture must still produce questions');
for (const question of analyzedUnit.bank) {
  if (question.question_subtype !== 'numeric_recall') continue;
  assert(
    !/\bstated for (?:years?|months?|days?|hours?|minutes?|metres?|meters?|kilometres?|km|cm|kg|grams?|litres?|rupees?)\?$/i.test(question.stem),
    `A unit of measurement cannot be the thing a question is about: ${question.stem}`
  );
  assert(
    typeof question.context === 'string' && question.context.includes('______'),
    `A unit question still needs the masked source line: ${question.stem}`
  );
}
console.log('  ✓ Unit-only attributes produce a self-contained numeric stem.');

console.log('[Test 14f] A subject must be a complete phrase, not a stray quote...');
assert.strictEqual(Engine.isUsableSubject('" This'), false, 'An unclosed quote is a fragment, not a subject');
assert.strictEqual(Engine.isUsableSubject("'Bhāratavarṣha'"), true, 'A quoted term with both quotes is a subject');
assert.strictEqual(Engine.isUsableSubject('the numbers written inside some countries'), true, 'A plain noun phrase stays usable');
assert.strictEqual(Engine.isUsableSubject('Together with those events, there'), false, 'A trailing dummy pronoun is a fragment');
console.log('  ✓ Only complete noun phrases become subjects.');

// ---------------------------------------------------------------------------
// Sample compatibility
// ---------------------------------------------------------------------------
console.log('[Test 15] Existing sample material still produces verified questions...');
const scienceSections = Engine.parseRawDocument(global.StudySamples.science_space, 'Chandrayaan-3');
const scienceFacts = Engine.extractSourceFacts(scienceSections);
const scienceConflicts = Engine.detectFactConflicts(scienceFacts);
const scienceInventory = Engine.buildKnowledgeInventory(scienceSections, {
  facts: scienceConflicts.facts,
  conflicts: scienceConflicts.conflicts
});
const scienceBank = Engine.generateQuestionBank(scienceInventory, {
  targetCount: 10,
  sections: scienceSections,
  facts: scienceConflicts.facts,
  conflicts: scienceConflicts.conflicts
});
assert(scienceBank.length >= 5, `Science sample must produce at least five verified questions, got ${scienceBank.length}`);
for (const question of scienceBank) assertQuestionContract(question, scienceConflicts.facts);
const scienceValidation = Engine.validateQuestionBank(scienceBank, {
  facts: scienceConflicts.facts,
  sections: scienceSections,
  candidateCount: scienceBank.generation.totalCandidates
});
assert.strictEqual(scienceValidation.valid, true, `Science bank failed validation: ${JSON.stringify(scienceValidation.issues)}`);
console.log(`  ✓ Science sample produced ${scienceBank.length} verified questions.`);

// ---------------------------------------------------------------------------
// Targeted Engine Repair 001 Regression Suite
// ---------------------------------------------------------------------------
console.log('\n[Test 16] Targeted Engine Repair 001 — Geography, Page Boundaries, & Quality Gates...');

// 16.1 Geography scale contamination rejection
const contaminatedSubject = 'Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India';
const qualityCheck = Engine.checkSubjectQuality(contaminatedSubject);
assert.strictEqual(qualityCheck.valid, false, 'Contaminated map-scale string must be rejected as a subject');
assert(
  ['COMPASS_DIRECTION_SEQUENCE', 'MAP_LEGEND_ARTIFACT', 'RUNNING_FURNITURE', 'INTERNAL_SENTENCE_BOUNDARY'].includes(qualityCheck.code),
  `Expected compass/legend/furniture/boundary rejection code, got ${qualityCheck.code}`
);
assert.strictEqual(Engine.isUsableSubject(contaminatedSubject), false, 'isUsableSubject must return false for contaminated subject');

// 16.2 Compass directions, running headers, and map legends rejected
assert.strictEqual(Engine.isUsableSubject('E W S N'), false, 'Compass direction sequence must be rejected');
assert.strictEqual(Engine.isUsableSubject('N S E W'), false, 'Compass directions must be rejected');
assert.strictEqual(Engine.isUsableSubject('Chapter 4.indd 15'), false, 'Print metadata must be rejected');
assert.strictEqual(Engine.isUsableSubject('Exploring Society: India and Beyond 10'), false, 'Running header with page number must be rejected');

// 16.3 Legitimate subjects with "and" are preserved
assert.strictEqual(Engine.isUsableSubject('India and Beyond'), true, '"India and Beyond" must be a valid subject');
assert.strictEqual(Engine.isUsableSubject('The population of India and China'), true, '"The population of India and China" must be a valid subject');
assert.strictEqual(Engine.cleanNumericAttribute('the border between India and Pakistan'), 'border between India and Pakistan', 'cleanNumericAttribute must not truncate at internal "and"');
assert.strictEqual(Engine.cleanNumericAttribute('the total area of India and Beyond'), 'total area of India and Beyond', 'cleanNumericAttribute must preserve "India and Beyond"');

// 16.4 Page-boundary isolation in parseRawDocument
const multiPageDoc = [
  '==Page 9==',
  'This is the end of page nine without trailing punctuation',
  '==Page 10==',
  'Exploring Society: India',
  'This is the start of page ten.'
].join('\n');
const parsedPages = Engine.parseRawDocument(multiPageDoc, 'Multi-Page Test');
assert.strictEqual(parsedPages.length, 2, 'Must create separate sections for separate pages');
assert.strictEqual(parsedPages[0].page, 9, 'First section must be page 9');
assert.strictEqual(parsedPages[1].page, 10, 'Second section must be page 10');
assert(
  !parsedPages[0].text.includes('Exploring Society'),
  'Page 9 section text must not be contaminated by page 10 text'
);
assert(
  !parsedPages[0].text.includes('start of page ten'),
  'Page 9 must not merge with page 10 prose across boundary'
);

// 16.5 Valid definition of map projection produces question
const mapDefDoc = 'A map projection is a mathematical method of transferring the curved spherical surface of the earth onto a flat plane or sheet of paper. A globe is defined as a three-dimensional model of the earth. A compass is defined as an instrument that shows direction. Cartographers use map projections to represent geographic features accurately.';
const mapDefAnalyzed = analyze(mapDefDoc, 'Map Projections');
assert(mapDefAnalyzed.bank && mapDefAnalyzed.bank.length > 0, 'Valid map projection definition must produce verified questions');
const mapDefQ = mapDefAnalyzed.bank.find(q => /map projection/i.test(q.stem));
assert(mapDefQ, 'Must generate question testing map projection definition');

// 16.6 Explicit numeric measurement generates verified question
const numericDoc = 'The Great Barrier Reef extends for 2300 kilometres along the coast of Australia. The Great Barrier Reef contains 900 individual islands in the Pacific.';
const numericAnalyzed = analyze(numericDoc, 'Barrier Reef');
assert(numericAnalyzed.bank && numericAnalyzed.bank.length > 0, 'Explicit numeric measurement must generate a question');
const numQ = numericAnalyzed.bank.find(q => q.question_subtype === 'numeric_recall');
assert(numQ, 'Must generate numeric recall question for 2300 kilometres');
assert(normalize(numQ.stem).includes('barrier reef'), 'Stem must identify Great Barrier Reef as subject');

// 16.7 Numeric value with no supported subject/measurement is rejected
const isolatedNumDoc = '1000 km. E W S N. Suez Canal Route 10.';
const isolatedAnalyzed = analyze(isolatedNumDoc, 'Isolated Numbers');
assert(
  !isolatedAnalyzed.bank || isolatedAnalyzed.bank.length === 0,
  'Isolated map labels and numbers without measurement relationship must not produce questions'
);
console.log('  ✓ Geography map contamination rejected, page boundaries isolated, and valid definitions/measurements preserved.');

console.log('\n========================================');
console.log('ALL PWA ENGINE TESTS PASSED SUCCESSFULLY');
console.log('========================================\n');

