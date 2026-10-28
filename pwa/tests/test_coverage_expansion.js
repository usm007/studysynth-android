// StudySynth Coverage Expansion tests — membership-list, caption
// view-subject, has-list, showcases, made-of and designed-include
// recovery, plus the isFragmentPhrase apostrophe fix.
// Self-contained: every fixture is inline. No fixture depends on a
// machine path or on an external PDF (PDF-backed measurement lives in
// diagnostics/COVERAGE_EXPANSION_RESULTS.md, not here).
// Run as: node tests/test_coverage_expansion.js  (from pwa/) or via npm test.
'use strict';
const assert = require('node:assert');
const Engine = require('../engine/generator.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

function unit(id, type, text, extra) {
  return Object.assign({
    unit_id: id, type: type, text: text, pages: [1], block_ids: ['b1'],
    section_id: 's1', section_title: 'T'
  }, extra || {});
}
function run(units, options) {
  return Engine.buildTypedKnowledgeFromReconstructedUnits(units, options);
}
function factsByMethod(result, method) {
  return result.typed_facts.filter((f) => f.classification.method === method);
}

// ---- Membership lists (parenthetical subject, clause tails) ----

const COMMON = 'Common features (also found in some of the larger mosques, as we saw) included arches, floral motifs, latticework, and calligraphy of verses from the Qur’an.';

check('CE membership: parenthetical subject stripped, full list incl. Qur’an member', () => {
  const r = run([unit('RU-001', 'body_prose', COMMON)]);
  const mem = factsByMethod(r, 'membership_list_ce');
  assert.strictEqual(mem.length, 1);
  assert.strictEqual(mem[0].subject, 'Common features');
  assert.deepStrictEqual(mem[0].qualifiers.members,
    ['arches', 'floral motifs', 'latticework', 'calligraphy of verses from the Qur’an']);
  assert.strictEqual(mem[0].evidence, COMMON);
  assert.ok(mem[0].derivation.parenthetical_removed.indexOf('also found') !== -1);
});

check('CE membership: trailing all-of-which clause truncated, not a member', () => {
  // The long parenthetical forces the layer to leave this unparsed
  // (a clean list would be typed by the layer itself, so the
  // supplementary producer would never run); the truncation below is
  // then the producer's own work, not the layer's.
  const r = run([unit('RU-001', 'body_prose',
    'Common features (also found in some of the larger mosques, as we saw) included arches, domes, and screens, all of which are old.')]);
  const mem = factsByMethod(r, 'membership_list_ce');
  assert.strictEqual(mem.length, 1);
  assert.strictEqual(mem[0].subject, 'Common features');
  assert.deepStrictEqual(mem[0].qualifiers.members, ['arches', 'domes', 'screens']);
  assert.strictEqual(mem[0].derivation.clause_truncation, 'all_of_which');
});

check('CE membership: trailing also stripped from subject', () => {
  // Parenthetical + tail force the layer to leave this unparsed, so
  // the also-strip below is the producer's own work, not the layer's.
  const r = run([unit('RU-001', 'body_prose',
    'The complex (in the old city, as we saw) also includes elegant arches, domes, and screens, all of which are old.')]);
  const mem = factsByMethod(r, 'membership_list_ce');
  assert.strictEqual(mem.length, 1);
  assert.strictEqual(mem[0].subject, 'The complex');
  assert.strictEqual(mem[0].derivation.also_stripped, true);
  assert.strictEqual(mem[0].derivation.clause_truncation, 'all_of_which');
});

check('CE membership: member containing a verb stays unparsed, never mis-split', () => {
  // The long parenthetical forces the layer to leave this unparsed,
  // so the member-verb guard below is the producer's own decision.
  const r = run([unit('RU-001', 'body_prose',
    'Common features (also found in some of the larger mosques, as we saw) included arches that shine, domes, and screens.')]);
  assert.strictEqual(factsByMethod(r, 'membership_list_ce').length, 0);
  assert.strictEqual(factsByMethod(r, 'includes_attribute_ce').length, 0);
});

check('CE membership: covers verb is excluded from rescue', () => {
  // The parenthetical forces the layer to leave this unparsed, so the
  // absence below is the producer's own exclusion, not the layer's.
  const r = run([unit('RU-001', 'body_prose',
    'The chapter (in this section, as we saw) covers arches, domes, and screens.')]);
  assert.strictEqual(factsByMethod(r, 'membership_list_ce').length, 0);
});

check('CE membership: unclosed parenthetical subject stays unparsed', () => {
  // "as we saw" forces the layer to leave this unparsed, so the
  // unbalanced-parens rejection below is the producer's own gate.
  const r = run([unit('RU-001', 'body_prose',
    'Common features (also found in some of the larger mosques, as we saw includes arches and domes.')]);
  assert.strictEqual(factsByMethod(r, 'membership_list_ce').length, 0);
});

// ---- Single-item includes attribute ----

const INCL = 'The complex also includes elegant chhatrīs (cenotaphs in the shape of a parasol) on the riverbank, and is connected to the town’s famous Ram Raja Temple.';

check('CE includes: single object with trailing clause truncated', () => {
  const r = run([unit('RU-001', 'body_prose', INCL)]);
  const inc = factsByMethod(r, 'includes_attribute_ce');
  assert.strictEqual(inc.length, 1);
  assert.strictEqual(inc[0].subject, 'The complex');
  assert.strictEqual(inc[0].object, 'elegant chhatrīs (cenotaphs in the shape of a parasol) on the riverbank');
  assert.strictEqual(inc[0].derivation.clause_truncation, 'and_finite_verb');
  assert.strictEqual(factsByMethod(r, 'membership_list_ce').length, 0);
});

check('CE includes: multi-member list does not double-type as an attribute', () => {
  // The parenthetical forces the layer to leave this unparsed; the
  // membership producer then fires and the attribute producer must
  // stay silent on the same segment.
  const r = run([unit('RU-001', 'body_prose',
    'The complex (in the old city, as we saw) includes arches, domes, and screens.')]);
  assert.strictEqual(factsByMethod(r, 'membership_list_ce').length, 1);
  assert.strictEqual(factsByMethod(r, 'includes_attribute_ce').length, 0);
});

// ---- Features lists ----

check('CE features: dash count phrase dropped, list members kept', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The complex features three main palaces —Raja Mahal, Jahangir Mahal, and Rai Praveen Mahal.')]);
  const feat = factsByMethod(r, 'features_list_ce');
  assert.strictEqual(feat.length, 1);
  assert.strictEqual(feat[0].subject, 'The complex');
  assert.deepStrictEqual(feat[0].qualifiers.members,
    ['Raja Mahal', 'Jahangir Mahal', 'Rai Praveen Mahal']);
  assert.strictEqual(feat[0].derivation.count_phrase, 'three main palaces');
});

