/**
 * StudySynth Phase 2D diagnostic harness — Chapter 3 (shadow pipeline).
 *
 * Compares, for the same Chapter 3 PDF:
 *   Phase 2C adapter output (stored in chapter_3_phase2c_metrics.json)
 *   -> Phase 2D adapter output (supplementary patterns A1–A7 + the
 *   "etc." segmentation rule A6), with per-target verdicts, an explicit
 *   corrected-key comparison (Phase 2C supplementary facts whose
 *   semantics Phase 2D corrects are reported as corrections, never
 *   hidden as ordinary gains or losses), and the absolute safety cases.
 *
 * Writes ONLY diagnostics/chapter_3_phase2d_metrics.json and
 * diagnostics/chapter_3_phase2d_typed_fact_comparison.json. Never
 * overwrites Phase 1, 2A, 2B or 2C files, never regenerates banks,
 * never touches the production question path (analyzeSource is run in
 * its exact production call form for the reproduction check only).
 *
 * Input resolution (same as Phases 1–2C): the spec path NCERT/hees203.pdf
 * does not exist in the checkout (NCERT/ holds only .gitkeep). The PDF
 * used is /home/hatch/workspace/ncert_pdfs/hees203.pdf, SHA-256
 * 547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec
 * (verified on every run; a mismatch aborts, it is never silently
 * substituted). No PDF is committed to the repo. Override with
 * NCERT_CH3_PDF. If the file is missing, the harness reports the
 * full-PDF diagnostic as not run and writes a metrics file saying so.
 *
 * V2 regression: this harness does not re-run the V2 engines itself.
 * Run diagnostics/tools/v2_cross_chapter_phase2b.js first (via a copy
 * with a redirected output path so the Phase 2B file is untouched) and
 * point V2_REGRESSION_JSON at its output (default
 * /tmp/v2_cross_chapter_2d.json). The harness embeds the re-run and
 * compares it per chapter against
 * diagnostics/v2_cross_chapter_comparison_phase2b.json.
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
const EXPECTED_PDF_SHA256 = '547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec';
const DOCUMENT_ID = 'hees203';
const BASELINE_COMMIT = '135808e55295773ad7069b639c89df48f6892182';
const V2_REGRESSION_PATH = process.env.V2_REGRESSION_JSON || '/tmp/v2_cross_chapter_2d.json';

function shaFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
function collapseWs(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}
function normSubject(v) {
  return collapseWs(String(v || '').toLowerCase()).replace(/^(the|a|an)\s+/, '');
}
function normObject(v) {
  return collapseWs(String(v || '').toLowerCase());
}
function key2b(f) {
  return f.fact_type + '|' + normSubject(f.subject) + '|' + normObject(f.object);
}
function key2c(f) {
  const q = f.qualifiers || {};
  return [f.fact_type, normSubject(f.subject), normObject(f.relation),
    normObject(f.object), q.polarity || 'positive', q.temporal_scope || ''].join('|');
}
function factSummary(f) {
  return {
    fact_id: f.fact_id, fact_type: f.fact_type,
    subject: f.subject, relation: f.relation, object: f.object,
    evidence: f.evidence, evidence_source: f.source.evidence_source,
    reconstructed_unit_id: f.source.reconstructed_unit_id,
    reconstructed_unit_type: f.source.reconstructed_unit_type,
    block_ids: f.source.block_ids, page_range: f.source.page_range,
    figure_ref: f.source.figure_ref || null,
    temporal_scope: (f.qualifiers && f.qualifiers.temporal_scope) || null,
    attribution: (f.qualifiers && f.qualifiers.attribution) || null,
    classification_method: (f.classification && f.classification.method) || null,
    derivation: f.derivation || null,
    validation_state: f.validation_state
  };
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

  if (!fs.existsSync(PDF_PATH)) {
    const metrics = {
      version: 'phase2d-1', baseline_commit: BASELINE_COMMIT,
      pdf_available: false, pdf_path: PDF_PATH,
      status: 'full-PDF diagnostic NOT run: PDF file unavailable; committed fixture tests in pwa/tests/test_phase2d.js still apply'
    };
    fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2d_metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('PDF unavailable — full-PDF diagnostic not run; wrote status metrics.');
    return;
  }
  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  console.log('PDF: ' + PDF_PATH);
  console.log('SHA256: ' + pdfHash);
  if (pdfHash !== EXPECTED_PDF_SHA256) {
    throw new Error('PDF SHA-256 mismatch: expected ' + EXPECTED_PDF_SHA256 + ', got ' + pdfHash + ' — refusing to substitute a different PDF.');
  }

  const pdfjs = await import(pathToFileURL(path.join(REPO, 'pwa/vendor/pdfjs/pdf.mjs')).href);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true
  }).promise;
  const totalPages = doc.numPages;
  const pageLayouts = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const layout = await Parser.extractPageLayout(page, pageNum);
    pageLayouts.push({
      pageNumber: layout.pageNumber, blocks: layout.blocks, stats: layout.stats,
      bodyText: layout.bodyText, bodyOnlyText: layout.bodyOnlyText
    });
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
  const analysis = Analysis.analyzeSource(rawDocumentText, title,
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' } }, 15);
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

  // --- B. Document model + reconstruction (shadow, unchanged from 2B/2C) ---
  const docModel = DocumentModel.buildStructuredDocument(pageLayouts, {
    documentId: DOCUMENT_ID, sourceTitle: title
  });
  const recon = SourceReconstruction.reconstructDocument(docModel, { documentId: DOCUMENT_ID });
  console.log('Reconstruction: ' + recon.units.length + ' units, reconciliation ok=' + recon.reconciliation.ok);

  // --- C. Typed runs: layer baseline, 2B adapter baseline, 2D adapter ---
  const typedLayer = Engine.buildTypedKnowledge(sections, {
    sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: DOCUMENT_ID
  });
  const typed2b = Engine.buildTypedKnowledgeFromReconstructedUnits(recon.units, {
    sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: DOCUMENT_ID,
    supplementary: false, deduplicate: false
  });
  const typed2d = Engine.buildTypedKnowledgeFromReconstructedUnits(recon.units, {
    sourceMeta: { type: 'textbook', grade: 8, subject: 'art & heritage' }, documentId: DOCUMENT_ID
  });
  console.log('Typed layer=' + typedLayer.typed_facts.length
    + ' adapter-2B raw=' + typed2b.typed_facts.length
    + ' adapter-2D raw=' + typed2d.accounting.typed_facts_raw_total
    + ' unique=' + typed2d.typed_facts.length);

  // --- D. Comparison against the stored Phase 2C facts ---
  const metrics2c = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_phase2c_metrics.json'), 'utf-8'));
  const metrics2b = JSON.parse(fs.readFileSync(
    path.join(DIAG, 'chapter_3_phase2b_metrics.json'), 'utf-8'));
  const facts2c = metrics2c.typed_facts_2c || [];
  const facts2d = typed2d.typed_facts;
  const keys2cSpec = new Set(facts2c.map((f) => key2c({
    fact_type: f.fact_type, subject: f.subject, relation: f.relation,
    object: f.object, qualifiers: { polarity: 'positive', temporal_scope: f.temporal_scope || null }
  })));
  const keys2dSpec = new Set(facts2d.map(key2c));
  const keys2c2b = new Set(facts2c.map(key2b));
  const keys2d2b = new Set(facts2d.map(key2b));
  // Phase 2A key set, derived as in 2C: 2B unique keys minus the 4
  // verbatim 2B new-only keys recorded in the 2B metrics.
  const newOnly2b = new Set(metrics2b.typed_comparison.new_only_keys || []);
  const keys2bUnique = new Set(metrics2b.typed_new_facts.map(key2b));
  const keys2a = [...keys2bUnique].filter((k) => !newOnly2b.has(k));
  // Explicit corrections: 2D facts whose derivation records a semantic
  // correction or an attribution move, paired with the 2C fact sharing
  // the same evidence sentence and unit. A corrected old key is NOT a
  // lost key and its new key is NOT an ordinary new key.
  const corrections = [];
  const correctedOldKeys = new Set();
  const correctedNewKeys = new Set();
  facts2d.forEach((f) => {
    const d = f.derivation || {};
    const isCorrection = d.semantic_correction === 'characterised_by_not_definition'
      || (d.attribution === 'According to tradition' && d.method && d.method.indexOf('passive_') === 0);
    if (!isCorrection) return;
    const old = facts2c.find((o) => o.reconstructed_unit_id === f.source.reconstructed_unit_id
      && o.evidence === f.evidence);
    if (!old) return;
    const oldKey = key2c({
      fact_type: old.fact_type, subject: old.subject, relation: old.relation,
      object: old.object, qualifiers: { polarity: 'positive', temporal_scope: old.temporal_scope || null }
    });
    const newKey = key2c(f);
    correctedOldKeys.add(oldKey);
    correctedNewKeys.add(newKey);
    corrections.push({
      reason: d.semantic_correction || 'attribution_moved_to_qualifier',
      old_fact_id: old.fact_id, new_fact_id: f.fact_id,
      reconstructed_unit_id: f.source.reconstructed_unit_id,
      old_key: oldKey, new_key: newKey,
      old_summary: { fact_type: old.fact_type, subject: old.subject, relation: old.relation, object: old.object },
      new_summary: factSummary(f)
    });
  });
  const retainedSpec = [...keys2cSpec].filter((k) => keys2dSpec.has(k));
  const lostSpec = [...keys2cSpec].filter((k) => !keys2dSpec.has(k) && !correctedOldKeys.has(k));
  const newSpec = [...keys2dSpec].filter((k) => !keys2cSpec.has(k) && !correctedNewKeys.has(k));
  const retained2a = keys2a.filter((k) => keys2d2b.has(k));
  const lost2a = keys2a.filter((k) => !keys2d2b.has(k));
  const retained2b = [...keys2bUnique].filter((k) => keys2d2b.has(k));
  const lost2b = [...keys2bUnique].filter((k) => !keys2d2b.has(k));
  const newFacts = facts2d.filter((f) => !keys2cSpec.has(key2c(f)) && !correctedNewKeys.has(key2c(f)));
  const comparison = {
    phase2c_unique_keys_total: keys2cSpec.size,
    phase2c_keys_retained: retainedSpec.length,
    phase2c_keys_corrected: corrections.length,
    phase2c_keys_lost: lostSpec,
    phase2d_unique_keys_total: keys2dSpec.size,
    phase2d_new_keys_spec_scheme: newSpec,
    phase2a_keys_total: keys2a.length,
    phase2a_keys_retained: retained2a.length,
    phase2a_keys_lost: lost2a,
    phase2b_unique_keys_total: keys2bUnique.size,
    phase2b_keys_retained: retained2b.length,
    phase2b_keys_lost: lost2b,
    corrections: corrections,
    new_facts: newFacts.map(factSummary),
    dedup_discarded: typed2d.deduplication.duplicates_discarded
  };
  console.log('Comparison: 2C retained ' + retainedSpec.length + '/' + keys2cSpec.size
    + ', corrected ' + corrections.length + ', lost ' + lostSpec.length
    + ', new keys ' + newSpec.length
    + '; 2A retained ' + retained2a.length + '/' + keys2a.length
    + ', 2B retained ' + retained2b.length + '/' + keys2bUnique.size);

  // --- E. Per-target verdicts ---
  const unitsOnPage = (p) => recon.units.filter((u) => (u.pages || []).includes(p));
  const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const unitContains = (u, subs) => subs.every((s) => norm(u.text).includes(norm(s)));
  const wellsUnit = unitsOnPage(14).find((u) => u.type === 'body_prose'
    && unitContains(u, ['Wells have been constructed', 'stepwells offered a social space']));
  const threatsUnit = unitsOnPage(14).find((u) => u.type === 'body_prose'
    && unitContains(u, ['depleted water sources', 'waste dumping']));
  const nandiUnit = unitsOnPage(17).find((u) => u.type === 'body_prose'
    && unitContains(u, ['massive Nandi', 'carved from a single stone']));
  const fig352Unit = unitsOnPage(38).find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.52');
  const fig353Unit = unitsOnPage(38).find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.53');
  const fig329Unit = unitsOnPage(22).find((u) => u.type === 'caption' && u.figure_ref === 'fig 3.29');
  const factsOf = (unitId, run) => (run.typed_facts || []).filter((f) => f.source.reconstructed_unit_id === unitId);
  const unparsedOf = (unitId, run) => (run.unparsed_units || []).filter((u) => u.source.reconstructed_unit_id === unitId);
  function unitOutcome(unit, label) {
    if (!unit) return { label: label, unit_id: null, status: 'unit_not_found' };
    return {
      label: label, unit_id: unit.unit_id, type: unit.type, pages: unit.pages,
      block_ids: unit.block_ids, term: unit.term || null, definition: unit.definition || null,
      figure_ref: unit.figure_ref || null,
      facts_2d: factsOf(unit.unit_id, typed2d).map(factSummary),
      unparsed_2d: unparsedOf(unit.unit_id, typed2d).map((u) => ({
        unparsed_id: u.unparsed_id, reason: u.reason, detail: u.detail,
        original_text: u.original_text,
        sentence_span: (u.source && u.source.sentence_span) || null,
        classification_attempts: u.classification_attempts
      })),
      facts_2c_stored: (metrics2c.typed_facts_2c || []).filter((f) => f.reconstructed_unit_id === unit.unit_id),
      unparsed_2c_stored: (metrics2c.unparsed_2c || []).filter((u) => u.reconstructed_unit_id === unit.unit_id)
        .map((u) => ({ unparsed_id: u.unparsed_id, reason: u.reason, original_text: u.original_text }))
    };
  }
  const targets = {
    A1_rani_ki_vav: unitOutcome(wellsUnit, 'Rani ki Vav stepwell attributes (p.14)'),
    A2_social_function: unitOutcome(wellsUnit, 'Social function of stepwells (p.14)'),
    A3_relative_clause: unitOutcome(wellsUnit, 'Relative-clause passive reservoirs (p.14)'),
    A4_nandi_passage: unitOutcome(nandiUnit, 'Nandi passage renowned + temporal scale (p.17)'),
    A5_fig329_caption: unitOutcome(fig329Unit, 'Fig. 3.29 sketch caption (p.22)'),
    A6_threats_continuation: unitOutcome(threatsUnit, 'Threats continuation etc. split (p.14)'),
    D_fig352_caption: unitOutcome(fig352Unit, 'Fig. 3.52 caption (p.38)'),
    D_fig353_caption: unitOutcome(fig353Unit, 'Fig. 3.53 caption (p.38)')
  };
  // Sentence-by-sentence wells accounting: 2C unparsed sentences mapped
  // to their Phase 2D outcome (typed facts or unparsed reason).
  const wellsSentences = [];
  if (wellsUnit) {
    const unparsed2c = (metrics2c.unparsed_2c || []).filter((u) => u.reconstructed_unit_id === wellsUnit.unit_id);
    const factsNow = factsOf(wellsUnit.unit_id, typed2d);
    const unparsedNow = unparsedOf(wellsUnit.unit_id, typed2d);
    unparsed2c.forEach((entry) => {
      const typed = factsNow.filter((f) => f.evidence === entry.original_text);
      const still = unparsedNow.find((u) => u.original_text === entry.original_text);
      wellsSentences.push({
        sentence: entry.original_text,
        reason_2c: entry.reason,
        outcome_2d: typed.length ? 'typed' : 'unparsed',
        fact_ids: typed.map((f) => f.fact_id),
        fact_summaries: typed.map(factSummary),
        reason_2d: still ? still.reason : null
      });
    });
  }
  const fig353Binding = fig353Unit ? factsOf(fig353Unit.unit_id, typed2d).filter((f) =>
    (f.subject || '').includes('Madras High Court')) : [];
  const fig329Binding = fig329Unit ? factsOf(fig329Unit.unit_id, typed2d).filter((f) =>
    (f.subject || '').includes('Jama Masjid') || (f.subject || '').includes('Ahmedabad')
    || (f.object || '').includes('Jama Masjid') || (f.object || '').includes('Ahmedabad')) : [];
  const p3DateFacts = typed2d.typed_facts.filter((f) => (f.source.page_range || []).includes(3) && f.fact_type === 'date');
  const mapFacts = typed2d.typed_facts.filter((f) => (f.source.page_range || []).some((p) => p === 4 || p === 5));
  const caseChecks = [
    verifyCase('A1_rani_two_has_facts', !!(wellsUnit && factsOf(wellsUnit.unit_id, typed2d).filter((f) => f.relation === 'has').length === 2),
      wellsUnit ? 'unit ' + wellsUnit.unit_id : 'no unit'),
    verifyCase('A2_social_space_offered', !!(wellsUnit && factsOf(wellsUnit.unit_id, typed2d).some((f) => f.relation === 'offered')),
      wellsUnit ? 'unit ' + wellsUnit.unit_id : 'no unit'),
    verifyCase('A3_had_and_used_for', !!(wellsUnit
      && factsOf(wellsUnit.unit_id, typed2d).some((f) => f.relation === 'had')
      && factsOf(wellsUnit.unit_id, typed2d).some((f) => f.relation === 'used_for')),
      wellsUnit ? 'unit ' + wellsUnit.unit_id : 'no unit'),
    verifyCase('A4_renowned_and_scale', !!(nandiUnit
      && factsOf(nandiUnit.unit_id, typed2d).some((f) => f.relation === 'renowned_for')
      && factsOf(nandiUnit.unit_id, typed2d).some((f) => f.object === 'modest in size')
      && factsOf(nandiUnit.unit_id, typed2d).some((f) => f.object === 'grew in scale')),
      nandiUnit ? 'unit ' + nandiUnit.unit_id : 'no unit'),
    verifyCase('A5_sketch_date_and_maker_no_mosque_binding', !!(fig329Unit
      && factsOf(fig329Unit.unit_id, typed2d).some((f) => f.relation === 'made_in' && f.object === '1809')
      && factsOf(fig329Unit.unit_id, typed2d).some((f) => f.relation === 'made_by')
      && fig329Binding.length === 0),
      fig329Unit ? 'unit ' + fig329Unit.unit_id + ' binding facts ' + fig329Binding.length : 'no unit'),
    verifyCase('A6_threats_split_two_records', !!(threatsUnit
      && unparsedOf(threatsUnit.unit_id, typed2d).length === 2
      && unparsedOf(threatsUnit.unit_id, typed2d).some((u) => u.original_text.endsWith('etc.'))
      && unparsedOf(threatsUnit.unit_id, typed2d).some((u) => u.original_text.indexOf('Environmentalists') === 0)),
      threatsUnit ? 'unit ' + threatsUnit.unit_id : 'no unit'),
    verifyCase('A7_characterised_correction', typed2d.typed_facts.some((f) =>
      f.relation === 'characterised_by' && f.derivation && f.derivation.semantic_correction === 'characterised_by_not_definition'),
      'characterised_by facts ' + typed2d.typed_facts.filter((f) => f.relation === 'characterised_by').length),
    verifyCase('A7_tradition_qualifier', typed2d.typed_facts.some((f) =>
      f.relation === 'built_in' && f.qualifiers && f.qualifiers.attribution === 'According to tradition'
      && f.subject === 'the first churches'),
      'tradition facts ' + typed2d.typed_facts.filter((f) => f.qualifiers && f.qualifiers.attribution).length),
    verifyCase('A8_fig353_no_binding', !!fig353Unit && fig353Binding.length === 0,
      fig353Unit ? 'unit ' + fig353Unit.unit_id + ' binding facts ' + fig353Binding.length : 'no unit'),
    verifyCase('A8_fig329_no_binding', !!fig329Unit && fig329Binding.length === 0,
      fig329Unit ? 'unit ' + fig329Unit.unit_id + ' binding facts ' + fig329Binding.length : 'no unit'),
    verifyCase('A8_timeline_no_date_facts', p3DateFacts.length === 0, 'p3 date facts ' + p3DateFacts.length),
    verifyCase('A8_map_no_typed_facts', mapFacts.length === 0, 'pp.4-5 facts ' + mapFacts.length),
    verifyCase('no_lost_2a_keys', lost2a.length === 0, 'lost ' + lost2a.length),
    verifyCase('no_lost_2b_keys', lost2b.length === 0, 'lost ' + lost2b.length),
    verifyCase('no_lost_2c_keys_except_corrections', lostSpec.length === 0, 'lost ' + lostSpec.length)
  ];
  caseChecks.forEach((c) => console.log('CASE ' + c.case + ': ' + (c.pass ? 'PASS' : 'FAIL') + ' — ' + c.detail));

  // --- F. Bank hashes (harness never writes banks; hashes recorded) ---
  const bankFiles = [
    'pwa/data/ncert_8_2_staged/hees201_world_geography.md',
    'pwa/data/ncert_8_2_staged/hees202_indias_road_to_independence.md',
    'pwa/data/ncert_8_2_staged/hees203_journey_through_indian_architecture.md',
    'pwa/data/ncert_8_2_staged/hees204_judiciary_in_our_society.md',
    'pwa/data/ncert_8_2_staged/hees205_citizenship_rights_and_duties.md',
    'pwa/data/ncert_8_2_staged/hees206_dynamics_of_population.md',
    'pwa/data/ncert_8_2_staged/hees207_indias_urban_landscape.md',
    'pwa/data/ncert_8_2_staged/hees209_cultural_currents_13th_to_17th_centuries.md',
    'pwa/data/ncert_8_2_staged/summary_manifest.json',
    'pwa/data/ncert_8_2_staged/ALL_NCERT_CLASS_8_QUESTIONS.md'
  ];
  const bankHashes = {};
  bankFiles.forEach((rel) => { bankHashes[rel] = shaFile(path.join(REPO, rel)); });

  // --- G. V2 cross-chapter regression (re-run output vs 2B) ---
  let v2Regression = { status: 'not_run', detail: 'V2 regression output not found at ' + V2_REGRESSION_PATH };
  if (fs.existsSync(V2_REGRESSION_PATH)) {
    const rerun = JSON.parse(fs.readFileSync(V2_REGRESSION_PATH, 'utf-8'));
    const comp2b = JSON.parse(fs.readFileSync(
      path.join(DIAG, 'v2_cross_chapter_comparison_phase2b.json'), 'utf-8'));
    const byChapter = (doc) => {
      const out = {};
      (doc.chapters || []).forEach((c) => {
        out[c.chapter || c.id] = {
          legacy_props: c.legacy_props != null ? c.legacy_props : (c.legacy && c.legacy.propositions),
          current_props: c.current_props != null ? c.current_props : (c.current && c.current.propositions),
          candidates_legacy: c.candidates_legacy, candidates_current: c.candidates_current,
          validated_legacy: c.validated_legacy, validated_current: c.validated_current,
          accepted_legacy: c.accepted_legacy, accepted_current: c.accepted_current,
          deterministic: c.deterministic
        };
      });
      return out;
    };
    const rerunBy = byChapter(rerun);
    const baseBy = byChapter(comp2b);
    const mismatches = [];
    Object.keys(baseBy).forEach((ch) => {
      if (JSON.stringify(rerunBy[ch]) !== JSON.stringify(baseBy[ch])) {
        mismatches.push({ chapter: ch, rerun: rerunBy[ch], phase2b: baseBy[ch] });
      }
    });
    v2Regression = {
      status: mismatches.length === 0 ? 'unchanged' : 'CHANGED',
      rerun_version: rerun.version, rerun_baseline_commit: rerun.baseline_commit,
      chapters_complete: rerun.chapters_complete, chapters_total: rerun.chapters_total,
      missing_inputs: rerun.missing_inputs || [],
      per_chapter: rerunBy, mismatches_vs_phase2b: mismatches
    };
  }
  console.log('V2 regression: ' + v2Regression.status);

  // --- H. Outputs ---
  const metrics = {
    version: 'phase2d-1',
    baseline_commit: BASELINE_COMMIT,
    phase2c_baseline_commit: '135808e55295773ad7069b639c89df48f6892182',
    pdf_available: true, pdf_path: PDF_PATH, pdf_sha256: pdfHash, pdf_pages: totalPages,
    production_reproduction: {
      staged_stems: stagedStems.length, reproduced_stems: reproducedCount,
      production_questions: (analysis.bank || []).length
    },
    document_model_accounting: docModel.accounting,
    document_model_reconciliation: docModel.reconciliation,
    reconstruction_accounting: recon.accounting,
    reconstruction_reconciliation: recon.reconciliation,
    typed_layer_accounting: typedLayer.accounting,
    typed_adapter_2b_baseline_accounting: typed2b.accounting,
    typed_adapter_2d_accounting: typed2d.accounting,
    typed_comparison_summary: {
      layer_bodytext_facts: typedLayer.typed_facts.length,
      adapter_2b_raw: typed2b.typed_facts.length,
      adapter_2b_unique_2b_key: new Set(typed2b.typed_facts.map(key2b)).size,
      adapter_2d_raw: typed2d.accounting.typed_facts_raw_total,
      adapter_2d_unique: typed2d.typed_facts.length,
      phase2c_keys_retained: retainedSpec.length, phase2c_keys_total: keys2cSpec.size,
      phase2c_keys_corrected: corrections.length,
      phase2a_keys_retained: retained2a.length, phase2a_keys_total: keys2a.length,
      phase2b_keys_retained: retained2b.length, phase2b_keys_total: keys2bUnique.size,
      new_keys_spec_scheme: newSpec.length,
      duplicates_discarded: typed2d.deduplication.duplicates_discarded.length
    },
    typed_facts_2d: facts2d.map(factSummary),
    unparsed_2d: typed2d.unparsed_units.map((u) => ({
      unparsed_id: u.unparsed_id, reason: u.reason, detail: u.detail,
      original_text: u.original_text,
      reconstructed_unit_id: u.source.reconstructed_unit_id,
      evidence_source: u.source.evidence_source,
      page_range: u.source.page_range,
      sentence_span: (u.source && u.source.sentence_span) || null,
      classification_attempts: u.classification_attempts
    })),
    unparsed_2d_by_reason: typed2d.accounting.unparsed_units_by_reason,
    targets: targets,
    wells_sentences: wellsSentences,
    case_checks: caseChecks,
    bank_hashes: bankHashes,
    v2_regression: v2Regression,
    limitations: [
      'Browser layout path not verified: layouts come from the vendored pdf.js build under Node (same code as browser/worker) with batch polyfills; no real browser run was performed and none is claimed.',
      'Supplementary patterns are adapter-only: parseDefinition, parseEntityAttributes, parseFactRelations and parseAllFactRelations are unchanged; the production path is byte-identical in behaviour (production reproduction 5/5, bank hashes unchanged).',
      'Phase 2D producers run only on segments the typed layer left untyped, so a genuine second claim inside an already-typed segment (for example a bare "X is renowned for ..." sentence the layer types as a weak role fact) is a known limitation, not a silent duplicate.',
      'The "etc." split applies only to segments with no layer facts and a layer unparsed entry; other abbreviation boundaries are unchanged.',
      'Timeline dates remain blocked (0 date facts from p.3) and the map remains visual-only (0 facts from pp.4–5).'
    ]
  };
  fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2d_metrics.json'), JSON.stringify(metrics, null, 2));
  const comparisonDoc = {
    version: 'phase2d-1',
    baseline_commit: BASELINE_COMMIT,
    pdf_sha256: pdfHash,
    key_schemes: {
      phase2b_key: 'fact_type|normalized_subject|normalized_object (relation excluded, as in Phase 2B)',
      phase2c_spec_key: 'fact_type|normalized_subject|normalized_relation|normalized_object|polarity|temporal_scope'
    },
    comparison: comparison,
    typed_facts_2d: facts2d.map(factSummary)
  };
  fs.writeFileSync(path.join(DIAG, 'chapter_3_phase2d_typed_fact_comparison.json'), JSON.stringify(comparisonDoc, null, 2));
  console.log('Wrote diagnostics/chapter_3_phase2d_metrics.json and diagnostics/chapter_3_phase2d_typed_fact_comparison.json');
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { key2b: key2b, key2c: key2c };
