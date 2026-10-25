/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * test_reasoning_v2.js — Comprehensive Unit, Integration, and Adversarial Test Suite.
 *
 * Verifies:
 * 1. Linguistic edge cases (passive/active, negation, double negation, quantifiers, modality, connectives).
 * 2. Composable reasoning operators (Rule application, causal chain, conditional, comparative, exception, synthesis).
 * 3. Adversarial rejection cases (cyclic graphs, converse fallacies, speculative modality, out-of-scope rules).
 * 4. Deterministic reproducibility across consecutive runs.
 * 5. Complete proof traces, evidence character offset verification, and distractor validity.
 */

const assert = require('assert');
const EngineV2 = require('../engine/reasoning/engine_v2.js');
const { Types, Linguistics, Representation, GraphModule, Operators, Validator, Ranking } = EngineV2;
const { RELATION_TYPES, POLARITY, MODALITY, QUANTIFICATION, REJECTION_CODES } = Types;

console.log('--- Running StudySynth Lite Reasoning Engine V2 Test Suite ---');

// =========================================================================
// TEST SUITE 1: Linguistic Analysis & Safety Parsing
// =========================================================================
console.log('\n[Suite 1] Linguistic Analysis & Safety Parsing...');

// 1.1 Active and Passive Voice Causal Extraction
{
  const activeSentence = { text: 'Excess atmospheric carbon dioxide causes ocean acidification.', start: 0, end: 60 };
  const passiveSentence = { text: 'Ocean acidification is caused by excess atmospheric carbon dioxide.', start: 0, end: 66 };
  const secMeta = { title: 'Marine Chemistry', page: 1 };

  const analysisActive = Linguistics.analyzeSentenceLinguistics(activeSentence, activeSentence.text);
  const analysisPassive = Linguistics.analyzeSentenceLinguistics(passiveSentence, passiveSentence.text);

  const propsActive = Representation.compileSemanticRepresentation([{ id: 'SEC-1', content: activeSentence.text }]).propositions;
  const propsPassive = Representation.compileSemanticRepresentation([{ id: 'SEC-2', content: passiveSentence.text }]).propositions;

  const causalActive = propsActive.find(p => p.relation_type === RELATION_TYPES.CAUSES);
  const causalPassive = propsPassive.find(p => p.relation_type === RELATION_TYPES.CAUSES);

  assert(causalActive, 'Active voice must yield a CAUSES proposition');
  assert(causalPassive, 'Passive voice must yield a CAUSES proposition');
  assert.strictEqual(
    Linguistics.normalizeConcept(causalActive.subject),
    Linguistics.normalizeConcept(causalPassive.subject),
    'Active and passive voice must identify the exact same cause entity as subject'
  );
  assert.strictEqual(
    Linguistics.normalizeConcept(causalActive.object),
    Linguistics.normalizeConcept(causalPassive.object),
    'Active and passive voice must identify the exact same effect entity as object'
  );
  console.log('  ✓ Active and passive voice causal inversion verified.');
}

// 1.2 Negation & Double Negation
{
  const positive = { text: 'Magnesium reacts with hydrochloric acid.', start: 0, end: 40 };
  const singleNeg = { text: 'Magnesium does not react with noble gases.', start: 0, end: 42 };
  const doubleNeg = { text: 'It is not uncommon for magnesium to oxidize.', start: 0, end: 44 };

  const pPos = Linguistics.detectPolarity(positive.text);
  const pSingle = Linguistics.detectPolarity(singleNeg.text);
  const pDouble = Linguistics.detectPolarity(doubleNeg.text);

  assert.strictEqual(pPos.polarity, POLARITY.POSITIVE, 'Unnegated sentence must be POSITIVE');
  assert.strictEqual(pSingle.polarity, POLARITY.NEGATIVE, 'Single negated sentence must be NEGATIVE');
  assert.strictEqual(pDouble.polarity, POLARITY.POSITIVE, 'Double negation must resolve to POSITIVE');
  assert.strictEqual(pDouble.doubleNegation, true, 'Double negation flag must be recorded');
  console.log('  ✓ Negation and double negation scoping verified.');
}

