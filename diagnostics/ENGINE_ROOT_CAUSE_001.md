# StudySynth Lite — Root-Cause Diagnostic Report 001
**Pipeline Failure Analysis: Geography Map-Scale Phantom Question (`1000 km`)**

- **Date:** 2026-10-25
- **Diagnostic Run ID:** `DIAG-NCERT-8.2-GEO-001`
- **Target Source:** `C:\Users\Admin\Desktop\NCERT\8.2\hees201.pdf` (*World Geography: Some Glimpses*, Class 8)
- **Target Artifact:** `pwa/data/ncert_8_2/hees201_world_geography.md`
- **Lead Investigator:** Antigravity Agentic Diagnostic System

---

## 1. Executive Summary

In Chapter 1 (*World Geography: Some Glimpses*), Question 1 (`Q-LITE-001`) of the generated question bank generated the following malformed multiple-choice item:

> **Stem:** According to the passage, what measurement is stated for Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India?
> **Answer:** 1000 km
> **Supporting Excerpt:** "London Europe Mumbai INDIAN OCEAN ATLANTIC OCEAN 0 500 1000 km Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India and Beyond | Grade 8 Part 2 The Continents: Variety on Land Landforms of the world include mountains, plateaus, and plains."

This diagnostic pass traced the candidate backward from the serialized Markdown question bank through all 12 pipeline boundaries to the raw PDF text layer in `hees201.pdf`.

### Key Diagnostic Findings
1. **Earliest Incorrect Transformation [CONFIRMED]:** 
   The primary defect occurs at the boundary between **PDF Stream Extraction (Stage 2)** and **Page/Section Parsing (Stage 4)**. Unordered graphic map vector annotations on Page 9 (Figure 1.10) lack terminal punctuation and were concatenated across the page boundary directly into Page 10's running header, subhead, and body text because `parseRawDocument()` stripped `==Page 10==` without inserting a semantic or sentence boundary.
2. **Secondary Syntactic Failure [CONFIRMED]:**
   The sentence segmenter `splitSentences()` (`Intl.Segmenter`) merged the resulting 272-character inter-page block into a single sentence because there was no terminal period between compass initial `N` (Page 9) and `plains.` (Page 10).
3. **Attribute Extraction Failure [CONFIRMED]:**
   `numericDrafts()` matched the map scale `1000 km` and invoked `numericAttribute()`. `cleanNumericAttribute()` truncated the following text at the conjunction `"and"` in `"India and Beyond"`, synthesizing the corrupt entity `"Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India"`.
4. **Validator Blindspot [CONFIRMED]:**
   The candidate passed all validation checks with zero errors (`valid: true, issues: []`) because `validateQuestion()` only validates internal referential consistency against the extracted fact registry and `section.text`. Since the malformed string was verbatim present in `section.text`, and `isUsableSubject()` lacks token diversity / POS sanity checks, the corrupted item was certified as `verified`.

---

## 2. Freeze & Repository Environment State

- **Local Repository Path:** `E:\studysynth-android`
- **Active Git Branch:** `main`
- **Git HEAD Commit:** `6f41314` (*feat: implement Deterministic Reasoning Engine V2 and add NCERT Class 8 question banks*)
- **Working Tree State:** Completely clean (`nothing to commit, working tree clean`).
- **Generating Entry Point:** `pwa/tests/batch_generate_all_ncert.js`
- **Execution Command:** `node pwa/tests/batch_generate_all_ncert.js`
- **Diagnostic Engine Modules Verified:**
  - PDF Ingestion: `pwa/vendor/pdfjs/pdf.mjs`
  - Text Processing & Fact Extraction: `pwa/engine/generator.js`
  - High-Level Ingestion Orchestrator: `pwa/engine/analyze.js`
  - Deterministic Reasoning V2 Engine: `pwa/engine/reasoning/engine_v2.js`
  - Serialization: `pwa/tests/batch_generate_all_ncert.js` (`buildMarkdownReport`)

---

## 3. The Reproduced Malformed Item

The failure was reproduced with 100% determinism using `diagnostics/run_diagnostics.js`.

