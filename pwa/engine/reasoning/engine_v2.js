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

  /**
   * Run all 16 reasoning operators over the Knowledge Graph
   */
  function generateReasoningCandidates(graph, context) {
    Constructors.resetCandidateCounter();
    const candidates = [];
    const allProps = graph.getAllPropositions();

    // 1. Single-Proposition Operators
    for (const prop of allProps) {
      // Op B: Causal Explanation
      const resB = Operators.executeOperatorB(prop);
      if (resB.success) {
        const cand = Constructors.constructQuestionCandidate(resB, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op D: Conditional Reasoning
      const resD = Operators.executeOperatorD(prop);
      if (resD.success) {
        const cand = Constructors.constructQuestionCandidate(resD, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op E: Comparative Reasoning
      const resE = Operators.executeOperatorE(prop);
      if (resE.success) {
        const cand = Constructors.constructQuestionCandidate(resE, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op F: Process Sequence
      const resF = Operators.executeOperatorF(prop);
      if (resF.success) {
        const cand = Constructors.constructQuestionCandidate(resF, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op H: Category Inference
      const resH = Operators.executeOperatorH(prop);
      if (resH.success) {
        const cand = Constructors.constructQuestionCandidate(resH, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op I: Exception Reasoning
      const resI = Operators.executeOperatorI(prop);
      if (resI.success) {
        const cand = Constructors.constructQuestionCandidate(resI, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op K: Evidence-Based Conclusion
      const resK = Operators.executeOperatorK(prop);
      if (resK.success) {
        const cand = Constructors.constructQuestionCandidate(resK, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op L: Error Diagnosis
      const resL = Operators.executeOperatorL(prop, 'reversed_causality');
      if (resL.success) {
        const cand = Constructors.constructQuestionCandidate(resL, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op M: Quantitative Reasoning
      const resM = Operators.executeOperatorM(prop);
      if (resM.success) {
        const cand = Constructors.constructQuestionCandidate(resM, graph, context);
        if (cand) candidates.push(cand);
      }

      // Op P: Counterfactual Reasoning
      const resP = Operators.executeOperatorP(prop);
      if (resP.success) {
        const cand = Constructors.constructQuestionCandidate(resP, graph, context);
        if (cand) candidates.push(cand);
      }
    }

    // 2. Pairwise Operators (bounded traversal)
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
          const cand = Constructors.constructQuestionCandidate(resC1, graph, context);
          if (cand) candidates.push(cand);
        } else {
          const resC2 = Operators.executeOperatorC(p2, p1);
          if (resC2.success) {
            const cand = Constructors.constructQuestionCandidate(resC2, graph, context);
            if (cand) candidates.push(cand);
          }
        }

        // Op A: Rule Application
        const resA = Operators.executeOperatorA(p1, p2);
        if (resA.success) {
          const cand = Constructors.constructQuestionCandidate(resA, graph, context);
          if (cand) candidates.push(cand);
        }

        // Op J: Contrastive Explanation
        const resJ = Operators.executeOperatorJ(p1, p2);
        if (resJ.success) {
          const cand = Constructors.constructQuestionCandidate(resJ, graph, context);
          if (cand) candidates.push(cand);
        }

        // Op N: Conceptual Discrimination
        const resN = Operators.executeOperatorN(p1, p2);
        if (resN.success) {
          const cand = Constructors.constructQuestionCandidate(resN, graph, context);
          if (cand) candidates.push(cand);
        }

        // Op O: Multi-Hop Synthesis
        const resO = Operators.executeOperatorO(p1, p2);
        if (resO.success) {
          const cand = Constructors.constructQuestionCandidate(resO, graph, context);
          if (cand) candidates.push(cand);
        }
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
    generateReasoningCandidates,
    generateReasoningQuestionBank
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = EngineV2;
  global.StudySynthReasoningV2 = EngineV2;
})(typeof globalThis !== 'undefined' ? globalThis : this);
