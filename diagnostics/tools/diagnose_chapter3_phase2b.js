/**
 * StudySynth Phase 2B diagnostic harness — Chapter 3 (shadow pipeline).
 *
 * Compares, for the same Chapter 3 PDF:
 *   original parser bodyText  ->  Phase 2A classified blocks
 *   -> reconstructed source units  ->  typed facts from reconstructed units
 *   -> reference inventory matches  ->  unresolved visual/semantic units.
 *
 * Writes ONLY to diagnostics/ (this phase's versioned files). Never
 * overwrites Phase 1 or Phase 2A files, never regenerates banks, never
 * touches the production question path (analyzeSource is run in its exact
 * production call form for the reproduction check only).
 *
 * Guarded by require.main === module; safe to require() for the exported
 * matcher (used by pwa/tests/test_phase2b.js).
 *
 * Input resolution (same as Phase 2A): the spec path NCERT/hees203.pdf
 * does not exist in the checkout (NCERT/ holds only .gitkeep). The PDF
 * used is /home/hatch/workspace/ncert_pdfs/hees203.pdf, SHA-256
 * 547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec.
 * No PDF is committed to the repo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const REPO = path.join(__dirname, '..', '..');
const DIAG = path.join(REPO, 'diagnostics');
const PDF_PATH = process.env.NCERT_CH3_PDF
  || '/home/hatch/workspace/ncert_pdfs/hees203.pdf';
const DOCUMENT_ID = 'hees203';
const BASELINE_COMMIT = '59e5372243a80e90c51448fd7158d57c52dbb4d2';

// ------------------------------------------------------------------
// Reference matching, Phase 2B tiers (exported for tests).
//   exact_span               — collapsed quotation is a substring of
//                              exactly one block's text (as in 2A).
//   normalized_text          — normalized quotation is a substring of
//                              exactly one block's normalized text.
//   multi_block_ordered_span — normalized quotation is a substring of
//                              exactly one reconstructed unit's
//                              normalized text (content split across
//                              blocks, joined by reconstruction).
//   candidate_fuzzy          — REVIEW ONLY: best content-word overlap
//                              with a reconstructed unit on the entry's
//                              own page is >= 0.80. Never auto-counted
//                              as verified coverage.
//   ambiguous_review         — more than one match at the best level:
//                              NEVER silently pick one.
//   unresolved_match         — no match at any level.
// A fuzzy candidate is not proof of a source match. Confirmed matches
// are tiers 1–3 with a single match; everything else is review or
// unresolved. Returns { match_method, disposition, unit_id, block_id,
// page, block_ids, score, candidates }.
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

const STOPWORDS = new Set('the a an of in on at to for and or is are was were be been it its this that these those with by from as'.split(' '));
function contentWords(text) {
  return [...new Set(normalizeReferenceText(text).split(' ')
    .filter((w) => w && !STOPWORDS.has(w) && w.length > 2))];
}

function matchReferenceEntryPhase2b(entry, blocks, reconUnits) {
  const quotation = entry.quotation || entry.quote || '';
  const collapsed = collapseWhitespace(quotation);
  const normalized = normalizeReferenceText(quotation);
  const blockList = Array.isArray(blocks) ? blocks : [];
  const unitList = Array.isArray(reconUnits) ? reconUnits : [];

  const exactHits = blockList.filter((b) => collapsed && collapseWhitespace(b.text).includes(collapsed));
  if (exactHits.length === 1) {
    return { match_method: 'exact_span', disposition: 'matched', unit_id: null, block_id: exactHits[0].block_id, page: exactHits[0].page, block_ids: [exactHits[0].source_block_id], score: null, candidates: [] };
  }
  if (exactHits.length > 1) {
    return { match_method: 'ambiguous_review', disposition: 'review_required', unit_id: null, block_id: null, page: null, block_ids: [], score: null, candidates: exactHits.map((b) => b.block_id) };
  }
  const normHits = blockList.filter((b) => normalized && normalizeReferenceText(b.text).includes(normalized));
  if (normHits.length === 1) {
    return { match_method: 'normalized_text', disposition: 'matched', unit_id: null, block_id: normHits[0].block_id, page: normHits[0].page, block_ids: [normHits[0].source_block_id], score: null, candidates: [] };
  }
  if (normHits.length > 1) {
    return { match_method: 'ambiguous_review', disposition: 'review_required', unit_id: null, block_id: null, page: null, block_ids: [], score: null, candidates: normHits.map((b) => b.block_id) };
  }
  const unitHits = unitList.filter((u) => normalized && u.text
    && normalizeReferenceText(u.text).includes(normalized));
  if (unitHits.length === 1) {
    return { match_method: 'multi_block_ordered_span', disposition: 'matched', unit_id: unitHits[0].unit_id, block_id: null, page: unitHits[0].pages[0], block_ids: unitHits[0].block_ids.slice(), score: null, candidates: [] };
  }
  if (unitHits.length > 1) {
    return { match_method: 'ambiguous_review', disposition: 'review_required', unit_id: null, block_id: null, page: null, block_ids: [], score: null, candidates: unitHits.map((u) => u.unit_id) };
  }
  // Fuzzy candidate tier: content-word overlap with reconstructed units
  // on the entry's own page only. A tie at the top score is ambiguous.
  const entryPage = entry.pdf_page != null ? entry.pdf_page : null;
  const quoteWords = contentWords(quotation);
  let best = null;
  let bestScore = 0;
  let bestCount = 0;
  unitList.forEach((u) => {
    if (entryPage != null && !(u.pages || []).includes(entryPage)) return;
    if (!u.text) return;
    const unitWords = new Set(contentWords(u.text));
    const hits = quoteWords.filter((w) => unitWords.has(w)).length;
    const score = quoteWords.length ? hits / quoteWords.length : 0;
    if (score > bestScore + 0.001) {
      bestScore = score;
      best = u;
      bestCount = 1;
    } else if (score > 0 && Math.abs(score - bestScore) <= 0.001) {
      bestCount++;
    }
  });
  if (best && bestScore >= 0.8) {
    if (bestCount > 1) {
      return { match_method: 'ambiguous_review', disposition: 'review_required', unit_id: null, block_id: null, page: entryPage, block_ids: [], score: bestScore, candidates: ['multiple_units_at_score_' + bestScore.toFixed(2)] };
    }
    return { match_method: 'candidate_fuzzy', disposition: 'review_required', unit_id: best.unit_id, block_id: null, page: best.pages[0], block_ids: best.block_ids.slice(), score: bestScore, candidates: [best.unit_id] };
  }
  return { match_method: 'unresolved_match', disposition: 'unresolved_match', unit_id: null, block_id: null, page: null, block_ids: [], score: bestScore > 0 ? bestScore : null, candidates: [] };
}

// ------------------------------------------------------------------
// Case verification helpers (exported for tests).
// ------------------------------------------------------------------
function unitContains(unit, substrings) {
  const text = normalizeReferenceText(unit.text);
  return substrings.every((s) => text.includes(normalizeReferenceText(s)));
}

function verifyCase(name, condition, detail) {
  return { case: name, pass: !!condition, detail: detail || '' };
}

async function main() {
  if (!Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () { return Buffer.from(this).toString('hex'); };
  }
  if (!Math.sumPrecise) {
    Math.sumPrecise = function (arr) { let sum = 0; for (const n of arr) sum += Number(n) || 0; return sum; };
  }

  const Parser = require(path.join(REPO, 'pwa/engine/pdfParser.js'));
  const Analysis = require(path.join(REPO, 'pwa/engine/analyze.js'));
  const Engine = require(path.join(REPO, 'pwa/engine/generator.js'));
  const DocumentModel = require(path.join(REPO, 'pwa/engine/documentModel.js'));
  const SourceReconstruction = require(path.join(REPO, 'pwa/engine/sourceReconstruction.js'));

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  console.log('PDF: ' + PDF_PATH);
  console.log('SHA256: ' + pdfHash);

  const pdfjs = await import(pathToFileURL(path.join(REPO, 'pwa/vendor/pdfjs/pdf.mjs')).href);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true
  }).promise;
  const totalPages = doc.numPages;

  const pageLayouts = [];
  let bodyTextTotal = 0;
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const layout = await Parser.extractPageLayout(page, pageNum);
    pageLayouts.push({
      pageNumber: layout.pageNumber, blocks: layout.blocks, stats: layout.stats,
      bodyText: layout.bodyText, bodyOnlyText: layout.bodyOnlyText
    });
    bodyTextTotal += (layout.bodyText || '').length;
    page.cleanup();
  }

  // --- A. Production reproduction (exact production call form) ---
  const pagesText = [];
  pageLayouts.forEach((layout) => {
    if ((layout.bodyText || '').length > 30) {
      pagesText.push('==Page ' + layout.pageNumber + '==\n' + layout.bodyText);
    }
  });
  const title = 'NCERT Class 8 Art & Heritage — Chapter 3: A Journey Through Indian Architecture';
  const rawDocumentText = '# ' + title + '\n\n' + pagesText.join('\n\n');
  const prodSourceMeta = { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' } };
  const analysis = Analysis.analyzeSource(rawDocumentText, title, prodSourceMeta, 15);
  const sections = analysis.sections || Engine.parseRawDocument(rawDocumentText, title);
  const bankPath = path.join(REPO, 'pwa/data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md');
  const bankText = fs.readFileSync(bankPath, 'utf-8');
  const stagedStems = [];
  const stemRe = /\*\*Stem:\*\*\n> ([^\n]+)/g;
  let stemMatch;
  while ((stemMatch = stemRe.exec(bankText)) !== null) stagedStems.push(stemMatch[1]);
  const reproducedStems = (analysis.questions || []).map((q) => q.stem || q.question || '');
  const reproducedCount = stagedStems.filter((s) => reproducedStems.includes(s)).length;
  console.log('Production reproduction: ' + reproducedCount + '/' + stagedStems.length + ' staged stems');

  // --- B. Document model + reconstruction (shadow) ---
  const docModel = DocumentModel.buildStructuredDocument(pageLayouts, {
    documentId: DOCUMENT_ID, sourceTitle: title
  });
  const recon = SourceReconstruction.reconstructDocument(docModel, { documentId: DOCUMENT_ID });
  console.log('Reconstruction: ' + recon.units.length + ' units, reconciliation ok=' + recon.reconciliation.ok);

  // --- C. Typed knowledge: Phase 2A baseline vs reconstructed adapter ---
  const typedOld = Engine.buildTypedKnowledge(sections, {
    sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: DOCUMENT_ID
  });
  const typedNew = Engine.buildTypedKnowledgeFromReconstructedUnits(recon.units, {
    sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: DOCUMENT_ID
  });
  const normFactKey = (f) => f.fact_type + '|' + (f.normalized_subject || '')
    + '|' + (f.normalized_object || '');
  const oldKeys = new Set(typedOld.typed_facts.map(normFactKey));
  const newKeys = new Set(typedNew.typed_facts.map(normFactKey));
  const sharedKeys = [...newKeys].filter((k) => oldKeys.has(k));
  const newOnlyKeys = [...newKeys].filter((k) => !oldKeys.has(k));
  const lostKeys = [...oldKeys].filter((k) => !newKeys.has(k));
  // Cross-page merged units duplicate passage facts when the from/to
  // block already contains complete sentences: dedupe by fact key.
  const seenKeys = new Set();
  let duplicateMergedFacts = 0;
  typedNew.typed_facts.forEach((f) => {
    const key = normFactKey(f);
    if (seenKeys.has(key)) {
      if (f.source.evidence_source === 'cross_page_merged') duplicateMergedFacts++;
    } else {
      seenKeys.add(key);
    }
  });
  const typedComparison = {
    old_typed_facts_total: typedOld.typed_facts.length,
    new_typed_facts_total_raw: typedNew.typed_facts.length,
    new_typed_facts_unique_by_key: seenKeys.size,
    duplicate_merged_facts: duplicateMergedFacts,
    shared_fact_keys: sharedKeys.length,
    new_only_fact_keys: newOnlyKeys.length,
    lost_fact_keys: lostKeys.length,
    new_only_keys: newOnlyKeys,
    lost_keys: lostKeys
  };
  console.log('Typed old vs new: ' + JSON.stringify({
    old: typedComparison.old_typed_facts_total,
    newRaw: typedComparison.new_typed_facts_total_raw,
    newUnique: typedComparison.new_typed_facts_unique_by_key,
    shared: typedComparison.shared_fact_keys,
    newOnly: typedComparison.new_only_fact_keys,
    lost: typedComparison.lost_fact_keys
  }));

  // --- D. Reference-inventory linkage (new versioned matrix) ---
  const inventory = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_knowledge_inventory.json'), 'utf-8'));
  const phase1Matrix = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_coverage_matrix.json'), 'utf-8'));
  const phase2aMatrix = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_phase2a_coverage_matrix.json'), 'utf-8'));
  const phase1ById = {};
  (Array.isArray(phase1Matrix) ? phase1Matrix : (phase1Matrix.rows || [])).forEach((row) => {
    phase1ById[row.inventory_id || row.entry_id || row.id] = row;
  });
  const phase2aById = {};
  (Array.isArray(phase2aMatrix) ? phase2aMatrix : (phase2aMatrix.rows || [])).forEach((row) => {
    phase2aById[row.entry_id || row.inventory_id || row.id] = row;
  });
  const inventoryEntries = Array.isArray(inventory) ? inventory : (inventory.entries || []);
  const wordsByPage = {};
  docModel.blocks.forEach((b) => {
    (wordsByPage[b.page] || (wordsByPage[b.page] = new Set()));
    contentWords(b.text).forEach((w) => wordsByPage[b.page].add(w));
  });
  const matrixRows = inventoryEntries.map((entry) => {
    const match = matchReferenceEntryPhase2b(entry, docModel.blocks, recon.units);
    let linkedFactIds = [];
    if (match.disposition === 'matched' && match.unit_id) {
      linkedFactIds = typedNew.typed_facts
        .filter((f) => f.source.reconstructed_unit_id === match.unit_id)
        .map((f) => f.fact_id);
    } else if (match.disposition === 'matched' && match.block_id) {
      linkedFactIds = typedNew.typed_facts
        .filter((f) => (f.source.block_ids || []).includes(
          match.block_ids[0] || ''))
        .map((f) => f.fact_id);
    }
    const phase1 = phase1ById[entry.id || entry.entry_id] || {};
    const phase2a = phase2aById[entry.id || entry.entry_id] || {};
    const row = {
      entry_id: entry.id || entry.entry_id,
      pdf_page: entry.pdf_page != null ? entry.pdf_page : null,
      book_page: entry.book_page != null ? entry.book_page : null,
      section: entry.section || null,
      importance: entry.importance || null,
      question_suitable: entry.question_suitable != null ? entry.question_suitable : null,
      reference_quotation: entry.quote || entry.quotation || null,
      block_match: match,
      typed_fact_ids: linkedFactIds,
      typed_fact_linkage: linkedFactIds.length > 0 ? 'linked' : 'unlinked',
      phase2a_match_method: (phase2a.block_match && phase2a.block_match.match_method) || null,
      question_coverage_phase1: phase1.coverage_status || null,
      question_coverage_phase1_provenance: 'carried from chapter_3_coverage_matrix.json (Phase 1 verdict, not re-judged in Phase 2B)'
    };
    if (match.disposition === 'unresolved_match') {
      const quoteWords = contentWords(row.reference_quotation);
      const pageWords = wordsByPage[row.pdf_page] || new Set();
      const hits = quoteWords.filter((w) => pageWords.has(w)).length;
      row.page_word_overlap = quoteWords.length ? hits / quoteWords.length : null;
    }
    return row;
  });
  const linkageSummary = {
    entries_total: matrixRows.length,
    matched_exact_span: matrixRows.filter((r) => r.block_match.match_method === 'exact_span').length,
    matched_normalized_text: matrixRows.filter((r) => r.block_match.match_method === 'normalized_text').length,
    matched_multi_block_ordered_span: matrixRows.filter((r) => r.block_match.match_method === 'multi_block_ordered_span').length,
    matched_total_confirmed: matrixRows.filter((r) => r.block_match.disposition === 'matched').length,
    review_required_candidate_fuzzy: matrixRows.filter((r) => r.block_match.match_method === 'candidate_fuzzy').length,
    review_required_ambiguous: matrixRows.filter((r) => r.block_match.match_method === 'ambiguous_review').length,
    review_required_total: matrixRows.filter((r) => r.block_match.disposition === 'review_required').length,
    unresolved_total: matrixRows.filter((r) => r.block_match.disposition === 'unresolved_match').length,
    typed_fact_linked: matrixRows.filter((r) => r.typed_fact_linkage === 'linked').length,
    typed_fact_unlinked: matrixRows.filter((r) => r.typed_fact_linkage === 'unlinked').length
  };
  console.log('Reference linkage: ' + JSON.stringify(linkageSummary));

  // --- E. Case verification against the actual PDF blocks ---
  const unitsOnPage = (p) => recon.units.filter((u) => (u.pages || []).includes(p));
  const aggregateInAnyUnit = recon.units.some((u) => (u.block_ids || []).includes('p14-b2')
    || (u.block_ids || []).includes('p22-b5'));
  const wellsUnit = unitsOnPage(14).find((u) => u.type === 'body_prose'
    && unitContains(u, ['Wells have been constructed', 'stepwells offered a social space']));
  const threatsUnit = unitsOnPage(14).find((u) => u.type === 'body_prose'
    && unitContains(u, ['depleted water sources', 'waste dumping']));
  const nandiUnit = unitsOnPage(17).find((u) => u.type === 'body_prose'
    && unitContains(u, ['massive Nandi', 'carved from a single stone']));
  const jamaUnit = unitsOnPage(22).find((u) => u.type === 'body_prose'
    && unitContains(u, ['was built by Sultan Ahmed Shah I', 'jama means', 'masjid means']));
  const fig329Unit = unitsOnPage(22).find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.29');
  const glossUnit = unitsOnPage(26).find((u) => u.type === 'glossary_definition' && u.term === 'Latticework');
  const mehrangarhUnit = unitsOnPage(26).find((u) => u.type === 'body_prose'
    && unitContains(u, ['The construction of the Mehrangarh Fort in Rajasthan']));
  const fig352Unit = unitsOnPage(38).find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.52');
  const fig353Unit = unitsOnPage(38).find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.53');
  const fig353Facts = fig353Unit ? typedNew.typed_facts.filter((f) =>
    f.source.reconstructed_unit_id === fig353Unit.unit_id
    && (f.subject || '').includes('Madras High Court')
    && (f.object || '').toLowerCase().includes('dome')) : [];
  const fig329Facts = fig329Unit ? typedNew.typed_facts.filter((f) =>
    f.source.reconstructed_unit_id === fig329Unit.unit_id
    && (f.subject || '').includes('Ahmedabad')) : [];
  const p3BodyProse = unitsOnPage(3).filter((u) => u.type === 'body_prose' || u.type === 'table' || u.type === 'glossary_definition');
  const p3DateFacts = typedNew.typed_facts.filter((f) => (f.source.page_range || []).includes(3) && f.fact_type === 'date');
  const mapFacts = typedNew.typed_facts.filter((f) =>
    (f.source.page_range || []).some((p) => p === 4 || p === 5));
  const caseChecks = [
    verifyCase('case1_wells_stepwells', !!wellsUnit,
      wellsUnit ? 'unit ' + wellsUnit.unit_id + ' blocks ' + wellsUnit.block_ids.join(',') : 'no unit'),
    verifyCase('case1_aggregate_never_prose_source', !aggregateInAnyUnit,
      'p14-b2/p22-b5 in a unit: ' + aggregateInAnyUnit),
    verifyCase('case1_threats_sentence', !!threatsUnit,
      threatsUnit ? 'unit ' + threatsUnit.unit_id : 'no unit'),
    verifyCase('case2_nandi_sentence_no_furniture', !!nandiUnit
      && !normalizeReferenceText(nandiUnit.text).includes('ourculturalheritage'),
      nandiUnit ? 'unit ' + nandiUnit.unit_id + ' flags ' + (nandiUnit.review_flags || []).join(',') : 'no unit'),
    verifyCase('case2_false_heading_demoted', !!nandiUnit
      && (nandiUnit.review_flags || []).includes('contains_demoted_heading')
      && (nandiUnit.review_flags || []).includes('section_corrected_from_demoted_heading'),
      nandiUnit ? 'flags ' + (nandiUnit.review_flags || []).join(',') : 'no unit'),
    verifyCase('case3_jama_builder_etymology', !!jamaUnit,
      jamaUnit ? 'unit ' + jamaUnit.unit_id : 'no unit'),
    verifyCase('case3_fig329_caption_no_referent', !!fig329Unit && fig329Facts.length === 0,
      fig329Unit ? 'unit ' + fig329Unit.unit_id + ' binding facts ' + fig329Facts.length : 'no unit'),
    verifyCase('case4_latticework_gloss', !!glossUnit
      && unitContains(glossUnit, ['functional (allowing ventilation)', 'aesthetic in design']),
      glossUnit ? 'unit ' + glossUnit.unit_id + ' blocks ' + glossUnit.block_ids.join(',') : 'no unit'),
    verifyCase('case4_mehrangarh_subject', !!mehrangarhUnit,
      mehrangarhUnit ? 'unit ' + mehrangarhUnit.unit_id : 'no unit'),
    verifyCase('case5_fig352_caption', !!fig352Unit
      && unitContains(fig352Unit, ['Madras High Court, completed in 1892', 'red sandstone', 'Islamic arches', 'Hindu temple style']),
      fig352Unit ? 'unit ' + fig352Unit.unit_id : 'no unit'),
    verifyCase('case5_fig353_pronoun_unresolved', !!fig353Unit && fig353Facts.length === 0,
      fig353Unit ? 'unit ' + fig353Unit.unit_id + ' binding facts ' + fig353Facts.length : 'no unit'),
    verifyCase('timeline_no_body_prose_no_date_facts', p3BodyProse.length === 0 && p3DateFacts.length === 0,
      'p3 prose/table/gloss units ' + p3BodyProse.length + ', date facts ' + p3DateFacts.length),
    verifyCase('map_no_typed_facts', mapFacts.length === 0,
      'typed facts from pp.4-5 units: ' + mapFacts.length)
  ];
  caseChecks.forEach((c) => console.log('CASE ' + c.case + ': ' + (c.pass ? 'PASS' : 'FAIL') + ' — ' + c.detail));

  // --- F. Visual-dependency records (timeline + map, block level) ---
  const visualRecord = (pages) => pages.map((p) => ({
    pdf_page: p,
    blocks: docModel.blocks.filter((b) => b.page === p
      && b.type !== 'page_furniture'
      && !recon.exclusions.some((e) => e.block_id === b.source_block_id && e.reason === 'aggregate_duplicates_granular_segments'))
      .map((b) => ({ block_id: b.source_block_id, type: b.type, text: b.text }))
  }));
  const timelineRecord = visualRecord([3]);
  const mapRecord = visualRecord([4, 5]);

  // --- G. Outputs ---
  const metrics = {
    version: 'phase2b-1',
    baseline_commit: BASELINE_COMMIT,
    pdf_path: PDF_PATH,
    pdf_sha256: pdfHash,
    pdf_pages: totalPages,
    body_text: { total_chars: bodyTextTotal, pages_with_body_text: pagesText.length },
    production_reproduction: {
      staged_stems: stagedStems.length,
      reproduced_stems: reproducedCount,
      production_questions: (analysis.bank || []).length
    },
    document_model_accounting: docModel.accounting,
    document_model_reconciliation: docModel.reconciliation,
    reconstruction_accounting: recon.accounting,
    reconstruction_reconciliation: recon.reconciliation,
    reconstruction_exclusions_by_reason: recon.accounting.exclusions_by_reason,
    typed_old_accounting: typedOld.accounting,
    typed_new_accounting: typedNew.accounting,
    typed_comparison: typedComparison,
    typed_new_facts: typedNew.typed_facts.map((f) => ({
      fact_id: f.fact_id, fact_type: f.fact_type,
      subject: f.subject, relation: f.relation, object: f.object,
      evidence: f.evidence, evidence_source: f.source.evidence_source,
      reconstructed_unit_id: f.source.reconstructed_unit_id,
      block_ids: f.source.block_ids, page_range: f.source.page_range,
      validation_state: f.validation_state
    })),
    reference_linkage_summary: linkageSummary,
    case_checks: caseChecks,
    timeline_record: timelineRecord,
    map_record: mapRecord,
    unresolved_units: recon.units.filter((u) => u.type === 'unresolved').map((u) => ({
      unit_id: u.unit_id, pages: u.pages, block_ids: u.block_ids,
      certainty: u.certainty, review_flags: u.review_flags, text: u.text.slice(0, 200)
    })),
    limitations: [
      'Browser layout path not verified: layouts come from the vendored pdf.js build under Node (same code as browser/worker) with batch polyfills; no real browser run was performed and none is claimed.',
      'Merged cross-page units duplicate complete sentences already present in per-page passages; merged facts are deduped by fact key in typed_comparison, and raw counts are reported alongside unique counts.',
      'Glossary definition facts and wells/stepwells facts are not yet produced by the typed parsers (unsupported_pattern): reconstruction success and classification success are separate outcomes.',
      'Caption typing is partial: only the Fig. 3.52 date fact types from captions in this chapter; other caption claims remain unparsed with reasons.'
    ]
  };
  fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2b_metrics.json'),
    JSON.stringify(metrics, null, 2));
  const matrixDoc = {
    version: 'phase2b-1',
    baseline_commit: BASELINE_COMMIT,
    pdf_sha256: pdfHash,
    entries_total: matrixRows.length,
    linkage_summary: linkageSummary,
    match_levels: [
      'exact_span (confirmed)', 'normalized_text (confirmed)',
      'multi_block_ordered_span (confirmed, single unit)',
      'candidate_fuzzy >= 0.80 on entry page (REVIEW ONLY, never auto-counted as coverage)',
      'ambiguous_review (multiple matches, review required)',
      'unresolved_match'
    ],
    rows: matrixRows
  };
  fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2b_coverage_matrix.json'),
    JSON.stringify(matrixDoc, null, 2));
  console.log('Wrote diagnostics/chapter_3_phase2b_metrics.json and diagnostics/chapter_3_phase2b_coverage_matrix.json');
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = {
  normalizeReferenceText: normalizeReferenceText,
  matchReferenceEntryPhase2b: matchReferenceEntryPhase2b,
  unitContains: unitContains,
  verifyCase: verifyCase
};