```json
{
  "id": "Q-LITE-001",
  "type": "single_choice",
  "question_subtype": "numeric_recall",
  "stem": "According to the passage, what measurement is stated for Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India?",
  "options": [
    { "key": "A", "text": "1000 km", "is_correct": true },
    { "key": "B", "text": "999 km", "is_correct": false, "distractor_origin": "deterministic_value_offset" },
    { "key": "C", "text": "1001 km", "is_correct": false, "distractor_origin": "deterministic_value_offset" },
    { "key": "D", "text": "998 km", "is_correct": false, "distractor_origin": "deterministic_value_offset" }
  ],
  "answer_key": "A",
  "expected_answer": "1000 km",
  "supporting_excerpt": "London Europe Mumbai INDIAN OCEAN ATLANTIC OCEAN 0 500 1000 km Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India and Beyond | Grade 8 Part 2 The Continents: Variety on Land Landforms of the world include mountains, plateaus, and plains.",
  "difficulty": "easy",
  "cognitive_level": "recall",
  "verification": {
    "status": "verified",
    "rules": [
      "source_fact",
      "typed_options",
      "evidence_quoted",
      "answer_verified",
      "scope_preserved"
    ]
  }
}
```

---

## 4. Pipeline Boundary Trace (Stages 1 through 12)

Every pipeline boundary was instrumented on `hees201.pdf` (Pages 1–20). The raw trace records are archived in `diagnostics/pipeline_trace_data.json`.

```
[Stage 1: PDF Extraction]
   hees201.pdf Page 9 & Page 10 text streams extracted via pdfjs.getTextContent()
      ↓
[Stage 2: Layout & Coordinate Inspection]
   Page 9 Map Figure labels (y=190..570) emitted at tail of PDF stream without punctuation
      ↓
[Stage 3: Element Classification]
   NOT IMPLEMENTED: Pipeline lacks classification for headers, footers, map labels, captions
      ↓
[Stage 4: Document & Page Segmentation]
   parseRawDocument() strips '==Page 10==' without inserting terminal sentence boundary
      ↓
[Stage 5: Sentence Segmentation]
   splitSentences() creates single 272-char sentence merging Page 9 map labels + Page 10 text
      ↓
[Stage 6: Fact & Relation Extraction]
   numericDrafts() matches '1000 km'; cleanNumericAttribute() truncates at 'and', yielding F-LITE-092
      ↓
[Stage 7: Intermediate Proposition Graph]
   F-LITE-092 registered in fact index with subject='Equator ASIA AFRICA...' and object='1000 km'
      ↓
[Stage 8–9: Reasoning Operators V2]
   Operator evaluation skips F-LITE-092 for causal/comparative proof; remains in production pool
      ↓
[Stage 10: Candidate Question Construction]
   makeNumericCandidate() generates single_choice numeric_recall with offset distractors
      ↓
[Stage 11: Validator Gate]
   validateQuestion() passes candidate: fact exists, excerpt matches section.text, offsets exact
      ↓
[Stage 12: Question Bank Serialization]
   buildMarkdownReport() writes Q-LITE-001 into hees201_world_geography.md
```

### Detailed Boundary Walkthrough

#### Stage 1: PDF Extraction (Page-by-Page)
- **Input:** Binary stream of `hees201.pdf`.
- **Module:** `pwa/vendor/pdfjs/pdf.mjs` via `doc.getPage(9)` and `doc.getPage(10)`.
- **Data Captured:** Page 9 has 75 text items; Page 10 has 81 text items.

#### Stage 2: Layout Coordinates & Stream Order
On Page 9 (Figure 1.10: Map showing maritime route between London and Mumbai):
- Body text & caption appear at `y=101.2..165.1` (bottom of page):
  - `[31] Fig. 1.10. The Suez Canal is the shortest maritime route from India to Europe.` (`y=165.1`)
