/**
 * StudySynth Lite — Adaptive Revision Engine Tests
 * Covers card construction, evidence safety, scheduling, session selection,
 * deterministic ordering, persistence, and legacy module support.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running StudySynth Lite Revision Engine Tests ---');

const Revision = require('../engine/revision.js');

const NOW = Date.parse('2026-10-23T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function fact(overrides) {
  return Object.assign({
    fact_id: 'F-1',
    fact_type: 'definition',
    subject: 'Photosynthesis',
    relation: 'definition',
    object: 'the process by which green plants make food using sunlight',
    answer_kind: 'definition',
    extraction_method: 'definition_explicit',
    confidence_class: 'verified',
    conflict_status: 'clear',
    supporting_excerpt: 'Photosynthesis is defined as the process by which green plants make food using sunlight.',
    source_page: 1
  }, overrides || {});
}

function unit(overrides) {
  return Object.assign({
    ku_id: 'KU-LITE-001',
    section_id: 'sec_1',
    section_title: 'Biology',
    statement: 'Photosynthesis is defined as the process by which green plants make food using sunlight.',
    anchor: 'Photosynthesis',
    supporting_excerpt: 'Photosynthesis is defined as the process by which green plants make food using sunlight.',
    source_page: 1,
    source_start: 0,
    source_end: 80,
    fact_ids: ['F-1'],
    fact_types: ['definition'],
    extraction_method: 'definition_explicit',
    confidence_class: 'verified',
    conflict_status: 'clear',
    revision_facts: [fact()]
  }, overrides || {});
}

function moduleWith(inventory, id) {
  return { id: id || 'mod_revision_test', title: 'Revision fixture', inventory: inventory };
}

function forms(items) {
  return items.map((item) => item.form);
}

function answerIsGrounded(card) {
  if (!card.excerpt) return false;
  if (card.excerpt.includes(card.answer)) return true;
  const tokens = String(card.answer).split(/\s*[,→]\s*/).filter((token) => token.length >= 2);
  return tokens.length > 0 && tokens.every((token) => card.excerpt.includes(token));
}

