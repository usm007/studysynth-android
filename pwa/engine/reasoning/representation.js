/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * representation.js — Semantic Intermediate Representation (SIR).
 * Compiles source text into typed propositions with exact provenance,
 * offsets, qualifiers, modality, polarity, and evidence spans.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const Linguistics = (typeof module !== 'undefined' && module.exports)
    ? require('./linguistics.js')
    : global.ReasoningLinguistics;

  const { RELATION_TYPES, POLARITY, MODALITY, QUANTIFICATION } = Types;

  let propositionCounter = 0;

  function resetPropositionCounter() {
    propositionCounter = 0;
  }

  function generatePropositionId(prefix) {
    propositionCounter++;
    return `PROP-${prefix || 'V2'}-${String(propositionCounter).padStart(4, '0')}`;
  }

  /**
   * Typed Proposition Schema
   */
  function collapseRepeatedPhrase(raw) {
    let words = String(raw || '').split(/\s+/).filter(Boolean);
    for (let round = 0; round < 3; round++) {
      let changed = false;
      const lower = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
      outer: for (let len = 6; len >= 3; len--) {
        for (let i = 0; i + len <= words.length; i++) {
          for (const gap of [0, 1]) {
            const j = i + len + gap;
            if (j + len > words.length) continue;
            let match = true;
            for (let k = 0; k < len; k++) {
              if (lower[i + k] !== lower[j + k]) { match = false; break; }
            }
            if (!match) continue;
            const removeFrom = (gap === 1 && /^(the|a|an)$/i.test(words[j - 1])) ? j - 1 : j;
            words = words.slice(0, removeFrom).concat(words.slice(j + len));
            changed = true;
            break outer;
          }
        }
      }
      if (!changed) break;
    }
    return words.join(' ');
  }

  function createProposition(fields) {
    const relType = fields.relation_type || RELATION_TYPES.HAS_PROPERTY;
    let defaultFactType = 'entity_attribute';
    if (relType === RELATION_TYPES.CAUSES || relType === RELATION_TYPES.LEADS_TO) {
      defaultFactType = 'causal';
    } else if (relType === RELATION_TYPES.GREATER_THAN || relType === RELATION_TYPES.LESS_THAN || relType === RELATION_TYPES.COMPARED_WITH) {
      defaultFactType = 'comparison';
    } else if (relType === RELATION_TYPES.DEFINITION_OF) {
      defaultFactType = 'definition';
    } else if (relType === RELATION_TYPES.INSTANCE_OF) {
      defaultFactType = 'membership';
    } else if (relType === RELATION_TYPES.PRECEDES || relType === RELATION_TYPES.FOLLOWS) {
      defaultFactType = 'sequence';
    }

    const propId = fields.id || fields.fact_id || generatePropositionId(fields.rule_id || 'EXT');
    const sourceStart = fields.source_start != null ? fields.source_start : (fields.char_start != null ? fields.char_start : 0);
    const sourceEnd = fields.source_end != null ? fields.source_end : (fields.char_end != null ? fields.char_end : 0);
    const sourceSentence = fields.source_sentence || fields.source_text || fields.supporting_excerpt || '';

    return {
      id: propId,
      fact_id: propId,
      subject: collapseRepeatedPhrase(fields.subject || ''),
      subject_normalized: Linguistics.normalizeConcept(collapseRepeatedPhrase(fields.subject || '')),
      predicate: fields.predicate || '',
      relation_type: relType,
      relation: fields.predicate || 'relation',
      normalized_relation: fields.normalized_relation || fields.predicate || 'relation',
      object: collapseRepeatedPhrase(fields.object || ''),
      object_normalized: Linguistics.normalizeConcept(collapseRepeatedPhrase(fields.object || '')),
      polarity: fields.polarity || POLARITY.POSITIVE,
      modality: fields.modality || MODALITY.FACT,
      quantification: fields.quantification || QUANTIFICATION.UNSPECIFIED,
      fact_type: fields.fact_type || defaultFactType,
      conflict_status: fields.conflict_status || 'supported',
      confidence_class: fields.confidence_class || 'verified',

      // Qualifiers & Scoping
      condition: fields.condition || null,
      exception: fields.exception || null,
      comparator: fields.comparator || null,
      comparison_direction: fields.comparison_direction || null,
      temporal_order: fields.temporal_order || null,
      numeric_value: fields.numeric_value != null ? fields.numeric_value : null,
      unit: fields.unit || null,

      // Evidence & Provenance
      source_page: fields.source_page != null ? fields.source_page : 1,
      source_section: fields.source_section || '',
      section_id: fields.section_id || 'SEC-001',
      source_sentence: sourceSentence,
      source_text: sourceSentence,
      source_clause: fields.source_clause || '',
      supporting_excerpt: fields.supporting_excerpt || sourceSentence,
      char_start: sourceStart,
      char_end: sourceEnd,
      source_start: sourceStart,
      source_end: sourceEnd,

      // Metadata
      rule_id: fields.rule_id || 'RULE_DEFAULT',
      is_derived: Boolean(fields.is_derived),
      proof_trace: fields.proof_trace || null,
      ambiguity_indicators: fields.ambiguity_indicators || [],
      parse_status: fields.parse_status || 'VERIFIED'
    };
  }

  // Extract Causal Propositions
  function extractCausalPropositions(sentenceAnalysis, sectionMeta) {
    const props = [];
    const raw = sentenceAnalysis.text;

    // Pattern 1: X causes / leads to / results in Y
    // Example: "Increased carbon dioxide leads to ocean acidification."
    const causalVerbRegex = /([^,.;]+?)\s+(?:causes|leads to|results in|produces|triggers|induces)\s+([^,.;]+)/gi;
    let match;
    while ((match = causalVerbRegex.exec(raw)) !== null) {
      const subject = match[1].trim();
      const object = match[2].trim();
      if (subject.length > 2 && object.length > 2) {
        props.push(createProposition({
          subject,
          predicate: 'causes',
          relation_type: RELATION_TYPES.CAUSES,
          object,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          quantification: sentenceAnalysis.quantification,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_CAUSAL_VERB'
        }));
      }
    }

    // Pattern 2: Y is caused by / produced by X
    // Example: "Ocean acidification is caused by increased carbon dioxide."
    const passiveCausalRegex = /([^,.;]+?)\s+(?:is caused by|is produced by|results from)\s+([^,.;]+)/gi;
    while ((match = passiveCausalRegex.exec(raw)) !== null) {
      const effect = match[1].trim();
      const cause = match[2].trim();
      if (cause.length > 2 && effect.length > 2) {
        props.push(createProposition({
          subject: cause,
          predicate: 'causes',
          relation_type: RELATION_TYPES.CAUSES,
          object: effect,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          quantification: sentenceAnalysis.quantification,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_CAUSAL_PASSIVE'
        }));
      }
    }

    // Pattern 3: Y occurs because X / Y because X
    const becauseRegex = /([^,.;]+?)\s+because\s+([^,.;]+)/gi;
    while ((match = becauseRegex.exec(raw)) !== null) {
      const effect = match[1].trim();
      const cause = match[2].trim();
      if (cause.length > 2 && effect.length > 2) {
        props.push(createProposition({
          subject: cause,
          predicate: 'causes',
          relation_type: RELATION_TYPES.CAUSES,
          object: effect,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          quantification: sentenceAnalysis.quantification,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_CAUSAL_BECAUSE'
        }));
      }
    }

    // Pattern 4: X increases / decreases Y
    const changeRegex = /([^,.;]+?)\s+(increases|decreases|raises|lowers|reduces|enhances)\s+([^,.;]+)/gi;
    while ((match = changeRegex.exec(raw)) !== null) {
      const subject = match[1].trim();
      const verb = match[2].toLowerCase();
      const object = match[3].trim();
      const isIncrease = ['increases', 'raises', 'enhances'].includes(verb);
      if (subject.length > 2 && object.length > 2) {
        props.push(createProposition({
          subject,
          predicate: isIncrease ? 'increases' : 'decreases',
          relation_type: isIncrease ? RELATION_TYPES.INCREASES : RELATION_TYPES.DECREASES,
          object,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_VARIABLE_CHANGE'
        }));
      }
    }

    return props;
  }

  // Extract Conditional Propositions
  function extractConditionalPropositions(sentenceAnalysis, sectionMeta) {
    const props = [];
    const raw = sentenceAnalysis.text;

    // Pattern 1: If condition, then outcome OR Outcome if condition
    const ifThenRegex = /(?:if|when|provided that)\s+([^,;]+),\s*(?:then\s+)?([^.;]+)/gi;
    let match;
    while ((match = ifThenRegex.exec(raw)) !== null) {
      const condition = match[1].trim();
      const outcome = match[2].trim();
      if (condition.length > 3 && outcome.length > 3) {
        props.push(createProposition({
          subject: outcome,
          predicate: 'conditional on',
          relation_type: RELATION_TYPES.CONDITIONAL_ON,
          object: condition,
          condition: condition,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_CONDITIONAL_IF_THEN'
        }));
      }
    }

    // Pattern 2: Outcome requires / depends on X
    const reqRegex = /([^,.;]+?)\s+(?:requires|depends on|is contingent upon)\s+([^,.;]+)/gi;
    while ((match = reqRegex.exec(raw)) !== null) {
      const subject = match[1].trim();
      const requirement = match[2].trim();
      if (subject.length > 2 && requirement.length > 2) {
        props.push(createProposition({
          subject,
          predicate: 'requires',
          relation_type: RELATION_TYPES.REQUIRES,
          object: requirement,
          condition: requirement,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_REQUIRES'
        }));
      }
    }

    return props;
  }

  // Extract Comparative Propositions
  function extractComparativePropositions(sentenceAnalysis, sectionMeta) {
    const props = [];
    const raw = sentenceAnalysis.text;

    // Pattern: A is [greater/less/higher/lower/faster/slower] than B
    const compRegex = /([^,.;]+?)\s+is\s+(greater|less|higher|lower|faster|slower|larger|smaller|more|fewer)\s+than\s+([^,.;]+)/gi;
    let match;
    while ((match = compRegex.exec(raw)) !== null) {
      const entityA = match[1].trim();
      const compWord = match[2].toLowerCase();
      const entityB = match[3].trim();
      const isGreater = ['greater', 'higher', 'faster', 'larger', 'more'].includes(compWord);

      if (entityA.length > 2 && entityB.length > 2) {
        props.push(createProposition({
          subject: entityA,
          predicate: compWord + ' than',
          relation_type: isGreater ? RELATION_TYPES.GREATER_THAN : RELATION_TYPES.LESS_THAN,
          object: entityB,
          comparator: compWord,
          comparison_direction: isGreater ? 'A > B' : 'A < B',
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_COMPARATIVE'
        }));
      }
    }

    return props;
  }

  // Extract Exception & Boundary Propositions
  function extractExceptionPropositions(sentenceAnalysis, sectionMeta) {
    const props = [];
    const raw = sentenceAnalysis.text;

    // Pattern: Rule/Scope, except / with the exception of / excluding X
    const exceptRegex = /([^,.;]+?),\s*(?:except for|except|with the exception of|excluding)\s+([^.;]+)/gi;
    let match;
    while ((match = exceptRegex.exec(raw)) !== null) {
      const generalRule = match[1].trim();
      const exception = match[2].trim();
      if (generalRule.length > 3 && exception.length > 2) {
        props.push(createProposition({
          subject: generalRule,
          predicate: 'exception to',
          relation_type: RELATION_TYPES.EXCEPTION_TO,
          object: exception,
          exception: exception,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_EXCEPTION'
        }));
      }
    }

    return props;
  }

  // Extract Process / Sequence Propositions
  function extractSequencePropositions(sentenceAnalysis, sectionMeta) {
    const props = [];
    const raw = sentenceAnalysis.text;

    // Pattern 1: X is followed by Y / Prior to Y, X occurs
    const followedByRegex = /([^,.;]+?)\s+is followed by\s+([^,.;]+)/gi;
    let match;
    while ((match = followedByRegex.exec(raw)) !== null) {
      const step1 = match[1].trim();
      const step2 = match[2].trim();
      if (step1.length > 2 && step2.length > 2) {
        props.push(createProposition({
          subject: step1,
          predicate: 'precedes',
          relation_type: RELATION_TYPES.PRECEDES,
          object: step2,
          temporal_order: 1,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_SEQUENCE_PRECEDES'
        }));
      }
    }

    const beforeRegex = /([^,.;]+?)\s+occurs before\s+([^,.;]+)/gi;
    while ((match = beforeRegex.exec(raw)) !== null) {
      const step1 = match[1].trim();
      const step2 = match[2].trim();
      if (step1.length > 2 && step2.length > 2) {
        props.push(createProposition({
          subject: step1,
          predicate: 'precedes',
          relation_type: RELATION_TYPES.PRECEDES,
          object: step2,
          temporal_order: 1,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_SEQUENCE_BEFORE'
        }));
      }
    }

    return props;
  }

  // Extract Definitional and Classification Propositions
  function extractDefinitionalPropositions(sentenceAnalysis, sectionMeta) {
    const props = [];
    const raw = sentenceAnalysis.text;

    // Pattern 1: X is defined as Y / X refers to Y
    const defRegex = /([^,.;]+?)\s+(?:is defined as|refers to)\s+([^.;]+)/gi;
    let match;
    while ((match = defRegex.exec(raw)) !== null) {
      const term = match[1].trim();
      const definition = match[2].trim();
      if (term.length > 2 && definition.length > 3) {
        props.push(createProposition({
          subject: term,
          predicate: 'is defined as',
          relation_type: RELATION_TYPES.DEFINITION_OF,
          object: definition,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_DEFINITION'
        }));
      }
    }

    // Pattern 2: X is a type of / form of / category of Y
    const classRegex = /([^,.;]+?)\s+is a\s+(?:type|form|kind|class|category|branch)\s+of\s+([^,.;]+)/gi;
    while ((match = classRegex.exec(raw)) !== null) {
      const sub = match[1].trim();
      const superCat = match[2].trim();
      if (sub.length > 2 && superCat.length > 2) {
        props.push(createProposition({
          subject: sub,
          predicate: 'is an instance of',
          relation_type: RELATION_TYPES.INSTANCE_OF,
          object: superCat,
          polarity: sentenceAnalysis.polarity,
          modality: sentenceAnalysis.modality,
          source_page: sectionMeta.page,
          source_section: sectionMeta.title,
          source_sentence: raw,
          supporting_excerpt: raw,
          char_start: sentenceAnalysis.start,
          char_end: sentenceAnalysis.end,
          rule_id: 'EXT_CLASSIFICATION'
        }));
      }
    }

    return props;
  }

  // Map legacy fact to a rich typed Proposition (bridge contract)
  // A proposition subject or object that is only a pronoun names nothing
  // a learner could look up. Such values are fragments, not entities.
  function isBarePronoun(value) {
    const text = String(value == null ? '' : value).trim();
    return /^(it|they|this|that|these|those|us|you|he|she|we|them|him|her)$/i.test(text);
  }

  // Preposition/conjunction starts are clause leftovers, not entities.
  const FRAGMENT_START = /^(of|to|in|on|for|with|by|as|if|when|while|and|or|but|from|at|into|over|under|about|through|against|between|among|behind|below|above|near|off|out|up|down|like)\b/i;

  /**
   * Phase 2A V2 graph boundary: only eligible, validated typed facts
   * may become propositions. A fact is INELIGIBLE when it is a fallback
   * (unclassified, empty subject/object), has an empty or fragment
   * subject/object, carries conflicting values, or is OCR-unverified.
   * Polarity and precision do NOT block eligibility: a negative or
   * approximate proposition is meaningful and its qualifiers are
   * preserved on the proposition. Every rejection carries a specific
   * reason, recorded by compileSemanticRepresentation in
   * graphRejections — never silently dropped.
   *
   * This is an intentional behaviour change for future V2 regeneration:
   * chapters that currently ship V2 items built partly from
   * fallback-derived propositions will regenerate fewer V2 candidates.
   * The Phase 2A diagnostic quantifies the change for Chapter 3; bank
   * files are never rewritten by this gate.
   */
  function classifyPropositionEligibility(fact) {
    if (!fact || typeof fact !== 'object') return { eligible: false, reason: 'missing_fact' };
    if (fact.fact_type === 'fallback' || fact.extraction_method === 'fallback') {
      return { eligible: false, reason: 'fallback_unclassified' };
    }
    const subject = String(fact.subject == null ? '' : fact.subject).trim();
    const object = fact.object == null ? '' : String(fact.object).trim();
    if (!subject) return { eligible: false, reason: 'missing_subject' };
    if (!object) return { eligible: false, reason: 'missing_object' };
    if (isBarePronoun(subject) || FRAGMENT_START.test(subject)) {
      return { eligible: false, reason: 'fragment_subject' };
    }
    if (isBarePronoun(object) || FRAGMENT_START.test(object)) {
      return { eligible: false, reason: 'fragment_object' };
    }
    if (fact.conflict_status === 'conflicting') {
      return { eligible: false, reason: 'conflicting_values' };
    }
    if (fact.confidence_class === 'ocr-unverified') {
      return { eligible: false, reason: 'ocr_unverified' };
    }
    return { eligible: true, reason: null };
  }

  function mapFactToProposition(fact) {
    if (!fact) return null;
    // Phase 2A boundary: an ineligible fact never becomes a proposition,
    // not even through the direct bridge. Callers already null-check.
    if (!classifyPropositionEligibility(fact).eligible) return null;
    let relationType = RELATION_TYPES.HAS_PROPERTY;
    // Phase 8 fix (third round): a temporal conditional ("When X, Y")
    // is not a causal mechanism. Mapping it to CAUSES let Operator B
    // turn "When the work was nearly done, a reporter asked ..." into
    // "the work causes a reporter ...". Conditionals map to
    // CONDITIONAL_ON, which Operator D (conditional reasoning) can use,
    // but Operator B (causal explanation) cannot.
    if (fact.extraction_method === 'causal_conditional' || /^(if|when|unless)$/i.test(fact.relation_verb || '')) {
      relationType = RELATION_TYPES.CONDITIONAL_ON;
    } else if (fact.fact_type === 'causal' || fact.causal_direction) {
      relationType = RELATION_TYPES.CAUSES;
    } else if (fact.fact_type === 'definition') {
      relationType = RELATION_TYPES.DEFINITION_OF;
    } else if (fact.fact_type === 'comparison' || fact.comparison) {
      relationType = RELATION_TYPES.COMPARED_WITH;
    } else if (fact.fact_type === 'numeric_statistic' || fact.numeric_kind) {
      relationType = RELATION_TYPES.HAS_PROPERTY;
    }

    // Phase 8 fix (fourth round): production conditional facts store the
    // condition as subject and the consequence as object (condition ->
    // outcome), but the representation convention for CONDITIONAL_ON is
    // outcome as subject and condition as object (outcome conditional on
    // condition). Without this swap, Operator D asked "under what
    // condition does [condition] occur?" with the consequence as the
    // answer — the converse of the source conditional.
    // Quality fix: production "because" facts store effect as subject and
    // cause as object (causal_direction 'effect_because_cause'), but the
    // CAUSES convention is cause -> effect. Without this swap, Operator B
    // inverts an already-inverted fact and asks what produces the cause
    // itself — e.g. "what produces families had many children?" answered
    // by "The birth rate", when the excerpt says the birth rate was high
    // BECAUSE families had many children. Swap exactly as for conditionals.
    const swapBridged = (relationType === RELATION_TYPES.CONDITIONAL_ON && fact.extraction_method === 'causal_conditional')
      || (relationType === RELATION_TYPES.CAUSES && fact.causal_direction === 'effect_because_cause');
    const bridgedSubject = swapBridged
      ? (fact.object || '')
      : (fact.subject || '');
    const bridgedObject = swapBridged
      ? (fact.subject || '')
      : (fact.object || '');
    return createProposition({
      id: fact.fact_id,
      subject: bridgedSubject,
      predicate: fact.relation_verb || fact.relation || 'has property',
      relation_type: relationType,
      object: bridgedObject,
      polarity: fact.polarity === 'negative' ? POLARITY.NEGATIVE : POLARITY.POSITIVE,
      modality: MODALITY.FACT,
      quantification: QUANTIFICATION.UNSPECIFIED,
      source_page: fact.source_page != null ? fact.source_page : 1,
      source_section: fact.source_title || '',
      source_sentence: fact.supporting_excerpt || '',
      supporting_excerpt: fact.supporting_excerpt || '',
      rule_id: 'EXT_LEGACY_FACT_BRIDGE',
      is_derived: false
    });
  }

  // Main compilation function: takes parsed document sections and optional legacy facts
  function compileSemanticRepresentation(sections, existingFacts) {
    resetPropositionCounter();
    const propositions = [];
    const propositionMap = new Map();
    // Phase 2A: every fact or direct extraction rejected from graph
    // construction is recorded here with a specific reason. This field
    // is additive: existing callers read .propositions and .count.
    const graphRejections = [];

    // 1. First, incorporate existing facts (gated, Phase 2A: only
    //    eligible, validated typed facts — see classifyPropositionEligibility).
    //    A fact explicitly tagged with a non-assertion sentence role is
    //    never bridged into a proposition; facts without a role tag keep
    //    their legacy behaviour (they were already production-validated).
    if (Array.isArray(existingFacts)) {
      for (const fact of existingFacts) {
        if (fact && fact.sentence_role && fact.sentence_role !== 'assertion') {
          graphRejections.push({
            source: 'fact_bridge', fact_id: fact.fact_id || null,
            reason: 'non_assertion_role', subject: fact.subject || null,
            source_page: fact.source_page || null,
            section_id: fact.section_id || fact.source_section || null
          });
          continue;
        }
        const eligibility = classifyPropositionEligibility(fact);
        if (!eligibility.eligible) {
          graphRejections.push({
            source: 'fact_bridge', fact_id: fact.fact_id || null,
            reason: eligibility.reason, subject: fact.subject || null,
            source_page: fact.source_page || null,
            section_id: fact.section_id || fact.source_section || null
          });
          continue;
        }
        // Phase 8 fix: a bridged causal fact with a fragment subject or
        // object must not enter the graph, even if production validation
        // let it through elsewhere.
        if (fact && fact.fact_type === 'causal') {
          const frag = (s) => {
            const t = String(s || '').trim();
            return !t || /^(it|they|this|that|these|those|us|you|he|she|we|them|him|her)$/i.test(t)
              || /^(of|to|in|on|for|with|by|as|if|when|while|and|or|but|from|at|into)\b/i.test(t)
              || /\b(which|that|who|whom|whose|and|or|but|of|to|in|on|for|with|by|as|the|a|an)\s*[.!?]?\s*$/.test(t);
          };
          if (frag(fact.subject) || frag(fact.object)) {
            graphRejections.push({
              source: 'fact_bridge', fact_id: fact.fact_id || null,
              reason: 'fragment_causal', subject: fact.subject || null,
              source_page: fact.source_page || null,
              section_id: fact.section_id || fact.source_section || null
            });
            continue;
          }
        }
        const prop = mapFactToProposition(fact);
        if (prop) {
          propositions.push(prop);
          propositionMap.set(prop.id, prop);
        }
      }
    }

    // 2. Extract semantic propositions from each section's text
    if (Array.isArray(sections)) {
      for (const sec of sections) {
        const text = sec.content || sec.text || '';
        const sectionMeta = {
          title: sec.title || 'Source',
          page: sec.page != null ? sec.page : 1
        };

        const sentences = Linguistics.splitSentencesWithOffsets(text);
        for (const s of sentences) {
          // Sentence-role gate (Repair 002, Phase 4): only assertions may
          // generate factual propositions. Interrogatives, instructions
          // and ambiguous fragments are skipped before any relation
          // extraction, including causal, conditional and definition.
          const sentenceRole = Linguistics.classifySentenceRole(s.text);
          if (sentenceRole !== 'assertion') continue;
          const analysis = Linguistics.analyzeSentenceLinguistics(s, text);

          // Extract all relation types
          const causals = extractCausalPropositions(analysis, sectionMeta);
          const conditionals = extractConditionalPropositions(analysis, sectionMeta);
          const comparatives = extractComparativePropositions(analysis, sectionMeta);
          const exceptions = extractExceptionPropositions(analysis, sectionMeta);
          const sequences = extractSequencePropositions(analysis, sectionMeta);
          const definitions = extractDefinitionalPropositions(analysis, sectionMeta);

          const allExtracted = [
            ...causals,
            ...conditionals,
            ...comparatives,
            ...exceptions,
            ...sequences,
            ...definitions
          ];

          for (const prop of allExtracted) {
            prop.sentence_role = sentenceRole;
            // Phase 2A narrow guard for direct extraction: no empty or
            // bare-pronoun subject/object may enter the graph, even
            // when an extractor's length guard let it through (e.g. a
            // comparative with a pronoun subject). Rejected direct
            // extractions are recorded, not silently dropped.
            const propSubject = String(prop.subject == null ? '' : prop.subject).trim();
            const propObject = prop.object == null ? '' : String(prop.object).trim();
            if (!propSubject || !propObject || isBarePronoun(propSubject) || isBarePronoun(propObject)) {
              graphRejections.push({
                source: 'direct_extraction', fact_id: null,
                reason: !propSubject ? 'missing_subject'
                  : (!propObject ? 'missing_object'
                    : (isBarePronoun(propSubject) ? 'fragment_subject' : 'fragment_object')),
                subject: propSubject || null,
                source_sentence: prop.source_sentence || s.text || null,
                rule_id: prop.rule_id || null
              });
              continue;
            }
            // Deduplicate against existing by subject+relation+object
            const key = `${prop.subject_normalized}|${prop.relation_type}|${prop.object_normalized}`;
            if (!propositionMap.has(key)) {
              propositionMap.set(key, prop);
              propositions.push(prop);
            }
          }
        }
      }
    }

    return {
      propositions,
      count: propositions.length,
      graphRejections
    };
  }

  const Representation = {
    createProposition,
    compileSemanticRepresentation,
    mapFactToProposition,
    classifyPropositionEligibility,
    resetPropositionCounter,
    classifySentenceRole: Linguistics.classifySentenceRole
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Representation;
  global.ReasoningRepresentation = Representation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