check('CE features: comma list without a dash types', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The hall features domes, arches, and screens.')]);
  assert.strictEqual(factsByMethod(r, 'features_list_ce').length, 1);
});

check('CE features: single object is not a list', () => {
  const r = run([unit('RU-001', 'body_prose', 'The temple features a dome.')]);
  assert.strictEqual(factsByMethod(r, 'features_list_ce').length, 0);
});

check('CE features: fused alongside phrase without comma or dash stays unparsed', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The facade features screens alongside carvings and pillars.')]);
  assert.strictEqual(factsByMethod(r, 'features_list_ce').length, 0);
});

// ---- Showcases ----

check('CE showcases: blend object types with a clean subject', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The Jahangir Mahal (Fig. 3.39), built to commemorate Emperor Jahangir’s visit, showcases a blend of Rajput and Mughal architectural styles.')]);
  const show = factsByMethod(r, 'showcases_ce');
  assert.strictEqual(show.length, 1);
  assert.strictEqual(show[0].subject, 'The Jahangir Mahal');
  assert.strictEqual(show[0].object, 'a blend of Rajput and Mughal architectural styles');
  assert.ok(show[0].derivation.participial_removed.indexOf('built to commemorate') !== -1);
});

check('CE showcases: object with a clause marker stays unparsed', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The hall showcases styles which are old.')]);
  assert.strictEqual(factsByMethod(r, 'showcases_ce').length, 0);
});

// ---- Has lists (explicit subject + pronoun chain) ----

check('CE has-list: Within prefix stripped, four members kept', () => {
  const r = run([unit('RU-001', 'body_prose',
    'Within the fort complex, a large palace (Fig. 3.34) has several areas for the royalty, separate quarters for the men and women, living quarters for the staff, and stables and barracks.')]);
  const has = factsByMethod(r, 'has_list_ce');
  assert.strictEqual(has.length, 1);
  assert.strictEqual(has[0].subject, 'a large palace');
  assert.deepStrictEqual(has[0].qualifiers.members,
    ['several areas for the royalty', 'separate quarters for the men and women',
     'living quarters for the staff', 'stables and barracks']);
  assert.strictEqual(has[0].derivation.within_prefix_stripped, 'Within the fort complex');
});

