# StudySynth Lite — Deterministic Reasoning Engine V2
## Architecture Specification & Engineering Reference

### 1. Executive Summary

StudySynth Lite V2 transitions question generation from regex-based trivia recall to an **offline, deterministic, evidence-grounded conceptual reasoning engine**. 

The engine operates 100% locally on Android devices (Capacitor WebView / PWA) and desktop browsers with:
- Zero LLM, zero ML inference runtime, zero external API keys, zero network traffic.
- Bit-for-bit deterministic reproducibility across runs.
- Strict evidence grounding where every question candidate carries a complete proof trace and exact character offsets into the source document.
- Misconception-driven distractor construction where wrong options reflect identifiable cognitive errors (reversed causality, condition inversion, comparative flipping, out-of-scope rule application) rather than random strings.

---

### 2. Architecture & Pipeline Stages

```
                 SOURCE TEXT / DOCUMENT
                           │
                           ▼
          Document & Sentence Segmentation
          (Offset-preserving tokenizer & abbrev filter)
                           │
                           ▼
            Rule-Based Linguistic Analysis
          (Connectives, Polarity, Modality, Quantifiers, Voice)
                           │
                           ▼
       Typed Semantic Intermediate Representation (SIR)
          (Propositions with provenance, polarity & qualifiers)
                           │
                           ▼
           Directed Knowledge & Evidence Graph
          (Multi-relation index, cycle-safe pathfinder, depth ≤ 3)
                           │
                           ▼
          Library of 16 Reasoning Operators (Op A - Op P)
          (Pure functions yielding derived propositions + proof traces)
                           │
                           ▼
             Answer-First Question Construction
          (Target answer, structured stem, Bloom difficulty)
                           │
                           ▼
             Strict Candidate-Validity Gate
          (Option distinctness, evidence quote check, contradiction elimination)
                           │
                           ▼
         Misconception-Based Distractor Generation
          (Reversed causality, inverted condition, comparative flipping)
                           │
                           ▼
         Quality Scoring & Coverage-Aware Selection
          (Bloom difficulty weighting + diversity bonus via Coverage Ledger)
                           │
                           ▼
               StudySynth Question Bank
          (Conforming 100% to StudySynth Lite persistence & UI contracts)
```

---

### 3. Semantic Intermediate Representation (SIR)

Each proposition captures:
- `id`: Stable proposition identifier (e.g. `PROP-EXT_CAUSAL_VERB-0001`).
- `subject` & `subject_normalized`: Primary concept entity.
- `predicate` & `relation_type`: One of 30 semantic relation types (`CAUSES`, `LEADS_TO`, `REQUIRES`, `CONDITIONAL_ON`, `GREATER_THAN`, `EXCEPTION_TO`, etc.).
- `object` & `object_normalized`: Affected entity or outcome.
- `polarity`: `POSITIVE` or `NEGATIVE` (handles double negation).
- `modality`: `FACT`, `POSSIBILITY`, `OBLIGATION`, or `HYPOTHETICAL`.
- `quantification`: `UNIVERSAL`, `EXISTENTIAL`, `NONE`, or `UNSPECIFIED`.
- `condition` & `exception`: Scoping qualifiers.
- `comparator` & `comparison_direction`: Relative ordering (`A > B` vs `A < B`).
- `source_page`, `source_section`, `source_start`, `source_end`, `source_text`, `supporting_excerpt`: Exact character spans in the document.

---

### 4. The 16 Composable Reasoning Operators

| Operator | Name | Premise Requirements | Inference Transformation | Cognitive Level |
|---|---|---|---|---|
| **Op A** | Rule Application | General rule proposition + matching case | Applies rule law to target case | Application |
| **Op B** | Causal Explanation | Positive fact with `CAUSES` / `LEADS_TO` | Explains effect via mechanistic cause | Comprehension |
| **Op C** | Causal Chain | $A \to B$ and $B \to C$ (acyclic, depth $\le 3$) | Deduces $A \to C$ through intermediate mediator | Analysis |
| **Op D** | Conditional Reasoning | `CONDITIONAL_ON` or `REQUIRES` | Deduces outcome dependency without converse fallacy | Application |
| **Op E** | Comparative Reasoning | `GREATER_THAN` or `LESS_THAN` | Derives directional comparison preserving order | Analysis |
| **Op F** | Process Sequence | `PRECEDES` or `FOLLOWS` | Deduces prerequisite step without conflating sequence with causality | Comprehension |
| **Op G** | Constraint Inference | Explicit boundary constraints + candidates | Eliminates invalid options to find satisfying entity | Analysis |
| **Op H** | Category Inference | `INSTANCE_OF` or `DEFINITION_OF` | Deduces taxonomic classification membership | Comprehension |
| **Op I** | Exception Reasoning | `EXCEPTION_TO` or scoped rule | Proves target is exempt from universal rule | Application |
| **Op J** | Contrastive Explanation | Contrasting claims on $A$ vs $B$ | Identifies fundamental differentiating property | Analysis |
| **Op K** | Evidence Conclusion | Stated empirical evidence for claim | Grounds claim in explicit source excerpt | Analysis |
| **Op L** | Error Diagnosis | Established proposition + fallacy type | Formulates diagnostic test identifying misconception | Analysis |
| **Op M** | Quantitative Reasoning | Directional variable change (`INCREASES`) | Deduces monotonic rate or sign change | Application |
| **Op N** | Conceptual Discrimination | Two distinct concepts sharing domain | Isolates mutually exclusive discriminating factor | Analysis |
| **Op O** | Multi-Hop Synthesis | Cross-passage claims sharing bridge entity | Synthesizes overarching integrated conclusion | Synthesis |
| **Op P** | Counterfactual Reasoning | Monotonic change or strict requirement | Deduces outcome if cause is reversed or removed | Analysis |

