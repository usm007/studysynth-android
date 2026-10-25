/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * distractors.js — Misconception-driven distractor generator.
 * Produces plausible, grammatically matched distractors derived from
 * specific reasoning errors (reversed causality, condition inversion,
 * comparison flipping, scope overgeneralization) and verifies them against the graph.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const Linguistics = (typeof module !== 'undefined' && module.exports)
    ? require('./linguistics.js')
    : global.ReasoningLinguistics;

  const { RELATION_TYPES, DISTRACTOR_TYPES } = Types;

  function normalize(str) {
    return String(str || '').toLowerCase().trim();
  }

  // Phase 8 fix: a distractor object that is a bare pronoun, a preposition
  // phrase, or a dangling fragment ("It", "to", "of the", "which") makes
  // the whole distractor malformed, even if the template is grammatical.
  function isFragmentObject(raw) {
    const text = String(raw || '').trim();
    if (!text || text.length < 2) return true;
    if (/^(it|they|this|that|these|those|us|you|he|she|we|them|him|her)$/i.test(text)) return true;
    if (/^(of|to|in|on|for|with|by|as|if|when|while|and|or|but|from|at|into)\b/i.test(text)) return true;
    if (/\b(which|that|who|whom|whose|and|or|but|of|to|in|on|for|with|by|as|the|a|an)\s*[.!?]?\s*$/.test(text)) return true;
    if (text.includes(';') || text.includes('|')) return true;
    if (/^[^A-Za-z0-9]+/.test(text)) return true;
    if (/\b(would|could|should|will|can|may|might)\s*[.!?]?\s*$/.test(text)) return true;
    return false;
  }

  /**
   * Builds 3 distinct, typed distractors for a derived proposition and target correct answer
   */
  function generateMisconceptionDistractors(derivedProp, correctAnswerText, operatorId, graph) {
    const distractors = [];
    const usedTexts = new Set([normalize(correctAnswerText)]);

    function addDistractor(text, distractorOrigin, transformationType) {
      if (!text || typeof text !== 'string') return false;
      const clean = text.trim();
      const norm = normalize(clean);
      if (clean.length < 3 || usedTexts.has(norm)) return false;
      // Phase 8 fix: reject a distractor whose trailing concept is a
      // fragment, e.g. "It operates independently without influencing It"
      // or "... without influencing to". A candidate left with fewer than
      // three distractors is dropped by the constructor, which is correct:
      // do not backfill a malformed distractor to hit a target count.
      const influenceMatch = clean.match(/without influencing\s+(.+)$/i);
      if (influenceMatch && isFragmentObject(influenceMatch[1])) return false;
      if (isFragmentObject(object) && clean.includes(object)) return false;

      // Closed-context verification: ensure distractor is not accidentally true in the source graph
      if (graph && typeof graph.findPropositions === 'function') {
        const matchingTrueProps = graph.findPropositions({ subject: derivedProp.subject });
        if (matchingTrueProps.some((p) => normalize(p.object) === norm)) {
          // Rejected: distractor statement is actually asserted as true in the source graph
          return false;
        }
      }

      // Verify whether explicitly contradicted or reasoning misconception
      let finalOrigin = distractorOrigin || 'misconception_transformation';
      let finalTransformation = transformationType || 'reasoning_error';

      if (graph && typeof graph.hasContradiction === 'function' && graph.hasContradiction(clean, derivedProp.relation_type, correctAnswerText)) {
        finalTransformation = 'explicit_contradiction';
      }

      usedTexts.add(norm);
      distractors.push({
        text: clean,
        is_correct: false,
        distractor_origin: finalOrigin,
        transformation_type: finalTransformation
      });
      return true;
    }

    const subject = derivedProp.subject;
    const object = derivedProp.object;

    // Transformation 1: Reversed causality / directional inversion
    if (derivedProp.relation_type === RELATION_TYPES.CAUSES || derivedProp.relation_type === RELATION_TYPES.LEADS_TO) {
      addDistractor(
        `It is caused by ${subject} rather than causing it`,
        'reversed_relation',
        DISTRACTOR_TYPES.REVERSED_CAUSALITY
      );
      addDistractor(
        `It prevents ${object} from occurring`,
        'reversed_relation',
        DISTRACTOR_TYPES.OPPOSITE_EFFECT
      );
      addDistractor(
        `It operates independently without influencing ${object}`,
        'scope_error',
        DISTRACTOR_TYPES.EXTENDED_SPECULATION
      );
    }
    // Transformation 2: Variable change inversion (increases vs decreases)
    else if (derivedProp.relation_type === RELATION_TYPES.INCREASES || derivedProp.relation_type === RELATION_TYPES.DECREASES) {
      const oppositeVerb = derivedProp.relation_type === RELATION_TYPES.INCREASES ? 'decreases' : 'increases';
      addDistractor(
        `It ${oppositeVerb} ${object}`,
        'adjacent_value',
        DISTRACTOR_TYPES.OPPOSITE_EFFECT
      );
      addDistractor(
        `It stabilizes ${object} at a constant baseline`,
        'partial_truth',
        DISTRACTOR_TYPES.EXTENDED_SPECULATION
      );
      addDistractor(
        `It has no measurable effect on ${object}`,
        'scope_error',
        DISTRACTOR_TYPES.INVERTED_CONDITION
      );
    }
    // Transformation 3: Comparative inversion (greater than vs less than)
    else if (derivedProp.relation_type === RELATION_TYPES.GREATER_THAN || derivedProp.relation_type === RELATION_TYPES.LESS_THAN) {
      const invertedComparator = derivedProp.relation_type === RELATION_TYPES.GREATER_THAN ? 'lower than' : 'higher than';
      addDistractor(
        `It is significantly ${invertedComparator} ${object}`,
        'adjacent_value',
        DISTRACTOR_TYPES.REVERSED_COMPARISON
      );
      addDistractor(
        `It is strictly equivalent in all measurements to ${object}`,
        'partial_truth',
        DISTRACTOR_TYPES.REVERSED_COMPARISON
      );
      addDistractor(
        `Its relative magnitude cannot be compared to ${object}`,
        'scope_error',
        DISTRACTOR_TYPES.EXTENDED_SPECULATION
      );
    }
    // Transformation 4: Prerequisite / conditional inversion
    else if (derivedProp.relation_type === RELATION_TYPES.CONDITIONAL_ON || derivedProp.relation_type === RELATION_TYPES.REQUIRES) {
      addDistractor(
        `It occurs unconditionally without requiring ${derivedProp.condition || object}`,
        'scope_error',
        DISTRACTOR_TYPES.INVERTED_CONDITION
      );
      addDistractor(
        `It requires the exact absence of ${derivedProp.condition || object}`,
        'reversed_relation',
        DISTRACTOR_TYPES.INVERTED_CONDITION
      );
      addDistractor(
        `It is triggered only after ${derivedProp.condition || object} is fully depleted`,
        'partial_truth',
        DISTRACTOR_TYPES.EXTENDED_SPECULATION
      );
    }
    // Transformation 5: Sequence reversal
    else if (derivedProp.relation_type === RELATION_TYPES.PRECEDES) {
      addDistractor(
        `It occurs strictly after ${object}`,
        'adjacent_value',
        DISTRACTOR_TYPES.REVERSED_SEQUENCE
      );
      addDistractor(
        `It occurs simultaneously in parallel with ${object}`,
        'partial_truth',
        DISTRACTOR_TYPES.REVERSED_SEQUENCE
      );
      addDistractor(
        `It eliminates the need for ${object}`,
        'scope_error',
        DISTRACTOR_TYPES.OMITTED_STEP
      );
    }
    // Transformation 6: Exception / boundary violation
    else if (derivedProp.relation_type === RELATION_TYPES.EXCEPTION_TO) {
      addDistractor(
        `It is fully governed by the general rule without exception`,
        'scope_error',
        DISTRACTOR_TYPES.OUT_OF_SCOPE_APPLICATION
      );
      addDistractor(
        `It defines the universal baseline rather than being an exception`,
        'partial_truth',
        DISTRACTOR_TYPES.OUT_OF_SCOPE_APPLICATION
      );
      addDistractor(
        `It invalidates the entire general rule across all cases`,
        'scope_error',
        DISTRACTOR_TYPES.EXTENDED_SPECULATION
      );
    }

    // Require genuine, defensible distractors; do not backfill arbitrary concepts
    return distractors.slice(0, 3);
  }

  const Distractors = {
    generateMisconceptionDistractors
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Distractors;
  global.ReasoningDistractors = Distractors;
})(typeof globalThis !== 'undefined' ? globalThis : this);
