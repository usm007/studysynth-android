/**
 * DIAGNOSTIC-ONLY harness — StudySynth Phase 1, Task 5 (Chapter 3, hees203).
 *
 * Purpose: run an instrumented diagnostic generation run for NCERT Class 8
 * Chapter 3 in isolation and emit machine-readable metrics. It calls ONLY
 * existing exported production functions (pdfParser.extractPageLayout,
 * analyze.analyzeSource, generator.buildQuestionCandidates,
 * generator.validateQuestion, reasoning engine_v2.generateReasoningQuestionBank)
 * and never modifies any production file, validator, bank, or staging output.
 * All output goes to /tmp/phase1/metrics/ (this script's own directory).
 * It MUST NOT be run against the staging directory and MUST NOT be used to
 * write pwa/data/ncert_8_2_staged/ or any production bank.
 *
 * Call path replicated (see metrics_notes.md for divergences):
 *   pwa/tests/batch_generate_all_ncert.js, Chapter 3 entry only:
 *     1. extractPageLayout per page; keep pages whose bodyText length > 30.
 *     2. rawDocumentText = header + pagesText joined with "\n\n".
 *     3. Analysis.analyzeSource(raw, title, {sourceMeta}, 15)
 *        (internally: parseRawDocument -> extractSourceFacts ->
 *        detectFactConflicts -> buildKnowledgeInventory ->
 *        generateQuestionBank(target 15, incl. internal V2 target 15) ->
 *        validateQuestionBank).
 *     4. Standalone V2: EngineV2.generateReasoningQuestionBank(sections, {facts, targetCount: 5}).
 *   Wrapper-only instrumentation (NOT part of the production path, labelled
 *   "wrapper_observed" in the JSON): a second, independent call to
 *   buildQuestionCandidates + validateQuestion per candidate, and an
 *   independent V2 run at target 15 to recover the internal-V2 candidates
 *   that generateQuestionBank does not expose. Where wrapper numbers match
 *   the production generation metrics exactly, that is stated as a
 *   replication check; where they do not, the production metric wins.
 *
 * Usage: node /tmp/phase1/metrics/diagnose_chapter3.js
 * Requires only node + the repo at /home/hatch/workspace/studysynth-android.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO = '/home/hatch/workspace/studysynth-android';
const PDF_PATH = '/home/hatch/workspace/ncert_pdfs/hees203.pdf';
const PROD_BANK = path.join(REPO, 'pwa/data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md');
const OUT_DIR = path.dirname(__filename);
const OUT_JSON = path.join(OUT_DIR, 'chapter_3_generation_metrics_draft.json');

if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () { return Buffer.from(this).toString('hex'); };
}
if (!Math.sumPrecise) {
  Math.sumPrecise = function (arr) { let s = 0; for (const n of arr) s += Number(n) || 0; return s; };
}

const Parser = require(path.join(REPO, 'pwa/engine/pdfParser.js'));
const Analysis = require(path.join(REPO, 'pwa/engine/analyze.js'));
const Engine = require(path.join(REPO, 'pwa/engine/generator.js'));
const EngineV2 = require(path.join(REPO, 'pwa/engine/reasoning/engine_v2.js'));

function tally(obj, key) { obj[key] = (obj[key] || 0) + 1; }
function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Direct-builder fact types in buildQuestionCandidates (generator.js): each
// gets one direct maker call per fact; other types can only surface via the
// statement-option second loop (date/numeric/definition/entity_attribute),
// multi / multi_3 / assertion-reason / matching / chronology / table builders.
const DIRECT_BUILDER_TYPES = ['date', 'numeric', 'definition', 'entity_attribute', 'membership', 'sequence', 'causal', 'comparison'];

// Parse the production bank (read-only reference) for stem/key matching.
function parseProductionBank(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf-8');
  const lines = text.split(/\r?\n/);
  const items = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qm = line.match(/^### Question \d+/);
    if (qm) { if (cur) items.push(cur); cur = { subtype: null, answer_key: null, stem: null, options: [] }; continue; }
    if (!cur) continue;
    const sm = line.match(/^- \*\*Subtype:\*\* `([^`]+)`/);
    if (sm) cur.subtype = sm[1];
    const km = line.match(/^- \*\*Answer Key:\*\* \*\*([A-D])\*\*/);
    if (km) cur.answer_key = km[1];
    if (line.trim() === '**Stem:**' && lines[i + 1] && lines[i + 1].startsWith('> ')) {
      cur.stem = lines[i + 1].slice(2).trim();
    }
    const om = line.match(/^- \*\*([A-D])\)\*\* (.+?)(?: \*\*\(CORRECT ANSWER\)\*\*)?$/);
    if (om && line.includes('**Options:**') === false && cur.stem !== null) {
      // Option lines only appear after the stem block; guard by section order
      // is loose, so only accept lines that look like options with a key.
      cur.options.push({ key: om[1], text: om[2].replace(/\s*\*\(Distractor Origin:.*$/, '').trim() });
    }
  }
  if (cur) items.push(cur);
  return items;
}

