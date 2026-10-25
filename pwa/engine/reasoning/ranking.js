/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * ranking.js — Multidimensional quality scoring, Bloom difficulty calibration,
 * and coverage-aware selection with deterministic tie-breaking.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const Linguistics = (typeof module !== 'undefined' && module.exports)
    ? require('./linguistics.js')
    : global.ReasoningLinguistics;

  const { DIFFICULTY_LEVELS } = Types;

  const DIFFICULTY_WEIGHTS = {
    [DIFFICULTY_LEVELS.RECALL]: 10,
    [DIFFICULTY_LEVELS.COMPREHENSION]: 25,
    [DIFFICULTY_LEVELS.APPLICATION]: 40,
    [DIFFICULTY_LEVELS.ANALYSIS]: 55,
    [DIFFICULTY_LEVELS.SYNTHESIS]: 70
  };

  class CoverageLedger {
    constructor() {
      this.conceptUsage = new Map();
      this.operatorUsage = new Map();
      this.subtypeUsage = new Map();
      this.difficultyUsage = new Map();
      this.usedStems = new Set();
      this.usedRelationKeys = new Set();
      this.selectedCount = 0;
    }

    recordSelection(candidate) {
      this.selectedCount++;
      const normStem = Linguistics.normalizeConcept(candidate.stem);
      this.usedStems.add(normStem);

      for (const key of candidate.relation_keys || []) {
        this.usedRelationKeys.add(key);
      }

      for (const concept of candidate.target_concepts || []) {
        const norm = Linguistics.normalizeConcept(concept);
        this.conceptUsage.set(norm, (this.conceptUsage.get(norm) || 0) + 1);
      }

      if (candidate.primary_operator) {
        this.operatorUsage.set(
          candidate.primary_operator,
          (this.operatorUsage.get(candidate.primary_operator) || 0) + 1
        );
      }

      if (candidate.question_subtype) {
        this.subtypeUsage.set(
          candidate.question_subtype,
          (this.subtypeUsage.get(candidate.question_subtype) || 0) + 1
        );
      }

      if (candidate.difficulty) {
        this.difficultyUsage.set(
          candidate.difficulty,
          (this.difficultyUsage.get(candidate.difficulty) || 0) + 1
        );
      }
    }

    computeDiversityBonus(candidate) {
      let bonus = 0;

      // Unused operator bonus
      const opUses = this.operatorUsage.get(candidate.primary_operator) || 0;
      if (opUses === 0) bonus += 25;
      else if (opUses === 1) bonus += 10;

      // Unused subtype bonus
      const subtypeUses = this.subtypeUsage.get(candidate.question_subtype) || 0;
      if (subtypeUses === 0) bonus += 15;

      // Uncovered concepts bonus
      for (const concept of candidate.target_concepts || []) {
        const norm = Linguistics.normalizeConcept(concept);
        const uses = this.conceptUsage.get(norm) || 0;
        if (uses === 0) bonus += 10;
        else if (uses >= 3) bonus -= 20; // Penalize over-testing same concept
      }

      return bonus;
    }
  }

  function scoreCandidate(candidate, ledger) {
    let score = 0;

    // 1. Difficulty / Depth Score (Bloom Taxonomy)
    const diffWeight = DIFFICULTY_WEIGHTS[candidate.difficulty] || 25;
    score += diffWeight;

    // 2. Evidence Completeness
    if (candidate.supporting_excerpt && candidate.supporting_excerpt.length > 20) {
      score += 15;
    }

    // 3. Multi-premise bonus (chains or synthesis)
    if (candidate.proof_trace && candidate.proof_trace.premises && candidate.proof_trace.premises.length > 1) {
      score += 20;
    }

    // 4. Coverage and Diversity Bonus from Ledger
    if (ledger) {
      score += ledger.computeDiversityBonus(candidate);
    }

    return score;
  }

  /**
   * Coverage-aware deterministic selection
   */
  function selectDiverseCandidates(validatedCandidates, targetCount) {
    const selected = [];
    const ledger = new CoverageLedger();
    const target = Math.max(1, targetCount || 15);

    const pool = [...validatedCandidates];

    while (selected.length < target && pool.length > 0) {
      // Filter out candidates with duplicate stems or exact duplicate relation keys
      const available = pool.filter((c) => {
        const normStem = Linguistics.normalizeConcept(c.stem);
        if (ledger.usedStems.has(normStem)) return false;
        if (c.relation_keys && c.relation_keys.some((k) => ledger.usedRelationKeys.has(k))) {
          // If we already tested this exact relation key, avoid repeating unless no other candidates
          const hasAlternate = pool.some((alt) => !alt.relation_keys.some((k) => ledger.usedRelationKeys.has(k)));
          if (hasAlternate) return false;
        }
        return true;
      });

      if (available.length === 0) {
        break; // No more eligible candidates
      }

      // Sort available candidates by score, then tie-break deterministically
      available.sort((a, b) => {
        const scoreA = scoreCandidate(a, ledger);
        const scoreB = scoreCandidate(b, ledger);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(a.id).localeCompare(String(b.id));
      });

      const chosen = available[0];
      selected.push(chosen);
      ledger.recordSelection(chosen);

      // Remove chosen from pool
      const indexInPool = pool.indexOf(chosen);
      if (indexInPool !== -1) {
        pool.splice(indexInPool, 1);
      }
    }

    return selected;
  }

  const Ranking = {
    CoverageLedger,
    scoreCandidate,
    selectDiverseCandidates
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Ranking;
  global.ReasoningRanking = Ranking;
})(typeof globalThis !== 'undefined' ? globalThis : this);