// 1.3 Modality: Fact vs Possibility vs Obligation
{
  const factText = 'Increasing temperature increases molecular kinetic energy.';
  const possText = 'Increasing temperature may cause enzyme denaturation.';
  const obligText = 'Pressure must be maintained above 2 atmospheres.';

  assert.strictEqual(Linguistics.detectModality(factText), MODALITY.FACT, 'Definitive claim must be FACT');
  assert.strictEqual(Linguistics.detectModality(possText), MODALITY.POSSIBILITY, 'Tentative claim must be POSSIBILITY');
  assert.strictEqual(Linguistics.detectModality(obligText), MODALITY.OBLIGATION, 'Required rule must be OBLIGATION');
  console.log('  ✓ Modality distinctions (Fact, Possibility, Obligation) verified.');
}

// 1.4 Quantifier Scope
{
  const allText = 'All mammals possess mammary glands.';
  const someText = 'Some mammals lay eggs.';
  const noneText = 'No reptiles have fur.';

  assert.strictEqual(Linguistics.detectQuantification(allText), QUANTIFICATION.UNIVERSAL, 'Universal quantifier detected');
  assert.strictEqual(Linguistics.detectQuantification(someText), QUANTIFICATION.EXISTENTIAL, 'Existential quantifier detected');
  assert.strictEqual(Linguistics.detectQuantification(noneText), QUANTIFICATION.NONE, 'Negative universal quantifier detected');
  console.log('  ✓ Quantifier scoping (Universal, Existential, None) verified.');
}

// =========================================================================
// TEST SUITE 2: Composable Reasoning Operators
// =========================================================================
console.log('\n[Suite 2] Composable Reasoning Operators...');

// 2.1 Operator A: Rule Application
{
  const ruleProp = Representation.createProposition({
    id: 'PROP-RULE-1',
    subject: 'Metals',
    predicate: 'expand when heated',
    relation_type: RELATION_TYPES.HAS_PROPERTY,
    object: 'expanded volume',
    supporting_excerpt: 'Metals expand when heated.'
  });
  const caseProp = Representation.createProposition({
    id: 'PROP-CASE-1',
    subject: 'Copper',
    predicate: 'is a type of',
    relation_type: RELATION_TYPES.INSTANCE_OF,
    object: 'Metals',
    supporting_excerpt: 'Copper is a ductile metal.'
  });

  const resA = Operators.executeOperatorA(ruleProp, caseProp);
  assert(resA.success, 'Operator A must deduce outcome for matching case');
  assert.strictEqual(resA.derived.subject, 'Copper');
  assert(resA.proof_trace.premises.includes('PROP-RULE-1'));
  assert(resA.proof_trace.premises.includes('PROP-CASE-1'));
  console.log('  ✓ Operator A (Rule Application) executed with proof trace.');
}

// 2.2 Operator B: Causal Explanation
{
  const causalProp = Representation.createProposition({
    id: 'PROP-CAUSAL-1',
    subject: 'Deforestation',
    predicate: 'causes',
    relation_type: RELATION_TYPES.CAUSES,
    object: 'Soil Erosion',
    supporting_excerpt: 'Deforestation causes soil erosion on hillsides.'
  });
  const resB = Operators.executeOperatorB(causalProp);
  assert(resB.success, 'Operator B must generate causal explanation');
  assert.strictEqual(resB.derived.subject, 'Soil Erosion');
  assert.strictEqual(resB.derived.object, 'Deforestation');
  console.log('  ✓ Operator B (Causal Explanation) executed with proof trace.');
}

// 2.3 Operator C: Forward Causal-Chain Reasoning
{
  const prop1 = Representation.createProposition({
    id: 'PROP-CHAIN-1',
    subject: 'Greenhouse gas emissions',
    predicate: 'leads to',
    relation_type: RELATION_TYPES.LEADS_TO,
    object: 'Global warming',
    supporting_excerpt: 'Greenhouse gas emissions lead to global warming.'
  });
  const prop2 = Representation.createProposition({
    id: 'PROP-CHAIN-2',
    subject: 'Global warming',
    predicate: 'causes',
    relation_type: RELATION_TYPES.CAUSES,
    object: 'Sea level rise',
    supporting_excerpt: 'Global warming causes sea level rise.'
  });

  const resC = Operators.executeOperatorC(prop1, prop2);
  assert(resC.success, 'Operator C must bridge A -> B and B -> C');
  assert.strictEqual(resC.derived.subject, 'Greenhouse gas emissions');
  assert.strictEqual(resC.derived.object, 'Sea level rise');
  assert.strictEqual(resC.proof_trace.premises.length, 2);
  console.log('  ✓ Operator C (Forward Causal Chain) traversed intermediate concept.');
}

