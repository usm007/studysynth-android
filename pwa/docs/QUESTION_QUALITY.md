# StudySynth Question Quality Standard

This is the bar a generated question bank must meet before it can be
called satisfactory. It is judged on the questions as a student sees
them — stem plus four options, nothing else — not on test-suite output,
not on the excerpt, and not on generator metadata.

## 1. Stem rules (non-negotiable)

- The stem must be self-contained. A student who has never seen the
  source text must be able to understand what is being asked from the
  stem and options alone.
- The stem must name its subject and the dimension being asked about:
  who or what, and what about it (date, place, cause, meaning, member,
  effect, order, and so on).
- The stem must never contain "According to the passage", "According
  to the source", "Based on the source/passage/text", "in the passage",
  "in the source", or any other reference to the source text. Those
  phrases are generator scaffolding leaking into the product. In an
  exam there is no passage in front of the student.
- Context-free stems are rejected, not generated. Examples that must
  never appear: "What number is stated?", "What measurement is stated?",
  "Which comparison is explicitly stated?", "What does the source
  state about X?" A numeric question whose only subject is a bare
  unit ("States", "years") is rejected unless the entity being counted
  is named in the stem.
- A comparison question must compare two named entities on a stated
  dimension. A sentence that merely contains a contrast word ("though",
  "while") is not a comparison question.

## 2. Answer and option rules

- Exactly four options, exactly one correct, all unique after
  normalisation.
- The correct answer must equal the extracted source fact, and for
  causal questions the direction must match the excerpt: a cause must
  not be presented as an effect, and vice versa. In particular, a
  "because" sentence ("Y because X") means X causes Y, not Y causes X.
- Distractors must be the same kind of thing as the answer (a date
  against dates, a mineral against minerals, a person against
  persons), at a similar granularity, and plausible to someone who
  half-knows the topic. Random other facts from the chapter are not
  distractors.
- No fragment distractors: no option that starts with a preposition
  ("of …", "to …", "for …"), is a bare "type of" / "path of", starts
  with a non-letter marker, or ends with a dangling modal.
- No length giveaway: the correct answer must not be more than twice
  as long as the shortest option in the same question, unless the
  other options are genuinely long for the same reason.
- Answer keys must be balanced across a bank (no key dominating).

## 3. Variety rules

- A bank must not be dominated by one subtype. No subtype may exceed
  40% of the target count (6 per 15-question target), and a chapter
  bank should cover at least five subtypes where the source supports
  them. Share of a smaller final bank is not, by itself, a failure:
  a descriptive chapter that honestly yields 11 questions with 6
  entity items is not made more varied by deleting 2 good entity
  items to hit a percentage.
- Multi-statement truth patterns must vary. A bank in which every
  multi-statement answer is "1 only" is predictable and therefore
  invalid, however technically correct each item is. The patterns
  "1 only", "2 only", "Both 1 and 2" and "Neither 1 nor 2" must all be
  reachable, and the pattern chosen for a given pair must not be
  determined by the pair's position in the source.
- Reasoning (V2) items must not all be the same operator or the same
  distractor template. Where a chapter supports no safe V2 item, it
  gets none — a missing V2 item is better than a wrong one.
- Question types must work across subjects and exams (history,
  geography, civics, economics, pedagogy, science) and across source
  kinds (textbook chapter, notes, markdown, short text, user document).
  A rule that only works for one chapter is not a rule.

## 4. Mock-test forms (added 2026-10-25, informed by CTET practice books)

A bank for a mock test, not just for revision, must include the
forms real exams actually use. The practice books supplied for this
work are dominated by statement evaluation, not by single-fact
recall, and the generator must match that shape — without copying
any question from those books, which are copyrighted material and
are used here only as a pattern reference.

- Exception: "Which of the following is NOT included in X?" The
  correct answer must be an outsider from another list in the same
  source, and all three distractors must be true members of X. NOT
  must be capitalised in the stem, because a missed "not" flips the
  whole question. An exception question and a membership question
  for the same list must never both appear in one bank: they test
  the same list twice.
- Statement-option: "Which of the following statements is correct
  about X?" Options are full sentences. The correct option is the
  exact source sentence; each distractor is that sentence with its
  value replaced by a value the source does not state for X. A
  distractor that is actually supported elsewhere for X is rejected,
  or the question would have two correct answers.
- Three-statement: "Consider the following statements" with three
  statements in source order, and four combination options chosen
  from the subset patterns ("1 only", "2 only", "3 only",
  "1 and 2 only", "1 and 3 only", "2 and 3 only", "1, 2 and 3").
  Distractor combinations must be near misses (differing by one
  statement from the correct set), so partial knowledge does not
  guess the answer. An all-false triple is not generated.
