/**
 * StudySynth — Coverage-Driven Question Builder (Delivery Pivot).
 *
 * Turns verified typed facts (the Phase 2A–2E shadow typed layer, via
 * `buildTypedKnowledgeFromReconstructedUnits`) into validated single-choice
 * candidate questions, and maps Chapter 3 questions back to the reference
 * inventory. This module does NOT parse source text and does NOT change the
 * production question path: it reuses the production candidate makers
 * (`buildQuestionCandidates`) and the production validator (`validateQuestion`)
 * on facts adapted from the typed shape into the production fact shape.
 *
 * Design decisions (documented, routine engineering choices):
 * - Context is baked into stems, not carried in a separate field: the shipped
 *   question schema has stems only and no context field, so baking is the
 *   safest compatible implementation. What is baked in is limited to what the
 *   fact itself carries: a clean section title (when it passes the title
 *   filter), a temporal scope, and a source attribution such as
 *   "According to tradition". Section titles are NOT trusted blindly: the
 *   filter rejects digit-led, ellipsis-terminated, and over-long titles,
 *   because Phase 2A showed some section titles are fragment artifacts.
 * - Only single-choice candidates are emitted in this milestone. Structured
 *   forms (multi-statement, Assertion–Reason, matching, chronology) have
 *   different rendered structures and are counted separately as
 *   `structured_not_emitted`, not silently dropped from the validation
 *   summary.
 * - One question per fact key. If two facts would produce the same stem with
 *   different answers, BOTH are rejected as ambiguous: a student could not
 *   tell which answer is asked for. Same stem with the same answer keeps
 *   one question.
 * - Answer keys are balanced by deterministic rotation (question index mod 4),
 *   then every rotated question is fully re-validated. Rotation never
 *   changes the answer text, only its position.
 * - Validation offset check: `validateQuestion` is called with empty
 *   sections, so its `source_offsets` check is skipped. This is deliberate
 *   and documented: adapter evidence spans are relative to reconstructed
 *   units, not to shipped section texts, so section-offset validation is
 *   inapplicable here. The remaining evidence checks still apply in full
 *   (fact references resolve, excerpts match verbatim, explanations quote
 *   the excerpt). Traceability (unit, blocks, page) compensates for the
 *   skipped check.
 * - No new extraction rules are added in this milestone: coverage comes
 *   from converting the existing typed facts into questions.
 *
 * Pure and deterministic: no disk access, no timestamps, no randomness.
 * Every sort has an explicit comparator; every output list is built in
 * source order.
 */
'use strict';

const Engine = require('./generator.js');

const COVERAGE_ENGINE_VERSION = 'coverage-engine-1';

// Relations whose questions are direct (kept in preference rank 0) versus
// statement-option renderings (rank 1). Anything else ranks last.
const DIRECT_SUBTYPES = new Set([
  'definition', 'entity_attribute', 'date_recall', 'numeric_recall',
  'cause_effect', 'comparison', 'membership', 'table_question',
]);

// Subjects that can never anchor a self-contained stem, even when the
// typed subject gate passes them (bare pronouns and generic bare nouns).
const WEAK_SUBJECTS = new Set([
  'it', 'they', 'this', 'these', 'he', 'she', 'we', 'you',
  'people', 'years', 'year', 'things', 'items', 'places', 'ones',
]);

// A caption-fragment subject ("a general view of the Madras High Court")
// names the picture, not the thing the claim is about: the date attaches
// to the court, not the view, and the builder must not rebind it.
const VIEW_OF_SUBJECT = /^(general\s+)?view\s+of\b/;

// Stem-level weak-subject filter (applied to finished questions, NOT to
// facts: the facts stay in the registry so their objects remain usable
// distractors — removing them starved a good Jama Masjid question of its
// same-section distractor, measured 2026-10-27). A bare definite generic
// noun as the asked-about thing ("the city", "the palace") does not
// identify which thing is meant. The (?!\s+of\b) guard keeps constructions
// like "the building of the first churches", where the "of" phrase does
// identify the thing. Plurals ("Palaces", "Mosques") and unique entities
// ("the Earth") are unaffected, as are generic concepts ("a place").
// Discourse fragments ("Given below") are likewise stem-level only.
const BARE_NOUN_STEM = /\b(the|a|an)\s+(mosque|palace|temple|fort|building|structure|church|tomb|monument|city|town|village|river|mountain|district|site)\b(?!\s+of\b)/i;
const DISCOURSE_STEM = /\bgiven\s+(below|above)\b|\bas follows\b/i;
function hasWeakStem(stem) {
  return BARE_NOUN_STEM.test(stem || '') || DISCOURSE_STEM.test(stem || '');
}