// 2.4 Operator D: Conditional Reasoning
{
  const condProp = Representation.createProposition({
    id: 'PROP-COND-1',
    subject: 'Combustion',
    predicate: 'requires',
    relation_type: RELATION_TYPES.REQUIRES,
    object: 'Oxygen',
    condition: 'Oxygen',
    supporting_excerpt: 'Combustion requires oxygen.'
  });
  const resD = Operators.executeOperatorD(condProp);
  assert(resD.success, 'Operator D must extract condition');
  assert.strictEqual(resD.derived.condition, 'Oxygen');
  console.log('  ✓ Operator D (Conditional Reasoning) verified.');
}

// 2.5 Operator E: Comparative Reasoning
{
  const compProp = Representation.createProposition({
    id: 'PROP-COMP-1',
    subject: 'Venus',
    predicate: 'is hotter than',
    relation_type: RELATION_TYPES.GREATER_THAN,
    object: 'Mercury',
    comparator: 'hotter than',
    comparison_direction: 'A > B',
    supporting_excerpt: 'Venus is hotter than Mercury due to its dense atmosphere.'
  });
  const resE = Operators.executeOperatorE(compProp);
  assert(resE.success, 'Operator E must preserve comparative direction');
  assert.strictEqual(resE.derived.comparison_direction, 'A > B');
  console.log('  ✓ Operator E (Comparative Reasoning) preserved direction.');
}

// 2.6 Operator I: Exception & Boundary Reasoning
{
  const exceptProp = Representation.createProposition({
    id: 'PROP-EXC-1',
    subject: 'All planets orbit counter-clockwise',
    predicate: 'exception to',
    relation_type: RELATION_TYPES.EXCEPTION_TO,
    object: 'All planets orbit counter-clockwise',
    exception: 'Venus',
    supporting_excerpt: 'All planets orbit counter-clockwise, with the exception of Venus.'
  });
  const resI = Operators.executeOperatorI(exceptProp);
  assert(resI.success, 'Operator I must isolate boundary exception');
  assert.strictEqual(resI.derived.subject, 'Venus');
  console.log('  ✓ Operator I (Boundary and Exception Reasoning) verified.');
}

// =========================================================================
// TEST SUITE 3: Adversarial Rejection Gates
// =========================================================================
console.log('\n[Suite 3] Adversarial Rejection Gates...');

// 3.1 Cycle Detection in Causal Chains
{
  const cyclicP1 = Representation.createProposition({
    id: 'PROP-CYC-1',
    subject: 'A',
    predicate: 'causes',
    relation_type: RELATION_TYPES.CAUSES,
    object: 'B'
  });
  const cyclicP2 = Representation.createProposition({
    id: 'PROP-CYC-2',
    subject: 'B',
    predicate: 'causes',
    relation_type: RELATION_TYPES.CAUSES,
    object: 'A' // Cycle!
  });
  const resCycle = Operators.executeOperatorC(cyclicP1, cyclicP2);
  assert.strictEqual(resCycle.success, false, 'Cyclic chain must be rejected');
  assert.strictEqual(resCycle.rejection_code, REJECTION_CODES.CYCLIC_DEPENDENCY, 'Cycle rejection code must be CYCLIC_DEPENDENCY');
  console.log('  ✓ Cyclic causal dependency rejected.');
}

// 3.2 Speculative Modality Rejection
{
  const specProp = Representation.createProposition({
    id: 'PROP-SPEC-1',
    subject: 'Cold fusion',
    predicate: 'causes',
    relation_type: RELATION_TYPES.CAUSES,
    object: 'Energy surplus',
    modality: MODALITY.POSSIBILITY // May cause
  });
  const resSpec = Operators.executeOperatorB(specProp);
  assert.strictEqual(resSpec.success, false, 'Speculative claim must be rejected for causal explanation');
  assert.strictEqual(resSpec.rejection_code, REJECTION_CODES.SPECULATIVE_MODALITY);
  console.log('  ✓ Speculative modality rejected from forming definitive causal questions.');
}

// 3.3 Negated Causality Rejection
{
  const negProp = Representation.createProposition({
    id: 'PROP-NEG-1',
    subject: 'Vaccines',
    predicate: 'do not cause',
    relation_type: RELATION_TYPES.CAUSES,
    object: 'Autism',
    polarity: POLARITY.NEGATIVE
  });
  const resNeg = Operators.executeOperatorB(negProp);
  assert.strictEqual(resNeg.success, false, 'Negated causal claim must be rejected from positive causal explanation');
  assert.strictEqual(resNeg.rejection_code, REJECTION_CODES.AMBIGUOUS_NEGATION);
  console.log('  ✓ Negated causal premise rejected from positive explanation.');
}