// ---------------------------------------------------------------------------
// 1. Card construction
// ---------------------------------------------------------------------------
console.log('[Test 1] Building evidence-backed cards from typed facts...');
const richInventory = [
  unit(),
  unit({
    ku_id: 'KU-LITE-002',
    statement: 'The Commission was established in 1950.',
    anchor: 'The Commission',
    fact_ids: ['F-2'],
    fact_types: ['date'],
    revision_facts: [fact({
      fact_id: 'F-2',
      fact_type: 'date',
      subject: 'The Commission',
      relation: 'establishment_year',
      object: '1950',
      answer_kind: 'year',
      extraction_method: 'date_event',
      requested_label: 'the establishment year of the Commission',
      supporting_excerpt: 'The Commission was established in 1950.'
    })]
  }),
  unit({
    ku_id: 'KU-LITE-003',
    statement: 'The literacy rate is 45%.',
    anchor: 'The literacy rate',
    fact_ids: ['F-3'],
    fact_types: ['numeric'],
    revision_facts: [fact({
      fact_id: 'F-3',
      fact_type: 'numeric',
      subject: 'the literacy rate',
      relation: 'numeric_value',
      object: '45%',
      attribute: 'the literacy rate',
      answer_kind: 'percentage',
      numeric_kind: 'percentage',
      extraction_method: 'numeric_quantity',
      supporting_excerpt: 'The literacy rate is 45%.'
    })]
  }),
  unit({
    ku_id: 'KU-LITE-004',
    statement: 'The colours are red, green, and blue.',
    anchor: 'The colours',
    fact_ids: ['F-4'],
    fact_types: ['membership'],
    revision_facts: [fact({
      fact_id: 'F-4',
      fact_type: 'membership',
      subject: 'The colours',
      relation: 'members',
      object: 'red, green, blue',
      members: ['red', 'green', 'blue'],
      answer_kind: 'member',
      extraction_method: 'membership_list',
      supporting_excerpt: 'The colours are red, green, and blue.'
    })]
  }),
  unit({
    ku_id: 'KU-LITE-005',
    statement: 'Smoking causes lung damage.',
    anchor: 'Smoking',
    fact_ids: ['F-5'],
    fact_types: ['causal'],
    revision_facts: [fact({
      fact_id: 'F-5',
      fact_type: 'causal',
      subject: 'Smoking',
      relation: 'causes',
      relation_verb: 'causes',
      causal_direction: 'cause_to_effect',
      object: 'lung damage',
      answer_kind: 'effect',
      extraction_method: 'causal_explicit',
      supporting_excerpt: 'Smoking causes lung damage.'
    })]
  }),
  unit({
    ku_id: 'KU-LITE-006',
    statement: 'First collect the sample, then label it, and finally store it.',
    anchor: 'the stated procedure',
    fact_ids: ['F-6'],
    fact_types: ['sequence'],
    revision_facts: [fact({
      fact_id: 'F-6',
      fact_type: 'sequence',
      subject: 'the stated procedure',
      relation: 'sequence',
      object: 'collect the sample → label it → store it',
      sequence_items: ['collect the sample', 'label it', 'store it'],
      answer_kind: 'sequence',
      extraction_method: 'sequence_markers',
      supporting_excerpt: 'First collect the sample, then label it, and finally store it.'
    })]
  }),
  unit({
    ku_id: 'KU-LITE-007',
    statement: 'Gold is heavier than Silver.',
    anchor: 'Gold',
    fact_ids: ['F-7'],
    fact_types: ['comparison'],
    revision_facts: [fact({
      fact_id: 'F-7',
      fact_type: 'comparison',
      subject: 'Gold',
      relation: 'comparison',
      object: 'heavier than Silver',
      comparison: { subject_a: 'Gold', subject_b: 'Silver', direction: 'contrast' },
      answer_kind: 'comparison',
      extraction_method: 'comparison_directional',
      supporting_excerpt: 'Gold is heavier than Silver.'
    })]
  }),
  unit({
    ku_id: 'KU-LITE-008',
    statement: 'The office is located in New Delhi.',
    anchor: 'The office',
    fact_ids: ['F-8'],
    fact_types: ['entity_attribute'],
    revision_facts: [fact({
      fact_id: 'F-8',
      fact_type: 'entity_attribute',
      subject: 'The office',
      relation: 'location',
      object: 'New Delhi',
      answer_kind: 'place',
      extraction_method: 'entity_location',
      supporting_excerpt: 'The office is located in New Delhi.'
    })]
  })
];

const cards = Revision.buildRevisionItems(moduleWith(richInventory));
assert(cards.length >= richInventory.length, 'Every supported fact should yield a card');

const seen = forms(cards);
for (const expected of ['definition', 'date', 'numeric', 'classification', 'causal', 'sequence', 'comparison', 'entity']) {
  assert(seen.includes(expected), `Expected a ${expected} card, saw: ${seen.join(', ')}`);
}
for (const card of cards) {
  assert(card.id && card.moduleId === 'mod_revision_test', 'Cards need stable module-scoped identifiers');
  assert(card.prompt && card.prompt.trim().length > 0, 'Every card needs a prompt');
  assert(card.answer && card.answer.trim().length > 0, 'Every card needs an answer');
  assert(card.statement && card.statement.trim().length > 0, 'Every card keeps the source statement');
  assert(card.excerpt && card.excerpt.trim().length > 0, 'Every card keeps supporting evidence');
  assert(Number.isFinite(card.sourcePage), 'Every card keeps a source page');
  assert(card.sectionTitle, 'Every card keeps a section reference');
  assert(answerIsGrounded(card), `Answer must be grounded in the excerpt: ${card.answer} / ${card.excerpt}`);
  assert(card.factId || card.form === 'source', 'Structured cards retain a fact identity');
}
console.log(`  ✓ ${cards.length} cards built with prompts, answers, and source evidence.`);

