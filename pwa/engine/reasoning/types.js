/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * types.js — Semantic types, relationship vocabulary, operator registries,
 * and rejection codes.
 */

(function (global) {
  'use strict';

  // Minimum required relationship vocabulary from engineering specification
  const RELATION_TYPES = Object.freeze({
    // Definitional & Structural
    DEFINITION_OF: 'DEFINITION_OF',
    HAS_PROPERTY: 'HAS_PROPERTY',
    HAS_COMPONENT: 'HAS_COMPONENT',
    PART_OF: 'PART_OF',
    MEMBER_OF: 'MEMBER_OF',
    INSTANCE_OF: 'INSTANCE_OF',
    EXAMPLE_OF: 'EXAMPLE_OF',
    CONSISTS_OF: 'CONSISTS_OF',

    // Causal & Mechanism
    CAUSES: 'CAUSES',
    CONTRIBUTES_TO: 'CONTRIBUTES_TO',
    LEADS_TO: 'LEADS_TO',
    ENABLES: 'ENABLES',
    PREVENTS: 'PREVENTS',
    PRODUCES: 'PRODUCES',

    // Dependency & Conditional
    REQUIRES: 'REQUIRES',
    DEPENDS_ON: 'DEPENDS_ON',
    CONDITIONAL_ON: 'CONDITIONAL_ON',

    // Quantitative & Variable Change
    INCREASES: 'INCREASES',
    DECREASES: 'DECREASES',

    // Comparative & Relational
    COMPARED_WITH: 'COMPARED_WITH',
    GREATER_THAN: 'GREATER_THAN',
    LESS_THAN: 'LESS_THAN',
    SIMILAR_TO: 'SIMILAR_TO',
    DIFFERENT_FROM: 'DIFFERENT_FROM',
    CONTRASTS_WITH: 'CONTRASTS_WITH',

    // Process & Temporal Sequence
    PRECEDES: 'PRECEDES',
    FOLLOWS: 'FOLLOWS',

    // Boundary & Scope
    EXCEPTION_TO: 'EXCEPTION_TO',

    // Evidence & Justification
    SUPPORTS: 'SUPPORTS',
    EVIDENCE_FOR: 'EVIDENCE_FOR',

    // Functional & Purpose
    USED_FOR: 'USED_FOR'
  });

  // Polarity / Negation
  const POLARITY = Object.freeze({
    POSITIVE: 'POSITIVE',
    NEGATIVE: 'NEGATIVE',
    AMBIGUOUS: 'AMBIGUOUS'
  });

  // Modality
  const MODALITY = Object.freeze({
    FACT: 'FACT',               // Asserted as certain fact
    POSSIBILITY: 'POSSIBILITY', // May, might, could, possible
    OBLIGATION: 'OBLIGATION',   // Must, should, required
    HYPOTHETICAL: 'HYPOTHETICAL' // If, suppose, hypothetical
  });

  // Quantification
  const QUANTIFICATION = Object.freeze({
    UNIVERSAL: 'UNIVERSAL',     // All, every, each
    EXISTENTIAL: 'EXISTENTIAL', // Some, many, several
    NONE: 'NONE',               // No, none, neither
    UNSPECIFIED: 'UNSPECIFIED'  // Bare noun phrase
  });

  // 16 Reasoning Operators from Specification Part III
  const REASONING_OPERATORS = Object.freeze({
    OP_A_RULE_APPLICATION: 'OP_A_RULE_APPLICATION',
    OP_B_CAUSAL_EXPLANATION: 'OP_B_CAUSAL_EXPLANATION',
    OP_C_CAUSAL_CHAIN: 'OP_C_CAUSAL_CHAIN',
    OP_D_CONDITIONAL_REASONING: 'OP_D_CONDITIONAL_REASONING',
    OP_E_COMPARATIVE_REASONING: 'OP_E_COMPARATIVE_REASONING',
    OP_F_PROCESS_SEQUENCE: 'OP_F_PROCESS_SEQUENCE',
    OP_G_CONSTRAINT_INFERENCE: 'OP_G_CONSTRAINT_INFERENCE',
    OP_H_CATEGORY_INFERENCE: 'OP_H_CATEGORY_INFERENCE',
    OP_I_EXCEPTION_REASONING: 'OP_I_EXCEPTION_REASONING',
    OP_J_CONTRASTIVE_EXPLANATION: 'OP_J_CONTRASTIVE_EXPLANATION',
    OP_K_EVIDENCE_CONCLUSION: 'OP_K_EVIDENCE_CONCLUSION',
    OP_L_ERROR_DIAGNOSIS: 'OP_L_ERROR_DIAGNOSIS',
    OP_M_QUANTITATIVE_REASONING: 'OP_M_QUANTITATIVE_REASONING',
    OP_N_CONCEPTUAL_DISCRIMINATION: 'OP_N_CONCEPTUAL_DISCRIMINATION',
    OP_O_MULTIHOP_SYNTHESIS: 'OP_O_MULTIHOP_SYNTHESIS',
    OP_P_COUNTERFACTUAL_REASONING: 'OP_P_COUNTERFACTUAL_REASONING'
  });

  // Cognitive Difficulty Tiers (Bloom Taxonomy Grounded)
  const DIFFICULTY_LEVELS = Object.freeze({
    RECALL: 'recall',
    COMPREHENSION: 'comprehension',
    APPLICATION: 'application',
    ANALYSIS: 'analysis',
    SYNTHESIS: 'synthesis'
  });

  // Strict Validity Rejection Codes
  const REJECTION_CODES = Object.freeze({
    UNSUPPORTED_PREMISE: 'UNSUPPORTED_PREMISE',
    AMBIGUOUS_NEGATION: 'AMBIGUOUS_NEGATION',
    UNRESOLVED_CONDITION: 'UNRESOLVED_CONDITION',
    CYCLIC_DEPENDENCY: 'CYCLIC_DEPENDENCY',
    MAX_DEPTH_EXCEEDED: 'MAX_DEPTH_EXCEEDED',
    CONVERSE_FALLACY_RISK: 'CONVERSE_FALLACY_RISK',
    SPECULATIVE_MODALITY: 'SPECULATIVE_MODALITY',
    MISSING_EVIDENCE_SPAN: 'MISSING_EVIDENCE_SPAN',
    INSUFFICIENT_DISTRACTORS: 'INSUFFICIENT_DISTRACTORS',
    DUPLICATE_CANDIDATE: 'DUPLICATE_CANDIDATE',
    UNVERIFIED_TRANSFORMATION: 'UNVERIFIED_TRANSFORMATION',
    AMBIGUOUS_ANSWER: 'AMBIGUOUS_ANSWER',
    PRECONDITION_NOT_MET: 'PRECONDITION_NOT_MET'
  });

  // Typed Distractor Transformations
  const DISTRACTOR_TYPES = Object.freeze({
    REVERSED_CAUSALITY: 'reversed_causality',
    INVERTED_CONDITION: 'inverted_condition',
    REVERSED_COMPARISON: 'reversed_comparison',
    OUT_OF_SCOPE_APPLICATION: 'out_of_scope_application',
    OMITTED_STEP: 'omitted_step',
    CATEGORY_CONFUSION: 'category_confusion',
    REVERSED_SEQUENCE: 'reversed_sequence',
    QUANTITATIVE_INVERSION: 'quantitative_inversion',
    EXTENDED_SPECULATION: 'extended_speculation',
    OPPOSITE_EFFECT: 'opposite_effect'
  });

  const Types = {
    RELATION_TYPES,
    POLARITY,
    MODALITY,
    QUANTIFICATION,
    REASONING_OPERATORS,
    DIFFICULTY_LEVELS,
    REJECTION_CODES,
    DISTRACTOR_TYPES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Types;
  global.ReasoningTypes = Types;
})(typeof globalThis !== 'undefined' ? globalThis : this);
