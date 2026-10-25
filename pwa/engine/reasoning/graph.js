/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * graph.js — Directed Semantic Knowledge and Evidence Graph.
 * Supports multi-relation indexing, cycle-safe path traversal,
 * bounded inference depth, and closed-context contradiction checks.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const Linguistics = (typeof module !== 'undefined' && module.exports)
    ? require('./linguistics.js')
    : global.ReasoningLinguistics;

  const { RELATION_TYPES, POLARITY } = Types;

  class KnowledgeGraph {
    constructor() {
      this.nodes = new Map(); // normalized concept -> node object
      this.propositionsById = new Map();
      this.propositionsByRelation = new Map();
      this.edges = [];
    }

    _getOrCreateNode(conceptSurface) {
      const norm = Linguistics.normalizeConcept(conceptSurface);
      if (!norm) return null;
      if (!this.nodes.has(norm)) {
        this.nodes.set(norm, {
          concept: norm,
          primarySurface: conceptSurface,
          surfaceForms: new Set([conceptSurface]),
          outgoing: [],
          incoming: []
        });
      } else {
        const node = this.nodes.get(norm);
        node.surfaceForms.add(conceptSurface);
      }
      return this.nodes.get(norm);
    }

    addProposition(prop) {
      if (!prop || !prop.id) return false;
      this.propositionsById.set(prop.id, prop);

      // Index by relation type
      if (!this.propositionsByRelation.has(prop.relation_type)) {
        this.propositionsByRelation.set(prop.relation_type, []);
      }
      this.propositionsByRelation.get(prop.relation_type).push(prop);

      // Create nodes and directed edge
      const subjectNode = this._getOrCreateNode(prop.subject);
      const objectNode = this._getOrCreateNode(prop.object);

      if (subjectNode && objectNode) {
        const edge = {
          id: `EDGE-${prop.id}`,
          source: subjectNode.concept,
          target: objectNode.concept,
          relation: prop.relation_type,
          proposition: prop,
          polarity: prop.polarity,
          modality: prop.modality
        };
        this.edges.push(edge);
        subjectNode.outgoing.push(edge);
        objectNode.incoming.push(edge);
      }

      return true;
    }

    getProposition(id) {
      return this.propositionsById.get(id) || null;
    }

    getPropositionsByRelation(relationType) {
      return this.propositionsByRelation.get(relationType) || [];
    }

    getOutgoing(conceptSurface, relationType) {
      const norm = Linguistics.normalizeConcept(conceptSurface);
      const node = this.nodes.get(norm);
      if (!node) return [];
      if (!relationType) return node.outgoing;
      return node.outgoing.filter((e) => e.relation === relationType);
    }

    getIncoming(conceptSurface, relationType) {
      const norm = Linguistics.normalizeConcept(conceptSurface);
      const node = this.nodes.get(norm);
      if (!node) return [];
      if (!relationType) return node.incoming;
      return node.incoming.filter((e) => e.relation === relationType);
    }

    /**
     * Cycle-safe, bounded path traversal (maxDepth <= 3)
     */
    findPaths(startSurface, endSurface, options) {
      const opts = options || {};
      const maxDepth = Math.min(opts.maxDepth || 3, 3);
      const allowedRelations = opts.allowedRelations ? new Set(opts.allowedRelations) : null;

      const startNorm = Linguistics.normalizeConcept(startSurface);
      const endNorm = Linguistics.normalizeConcept(endSurface);

      if (!this.nodes.has(startNorm) || !this.nodes.has(endNorm)) return [];
      if (startNorm === endNorm) return [];

      const paths = [];
      const visited = new Set([startNorm]);

      function dfs(currentNorm, targetNorm, currentPath, depth) {
        if (depth > maxDepth) return;
        if (currentNorm === targetNorm) {
          paths.push([...currentPath]);
          return;
        }

        const node = this.nodes.get(currentNorm);
        if (!node) return;

        for (const edge of node.outgoing) {
          if (allowedRelations && !allowedRelations.has(edge.relation)) continue;
          if (edge.polarity === POLARITY.NEGATIVE) continue; // Do not traverse negative edges in standard causal chains

          const nextNorm = edge.target;
          if (!visited.has(nextNorm)) {
            visited.add(nextNorm);
            currentPath.push(edge);
            dfs.call(this, nextNorm, targetNorm, currentPath, depth + 1);
            currentPath.pop();
            visited.delete(nextNorm);
          }
        }
      }

      dfs.call(this, startNorm, endNorm, [], 0);
      return paths;
    }

    /**
     * Check if a proposed proposition is contradicted by an existing edge
     */
    hasContradiction(subjectSurface, relationType, objectSurface) {
      const sNorm = Linguistics.normalizeConcept(subjectSurface);
      const oNorm = Linguistics.normalizeConcept(objectSurface);

      const node = this.nodes.get(sNorm);
      if (!node) return false;

      for (const edge of node.outgoing) {
        if (edge.target === oNorm) {
          // Direct polarity contradiction
          if (edge.relation === relationType && edge.polarity !== POLARITY.POSITIVE) {
            return true;
          }
          // Comparative inversion contradiction
          if (relationType === RELATION_TYPES.GREATER_THAN && edge.relation === RELATION_TYPES.LESS_THAN) {
            return true;
          }
          if (relationType === RELATION_TYPES.LESS_THAN && edge.relation === RELATION_TYPES.GREATER_THAN) {
            return true;
          }
          if (relationType === RELATION_TYPES.INCREASES && edge.relation === RELATION_TYPES.DECREASES) {
            return true;
          }
        }
      }

      return false;
    }

    getAllConcepts() {
      return Array.from(this.nodes.values()).map((n) => ({
        normalized: n.concept,
        primarySurface: n.primarySurface,
        surfaceForms: Array.from(n.surfaceForms)
      }));
    }

    getAllPropositions() {
      return Array.from(this.propositionsById.values());
    }
  }

  function buildGraphFromPropositions(propositions) {
    const graph = new KnowledgeGraph();
    if (Array.isArray(propositions)) {
      for (const prop of propositions) {
        graph.addProposition(prop);
      }
    }
    return graph;
  }

  const GraphModule = {
    KnowledgeGraph,
    buildGraphFromPropositions
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GraphModule;
  global.ReasoningGraph = GraphModule;
})(typeof globalThis !== 'undefined' ? globalThis : this);