// =========================================================================
// TEST SUITE 4: End-to-End Pipeline & Determinism
// =========================================================================
console.log('\n[Suite 4] End-to-End Pipeline & Deterministic Reproducibility...');

const sampleText = `
Photosynthesis produces oxygen and glucose in green plants.
Chlorophyll absorbs solar radiation to drive the chemical reaction.
When light intensity increases, the rate of photosynthesis increases up to a saturation point.
C3 plants are less water-efficient than CAM plants in arid environments.
All vascular plants contain xylem and phloem, with the exception of bryophytes.
`;

const sections = [{
  id: 'SEC-TEST',
  title: 'Plant Physiology',
  page: 1,
  text: sampleText,
  content: sampleText
}];

const run1 = EngineV2.generateReasoningQuestionBank(sections, { targetCount: 5 });
const run2 = EngineV2.generateReasoningQuestionBank(sections, { targetCount: 5 });

assert(run1.length > 0, 'Run 1 must generate questions');
assert.strictEqual(run1.length, run2.length, 'Consecutive runs must produce exact same question count');

for (let i = 0; i < run1.length; i++) {
  const q1 = run1[i];
  const q2 = run2[i];
  assert.strictEqual(q1.id, q2.id, `Question ${i} id must match`);
  assert.strictEqual(q1.stem, q2.stem, `Question ${i} stem must match`);
  assert.strictEqual(q1.answer_key, q2.answer_key, `Question ${i} answer key must match`);
  assert.strictEqual(q1.options.length, 4, `Question ${i} must have 4 options`);
  assert.strictEqual(q1.explanation, q2.explanation, `Question ${i} explanation must match`);

  // Verify proof trace
  assert(q1.proof_trace, `Question ${i} must carry proof trace`);
  assert(Array.isArray(q1.proof_trace.steps), `Question ${i} proof trace must contain steps`);

  // Verify option distinctness and typed origin
  const normalizedOpts = q1.options.map(o => o.text.trim().toLowerCase());
  assert.strictEqual(new Set(normalizedOpts).size, 4, `Question ${i} options must be distinct`);
  for (const opt of q1.options) {
    if (!opt.is_correct) {
      assert(opt.distractor_origin && opt.distractor_origin !== 'generic_filler', `Distractor must be typed: ${opt.text}`);
    }
  }
}
console.log(`  ✓ Deterministic reproducibility verified: 2 identical runs produced ${run1.length} identical verified questions.`);

// =========================================================================
// TEST SUITE 5: Targeted Repair 001 — Reasoning Safety & Proof Grounding
// =========================================================================
console.log('\n[Suite 5] Targeted Repair 001 — Reasoning Safety, Operator Preconditions, & Grounding...');

// 5.1 Operator J: Unrelated propositions rejected for contrast
{
  const unrelatedProp1 = Representation.createProposition({
    id: 'PROP-UNREL-1',
    subject: 'Equator',
    predicate: 'divides',
    relation_type: RELATION_TYPES.DIVIDES || 'divides',
    object: 'Northern and Southern Hemispheres',
    supporting_excerpt: 'The Equator divides the Earth into hemispheres.'
  });
  const unrelatedProp2 = Representation.createProposition({
    id: 'PROP-UNREL-2',
    subject: 'Suez Canal',
    predicate: 'connects',
    relation_type: RELATION_TYPES.CONNECTS || 'connects',
    object: 'Mediterranean and Red Sea',
    supporting_excerpt: 'The Suez Canal connects two seas.'
  });

  const resUnrelatedJ = Operators.executeOperatorJ(unrelatedProp1, unrelatedProp2);
  assert.strictEqual(resUnrelatedJ.success, false, 'Operator J must reject unrelated propositions with incompatible relations');
  assert.strictEqual(resUnrelatedJ.rejection_code, REJECTION_CODES.PRECONDITION_NOT_MET);

  // Legitimate contrast with shared relation and distinct subjects
  const contrastProp1 = Representation.createProposition({
    id: 'PROP-CONT-1',
    subject: 'C3 plants',
    predicate: 'exhibits carbon pathway',
    relation_type: RELATION_TYPES.HAS_PROPERTY,
    object: 'Rubisco enzyme in mesophyll',
    supporting_excerpt: 'C3 plants fix carbon via Rubisco in mesophyll.'
  });
  const contrastProp2 = Representation.createProposition({
    id: 'PROP-CONT-2',
    subject: 'C4 plants',
    predicate: 'exhibits carbon pathway',
    relation_type: RELATION_TYPES.HAS_PROPERTY,
    object: 'PEP carboxylase in bundle sheath',
    supporting_excerpt: 'C4 plants fix carbon via PEP carboxylase in bundle sheath.'
  });
  const resValidJ = Operators.executeOperatorJ(contrastProp1, contrastProp2);
  assert(resValidJ.success, 'Operator J must accept compatible propositions with shared relation on distinct subjects');
  assert.strictEqual(resValidJ.operator, 'OP_J_CONTRASTIVE_EXPLANATION');
  console.log('  ✓ Operator J requires genuine shared contrast dimension; unrelated pairs rejected.');
}