async function main() {
  const pdfjs = await import(pathToFileURL(path.join(REPO, 'pwa/vendor/pdfjs/pdf.mjs')).href);
  const buffer = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjs.getDocument({ data: buffer, isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise;
  const totalPages = doc.numPages;

  // --- Stage 1: page extraction, exactly as batch_generate_all_ncert.js ---
  const pageDetails = [];
  const pagesText = [];
  const blockTypeTotals = {};
  let furnitureTotal = 0;
  let diagramTotal = 0;
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const layout = await Parser.extractPageLayout(page, pageNum);
    const counts = (layout.stats && layout.stats.countsByType) || {};
    for (const [k, v] of Object.entries(counts)) blockTypeTotals[k] = (blockTypeTotals[k] || 0) + v;
    furnitureTotal += counts.page_furniture || 0;
    diagramTotal += counts.diagram || 0;
    const bodyText = layout.bodyText || '';
    const accepted = bodyText.length > 30; // batch condition: layoutResult.text.length > 30
    if (accepted) pagesText.push(`==Page ${pageNum}==\n${bodyText}`);
    pageDetails.push({
      page: pageNum, accepted, body_text_chars: bodyText.length,
      body_only_chars: (layout.bodyOnlyText || '').length,
      blocks: (layout.blocks || []).length, blocks_by_type: counts,
    });
    page.cleanup();
  }
  const rawDocumentText = `# NCERT Class 8 Art & Heritage — Chapter 3: A Journey Through Indian Architecture\n\n` + pagesText.join('\n\n');

  // --- Stage 2: production path (analyzeSource, target 15), run twice for determinism ---
  const title = 'NCERT Class 8 Art & Heritage: A Journey Through Indian Architecture';
  const sourceMeta = { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' } };
  const run1 = Analysis.analyzeSource(rawDocumentText, title, sourceMeta, 15);
  const run2 = Analysis.analyzeSource(rawDocumentText, title, sourceMeta, 15);
  const sig = (qs) => (qs || []).map((q) => `${q.question_subtype}|${norm(q.stem)}|${q.answer_key}|${(q.options || []).map((o) => norm(o.text)).join('~')}`).join('\n');
  const deterministic = sig(run1.questions) === sig(run2.questions);

  const sections = run1.sections;
  const facts = run1.facts;
  const generation = run1.generation || {};
  const prodQuestions = run1.questions || [];

  // --- Stage 3: standalone V2 exactly as the batch does (target 5) ---
  const sectionsToUse = (sections && sections.length > 0) ? sections : Engine.parseRawDocument(rawDocumentText, title);
  let v2Standalone = [];
  let v2StandaloneGen = null;
  let v2StandaloneError = null;
  try {
    v2Standalone = EngineV2.generateReasoningQuestionBank(sectionsToUse, { facts, targetCount: 5 });
    v2StandaloneGen = v2Standalone.generation || null;
  } catch (err) { v2StandaloneError = err.message || String(err); }

  // --- Stage 4: wrapper instrumentation (NOT production path) ---
  const ctx = { facts, conflicts: run1.conflicts, sections };
  const genOpts = Object.assign({ targetCount: 15, sourceMeta: sourceMeta.sourceMeta }, ctx);
  const prodCandidates = Engine.buildQuestionCandidates(ctx, genOpts);
  const buildMetrics = prodCandidates.buildMetrics || {};
  const candBySubtype = {};
  const candByFact = new Map(); // fact_id -> candidate ids
  const validatedProd = [];
  const rejectedProd = [];
  const firstIssueCounts = {};
  const allIssueCounts = {};
  for (const cand of prodCandidates) {
    tally(candBySubtype, cand.question_subtype);
    const ids = (cand.evidence && Array.isArray(cand.evidence.fact_ids)) ? cand.evidence.fact_ids : [];
    for (const id of ids) {
      if (!candByFact.has(id)) candByFact.set(id, []);
      candByFact.get(id).push(cand.id);
    }
    const check = Engine.validateQuestion(cand, facts, ctx);
    if (check.valid) validatedProd.push(cand);
    else {
      rejectedProd.push({ id: cand.id, subtype: cand.question_subtype, first_rule: check.issues[0] ? check.issues[0].rule : 'validation', all_rules: check.issues.map((i) => i.rule), fact_ids: ids });
      if (check.issues[0]) tally(firstIssueCounts, check.issues[0].rule);
      for (const iss of check.issues) tally(allIssueCounts, iss.rule);
    }
  }
  const validatedBySubtype = {};
  for (const c of validatedProd) tally(validatedBySubtype, c.question_subtype);
  const rejectedBySubtype = {};
  for (const c of rejectedProd) tally(rejectedBySubtype, c.subtype);

  // Independent V2 run at target 15 to recover the internal-V2 candidates
  // that generateQuestionBank merges but does not expose.
  let v2Internal = [];
  let v2InternalGen = null;
  let v2InternalError = null;
  try {
    v2Internal = EngineV2.generateReasoningQuestionBank(sectionsToUse, { facts, targetCount: 15 });
    v2InternalGen = v2Internal.generation || null;
  } catch (err) { v2InternalError = err.message || String(err); }
  const initialFactIds = new Set(facts.map((f) => f.fact_id));
  const v2InternalFiltered = v2Internal.filter((cand) => cand && cand.evidence && Array.isArray(cand.evidence.fact_ids) && cand.evidence.fact_ids.some((id) => initialFactIds.has(id)));
  const v2InternalValidated = [];
  const v2InternalRejected = [];
  const v2FirstIssue = {};
  for (const cand of v2InternalFiltered) {
    const check = Engine.validateQuestion(cand, facts, ctx);
    if (check.valid) v2InternalValidated.push(cand);
    else { v2InternalRejected.push({ id: cand.id, subtype: cand.question_subtype, first_rule: check.issues[0] ? check.issues[0].rule : 'validation', fact_ids: cand.evidence.fact_ids }); if (check.issues[0]) tally(v2FirstIssue, check.issues[0].rule); }
  }

  // Selection-loss decomposition, cross-checked against production metrics.
  const rej = generation.rejectionCounts || {};
  const selectionBucket = (rej.target_limit || 0) + (rej.duplicate_relation || 0);
  const validatedTotalWrapper = validatedProd.length + v2InternalValidated.length;
  const selectedImplied = validatedTotalWrapper - selectionBucket;
  const postRotationImplied = selectedImplied - prodQuestions.length;
  const prodValidationFailedAll = prodCandidates.length - validatedProd.length + v2InternalRejected.length;
  const ruleSumExclBuildSelectionV2 = Object.entries(rej)
    .filter(([k]) => !['missing_options', 'unsafe_facts', 'unsupported_facts', 'multi_missing', 'target_limit', 'duplicate_relation', 'v2_error'].includes(k) && !k.startsWith('v2_'))
    .reduce((s, [, v]) => s + v, 0);
  const arithmeticCloses = (prodValidationFailedAll + postRotationImplied === ruleSumExclBuildSelectionV2);

  // Facts: by type, by relation, coverage, no-candidate list.
  const factsByType = {};
  const factsByRelation = {};
  const factsBySection = {};
  for (const f of facts) { tally(factsByType, f.fact_type || 'unknown'); tally(factsByRelation, f.relation || 'unknown'); tally(factsBySection, f.section_title || 'unknown'); }
  const acceptedFactIds = new Set();
  for (const q of prodQuestions) for (const id of (q.evidence && q.evidence.fact_ids) || []) acceptedFactIds.add(id);
  const factCoverage = facts.map((f) => ({
    fact_id: f.fact_id, fact_type: f.fact_type, subject: f.subject, relation: f.relation, object: f.object,
    section_title: f.section_title, source_page: f.source_page, extraction_method: f.extraction_method,
    conflict_status: f.conflict_status, has_direct_builder: DIRECT_BUILDER_TYPES.includes(f.fact_type),
    candidate_count: (candByFact.get(f.fact_id) || []).length,
    candidate_ids: candByFact.get(f.fact_id) || [],
    used_in_accepted: acceptedFactIds.has(f.fact_id),
    supporting_excerpt: (f.supporting_excerpt || '').slice(0, 200),
  }));
  const noCandidateFacts = factCoverage.filter((f) => f.candidate_count === 0);
  // Capped list orders the informative cases first: every non-fallback fact
  // with no candidate (only 15), then fallback facts up to the 50 cap.
  const noCandidateCapped = [
    ...noCandidateFacts.filter((f) => f.fact_type !== 'fallback'),
    ...noCandidateFacts.filter((f) => f.fact_type === 'fallback'),
  ].slice(0, 50);
  const noCandidateByType = {};
  for (const f of noCandidateFacts) tally(noCandidateByType, f.fact_type || 'unknown');

  // Final questions + match against the production bank (read-only).
  const finalQuestions = prodQuestions.map((q) => ({
    id: q.id, question_subtype: q.question_subtype, difficulty: q.difficulty,
    cognitive_level: q.cognitive_level || q.cognitive_category || null, answer_key: q.answer_key,
    stem: q.stem, statements: q.statements || null,
    options: (q.options || []).map((o) => ({ key: o.key, text: o.text, is_correct: o.is_correct, distractor_origin: o.distractor_origin || null })),
    evidence_fact_ids: (q.evidence && q.evidence.fact_ids) || [], supporting_excerpt: q.supporting_excerpt || null,
  }));
  const prodBank = parseProductionBank(PROD_BANK);
  const matchDetail = finalQuestions.map((q) => {
    const hit = prodBank.find((p) => norm(p.stem) === norm(q.stem));
    return {
      run_id: q.id, subtype: q.question_subtype, answer_key: q.answer_key, stem: q.stem,
      in_production_bank_by_stem: Boolean(hit),
      production_subtype: hit ? hit.subtype : null, production_answer_key: hit ? hit.answer_key : null,
      same_subtype_and_key: hit ? (hit.subtype === q.question_subtype && hit.answer_key === q.answer_key) : false,
    };
  });
  const exactStemMatches = matchDetail.filter((m) => m.in_production_bank_by_stem).length;
  const unmatchedProduction = prodBank.filter((p) => !finalQuestions.some((q) => norm(q.stem) === norm(p.stem)))
    .map((p) => ({ subtype: p.subtype, answer_key: p.answer_key, stem: p.stem }));

  const metrics = {
    chapter: { file: 'hees203.pdf', chapter_num: 3, title: 'A Journey Through Indian Architecture', subject: 'Art & Heritage' },
    source_pdf: { path: PDF_PATH, note: 'spec NCERT/hees203.pdf path does not exist in checkout; NCERT/ holds only .gitkeep; ncert_pdfs copy used', total_pages_in_pdf: totalPages },
    pages: {
      encountered: totalPages, accepted_into_text: pagesText.length,
      rejected_pages: pageDetails.filter((p) => !p.accepted).map((p) => ({ page: p.page, body_text_chars: p.body_text_chars })),
      acceptance_rule: 'batch condition: layout bodyText length > 30 chars',
      per_page: pageDetails,
      block_type_totals: blockTypeTotals, page_furniture_blocks_total: furnitureTotal, diagram_blocks_total: diagramTotal,
    },
    sections_and_paragraphs: {
      section_count: sections.length,
      total_paragraphs: sections.reduce((s, x) => s + (x.paragraphs ? x.paragraphs.length : 0), 0),
      sections: sections.map((s) => ({ id: s.id, title: s.title, page: s.page, paragraph_count: s.paragraphs ? s.paragraphs.length : 0 })),
      inventory_units: Array.isArray(run1.inventory) ? run1.inventory.length : null,
    },
    facts: {
      total: facts.length, by_fact_type: factsByType, by_relation: factsByRelation, by_section_title: factsBySection,
      conflict_count: (run1.conflicts || []).length,
      conflicted_fact_ids: facts.filter((f) => f.conflict_status === 'conflicting').map((f) => f.fact_id),
      facts_with_no_candidate_at_all: { total: noCandidateFacts.length, by_fact_type: noCandidateByType, capped_list_50: noCandidateCapped, capped_list_order: 'non-fallback no-candidate facts first (all of them), then fallback facts; the complete list is full_fact_coverage filtered by candidate_count 0' },
      facts_used_in_accepted: acceptedFactIds.size, facts_unused_in_accepted: facts.length - acceptedFactIds.size,
      full_fact_coverage: factCoverage,
    },
    production_path_generation_metrics: generation,
    production_path_validation: run1.validation || null,
    candidates_wrapper_observed: {
      production_candidates_total: prodCandidates.length,
      production_candidates_by_subtype: candBySubtype,
      production_validated_by_wrapper: validatedProd.length,
      production_validated_by_subtype: validatedBySubtype,
      production_rejected_by_wrapper: rejectedProd.length,
      production_rejected_by_subtype: rejectedBySubtype,
      production_rejection_first_issue_rule_counts_wrapper: firstIssueCounts,
      production_rejection_all_issues_rule_counts_wrapper: allIssueCounts,
      production_rejected_detail: rejectedProd,
      build_metrics: buildMetrics,
      build_metrics_note: 'missingOptions counts every direct-maker call that returned null (missing distractors OR any other maker failure); the builder does not distinguish the cause per fact. unsafeFacts/unsupportedFacts are aggregate skip counts in the build loop.',
    },
    v2_standalone_batch_step: {
      target_count: 5, accepted: v2Standalone.length, accepted_by_subtype: (() => { const o = {}; for (const q of v2Standalone) tally(o, q.question_subtype); return o; })(),
      generation_metrics: v2StandaloneGen, error: v2StandaloneError,
      accepted_questions: v2Standalone.map((q) => ({ id: q.id, subtype: q.question_subtype, answer_key: q.answer_key, stem: q.stem, evidence_fact_ids: (q.evidence && q.evidence.fact_ids) || [] })),
    },
    v2_internal_wrapper_observed: {
      target_count: 15, bank_accepted_before_evidence_filter: v2Internal.length, after_evidence_filter: v2InternalFiltered.length,
      generation_metrics: v2InternalGen, error: v2InternalError,
      production_validated: v2InternalValidated.length, production_rejected: v2InternalRejected.length,
      production_rejection_first_issue_counts: v2FirstIssue, rejected_detail: v2InternalRejected,
      note: 'Independent re-run of generateReasoningQuestionBank at the target generateQuestionBank uses internally (15). Valid only as a replication if its generation metrics match generation.v2Generation in production_path_generation_metrics.',
    },
    selection_loss_decomposition: {
      total_candidates_production_metric: generation.totalCandidates != null ? generation.totalCandidates : null,
      production_candidates_production_metric: generation.productionCandidates != null ? generation.productionCandidates : null,
      v2_candidates_production_metric: generation.v2Candidates != null ? generation.v2Candidates : null,
      validated_total_wrapper: validatedTotalWrapper,
      selection_bucket_target_limit_plus_duplicate_relation_production_metric: selectionBucket,
      selection_bucket_breakdown: { target_limit: rej.target_limit || 0, duplicate_relation: rej.duplicate_relation || 0 },
      selected_implied: selectedImplied, accepted_final: prodQuestions.length,
      post_rotation_rejections_implied: postRotationImplied,
      production_validation_failures_all_wrapper: prodValidationFailedAll,
      validation_rule_sum_excl_build_selection_v2_production_metric: ruleSumExclBuildSelectionV2,
      arithmetic_closes: arithmeticCloses,
      separation_note: 'Production code labels every validated-but-unselected candidate as target_limit (bank full) or duplicate_relation (otherwise); deduplication, relationship reuse, subtype variety cap (40%), and the target cap cannot be separated from the exposed metrics because they all act inside the private selection loop in generateQuestionBank. They are therefore reported as one combined selection bucket. Post-rotation rejections cannot be separated from first-pass validation failures by rule name alone; the implied count above is derived from the arithmetic cross-check, not observed directly.',
    },
    final_accepted: {
      count: prodQuestions.length, subtype_distribution_production_metric: generation.subtypeDistribution || null,
      key_distribution_production_metric: generation.keyDistribution || null,
      questions: finalQuestions,
    },
    reproduction_vs_production_bank: {
      production_bank_path: PROD_BANK, production_bank_question_count_parsed: prodBank.length,
      production_bank_subtypes: (() => { const o = {}; for (const p of prodBank) tally(o, p.subtype); return o; })(),
      run_accepted_count: prodQuestions.length,
      exact_stem_matches: exactStemMatches,
      matches_fully_subtype_and_key: matchDetail.filter((m) => m.same_subtype_and_key).length,
      match_detail: matchDetail,
      production_questions_not_reproduced: unmatchedProduction,
      run_deterministic_repeat_identical: deterministic,
      reproduces_exactly: exactStemMatches === prodBank.length && prodQuestions.length === prodBank.length && matchDetail.every((m) => m.same_subtype_and_key),
    },
    measurement_notes: {
      pages: 'Encountered = doc.numPages from pdf.js. Accepted = pages whose extractPageLayout bodyText length > 30, exactly the batch condition; per-page chars/blocks recorded from the layout result. Pages below threshold are listed with char counts.',
      sections_paragraphs: 'From Engine.parseRawDocument via analyzeSource: sections are page-marker/heading flushes; paragraphs are blank-line flushes. Titles are the raw section titles.',
      facts: 'From analyzeSource return (extractSourceFacts + detectFactConflicts). by_relation tallies the raw relation string. candidate_count per fact counts production candidates whose evidence.fact_ids include the fact; multi/AR/matching/chronology/table candidates are counted only if they list the fact in evidence.fact_ids.',
      candidates_by_subtype: 'Wrapper-observed: independent buildQuestionCandidates call with the same ctx/options generateQuestionBank uses. Cross-check: wrapper production_candidates_total must equal generation.productionCandidates; if it differs, the wrapper diverged and production metrics win.',
      rejections_by_rule: 'Production rejectionCounts (first validation issue only, plus buildMetrics buckets, selection buckets, v2_ prefixed V2 counts) are reported verbatim under production_path_generation_metrics. Wrapper counts are separate: first-issue (production tally method) and all-issues tallies from validateQuestion per candidate. A candidate can carry several validation issues; only the first enters the production tally.',
      lack_of_valid_distractors: 'NOT directly exposed as its own count. Two proxies, kept separate: (1) buildMetrics.missingOptions — direct makers returning null for any reason (missing distractors included, not distinguished); (2) wrapper validation issues on distractor rules (distractor_provenance, fragment_distractor, option_uniqueness, option_count). Neither proxy equals "rejected because they lack valid distractors" on its own.',
      selection_loss: 'See selection_loss_decomposition.separation_note. Dedup vs relation-reuse vs subtype-cap vs target-cap are inseparable from exposed metrics.',
      v2_candidates_by_subtype: 'Pre-validation V2 candidate subtypes are NOT exposed (neither batch step nor internal V2 run exposes rejected V2 candidates by subtype); only accepted V2 questions by subtype are reported, plus V2 validation rejection codes from generation metrics.',
      determinism: 'analyzeSource was run twice on identical input; identical stem/subtype/key/option signatures mean the pipeline is deterministic for this input, so any non-reproduction of the production 5 is attributable to code/input differences since the bank was generated, not randomness.',
      not_measured: [
        'Per-fact builder failure reason (which maker check failed for a specific fact) — buildQuestionCandidates returns only aggregate buildMetrics.',
        'Which specific facts the multi/AR/matching/chronology/table builders considered and discarded — those builders return only surviving candidates, with no discard trace.',
        'Internal-V2 rejected candidates by subtype or per-candidate reason beyond the V2 rejection-code counts in generation metrics.',
        'Post-rotation rejections observed directly — only implied by arithmetic (see selection_loss_decomposition).',
        'Separate counts for deduplication vs relationship reuse vs subtype-cap vs target-cap losses (private selection loop).',
        'Why any individual production-bank question is absent from this run, unless its stem/fact appears in the wrapper traces above — absence is reported, not causally attributed, where the trace does not support it.',
      ],
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(metrics, null, 2), 'utf-8');
  console.log(JSON.stringify({
    pages_encountered: totalPages, pages_accepted: pagesText.length,
    sections: sections.length, paragraphs: metrics.sections_and_paragraphs.total_paragraphs,
    facts: facts.length, facts_by_type: factsByType,
    prod_candidates_wrapper: prodCandidates.length, prod_candidates_production_metric: generation.productionCandidates,
    total_candidates_production_metric: generation.totalCandidates,
    validated_prod_wrapper: validatedProd.length, validated_v2_wrapper: v2InternalValidated.length,
    accepted: prodQuestions.length, deterministic_repeat: deterministic,
    v2_standalone_accepted: v2Standalone.length, v2_internal_gen_accepted: v2InternalGen ? v2InternalGen.accepted : null,
    v2_generation_production_metric: generation.v2Generation,
    exact_stem_matches_vs_production_bank: `${exactStemMatches}/${prodBank.length}`,
    arithmetic_closes: arithmeticCloses, post_rotation_implied: postRotationImplied, selection_bucket: selectionBucket,
    no_candidate_facts: noCandidateFacts.length,
  }, null, 2));
  console.log('Wrote ' + OUT_JSON);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