check('CE has-list: bare pair stays with has_attribute, never duplicates', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The hall has pillars and arches.')]);
  assert.strictEqual(factsByMethod(r, 'has_list_ce').length, 0);
  assert.strictEqual(factsByMethod(r, 'has_attribute').length, 2);
});

check('CE has-list: pronoun chain resolves from the immediately preceding segment', () => {
  const text = 'The Jahangir Mahal (Fig. 3.39), built to commemorate Emperor Jahangir’s visit, showcases a blend of Rajput and Mughal architectural styles. '
    + 'It has ornate chambers, intricate stone carvings, and beautiful courtyards.';
  const r = run([unit('RU-001', 'body_prose', text)]);
  const has = factsByMethod(r, 'has_list_ce');
  assert.strictEqual(has.length, 1);
  assert.strictEqual(has[0].subject, 'The Jahangir Mahal');
  assert.deepStrictEqual(has[0].qualifiers.members,
    ['ornate chambers', 'intricate stone carvings', 'beautiful courtyards']);
  assert.strictEqual(has[0].derivation.pronoun_resolution.antecedent_text, 'The Jahangir Mahal');
  assert.strictEqual(has[0].derivation.immediate_predecessor_only, true);
});

check('CE has-list: pronoun with a distant antecedent stays unresolved, never guessed', () => {
  const text = 'The complex features three main palaces —Raja Mahal, Jahangir Mahal, and Rai Praveen Mahal. '
    + 'The halls were large and airy. '
    + 'It has ornate chambers, intricate stone carvings, and beautiful courtyards.';
  const r = run([unit('RU-001', 'body_prose', text)]);
  assert.strictEqual(factsByMethod(r, 'has_list_ce').length, 0);
  assert.strictEqual(factsByMethod(r, 'has_attribute').length, 0);
  assert.strictEqual(factsByMethod(r, 'features_list_ce').length, 1);
});

check('CE has-list: pronoun pair with an immediate antecedent types via has_attribute', () => {
  const text = 'The Jahangir Mahal showcases a blend of styles. '
    + 'It has ornate chambers and beautiful courtyards.';
  const r = run([unit('RU-001', 'body_prose', text)]);
  const has = factsByMethod(r, 'has_attribute');
  assert.strictEqual(has.length, 2);
  assert.ok(has.every((f) => f.subject === 'The Jahangir Mahal'));
  assert.strictEqual(has[0].derivation.immediate_predecessor_only, true);
});

// ---- Made-of + designed-include chain ----

check('CE made-of: material truncated at the following clause', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The historical Red Fort at Agra (not be mistaken for Delhi’s Red Fort) was originally made of brick, and had fallen to ruin when Akbar decided to make his capital there and rebuild the fort.')]);
  const made = factsByMethod(r, 'made_of_ce');
  assert.strictEqual(made.length, 1);
  assert.strictEqual(made[0].subject, 'The historical Red Fort at Agra');
  assert.strictEqual(made[0].object, 'brick');
  assert.strictEqual(made[0].derivation.clause_truncation, 'and_finite_verb');
});

check('CE made-of: object carrying a clause marker stays unparsed', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The fort was made of bricks that were fired.')]);
  assert.strictEqual(factsByMethod(r, 'made_of_ce').length, 0);
});

check('CE designed-include: pronoun chain types the full list', () => {
  const text = 'The historical Red Fort at Agra (not be mistaken for Delhi’s Red Fort) was originally made of brick, and had fallen to ruin when Akbar decided to make his capital there and rebuild the fort. '
    + 'It was designed to include palaces and gardens, living quarters, halls for public and private audiences, and living quarters for the maids and other servants.';
  const r = run([unit('RU-001', 'body_prose', text)]);
  const des = factsByMethod(r, 'designed_include_ce');
  assert.strictEqual(des.length, 1);
  assert.strictEqual(des[0].subject, 'The historical Red Fort at Agra');
  assert.deepStrictEqual(des[0].qualifiers.members,
    ['palaces and gardens', 'living quarters', 'halls for public and private audiences',
     'living quarters for the maids and other servants']);
});

check('CE designed-include: single member stays unparsed', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The fort was designed to include a palace.')]);
  assert.strictEqual(factsByMethod(r, 'designed_include_ce').length, 0);
});

// ---- Caption view-subject correction ----