// ---------------------------------------------------------------------------
// 2. Conflicts, OCR confidence, and invalid evidence
// ---------------------------------------------------------------------------
console.log('[Test 2] Excluding contradictions, unverified OCR, and invalid evidence...');
const unsafe = Revision.buildRevisionItems(moduleWith([
  unit({
    ku_id: 'KU-CONFLICT',
    conflict_status: 'conflicting',
    revision_facts: [fact({ fact_id: 'F-CONFLICT', conflict_status: 'conflicting' })]
  }),
  unit({
    ku_id: 'KU-OCR',
    confidence_class: 'ocr-unverified',
    revision_facts: [fact({ fact_id: 'F-OCR', confidence_class: 'ocr-unverified' })]
  }),
  unit({
    ku_id: 'KU-BAD',
    statement: 'The scheme expands coverage to all districts.',
    anchor: 'The scheme',
    fact_ids: ['F-BAD'],
    fact_types: ['definition'],
    revision_facts: [fact({
      fact_id: 'F-BAD',
      fact_type: 'definition',
      object: 'a completely invented definition',
      supporting_excerpt: 'The scheme expands coverage to all districts.'
    })]
  })
]));
assert(!unsafe.some((card) => card.kuId === 'KU-CONFLICT'), 'Conflicting knowledge units must be excluded');
assert(!unsafe.some((card) => card.kuId === 'KU-OCR'), 'Unverified OCR units must be excluded');
assert(!unsafe.some((card) => card.factId === 'F-BAD' && card.form !== 'source'), 'Invalid evidence must not produce a structured card');
console.log('  ✓ Unsafe and unverifiable material never becomes a structured prompt.');

// ---------------------------------------------------------------------------
// 3. Only valid forms per fact
// ---------------------------------------------------------------------------
console.log('[Test 3] Not forcing unsupported card forms...');
const definitionOnly = Revision.buildRevisionItems(moduleWith([unit()]));
assert(definitionOnly.length > 0, 'A definition fact should still produce a card');
assert(definitionOnly.every((card) => card.form === 'definition'), 'A definition must not become a date or numeric card');
const locationOnly = Revision.buildRevisionItems(moduleWith([richInventory[7]]));
assert(locationOnly.every((card) => card.form === 'entity'), 'A location fact must stay an entity-attribute card');
console.log('  ✓ Each fact uses only the prompt forms its evidence supports.');

// ---------------------------------------------------------------------------
// 4. Determinism
// ---------------------------------------------------------------------------
console.log('[Test 4] Deterministic card generation and ordering...');
const firstBuild = Revision.buildRevisionItems(moduleWith(richInventory));
const secondBuild = Revision.buildRevisionItems(moduleWith(richInventory));
assert.deepStrictEqual(
  firstBuild.map((card) => [card.id, card.form, card.prompt, card.answer]),
  secondBuild.map((card) => [card.id, card.form, card.prompt, card.answer]),
  'Two builds must produce identical cards and order'
);
console.log('  ✓ Identical inputs produce byte-identical cards.');

// ---------------------------------------------------------------------------
// 5. Scheduling policy
// ---------------------------------------------------------------------------
console.log('[Test 5] Again, Hard, Good, and Easy scheduling...');
const scheduleItem = cards[0];

let progress = {};
progress = Revision.gradeItem(scheduleItem.id, 'good', progress, NOW);
let record = Revision.getItemProgress(scheduleItem.id, progress, NOW);
assert.strictEqual(record.reviews, 1, 'Good records one review');
assert.strictEqual(record.stage, 1, 'Good advances the stage');
assert.strictEqual(record.intervalDays, 1, 'First Good schedules one day');
assert.strictEqual(record.dueAt, NOW + DAY, 'First Good is due in one day');
assert.strictEqual(record.lapses, 0, 'Good is not a lapse');
assert.strictEqual(record.streak, 1, 'Good increments the success streak');

