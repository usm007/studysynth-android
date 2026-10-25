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
      subject: fields.subject || '',
      subject_normalized: Linguistics.normalizeConcept(fields.subject),
      predicate: fields.predicate || '',
      relation_type: relType,
      relation: fields.predicate || 'relation',
      normalized_relation: fields.normalized_relation || fields.predicate || 'relation',
      object: fields.object || '',
      object_normalized: Linguistics.normalizeConcept(fields.object),
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

    // Only strong, explicit causal verbs. Weak or associative wording
    // ("induces", bare "because" clauses) is deliberately not treated as
    // causation, and "enables" stays a separate ENABLES relation rather than
    // being collapsed into CAUSES.
    // Pattern 1: X causes / leads to / results in / produces / triggers Y
    // Example: "Increased carbon dioxide leads to ocean acidification."
    const causalVerbRegex = /([^,.;]+?)\s+(?:causes|leads to|results in|produces|triggers)\s+([^,.;]+)/gi;
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

    // Pattern 2: Y is caused by / produced by X (effect first, cause second)
    // Example: "Ocean acidification is caused by increased carbon dioxide."
    const passiveCausalRegex = /([^,.;]+?)\s+(?:is caused by|is produced by|is triggered by|results from)\s+([^,.;]+)/gi;
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

    // Pattern 3: X increases / decreases Y
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

  // A proposition may only reach the operators when both of its spans can be
  // shown verbatim as a concise option.
  function isSafeProposition(prop) {
    if (!prop) return false;
    if (!Linguistics.isSafeSpan(prop.subject, 90)) return false;
    if (!Linguistics.isSafeSpan(prop.object, 150)) return false;
    // Every subject must be a noun phrase: a whole clause cannot label a
    // question ("PIL filed under ... is an innovation" is not an entity).
    if (!Linguistics.isNounPhraseSpan(prop.subject, 90)) return false;
    if (prop.relation_type === RELATION_TYPES.COMPARED_WITH ||
        prop.relation_type === RELATION_TYPES.GREATER_THAN ||
        prop.relation_type === RELATION_TYPES.LESS_THAN) {
      if (!Linguistics.isNounPhraseSpan(prop.object, 120)) return false;
    }
    if (prop.relation_type === RELATION_TYPES.DEFINITION_OF) {
      if (prop.subject.split(/\s+/).length > 8) return false;
      if (prop.object.split(/\s+/).length < 2) return false;
      // The definition must be a phrase, not a clause with its own subject
      // and finite verb ("The Banarasi saris have a Geographical Indication").
      const head = prop.object.split(/\s+/).slice(0, 6).join(' ');
      if (/\b(?:have|has|had|is|are|was|were|reorganised|reorganized|contains?|includes?)\b/i.test(head)) return false;
    }
    if (prop.relation_type === RELATION_TYPES.CAUSES ||
        prop.relation_type === RELATION_TYPES.LEADS_TO ||
        prop.relation_type === RELATION_TYPES.PRODUCES) {
      if (!Linguistics.isNounPhraseSpan(prop.subject, 90)) return false;
      if (!Linguistics.isNounPhraseSpan(prop.object, 120)) return false;
      if (prop.object.split(/\s+/).length < 2) return false;
    }
    return true;
  }

  // Map legacy fact to a rich typed Proposition (bridge contract)
  function mapFactToProposition(fact) {
    if (!fact) return null;

    // The bridge only accepts complete, declarative assertions. Fallback
    // records, empty subjects/objects, questions and prompts are structural
    // text and must never become reasoning premises.
    if (fact.fact_type === 'fallback' || fact.extraction_method === 'fallback') return null;
    const subject = String(fact.subject || '').trim();
    const object = String(fact.object == null ? '' : fact.object).trim();
    if (subject.length < 2 || object.length < 2) return null;
    const excerpt = String(fact.supporting_excerpt || fact.source_text || '').trim();
    if (excerpt && Linguistics.classifySentenceRole(excerpt) !== 'assertion') return null;
    if (/\?["'”’)\]]*$/.test(subject)) return null;
    if (/^(?:what|which|who|whom|whose|where|when|why|how)\b/i.test(subject)) return null;

    let relationType = RELATION_TYPES.HAS_PROPERTY;
    if (fact.fact_type === 'causal' || fact.causal_direction) {
      // Only production-grade causal wording may become a CAUSES premise.
      // Weak/associative verbs ("helps", "makes", "due to", "because") are
      // not direct mechanisms and must not reach the causal operators.
      const verb = String(fact.relation_verb || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const strongCausal = /^(?:causes?|leads?\s+to|results?\s+in|produces?|triggers?|is\s+caused\s+by|are\s+caused\s+by|is\s+produced\s+by|are\s+produced\s+by|is\s+triggered\s+by|are\s+triggered\s+by|results?\s+from)$/.test(verb);
      if (!strongCausal) return null;
      relationType = RELATION_TYPES.CAUSES;
    } else if (fact.fact_type === 'definition') {
      relationType = RELATION_TYPES.DEFINITION_OF;
    } else if (fact.fact_type === 'comparison' || fact.comparison) {
      relationType = RELATION_TYPES.COMPARED_WITH;
    } else if (fact.fact_type === 'numeric_statistic' || fact.numeric_kind) {
      relationType = RELATION_TYPES.HAS_PROPERTY;
    }

    const prop = createProposition({
      id: fact.fact_id,
      subject: fact.subject || '',
      predicate: fact.relation_verb || fact.relation || 'has property',
      relation_type: relationType,
      object: fact.object || '',
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
    return isSafeProposition(prop) ? prop : null;
  }

  // Main compilation function: takes parsed document sections and optional legacy facts
  function compileSemanticRepresentation(sections, existingFacts) {
    resetPropositionCounter();
    const propositions = [];
    const propositionMap = new Map();

    // 1. First, incorporate existing facts (ensures full baseline compatibility)
    if (Array.isArray(existingFacts)) {
      for (const fact of existingFacts) {
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
          // Assertion filtering: prompts, captions, headings, labels and
          // questions are never compiled into reasoning premises.
          if (Linguistics.classifySentenceRole(s.text) !== 'assertion') continue;
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
            if (!isSafeProposition(prop)) continue;
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
      count: propositions.length
    };
  }

  const Representation = {
    createProposition,
    compileSemanticRepresentation,
    mapFactToProposition,
    resetPropositionCounter
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Representation;
  global.ReasoningRepresentation = Representation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
