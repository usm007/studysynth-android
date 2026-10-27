/**
 * StudySynth Phase 2E diagnostic harness — Source Boundary Recovery and
 * Shadow Pipeline Telemetry.
 *
 * Runs the reconstruction (Phase 2E rules) + shadow typed-knowledge
 * adapter on all eight available Class 8 textbook PDFs and compares it
 * against the existing body-text typed layer, using the same strict
 * normalized fact keys as Phase 2D
 * (type|subject|relation|object|polarity|temporal_scope).
 *
 * This harness is ALSO the implementation behind the batch script's
 * opt-in --shadow-telemetry flag: pwa/tests/batch_generate_all_ncert.js
 * requires this module and calls runShadowTelemetry() in a dedicated
 * diagnostics-only branch placed before any bank-writing routine, so
 * the batch flag and this standalone script can never diverge.
 *
 * Writes ONLY diagnostics/corpus_phase2e_metrics.json and
 * diagnostics/corpus_phase2e_fact_comparison.json. Never regenerates
 * banks, never writes to staged data, never touches the production
 * question path except for the in-memory analyzeSource call that
 * produces the baseline typed-layer sections (the same call form the
 * Phase 2B V2 harness and the Phase 2D harness use).
 *
 * Input verification: every PDF's SHA-256 is checked against the
 * previously recorded manifest before processing. A missing file or a
 * hash mismatch marks that chapter missing/mismatched and STOPS that
 * chapter's comparison; no substitute PDF is ever used. Override the
 * PDF directory with NCERT_PDF_DIR.
 *
 * Representation differences: a strict-key lost+new pair is reported as
 * a representation-change CANDIDATE when the two facts share fact_type
 * and normalized relation and their normalized subjects and objects
 * match by equality or containment/prefix. Candidates are listed for
 * review; the harness never silently reclassifies a lost fact as
 * retained. The Phase 2E report records the reviewed verdict per pair.
 *
 * No gold-standard coverage is calculated or claimed for chapters
 * without a reviewed learning-point inventory (all chapters except
 * Chapter 3). For those chapters this report measures extraction only:
 * counts, retention, recovery and loss against the body-text typed
 * layer — never learning-point coverage. Chapter 3 retains its
 * 160-entry inventory and 143-point question-worthy denominator from
 * Phase 1; the Phase 2E run must leave its typed totals unchanged
 * (40 raw / 39 unique), since no Phase 2E case is in Chapter 3.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const REPO = path.join(__dirname, '..', '..');
const DIAG = path.join(REPO, 'diagnostics');
const DEFAULT_PDF_DIR = process.env.NCERT_PDF_DIR || '/home/hatch/workspace/ncert_pdfs';
const BASELINE_COMMIT = '5d96b38449d346d48c37983a80f70d9c9c1a7c1d';

const CHAPTERS = [
  { code: 'hees201', title: 'NCERT Class 8 — World Geography', sha256: '68f119b33395c16a5c63819596d46aacadde9a17aec5c4cf978d0b03e85a84a4' },
  { code: 'hees202', title: 'NCERT Class 8 — India\'s Long Road to Independence', sha256: '5a02c626a57ba3222cf90204cbeb065b0d46ff081f117269a4bb212527b74eae' },
  { code: 'hees203', title: 'NCERT Class 8 — Indian Architecture', sha256: '547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec' },
  { code: 'hees204', title: 'NCERT Class 8 — Judiciary', sha256: '87f5e404e8c2dbf6c95612068ef78108653946b761ebf62b4f4bdd8825845184' },
  { code: 'hees205', title: 'NCERT Class 8 — Citizenship', sha256: '4567ca3602ac05a7b45cf78e21528a66fd0bc380830561209d767e777f11ac28' },
  { code: 'hees206', title: 'NCERT Class 8 — Dynamics of Population', sha256: '832a4ee039e5d79c61c4259e38593378ed4f295699df864bdffc599a6562317f' },
  { code: 'hees207', title: 'NCERT Class 8 — India\'s Urban Landscape', sha256: '0ed56f0852d29059962d3d581bd52fb340c4a319fe21c09bb32ceaa2bc9eb540' },
  { code: 'hees209', title: 'NCERT Class 8 — Cultural Currents 13th–17th C', sha256: 'cfdd8e4a732582926a6e06f6f779b28732a0ae23c8383e3136f4ba612933ff29' }
];

function collapseWs(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}
function normSubject(v) {
  return collapseWs(String(v || '').toLowerCase()).replace(/^(the|a|an)\s+/, '');
}
function normObject(v) {
  return collapseWs(String(v || '').toLowerCase());
}
function strictKey(f) {
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
    block_ids: f.source.block_ids, page_range: f.source.page_range,
    temporal_scope: (f.qualifiers && f.qualifiers.temporal_scope) || null,
    attribution: (f.qualifiers && f.qualifiers.attribution) || null,
    classification_method: (f.classification && f.classification.method) || null,
    classification_rule_id: (f.classification && f.classification.rule_id) || null,
    derivation: f.derivation || null,
    validation_state: f.validation_state
  };
}
function countBy(list, keyFn) {
  const out = {};
  list.forEach((item) => {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}
// Representation-change pairing: same type + relation, subjects equal
// or one containing the other, objects equal or one a prefix of (or
// containing) the other. Returns candidate pairs for manual review.
function representationCandidates(lostFacts, newFacts) {
  const pairs = [];
  const usedNew = new Set();
  lostFacts.forEach((lost) => {
    const ls = normSubject(lost.subject);
    const lo = normObject(lost.object);
    for (let i = 0; i < newFacts.length; i++) {
      if (usedNew.has(i)) continue;
      const nw = newFacts[i];
      if (nw.fact_type !== lost.fact_type) continue;
      if (normObject(nw.relation) !== normObject(lost.relation)) continue;
      const ns = normSubject(nw.subject);
      const no = normObject(nw.object);
      const subjectMatch = ls === ns || ls.indexOf(ns) !== -1 || ns.indexOf(ls) !== -1;
      const objectMatch = lo === no || lo.indexOf(no) === 0 || no.indexOf(lo) === 0
        || lo.indexOf(no) !== -1 || no.indexOf(lo) !== -1;
      if (subjectMatch && objectMatch) {
        pairs.push({ lost: factSummary(lost), candidate_new: factSummary(nw) });
        usedNew.add(i);
        break;
      }
    }
  });
  return pairs;
}

async function runShadowTelemetry(pdfDir, outDir) {
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
  const pdfjs = await import(pathToFileURL(path.join(REPO, 'pwa/vendor/pdfjs/pdf.mjs')).href);

  const chapterResults = [];
  const missingInputs = [];
  const mismatchedInputs = [];

  for (const chapter of CHAPTERS) {
    const pdfPath = path.join(pdfDir, chapter.code + '.pdf');
    if (!fs.existsSync(pdfPath)) {
      missingInputs.push(chapter.code);
      chapterResults.push({ chapter: chapter.code, status: 'missing_input', error: 'PDF not found: ' + pdfPath });
      console.log(chapter.code + ': MISSING INPUT — comparison stopped for this chapter.');
      continue;
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    if (pdfHash !== chapter.sha256) {
      mismatchedInputs.push(chapter.code);
      chapterResults.push({
        chapter: chapter.code, status: 'hash_mismatch',
        expected_sha256: chapter.sha256, actual_sha256: pdfHash,
        error: 'PDF hash differs from the recorded manifest — comparison stopped for this chapter; no substitute used.'
      });
      console.log(chapter.code + ': HASH MISMATCH — comparison stopped for this chapter.');
      continue;
    }
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true
    }).promise;
    const pageLayouts = [];
    const pagesText = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const layout = await Parser.extractPageLayout(page, pageNum);
      pageLayouts.push({
        pageNumber: layout.pageNumber, blocks: layout.blocks, stats: layout.stats,
        bodyText: layout.bodyText, bodyOnlyText: layout.bodyOnlyText
      });
      if ((layout.bodyText || '').length > 30) {
        pagesText.push('==Page ' + pageNum + '==\n' + layout.bodyText);
      }
      page.cleanup();
    }
    const rawText = '# ' + chapter.title + '\n\n' + pagesText.join('\n\n');
    const analysis = Analysis.analyzeSource(rawText, chapter.title,
      { sourceMeta: { type: 'textbook', grade: 8, subject: 'social science' } }, 15);
    const sections = analysis.sections || Engine.parseRawDocument(rawText, chapter.title);

    // Baseline: existing body-text typed layer (same call as Phase 2D).
    const typedLayer = Engine.buildTypedKnowledge(sections, {
      sourceMeta: { type: 'textbook', grade: 8, subject: 'social science' }, documentId: chapter.code
    });
    // Shadow: document model + Phase 2E reconstruction + adapter.
    const docModel = DocumentModel.buildStructuredDocument(pageLayouts, {
      documentId: chapter.code, sourceTitle: chapter.title
    });
    const recon = SourceReconstruction.reconstructDocument(docModel, { documentId: chapter.code });
    const adapterOpts = {
      sourceMeta: { type: 'textbook', grade: 8, subject: 'social science' }, documentId: chapter.code
    };
    const typedAdapter = Engine.buildTypedKnowledgeFromReconstructedUnits(recon.units, adapterOpts);
    const typedAdapter2 = Engine.buildTypedKnowledgeFromReconstructedUnits(recon.units, adapterOpts);
    const sortedKeys = (run) => run.typed_facts.map(strictKey).sort();
    const adapterDeterministic = JSON.stringify(sortedKeys(typedAdapter)) === JSON.stringify(sortedKeys(typedAdapter2))
      && JSON.stringify(typedAdapter.unparsed_units.map((u) => u.unparsed_id + '|' + u.reason).sort())
        === JSON.stringify(typedAdapter2.unparsed_units.map((u) => u.unparsed_id + '|' + u.reason).sort())
      && JSON.stringify(recon.units.map((u) => u.unit_id + '|' + u.text).sort())
        === JSON.stringify(SourceReconstruction.reconstructDocument(docModel, { documentId: chapter.code })
          .units.map((u) => u.unit_id + '|' + u.text).sort());

    const layerKeys = new Set(typedLayer.typed_facts.map(strictKey));
    const adapterKeys = new Set(typedAdapter.typed_facts.map(strictKey));
    const retained = [...layerKeys].filter((k) => adapterKeys.has(k));
    const lost = [...layerKeys].filter((k) => !adapterKeys.has(k));
    const newly = [...adapterKeys].filter((k) => !layerKeys.has(k));
    const newFacts = typedAdapter.typed_facts.filter((f) => newly.includes(strictKey(f)));
    const lostFacts = typedLayer.typed_facts.filter((f) => lost.includes(strictKey(f)));
    const repCandidates = representationCandidates(lostFacts, newFacts);

    // Unparsed by reason with representative examples (max 5 per reason).
    const unparsedByReason = {};
    const unparsedExamples = {};
    typedAdapter.unparsed_units.forEach((u) => {
      unparsedByReason[u.reason] = (unparsedByReason[u.reason] || 0) + 1;
      if (!unparsedExamples[u.reason]) unparsedExamples[u.reason] = [];
      if (unparsedExamples[u.reason].length < 5) {
        unparsedExamples[u.reason].push({
          unparsed_id: u.unparsed_id, original_text: u.original_text,
          reconstructed_unit_id: u.source.reconstructed_unit_id,
          evidence_source: u.source.evidence_source
        });
      }
    });
    const methodCounts = countBy(typedAdapter.typed_facts,
      (f) => (f.classification && f.classification.method) || 'layer');
    // Phase 2E telemetry: heading recovery, artifact exclusions, spans.
    const headingRecovered = recon.units.filter((u) => u.rule_id === 'reconstruct-v2e/heading-prose');
    const artifactExclusions = (recon.exclusions || []).filter((e) =>
      ['legend_block', 'leading_artifact_run', 'margin_label', 'duplicate_label'].indexOf(e.reason) !== -1);
    const artifactFragments = [];
    recon.units.forEach((u) => {
      (u.fragments_excluded || []).forEach((fr) => {
        if (['leading_artifact_run', 'margin_label', 'duplicate_label'].indexOf(fr.reason) !== -1) {
          artifactFragments.push({
            unit_id: u.unit_id, block_id: fr.block_id, text: fr.text,
            reason: fr.reason, rule_id: fr.rule_id
          });
        }
      });
    });
    const boundaryFacts = typedAdapter.typed_facts.filter((f) =>
      f.classification && f.classification.method === 'phase2e_boundary_reparse');
    const record = {
      chapter: chapter.code,
      title: chapter.title,
      status: 'complete',
      expected_sha256: chapter.sha256,
      observed_sha256: pdfHash,
      pdf_sha256_verified: true,
      pdf_pages: doc.numPages,
      document_model: {
        blocks_total: docModel.accounting.blocks_total,
        blocks_by_type: docModel.accounting.blocks_by_type,
        dispositions: docModel.accounting.dispositions || null,
        reconciliation: docModel.reconciliation
      },
      reconstruction: {
        version: recon.version,
        units_total: recon.units.length,
        units_by_type: recon.accounting.units_by_type,
        units_by_certainty: countBy(recon.units, (u) => u.certainty),
        exclusions_by_reason: recon.accounting.exclusions_by_reason,
        reconciliation: recon.reconciliation,
        heading_recovery: {
          units_recovered: headingRecovered.length,
          blocks_recovered: headingRecovered.reduce((s, u) => s + u.block_ids.length, 0),
          units: headingRecovered.map((u) => ({
            unit_id: u.unit_id, pages: u.pages, block_ids: u.block_ids,
            text: u.text, review_flags: u.review_flags
          }))
        },
        artifact_exclusions: {
          by_reason: countBy(artifactExclusions, (e) => e.reason),
          blocks: artifactExclusions.map((e) => ({
            block_id: e.block_id, page: e.page, type: e.type,
            reason: e.reason, rule_id: e.rule_id, detail: e.detail
          })),
          passage_fragments: artifactFragments
        },
        span_accounting: {
          // Every block is in exactly one bucket (reconciliation.ok);
          // every excluded artifact span is preserved verbatim in the
          // exclusions list and, for passage fragments, in the owning
          // unit's fragments_excluded. No span is silently discarded.
          reconciliation_ok: !!(recon.reconciliation && recon.reconciliation.ok),
          excluded_artifact_blocks: artifactExclusions.length,
          passage_artifact_fragments: artifactFragments.length
        }
      },
      baseline_typed_layer: {
        facts_total: typedLayer.typed_facts.length,
        facts_by_type: typedLayer.accounting.typed_facts_by_type,
        unparsed_total: typedLayer.accounting.unparsed_units_total
      },
      shadow_adapter_2e: {
        raw_total: typedAdapter.accounting.typed_facts_raw_total,
        unique_total: typedAdapter.typed_facts.length,
        facts_by_type: typedAdapter.accounting.typed_facts_by_type,
        facts_by_evidence_source: typedAdapter.accounting.typed_facts_by_evidence_source,
        unparsed_total: typedAdapter.unparsed_units.length,
        unparsed_by_reason: unparsedByReason,
        duplicates_discarded: typedAdapter.deduplication.duplicates_discarded,
        method_counts: methodCounts,
        boundary_reparse_facts: boundaryFacts.map(factSummary),
        boundary_reparse_by_rule: countBy(boundaryFacts,
          (f) => (f.derivation && f.derivation.rule_id) || 'unknown'),
        deterministic_repeat: adapterDeterministic
      },
      comparison_vs_baseline_strict_keys: {
        baseline_keys: layerKeys.size,
        adapter_keys: adapterKeys.size,
        retained: retained.length,
        newly_recovered: newly.length,
        lost: lost.length,
        lost_facts: lostFacts.map((f) => ({
          fact_type: f.fact_type, subject: f.subject, relation: f.relation, object: f.object,
          evidence: f.evidence, key: strictKey(f)
        })),
        representation_change_candidates: repCandidates
      },
      newly_recovered_facts: newFacts.map(factSummary),
      unparsed_examples_by_reason: unparsedExamples
    };
    chapterResults.push(record);
    console.log(chapter.code + ': pages ' + doc.numPages
      + ' | blocks ' + docModel.accounting.blocks_total
      + ' | recon units ' + recon.units.length
      + ' | layer ' + typedLayer.typed_facts.length
      + ' | adapter raw ' + typedAdapter.accounting.typed_facts_raw_total
      + ' unique ' + typedAdapter.typed_facts.length
      + ' | retained ' + retained.length + ' new ' + newly.length + ' lost ' + lost.length
      + ' | rep-candidates ' + repCandidates.length
      + ' | heading-recovered ' + headingRecovered.length
      + ' | deterministic ' + adapterDeterministic);
  }

  const complete = chapterResults.filter((r) => r.status === 'complete');
  const aggregate = {
    chapters_complete: complete.length,
    chapters_total: CHAPTERS.length,
    missing_inputs: missingInputs,
    mismatched_inputs: mismatchedInputs,
    comparison_complete: missingInputs.length === 0 && mismatchedInputs.length === 0,
    totals: {
      pages: complete.reduce((s, r) => s + r.pdf_pages, 0),
      blocks: complete.reduce((s, r) => s + r.document_model.blocks_total, 0),
      recon_units: complete.reduce((s, r) => s + r.reconstruction.units_total, 0),
      baseline_layer_facts: complete.reduce((s, r) => s + r.baseline_typed_layer.facts_total, 0),
      adapter_raw_facts: complete.reduce((s, r) => s + r.shadow_adapter_2e.raw_total, 0),
      adapter_unique_facts: complete.reduce((s, r) => s + r.shadow_adapter_2e.unique_total, 0),
      retained: complete.reduce((s, r) => s + r.comparison_vs_baseline_strict_keys.retained, 0),
      newly_recovered: complete.reduce((s, r) => s + r.comparison_vs_baseline_strict_keys.newly_recovered, 0),
      lost: complete.reduce((s, r) => s + r.comparison_vs_baseline_strict_keys.lost, 0),
      unparsed: complete.reduce((s, r) => s + r.shadow_adapter_2e.unparsed_total, 0),
      duplicates_discarded: complete.reduce((s, r) => s + r.shadow_adapter_2e.duplicates_discarded.length, 0),
      heading_units_recovered: complete.reduce((s, r) => s + r.reconstruction.heading_recovery.units_recovered, 0),
      artifact_blocks_excluded: complete.reduce((s, r) => s + r.reconstruction.span_accounting.excluded_artifact_blocks, 0)
    },
    facts_by_type_total: {},
    facts_by_evidence_source_total: {},
    unparsed_by_reason_total: {},
    method_counts_total: {},
    boundary_reparse_by_rule_total: {},
    artifact_by_reason_total: {},
    all_deterministic: complete.every((r) => r.shadow_adapter_2e.deterministic_repeat),
    all_reconciled: complete.every((r) => r.reconstruction.span_accounting.reconciliation_ok)
  };
  complete.forEach((r) => {
    const add = (target, src) => {
      Object.keys(src || {}).forEach((k) => { target[k] = (target[k] || 0) + src[k]; });
    };
    add(aggregate.facts_by_type_total, r.shadow_adapter_2e.facts_by_type);
    add(aggregate.facts_by_evidence_source_total, r.shadow_adapter_2e.facts_by_evidence_source);
    add(aggregate.unparsed_by_reason_total, r.shadow_adapter_2e.unparsed_by_reason);
    add(aggregate.method_counts_total, r.shadow_adapter_2e.method_counts);
    add(aggregate.boundary_reparse_by_rule_total, r.shadow_adapter_2e.boundary_reparse_by_rule);
    add(aggregate.artifact_by_reason_total, r.reconstruction.artifact_exclusions.by_reason);
  });

  const metrics = {
    version: 'phase2e-1',
    baseline_commit: BASELINE_COMMIT,
    pdf_dir: pdfDir,
    chapters: chapterResults,
    aggregate: aggregate,
    coverage_disclaimer: 'No gold-standard chapter coverage is calculated or claimed for chapters without a reviewed learning-point inventory. Chapter 3 retains its 160-entry inventory and 143-point question-worthy denominator from Phase 1; all other chapters report extraction counts only, never learning-point coverage.'
  };
  fs.writeFileSync(path.join(outDir, 'corpus_phase2e_metrics.json'), JSON.stringify(metrics, null, 2));

  const comparisonDoc = {
    version: 'phase2e-1',
    baseline_commit: BASELINE_COMMIT,
    key_scheme: 'fact_type|normalized_subject|normalized_relation|normalized_object|polarity|temporal_scope (strict; representation differences between the body-text layer and the reconstructed adapter appear as lost+new pairs, with pairing candidates listed separately for review, never as silent matches)',
    aggregate: aggregate,
    chapters: chapterResults.map((r) => ({
      chapter: r.chapter,
      status: r.status,
      expected_sha256: r.expected_sha256 || null,
      observed_sha256: r.observed_sha256 || null,
      baseline_keys: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.baseline_keys : null,
      adapter_keys: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.adapter_keys : null,
      retained: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.retained : null,
      newly_recovered: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.newly_recovered : null,
      lost: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.lost : null,
      lost_facts: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.lost_facts : null,
      representation_change_candidates: r.comparison_vs_baseline_strict_keys ? r.comparison_vs_baseline_strict_keys.representation_change_candidates : null,
      newly_recovered_facts: r.newly_recovered_facts || null
    }))
  };
  fs.writeFileSync(path.join(outDir, 'corpus_phase2e_fact_comparison.json'), JSON.stringify(comparisonDoc, null, 2));
  console.log('Wrote corpus_phase2e_metrics.json and corpus_phase2e_fact_comparison.json to ' + outDir);
  return { metrics: metrics, comparison: comparisonDoc };
}

async function main() {
  const result = await runShadowTelemetry(DEFAULT_PDF_DIR, DIAG);
  return result;
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runShadowTelemetry: runShadowTelemetry, strictKey: strictKey, CHAPTERS: CHAPTERS };