progress = Revision.gradeItem(scheduleItem.id, 'good', progress, NOW + DAY);
record = Revision.getItemProgress(scheduleItem.id, progress, NOW + DAY);
assert.strictEqual(record.intervalDays, 3, 'Second Good schedules three days');
assert.strictEqual(record.dueAt, NOW + DAY + 3 * DAY, 'Second Good is due three days later');
assert.strictEqual(record.stage, 2, 'Second Good advances the stage again');

progress = Revision.gradeItem(scheduleItem.id, 'good', progress, NOW + 4 * DAY);
record = Revision.getItemProgress(scheduleItem.id, progress, NOW + 4 * DAY);
assert.strictEqual(record.intervalDays, 7, 'Third Good multiplies 3 days by 2.2 and rounds');

let easyProgress = Revision.gradeItem(scheduleItem.id, 'easy', {}, NOW);
let easyRecord = Revision.getItemProgress(scheduleItem.id, easyProgress, NOW);
assert.strictEqual(easyRecord.intervalDays, 4, 'First Easy schedules four days');
easyProgress = Revision.gradeItem(scheduleItem.id, 'easy', easyProgress, NOW + 4 * DAY);
easyRecord = Revision.getItemProgress(scheduleItem.id, easyProgress, NOW + 4 * DAY);
assert.strictEqual(easyRecord.intervalDays, 11, 'Second Easy multiplies by 2.8 and rounds');

let hardProgress = Revision.gradeItem(scheduleItem.id, 'good', {}, NOW);
hardProgress = Revision.gradeItem(scheduleItem.id, 'hard', hardProgress, NOW + DAY);
let hardRecord = Revision.getItemProgress(scheduleItem.id, hardProgress, NOW + DAY);
assert.strictEqual(hardRecord.intervalDays, 1, 'Hard never drops below one day');
hardProgress = Revision.gradeItem(scheduleItem.id, 'good', hardProgress, NOW + 2 * DAY);
hardProgress = Revision.gradeItem(scheduleItem.id, 'hard', hardProgress, NOW + 5 * DAY);
hardRecord = Revision.getItemProgress(scheduleItem.id, hardProgress, NOW + 5 * DAY);
assert.strictEqual(hardRecord.intervalDays, 2, 'Hard multiplies the current interval by about 1.2');

const againProgress = Revision.gradeItem(scheduleItem.id, 'again', progress, NOW);
const againRecord = Revision.getItemProgress(scheduleItem.id, againProgress, NOW);
assert.strictEqual(againRecord.lapses, (record.lapses || 0) + 1, 'Again records a lapse');
assert.strictEqual(againRecord.stage, 0, 'Again resets the successful stage count');
assert.strictEqual(againRecord.streak, 0, 'Again resets the success streak');
assert.strictEqual(againRecord.dueAt, NOW + 10 * MINUTE, 'Again schedules ten minutes later');
assert.strictEqual(againRecord.lastRating, 'again', 'Again is stored as the latest rating');

let clamped = {};
for (let i = 0; i < 20; i++) clamped = Revision.gradeItem(scheduleItem.id, 'easy', clamped, NOW);
assert(Revision.getItemProgress(scheduleItem.id, clamped, NOW).intervalDays <= 365, 'Intervals clamp at 365 days');
console.log('  ✓ Fixed intervals, lapse resets, and the 365-day clamp hold.');

// ---------------------------------------------------------------------------
// 6. Due detection
// ---------------------------------------------------------------------------
console.log('[Test 6] Due detection at the exact timestamp...');
const dueProgress = Revision.gradeItem(scheduleItem.id, 'again', {}, NOW);
assert.strictEqual(Revision.getItemProgress(scheduleItem.id, dueProgress, NOW + 10 * MINUTE - 1).due, false, 'Not due one millisecond before');
assert.strictEqual(Revision.getItemProgress(scheduleItem.id, dueProgress, NOW + 10 * MINUTE).due, true, 'Due exactly at the timestamp');
assert.strictEqual(Revision.getItemProgress(scheduleItem.id, dueProgress, NOW + 10 * MINUTE + 1).due, true, 'Due after the timestamp');
assert.strictEqual(Revision.getItemProgress('unknown-item', {}, NOW).isNew, true, 'Unknown items are new');
console.log('  ✓ Due status is computed from persisted timestamps.');