// An expected answer (or fact object) that starts pronoun + article has
// lost its verb in extraction ("you a resident, but ..."): ungrammatical
// in any legitimate claim, so it marks a mangled fact or candidate.
const MANGLED_ANSWER_START = /^(you|it|they|he|she|we)\s+(a|an|the)\s/i;
const YEAR_TOKEN = /\b(?:19|20)\d{2}\b/g;

function normText(value) {
  return String(value === undefined || value === null ? '' : value)
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function normSubject(value) {
  return normText(value).replace(/^(the|a|an)\s+/, '');
}

function normObject(value) {
  return normText(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Same key contract as the Phase 2C/2D comparisons (strict scheme). */
function coverageFactKey(fact) {
  const q = fact.qualifiers || {};
  return [
    fact.fact_type || '',
    normSubject(fact.subject),
    normObject(fact.relation),
    normObject(fact.object),
    q.polarity || 'positive',
    q.temporal_scope || '',
  ].join('|');
}

/**
 * Adapt one typed fact (nested TF-* shape) into the production fact shape
 * that `buildQuestionCandidates` and `validateQuestion` consume. Evidence is
 * copied verbatim — never cleaned a second time — because validation
 * requires exact excerpt equality.
 */
function adaptTypedFact(typedFact, chapterCode) {
  const src = typedFact.source || {};
  const q = typedFact.qualifiers || {};
  const cls = typedFact.classification || {};
  const evidence = typedFact.evidence || '';
  const pageRange = Array.isArray(src.page_range) && src.page_range.length
    ? src.page_range : (src.page !== undefined && src.page !== null ? [src.page] : []);
  const adapted = {
    fact_id: 'ADP-' + chapterCode + '-' + typedFact.fact_id,
    ku_id: src.sentence_id || ('KU-' + chapterCode + '-' + typedFact.fact_id),
    section_id: src.section_id || 'sec_unknown',
    section_title: src.section_title || '',
    source_page: pageRange.length ? pageRange[0] : null,
    source_text: evidence,
    supporting_excerpt: evidence,
    source_start: (typedFact.evidence_span && typedFact.evidence_span.start) || 0,
    source_end: (typedFact.evidence_span && typedFact.evidence_span.end) || evidence.length,
    fact_type: typedFact.fact_type,
    subject: typedFact.subject,
    relation: typedFact.relation,
    object: typedFact.object,
    normalized_subject: typedFact.normalized_subject || normSubject(typedFact.subject),
    normalized_relation: typedFact.normalized_relation || normObject(typedFact.relation),
    normalized_object: typedFact.normalized_object || normObject(typedFact.object),
    temporal_scope: q.temporal_scope || '',
    extraction_method: cls.method || 'typed_adapter',
    confidence_class: typedFact.validation_state === 'verified' ? 'verified' : 'unclassified',
    conflict_status: 'clear',
    polarity: q.polarity || 'positive',
    precision: q.precision || 'exact',
    numeric_kind: q.numeric_kind || null,
    relation_verb: q.relation_verb || null,
    causal_direction: q.causal_direction || null,
    attribute: q.attribute || null,
    attribution: q.attribution || null,
    members: q.members || null,
    sequence_items: q.sequence_items || null,
    comparison: q.comparison || null,
    sentence_role: 'assertion',
    _adapter: {
      fact_id: typedFact.fact_id,
      unit_id: src.reconstructed_unit_id || null,
      unit_type: src.reconstructed_unit_type || null,
      block_ids: Array.isArray(src.block_ids) ? src.block_ids.slice() : [],
      page_range: pageRange.slice(),
      evidence_source: src.evidence_source || null,
      figure_ref: src.figure_ref || null,
      derivation: typedFact.derivation || null,
      validation_state: typedFact.validation_state || null,
    },
  };
  return adapted;
}

/** Conservative section-title filter for stem baking (see header). */
const TITLE_FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with',
  'by', 'at', 'from', 'as', 'into', 'over', 'under', 'between', 'among',
  'through', 'across', 'along', 'behind', 'below', 'above', 'near', 'via', 'per',
]);
// Lowercase finite verbs / gerunds that mark a sentence-clause heading
// ("Guru Nanak journeyed across regions, spreading the message") rather
// than a topic title. Title-Case verbs ("How Maps Developed") are not
// matched: only lowercase tokens count, so genuine Title-Case headings pass.
const TITLE_CLAUSE_VERBS = new Set([
  'journeyed', 'travelled', 'traveled', 'spread', 'spreading', 'designed',
  'built', 'founded', 'established', 'ruled', 'migrated', 'lived', 'worked',
  'fought', 'led', 'created', 'developed', 'began', 'started', 'came',
  'went', 'grew', 'changed', 'moved', 'settled', 'preached', 'taught',
  'composed', 'wrote', 'painted', 'constructed', 'introduced',
]);
function isCleanSectionTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const t = title.trim();
  if (t.length < 5 || t.length > 60) return false;
  if (!/^[A-Z]/.test(t)) return false;
  if (t.indexOf('…') !== -1 || t.indexOf('...') !== -1) return false;
  if (/[,:;]$/.test(t)) return false;
  if (/\?$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2) return false;
  // A topic title is short: a clause heading runs long.
  if (words.length > 6) return false;
  // Fused-heading signal: a lowercase content word followed later by a
  // capitalised word ("Shift to secondary and Attracts people"). Genuine
  // Title Case has only lowercase function words, and sentence-case
  // topic titles ("Birth and fertility rates") have no capital after.
  const isCap = (w) => /^[A-ZĀĪŪṚṢṆṬḌ]/.test(w);
  const isLowerContent = (w) => /^[a-zāīūṛṣṇṭḍ]/.test(w) &&
    !TITLE_FUNCTION_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''));
  for (let i = 0; i < words.length; i++) {
    if (isLowerContent(words[i])) {
      for (let j = i + 1; j < words.length; j++) {
        if (isCap(words[j])) return false;
      }
    }
    if (TITLE_CLAUSE_VERBS.has(words[i].toLowerCase().replace(/[^a-z]/g, ''))) return false;
  }
  return true;
}