- Map graphic vector labels appear at `y=198.1..568.5` (middle/upper page):
  - `[47] "0"` (`x=99.5, y=229.9`)
  - `[49] "500"` (`x=125.8, y=229.9`)
  - `[51] "1000 km"` (`x=146.3, y=229.9`)
  - `[53] "Equator"` (`x=150.2, y=334.4`)
  - `[55] "ASIA"` (`x=368.4, y=528.4`)
  - `[57] "AFRICA"` (`x=231.8, y=350.9`)
  - `[59] "Suez"`, `[61] "Canal"` (`y=402.6..413.4`)
  - `[63] "Legend"`, `[65] "Route"`, `[67] "City"` (`y=198.1..227.1`)
  - `[69..74] "E", "W", "S", "N"` (`y=528.6..568.5`)
- **Key Observation:** In the PDF stream, vector text elements inside figures are placed *after* the caption. The stream ends with `N` without terminal punctuation.

#### Stage 3: Structural Classification
- **Status:** *Not Implemented*.
- The current ingestion pipeline applies no classification to distinguish running headers, footers, figure labels, map scale bars, or captions from continuous body prose.

#### Stage 4: Page and Section Segmentation
- **Function:** `Engine.parseRawDocument(rawText, defaultTitle)` in `pwa/engine/generator.js` (lines 1890–1947).
- In `batch_generate_all_ncert.js`:
  ```javascript
  pagesText.push(`==Page ${pageNum}==\n${text}`);
  ```
- In `parseRawDocument`:
  ```javascript
  const pageMatch = trimmed.match(/^page\s+(\d+)/i) || trimmed.match(/^==Page\s+(\d+)/i);
  if (pageMatch) {
    pageNum = parseInt(pageMatch[1], 10);
    continue; // <--- PAGE MARKER REMOVED WITHOUT INSERTING BOUNDARY!
  }
  ```
- Because Page 9 ended with `... E W S N` (no period), and Page 10 began with `10 Exploring Society: India and Beyond...` (not an `#` header), lines 1923–1925 pushed them into the same paragraph buffer:
  `currentParagraphs.push(trimmed)`.
- When joined, the inter-page boundary dissolved completely.

#### Stage 5: Sentence and Clause Segmentation
- **Function:** `Engine.splitSentences(text)` in `pwa/engine/generator.js` (lines 205–246).
- Uses `Intl.Segmenter(locale, { granularity: 'sentence' })` with fallback to regex `/(?<=[.!?;।॥\n])\s+(?=[A-Z0-9])/`.
- Because the joined string contained no period between `London` and `plains.`, `splitSentences()` returned the entire 271-character block as a single sentence:
  > `"London Europe Mumbai INDIAN OCEAN ATLANTIC OCEAN 0 500 1000 km Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India and Beyond | Grade 8 Part 2 The Continents: Variety on Land Landforms of the world include mountains, plateaus, and plains."`

#### Stage 6: Fact and Relation Extraction
- **Function:** `numericDrafts(text)` in `pwa/engine/generator.js` (lines 1527–1573).
- Matches regex: `/-?\d[\d,]*(?:\.\d+)?\s*(?:km|...)\b/gi` on `"1000 km"`.
- Calls `numericAttribute(text, match, 'measurement')`:
  - `after` = `text.slice(match.index + match[0].length)`:
    `" Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India and Beyond | Grade 8 Part 2 The Continents: Variety on Land Landforms of the world include mountains, plateaus, and plains."`
  - In `cleanNumericAttribute(raw)`:
    `value = value.replace(/\s+and\b[\s\S]*$/i, '').trim();`
    This regex matched the word `"and"` in `"India and Beyond"`, truncating everything that followed!
  - What remained was:
    `"Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India"`
- The resulting fact record was registered:
  ```json
  {
    "fact_id": "F-LITE-092",
    "fact_type": "numeric",
    "subject": "Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India",
    "relation": "numeric_value",
    "object": "1000 km",
    "attribute": "Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India",
    "answer_kind": "measurement",
    "extraction_method": "numeric_quantity"
  }
  ```

#### Stage 7–9: Intermediate Graph & Reasoning Operators
- Evaluated in `pwa/engine/reasoning/engine_v2.js`.
- Because `F-LITE-092` has `relation: 'numeric_value'`, operators requiring causal links (Op B/C), conditions (Op D), or comparisons (Op E) did not select it for proof trees.
- It remained in the verified production fact pool for single-fact production generation.