---

### 5. Proof-Carrying Question Candidates

Every generated candidate carries an internal proof record:
```json
{
  "id": "Q-LITE-001",
  "candidate_id": "QC-V2-0001",
  "type": "single_choice",
  "question_subtype": "causal_reasoning",
  "stem": "According to the source, what causal mechanism directly produces ocean acidification?",
  "answer_key": "A",
  "options": [
    { "text": "increased atmospheric carbon dioxide", "is_correct": true, "key": "A" },
    { "text": "It is caused by ocean acidification rather than causing it", "is_correct": false, "key": "B", "distractor_origin": "reversed_relation" },
    { "text": "It prevents ocean acidification from occurring", "is_correct": false, "key": "C", "distractor_origin": "reversed_relation" },
    { "text": "It operates independently without influencing ocean acidification", "is_correct": false, "key": "D", "distractor_origin": "scope_error" }
  ],
  "proof_trace": {
    "operator": "OP_B_CAUSAL_EXPLANATION",
    "premises": ["F-LITE-001"],
    "steps": [
      "Extracted source causal mechanism: increased carbon dioxide causes ocean acidification",
      "Derived mechanistic explanation for ocean acidification"
    ]
  },
  "difficulty": "comprehension",
  "quality_scores": {
    "conceptual_depth": 3,
    "reasoning_validity": 1.0,
    "evidence_completeness": 1.0,
    "clarity": 1.0
  }
}
```

---

### 6. Misconception-Driven Distractors

Distractor options are generated using typed cognitive transformations:
1. **Reversed Causality (`reversed_relation`)**: Swapping cause and effect.
2. **Opposite Effect (`adjacent_value`)**: Inverting increase/decrease or greater/lesser.
3. **Inverted Condition (`scope_error`)**: Claiming an outcome occurs unconditionally.
4. **Out-of-Scope Application (`scope_error`)**: Applying a general rule to an explicit exception.
5. **Reversed Sequence (`adjacent_value`)**: Flipping chronological order.
6. **Category Confusion (`confusable_fact`)**: Substituting a peer entity from the graph.

All distractors are verified against the Knowledge Graph to prove they do not match any true proposition in the source.

---

### 7. Multidimensional Quality Model & Coverage Ledger

Candidates are ranked using:
- **Bloom Difficulty Weighting**: Recall = 10, Comprehension = 25, Application = 40, Analysis = 55, Synthesis = 70.
- **Evidence Completeness**: Verified source quotes (+15).
- **Multi-Premise Synthesis**: Chains or multi-premise proofs (+20).
- **Coverage Ledger Bonus**:
  - Unused reasoning operator (+25).
  - Unused question subtype (+15).
  - Uncovered concept entity (+10).
  - Penalty for repeatedly testing the same concept (-20).

---

### 8. Empirical Performance & Verification

On representative benchmarks (10, 100, and 500 facts):
- **10 facts**: 61 ms total latency.
- **100 facts**: 191 ms total latency.
- **500 facts**: 1014 ms total latency.
- **Determinism**: 100% reproducible bit-for-bit across consecutive runs.
- **Test Suite**: 5 test suites (Engine, Integration, Jobs, Revision, Reasoning V2) passed with 0 errors.

---

### 9. Known Limitations & Unsupported Structures

The deterministic rule-based linguistics pipeline explicitly abstains on:
1. **Unresolved Anaphora**: Pronouns ("it", "they", "this") without an unambiguous antecedent in the immediately preceding clause.
2. **Metaphorical & Idiomatic Expressions**: Figurative phrasing that cannot be mapped to formal predicates.
3. **Unstated Common-Sense Assumptions**: The engine reasons strictly within the closed universe of the document.
4. **Contradictory Passages**: Sentences with conflicting factual claims are flagged as conflicting and excluded from question stems.