- Ordering: statements stay in source order with a truth value
  each. Grouping all true statements first made "2 only" and
  "1 and 3 only" unreachable, which is why no earlier bank contained
  them. That grouping is now a defect, not a convention.
- Distractor preference: where the source supplies distractors,
  prefer facts about the same subject family over unrelated facts
  from the same chapter. A distractor eliminable by topic alone
  ("oblate spheroid" for a national park's role) is not a distractor.
- "All of the above" / "None of the above" are deliberately NOT
  generated as routine options, even though practice books use them
  frequently: they let a student who knows only two options are
  correct guess the answer without knowing the third. The only
  "none" form used is the multi-statement "Neither 1 nor 2", where
  it is a verified truth pattern, not a guessing shortcut.

## 5. Assertion-Reason and matching (added 2026-10-25)

- Assertion-Reason offers exactly the four standard judgements, in
  CTET order: both true and R explains A; both true but R does NOT
  explain A; A true but R false; A false but R true. The stem carries
  both statements in full ("Assertion (A): … Reason (R): … Which of
  the following is correct?"), and the question also stores
  `assertion`, `reason` and `ar_pattern` for a future renderer.
- Pattern (a) — R explains A — comes only from a causal fact whose
  effect can be rendered as a standalone claim without inventing
  content: either the effect already contains a finite verb, or it
  is a short noun phrase followed by a comparative remainder, where
  inserting "is" is the only change. Anything else yields no
  type-(a) item. The Reason is the causal sentence itself, which
  states the mechanism.
- Patterns (b), (c) and (d) come from pairs of statements whose
  truth is verified exactly as in multi-statement items (true =
  exact source sentence, false = mutated value with a recorded
  alteration, checked not to be supported elsewhere). For (b) the
  two facts must share no content word and neither may be causal,
  so "R does not explain A" is not debatable. For (c) and (d) the
  explanation link is moot, because one statement is false.
- Matching: four facts from the same section, each with a short
  subject and a distinct, short object, become List I (A–D) and
  List II (1–4, shuffled, never the trivial identity order). Options
  are codes; distractors are near-miss codes obtained by swapping
  two targets in the correct code, so matching three of four pairs
  correctly still fails. A set is rejected if any object is also
  supported for another subject in the set, or the matching would
  be ambiguous. The question stores `lists` and `matching_pairs`
  for a future renderer; the stem also carries both lists in text,
  so the current renderer already shows the full question.
- Length rules do not apply to Assertion-Reason or matching
  options: their option lengths are fixed by the form (the two
  "both true" options are inherently longer than the two short
  ones, and codes are all the same length), so length cannot be a
  content giveaway in the way it is for factual answers.
- Gates that the first NCERT run forced (2026-10-25): effect claims
  are comparative-only (a finite-verb branch produced garbled
  claims like "You a resident, but citizenship is ...", so it was
  removed); A-R statements must start with a capital, must not
  start with a pronoun, modal or discourse marker, and must not
  end with a dangling connector; A-R pairs that are near-duplicates
  (one containing the other as a substring) are rejected, but
  parallel sentences sharing template words are not duplicates;
  A-R mutations are only allowed for short values (original object
  and replacement each at most five words, non-clausal), because
  mutating a long prose clause produces nonsense like "The right
  to freedom is being teased on the playground"; matching List I
  items must be entities or concepts, not sentences, gerund
  phrases or bare definite nouns ("the temple", "the move"), and
  List II items must not start with a pronoun or end with a
  dangling connector or anaphoric word. A set that fails any of
  these is rejected whole, not repaired by editing.
- Yield, honestly stated: Assertion-Reason appears in the NCERT
  banks (8 items across 6 chapters in the 2026-10-25 regeneration,
  including one clean type-(a) item about the judicial system),
  but matching appears in none of them, because NCERT prose rarely
  yields four clean, same-theme, short subject-object pairs under
  these gates. Matching is implemented and tested on structured
  sets (four Articles, with shuffled List II and near-miss codes),
  and will appear when the source is structured — lists, tables,
  or notes with named entities — rather than by lowering the
  gates to force a prose set into the form.

## 6. Mock-test assembly (added 2026-10-25)

A bank is a pool; a mock test is a selected paper, and it is judged
separately. `assembleMockTest` must:

- cover sections round-robin, so a paper does not come only from
  the first section that yielded facts;
- aim at a difficulty mix (default 30% easy / 50% medium / 20%
  hard) without forcing it — if the bank has no surviving hard
  question, the paper is short on hard questions and the audit says
  so, rather than lowering the bar to fill the quota;
- never reuse a relation key in one paper, and never let one
  question's answer appear in another question's stem or statements
  (an answer appearing as a distractor elsewhere is normal exam
  practice and is not leakage);
- balance answer keys so counts differ by at most one, without a
  simple ABCD rotation a student could learn;
- report an audit: total, difficulty actual vs target, subtype
  counts, section counts, key distribution, and how many candidates
  were rejected for leakage or reuse.

## 7. Teaching explanations, case sets, chronology, tables, real difficulty (added 2026-10-25)

- **Explanations must teach, not just confirm.** A direct
  question's explanation quotes the evidence and then says, for
  each wrong option, why that option fails, tied to the
  distractor's origin (a nearby year, a nearby value, a different
  entity of the same kind, a value stated elsewhere but not for
  this subject). Sentences name option texts, never option
  letters, because the bank builder rotates options after
  selection. Multi-statement, Assertion-Reason and matching
  already explain per statement, per pair or per code, so they
  are not given value-based sentences that would be wrong for
  them.
- **Case sets are a presentation grouping, not a new form.**
  `assembleCaseSets` groups bank questions that share a section,
  with at least three questions of at least two subtypes, and
  presents them with their own evidence excerpts as the case
  (grouping by page as well formed almost no sets, because a
  diverse bank spreads its questions across pages). No scenario is invented, and the questions stay
  self-contained, so the case adds context rather than supplying
  missing information.
- **Chronology orders dated events, without printing years.**
  Four date facts from one section become one ordering question:
  events are listed with letters in a shuffled order that is
  never the chronological order, and the options are the
  chronological letter sequence plus three adjacent-swap
  near-misses. An event whose subject contains a year is
  rejected, or ordering would be mechanical sorting. Chronology
  consumes four facts for one question, so it only claims its
  facts first when facts are abundant (at least twice the
  target); on a small source it must not starve the bank.
- **Tables are facts, not a special case.** A pipe-delimited
  table (PDF block format, or rows on separate lines) is parsed
  into one fact per cell, subject = row header, relation =
  column header, object = cell value. A table question shows
  the table in its stem and asks for one cell, with distractors
  from the same column. It passes the same validation as every
  other question, because it is backed by a real extracted fact.
- **Difficulty reflects the task.** Single-value recall is easy;
  a single relation is medium; evaluating several statements,
  ordering events, matching pairs, or judging an
  Assertion-Reason pair is hard. Statement-option and matching
  were therefore moved from medium to hard. The staged banks
  now print difficulty and the true cognitive level (the old
  report printed "understanding" for every production question,
  because it read the wrong field).
- **Coverage first for rare forms.** Selection claims one
  question each from chronology, date, comparison, sequence and
  table forms before the fact-expensive multi-statement and
  Assertion-Reason pass, so a chapter that yields one such
  question actually includes it.
- **Mutated statements must read cleanly.** A false statement
  may only replace a value with a short, non-clausal value (at
  most eight words, no finite verb). A mutated sentence with a
  repeated four-word phrase or a dangling relative ending is
  rejected, and the builder falls back to another variant
  instead of shipping the garbled statement.
- **V2 causal stems must be noun phrases.** "What causes X?"
  is rejected when X starts with a pronoun or possessive with
  no antecedent, or when X is a clause with a finite verb.
  Those items are dropped, not rewritten into a different
  question form.
- **Numeric stems must name a dimension, not a value.** A
  numeric fact whose attribute itself contains a measured value
  ("40°C during the day") is rejected, because its stem asks
  for a measurement for a measurement. A year in the attribute
  ("population in 2020") is a qualifier and is allowed.

## 8. Satisfactory threshold

A bank is satisfactory only when, on a full scan:

- 0 stems contain a source/passage/text reference;
- 0 context-free stems;
- 0 causal items with reversed direction;
- 0 fragment distractors;
- multi-statement patterns vary across banks (not a single repeated
  pattern);
- 0 questions with a correct answer more than 2.5x the median
  distractor length;
- subtype count cap (40% of target) enforced in selection.

If any of those fail, the bank is not satisfactory, however many
questions it contains. Fewer, better questions are the intended
outcome: a source that cannot support a good question must yield no
question for that fact, not a weak one.

## 9. What determinism is, and is not, here

Determinism is not the priority. Variety and quality are. A
deterministic rule that produces a predictable, low-quality bank is
worse than a varied, high-quality bank whose exact output depends on
a rotation or a schema choice. Where a rule helps quality, keep it.
Where it forces predictability (for example, always picking the
first multi-statement variant), change it.