// ---------------------------------------------------------------------------
// 7. Again requeue
// ---------------------------------------------------------------------------
console.log('[Test 7] Again cards reappear once, never in a loop...');
let session = Revision.buildSession(cards, {}, [], { now: NOW, size: 4, moduleId: 'mod_revision_test' });
assert.strictEqual(session.itemIds.length, 4, 'A four-item session selects four cards');
const firstId = session.itemIds[0];
let ratingResult = Revision.rateSessionItem(session, firstId, 'again', {}, NOW);
session = ratingResult.session;
assert.strictEqual(session.itemIds[session.itemIds.length - 1], firstId, 'An Again card is appended near the end');
assert.strictEqual(session.requeued[firstId], true, 'The requeue is recorded');
assert.strictEqual(session.counts.again, 1, 'Again is counted');

let guard = 0;
while (!session.completed && guard < 20) {
  const currentId = session.itemIds[session.cursor];
  const rating = currentId === firstId ? 'again' : 'good';
  const step = Revision.rateSessionItem(session, currentId, rating, ratingResult.progress, NOW + (guard + 1) * MINUTE);
  session = step.session;
  ratingResult = step;
  guard++;
}
assert(session.completed, 'The session completes');
assert.strictEqual(session.itemIds.filter((id) => id === firstId).length, 2, 'The Again card appears at most twice in one session');
assert.strictEqual(session.counts.again, 2, 'Both Again attempts are counted');
assert(guard <= 6, 'The requeue cannot loop endlessly');

const singleSession = Revision.buildSession([cards[0]], {}, [], { now: NOW, size: 1 });
const singleFirst = singleSession.itemIds[0];
const firstStep = Revision.rateSessionItem(singleSession, singleFirst, 'again', {}, NOW);
const secondStep = Revision.rateSessionItem(firstStep.session, singleFirst, 'again', firstStep.progress, NOW + MINUTE);
assert(secondStep.session.completed, 'Rated Again twice, the card is not requeued a third time');
console.log('  ✓ Again-rated cards reappear once and then complete.');

// ---------------------------------------------------------------------------
// 8. Priority selection
// ---------------------------------------------------------------------------
console.log('[Test 8] Failed and overdue material outranks new material...');
const weakItem = cards[0];
const newItem = cards[1];
const weakProgress = Revision.gradeItem(weakItem.id, 'again', {}, NOW - 60 * MINUTE);
const prioritySession = Revision.buildSession([newItem, weakItem], weakProgress, [], {
  now: NOW,
  size: 1,
  moduleId: 'mod_revision_test'
});
assert.strictEqual(prioritySession.itemIds[0], weakItem.id, 'A lapsed due card must be selected before a new card');

const longerOverdue = cards[2];
const shorterOverdue = cards[3];
let overdueProgress = {};
overdueProgress = Revision.gradeItem(longerOverdue.id, 'again', overdueProgress, NOW - 3 * 60 * MINUTE);
overdueProgress = Revision.gradeItem(shorterOverdue.id, 'again', overdueProgress, NOW - 60 * MINUTE);
const overdueSession = Revision.buildSession([shorterOverdue, longerOverdue], overdueProgress, [], {
  now: NOW,
  size: 1,
  moduleId: 'mod_revision_test'
});
assert.strictEqual(overdueSession.itemIds[0], longerOverdue.id, 'The longest overdue card wins the tie-break');
console.log('  ✓ Lapsed and long-overdue items lead the queue.');