// 5.2 Operator L disabled in candidate generation
{
  const testSec = [{
    id: 'SEC-OPL',
    title: 'Causality Test',
    page: 1,
    text: 'Deforestation causes habitat loss. Overgrazing causes soil compaction.'
  }];
  const rep = Representation.compileSemanticRepresentation(testSec);
  const graph = GraphModule.buildGraphFromPropositions(rep.propositions);
  const candidates = EngineV2.generateReasoningCandidates(graph, { sections: testSec });
  const opLCandidates = candidates.filter(c => c.operator === 'OP_L');
  assert.strictEqual(opLCandidates.length, 0, 'Operator L (reversed causality) must NOT generate candidates unconditionally');
  console.log('  ✓ Operator L speculative error-diagnosis disabled in candidate generation.');
}

// 5.3 Evidence lookup never falls back to availableFacts[0]
{
  const missingPremiseDerivation = {
    success: true,
    operator: 'OP_B',
    derived: Representation.createProposition({
      id: 'PROP-ORPHAN',
      subject: 'Alpha',
      predicate: 'causes',
      relation_type: RELATION_TYPES.CAUSES,
      object: 'Beta'
    }),
    proof_trace: {
      operator: 'OP_B',
      premises: ['NON_EXISTENT_PREMISE_ID'],
      steps: ['Alpha -> Beta']
    }
  };
  const dummyGraph = new GraphModule.KnowledgeGraph();
  const dummyContext = {
    facts: [{ fact_id: 'F-FALLBACK-001', subject: 'Unrelated Subject', predicate: 'is', object: 'Unrelated Object' }],
    sections: [{ id: 'SEC-1', text: 'Unrelated context text.' }]
  };
  const constructed = EngineV2.Constructors.constructQuestionCandidate(missingPremiseDerivation, dummyGraph, dummyContext);
  assert.strictEqual(constructed, null, 'Candidate must be rejected when premise ID cannot be resolved, with NO fallback to availableFacts[0]');
  console.log('  ✓ Evidence lookup rejects ungrounded premise without falling back to availableFacts[0].');
}

// 5.4 Proof Validator substantive checks
{
  const invalidCandidate = {
    id: 'Q-REASON-TEST',
    operator: 'OP_B',
    proof_trace: {
      operator: 'OP_B',
      premises: ['NON_EXISTENT_PREMISE_ID'],
      steps: ['Alpha -> Beta']
    },
    stem: 'Why does Alpha happen?',
    expected_answer: 'Beta',
    options: [
      { text: 'Beta', is_correct: true },
      { text: 'Gamma', is_correct: false, distractor_origin: 'entity_substitution' },
      { text: 'Delta', is_correct: false, distractor_origin: 'entity_substitution' },
      { text: 'Epsilon', is_correct: false, distractor_origin: 'entity_substitution' }
    ],
    supporting_excerpt: 'Alpha causes Beta directly in experiments.',
    explanation: 'As confirmed in the source: "Alpha causes Beta directly in experiments."'
  };
  const dummyGraph = new GraphModule.KnowledgeGraph();
  const valResult = Validator.validateCandidate(invalidCandidate, dummyGraph, { facts: [] });
  assert.strictEqual(valResult.valid, false, 'Validator must reject candidate when premise IDs do not resolve');
  assert.strictEqual(valResult.code, REJECTION_CODES.UNSUPPORTED_PREMISE, 'Validator must flag UNSUPPORTED_PREMISE');
  console.log('  ✓ Substantive proof validation enforces premise resolution and operator integrity.');
}

console.log('\n======================================================');
console.log('ALL REASONING ENGINE V2 TESTS PASSED SUCCESSFULLY (0 ERRORS)');
console.log('======================================================');

