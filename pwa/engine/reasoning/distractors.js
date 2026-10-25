/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * distractors.js — Misconception-driven distractor generator.
 * Produces plausible, grammatically matched distractors derived from
 * specific reasoning errors (reversed causality, condition inversion,
 * comparison flipping, scope overgeneralization) and verifies them against the graph.
 *
 * Integrity rules:
 *  - every option is typed and traceable to the source graph;
 *  - a value the source asserts for the same subject is never offered;
 *  - options are same-kind (relation values first, then source entities);
 *  - when fewer than three defensible options exist the operator returns
 *    nothing and the candidate is rejected instead of being backfilled with
 *    unrelated filler.
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
    return String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function cleanOption(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,.;:)\]]+\s*/, '')
      .replace(/[,.;:]+$/, '');
  }

  function graphPropositions(graph) {
    return graph && typeof graph.getAllPropositions === 'function' ? graph.getAllPropositions() : [];
  }

  /**
   * Builds 3 distinct, typed distractors for a derived proposition and target correct answer
   */
  function generateMisconceptionDistractors(derivedProp, correctAnswerText, operatorId, graph) {
    const distractors = [];
    const correct = normalize(correctAnswerText);
    const usedTexts = new Set([correct]);
    const props = graphPropositions(graph);
    const relation = derivedProp.relation_type;

    function addDistractor(text, distractorOrigin, transformationType) {
      const clean = cleanOption(text);
      if (!clean || clean.length < 3 || clean.length > 140) return false;
      // A distractor is shown verbatim: it must be a complete, concise phrase.
      if (!Linguistics.isSafeSpan(clean, 140)) return false;
      const norm = normalize(clean);
      if (!norm || usedTexts.has(norm)) return false;

      // Closed-context verification: never offer a statement the source
      // already asserts about the same derived subject.
      const asserted = props.some((prop) =>
        normalize(prop.subject) === normalize(derivedProp.subject) && normalize(prop.object) === norm
      );
      if (asserted) return false;

      usedTexts.add(norm);
      distractors.push({
        text: clean,
        is_correct: false,
        distractor_origin: distractorOrigin || 'misconception_transformation',
        transformation_type: transformationType || DISTRACTOR_TYPES.EXTENDED_SPECULATION
      });
      return true;
    }

    function valuesFrom(relationTypes, field, exclude) {
      const values = [];
      const excluded = new Set((exclude || []).map(normalize));
      for (const prop of props) {
        if (!relationTypes.includes(prop.relation_type)) continue;
        const value = prop[field];
        if (!value) continue;
        const norm = normalize(value);
        if (!norm || norm === correct || excluded.has(norm)) continue;
        if (values.some((existing) => normalize(existing) === norm)) continue;
        values.push(value);
      }
      return values;
    }

    // Fallback pool: concrete entities that actually appear in the source
    // graph. They are same-surface-kind answers, never generic filler.
    function sourceEntities(exclude) {
      const values = [];
      const excluded = new Set((exclude || []).map(normalize));
      excluded.add(correct);
      for (const prop of props) {
        for (const value of [prop.subject, prop.object]) {
          if (!value) continue;
          const norm = normalize(value);
          if (!norm || norm.length < 3 || excluded.has(norm)) continue;
          if (!Linguistics.isNounPhraseSpan(value, 80)) continue;
          if (norm === normalize(derivedProp.subject) || norm === normalize(derivedProp.object)) continue;
          if (norm.includes(correct) || correct.includes(norm)) continue;
          if (values.some((existing) => normalize(existing) === norm)) continue;
          values.push(value);
        }
      }
      return values;
    }

    function fillFrom(pool, origin, transformation) {
      for (const value of pool) {
        if (distractors.length >= 3) break;
        addDistractor(value, origin, transformation);
      }
    }

    if (relation === RELATION_TYPES.CAUSES || relation === RELATION_TYPES.LEADS_TO || relation === RELATION_TYPES.PRODUCES) {
      // A cause question: reversed causality first, then other stated causes,
      // then other source entities.
      addDistractor(derivedProp.subject, 'reversed_relation', DISTRACTOR_TYPES.REVERSED_CAUSALITY);
      fillFrom(
        valuesFrom([RELATION_TYPES.CAUSES, RELATION_TYPES.LEADS_TO, RELATION_TYPES.PRODUCES], 'subject'),
        'confusable_fact',
        DISTRACTOR_TYPES.OPPOSITE_EFFECT
      );
      fillFrom(sourceEntities(), 'wrong_entity', DISTRACTOR_TYPES.OPPOSITE_EFFECT);
    } else if (relation === RELATION_TYPES.PRECEDES || relation === RELATION_TYPES.FOLLOWS) {
      // A "which step comes first" question: the later step is the classic
      // reversal, other sequence steps are confusable alternatives.
      addDistractor(derivedProp.object, 'reversed_relation', DISTRACTOR_TYPES.REVERSED_SEQUENCE);
      fillFrom(
        valuesFrom([RELATION_TYPES.PRECEDES, RELATION_TYPES.FOLLOWS], 'subject'),
        'confusable_fact',
        DISTRACTOR_TYPES.OMITTED_STEP
      );
      fillFrom(
        valuesFrom([RELATION_TYPES.PRECEDES, RELATION_TYPES.FOLLOWS], 'object'),
        'confusable_fact',
        DISTRACTOR_TYPES.REVERSED_SEQUENCE
      );
      fillFrom(sourceEntities(), 'wrong_entity', DISTRACTOR_TYPES.OMITTED_STEP);
    } else if (relation === RELATION_TYPES.INSTANCE_OF || relation === RELATION_TYPES.DEFINITION_OF) {
      // A classification question: other stated categories first, then
      // source entities as wrong-category alternatives.
      fillFrom(
        valuesFrom([RELATION_TYPES.INSTANCE_OF, RELATION_TYPES.DEFINITION_OF], 'object'),
        'wrong_category',
        DISTRACTOR_TYPES.CATEGORY_CONFUSION
      );
      fillFrom(sourceEntities(), 'wrong_category', DISTRACTOR_TYPES.CATEGORY_CONFUSION);
    } else if (relation === RELATION_TYPES.EXCEPTION_TO) {
      // An exception question: other exceptions, then entities that appear in
      // the general rule but are not the exception.
      fillFrom(
        valuesFrom([RELATION_TYPES.EXCEPTION_TO], 'object'),
        'wrong_entity',
        DISTRACTOR_TYPES.OUT_OF_SCOPE_APPLICATION
      );
      const ruleText = String(derivedProp.object || '');
      const mentioned = ruleText
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 4 && !/^(?:with|from|that|this|these|those|which|their|there|then|than|have|were|when|what|will|also|into|over|only|most|some|such|each|every|about|other|more|less|contain|contains|include|includes|consist|consists|comprise|comprises|except|excluding|exception|general|rule|governed|apply|applies|follow|follows|under|without)$/i.test(word));
      fillFrom(mentioned, 'partial_truth', DISTRACTOR_TYPES.OUT_OF_SCOPE_APPLICATION);
      fillFrom(sourceEntities(), 'wrong_entity', DISTRACTOR_TYPES.OUT_OF_SCOPE_APPLICATION);
    } else if (relation === RELATION_TYPES.CONTRASTS_WITH) {
      // A contrast question: the swapped pair is the reversal, other stated
      // contrasts are confusable alternatives.
      const pair = String(derivedProp.object || '').split(/\s+vs\s+/i);
      if (pair.length === 2) {
        addDistractor(`${pair[1]} vs ${pair[0]}`, 'reversed_relation', DISTRACTOR_TYPES.REVERSED_COMPARISON);
      }
      fillFrom(
        valuesFrom([RELATION_TYPES.CONTRASTS_WITH], 'object'),
        'confusable_fact',
        DISTRACTOR_TYPES.REVERSED_COMPARISON
      );
      fillFrom(sourceEntities(), 'wrong_entity', DISTRACTOR_TYPES.REVERSED_COMPARISON);
    } else if (relation === RELATION_TYPES.INCREASES || relation === RELATION_TYPES.DECREASES) {
      const oppositeVerb = relation === RELATION_TYPES.INCREASES ? 'decreases' : 'increases';
      addDistractor(`It ${oppositeVerb} ${derivedProp.object}`, 'adjacent_value', DISTRACTOR_TYPES.OPPOSITE_EFFECT);
      fillFrom(sourceEntities(), 'wrong_entity', DISTRACTOR_TYPES.OPPOSITE_EFFECT);
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