// ---------------------------------------------------------------------------
// 9. Composition and backfill
// ---------------------------------------------------------------------------
console.log('[Test 9] Session composition backfills without duplicates...');
const newOnly = Revision.buildSession(cards.slice(0, 3), {}, [], { now: NOW, size: 10, moduleId: 'mod_revision_test' });
assert.strictEqual(newOnly.itemIds.length, 3, 'A short new pool backfills to the available size');
assert.strictEqual(new Set(newOnly.itemIds).size, 3, 'Backfill never duplicates cards');

let dueOnlyProgress = {};
cards.slice(0, 8).forEach((card, index) => {
  dueOnlyProgress = Revision.gradeItem(card.id, 'again', dueOnlyProgress, NOW - (index + 1) * 60 * MINUTE);
});
const dueOnly = Revision.buildSession(cards.slice(0, 8), dueOnlyProgress, [], { now: NOW, size: 10, moduleId: 'mod_revision_test' });
assert.strictEqual(dueOnly.itemIds.length, 8, 'An eight-card pool cannot become ten');
assert.strictEqual(new Set(dueOnly.itemIds).size, 8, 'A larger session never duplicates items');

const mixedProgress = Revision.gradeItem(cards[0].id, 'again', {}, NOW - 60 * MINUTE);
const mixed = Revision.buildSession(cards, mixedProgress, [], { now: NOW, size: 10, moduleId: 'mod_revision_test' });
assert(mixed.itemIds.length <= 10, 'Sessions never exceed the requested size');
assert.strictEqual(new Set(mixed.itemIds).size, mixed.itemIds.length, 'No card is duplicated to fill a session');
console.log('  ✓ Targets backfill honestly and short decks stay short.');

// ---------------------------------------------------------------------------
// 10. Attempt-driven weakness
// ---------------------------------------------------------------------------
console.log('[Test 10] Wrong exam answers raise the associated fact priority...');
const attemptQuestion = {
  id: 'q_1',
  answer_key: 'B',
  knowledge_units: [{ ku_id: 'KU-LITE-001', fact_id: 'F-1' }]
};
const attempts = [{
  id: 'attempt_1',
  moduleId: 'mod_revision_test',
  answers: { q_1: 'A' }
}];
const attemptSession = Revision.buildSession([cards[1], cards[0]], {}, attempts, {
  now: NOW,
  size: 1,
  moduleId: 'mod_revision_test',
  questions: [attemptQuestion]
});
assert.strictEqual(attemptSession.itemIds.length, 1, 'A one-item session selects one card');
assert.strictEqual(attemptSession.itemIds[0], cards[0].id, 'The fact behind a wrong answer is prioritised');
console.log('  ✓ Saved exam mistakes increase revision priority for the linked fact.');

// ---------------------------------------------------------------------------
// 11. Dashboard statistics and session summary
// ---------------------------------------------------------------------------
console.log('[Test 11] Transparent dashboard and session summaries...');
let statsProgress = {};
statsProgress = Revision.gradeItem(cards[0].id, 'again', statsProgress, NOW - 60 * MINUTE);
statsProgress = Revision.gradeItem(cards[1].id, 'good', statsProgress, NOW - 2 * DAY);
statsProgress = Revision.gradeItem(cards[2].id, 'good', statsProgress, NOW - 10 * DAY);
statsProgress = Revision.gradeItem(cards[2].id, 'good', statsProgress, NOW - 9 * DAY);
statsProgress = Revision.gradeItem(cards[2].id, 'good', statsProgress, NOW - 6 * DAY);
const stats = Revision.getModuleRevisionStats(cards.slice(0, 5), statsProgress, NOW);
assert.strictEqual(stats.total, 5, 'Total counts every valid item');
assert.strictEqual(stats.due, 2, 'Due counts lapsed and overdue reviewed items'); // cards[0] and cards[1]
assert.strictEqual(stats.newItems, 2, 'New counts unreviewed items');
assert.strictEqual(stats.learning, 2, 'Learning counts relearning and reviewed items that are not yet consistent');
assert.strictEqual(stats.consistent, 1, 'Consistently recalled counts long success streaks');

