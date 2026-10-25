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

## 4. Satisfactory threshold

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

## 5. What determinism is, and is not, here

Determinism is not the priority. Variety and quality are. A
deterministic rule that produces a predictable, low-quality bank is
worse than a varied, high-quality bank whose exact output depends on
a rotation or a schema choice. Where a rule helps quality, keep it.
Where it forces predictability (for example, always picking the
first multi-statement variant), change it.
