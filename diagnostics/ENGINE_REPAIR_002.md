# StudySynth Lite — Engine Repair 002 Diagnostic Report
**Semantic Integrity: Layout, Assertions, Numeric Direction, Reasoning Operators, Distractors**

- **Date:** 2026-10-25
- **Repair Run ID:** `REPAIR-002-SEMANTIC-INTEGRITY`
- **Branch:** `fix/repair-002-semantic-integrity`
- **Baseline commit:** `75706893a3c566bf7197d61e90a14e401e46953a`
- **Source PDFs:** `C:\Users\Admin\Desktop\NCERT\8.2\hees201.pdf` … `hees209.pdf`
- **New batch output:** `pwa/data/ncert_8_2_repair_002/`
- **Verification command:** `npm test --prefix pwa` and `python -m pytest tests/ -q`

---

## 1. Executive Summary

Repair 002 replaces text-stream guessing with layout-aware extraction and closes
five semantic-integrity holes that could publish a wrong question:

1. **Layout** — block types are derived from geometry, and only `body` blocks
   become facts. Headings, captions, tables, diagram labels, page furniture,
   fragments, and ambiguous blocks never enter the fact registry.
2. **Assertions** — questions, instructions, captions, headings, and labels are
   classified by sentence role and excluded. Truncated sentences ending on a
   function word become `fragment` and are excluded.
3. **Numeric association** — a numeric subject may not contain another number,
   so a value range can no longer ask about one endpoint while answering the
   other. Directional extents keep their axis, and signed values keep their sign.
4. **Reasoning operators** — only `OP_B`, `OP_C`, `OP_F`, `OP_H`, `OP_I`, and
   `OP_J` may publish questions, each behind an explicit proof contract.
5. **Distractors** — exactly four distinct, safe, source-typed options are
   required. Candidates with fewer than three typed distractors are rejected
   instead of being completed with unrelated filler.

The repaired batch publishes **84 unique questions** across eight chapters
(72 production + 12 V2) with **0 audit errors and 0 audit warnings**.

---

## 2. Baseline Evidence Preserved

The following artifacts were treated as read-only and are byte-identical to the
baseline commit:

- `diagnostics/ENGINE_ROOT_CAUSE_001.md`
- `diagnostics/pipeline_trace_data.json`
- `diagnostics/pipeline_trace_repaired_001.json`
- `pwa/data/ncert_8_2/` (entire directory)
- `pwa/data/ncert_8_2_staged/` (entire directory)

Verification:

```text
git status --porcelain -- pwa/data/ncert_8_2 pwa/data/ncert_8_2_staged \
  diagnostics/ENGINE_ROOT_CAUSE_001.md \
  diagnostics/pipeline_trace_data.json \
  diagnostics/pipeline_trace_repaired_001.json
# (no output)

git diff --stat -- pwa/data/ncert_8_2 pwa/data/ncert_8_2_staged
# (no output)
```

No baseline file was overwritten, regenerated, or committed. All new output is
confined to `pwa/data/ncert_8_2_repair_002/`.

---

## 3. Defects Repaired

### 3.1 Text-stream layout concatenation

**Observed before:** map labels, running headers, captions, and body prose were
joined into a single text stream. Font changes split sentences, and a fixed
x-cutoff could merge columns.

**Repair:**

- Text items are positioned with `viewport.convertToViewportPoint()`; the y-flip
  fallback is used only when the page returns zero text items.
- Inline font changes no longer split spans.
- Spans split on real geometric gaps, rotation changes, or a detected column
  band (`detectColumnBands()` / `crossesColumnBand()`).
- Genuine gutters are detected from empty vertical bands plus block geometry.
  Reading order is above → left → right → below.
- Blocks are typed as `body`, `heading`, `caption`, `table`, `diagram`,
  `page_furniture`, `fragment`, or `ambiguous`. Only `body` reaches extraction.

**Evidence:** the Repair 002 suite builds a synthetic page containing all eight
block types and asserts that `bodyText` contains only the two prose lines.
Headings, captions, table cells, diagram labels, sidebar fragments, ambiguous
blocks, and the page number are all excluded.

### 3.2 Paragraph integrity

**Observed before:** wrapped lines could be split into separate sentences, and
page markers could glue unrelated paragraphs together.

**Repair:** `parseRawDocument()` joins wrapped lines with spaces, separates
paragraphs on a blank line, page marker, or running header, and flushes the
current paragraph before a structural boundary. Offsets remain exact, which
`validateQuestion()` checks by comparing
`section.text.slice(source_start, source_end)` to `fact.source_text`.