function lowerFirst(text) {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Bake a fact's own qualifiers into a production stem. Returns the baked
 * stem. Order: section context, then attribution, then the stem itself,
 * then the temporal scope as a trailing clause.
 */
function bakeStem(stem, adaptedFact) {
  let out = String(stem || '');
  const title = adaptedFact.section_title || '';
  if (isCleanSectionTitle(title) && normText(out).indexOf(normText(title)) === -1) {
    out = 'In ' + title.trim() + ', ' + lowerFirst(out);
  }
  const attribution = adaptedFact.attribution || '';
  if (attribution && normText(out).indexOf(normText(attribution)) === -1) {
    out = attribution.trim().replace(/[,.]$/, '') + ', ' + lowerFirst(out);
  }
  const scope = adaptedFact.temporal_scope || '';
  if (scope) {
    const core = out.replace(/\?+\s*$/, '');
    if (normText(core).indexOf(normText(scope)) === -1) {
      // A bare scope ("classical times") needs a preposition; scopes
      // that already carry one ("until the 8th century", "from the
      // 10th century onward") are appended as-is.
      const sep = /^(in|from|until|during|after|before|around|between|over|since)\b/i.test(scope.trim())
        ? ', ' : ', in ';
      out = core + sep + scope.trim() + '?';
    }
  }
  return out;
}

/** Deterministic option rotation: rotate left by `rot` positions. */
function rotateOptions(options, rot) {
  const n = options.length;
  const r = ((rot % n) + n) % n;
  const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rotated = [];
  for (let i = 0; i < n; i++) {
    const src = options[(i + r) % n];
    const copy = Object.assign({}, src);
    copy.key = keys[i];
    rotated.push(copy);
  }
  const correct = rotated.find((o) => o.is_correct);
  return { options: rotated, answer_key: correct ? correct.key : null };
}

function candidateSubtypeRank(candidate) {
  if (DIRECT_SUBTYPES.has(candidate.question_subtype)) return 0;
  if (candidate.question_subtype === 'statement_option') return 1;
  if (candidate.question_subtype === 'fill_blank') return 2;
  return 3;
}

function primaryFactId(candidate) {
  if (candidate.knowledge_units && candidate.knowledge_units.length) {
    return candidate.knowledge_units[0].fact_id;
  }
  if (candidate.evidence && candidate.evidence.fact_ids && candidate.evidence.fact_ids.length) {
    return candidate.evidence.fact_ids[0];
  }
  return null;
}

function candidateFactKey(candidate, adaptedById) {
  const fid = primaryFactId(candidate);
  const fact = fid ? adaptedById[fid] : null;
  return fact ? coverageFactKey(fact) : null;
}

/**
 * Resolve stem collisions among kept {candidate, fact} items. Same
 * normalized stem with different expected answers is ambiguous: every item
 * in the group is rejected. Same stem with the same answer keeps one item.
 * Returns { kept, duplicates_removed, stem_collisions_rejected,
 * rejectedFactIds }.
 */
function resolveStemCollisions(items) {
  const groups = new Map();
  for (const item of items) {
    const s = normText(item.candidate.stem);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(item);
  }
  const kept = [];
  let duplicatesRemoved = 0;
  let stemCollisionsRejected = 0;
  const rejectedFactIds = [];
  for (const group of groups.values()) {
    const answers = new Set(group.map((it) => normText(it.candidate.expected_answer)));
    if (group.length > 1 && answers.size > 1) {
      stemCollisionsRejected += group.length;
      for (const it of group) {
        const fid = primaryFactId(it.candidate);
        if (fid) rejectedFactIds.push(fid);
      }
      continue;
    }
    if (group.length > 1) duplicatesRemoved += group.length - 1;
    kept.push(group[0]);
  }
  return {
    kept: kept,
    duplicates_removed: duplicatesRemoved,
    stem_collisions_rejected: stemCollisionsRejected,
    rejected_fact_ids: rejectedFactIds,
  };
}

/**
 * Pre-filter for typed facts that cannot anchor a question even before the
 * production makers see them. Returns a reason string, or null if usable.
 * The production makers and validator still have the final say; this only
 * removes facts whose subject or evidence is structurally unusable.
 */
function prefilterReason(adaptedFact) {
  if (!adaptedFact.subject || !normText(adaptedFact.subject)) return 'missing_subject';
  if (WEAK_SUBJECTS.has(normSubject(adaptedFact.subject))) return 'weak_subject';
  if (VIEW_OF_SUBJECT.test(normSubject(adaptedFact.subject))) return 'weak_subject';
  // A bare caption artefact ("a sketch", "a map", "a photograph") does not
  // identify which artefact is meant, so a question about it is not
  // self-contained even with section context baked in. Named artefacts
  // ("the Dilwara Temples") are unaffected.
  if (/^(a|an|the)\s+(sketch|painting|photograph|photo|map|diagram|figure|image|illustration|portrait|engraving|drawing)$/i.test(normText(adaptedFact.subject))) {
    return 'weak_subject';
  }
  const quality = Engine.checkSubjectQuality(adaptedFact.subject);
  if (quality && quality.valid === false) return 'weak_subject';
  if (!adaptedFact.object || !normText(adaptedFact.object)) return 'missing_object';
  // Chart-axis label dump, not a claim: an object carrying three or more
  // year tokens is fused chart furniture (hees206 fertility-rate case).
  // A legitimate single date or year-range never reaches three tokens.
  if ((String(adaptedFact.object).match(YEAR_TOKEN) || []).length >= 3) {
    return 'chart_label_dump';
  }
  // Mangled effect/claim object: the verb was lost in extraction, so the
  // fact cannot anchor a question and its text must not leak into other
  // questions' distractor pools either.
  if (MANGLED_ANSWER_START.test(normText(adaptedFact.object))) return 'mangled_object';
  if (!adaptedFact.supporting_excerpt || !normText(adaptedFact.supporting_excerpt)) {
    return 'missing_evidence';
  }
  return null;
}

/**
 * Distinctive content words of a text: lowercased words of length >= 4 that
 * are not stopwords. Used only for the strict page-content coverage link
 * (same page + every distinctive word present + subject-word overlap).
 */
const COVERAGE_STOPWORDS = new Set([
  'that', 'with', 'from', 'this', 'these', 'those', 'which', 'their',
  'there', 'about', 'other', 'also', 'into', 'over', 'under', 'when',
  'were', 'been', 'have', 'more', 'most', 'such', 'than', 'them',
  'then', 'they', 'well', 'very', 'each', 'many', 'some', 'just',
  'like', 'made', 'make', 'known', 'called', 'after', 'before',
]);
function distinctiveWords(text) {
  const words = normText(text).replace(/[^a-z0-9āīūṛṣṇṭḍñ ]/g, ' ').split(/\s+/);
  const out = [];
  const seen = new Set();
  for (const w of words) {
    if (w.length >= 4 && !COVERAGE_STOPWORDS.has(w) && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

/**
 * Containment normaliser for the evidence-span coverage link: lowercase,
 * punctuation to spaces, whitespace collapsed. Applied identically to the
 * question evidence and the inventory quote, so containment is a literal
 * span relationship, not a similarity score.
 */
function normForContain(text) {
  return normText(text).replace(/[^a-z0-9āīūṛṣṇṭḍñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripDocPrefix(blockId) {
  const idx = String(blockId).indexOf(':');
  return idx >= 0 ? String(blockId).slice(idx + 1) : String(blockId);
}

function blockMatchIds(row) {
  const bm = row ? row.block_match : null;
  if (!bm) return [];
  const ids = [];
  const pushOne = (v) => {
    if (typeof v === 'string' && v) ids.push(stripDocPrefix(v));
    else if (Array.isArray(v)) v.forEach(pushOne);
  };
  pushOne(bm.block_id);
  pushOne(bm.block_ids);
  if (Array.isArray(bm.candidates)) {
    for (const c of bm.candidates) {
      if (c && typeof c === 'object') { pushOne(c.block_id); pushOne(c.block_ids); }
    }
  }
  return ids;
}

/**
 * Link Chapter 3 inventory entries to accepted questions. Returns
 * { rows, summary }. Link methods are recorded per row; only `block_match`,
 * `evidence_span_match` (question evidence literally contained in the
 * entry's quoted source span, same page) and the strict
 * `page_content_match` (same page + every distinctive word + subject-word
 * overlap) count as confirmed coverage. Partial textual similarity alone
 * never counts.
 *
 * `questionFacts` maps question id -> adapted fact (for evidence lookup).
 * `allFacts` (optional) is the full adapted-fact list: an entry with no
 * question on its page but a same-page typed fact sharing a distinctive
 * word is `evidence_exists_unconverted` (extraction succeeded, conversion
 * failed), not `extraction_incomplete` (which would wrongly blame
 * extraction). `factByKey` is unused here; kept for signature clarity.
 */
function linkInventory(entries, phase2aRows, questions, questionFacts, allFacts) {
  const rowsById = new Map();
  for (const row of phase2aRows || []) {
    if (row && row.inventory_id) rowsById.set(row.inventory_id, row);
  }
  // Index questions by block id and by page for the two link methods.
  const byBlock = new Map();
  const byPage = new Map();
  for (const q of questions) {
    const fact = questionFacts[q.id];
    if (!fact) continue;
    const blocks = (fact._adapter && fact._adapter.block_ids) || [];
    for (const b of blocks) {
      if (!byBlock.has(b)) byBlock.set(b, []);
      byBlock.get(b).push(q);
    }
    const pages = (fact._adapter && fact._adapter.page_range) || [];
    for (const p of pages) {
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(q);
    }
  }

  const rows = [];
  const summary = {
    total: 0, denominator: 0, covered: 0, evidence_exists_unconverted: 0,
    extraction_incomplete: 0, requires_human_review: 0, excluded: 0,
  };
  for (const entry of entries || []) {
    summary.total++;
    const row2a = rowsById.get(entry.id);
    const out = {
      inventory_id: entry.id,
      importance: entry.importance,
      section: entry.section,
      pdf_page: entry.pdf_page,
      book_page: entry.book_page,
      coverage_status: null,
      question_ids: [],
      link_method: null,
      reason: '',
    };
    // REVIEW_REQUIRED comes first, matching the Phase 1 taxonomy: the
    // flagged entry sits outside both the denominator and the excluded
    // set (Phase 1: review_required 1, not_question_worthy 16).
    // Denominator = covered + evidence_exists_unconverted +
    // extraction_incomplete; total = denominator + review + excluded.
    if (entry.importance === 'REVIEW_REQUIRED') {
      out.coverage_status = 'requires_human_review';
      out.reason = 'Reference entry flagged REVIEW_REQUIRED in the inventory; not auto-covered.';
      summary.requires_human_review++;
      rows.push(out);
      continue;
    }
    if (entry.question_suitable !== 'yes') {
      out.coverage_status = 'excluded';
      out.reason = entry.question_suitability_reason || 'Not question-suitable in the reference inventory.';
      summary.excluded++;
      rows.push(out);
      continue;
    }
    summary.denominator++;
    // Method 1: block match from the Phase 2A matrix.
    const matchedBlocks = blockMatchIds(row2a);
    let linked = null;
    let method = null;
    for (const b of matchedBlocks) {
      const qs = byBlock.get(b) || [];
      if (qs.length) { linked = qs; method = 'block_match'; break; }
    }
    // Method 2: evidence-span match. The question's evidence sentence,
    // normalised, is literally contained in the entry's quoted source
    // span (or vice versa), on the entry's page, with the shorter side
    // at least 30 characters so trivial overlaps cannot count. This is
    // a span relationship, not a fuzzy score: the question's evidence
    // IS part of the entry's quoted source text.
    if (!linked) {
      const quoteNorm = normForContain(entry.quote || entry.description || '');
      const pageQs = byPage.get(entry.pdf_page) || [];
      for (const q of pageQs) {
        const fact = questionFacts[q.id];
        if (!fact) continue;
        const evNorm = normForContain(fact.supporting_excerpt || '');
        const shorter = Math.min(evNorm.length, quoteNorm.length);
        if (shorter < 30) continue;
        if (evNorm && quoteNorm && (quoteNorm.indexOf(evNorm) !== -1 || evNorm.indexOf(quoteNorm) !== -1)) {
          linked = [q]; method = 'evidence_span_match'; break;
        }
      }
    }
    // Method 3: strict page-content match.
    if (!linked) {
      const words = distinctiveWords(entry.quote || entry.description || '');
      const pageQs = byPage.get(entry.pdf_page) || [];
      const entryWords = new Set(distinctiveWords(
        (entry.quote || '') + ' ' + (entry.description || '')));
      for (const q of pageQs) {
        const fact = questionFacts[q.id];
        if (!fact) continue;
        const ev = normText(fact.supporting_excerpt || '');
        const allPresent = words.length > 0 && words.every((w) => ev.indexOf(w) !== -1);
        if (!allPresent) continue;
        const subjectWords = distinctiveWords(fact.subject || '');
        const overlap = subjectWords.some((w) => entryWords.has(w));
        if (overlap) { linked = [q]; method = 'page_content_match'; break; }
      }
    }
    if (linked) {
      out.coverage_status = 'covered';
      out.question_ids = linked.map((q) => q.id);
      out.link_method = method;
      out.reason = method === 'block_match'
        ? 'Question built from a typed fact sharing a Phase 2A block match with this entry.'
        : method === 'evidence_span_match'
          ? 'Question evidence is literally contained in the entry\'s quoted source span on the same page.'
          : 'Question built from a typed fact on the same page containing every distinctive word of the entry with subject overlap.';
      summary.covered++;
      rows.push(out);
      continue;
    }
    const visual = String(entry.visual_dependency || '');
    if (/high/.test(visual)) {
      out.coverage_status = 'requires_human_review';
      out.reason = 'Visual dependency (' + visual + '); textual evidence alone cannot confirm coverage.';
      summary.requires_human_review++;
    } else if (matchedBlocks.length) {
      out.coverage_status = 'evidence_exists_unconverted';
      out.reason = 'Phase 2A block match exists but no validated question was built from those blocks.';
      summary.evidence_exists_unconverted++;
    } else {
      // Does any question — or, failing that, any typed fact — on the
      // entry's page carry the entry's words? The fact-level check keeps
      // the diagnosis honest: a same-page typed fact means conversion,
      // not extraction, is the blocker.
      const words = distinctiveWords(entry.quote || entry.description || '');
      const pageQs = byPage.get(entry.pdf_page) || [];
      const anyPageEvidence = pageQs.some((q) => {
        const fact = questionFacts[q.id];
        const ev = normText(fact ? fact.supporting_excerpt || '' : '');
        return words.length > 0 && words.some((w) => ev.indexOf(w) !== -1);
      });
      let anyFactEvidence = false;
      if (!anyPageEvidence && Array.isArray(allFacts)) {
        anyFactEvidence = allFacts.some((fact) => {
          const pages = (fact._adapter && fact._adapter.page_range) || [];
          if (pages.indexOf(entry.pdf_page) === -1) return false;
          const ev = normText(fact.supporting_excerpt || '');
          return words.length > 0 && words.some((w) => ev.indexOf(w) !== -1);
        });
      }
      if (anyPageEvidence) {
        out.coverage_status = 'evidence_exists_unconverted';
        out.reason = 'Related page evidence exists but no validated question satisfies the strict link rules.';
        summary.evidence_exists_unconverted++;
      } else if (anyFactEvidence) {
        out.coverage_status = 'evidence_exists_unconverted';
        out.reason = 'A typed fact on this page carries the entry\'s words, but no validated question was built from it.';
        summary.evidence_exists_unconverted++;
      } else {
        out.coverage_status = 'extraction_incomplete';
        out.reason = 'No block match and no page evidence satisfying the link rules; source evidence or extraction is incomplete.';
        summary.extraction_incomplete++;
      }
    }
    rows.push(out);
  }
  return { rows: rows, summary: summary };
}

/**
 * Build a candidate bank from typed adapter facts for one chapter.
 *
 * Input:
 *   chapterCode (e.g. 'hees203'), chapterNum (e.g. 3), title, pdfFile,
 *   pagesProcessed ('40/40' style string or number), typedFacts (nested
 *   TF-* shape), inventoryEntries (optional, Chapter 3 only),
 *   phase2aRows (optional, Chapter 3 only).
 *
 * Output: { version, chapter, questions, traceability, validation, coverage }
 * where coverage is null for chapters without an inventory.
 */
function buildCandidateBank(input) {
  const chapterCode = input.chapterCode;
  const adapted = [];
  const factDispositions = [];
  const skipped = [];
  for (const tf of input.typedFacts || []) {
    const a = adaptTypedFact(tf, chapterCode);
    const reason = prefilterReason(a);
    if (reason) {
      // Keep the adapted fact itself: the linker needs prefiltered facts
      // too, so "evidence exists but unconverted" is not misreported
      // as "extraction incomplete" when extraction actually succeeded.
      skipped.push({ fact_id: tf.fact_id, reason: reason, fact: a });
      factDispositions.push({ fact_id: tf.fact_id, question_id: null, reason: reason });
    } else {
      adapted.push(a);
    }
  }

  const conflicted = Engine.detectFactConflicts(adapted);
  const facts = conflicted.facts || adapted;
  const adaptedById = {};
  for (const f of facts) adaptedById[f.fact_id] = f;

  const rawCandidates = Engine.buildQuestionCandidates({ facts: facts, sections: [] }, {});
  const buildMetrics = rawCandidates.buildMetrics || {};

  const validation = {
    facts_in: (input.typedFacts || []).length,
    facts_adapted: adapted.length,
    facts_prefiltered: skipped.length,
    candidates_built: rawCandidates.length,
    build_metrics: {
      missingOptions: buildMetrics.missingOptions || 0,
      unsafeFacts: buildMetrics.unsafeFacts || 0,
      unsupportedFacts: buildMetrics.unsupportedFacts || 0,
      multiMissing: buildMetrics.multiMissing || 0,
    },
    structured_not_emitted: {},
    rejected_by_rule: {},
    rejected_candidates: 0,
    duplicates_removed: 0,
    stem_collisions_rejected: 0,
    not_selected_per_fact: 0,
    post_rotation_failed: 0,
    mangled_answer_filtered: 0,
    weak_stem_filtered: 0,
    stem_bake_fallbacks: 0,
    accepted: 0,
    subtype_distribution: {},
  };

  // Validate single-choice candidates; count structured forms separately.
  const validByKey = new Map();
  const rejectedByFact = {};
  const mangledByFact = {};
  const weakStemByFact = {};
  for (const cand of rawCandidates) {
    if (!cand || cand.type !== 'single_choice') {
      const st = (cand && cand.question_subtype) || 'unknown';
      validation.structured_not_emitted[st] = (validation.structured_not_emitted[st] || 0) + 1;
      continue;
    }
    const result = Engine.validateQuestion(cand, facts, { sections: [] });
    if (!result.valid) {
      validation.rejected_candidates++;
      const seen = new Set();
      for (const issue of result.issues || []) {
        if (issue && issue.rule && !seen.has(issue.rule)) {
          seen.add(issue.rule);
          validation.rejected_by_rule[issue.rule] =
            (validation.rejected_by_rule[issue.rule] || 0) + 1;
        }
      }
      const fid = primaryFactId(cand);
      if (fid && !rejectedByFact[fid]) {
        rejectedByFact[fid] = (result.issues || []).map((i) => i.rule).filter(Boolean);
      }
      continue;
    }
    const key = candidateFactKey(cand, adaptedById);
    if (!key) continue;
    const rank = candidateSubtypeRank(cand);
    const prev = validByKey.get(key);
    if (!prev || rank < prev.rank) {
      if (prev) validation.not_selected_per_fact++;
      validByKey.set(key, { candidate: cand, rank: rank });
    } else {
      validation.not_selected_per_fact++;
    }
  }

  // Stem baking (qualifiers + clean section title), with fallback to the
  // validated unbaked stem when baking breaks validation.
  let kept = [];
  for (const entry of validByKey.values()) {
    const cand = entry.candidate;
    const fid = primaryFactId(cand);
    const fact = fid ? adaptedById[fid] : null;
    if (!fact) continue;
    const baked = bakeStem(cand.stem, fact);
    if (baked !== cand.stem) {
      const trial = Object.assign({}, cand, { stem: baked });
      const recheck = Engine.validateQuestion(trial, facts, { sections: [] });
      if (recheck.valid) {
        cand.stem = baked;
      } else {
        validation.stem_bake_fallbacks++;
      }
    }
    kept.push({ candidate: cand, fact: fact });
  }

  // Stem collisions: same normalized stem, different answers -> ambiguous.
  const collision = resolveStemCollisions(kept);
  validation.stem_collisions_rejected += collision.stem_collisions_rejected;
  validation.duplicates_removed += collision.duplicates_removed;
  for (const fid of collision.rejected_fact_ids) {
    rejectedByFact[fid] = ['ambiguous_stem_collision'];
  }
  kept = collision.kept;

  // Deterministic order: source order (adapted fact order), then fact id.
  const factOrder = new Map();
  facts.forEach((f, i) => factOrder.set(f.fact_id, i));
  kept.sort((a, b) => {
    const oa = factOrder.has(primaryFactId(a.candidate)) ? factOrder.get(primaryFactId(a.candidate)) : 1e9;
    const ob = factOrder.has(primaryFactId(b.candidate)) ? factOrder.get(primaryFactId(b.candidate)) : 1e9;
    if (oa !== ob) return oa - ob;
    return String(primaryFactId(a.candidate)).localeCompare(String(primaryFactId(b.candidate)));
  });

  // Key rotation + full re-validation + id assignment.
  const questions = [];
  const questionFacts = {};
  kept.forEach((item, idx) => {
    const cand = item.candidate;
    const rotated = rotateOptions(cand.options, idx % 4);
    const finalQ = Object.assign({}, cand);
    finalQ.options = rotated.options;
    finalQ.answer_key = rotated.answer_key;
    const recheck = Engine.validateQuestion(finalQ, facts, { sections: [] });
    if (!recheck.valid) {
      validation.post_rotation_failed++;
      const fid = primaryFactId(cand);
      if (fid) rejectedByFact[fid] = (recheck.issues || []).map((i) => i.rule).filter(Boolean);
      return;
    }
    // Backstop for maker-introduced mangling: a correct answer that lost
    // its verb in candidate construction ("you a resident, but ...") is
    // ungrammatical and does not faithfully state the source claim, even
    // though the validator (which checks excerpts, not option grammar)
    // passes it. Fact-level mangled objects are already prefiltered.
    if (MANGLED_ANSWER_START.test(normText(finalQ.expected_answer || ''))) {
      validation.mangled_answer_filtered++;
      const fid = primaryFactId(cand);
      if (fid) mangledByFact[fid] = true;
      return;
    }
    // Stem-level weak-subject filter: the stem itself must identify
    // what is being asked about. Facts stay in the registry (see
    // hasWeakStem note), so only the unidentifiable question is lost.
    if (hasWeakStem(finalQ.stem)) {
      validation.weak_stem_filtered++;
      const fid = primaryFactId(cand);
      if (fid) weakStemByFact[fid] = true;
      return;
    }
    finalQ.id = 'Q-CAND-' + input.chapterNum + '-' + String(questions.length + 1).padStart(3, '0');
    finalQ.traceability = {
      chapter: chapterCode,
      pdf: input.pdfFile,
      fact_id: item.fact._adapter.fact_id,
      unit_id: item.fact._adapter.unit_id,
      unit_type: item.fact._adapter.unit_type,
      block_ids: item.fact._adapter.block_ids,
      page_range: item.fact._adapter.page_range,
      evidence_source: item.fact._adapter.evidence_source,
      figure_ref: item.fact._adapter.figure_ref,
      rule: 'coverage-engine-1:' + cand.question_subtype,
    };
    questions.push(finalQ);
    questionFacts[finalQ.id] = item.fact;
    validation.subtype_distribution[cand.question_subtype] =
      (validation.subtype_distribution[cand.question_subtype] || 0) + 1;
  });
  validation.accepted = questions.length;

  // Fact dispositions: every adapted fact ends in exactly one state.
  const usedFactIds = new Set(questions.map((q) => primaryFactId(q)));
  for (const f of facts) {
    const adapterId = f._adapter ? f._adapter.fact_id : f.fact_id;
    const existing = factDispositions.find((d) => d.fact_id === adapterId);
    if (existing) continue;
    if (usedFactIds.has(f.fact_id)) {
      const q = questions.find((qq) => primaryFactId(qq) === f.fact_id);
      factDispositions.push({ fact_id: adapterId, question_id: q ? q.id : null, reason: 'covered' });
    } else if (rejectedByFact[f.fact_id]) {
      factDispositions.push({ fact_id: adapterId, question_id: null, reason: rejectedByFact[f.fact_id].join(',') });
    } else if (mangledByFact[f.fact_id]) {
      factDispositions.push({ fact_id: adapterId, question_id: null, reason: 'mangled_answer' });
    } else if (weakStemByFact[f.fact_id]) {
      factDispositions.push({ fact_id: adapterId, question_id: null, reason: 'weak_stem' });
    } else {
      factDispositions.push({ fact_id: adapterId, question_id: null, reason: 'no_valid_candidate' });
    }
  }
  factDispositions.sort((a, b) => String(a.fact_id).localeCompare(String(b.fact_id)));

  let coverage = null;
  if (input.inventoryEntries) {
    coverage = linkInventory(input.inventoryEntries, input.phase2aRows || [],
      questions, questionFacts,
      facts.concat(skipped.map((s) => s.fact).filter(Boolean)));
  }

  return {
    version: COVERAGE_ENGINE_VERSION,
    chapter: chapterCode,
    chapter_num: input.chapterNum,
    title: input.title,
    pdf: input.pdfFile,
    pages_processed: input.pagesProcessed,
    questions: questions,
    traceability: {
      fact_dispositions: factDispositions,
      questions: questions.map((q) => ({
        question_id: q.id,
        subtype: q.question_subtype,
        fact_id: q.traceability.fact_id,
        unit_id: q.traceability.unit_id,
        block_ids: q.traceability.block_ids,
        page_range: q.traceability.page_range,
        evidence_source: q.traceability.evidence_source,
        evidence: q.supporting_excerpt || null,
        rule: q.traceability.rule,
      })),
    },
    validation: validation,
    coverage: coverage,
  };
}

module.exports = {
  COVERAGE_ENGINE_VERSION: COVERAGE_ENGINE_VERSION,
  adaptTypedFact: adaptTypedFact,
  bakeStem: bakeStem,
  isCleanSectionTitle: isCleanSectionTitle,
  coverageFactKey: coverageFactKey,
  rotateOptions: rotateOptions,
  resolveStemCollisions: resolveStemCollisions,
  linkInventory: linkInventory,
  distinctiveWords: distinctiveWords,
  buildCandidateBank: buildCandidateBank,
};
