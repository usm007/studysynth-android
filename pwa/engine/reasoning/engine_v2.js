/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * engine_v2.js — Main orchestrator of the V2 reasoning pipeline.
 * Runs 100% offline, deterministic, zero-network, zero-ML.
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

  const GraphModule = (typeof module !== 'undefined' && module.exports)
    ? require('./graph.js')
    : global.ReasoningGraph;

  const Operators = (typeof module !== 'undefined' && module.exports)
    ? require('./operators.js')
    : global.ReasoningOperators;

  const Distractors = (typeof module !== 'undefined' && module.exports)
    ? require('./distractors.js')
    : global.ReasoningDistractors;

  const Constructors = (typeof module !== 'undefined' && module.exports)
    ? require('./constructors.js')
    : global.ReasoningConstructors;

  const Validator = (typeof module !== 'undefined' && module.exports)
    ? require('./validator.js')
    : global.ReasoningValidator;

  const Ranking = (typeof module !== 'undefined' && module.exports)
    ? require('./ranking.js')
    : global.ReasoningRanking;

  const KEYS = ['A', 'B', 'C', 'D'];

  function padNumber(num, size) {
    let s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
  }

  function reorderOptions(options, correctIndex, targetIndex) {
    const correct = options[correctIndex];
    const others = options.filter((_, index) => index !== correctIndex);
    const ordered = [];
    let otherIndex = 0;
    for (let index = 0; index < 4; index++) {
      const source = index === targetIndex ? correct : others[otherIndex++];
      ordered.push(Object.assign({}, source, { key: KEYS[index] }));
    }
    return ordered;
  }

  // Production operator set. The remaining operators stay implemented and
  // directly testable, but are not allowed to publish questions: their proof
  // contracts are not yet strong enough to guarantee source-bound answers.
  const PRODUCTION_OPERATORS = Object.freeze([
    'OP_B_CAUSAL_EXPLANATION',
    'OP_C_CAUSAL_CHAIN',
    'OP_F_PROCESS_SEQUENCE',
    'OP_H_CATEGORY_INFERENCE',
    'OP_I_EXCEPTION_REASONING',
    'OP_J_CONTRASTIVE_EXPLANATION'
  ]);

  /**
   * Run the production reasoning operators over the Knowledge Graph
   */
  function generateReasoningCandidates(graph, context) {
    Constructors.resetCandidateCounter();
    const candidates = [];
    const allProps = graph.getAllPropositions();

    const pushCandidate = (result) => {
      if (!result.success) return;
      const cand = Constructors.constructQuestionCandidate(result, graph, context);
      if (cand) candidates.push(cand);
    };

    // 1. Single-Proposition Operators (B, F, H, I)
    for (const prop of allProps) {
      // Op B: Causal Explanation
      pushCandidate(Operators.executeOperatorB(prop));

      // Op F: Process Sequence
      pushCandidate(Operators.executeOperatorF(prop));

      // Op H: Category Inference
      pushCandidate(Operators.executeOperatorH(prop));

      // Op I: Exception Reasoning
      pushCandidate(Operators.executeOperatorI(prop));
    }

    // 2. Pairwise Operators (bounded traversal): C and J
    const maxPairs = 100;
    let pairsEvaluated = 0;

    for (let i = 0; i < allProps.length && pairsEvaluated < maxPairs; i++) {
      for (let j = i + 1; j < allProps.length && pairsEvaluated < maxPairs; j++) {
        pairsEvaluated++;
        const p1 = allProps[i];
        const p2 = allProps[j];

        // Op C: Causal Chain (p1 -> p2 or p2 -> p1)
        const resC1 = Operators.executeOperatorC(p1, p2);
        if (resC1.success) {
          pushCandidate(resC1);
        } else {
          pushCandidate(Operators.executeOperatorC(p2, p1));
        }

        // Op J: Contrastive Explanation
        pushCandidate(Operators.executeOperatorJ(p1, p2));
      }
    }

    return candidates;
  }

  /**
   * Main pipeline entry point: Compiles propositions, builds graph, executes
   * reasoning operators, validates proof traces, and selects diverse question bank.
   */
  function generateReasoningQuestionBank(sections, options) {
    const opts = options || {};
    const targetCount = Number.isFinite(opts.targetCount) && opts.targetCount > 0
      ? Math.floor(opts.targetCount)
      : 15;

    const existingFacts = Array.isArray(opts.facts) ? opts.facts : [];

    // 1. Compile Semantic Intermediate Representation
    const compiled = Representation.compileSemanticRepresentation(sections, existingFacts);
    const propositions = compiled.propositions;

    // 2. Build Knowledge Graph
    const graph = GraphModule.buildGraphFromPropositions(propositions);

    const context = {
      sourceTitle: (sections && sections[0] && sections[0].title) || 'Source Document',
      facts: existingFacts,
      sections: sections || []
    };

    // 3. Execute 16 Reasoning Operators
    const candidates = generateReasoningCandidates(graph, context);

    // 4. Strict Validation Gate
    const validated = [];
    const rejectionCounts = {};

    for (const cand of candidates) {
      const check = Validator.validateCandidate(cand, graph, context);
      if (check.valid) {
        validated.push(cand);
      } else {
        const code = check.code || 'VALIDATION_FAILED';
        rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
      }
    }

    // 5. Coverage-Aware Selection
    const selected = Ranking.selectDiverseCandidates(validated, targetCount);

    // 6. Final Option Rotation and ID assignment conforming to app schema
    const accepted = [];
    let sequence = 0;

    for (const cand of selected) {
      const correctIndex = cand.options.findIndex((o) => o.is_correct === true);
      if (correctIndex === -1) continue;

      const targetIndex = sequence % 4;
      cand.options = reorderOptions(cand.options, correctIndex, targetIndex);
      cand.answer_key = KEYS[targetIndex];
      cand.id = 'Q-LITE-' + padNumber(sequence + 1, 3);

      // Verify post-rotation
      const finalCheck = Validator.validateCandidate(cand, graph, context);
      if (finalCheck.valid) {
        cand.verification = {
          status: 'verified',
          rules: ['source_fact', 'typed_options', 'evidence_quoted', 'answer_verified', 'scope_preserved', 'proof_trace_verified']
        };
        accepted.push(cand);
        sequence++;
      }
    }

    const metrics = {
      propositionCount: propositions.length,
      totalCandidates: candidates.length,
      validatedCandidates: validated.length,
      accepted: accepted.length,
      rejected: Math.max(0, candidates.length - accepted.length),
      rejectionCounts: rejectionCounts
    };

    Object.defineProperty(accepted, 'generation', { value: metrics, enumerable: false });
    Object.defineProperty(accepted, 'facts', { value: existingFacts, enumerable: false });
    Object.defineProperty(accepted, 'graph', { value: graph, enumerable: false });
    Object.defineProperty(accepted, 'propositions', { value: propositions, enumerable: false });

    return accepted;
  }

  const EngineV2 = {
    Types,
    Linguistics,
    Representation,
    GraphModule,
    Operators,
    Distractors,
    Constructors,
    Validator,
    Ranking,
    PRODUCTION_OPERATORS,
    generateReasoningCandidates,
    generateReasoningQuestionBank
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = EngineV2;
  global.StudySynthReasoningV2 = EngineV2;
})(typeof globalThis !== 'undefined' ? globalThis : this);