### 3.3 Non-assertions donating facts

**Observed before:** question prompts, instructions, captions, and headings could
be parsed as declarative facts.

**Repair:** `classifySentenceRole()` returns `assertion`, `question`,
`instruction`, `caption`, `heading`, `label`, or `fragment`. Only `assertion`
enters `parseFactRelations()`. Truncated endings become `fragment`.

**Evidence:** the suite mixes an assertion, a question, an instruction, and a
caption in one section. Every extracted fact has `sentence_role: assertion`, and
none quotes the question, instruction, or caption. Direct role classification of
all four sentence types is asserted.

### 3.4 Numeric cross-association (direction and sign)

**Observed before:** from the sentence

> "The temperature varies from 40°C during the day to 5°C at night."

the pipeline published:

> **Stem:** According to the passage, what measurement is stated for 40°C during the day?
> **Answer:** 5°C

The subject was built from text before the second number and therefore carried
the first number into the question.

**Repair:** `numericAttribute()` rejects any candidate span containing a digit
(`noNumber`), and the same guard applies to every return path (directional,
relational, before, after, and count). A value range with no safe subject is now
rejected entirely.

**After:** the 40°C / 5°C question is absent from Chapter 1. The only remaining
Chapter 1 numeric question is the honest directional one:

> "According to the passage, what measurement is stated for highest and largest
> plateau on Earth north-south extent?" → **1,000 km**

Directional extents keep the axis (`east-west extent`, `north-south extent`);
relational measurements keep the named dimension (`average height`, `total
area`, `population`). Negative values are recognised from a leading minus,
`minus`, `negative`, `below zero`, or `under zero`, and recorded as
`polarity: negative`. Bare time units are rejected; counts such as "800 people"
remain valid.

### 3.5 Membership split inside a number

**Observed before:** from

> "The Spinifex are an indigenous population of Australia who have lived in the
> desert for over 25,000 years."

the comma inside `25,000` was treated as a list separator, producing the member
`000 years` and the question:

> "According to the passage, which of the following is listed as part of the
> Spinifex?" → **000 years**

**Repair:** list splitting uses `(?<!\d),(?!\s*\d)`, so thousands separators are
never list boundaries. The plural membership pattern also requires a genuine
separator, and list members are filtered to noun phrases; relative clauses and
finite-verb spans are rejected.

**After:** the `000 years` question is absent. The Spinifex sentence no longer
produces a membership question.

### 3.6 Reasoning operators without a proof contract

**Observed before:** all sixteen operators could publish candidates, including
speculative, conditional, comparative, and counterfactual transformations whose
proofs were not strong enough to guarantee a source-bound answer.

**Repair:** production is restricted to `OP_B`, `OP_C`, `OP_F`, `OP_H`, `OP_I`,
and `OP_J`. `OP_A`, `OP_D`, `OP_E`, `OP_G`, `OP_K`, `OP_L`, `OP_M`, `OP_N`,
`OP_O`, and `OP_P` remain implemented and directly testable but are never
invoked by `generateReasoningCandidates()`.

Per-operator contracts enforced by the validator:

- **OP_B** — positive `CAUSES` / `LEADS_TO` premise; answer is the effect.
- **OP_C** — both chain links resolve, mediator matches on both sides, acyclic,
  depth ≤ 3.
- **OP_F** — explicit `PRECEDES` / `FOLLOWS`; sequence is not causation.
- **OP_H** — `DEFINITION_OF` yields a definition stem; `INSTANCE_OF` yields a
  category stem.
- **OP_I** — the exception is explicitly scoped to the rule it exempts.
- **OP_J** — same relation type, identical non-generic predicate, distinct
  concise noun-phrase subjects and objects, combined span ≤ 120–150 characters.

Constructors mark candidates `provisional`; the validator promotes only those
whose premises resolve to a verified fact or graph proposition. Zero resolved
evidence produces `null`, never a fallback to the first available fact.

### 3.7 Distractor integrity

**Observed before:** broad controlled filler pools could complete an option set
when the source did not supply enough typed distractors.

**Repair:**

- Exactly four distinct options are required.
- Fewer than three source-typed distractors → reject the candidate.
- Every option must pass `Linguistics.isSafeSpan(text, 140)`.
- `sourceEntities` must pass `isNounPhraseSpan(value, 80)`.
- The only remaining controlled category pool is the narrow "colours of light"
  rule; all other distractors come from the source's own typed entities,
  members, values, and propositions.