#### Stage 10: Question Candidate Construction
- **Function:** `makeNumericCandidate(fact, registry)` in `pwa/engine/generator.js` (lines 2532–2540).
- Calls `numericStem(fact)`:
  - Calls `isUsableSubject(attribute)`.
  - The attribute passed `isUsableSubject()` because:
    - Length >= 2.
    - First character is `'E'` (not blacklisted pronoun/conjunction in `UNUSABLE_SUBJECT_START`).
    - Does not contain lowercase dummy pronouns (`\b(?:we|you|they|it|this|that|there)\b`).
    - Parens and quotes balanced.
    - Contains `>=3` alphabet characters.
  - Generates stem:
    `"According to the passage, what measurement is stated for Equator ASIA AFRICA Suez Canal Legend Route City E W S N 10 Exploring Society: India?"`
- Calls `buildNumericDistractors(fact)`:
  - Distractor generator uses `deterministic_value_offset` (+1, -1, -2) to produce `999 km`, `1001 km`, `998 km`.

#### Stage 11: Validator Gate
- **Function:** `validateQuestion(question, factRegistry, sourceContext)` in `pwa/engine/generator.js` (lines 2945–3080).
- The validator executed all rules:
  1. `fact_reference`: Fact `F-LITE-092` exists in registry. -> **PASS**
  2. `source_offsets`: `section.text.slice(9883, 10154)` matches `fact.source_text`. -> **PASS**
  3. `source_evidence`: Supporting excerpt occurs in source sentence. -> **PASS**
  4. `explanation_evidence`: Explanation quotes supporting excerpt verbatim. -> **PASS**
  5. `option_count` & `option_uniqueness`: Exactly 4 distinct options (`1000 km`, `999 km`, `1001 km`, `998 km`). -> **PASS**
  6. `distractor_provenance`: Every distractor marked with `distractor_origin`. -> **PASS**
- **Validation Result:**
  ```json
  { "valid": true, "issues": [], "qid": "Q-LITE-001", "expectedAnswer": "1000 km" }
  ```

#### Stage 12: Question Bank Serialization
- Written into `pwa/data/ncert_8_2/hees201_world_geography.md` as Question 1.

---

## 5. Control Sample Comparison

To ensure that repairs do not break legitimate prose extractions, two control candidates from the same chapter were traced alongside the failure.

| Metric | Target Failure (`Q-LITE-001`) | Control 1: Valid Prose Definition (`Q-LITE-002`) | Control 2: Running Header Collision (`Q-LITE-011`) |
| :--- | :--- | :--- | :--- |
| **Origin Page** | Page 9 (map labels) + Page 10 | Page 2 (body prose, y=227.2) | Page 8 (map/figure labels) + Page 9 |
| **Source Text** | `London Europe Mumbai INDIAN OCEAN...` | `The process of showing the Earth on a flat surface is called a map projection.` | `Great Barrier Reef Great Barrier Reef 8 Exploring Society: India and Beyond...` |
| **Fact ID** | `F-LITE-092` | `F-LITE-020` | `F-LITE-076` |
| **Fact Type** | `numeric` | `entity_attribute` | `membership` |
| **Subject** | `Equator ASIA AFRICA Suez Canal...` | `The process of showing the Earth on a flat surface` | `Great Barrier Reef Great Barrier Reef 8 Exploring Society...` |
| **Object** | `1000 km` | `called a map projection` | `about 350, 000 square kilometres` |
| **Extraction Rule** | `numeric_quantity` | `pattern_enriched` | `membership_list` |
| **Question Stem** | `...what measurement is stated for Equator ASIA AFRICA...?` | `...which of the following correctly describes the process of showing the Earth on a flat surface?` | `...which of the following is included in London Europe Mumbai...?` |
| **Legitimacy** | **MALFORMED (Artifact)** | **GENUINE (Must preserve)** | **MALFORMED (Artifact)** |

