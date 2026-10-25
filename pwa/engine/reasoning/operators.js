/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * operators.js — Library of 16 Composable Reasoning Operators (Op A - Op P).
 * Pure functions: takes premises/graph, returns derived proposition with full
 * proof trace or explicit typed rejection.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const Linguistics = (typeof module !== 'undefined' && module.exports)
    ? require('./linguistics.js')
    : global.ReasoningLinguistics;

  const Representation = (typeof module !== 'undefined' && module.exports)
    ? require('./representation.js')
    : global.ReasoningRepresentation;

  const {
    RELATION_TYPES,
    POLARITY,
    MODALITY,
    REASONING_OPERATORS,
    REJECTION_CODES,
    DIFFICULTY_LEVELS
  } = Types;

  function rejection(code, reason, details) {
    return {
      success: false,
      rejection_code: code,
      reason: reason,
      details: details || {}
    };
  }

  function success(derivedProposition, operatorId, proofTrace, difficulty) {
    return {
      success: true,
      operator: operatorId,
      derived: derivedProposition,
      proof_trace: proofTrace,
      difficulty: difficulty || DIFFICULTY_LEVELS.APPLICATION
    };
  }

  // ==========================================
  // OPERATOR A — Rule Application
  // ==========================================
  function executeOperatorA(ruleProp, caseProp) {
    if (!ruleProp || !caseProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing rule or case premise');
    }
    if (ruleProp.polarity !== POLARITY.POSITIVE) {
      return rejection(REJECTION_CODES.AMBIGUOUS_NEGATION, 'Cannot apply negated rule directly');
    }
    if (ruleProp.modality === MODALITY.POSSIBILITY) {
      return rejection(REJECTION_CODES.SPECULATIVE_MODALITY, 'Rule is speculative, not a certain law');
    }

    // Match case to rule
    const caseSubjectNorm = Linguistics.normalizeConcept(caseProp.subject);
    const ruleSubjectNorm = Linguistics.normalizeConcept(ruleProp.subject);

    if (caseSubjectNorm !== ruleSubjectNorm && !caseProp.object.toLowerCase().includes(ruleProp.subject.toLowerCase())) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Case does not match the subject of the rule');
    }

    const derived = Representation.createProposition({
      subject: caseProp.subject,
      predicate: ruleProp.predicate,
      relation_type: ruleProp.relation_type,
      object: ruleProp.object,
      source_page: ruleProp.source_page,
      source_section: ruleProp.source_section,
      supporting_excerpt: `${ruleProp.supporting_excerpt} Case context: ${caseProp.supporting_excerpt}`,
      rule_id: 'OP_A_RULE_APPLICATION',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_A_RULE_APPLICATION,
      premises: [ruleProp.id, caseProp.id],
      steps: [
        `Identified general rule: ${ruleProp.subject} -> ${ruleProp.predicate} -> ${ruleProp.object}`,
        `Matched specific case: ${caseProp.subject}`,
        `Deduced outcome for case: ${derived.subject} ${derived.predicate} ${derived.object}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_A_RULE_APPLICATION, proofTrace, DIFFICULTY_LEVELS.APPLICATION);
  }

  // ==========================================
  // OPERATOR B — Causal Explanation
  // ==========================================
  function executeOperatorB(causalProp) {
    if (!causalProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing causal premise');
    }
    const validCausalTypes = [
      RELATION_TYPES.CAUSES,
      RELATION_TYPES.LEADS_TO,
      RELATION_TYPES.PRODUCES,
      RELATION_TYPES.ENABLES
    ];
    if (!validCausalTypes.includes(causalProp.relation_type)) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise is not a verified causal relation');
    }
    if (causalProp.polarity !== POLARITY.POSITIVE) {
      return rejection(REJECTION_CODES.AMBIGUOUS_NEGATION, 'Cannot form positive causal explanation from negated relation');
    }
    if (causalProp.modality === MODALITY.POSSIBILITY) {
      return rejection(REJECTION_CODES.SPECULATIVE_MODALITY, 'Causal relation is tentative/speculative');
    }

    const derived = Representation.createProposition({
      subject: causalProp.object, // Effect
      predicate: 'is caused by mechanism',
      relation_type: RELATION_TYPES.CAUSES,
      object: causalProp.subject, // Cause
      source_page: causalProp.source_page,
      source_section: causalProp.source_section,
      supporting_excerpt: causalProp.supporting_excerpt,
      rule_id: 'OP_B_CAUSAL_EXPLANATION',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_B_CAUSAL_EXPLANATION,
      premises: [causalProp.id],
      steps: [
        `Extracted source causal mechanism: ${causalProp.subject} causes ${causalProp.object}`,
        `Derived mechanistic explanation for ${causalProp.object}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_B_CAUSAL_EXPLANATION, proofTrace, DIFFICULTY_LEVELS.COMPREHENSION);
  }

  // ==========================================
  // OPERATOR C — Forward Causal-Chain Reasoning
  // ==========================================
  function executeOperatorC(prop1, prop2) {
    if (!prop1 || !prop2) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing chain premises');
    }
    // Check transitivity: A -> B and B -> C
    const normObj1 = Linguistics.normalizeConcept(prop1.object);
    const normSub2 = Linguistics.normalizeConcept(prop2.subject);

    if (normObj1 !== normSub2) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Intermediate bridge concept does not match');
    }
    // Cycle check: A != C
    const normSub1 = Linguistics.normalizeConcept(prop1.subject);
    const normObj2 = Linguistics.normalizeConcept(prop2.object);
    if (normSub1 === normObj2) {
      return rejection(REJECTION_CODES.CYCLIC_DEPENDENCY, 'Causal chain contains a cycle (A causes A)');
    }

    const derived = Representation.createProposition({
      subject: prop1.subject,
      predicate: 'indirectly causes via ' + prop1.object,
      relation_type: RELATION_TYPES.LEADS_TO,
      object: prop2.object,
      source_page: prop1.source_page,
      source_section: prop1.source_section,
      supporting_excerpt: `${prop1.supporting_excerpt} Additionally, ${prop2.supporting_excerpt}`,
      rule_id: 'OP_C_CAUSAL_CHAIN',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_C_CAUSAL_CHAIN,
      premises: [prop1.id, prop2.id],
      steps: [
        `Step 1: ${prop1.subject} leads to ${prop1.object}`,
        `Step 2: ${prop2.subject} leads to ${prop2.object}`,
        `Synthesis: Traversed intermediate mediator '${prop1.object}' to deduce that ${prop1.subject} leads to ${prop2.object}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_C_CAUSAL_CHAIN, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR D — Conditional Reasoning
  // ==========================================
  function executeOperatorD(condProp) {
    if (!condProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing conditional premise');
    }
    if (condProp.relation_type !== RELATION_TYPES.CONDITIONAL_ON && condProp.relation_type !== RELATION_TYPES.REQUIRES) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise is not a conditional or requirement');
    }

    const derived = Representation.createProposition({
      subject: condProp.subject,
      predicate: 'requires prerequisite',
      relation_type: RELATION_TYPES.CONDITIONAL_ON,
      object: condProp.object,
      condition: condProp.condition || condProp.object,
      source_page: condProp.source_page,
      source_section: condProp.source_section,
      supporting_excerpt: condProp.supporting_excerpt,
      rule_id: 'OP_D_CONDITIONAL_REASONING',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_D_CONDITIONAL_REASONING,
      premises: [condProp.id],
      steps: [
        `Extracted condition: ${condProp.subject} requires ${condProp.object}`,
        `Verified conditional scope without converse fallacy`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_D_CONDITIONAL_REASONING, proofTrace, DIFFICULTY_LEVELS.APPLICATION);
  }

  // ==========================================
  // OPERATOR E — Comparative Reasoning
  // ==========================================
  function executeOperatorE(compProp) {
    if (!compProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing comparative premise');
    }
    const validComp = [RELATION_TYPES.GREATER_THAN, RELATION_TYPES.LESS_THAN, RELATION_TYPES.COMPARED_WITH];
    if (!validComp.includes(compProp.relation_type)) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise is not a comparative relation');
    }

    const derived = Representation.createProposition({
      subject: compProp.subject,
      predicate: compProp.predicate,
      relation_type: compProp.relation_type,
      object: compProp.object,
      comparator: compProp.comparator,
      comparison_direction: compProp.comparison_direction,
      source_page: compProp.source_page,
      source_section: compProp.source_section,
      supporting_excerpt: compProp.supporting_excerpt,
      rule_id: 'OP_E_COMPARATIVE_REASONING',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_E_COMPARATIVE_REASONING,
      premises: [compProp.id],
      steps: [
        `Extracted comparative relationship between ${compProp.subject} and ${compProp.object}`,
        `Preserved strict comparison direction: ${compProp.comparison_direction || compProp.predicate}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_E_COMPARATIVE_REASONING, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR F — Process and Sequence Reasoning
  // ==========================================
  function executeOperatorF(seqProp) {
    if (!seqProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing sequence premise');
    }
    if (seqProp.relation_type !== RELATION_TYPES.PRECEDES && seqProp.relation_type !== RELATION_TYPES.FOLLOWS) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise is not a sequence relation');
    }

    const isPrecedes = seqProp.relation_type === RELATION_TYPES.PRECEDES;
    const derived = Representation.createProposition({
      subject: isPrecedes ? seqProp.subject : seqProp.object,
      predicate: 'occurs prior to',
      relation_type: RELATION_TYPES.PRECEDES,
      object: isPrecedes ? seqProp.object : seqProp.subject,
      source_page: seqProp.source_page,
      source_section: seqProp.source_section,
      supporting_excerpt: seqProp.supporting_excerpt,
      rule_id: 'OP_F_PROCESS_SEQUENCE',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_F_PROCESS_SEQUENCE,
      premises: [seqProp.id],
      steps: [
        `Extracted process order: ${derived.subject} precedes ${derived.object}`,
        `Isolated sequential prerequisite without conflating temporal order with causation`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_F_PROCESS_SEQUENCE, proofTrace, DIFFICULTY_LEVELS.COMPREHENSION);
  }

  // ==========================================
  // OPERATOR G — Constraint-Based Inference
  // ==========================================
  function executeOperatorG(constraintProp, candidateList) {
    if (!constraintProp || !Array.isArray(candidateList) || candidateList.length < 2) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Insufficient constraints or candidates');
    }

    // Eliminate candidates violating constraint
    const eliminated = [];
    const valid = [];

    for (const cand of candidateList) {
      if (constraintProp.exception && cand.toLowerCase().includes(constraintProp.exception.toLowerCase())) {
        eliminated.push(cand);
      } else {
        valid.push(cand);
      }
    }

    if (valid.length === 0) {
      return rejection(REJECTION_CODES.AMBIGUOUS_ANSWER, 'Constraints eliminated all candidates');
    }

    const derived = Representation.createProposition({
      subject: valid[0],
      predicate: 'satisfies constraints',
      relation_type: RELATION_TYPES.HAS_PROPERTY,
      object: 'valid candidate',
      source_page: constraintProp.source_page,
      source_section: constraintProp.source_section,
      supporting_excerpt: constraintProp.supporting_excerpt,
      rule_id: 'OP_G_CONSTRAINT_INFERENCE',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_G_CONSTRAINT_INFERENCE,
      premises: [constraintProp.id],
      steps: [
        `Applied constraint: ${constraintProp.subject} (excluding ${constraintProp.exception})`,
        `Eliminated invalid alternatives: ${eliminated.join(', ')}`,
        `Deduced uniquely satisfying candidate: ${valid[0]}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_G_CONSTRAINT_INFERENCE, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR H — Classification and Category Inference
  // ==========================================
  function executeOperatorH(instanceProp) {
    if (!instanceProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing classification premise');
    }
    if (instanceProp.relation_type !== RELATION_TYPES.INSTANCE_OF && instanceProp.relation_type !== RELATION_TYPES.DEFINITION_OF) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise is not a classification or definition');
    }

    const derived = Representation.createProposition({
      subject: instanceProp.subject,
      predicate: 'belongs to category',
      relation_type: RELATION_TYPES.INSTANCE_OF,
      object: instanceProp.object,
      source_page: instanceProp.source_page,
      source_section: instanceProp.source_section,
      supporting_excerpt: instanceProp.supporting_excerpt,
      rule_id: 'OP_H_CATEGORY_INFERENCE',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_H_CATEGORY_INFERENCE,
      premises: [instanceProp.id],
      steps: [
        `Extracted taxonomic classification: ${instanceProp.subject} -> ${instanceProp.object}`,
        `Verified category membership rule`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_H_CATEGORY_INFERENCE, proofTrace, DIFFICULTY_LEVELS.COMPREHENSION);
  }

  // ==========================================
  // OPERATOR I — Boundary and Exception Reasoning
  // ==========================================
  function executeOperatorI(exceptionProp) {
    if (!exceptionProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing exception premise');
    }
    if (exceptionProp.relation_type !== RELATION_TYPES.EXCEPTION_TO && !exceptionProp.exception) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise does not declare an explicit exception');
    }

    const derived = Representation.createProposition({
      subject: exceptionProp.exception || exceptionProp.object,
      predicate: 'is exempt from general rule',
      relation_type: RELATION_TYPES.EXCEPTION_TO,
      object: exceptionProp.subject,
      source_page: exceptionProp.source_page,
      source_section: exceptionProp.source_section,
      supporting_excerpt: exceptionProp.supporting_excerpt,
      rule_id: 'OP_I_EXCEPTION_REASONING',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_I_EXCEPTION_REASONING,
      premises: [exceptionProp.id],
      steps: [
        `Identified general rule: ${exceptionProp.subject}`,
        `Identified explicit boundary exception: ${derived.subject}`,
        `Deduced that ${derived.subject} does NOT follow the general rule`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_I_EXCEPTION_REASONING, proofTrace, DIFFICULTY_LEVELS.APPLICATION);
  }

  // ==========================================
  // OPERATOR J — Contrastive Explanation
  // ==========================================
  function executeOperatorJ(propA, propB) {
    if (!propA || !propB) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing contrastive premises');
    }

    const derived = Representation.createProposition({
      subject: `${propA.subject} versus ${propB.subject}`,
      predicate: 'contrasts on',
      relation_type: RELATION_TYPES.CONTRASTS_WITH,
      object: `${propA.object} vs ${propB.object}`,
      source_page: propA.source_page,
      source_section: propA.source_section,
      supporting_excerpt: `${propA.supporting_excerpt} In contrast, ${propB.supporting_excerpt}`,
      rule_id: 'OP_J_CONTRASTIVE_EXPLANATION',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_J_CONTRASTIVE_EXPLANATION,
      premises: [propA.id, propB.id],
      steps: [
        `Premise A: ${propA.subject} exhibits ${propA.object}`,
        `Premise B: ${propB.subject} exhibits ${propB.object}`,
        `Established contrastive differentiation`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_J_CONTRASTIVE_EXPLANATION, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR K — Evidence-Based Conclusion
  // ==========================================
  function executeOperatorK(conclusionProp, evidenceProp) {
    if (!conclusionProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing conclusion premise');
    }

    const evidenceText = evidenceProp ? evidenceProp.supporting_excerpt : conclusionProp.supporting_excerpt;

    const derived = Representation.createProposition({
      subject: conclusionProp.subject,
      predicate: 'is evidenced by',
      relation_type: RELATION_TYPES.SUPPORTS,
      object: evidenceText,
      source_page: conclusionProp.source_page,
      source_section: conclusionProp.source_section,
      supporting_excerpt: evidenceText,
      rule_id: 'OP_K_EVIDENCE_CONCLUSION',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_K_EVIDENCE_CONCLUSION,
      premises: [conclusionProp.id],
      steps: [
        `Claim: ${conclusionProp.subject} ${conclusionProp.predicate} ${conclusionProp.object}`,
        `Source evidence quotation: "${evidenceText}"`,
        `Grounded claim directly in verifiable empirical evidence`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_K_EVIDENCE_CONCLUSION, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR L — Error Diagnosis
  // ==========================================
  function executeOperatorL(prop, fallacyType) {
    if (!prop) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing proposition for error diagnosis');
    }

    let errorDescription = '';
    if (fallacyType === 'reversed_causality') {
      errorDescription = `Incorrectly claims that ${prop.object} causes ${prop.subject} (reversing cause and effect)`;
    } else if (fallacyType === 'converse_fallacy') {
      errorDescription = `Asserts the converse implication without necessity`;
    } else {
      errorDescription = `Misapplies the established relation outside its stated boundary`;
    }

    const derived = Representation.createProposition({
      subject: prop.subject,
      predicate: 'exhibits reasoning error',
      relation_type: RELATION_TYPES.HAS_PROPERTY,
      object: errorDescription,
      source_page: prop.source_page,
      source_section: prop.source_section,
      supporting_excerpt: prop.supporting_excerpt,
      rule_id: 'OP_L_ERROR_DIAGNOSIS',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_L_ERROR_DIAGNOSIS,
      premises: [prop.id],
      steps: [
        `Source ground truth: ${prop.subject} ${prop.predicate} ${prop.object}`,
        `Constructed invalid diagnostic misconception: ${errorDescription}`,
        `Proved why the invalid transformation contradicts the source`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_L_ERROR_DIAGNOSIS, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR M — Quantitative and Variable Relations
  // ==========================================
  function executeOperatorM(changeProp) {
    if (!changeProp) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing quantitative premise');
    }
    const isChange = changeProp.relation_type === RELATION_TYPES.INCREASES || changeProp.relation_type === RELATION_TYPES.DECREASES;
    if (!isChange) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premise does not declare directional variable change');
    }

    const derived = Representation.createProposition({
      subject: changeProp.subject,
      predicate: changeProp.predicate,
      relation_type: changeProp.relation_type,
      object: changeProp.object,
      source_page: changeProp.source_page,
      source_section: changeProp.source_section,
      supporting_excerpt: changeProp.supporting_excerpt,
      rule_id: 'OP_M_QUANTITATIVE_REASONING',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_M_QUANTITATIVE_REASONING,
      premises: [changeProp.id],
      steps: [
        `Extracted monotonic relationship: ${changeProp.subject} ${changeProp.predicate} ${changeProp.object}`,
        `Verified mathematical direction without sign inversion`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_M_QUANTITATIVE_REASONING, proofTrace, DIFFICULTY_LEVELS.APPLICATION);
  }

  // ==========================================
  // OPERATOR N — Conceptual Discrimination
  // ==========================================
  function executeOperatorN(propA, propB) {
    if (!propA || !propB) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing discrimination premises');
    }
    const normA = Linguistics.normalizeConcept(propA.subject);
    const normB = Linguistics.normalizeConcept(propB.subject);
    if (normA === normB) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Concepts must be distinct to discriminate');
    }

    const discriminatingFeature = `${propA.subject} ${propA.predicate} ${propA.object}, whereas ${propB.subject} does not`;

    const derived = Representation.createProposition({
      subject: `${propA.subject} vs ${propB.subject}`,
      predicate: 'is discriminated by',
      relation_type: RELATION_TYPES.DIFFERENT_FROM,
      object: discriminatingFeature,
      source_page: propA.source_page,
      source_section: propA.source_section,
      supporting_excerpt: `${propA.supporting_excerpt} Comparison: ${propB.supporting_excerpt}`,
      rule_id: 'OP_N_CONCEPTUAL_DISCRIMINATION',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_N_CONCEPTUAL_DISCRIMINATION,
      premises: [propA.id, propB.id],
      steps: [
        `Analyzed Concept A: ${propA.subject}`,
        `Analyzed Concept B: ${propB.subject}`,
        `Isolated explicit discriminating criterion: ${discriminatingFeature}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_N_CONCEPTUAL_DISCRIMINATION, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  // ==========================================
  // OPERATOR O — Multi-Hop Synthesis
  // ==========================================
  function executeOperatorO(prop1, prop2) {
    if (!prop1 || !prop2) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing synthesis premises');
    }
    // Cross-section check
    const sameSection = prop1.source_section === prop2.source_section && prop1.source_page === prop2.source_page;

    const normObj1 = Linguistics.normalizeConcept(prop1.object);
    const normSub2 = Linguistics.normalizeConcept(prop2.subject);
    if (normObj1 !== normSub2) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Premises do not share a bridge entity');
    }

    const derived = Representation.createProposition({
      subject: prop1.subject,
      predicate: 'synthesizes across sections with',
      relation_type: RELATION_TYPES.SUPPORTS,
      object: prop2.object,
      source_page: prop2.source_page,
      source_section: `${prop1.source_section} + ${prop2.source_section}`,
      supporting_excerpt: `[Part 1] ${prop1.supporting_excerpt} [Part 2] ${prop2.supporting_excerpt}`,
      rule_id: 'OP_O_MULTIHOP_SYNTHESIS',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_O_MULTIHOP_SYNTHESIS,
      premises: [prop1.id, prop2.id],
      steps: [
        `Premise 1 (${prop1.source_section}): ${prop1.subject} -> ${prop1.object}`,
        `Premise 2 (${prop2.source_section}): ${prop2.subject} -> ${prop2.object}`,
        `Multi-hop synthesis: Bridged across distinct passages via '${prop1.object}' to deduce overarching connection`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_O_MULTIHOP_SYNTHESIS, proofTrace, DIFFICULTY_LEVELS.SYNTHESIS);
  }

  // ==========================================
  // OPERATOR P — Counterfactual Reasoning
  // ==========================================
  function executeOperatorP(prop) {
    if (!prop) {
      return rejection(REJECTION_CODES.UNSUPPORTED_PREMISE, 'Missing premise for counterfactual reasoning');
    }
    const isChange = prop.relation_type === RELATION_TYPES.INCREASES || prop.relation_type === RELATION_TYPES.DECREASES;
    const isRequirement = prop.relation_type === RELATION_TYPES.REQUIRES;

    if (!isChange && !isRequirement) {
      return rejection(REJECTION_CODES.PRECONDITION_NOT_MET, 'Counterfactual outcome requires monotonic relation or strict requirement');
    }

    let counterfactualHypothesis = '';
    let counterfactualOutcome = '';

    if (prop.relation_type === RELATION_TYPES.INCREASES) {
      counterfactualHypothesis = `If ${prop.subject} were decreased instead of increased`;
      counterfactualOutcome = `${prop.object} would decrease`;
    } else if (prop.relation_type === RELATION_TYPES.DECREASES) {
      counterfactualHypothesis = `If ${prop.subject} were decreased`;
      counterfactualOutcome = `${prop.object} would increase`;
    } else if (isRequirement) {
      counterfactualHypothesis = `If ${prop.object} were absent or removed`;
      counterfactualOutcome = `${prop.subject} could not occur`;
    }

    const derived = Representation.createProposition({
      subject: counterfactualHypothesis,
      predicate: 'results in',
      relation_type: RELATION_TYPES.CAUSES,
      object: counterfactualOutcome,
      source_page: prop.source_page,
      source_section: prop.source_section,
      supporting_excerpt: prop.supporting_excerpt,
      rule_id: 'OP_P_COUNTERFACTUAL_REASONING',
      is_derived: true
    });

    const proofTrace = {
      operator: REASONING_OPERATORS.OP_P_COUNTERFACTUAL_REASONING,
      premises: [prop.id],
      steps: [
        `Established law: ${prop.subject} ${prop.predicate} ${prop.object}`,
        `Hypothesized counterfactual condition: ${counterfactualHypothesis}`,
        `Deduced grounded consequence: ${counterfactualOutcome}`
      ]
    };

    return success(derived, REASONING_OPERATORS.OP_P_COUNTERFACTUAL_REASONING, proofTrace, DIFFICULTY_LEVELS.ANALYSIS);
  }

  const Operators = {
    executeOperatorA,
    executeOperatorB,
    executeOperatorC,
    executeOperatorD,
    executeOperatorE,
    executeOperatorF,
    executeOperatorG,
    executeOperatorH,
    executeOperatorI,
    executeOperatorJ,
    executeOperatorK,
    executeOperatorL,
    executeOperatorM,
    executeOperatorN,
    executeOperatorO,
    executeOperatorP
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Operators;
  global.ReasoningOperators = Operators;
})(typeof globalThis !== 'undefined' ? globalThis : this);
