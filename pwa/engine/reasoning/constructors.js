/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * constructors.js — Answer-first question builder with proof-carrying records.
 * Generates question stems, correct answers, and rich derivation metadata
 * strictly conforming to the StudySynth Lite question contract.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const Distractors = (typeof module !== 'undefined' && module.exports)
    ? require('./distractors.js')
    : global.ReasoningDistractors;

  const Linguistics = (typeof module !== 'undefined' && module.exports)
    ? require('./linguistics.js')
    : global.ReasoningLinguistics;

  const { REASONING_OPERATORS, DIFFICULTY_LEVELS, RELATION_TYPES } = Types;

  let candidateCounter = 0;

  function resetCandidateCounter() {
    candidateCounter = 0;
  }

  function generateCandidateId() {
    candidateCounter++;
    return `QC-V2-${String(candidateCounter).padStart(4, '0')}`;
  }

  /**
   * Subtype mapping from operator ID
   */
  const OPERATOR_SUBTYPE_MAP = {
    [REASONING_OPERATORS.OP_A_RULE_APPLICATION]: 'rule_application',
    [REASONING_OPERATORS.OP_B_CAUSAL_EXPLANATION]: 'causal_reasoning',
    [REASONING_OPERATORS.OP_C_CAUSAL_CHAIN]: 'causal_reasoning',
    [REASONING_OPERATORS.OP_D_CONDITIONAL_REASONING]: 'conditional_reasoning',
    [REASONING_OPERATORS.OP_E_COMPARATIVE_REASONING]: 'comparative_reasoning',
    [REASONING_OPERATORS.OP_F_PROCESS_SEQUENCE]: 'process_sequence',
    [REASONING_OPERATORS.OP_G_CONSTRAINT_INFERENCE]: 'constraint_inference',
    [REASONING_OPERATORS.OP_H_CATEGORY_INFERENCE]: 'category_classification',
    [REASONING_OPERATORS.OP_I_EXCEPTION_REASONING]: 'exception_reasoning',
    [REASONING_OPERATORS.OP_J_CONTRASTIVE_EXPLANATION]: 'contrastive_explanation',
    [REASONING_OPERATORS.OP_K_EVIDENCE_CONCLUSION]: 'evidence_conclusion',
    [REASONING_OPERATORS.OP_L_ERROR_DIAGNOSIS]: 'error_diagnosis',
    [REASONING_OPERATORS.OP_M_QUANTITATIVE_REASONING]: 'quantitative_reasoning',
    [REASONING_OPERATORS.OP_N_CONCEPTUAL_DISCRIMINATION]: 'conceptual_discrimination',
    [REASONING_OPERATORS.OP_O_MULTIHOP_SYNTHESIS]: 'multihop_synthesis',
    [REASONING_OPERATORS.OP_P_COUNTERFACTUAL_REASONING]: 'counterfactual_reasoning'
  };

  /**
   * Generates question stem, target answer, and explanation based on the operator and derived proposition
   */
  function formQuestionStemAndAnswer(operatorId, derivedProp) {
    let stem = '';
    let answerText = '';

    const subject = derivedProp.subject;
    const object = derivedProp.object;

    switch (operatorId) {
      case REASONING_OPERATORS.OP_A_RULE_APPLICATION:
        stem = `Based on the established rule in the source, what is the expected outcome when ${subject} is evaluated?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_B_CAUSAL_EXPLANATION:
        stem = `According to the source, what causal mechanism directly produces ${subject}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_C_CAUSAL_CHAIN:
        stem = `Through the multi-step causal sequence in the passage, what ultimate effect follows ${subject}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_D_CONDITIONAL_REASONING:
        stem = `Under what specific condition or prerequisite does ${subject} occur?`;
        answerText = derivedProp.condition || object;
        break;

      case REASONING_OPERATORS.OP_E_COMPARATIVE_REASONING:
        stem = `How does the source characterize the relative comparison involving ${subject}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_F_PROCESS_SEQUENCE:
        stem = `In the sequence described by the source, which step must occur prior to ${object}?`;
        answerText = subject;
        break;

      case REASONING_OPERATORS.OP_G_CONSTRAINT_INFERENCE:
        stem = `Applying the constraints specified in the passage, which alternative satisfies all stated criteria?`;
        answerText = subject;
        break;

      case REASONING_OPERATORS.OP_H_CATEGORY_INFERENCE:
        stem = derivedProp.relation_type === RELATION_TYPES.DEFINITION_OF
          ? `According to the source, which statement best defines ${subject}?`
          : `Based on its defining attributes in the text, to which category or classification does ${subject} belong?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_I_EXCEPTION_REASONING:
        stem = `Which entity or condition is explicitly identified as an exception to the general rule regarding ${object}?`;
        answerText = subject;
        break;

      case REASONING_OPERATORS.OP_J_CONTRASTIVE_EXPLANATION:
        stem = `What fundamental contrast or property is highlighted for ${subject}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_K_EVIDENCE_CONCLUSION:
        stem = `What primary empirical evidence does the text cite to substantiate the claim regarding ${subject}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_L_ERROR_DIAGNOSIS:
        stem = `Which logical fallacy or misinterpretation contradicts the source's findings on ${subject}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_M_QUANTITATIVE_REASONING:
        stem = `Based on the quantitative relationships stated in the text, how does an increase in ${subject} affect ${object}?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_N_CONCEPTUAL_DISCRIMINATION:
        stem = `What is the primary factor that distinguishes ${subject} from other concepts?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_O_MULTIHOP_SYNTHESIS:
        stem = `Synthesizing the findings across the document, how does ${subject} relate to the broader conclusion?`;
        answerText = object;
        break;

      case REASONING_OPERATORS.OP_P_COUNTERFACTUAL_REASONING:
        stem = `Based on the directional principles established in the text, what consequence would follow ${subject}?`;
        answerText = object;
        break;

      default:
        stem = `Which statement accurately reflects the relationship involving ${subject}?`;
        answerText = object;
        break;
    }

    return { stem, answerText };
  }

  /**
   * Constructs a complete proof-carrying Question Candidate
   */
  function constructQuestionCandidate(operatorResult, graph, context) {
    if (!operatorResult || !operatorResult.success || !operatorResult.derived) {
      return null;
    }

    const operatorId = operatorResult.operator;
    const derivedProp = operatorResult.derived;
    const proofTrace = operatorResult.proof_trace;
    const difficulty = operatorResult.difficulty || DIFFICULTY_LEVELS.APPLICATION;

    const { stem, answerText } = formQuestionStemAndAnswer(operatorId, derivedProp);
    if (!stem || stem.length <= 12 || !answerText || answerText.length < 2) {
      return null;
    }
    // Correct answers are shown verbatim. Reject fragments and run-ons rather
    // than publishing an option that cannot be read on its own.
    if (!Linguistics.isSafeSpan(answerText, 150)) {
      return null;
    }

    // Generate 3 typed misconception distractors
    const distractors = Distractors.generateMisconceptionDistractors(
      derivedProp,
      answerText,
      operatorId,
      graph
    );

    if (distractors.length < 3) {
      return null; // Strict gate: must have 3 verified distractors
    }

    const candidateId = generateCandidateId();
    const subtype = OPERATOR_SUBTYPE_MAP[operatorId] || 'single_choice';

    const KEYS = ['A', 'B', 'C', 'D'];
    const correctOption = {
      text: answerText,
      is_correct: true,
      key: KEYS[0]
    };
    const options = [
      correctOption,
      ...distractors.map((d, idx) => Object.assign({}, d, { key: KEYS[idx + 1] }))
    ];

    const excerpt = derivedProp.supporting_excerpt || '';

    // Evidence fact IDs: every premise must resolve to a verified fact or a
    // graph proposition. A candidate with any unresolved premise is dropped
    // rather than attached to unrelated evidence.
    const availableFacts = (context && Array.isArray(context.facts)) ? context.facts : [];
    const evidenceFactIds = [];
    const premiseExcerpts = [];
    const premiseOffsets = [];

    if (proofTrace && Array.isArray(proofTrace.premises) && proofTrace.premises.length > 0) {
      for (const pid of proofTrace.premises) {
        const fact = availableFacts.find((f) => f.fact_id === pid);
        if (fact) {
          if (!evidenceFactIds.includes(pid)) {
            evidenceFactIds.push(pid);
            if (fact.supporting_excerpt) premiseExcerpts.push(fact.supporting_excerpt);
            if (fact.source_start != null && fact.source_end != null) {
              premiseOffsets.push({ fact_id: pid, start: fact.source_start, end: fact.source_end });
            }
          }
          continue;
        }
        const propNode = graph && typeof graph.getProposition === 'function'
          ? graph.getProposition(pid)
          : null;
        if (!propNode || propNode.id !== pid) {
          return null;
        }
        if (!evidenceFactIds.includes(pid)) {
          evidenceFactIds.push(pid);
          if (propNode.supporting_excerpt) premiseExcerpts.push(propNode.supporting_excerpt);
          if (propNode.source_start != null && propNode.source_end != null) {
            premiseOffsets.push({ fact_id: pid, start: propNode.source_start, end: propNode.source_end });
          }
        }
      }
    }

    // Strict evidence integrity: a question without resolved evidence is not
    // publishable.
    if (evidenceFactIds.length === 0) {
      return null;
    }

    // Quotation: multi-premise results retain distinct premise boundaries
    const excerptQuote = premiseExcerpts.length > 0 ? premiseExcerpts.join(' [Premise]: ') : excerpt;
    const explanation = `Source verification: "${excerptQuote}". ` +
      `This confirms that ${derivedProp.subject} ${derivedProp.predicate} ${derivedProp.object}.`;

    const candidate = {
      id: candidateId,
      candidate_id: candidateId,
      type: 'single_choice',
      question_subtype: subtype,
      stem: stem,
      options: options,
      answer_key: 'A', // Will be rotated deterministically during selection
      expected_answer: answerText,

      // Strict Application Contract Fields
      knowledge_units: ['KU-REASONING-V2'],
      source_title: derivedProp.source_section || (context && context.sourceTitle) || 'Source Document',
      source_page: derivedProp.source_page != null ? derivedProp.source_page : 1,
      supporting_excerpt: excerptQuote,
      explanation: explanation,
      evidence: {
        fact_ids: evidenceFactIds,
        excerpts: premiseExcerpts,
        source_offsets: premiseOffsets,
        stem_relation: derivedProp.normalized_relation || derivedProp.predicate,
        temporal_scope: derivedProp.temporal_scope || ''
      },
      verification: {
        status: 'provisional',
        rules: ['source_fact', 'typed_options', 'evidence_quoted', 'answer_verified', 'scope_preserved', 'proof_trace_pending_validation']
      },

      // Proof-Carrying Metadata
      primary_operator: operatorId,
      target_concepts: [derivedProp.subject, derivedProp.object],
      relation_keys: [`${derivedProp.subject_normalized || derivedProp.subject}|${derivedProp.relation_type}`],
      premises_used: proofTrace ? proofTrace.premises : [],
      inference_steps: proofTrace ? proofTrace.steps : [],
      proof_trace: proofTrace,
      derived_proposition: derivedProp,
      difficulty: difficulty,
      quality_scores: {
        conceptual_depth: difficulty === DIFFICULTY_LEVELS.SYNTHESIS ? 5 : difficulty === DIFFICULTY_LEVELS.ANALYSIS ? 4 : 3,
        reasoning_validity: Math.round(((proofTrace && proofTrace.steps && proofTrace.steps.length >= 2 ? 0.9 : 0.75) + (evidenceFactIds.length === (proofTrace ? proofTrace.premises.length : 1) ? 0.1 : 0)) * 100) / 100,
        evidence_completeness: proofTrace && proofTrace.premises && proofTrace.premises.length > 0 ? Math.round((evidenceFactIds.length / proofTrace.premises.length) * 100) / 100 : 0.8,
        clarity: (stem.length >= 25 && stem.length <= 150) ? 0.95 : 0.85
      }
    };

    return candidate;
  }

  const Constructors = {
    constructQuestionCandidate,
    resetCandidateCounter,
    OPERATOR_SUBTYPE_MAP
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Constructors;
  global.ReasoningConstructors = Constructors;
})(typeof globalThis !== 'undefined' ? globalThis : this);