### Control 1 Analysis
On Page 2, the source sentence is continuous, well-formed prose:
> *"The process of showing the Earth on a flat surface is called a map projection."*
- Bounding box Y-coordinates show continuous horizontal layout (`y=227.2`).
- Sentence segmentation cleanly captures the single clause.
- `pattern_enriched` rule extracts the role relationship accurately.
- **Preservation Contract:** Any repair must continue to recognize and extract valid definitions of this structure without regression.

### Control 2 Analysis
On Page 8, a parallel failure occurred:
Figure 1.8 labels (`Great Barrier Reef`) bled across Page 8's running footer/header into the body text, and `membership_list` parsed `stretches over a length of 2,000 km and covers about 350,000 square kilometres` into members `about 350` and `000 square kilometres`. This confirms the problem is systematic across page boundaries and figure boundaries.

---

## 6. PDF Layout vs. Extracted Text Comparison

Inspection of the actual rendered PDF page 9 and page 10 revealed:

```
+-------------------------------------------------------------+
| Page 9 (hees201.pdf)                                        |
|                                                             |
| [Body Text Top]: trade between India and Europe...          |
| [Callout Box]: DON'T MISS OUT / Bay of Bengal...            |
|                                                             |
| +---------------------------------------------------------+ |
| | Figure 1.10 Graphic Map                                 | |
| |   [Compass]: N, S, E, W                                 | |
| |   [Map Labels]: London, Europe, ASIA, Mumbai, AFRICA    | |
| |   [Water]: ATLANTIC OCEAN, INDIAN OCEAN                 | |
| |   [Scale Bar]: [0]---[500]---[1000 km] (y=229.9)        | |
| |   [Legend]: Legend, City, Route                         | |
| +---------------------------------------------------------+ |
|                                                             |
| [Caption]: Fig. 1.10. The Suez Canal is the shortest...    |
| [Body Text Bottom]: The Suez Canal is a human-made...       |
| [Footer]: 9 | India and the World...                        |
+-------------------------------------------------------------+
                              || (Page Boundary Dissolved)
+-------------------------------------------------------------+
| Page 10 (hees201.pdf)                                       |
| [Running Header]: 10 Exploring Society: India and Beyond... |
| [Chapter Subhead]: The Continents: Variety on Land          |
| [Body Text]: Landforms of the world include mountains...    |
+-------------------------------------------------------------+
```

### Physical Layout Discrepancies
1. **Vertical Disconnection:**
   The scale bar `0 500 1000 km` is rendered at `y=229.9`, while the compass rose is at `y=568.5` and the running header is on a different page. They share no physical, conceptual, or syntactic relationship.
2. **Stream Inversion:**
   In PDF internal streams, text elements inside vector illustrations often appear at the end of the content stream regardless of their vertical position. The extraction tool (`pdfjs.getTextContent()`) emits them in stream order, which scrambles the visual reading order.
3. **Absence of Terminal Punctuation:**
   Figure labels and running headers inherently lack terminal punctuation (`.`, `!`, `?`). When extracted naively as raw text, they concatenate directly with adjacent text blocks.

---

## 7. Categorization of Findings

| ID | Finding | Confidence Level | Evidence |
| :--- | :--- | :--- | :--- |
| **F-01** | Page boundary removal in `parseRawDocument` causes cross-page text bleeding. | **CONFIRMED** | `generator.js` line 1905 strips `==Page N==` without inserting punctuation or newline separation. |
| **F-02** | Vector map labels on Fig 1.10 lack punctuation and concatenate into body prose. | **CONFIRMED** | `pipeline_trace_data.json` shows items 33–74 on Page 9 forming an unpunctuated 115-character run. |
| **F-03** | `cleanNumericAttribute()` regex prematurely truncated at `"and"` in `"India and Beyond"`. | **CONFIRMED** | `generator.js` line 1492 specifically matches `/\s+and\b[\s\S]*$/i`. |
| **F-04** | `isUsableSubject()` lacks token diversity and grammatical coherence validation. | **CONFIRMED** | Accepted a string containing 11 uppercase acronyms, compass initials, and colons. |
| **F-05** | `validateQuestion()` is purely an internal referential integrity checker. | **CONFIRMED** | Certified malformed question as `valid: true` because excerpt was in `section.text`. |
| **F-06** | Stream order inside vector figures differs fundamentally from reading order. | **CONFIRMED** | PDF.js item stream places `y=165.1` (caption) *before* `y=568.5` (map compass labels). |

