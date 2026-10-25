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

All sixteen operators remain implemented and directly testable, but only six are
allowed to publish questions in production. The remaining ten are disabled in
`generateReasoningCandidates()` because their proof contracts are not yet strong
enough to guarantee a source-bound answer.

**Production allowlist:** `OP_B`, `OP_C`, `OP_F`, `OP_H`, `OP_I`, `OP_J`.

**Disabled in production:** `OP_A`, `OP_D`, `OP_E`, `OP_G`, `OP_K`, `OP_L`,
`OP_M`, `OP_N`, `OP_O`, `OP_P`. Calling an operator directly still works; the
candidate generator simply never invokes it.

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

#### 4.1 Proof contracts enforced by the validator

A candidate is published only when its proof trace satisfies the contract for its
operator:

- **OP_B** — the proof must name a cause and an effect drawn from a positive
  `CAUSES` / `LEADS_TO` proposition; the answer must be the effect, not a
  restatement of the stem.
- **OP_C** — both links of the chain must resolve to propositions and the shared
  mediator must match on both sides; cycles and depth over three are rejected.
- **OP_F** — the prerequisite relation must be explicit (`PRECEDES` / `FOLLOWS`);
  sequence is never reinterpreted as causation.
- **OP_H** — a `DEFINITION_OF` premise produces a definition stem
  ("which statement best defines X?"), while `INSTANCE_OF` produces a category
  stem ("which one is mentioned as belonging to X?").
- **OP_I** — the exception must be explicitly scoped to the rule it exempts.
- **OP_J** — both premises must share the same relation type and an identical,
  non-generic predicate; the subjects and objects must be distinct concise noun
  phrases and the combined span may not exceed 120–150 characters.

Every premise must resolve to a fact in the verified registry or to a graph
proposition. A candidate with zero resolved evidence is discarded rather than
being backfilled with an unrelated fact.

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

#### 6.1 Repair 002 distractor integrity

Production questions are rejected rather than completed with unrelated text:

- Exactly four options are required. Fewer than three source-typed distractors
  means the candidate is rejected; no broad controlled filler pool may backfill
  the gap.
- Options must be distinct, non-empty, and pass `Linguistics.isSafeSpan(text, 140)`
  (no quotes, sentence punctuation, discourse openers, or function-word endings).
- `sourceEntities` must be noun-phrase spans of at most 80 characters.
- The only remaining controlled category pool is the narrow "colours of light"
  rule; all other distractors are derived from the source's own typed entities,
  members, values, and propositions.

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
- **Test Suite**: 6 JavaScript suites (Engine, Integration, Processing, Revision,
  Reasoning V2, Repair 002) plus 38 Python tests, all passing with 0 errors.

#### 8.1 Repair 002 batch verification (NCERT Class 8, 8.2)

The shared layout-aware pipeline was run over all eight chapters
(`hees201.pdf` … `hees209.pdf`) into `pwa/data/ncert_8_2_repair_002/`:

| Chapter | PDF | Pages with body | Facts | Production | V2 | Total |
|---|---|---|---|---|---|---|
| 1 | hees201.pdf | 26/34 | 168 | 13 | 1 | 14 |
| 2 | hees202.pdf | 48/50 | 420 | 13 | 2 | 15 |
| 3 | hees203.pdf | 19/40 | 82 | 1 | 1 | 2 |
| 4 | hees204.pdf | 18/18 | 138 | 12 | 2 | 14 |
| 5 | hees205.pdf | 22/24 | 230 | 9 | 2 | 11 |
| 6 | hees206.pdf | 20/24 | 99 | 7 | 3 | 10 |
| 7 | hees207.pdf | 23/24 | 144 | 3 | 1 | 4 |
| 8 | hees209.pdf | 31/35 | 231 | 14 | 0 | 14 |

Totals: 72 production + 12 V2 = 84 questions, 203 typed facts out of 1,512,
**0 audit errors, 0 audit warnings**. Low-volume chapters (notably 3 and 7)
reflect integrity-over-volume: ambiguous layout, missing typed distractors, or
unprovable candidates are rejected rather than guessed.

---

### 9. Known Limitations & Unsupported Structures

The deterministic rule-based linguistics pipeline explicitly abstains on:
1. **Unresolved Anaphora**: Pronouns ("it", "they", "this") without an unambiguous antecedent in the immediately preceding clause.
2. **Metaphorical & Idiomatic Expressions**: Figurative phrasing that cannot be mapped to formal predicates.
3. **Unstated Common-Sense Assumptions**: The engine reasons strictly within the closed universe of the document.
4. **Contradictory Passages**: Sentences with conflicting factual claims are flagged as conflicting and excluded from question stems.

---

### 10. Repair 002 Semantic-Integrity Changes

#### 10.1 Layout-aware extraction

- Text items are placed with `viewport.convertToViewportPoint()`; the simple
  y-flip fallback is used only when the page yields zero text items.
- Inline font changes no longer split a span. Spans split on real geometric
  gaps, rotation changes, or a detected column band.
- Genuine columns are detected from empty vertical bands plus block geometry,
  never a fixed x-coordinate. Reading order is above → left → right → below.
- Blocks are classified into exactly: `body`, `heading`, `caption`, `table`,
  `diagram`, `page_furniture`, `fragment`, `ambiguous`. Only `body` text reaches
  fact extraction.
- Short title-case lines that span the text column are classified as `heading`,
  not body prose.

#### 10.2 Paragraph and assertion integrity

- Wrapped lines are joined with spaces; paragraphs are separated by a blank line
  or a page/furniture boundary.
- `classifySentenceRole()` returns `assertion`, `question`, `instruction`,
  `caption`, `heading`, `label`, or `fragment`. Only `assertion` enters fact
  extraction.
- A sentence that ends on a function word is a truncated `fragment` and donates
  nothing.

#### 10.3 Numeric direction and sign

- Directional extents keep the measured axis: "2,500 km from east to west" and
  "1,000 km from north to south" become `east-west extent` and `north-south extent`.
- Relational measurements keep the named dimension ("average height", "total
  area", "population").
- A numeric subject may never contain another number. This prevents
  "from 40°C during the day to 5°C" from asking about 40°C while answering 5°C.
- Negative values are recognised from a leading minus, `minus`, `negative`,
  `below zero`, or `under zero`, and recorded as `polarity: negative`.
- Bare time units ("18 months") are rejected as subjects; counts such as
  "800 people" remain valid.

#### 10.4 Shared span guards

`linguistics.js` exposes `isSafeSpan`, `isNounPhraseSpan`, and
`endsOnFunctionWord`. The generator and representation layers apply the same
guards to subjects, objects, options, and multi-statement titles:

- reject quotes, colons, sentence punctuation, discourse openers, and embedded
  sentence starts;
- reject bad starts (`them`, `it`, `this`, `with`, `violated`, …);
- reject function-word endings, while allowing particles such as `down`, `up`,
  `out`, and `off`;
- reject definition objects that are clauses with a finite verb.

Causal extraction is restricted to `causes`, `leads to`, `results in`,
`produces`, and `triggers` (plus their passives); legacy causal facts built on
other relation verbs are not eligible for V2 questions.

#### 10.5 Offline load order

`index.html` and `engine/worker.js` load every reasoning module before
`generator.js`, because the role gate and V2 bridge are resolved at parse time.
`sw.js` caches the same modules and is bumped to `studysynth-v37`.