const summarySession = Revision.buildSession([cards[0]], {}, [], { now: NOW, size: 1 });
let summaryStep = Revision.rateSessionItem(summarySession, cards[0].id, 'hard', {}, NOW);
const summary = Revision.getSessionSummary(summaryStep.session, summaryStep.progress, NOW);
assert.strictEqual(summary.reviewed, 1, 'Session summary counts reviews');
assert.strictEqual(summary.counts.hard, 1, 'Session summary counts each rating');
assert.strictEqual(summary.completed, true, 'Session summary knows when the session is complete');
assert(summary.nextDueAt >= NOW, 'Session summary reports the next due timestamp');
console.log('  ✓ Dashboard and session summaries use transparent counts.');

// ---------------------------------------------------------------------------
// 12. Legacy modules
// ---------------------------------------------------------------------------
console.log('[Test 12] Legacy modules without typed facts stay usable...');
const legacyCards = Revision.buildRevisionItems(moduleWith([{
  ku_id: 'KU-LITE-900',
  section_id: 'sec_legacy',
  section_title: 'Legacy notes',
  statement: 'The Supreme Court held that internet access is a fundamental right.',
  anchor: 'The Supreme Court',
  supporting_excerpt: 'The Supreme Court held that internet access is a fundamental right.',
  source_page: 4,
  source_start: 10,
  source_end: 80,
  fact_ids: ['F-900'],
  fact_types: ['fallback'],
  extraction_method: 'fallback',
  confidence_class: 'verified',
  conflict_status: 'clear'
}], 'mod_legacy'));
assert.strictEqual(legacyCards.length, 1, 'Legacy source text still yields a revision card');
const legacyCard = legacyCards[0];
assert(['source', 'cloze'].includes(legacyCard.form), 'Legacy content is labelled as source recall or cloze');
assert.strictEqual(legacyCard.excerpt, 'The Supreme Court held that internet access is a fundamental right.', 'Legacy evidence is preserved');
assert.strictEqual(legacyCard.sourcePage, 4, 'Legacy page references survive');
assert(legacyCard.prompt && legacyCard.answer, 'Legacy cards still have a prompt and answer');

const emptyLegacy = Revision.buildRevisionItems(moduleWith([{ ku_id: 'KU-EMPTY', fact_ids: [] }], 'mod_empty'));
assert.strictEqual(emptyLegacy.length, 0, 'Empty legacy units produce no cards');
console.log('  ✓ Pre-existing saved modules remain revision-ready.');

// ---------------------------------------------------------------------------
// 13. Persistence and module isolation
// ---------------------------------------------------------------------------
console.log('[Test 13] Persisting progress, sessions, and module isolation...');
const memory = Object.create(null);
global.localStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
  setItem(key, value) { memory[key] = String(value); },
  removeItem(key) { delete memory[key]; }
};
const storageModulePath = require.resolve('../engine/storage.js');
delete require.cache[storageModulePath];
const Storage = require('../engine/storage.js');

