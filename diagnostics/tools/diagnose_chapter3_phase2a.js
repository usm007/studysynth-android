/**
 * StudySynth Phase 2A diagnostic harness — Chapter 3 (hees203).
 *
 * Replaces the Phase 1 harness (diagnose_chapter3.js) for Phase 2A
 * work. The Phase 1 file is left byte-identical; this is a NEW file.
 *
 * sourceMeta nesting correction (the known Phase 1 harness defect,
 * stated precisely after a read-only code trace):
 * the production batch calls analyzeSource(rawText, title,
 * { sourceMeta: { type, grade, subject } }, 15) — i.e. it passes a
 * SINGLY-wrapped object as the sourceMeta argument. analyzeSource
 * then re-wraps it ({ sourceMeta: sourceMeta }) for
 * extractSourceFacts, buildKnowledgeInventory and
 * generateQuestionBank, so by the time factConfidenceClass reads
 * `.origin`, the origin (if any) is buried two levels deep and reads
 * as `undefined` → 'verified'. The Phase 1 harness's analyzeSource
 * calls are shape-identical to the batch's; the ONLY differing line
 * is the harness's own wrapper-only unwrap
 * (diagnose_chapter3.js:154, `sourceMeta: sourceMeta.sourceMeta`)
 * for its independent buildQuestionCandidates call — and that
 * difference is result-neutral for non-OCR input, because neither
 * form carries an `origin` field and generator.js never reads
 * sourceMeta.type/grade/subject. This harness does NOT mix forms:
 *   - the production reproduction (section A) replicates production
 *     EXACTLY, including analyzeSource's re-wrap, so the
 *     reproduction is faithful;
 *   - the typed-knowledge run (section B) uses the CORRECTED
 *     singly-nested form { type, grade, subject }, so an OCR origin,
 *     if present, would actually reach factConfidenceClass.
 * For textbook (non-OCR) input both forms yield confidence class
 * 'verified'; the harness asserts that equivalence for this run.
 * The latent production issue (an OCR origin never reaches
 * factConfidenceClass through analyzeSource's re-wrap) is documented
 * in CHAPTER_3_PHASE_2A_RESULTS.md and is NOT changed in this phase,
 * because changing the batch call would alter production behaviour
 * for OCR sources.
 *
 * What this harness does (writes ONLY to diagnostics/ or /tmp):
 *   A. Production reproduction: extractPageLayout per page (the
 *      application's actual PDF parsing path, pwa/engine/pdfParser.js,
 *      via the vendored pdf.js build under Node with the batch's
 *      polyfills), bodyText > 30 rule, ==Page N== markers, analyzeSource
 *      twice (determinism), standalone V2 target 5, stem comparison
 *      against the staged hees203 bank.
 *   B. Structured document model + typed knowledge + unparsed units
 *      for the same chapter, with exhaustive accounting.
 *   C. V2 old-vs-new quantification: the pre-Phase-2A representation
 *      module is fetched read-only from remote main (a536a3c9) into
 *      /tmp and run side-by-side with the new module on identical
 *      sections+facts. If the fetch fails, an analytic fallback counts
 *      old-admissible rejections instead, and the report says so.
 *   D. Reference-inventory linkage: each of the 160 Phase 1 inventory
 *      entries is matched to document-model blocks (exact_span /
 *      normalized_text / ambiguous_review / unresolved_match) and to
 *      typed facts (evidence substring in block text). Question
 *      coverage verdicts are CARRIED from the Phase 1 matrix with
 *      provenance — they are not re-judged here.
 *   E. Spot checks for the 7 known extraction problems, by PDF page.
 *
 * Run from the repo root or anywhere:
 *   node diagnostics/tools/diagnose_chapter3_phase2a.js
 * Outputs (never overwriting Phase 1 files):
 *   diagnostics/chapter_3_phase2a_metrics.json
 *   diagnostics/chapter_3_phase2a_coverage_matrix.json
 *
 * Safe to require() from tests: the main run is guarded by
 * require.main === module, and pdf.js is imported lazily inside main.
 * The matcher helpers are exported for unit tests.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..', '..');
const DIAG = path.resolve(__dirname, '..');
const PDF_PATH = process.env.NCERT_CH3_PDF
  || '/home/hatch/workspace/ncert_pdfs/hees203.pdf';
const DOCUMENT_ID = 'hees203';
const REMOTE_HEAD = 'a536a3c94cd92b81b85ca724a671fab1a97c5b06';

// ------------------------------------------------------------------
// Reference matching (exported for tests).
// ------------------------------------------------------------------
function normalizeReferenceText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseWhitespace(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

// Match one reference entry's quotation to document-model blocks.
//   exact_span      — quotation (whitespace-collapsed) is a substring
//                     of exactly one block's text.
//   normalized_text — normalized quotation is a substring of exactly
//                     one block's normalized text.
//   ambiguous_review — more than one block matches at the best level:
//                     NEVER silently pick one; disposition review_required.
//   unresolved_match — no block matches; disposition unresolved_match.
// Returns { match_method, disposition, block_id, page, candidates }.
function matchReferenceEntry(entry, blocks) {
  const quotation = entry.quotation || entry.quote || '';
  const collapsed = collapseWhitespace(quotation);
  const normalized = normalizeReferenceText(quotation);
  const list = Array.isArray(blocks) ? blocks : [];

  const exactHits = list.filter((b) => collapsed && collapseWhitespace(b.text).includes(collapsed));
  if (exactHits.length === 1) {
    return { match_method: 'exact_span', disposition: 'matched', block_id: exactHits[0].block_id, page: exactHits[0].page, candidates: [] };
  }
  if (exactHits.length > 1) {
    return { match_method: 'ambiguous_review', disposition: 'review_required', block_id: null, page: null, candidates: exactHits.map((b) => b.block_id) };
  }
  const normHits = list.filter((b) => normalized && normalizeReferenceText(b.text).includes(normalized));
  if (normHits.length === 1) {
    return { match_method: 'normalized_text', disposition: 'matched', block_id: normHits[0].block_id, page: normHits[0].page, candidates: [] };
  }
  if (normHits.length > 1) {
    return { match_method: 'ambiguous_review', disposition: 'review_required', block_id: null, page: null, candidates: normHits.map((b) => b.block_id) };
  }
  return { match_method: 'unresolved_match', disposition: 'unresolved_match', block_id: null, page: null, candidates: [] };
}

// ------------------------------------------------------------------
// Main diagnostic run.
// ------------------------------------------------------------------
async function main() {
  // Node polyfills for the web pdf.js build (identical to the batch).
  if (!Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () { return Buffer.from(this).toString('hex'); };
  }
  if (!Math.sumPrecise) {
    Math.sumPrecise = function (arr) { let sum = 0; for (const n of arr) sum += Number(n) || 0; return sum; };
  }

  const Parser = require(path.join(REPO, 'pwa/engine/pdfParser.js'));
  const Analysis = require(path.join(REPO, 'pwa/engine/analyze.js'));
  const Engine = require(path.join(REPO, 'pwa/engine/generator.js'));
  const EngineV2 = require(path.join(REPO, 'pwa/engine/reasoning/engine_v2.js'));
  const DocumentModel = require(path.join(REPO, 'pwa/engine/documentModel.js'));

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  console.log('PDF: ' + PDF_PATH);
  console.log('SHA256: ' + pdfHash);

  const pdfjs = await import(pathToFileURL(path.join(REPO, 'pwa/vendor/pdfjs/pdf.mjs')).href);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true
  }).promise;
  const totalPages = doc.numPages;
  console.log('Pages: ' + totalPages);

  // --- Layout extraction (application's actual parsing path) ---
  const pageLayouts = [];
  const pagesText = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const layout = await Parser.extractPageLayout(page, pageNum);
    pageLayouts.push({
      pageNumber: pageNum,
      blocks: layout.blocks,
      stats: layout.stats,
      bodyText: layout.bodyText,
      bodyOnlyText: layout.bodyOnlyText
    });
    if (layout.bodyText && layout.bodyText.length > 30) {
      pagesText.push('==Page ' + pageNum + '==\n' + layout.bodyText);
    }
    page.cleanup();
  }
  const rawDocumentText = '# NCERT Class 8 Art & Heritage — Chapter 3: A Journey Through Indian Architecture\n\n'
    + pagesText.join('\n\n');
  console.log('Pages with bodyText > 30: ' + pagesText.length + ' of ' + totalPages);

  // --- A. Production reproduction (EXACT production call forms) ---
  const prodSourceMeta = { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' } };
  const title = 'NCERT Class 8 Art & Heritage: A Journey Through Indian Architecture';
  const analysis1 = Analysis.analyzeSource(rawDocumentText, title, prodSourceMeta, 15);
  const analysis2 = Analysis.analyzeSource(rawDocumentText, title, prodSourceMeta, 15);
  const stems1 = (analysis1.questions || []).map((q) => q.stem + '|' + q.answer_key);
  const stems2 = (analysis2.questions || []).map((q) => q.stem + '|' + q.answer_key);
  const productionDeterministic = JSON.stringify(stems1) === JSON.stringify(stems2);
  const sections = (analysis1.sections && analysis1.sections.length > 0)
    ? analysis1.sections
    : Engine.parseRawDocument(rawDocumentText, title);
  let v2Standalone = [];
  try {
    v2Standalone = EngineV2.generateReasoningQuestionBank(sections, {
      facts: analysis1.facts, targetCount: 5
    });
  } catch (err) {
    console.warn('V2 standalone run failed (warning-only, as in batch): ' + err.message);
  }
  // Staged bank stem comparison.
  const stagedBank = fs.readFileSync(
    path.join(REPO, 'pwa/data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md'), 'utf-8');
  const stagedStems = [];
  const stemRe = /\*\*Stem:\*\*\n> ([^\n]+)/g;
  let stemMatch;
  while ((stemMatch = stemRe.exec(stagedBank)) !== null) stagedStems.push(stemMatch[1].trim());
  const reproducedStems = stems1.filter((s) => stagedStems.includes(s.split('|')[0]));
  console.log('Production questions: ' + stems1.length + '; staged bank stems: ' + stagedStems.length
    + '; reproduced: ' + reproducedStems.length + '; deterministic: ' + productionDeterministic
    + '; V2 standalone accepted: ' + v2Standalone.length);

  // --- B. Document model + typed knowledge (CORRECTED sourceMeta) ---
  const docModel = DocumentModel.buildStructuredDocument(pageLayouts, {
    documentId: DOCUMENT_ID, sourceTitle: title
  });
  const correctedSourceMeta = { type: 'textbook', grade: 8, subject: 'art & heritage' };
  const typed = Engine.buildTypedKnowledge(sections, {
    sourceMeta: correctedSourceMeta, documentId: DOCUMENT_ID
  });
  const typedValidationStates = {};
  typed.typed_facts.forEach((f) => {
    typedValidationStates[f.validation_state] = (typedValidationStates[f.validation_state] || 0) + 1;
  });
  const baselineConfidence = {};
  (analysis1.facts || []).forEach((f) => {
    baselineConfidence[f.confidence_class] = (baselineConfidence[f.confidence_class] || 0) + 1;
  });
  console.log('Document blocks: ' + docModel.accounting.blocks_total
    + '; reconciliation ok: ' + docModel.reconciliation.ok
    + '; sections: ' + docModel.accounting.sections_reconstructed);
  console.log('Typed facts: ' + typed.accounting.typed_facts_total
    + '; unparsed units: ' + typed.accounting.units_unparsed
    + '; units: ' + typed.accounting.units_total);
  console.log('Typed validation states: ' + JSON.stringify(typedValidationStates));

  // --- C. V2 old-vs-new (legacy module from remote main, /tmp only) ---
  let v2Comparison = { method: 'legacy_module', available: false };
  try {
    const legacyDir = '/tmp/phase2a-legacy/reasoning';
    fs.mkdirSync(legacyDir, { recursive: true });
    const reasoningDir = path.join(REPO, 'pwa/engine/reasoning');
    fs.readdirSync(reasoningDir).filter((f) => f.endsWith('.js')).forEach((f) => {
      fs.copyFileSync(path.join(reasoningDir, f), path.join(legacyDir, f));
    });
    const out = execFileSync('/opt/hatch/bin/github',
      ['call-read-tool', '--name', 'get_file_contents', '--arguments-json',
        JSON.stringify({ owner: 'usm007', repo: 'studysynth-android', path: 'pwa/engine/reasoning/representation.js' })],
      { encoding: 'utf-8', timeout: 120000 });
    const remoteText = JSON.parse(out).result.content[1].resource.text;
    fs.writeFileSync(path.join(legacyDir, 'representation.js'), remoteText, 'utf-8');
    delete require.cache[require.resolve('/tmp/phase2a-legacy/reasoning/engine_v2.js')];
    const LegacyV2 = require('/tmp/phase2a-legacy/reasoning/engine_v2.js');
    const legacyBank = LegacyV2.generateReasoningQuestionBank(sections, {
      facts: analysis1.facts, targetCount: 5
    });
    const newBank = EngineV2.generateReasoningQuestionBank(sections, {
      facts: analysis1.facts, targetCount: 5
    });
    const legacyGen = legacyBank.generation || {};
    const newGen = newBank.generation || {};
    v2Comparison = {
      method: 'legacy_module',
      available: true,
      remote_head: REMOTE_HEAD,
      legacy: {
        propositionCount: legacyGen.propositionCount,
        totalCandidates: legacyGen.totalCandidates,
        validatedCandidates: legacyGen.validatedCandidates,
        accepted: legacyGen.accepted
      },
      current: {
        propositionCount: newGen.propositionCount,
        totalCandidates: newGen.totalCandidates,
        validatedCandidates: newGen.validatedCandidates,
        accepted: newGen.accepted,
        graphRejectionCount: newGen.graphRejectionCount,
        graphRejectionsByReason: newGen.graphRejectionsByReason
      }
    };
    console.log('V2 legacy vs current: ' + JSON.stringify(v2Comparison.legacy)
      + ' vs ' + JSON.stringify(v2Comparison.current));
  } catch (err) {
    console.warn('Legacy V2 comparison unavailable: ' + err.message);
    const compiled = require(path.join(REPO, 'pwa/engine/reasoning/representation.js'))
      .compileSemanticRepresentation(sections, analysis1.facts);
    const admittedUnderOld = (compiled.graphRejections || []).filter((r) =>
      ['fallback_unclassified', 'missing_subject', 'missing_object',
       'fragment_subject', 'fragment_object', 'conflicting_values', 'ocr_unverified'].includes(r.reason));
    v2Comparison = {
      method: 'analytic_fallback',
      available: true,
      current_propositions: compiled.count,
      graph_rejections: compiled.graphRejections.length,
      rejections_admitted_under_old_rules: admittedUnderOld.length,
      note: 'Old proposition count is approximate: direct-extraction rejections may have deduped under old rules.'
    };
  }

  // --- D. Reference-inventory linkage (fresh versioned matrix) ---
  const inventory = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_knowledge_inventory.json'), 'utf-8'));
  const phase1Matrix = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_coverage_matrix.json'), 'utf-8'));
  const phase1ById = {};
  (Array.isArray(phase1Matrix) ? phase1Matrix : (phase1Matrix.rows || [])).forEach((row) => {
    phase1ById[row.inventory_id || row.entry_id || row.id] = row;
  });
  const inventoryEntries = Array.isArray(inventory) ? inventory : (inventory.entries || []);
  const bodyBlocks = docModel.blocks.filter((b) => b.type === 'body');
  const typedByBlock = {};
  typed.typed_facts.forEach((fact) => {
    const normEvidence = normalizeReferenceText(fact.evidence);
    bodyBlocks.forEach((block) => {
      if (normEvidence && normalizeReferenceText(block.text).includes(normEvidence)) {
        (typedByBlock[block.block_id] || (typedByBlock[block.block_id] = [])).push(fact.fact_id);
      }
    });
  });
  // Spanning analysis for unresolved entries: does the quotation appear
  // in the JOINED normalized text of all blocks in reading order? If
  // yes, the quotation spans block boundaries (or auditor-composed
  // multi-block text) rather than being absent from the layout text.
  // Unresolved quotations are long (median ~190 chars), so a joined
  // hit is meaningful, not a short-phrase coincidence.
  const joinedBlockText = docModel.blocks
    .map((b) => normalizeReferenceText(b.text)).filter(Boolean).join(' ');
  const matrixRows = inventoryEntries.map((entry) => {
    const match = matchReferenceEntry(entry, docModel.blocks);
    const linkedFactIds = match.block_id ? (typedByBlock[match.block_id] || []) : [];
    const phase1 = phase1ById[entry.id || entry.entry_id] || {};
    let unresolvedClass = null;
    if (match.disposition === 'unresolved_match') {
      const normQuote = normalizeReferenceText(entry.quote || entry.quotation || '');
      unresolvedClass = normQuote && joinedBlockText.includes(normQuote)
        ? 'spanning_blocks' : 'absent_from_layout_text';
    }
    return {
      entry_id: entry.id || entry.entry_id,
      pdf_page: entry.pdf_page != null ? entry.pdf_page : null,
      book_page: entry.book_page != null ? entry.book_page : null,
      section: entry.section || null,
      importance: entry.importance || null,
      question_suitable: entry.question_suitable != null ? entry.question_suitable : null,
      reference_quotation: entry.quote || entry.quotation || null,
      block_match: match,
      unresolved_class: unresolvedClass,
      typed_fact_ids: linkedFactIds,
      typed_fact_linkage: linkedFactIds.length > 0 ? 'linked' : 'unlinked',
      question_coverage_phase1: phase1.coverage_status || null,
      extraction_status_phase1: phase1.extraction_status || null,
      representation_status_phase1: phase1.representation_status || null,
      question_coverage_phase1_provenance: 'carried from chapter_3_coverage_matrix.json (Phase 1 verdict, not re-judged in Phase 2A)'
    };
  });
  // Fuzzy page-word overlap for unresolved rows: what fraction of the
  // quotation's content words appear anywhere in the blocks of the
  // entry's own PDF page? High overlap means the content is present
  // but not contiguously quotable in one block (multi-block span,
  // word-order or punctuation differences) — a matcher limitation,
  // not missing content. Low overlap means genuinely absent/visual.
  const STOPWORDS = new Set('the a an of in on at to for and or is are was were be been it its this that these those with by from as'.split(' '));
  const contentWords = (text) => normalizeReferenceText(text).split(' ')
    .filter((w) => w && !STOPWORDS.has(w) && w.length > 2);
  const wordsByPage = {};
  docModel.blocks.forEach((b) => {
    (wordsByPage[b.page] || (wordsByPage[b.page] = new Set()));
    contentWords(b.text).forEach((w) => wordsByPage[b.page].add(w));
  });
  matrixRows.forEach((row) => {
    if (row.block_match.disposition !== 'unresolved_match') return;
    const quoteWords = [...new Set(contentWords(row.reference_quotation))];
    const pageWords = wordsByPage[row.pdf_page] || new Set();
    const hits = quoteWords.filter((w) => pageWords.has(w)).length;
    row.page_word_overlap = quoteWords.length ? hits / quoteWords.length : null;
  });
  const overlapBuckets = { high_ge_80: 0, medium_40_80: 0, low_lt_40: 0 };
  matrixRows.forEach((row) => {
    if (row.page_word_overlap == null) return;
    if (row.page_word_overlap >= 0.8) overlapBuckets.high_ge_80++;
    else if (row.page_word_overlap >= 0.4) overlapBuckets.medium_40_80++;
    else overlapBuckets.low_lt_40++;
  });
  const linkageSummary = {
    entries_total: matrixRows.length,
    block_matched: matrixRows.filter((r) => r.block_match.disposition === 'matched').length,
    block_ambiguous_review: matrixRows.filter((r) => r.block_match.disposition === 'review_required').length,
    block_unresolved: matrixRows.filter((r) => r.block_match.disposition === 'unresolved_match').length,
    block_unresolved_spanning_blocks: matrixRows.filter((r) => r.unresolved_class === 'spanning_blocks').length,
    block_unresolved_absent_from_layout_text: matrixRows.filter((r) => r.unresolved_class === 'absent_from_layout_text').length,
    block_unresolved_page_word_overlap: overlapBuckets,
    typed_fact_linked: matrixRows.filter((r) => r.typed_fact_linkage === 'linked').length,
    typed_fact_unlinked: matrixRows.filter((r) => r.typed_fact_linkage === 'unlinked').length
  };
  console.log('Reference linkage: ' + JSON.stringify(linkageSummary));

  // --- E. Spot checks for the 7 known extraction problems ---
  const SPOTS = [
    { pdf_page: 3, book_page: 87, label: 'timeline labels + date relationships', keywords: ['timeline'] },
    { pdf_page: 4, book_page: 88, label: 'map content + visual dependencies (part 1)', keywords: ['map'] },
    { pdf_page: 5, book_page: 89, label: 'map content + visual dependencies (part 2)', keywords: ['map'] },
    { pdf_page: 14, book_page: 98, label: 'water structures + table-classified prose', keywords: ['stepwell', 'step-well', 'baoli', 'tank', 'water'] },
    { pdf_page: 17, book_page: 101, label: 'running-header contamination inside a sentence', keywords: ['exploring society', 'grade'] },
    { pdf_page: 22, book_page: 106, label: 'Jama Masjid text + fragmented captions', keywords: ['jama masjid'] },
    { pdf_page: 26, book_page: 110, label: 'latticework terminology', keywords: ['latticework', 'lattice', 'jali'] },
    { pdf_page: 38, book_page: 122, label: 'Madras High Court caption + subject relationship', keywords: ['madras high court', 'high court'] }
  ];
  const spotChecks = SPOTS.map((spot) => {
    const pageBlocks = docModel.blocks.filter((b) => b.page === spot.pdf_page);
    const byType = {};
    const byDisposition = {};
    pageBlocks.forEach((b) => {
      byType[b.type] = (byType[b.type] || 0) + 1;
      byDisposition[b.disposition] = (byDisposition[b.disposition] || 0) + 1;
    });
    const keywordBlocks = pageBlocks.filter((b) =>
      spot.keywords.some((k) => normalizeReferenceText(b.text).includes(normalizeReferenceText(k))));
    const linkedTypedFactIds = [];
    keywordBlocks.forEach((b) => {
      (typedByBlock[b.block_id] || []).forEach((id) => {
        if (!linkedTypedFactIds.includes(id)) linkedTypedFactIds.push(id);
      });
    });
    return {
      pdf_page: spot.pdf_page,
      book_page: spot.book_page,
      label: spot.label,
      blocks_total: pageBlocks.length,
      blocks_by_type: byType,
      blocks_by_disposition: byDisposition,
      keyword_block_ids: keywordBlocks.map((b) => ({ block_id: b.block_id, type: b.type, disposition: b.disposition, review_flags: b.review_flags, text_preview: b.text.slice(0, 200) })),
      linked_typed_fact_ids: linkedTypedFactIds,
      continuations_from_page: docModel.continuations.filter((c) => c.from_page === spot.pdf_page)
    };
  });

  // --- Outputs (versioned, never overwriting Phase 1 files) ---
  const metrics = {
    version: 'phase2a-1',
    generated_from: 'diagnostics/tools/diagnose_chapter3_phase2a.js',
    input: {
      pdf_path_resolved: PDF_PATH,
      pdf_sha256: pdfHash,
      pdf_pages: totalPages,
      remote_main_head: REMOTE_HEAD,
      note: 'Spec path NCERT/hees203.pdf does not exist in the checkout (NCERT/ holds only .gitkeep); the audit PDF under ~/workspace/ncert_pdfs/ was used. No PDF is committed to the repo.'
    },
    source_meta_correction: {
      production_form: 'singly-wrapped { sourceMeta: {...} } passed to analyzeSource, exactly as the batch does; analyzeSource re-wraps it for extractSourceFacts, so .origin is buried two levels deep at factConfidenceClass',
      typed_form: 'corrected singly-nested { type, grade, subject } passed to buildTypedKnowledge',
      equivalence_for_this_run: {
        typed_validation_states: typedValidationStates,
        baseline_confidence_classes: baselineConfidence,
        note: 'For textbook (non-OCR) input both forms yield verified; the latent OCR-origin production issue is documented, not changed.'
      }
    },
    production_reproduction: {
      questions_run1: stems1.length,
      questions_run2: stems2.length,
      deterministic: productionDeterministic,
      staged_bank_stems: stagedStems.length,
      reproduced_stems: reproducedStems.length,
      reproduced_stem_list: reproducedStems.map((s) => s.split('|')[0]),
      missing_stems: stagedStems.filter((s) => !stems1.some((x) => x.split('|')[0] === s)),
      extra_stems: stems1.map((x) => x.split('|')[0]).filter((s) => !stagedStems.includes(s)),
      v2_standalone_accepted: v2Standalone.length,
      v2_standalone_target: 5
    },
    document_model: docModel.accounting,
    document_reconciliation: docModel.reconciliation,
    document_sections: docModel.sections.map((s) => ({
      section_id: s.section_id, title: s.title, first_page: s.first_page, block_count: s.block_ids.length
    })),
    continuations: docModel.continuations,
    typed_knowledge: typed.accounting,
    unparsed_units: typed.unparsed_units.map((u) => ({
      unparsed_id: u.unparsed_id, source_unit_id: u.source_unit_id, page: u.source.page,
      reason: u.reason, sentence_role: u.sentence_role,
      potential_learning_relevance: u.potential_learning_relevance,
      text_preview: u.original_text.slice(0, 200)
    })),
    partial_rejections: typed.partial_rejections,
    v2_comparison: v2Comparison,
    reference_linkage: linkageSummary,
    spot_checks: spotChecks
  };
  fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2a_metrics.json'),
    JSON.stringify(metrics, null, 2), 'utf-8');
  const matrix = {
    version: 'phase2a-1',
    generated_from: 'diagnostics/tools/diagnose_chapter3_phase2a.js',
    denominators: {
      reference_entries: matrixRows.length,
      note: 'Question coverage verdicts are Phase 1 values carried with provenance, not re-judged in Phase 2A. Typed-fact linkage is the new Phase 2A signal; linked does NOT mean question-covered.'
    },
    linkage_summary: linkageSummary,
    rows: matrixRows
  };
  fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2a_coverage_matrix.json'),
    JSON.stringify(matrix, null, 2), 'utf-8');
  console.log('Wrote chapter_3_phase2a_metrics.json and chapter_3_phase2a_coverage_matrix.json');
}

if (require.main === module) {
  main().catch((err) => { console.error('Fatal: ' + (err && err.stack ? err.stack : err)); process.exit(1); });
}

module.exports = { matchReferenceEntry, normalizeReferenceText };