**Evidence:** the suite generates a bank from a science fixture and asserts, for
every question, four distinct non-empty options, exactly one correct option, one
`answer_key` match, safe spans, no filler phrases, and no duplicate stems.

### 3.8 Offline load order

**Observed before:** if the reasoning modules loaded after the generator, the
role gate and V2 bridge silently fell back to `assertion` and V2 was disabled.

**Repair:** `index.html` and `engine/worker.js` load all ten reasoning modules
before `generator.js`. `sw.js` caches the same modules and is bumped to
`studysynth-v37`.

**Evidence:** the suite asserts the index order, the worker import order, the
cache version, and the presence of every reasoning asset in the offline cache.

---

## 4. Batch Regeneration Results

All eight chapters were regenerated through the shared layout-aware pipeline.

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

**Totals:** 72 production + 12 V2 = **84 unique questions**; 203 typed facts out
of 1,512.

Audit (`pwa/tests/audit_question_bank.js` → `audit_report.json`):

```json
{
  "errors": 0,
  "warnings": 0,
  "facts": 1512,
  "typedFacts": 203,
  "production": 72,
  "reasoningV2": 12
}
```

The audit checks option count and distinctness, answer-key integrity, filler
leakage, source offsets, operator allowlist, premise resolution, and coverage.
It deduplicates V2 items that also appear in the production array.

### 4.1 Why some chapters publish few questions

Chapter 3 (2 questions) and Chapter 7 (4 questions) are intentionally thin.
The source pages are diagram-heavy (Chapter 3 has only 19 of 40 pages with body
prose), and many candidates lack either a safe span or three typed distractors.
Repair 002 prefers rejection over a plausible-looking but ungrounded question.

Chapter 8 publishes 14 production questions and 0 V2 questions because no V2
proof survived validation on that source.

---

## 5. Verification Evidence

### 5.1 JavaScript suites

```text
npm test --prefix pwa
```

- Engine: passed
- Integration: passed
- Processing: passed
- Revision: passed
- Reasoning V2: passed
- Repair 002: passed (8 suites)

### 5.2 Python suites

```text
python -m pytest tests/ -q
38 passed in 2.41s
```

### 5.3 Repair 002 regression coverage

`pwa/tests/test_repair_002.js` covers:

1. All eight layout block types and body-only prose.
2. Genuine column gutter and left-before-right reading order.
3. Assertion-only fact extraction and sentence-role classification.
4. Numeric direction, range non-association, and sign preservation.
5. Production operator allowlist and proof-verified publication.
6. Distractor integrity (four distinct, safe, non-filler options).
7. Offline load order in `index.html`, `worker.js`, and `sw.js`.
8. Batch output isolation and a clean audit.

The suite is wired into `pwa/package.json` after the Reasoning V2 suite.

---

## 6. Residual Risks and Limitations

1. **V2 contribution is narrow on this corpus.** All 12 published V2 questions
   are `OP_H` definition questions. Causal (`OP_B`), chain (`OP_C`), sequence
   (`OP_F`), exception (`OP_I`), and contrast (`OP_J`) candidates did not survive
   grounding on these chapters. This is an evidence outcome, not a disabled path.
2. **Layout classification is conservative.** Diagram-heavy pages may produce
   fewer body blocks than a human would mark. The fallback is silence, not
   invented prose.
3. **Table detection is geometric.** Multi-column tables that align like prose
   may still be classified as `body`; the source offset check prevents a
   malformed quote, but not every table-shaped block is caught.
4. **Membership extraction is deliberately narrow.** Sentences with numeric
   thousands separators, relative clauses, or mixed prose no longer produce
   membership questions. Some legitimate lists may be skipped.
5. **No ML or network fallback.** As required, every decision is deterministic
   JavaScript. There is no semantic model to recover a fact the rules cannot
   parse.

---

## 7. Reproduction

```text
# Regenerate the batch (writes only to pwa/data/ncert_8_2_repair_002/)
node pwa/tests/batch_generate_all_ncert.js

# Audit the batch
node pwa/tests/audit_question_bank.js

# Full verification
npm test --prefix pwa
python -m pytest tests/ -q
```

Expected: 84 unique questions, 0 audit errors, 0 audit warnings, all JavaScript
and Python tests passing.