(async () => {
  await Storage.saveModule({ id: 'mod_revision_test', title: 'Revision fixture', inventory: richInventory, questions: [] });
  await Storage.saveModule({ id: 'mod_other_test', title: 'Other fixture', inventory: richInventory, questions: [] });

  let savedProgress = Revision.gradeItem(cards[0].id, 'good', {}, NOW);
  const savedRecord = Revision.getItemProgress(cards[0].id, savedProgress, NOW);
  await Storage.saveRevisionProgress(savedRecord);
  const loadedProgress = await Storage.getRevisionProgress('mod_revision_test');
  assert.strictEqual(loadedProgress[cards[0].id].reviews, 1, 'Rating is persisted immediately');
  assert.strictEqual(loadedProgress[cards[0].id].dueAt, NOW + DAY, 'Persisted due timestamp survives a reload');

  const persistedSession = Revision.buildSession(cards, savedProgress, [], { now: NOW, size: 3, moduleId: 'mod_revision_test' });
  const rated = Revision.rateSessionItem(persistedSession, persistedSession.itemIds[0], 'hard', savedProgress, NOW);
  await Storage.saveRevisionSession(rated.session);
  await Storage.saveRevisionProgress(Revision.getItemProgress(rated.session.itemIds[0], rated.progress, NOW));
  const reloadedSession = await Storage.getRevisionSession('mod_revision_test');
  assert.strictEqual(reloadedSession.cursor, 1, 'A reload restores the active session position');
  assert.strictEqual(reloadedSession.reviewed[persistedSession.itemIds[0]], 'hard', 'A reload restores the submitted rating');

  const otherProgress = await Storage.getRevisionProgress('mod_other_test');
  assert.deepStrictEqual(otherProgress, {}, 'Another module never sees this module progress');
  const missingSession = await Storage.getRevisionSession('mod_other_test');
  assert.strictEqual(missingSession, null, 'Another module never sees this module session');

  await Storage.deleteModule('mod_revision_test');
  const afterDelete = await Storage.getRevisionProgress('mod_revision_test');
  assert.deepStrictEqual(afterDelete, {}, 'Deleting a module removes its revision progress');
  assert.strictEqual(await Storage.getRevisionSession('mod_revision_test'), null, 'Deleting a module removes its session');

  assert(/revisionProgress/.test(fs.readFileSync(path.join(__dirname, '..', 'engine', 'storage.js'), 'utf-8')), 'Storage must declare a revision progress store');
  console.log('  ✓ Progress and sessions persist, restore, isolate by module, and clean up on delete.');

  // Test 14: same fact identity in two modules cannot collide.
  console.log('[Test 14] Stable IDs keep module progress independent...');
  const moduleA = Revision.buildRevisionItems(moduleWith([unit()], 'mod_a'));
  const moduleB = Revision.buildRevisionItems(moduleWith([unit()], 'mod_b'));
  assert.notStrictEqual(moduleA[0].id, moduleB[0].id, 'Identical facts in different modules get different IDs');
  const progressA = Revision.gradeItem(moduleA[0].id, 'good', {}, NOW);
  const progressB = Revision.gradeItem(moduleB[0].id, 'again', {}, NOW);
  const merged = Object.assign({}, progressA, progressB);
  assert.strictEqual(Revision.getItemProgress(moduleA[0].id, merged, NOW).lastRating, 'good', 'Module A keeps its own rating');
  assert.strictEqual(Revision.getItemProgress(moduleB[0].id, merged, NOW).lastRating, 'again', 'Module B keeps its own rating');
  console.log('  ✓ Revision identity includes the module, so queues never mix.');

  // Test 15: real pipeline output survives a save/reload round trip.
  console.log('[Test 15] Generated modules keep typed facts across a save round trip...');
  const Analysis = require('../engine/analyze.js');
  const sourceText = [
    '# Constitutional Framework',
    'The Constituent Assembly adopted the Constitution on 26 November 1949.',
    'Federalism is defined as the division of powers between the union and the states.'
  ].join('\n');
  const analyzed = Analysis.analyzeSource(sourceText, 'Constitutional Framework', null, 15);
  const roundTripped = JSON.parse(JSON.stringify(analyzed.inventory));
  assert(roundTripped.every((unit) => Array.isArray(unit.revision_facts)), 'Every saved unit keeps a serializable fact list');
  const storedFacts = roundTripped.reduce((sum, unit) => sum + unit.revision_facts.length, 0);
  assert(storedFacts > 0, 'Typed facts survive saving');
  const structural = Revision.buildRevisionItems(moduleWith(roundTripped, 'mod_round_trip'));
  assert(structural.length > 0, 'A saved module still builds revision cards');
  assert(structural.some((card) => card.factId && card.form !== 'source'), 'Structured prompts survive the round trip');
  console.log(`  ✓ ${storedFacts} facts survived the round trip and produced structured prompts.`);

  console.log('\n==========================================');
  console.log('ALL REVISION ENGINE TESTS PASSED');
  console.log('==========================================');
})().catch((err) => {
  console.error('\nREVISION TEST FAILURE');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