---

## 8. Smallest Justified Repairs (Recommended Roadmap)

To eliminate this class of failures without rewriting production modules or destabilizing existing question generation:

### Repair 1: Enforce Structural Page & Header Boundaries in Parsing
- **Location:** `pwa/engine/generator.js` in `parseRawDocument()`.
- **Change:**
  When encountering a page marker (`/^==Page\s+\d+/i`), terminate the active paragraph and flush it to the current section. If the preceding paragraph does not end with terminal punctuation (`[.!?]`), append a newline/period barrier so `splitSentences()` never merges text across pages.

### Repair 2: Filter Page Furniture (Headers, Footers, Page Numbers)
- **Location:** `pwa/engine/generator.js` (or extraction preprocessor in `analyze.js`).
- **Change:**
  Detect and strip standard textbook running headers and footers matching pattern:
  `/^\d+\s+Exploring Society:\s+India and Beyond\b/i` or `/\bExploring Society:\s+India and Beyond\s*\|\s*Grade\s+\d+\b/i`.

### Repair 3: Diagram & Figure Label Isolation
- **Location:** `pwa/engine/generator.js` (text preprocessing).
- **Change:**
  Text immediately following `Fig.\s+\d+\.\d+` up to the next paragraph break should be treated as caption/figure context and isolated from body text narrative facts.

### Repair 4: Strengthen `isUsableSubject()` & Attribute Sanity
- **Location:** `pwa/engine/generator.js` lines 572–582 and 1485–1502.
- **Change:**
  - Reject subjects containing multiple single-letter tokens (e.g. compass initials `E W S N`).
  - Reject subjects containing colons followed by textbook titles (`Exploring Society:`).
  - Limit numeric measurement attributes to reasonable noun phrase patterns rather than arbitrary sentence fragments.

### Repair 5: Add Semantic Plausibility Gate to `validateQuestion()`
- **Location:** `pwa/engine/generator.js` lines 2945–3080.
- **Change:**
  Validate that the stem does not ask for measurements of non-measurable entities (e.g. compass directions, multi-continent concatenations).

---

## 9. Required Regression Tests

The following unit and integration tests must be added to `pwa/tests/test_engine.js` before deploying fixes:

1. **Test: Inter-page bleeding prevention**
   - *Input:* Two pages where Page 1 ends with unpunctuated text and Page 2 starts with a running header.
   - *Assertion:* Sentences from Page 1 and Page 2 are strictly segmented; no sentence spans both pages.
2. **Test: Map scale bar isolation**
   - *Input:* A text block containing `0 500 1000 km` alongside map annotations.
   - *Assertion:* The scale bar does not become a numeric fact attached to adjacent map labels.
3. **Test: Running header rejection**
   - *Input:* Sentences containing `Exploring Society: India and Beyond | Grade 8`.
   - *Assertion:* Running headers are never accepted as subjects or attributes.
4. **Test: Preservation of valid prose definitions**
   - *Input:* `"The process of showing the Earth on a flat surface is called a map projection."`
   - *Assertion:* Verified `entity_attribute` question continues to generate with identical stem and key.

---

## 10. Integrity Verification

- **Original Generated Reports:** All 8 `.md` files in `pwa/data/ncert_8_2/` and `C:\Users\Admin\Desktop\NCERT\8.2\` remain byte-identical and unmodified.
- **Production Engine Files:** `pwa/engine/generator.js`, `pwa/engine/analyze.js`, and `pwa/engine/reasoning/*` remain unmodified from commit `6f41314`.
- **Diagnostic Artifacts:** Isolated entirely in `diagnostics/`:
  - `diagnostics/run_diagnostics.js`
  - `diagnostics/pipeline_trace_data.json`
  - `diagnostics/ENGINE_ROOT_CAUSE_001.md`
