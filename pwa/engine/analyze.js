/**
 * StudySynth Lite — Shared deterministic analysis pipeline.
 * Used by both the page and the background worker so the
 * orchestration around the engine never has to be duplicated.
 */

(function (global) {
  'use strict';

  function engine() {
    if (typeof module !== 'undefined' && module.exports) return require('./generator.js');
    return global.StudySynthEngine;
  }

  // The in-memory fact objects live on a non-enumerable array, so they are lost
  // the moment a module is structured-cloned or written to IndexedDB. Keep only
  // the fields the offline revision engine needs, attached to each inventory item
  // so they survive persistence.
  const REVISION_FACT_FIELDS = [
    'fact_id', 'fact_type', 'subject', 'relation', 'object', 'answer_kind',
    'supporting_excerpt', 'source_page', 'extraction_method', 'confidence_class',
    'conflict_status', 'temporal_scope', 'requested_label', 'relation_label',
    'relation_verb', 'causal_direction', 'attribute', 'precision', 'polarity',
    'numeric_kind', 'members', 'sequence_items', 'comparison'
  ];

  function pickRevisionFact(fact) {
    const picked = {};
    REVISION_FACT_FIELDS.forEach((field) => {
      const value = fact[field];
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        picked[field] = value.map((entry) => (entry && typeof entry === 'object' ? Object.assign({}, entry) : entry));
        return;
      }
      if (typeof value === 'object') {
        picked[field] = Object.assign({}, value);
        return;
      }
      picked[field] = value;
    });
    return picked;
  }

  function attachRevisionFacts(inventory, facts) {
    if (!Array.isArray(inventory)) return inventory;
    const byId = Object.create(null);
    (Array.isArray(facts) ? facts : []).forEach((fact) => {
      if (fact && fact.fact_id) byId[fact.fact_id] = fact;
    });
    inventory.forEach((unit) => {
      if (!unit || typeof unit !== 'object') return;
      const ids = Array.isArray(unit.fact_ids) ? unit.fact_ids : [];
      unit.revision_facts = ids
        .map((id) => byId[id])
        .filter(Boolean)
        .map(pickRevisionFact);
    });
    return inventory;
  }

  function analyzeSource(rawText, title, sourceMeta, targetCount, hooks) {
    const E = engine();
    const onStage = hooks && typeof hooks.onStage === 'function' ? hooks.onStage : function () {};

    onStage('preparing', { message: 'Preparing document content' });
    const sections = E.parseRawDocument(rawText, title);

    onStage('inventory', { sections: sections.length, message: 'Finding important facts' });
    const extracted = E.extractSourceFacts(sections, { sourceMeta: sourceMeta });
    const conflictResult = E.detectFactConflicts(extracted);
    const inventory = E.buildKnowledgeInventory(sections, {
      facts: conflictResult.facts,
      conflicts: conflictResult.conflicts,
      sourceMeta: sourceMeta
    });

    // Keep a serializable copy of each unit's typed facts with the inventory so
    // revision cards survive saving, structured cloning, and reloads.
    attachRevisionFacts(inventory, conflictResult.facts);

    const context = {
      sections: sections,
      facts: conflictResult.facts,
      conflicts: conflictResult.conflicts
    };

    onStage('generating', {
      sections: sections.length,
      facts: conflictResult.facts.length,
      message: 'Creating practice questions'
    });
    let questions = [];
    let generationError = null;
    try {
      questions = E.generateQuestionBank(inventory, Object.assign({
        targetCount: targetCount || 15,
        sourceMeta: sourceMeta
      }, context));
    } catch (err) {
      generationError = err;
      questions = [];
    }
    const generation = questions.generation || (generationError && generationError.metrics) || null;

    onStage('validating', {
      questions: questions.length,
      message: 'Checking questions and answers'
    });
    const validation = E.validateQuestionBank(questions, Object.assign({
      candidateCount: generation ? generation.totalCandidates : 0,
      rejectionCounts: generation ? generation.rejectionCounts : {}
    }, context));

    return {
      sections: sections,
      facts: conflictResult.facts,
      conflicts: conflictResult.conflicts,
      inventory: inventory,
      questions: questions,
      generation: generation,
      generationError: generationError,
      validation: validation
    };
  }

  const StudySynthAnalysis = {
    analyzeSource: analyzeSource,
    attachRevisionFacts: attachRevisionFacts
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = StudySynthAnalysis;
  if (typeof window !== 'undefined') window.StudySynthAnalysis = StudySynthAnalysis;
  if (typeof self !== 'undefined' && typeof window === 'undefined') self.StudySynthAnalysis = StudySynthAnalysis;
})(typeof globalThis !== 'undefined' ? globalThis : this);
