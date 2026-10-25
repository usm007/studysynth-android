/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * validator.js — Strict candidate-validity gate.
 * Validates hard requirements: proof completeness, evidence quote matching,
 * option distinctness, typed distractors, and lack of external assumptions.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const { REJECTION_CODES } = Types;

  function normalize(str) {
    return String(str || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const FORBIDDEN_FILLERS = [
    'in accordance with statutory guidelines',
    'under applicable norms',
    'nodal oversight of competent statutory authority',
    'regulatory framework is strictly deferred',
    'jurisdiction applies exclusively to foreign commercial enterprises',
    'provisions are restricted to emergency measures'
  ];

  /**
   * Validate a question candidate against hard validity gates
   */
  function validateCandidate(candidate, graph, context) {
    if (!candidate || typeof candidate !== 'object') {
      return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Candidate is not an object' };
    }

    // 1. Stem Check
    if (!candidate.stem || candidate.stem.length <= 12) {
      return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Question stem is missing or too short' };
    }

    // 2. Options Check: Exactly 4 distinct options
    if (!Array.isArray(candidate.options) || candidate.options.length !== 4) {
      return { valid: false, code: REJECTION_CODES.INSUFFICIENT_DISTRACTORS, message: 'Expected exactly four options' };
    }

    const normalizedOptions = candidate.options.map((o) => normalize(o.text));
    const uniqueOptions = new Set(normalizedOptions);
    if (uniqueOptions.size !== 4) {
      return { valid: false, code: REJECTION_CODES.AMBIGUOUS_ANSWER, message: 'Options must be distinct after normalization' };
    }

    // 3. Exactly 1 correct option
    const correctOptions = candidate.options.filter((o) => o.is_correct === true);
    if (correctOptions.length !== 1) {
      return { valid: false, code: REJECTION_CODES.AMBIGUOUS_ANSWER, message: 'Candidate must have exactly one correct option' };
    }

    // 4. Distractors must have valid typed origin and never be filler
    for (const opt of candidate.options) {
      if (!opt.text || opt.text.trim().length === 0) {
        return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Empty option text' };
      }
      const normText = normalize(opt.text);
      if (FORBIDDEN_FILLERS.some((f) => normText.includes(f))) {
        return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Option uses forbidden generic filler phrase' };
      }
      if (!opt.is_correct) {
        if (!opt.distractor_origin || opt.distractor_origin === 'generic_filler') {
          return { valid: false, code: REJECTION_CODES.INSUFFICIENT_DISTRACTORS, message: 'Distractor origin must be typed and not generic filler' };
        }
      }
    }

    // 5. Proof Trace & Evidence Grounding Check
    if (!candidate.supporting_excerpt || candidate.supporting_excerpt.trim().length < 5) {
      return { valid: false, code: REJECTION_CODES.MISSING_EVIDENCE_SPAN, message: 'Supporting excerpt is missing or empty' };
    }

    if (!candidate.explanation || candidate.explanation.length <= 20) {
      return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Explanation is missing or too short' };
    }

    // Explanation must quote supporting excerpt
    const normExcerpt = normalize(candidate.supporting_excerpt);
    const normExplanation = normalize(candidate.explanation);
    if (!normExplanation.includes(normExcerpt)) {
      return { valid: false, code: REJECTION_CODES.MISSING_EVIDENCE_SPAN, message: 'Explanation must quote supporting excerpt' };
    }

    // 6. Operator consistency check
    if (!candidate.proof_trace || typeof candidate.proof_trace !== 'object') {
      return { valid: false, code: REJECTION_CODES.UNSUPPORTED_PREMISE, message: 'Proof trace object is missing' };
    }
    if (candidate.primary_operator && candidate.proof_trace.operator && candidate.primary_operator !== candidate.proof_trace.operator) {
      return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Candidate operator does not match proof trace operator' };
    }

    // 7. Premise resolution check
    const premises = Array.isArray(candidate.proof_trace.premises) ? candidate.proof_trace.premises : [];
    if (premises.length === 0) {
      return { valid: false, code: REJECTION_CODES.UNSUPPORTED_PREMISE, message: 'Proof trace premises are empty' };
    }
    for (const pid of premises) {
      const hasFact = context && Array.isArray(context.facts) && context.facts.some((f) => f.fact_id === pid);
      const hasProp = graph && typeof graph.getProposition === 'function' && Boolean(graph.getProposition(pid));
      if (!hasFact && !hasProp) {
        return { valid: false, code: REJECTION_CODES.UNSUPPORTED_PREMISE, message: `Premise ${pid} does not resolve to a verified fact or proposition` };
      }
    }

    // Phase 8 fix: evidence must be standalone and complete, and derived
    // concepts must not be fragments. A figure reference, a running book
    // title, or a dangling fragment in the excerpt, or a fragment cause /
    // effect in the derived proposition, rejects the candidate — the
    // bank must produce fewer questions rather than publish these.
    function isFragmentPhraseValidator(text) {
      const t = String(text || '').trim();
      if (!t || t.length < 2) return true;
      if (/^(it|they|this|that|these|those|us|you|he|she|we|them|him|her)$/i.test(t)) return true;
      if (/^(of|to|in|on|for|with|by|as|if|when|while|and|or|but|from|at|into)\b/i.test(t)) return true;
      if (/\b(which|that|who|whom|whose|and|or|but|of|to|in|on|for|with|by|as|the|a|an)\s*[.!?]?\s*$/.test(t)) return true;
      if (t.includes(';') || t.includes('|')) return true;
      if (/^[^A-Za-z0-9]+/.test(t)) return true;
      if (/\b(would|could|should|will|can|may|might)\s*[.!?]?\s*$/.test(t)) return true;
      return false;
    }
    if (candidate.supporting_excerpt) {
      if (/\(Fig\.|Fig\.\s*\d|Figure\s+\d/i.test(candidate.supporting_excerpt)) {
        return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Supporting excerpt depends on a figure reference' };
      }
      if (/\bexploring society\b/i.test(candidate.supporting_excerpt) && /\bgrade\b/i.test(candidate.supporting_excerpt)) {
        return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Supporting excerpt is a running book title' };
      }
    }
    for (const opt of candidate.options) {
      const influenceMatch = opt.text && opt.text.match(/without influencing\s+(.+)$/i);
      if (influenceMatch && isFragmentPhraseValidator(influenceMatch[1])) {
        return { valid: false, code: REJECTION_CODES.INSUFFICIENT_DISTRACTORS, message: 'Distractor concept is a fragment' };
      }
    }

    // 8. Derived proposition entailment check
    const derived = candidate.derived_proposition;
    if (derived) {
      if (isFragmentPhraseValidator(derived.subject) || isFragmentPhraseValidator(derived.object)) {
        return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived proposition subject or object is a fragment' };
      }
      // Phase 8 fix (second round, causal only): derived effect must be a
      // clean concept. Other operators may legitimately use lists, so
      // these gates apply only to causal_reasoning candidates.
      if (candidate.question_subtype === 'conditional_reasoning') {
        if (derived.subject.split(/\s+/).filter(Boolean).length > 12 || derived.object.split(/\s+/).filter(Boolean).length > 12) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Conditional argument is a sentence, not a concept' };
        }
        if (derived.subject.includes(',') || /^(it|they|you|he|she|we)\b/i.test(derived.subject)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Conditional outcome is a clause, not a concept' };
        }
      }
      if (candidate.question_subtype === 'causal_reasoning') {
        if (/^(involving|including|leading|resulting|causing|following|concerning)\b/i.test(derived.subject)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived effect starts with a participle, not a standalone concept' };
        }
        if (/\band\s+(integrates?|promotes?|includes?|involves?|leads?|causes?|provides?|creates?|makes?|allows?|enables?|supports?|encourages?|drives?|enhances?|reduces?|increases?|decreases?)\b/i.test(derived.subject)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived effect is a compound predicate, not a single concept' };
        }
        if (/^(it|they|you|he|she|we)\b/i.test(derived.subject)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived effect starts with a pronoun, not a standalone concept' };
        }
        if (derived.subject.split(/\s+/).filter(Boolean).length > 12 || derived.object.split(/\s+/).filter(Boolean).length > 12) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived causal argument is a sentence, not a concept' };
        }
        if (/[.?]\s+\S/.test(derived.subject) || /\s[ab]\)\s/.test(derived.subject)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived effect contains a second sentence or list marker' };
        }
        if (derived.subject.includes(',') || /\band\s+(is|are|was|were|has|have)\b/i.test(derived.subject)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived effect is a compound clause, not a single concept' };
        }
        if (derived.object.includes(':')) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Derived cause is a heading, not a concept' };
        }
        if (candidate.supporting_excerpt && /\bis called\b|\bknown as\b/i.test(candidate.supporting_excerpt) && /\bbecause\b/i.test(candidate.supporting_excerpt)) {
          return { valid: false, code: REJECTION_CODES.PRECONDITION_NOT_MET, message: 'Naming explanation is not a causal mechanism' };
        }
      }
      if (derived.modality === 'possibility') {
        return { valid: false, code: REJECTION_CODES.SPECULATIVE_MODALITY, message: 'Derived proposition is speculative' };
      }
      if (derived.polarity === 'negative' && candidate.question_subtype !== 'exception_reasoning') {
        return { valid: false, code: REJECTION_CODES.AMBIGUOUS_NEGATION, message: 'Negative premise cannot derive an affirmative assertion' };
      }
      // Answer must match derived object or subject
      const normExpected = normalize(candidate.expected_answer);
      const normObj = normalize(derived.object);
      const normSubj = normalize(derived.subject);
      const normCond = normalize(derived.condition || '');
      if (normExpected !== normObj && normExpected !== normSubj && normExpected !== normCond) {
        return { valid: false, code: REJECTION_CODES.AMBIGUOUS_ANSWER, message: 'Expected answer does not match proposition claim' };
      }
    }

    return { valid: true };
  }

  const Validator = {
    validateCandidate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Validator;
  global.ReasoningValidator = Validator;
})(typeof globalThis !== 'undefined' ? globalThis : this);