check('CE caption: view-of completion date corrected to the depicted building', () => {
  const r = run([unit('RU-001', 'caption',
    'Fig. 3.52. A general view of the Madras High Court, completed in 1892. The red sandstone facade features Islamic arches and intricate screens alongside carvings and pillars in Hindu temple style.',
    { figure_ref: 'fig 3.52' })]);
  const corr = factsByMethod(r, 'caption_view_subject_correction');
  assert.strictEqual(corr.length, 1);
  assert.strictEqual(corr[0].subject, 'the Madras High Court');
  assert.strictEqual(corr[0].relation, 'completion_year');
  assert.strictEqual(corr[0].object, '1892');
  assert.strictEqual(corr[0].evidence, 'A general view of the Madras High Court, completed in 1892.');
  assert.strictEqual(corr[0].source.evidence_source, 'caption');
  assert.strictEqual(corr[0].derivation.original_subject, 'A general view of the Madras High Court');
  // The original view-subject fact is kept (prefiltered downstream), never removed.
  assert.ok(r.typed_facts.some((f) => f.subject === 'A general view of the Madras High Court'));
});

check('CE caption: sketch subject is never view-corrected', () => {
  const r = run([unit('RU-001', 'caption',
    'A sketch made in 1809 by a British army officer shows the mosque’s full-size minarets.',
    { figure_ref: 'fig 3.29' })]);
  assert.strictEqual(factsByMethod(r, 'caption_view_subject_correction').length, 0);
});

check('CE caption: view-of date in body prose is never corrected', () => {
  const r = run([unit('RU-001', 'body_prose',
    'A general view of the Madras High Court, completed in 1892.')]);
  assert.strictEqual(factsByMethod(r, 'caption_view_subject_correction').length, 0);
});

check('CE caption: close-up caption binds nothing to the court', () => {
  const r = run([unit('RU-001', 'caption',
    'Fig. 3.53. A close-up of its domes and towers.',
    { figure_ref: 'fig 3.53' })]);
  assert.strictEqual(factsByMethod(r, 'caption_view_subject_correction').length, 0);
  assert.ok(!r.typed_facts.some((f) => /domes/.test(f.object || '')));
});

// ---- isFragmentPhrase apostrophe fix ----

check('CE fragment gate: list ending in Qur’an is a genuine list, not a fragment', () => {
  // The parenthetical forces the layer to leave this unparsed, so the
  // rescue below proves the apostrophe fix in the fragment gate:
  // without it, classifyTypedDraft would reject the joined object
  // for its trailing "an" inside "Qur’an".
  const r = run([unit('RU-001', 'body_prose',
    'Common features (also found in some of the larger mosques, as we saw) included arches and calligraphy from the Qur’an.')]);
  const mem = factsByMethod(r, 'membership_list_ce');
  assert.strictEqual(mem.length, 1);
  assert.deepStrictEqual(mem[0].qualifiers.members, ['arches', 'calligraphy from the Qur’an']);
});

check('CE fragment gate: genuinely dangling article is still rejected', () => {
  // The "pillars" draft types; only the dangling "an" draft is
  // rejected by the fragment gate, so exactly one fact survives.
  const r = run([unit('RU-001', 'body_prose', 'The hall has pillars and an.')]);
  const has = factsByMethod(r, 'has_attribute');
  assert.strictEqual(has.length, 1);
  assert.strictEqual(has[0].object, 'pillars');
});

// ---- Validator apostrophe fix (same artifact as isFragmentPhrase) ----

function validatorCandidate(excerpt) {
  return {
    question_subtype: 'classification_membership',
    stem: 'Which of the following is included in Common features?',
    options: [
      { key: 'A', text: 'arches', is_correct: true, distractor_origin: 'source_member_pool' },
      { key: 'B', text: 'domes', is_correct: false, distractor_origin: 'source_member_pool' },
      { key: 'C', text: 'screens', is_correct: false, distractor_origin: 'source_member_pool' },
      { key: 'D', text: 'minarets', is_correct: false, distractor_origin: 'source_member_pool' }
    ],
    answer_key: 'A', expected_answer: 'arches',
    explanation: 'The source states: “' + excerpt + '”',
    supporting_excerpt: excerpt,
    evidence: { fact_ids: [] }
  };
}

check('CE validator: excerpt ending in Qur’an is complete, not a fragment', () => {
  const v = Engine.validateQuestion(
    validatorCandidate('Common features included arches, floral motifs, latticework, and calligraphy of verses from the Qur’an.'),
    [], {});
  assert.ok(!v.issues.some((i) => i.rule === 'fragment_excerpt'),
    'Qur’an excerpt must not be a fragment: ' + JSON.stringify(v.issues));
});

check('CE validator: excerpt ending in a genuine dangling word is still a fragment', () => {
  const v = Engine.validateQuestion(
    validatorCandidate('The hall includes arches, domes, and an.'),
    [], {});
  assert.ok(v.issues.some((i) => i.rule === 'fragment_excerpt'),
    'dangling excerpt must be a fragment: ' + JSON.stringify(v.issues));
});

// ---- List-member hygiene: the 2026-10-27 corpus defects ----
// Four staging questions were wrong because comma lists were typed
// without member hygiene: a negated possession ("has no power")
// became a member, a discourse connective and a modal consequence
// clause became members, a purpose infinitive became a member, and
// an adjective ("very deep") became a member — and the maker chose
// it as the answer. Each defect sentence must now type nothing.

check('CE list hygiene: negated has list ("has no power") types nothing', () => {
  const r = run([unit('RU-001', 'body_prose',
    'A mediator has no power to make any decision, or impose a view on the parties.')]);
  assert.strictEqual(factsByMethod(r, 'has_list_ce').length, 0);
  assert.ok(!r.typed_facts.some((f) => (f.qualifiers.members || []).some((m) => /no power/.test(m))),
    'negated possession must never be a member: ' + JSON.stringify(r.typed_facts.map((f) => f.qualifiers.members)));
});

check('CE list hygiene: connective + modal consequence clause types nothing', () => {
  const r = run([unit('RU-001', 'body_prose',
    'Society has many complex interactions happening all the time, both personal and professional, therefore, disagreements and disputes may arise from diverse contexts and situations.')]);
  assert.strictEqual(factsByMethod(r, 'has_list_ce').length, 0);
  assert.ok(!r.typed_facts.some((f) => (f.qualifiers.members || []).some((m) => /^(therefore|both personal|professional)$/.test(m))),
    'connective/correlative fragments must never be members');
});

check('CE list hygiene: purpose-infinitive member types nothing', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The Supreme Court has an extraordinary discretionary jurisdiction to grant Special Leave to Appeal from any judgment, decree or order made by any court, or to do substantive justice between the parties.')]);
  assert.strictEqual(factsByMethod(r, 'has_list_ce').length, 0);
});

check('CE list hygiene: intensifier adjective member types nothing', () => {
  const r = run([unit('RU-001', 'body_prose',
    'The seafloor has very deep, V-shaped areas called trenches.')]);
  assert.strictEqual(factsByMethod(r, 'has_list_ce').length, 0);
  assert.ok(!r.typed_facts.some((f) => (f.qualifiers.members || []).some((m) => m === 'very deep')),
    'an adjective phrase must never be a member');
});

check('CE list hygiene: open-list marker etc is dropped, real members survive', () => {
  // The parenthetical forces the layer to leave this unparsed, so
  // the etc-drop below is the producer's own work, not the layer's.
  const r = run([unit('RU-001', 'body_prose',
    'The Fundamental Rights (guaranteed to every citizen, as we saw) include Equality, Liberty, Right to Life, Freedom of Speech, Freedom of Religion, etc.')]);
  const mem = factsByMethod(r, 'membership_list_ce');
  assert.strictEqual(mem.length, 1);
  assert.deepStrictEqual(mem[0].qualifiers.members,
    ['Equality', 'Liberty', 'Right to Life', 'Freedom of Speech', 'Freedom of Religion']);
});

check('CE list hygiene: genuine and-joined has list survives', () => {
  const r = run([unit('RU-001', 'body_prose',
    'India has a long tradition of weaving and unique textiles, with every region having its own speciality.')]);
  const mem = factsByMethod(r, 'has_list_ce');
  assert.strictEqual(mem.length, 1);
  assert.deepStrictEqual(mem[0].qualifiers.members, ['long tradition of weaving', 'unique textiles']);
});

check('CE list hygiene: negated has-attribute types nothing', () => {
  const r = run([unit('RU-001', 'body_prose', 'The committee has no money and no staff.')]);
  assert.strictEqual(factsByMethod(r, 'has_attribute').length, 0);
});

check('CE list hygiene: negated includes types nothing', () => {
  // Parenthetical + also + tail force the layer to leave this
  // unparsed, so the negation guard below is the producer's own.
  const r = run([unit('RU-001', 'body_prose',
    'The list (of approved items, as we saw) also includes no sugar, all of which are old.')]);
  assert.strictEqual(factsByMethod(r, 'includes_attribute_ce').length, 0);
  assert.ok(!r.typed_facts.some((f) => f.object === 'no sugar' || (f.qualifiers.members || []).includes('no sugar')),
    'negated absence must never be an object or member');
});

check('CE list hygiene: negated showcases types nothing', () => {
  const r = run([unit('RU-001', 'body_prose', 'The museum showcases no artifacts.')]);
  assert.strictEqual(factsByMethod(r, 'showcases_ce').length, 0);
});

console.log('test_coverage_expansion: ' + passed + ' checks passed');
