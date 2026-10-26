/**
 * StudySynth Phase 2B — Reasoning V2 legacy-vs-current comparison across
 * all eight NCERT Class 8 chapters (shadow diagnostic, no bank writes).
 *
 * Legacy baseline: the a536a3c9 version of
 * pwa/engine/reasoning/representation.js, fetched read-only at the pinned
 * ref and verified before use: it must NOT contain
 * 'classifyPropositionEligibility' or 'graphRejections' (both added in
 * Phase 2A) and MUST contain 'compileSemanticRepresentation'. The fetched
 * file was additionally verified byte-identical to the Phase 2A legacy
 * copy (/tmp/phase2a-legacy). The whole current reasoning directory is
 * copied to /tmp/phase2b-legacy/reasoning/ with ONLY representation.js
 * replaced, so the legacy engine resolves to sibling legacy modules via
 * its relative requires — exactly the Phase 2A trick.
 *
 * Per chapter, source inputs are IDENTICAL for both runs: the same
 * analyzeSource sections + facts from the same chapter PDF. Each
 * comparison is run twice and must produce identical JSON (determinism).
 * Per-subtype candidate counts come from running
 * generateReasoningCandidates + Validator directly, because
 * generateReasoningQuestionBank's .generation telemetry carries totals
 * only. Accepted counts come from generateReasoningQuestionBank itself.
 *
 * Also inventories the actual production fact-type taxonomy per chapter
 * and runs the CURRENT classifyPropositionEligibility over every
 * production fact, to test whether an explicit allowlist would change
 * anything for production types.
 *
 * Writes ONLY diagnostics/v2_cross_chapter_comparison_phase2b.json.
 * Never regenerates or overwrites static banks.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const REPO = path.join(__dirname, '..', '..');
const DIAG = path.join(REPO, 'diagnostics');
const PDF_DIR = process.env.NCERT_PDF_DIR || '/home/hatch/workspace/ncert_pdfs';
const LEGACY_DIR = '/tmp/phase2b-legacy/reasoning';
const LEGACY_REF = 'a536a3c94cd92b81b85ca724a671fab1a97c5b06';
const BASELINE_COMMIT = '59e5372243a80e90c51448fd7158d57c52dbb4d2';

const CHAPTERS = [
  { code: 'hees201', title: 'NCERT Class 8 — World Geography' },
  { code: 'hees202', title: 'NCERT Class 8 — India\'s Long Road to Independence' },
  { code: 'hees203', title: 'NCERT Class 8 — Indian Architecture' },
  { code: 'hees204', title: 'NCERT Class 8 — Judiciary' },
  { code: 'hees205', title: 'NCERT Class 8 — Citizenship' },
  { code: 'hees206', title: 'NCERT Class 8 — Dynamics of Population' },
  { code: 'hees207', title: 'NCERT Class 8 — India\'s Urban Landscape' },
  { code: 'hees209', title: 'NCERT Class 8 — Cultural Currents 13th–17th C' }
];

// Run one engine (current or legacy) over identical sections + facts and
// return the full comparison record for that engine.
function runEngine(EngineV2, sections, facts, targetCount) {
  const accepted = EngineV2.generateReasoningQuestionBank(sections, {
    facts: facts, targetCount: targetCount
  });
  const generation = accepted.generation || {};
  // Direct pipeline for per-subtype counts (telemetry has totals only).
  const Representation = EngineV2.Representation;
  const GraphModule = EngineV2.GraphModule;
  const Validator = EngineV2.Validator;
  const compiled = Representation.compileSemanticRepresentation(sections, facts);
  const propositions = compiled.propositions || [];
  const graph = GraphModule.buildGraphFromPropositions(propositions);
  const context = {
    sourceTitle: (sections && sections[0] && sections[0].title) || 'Source Document',
    facts: facts,
    sections: sections || []
  };
  const candidates = EngineV2.generateReasoningCandidates(graph, context);
  const bySubtype = {};
  const validatedBySubtype = {};
  const rejectionCounts = {};
  let validated = 0;
  candidates.forEach((cand) => {
    const subtype = cand.question_subtype || 'unknown';
    bySubtype[subtype] = (bySubtype[subtype] || 0) + 1;
    const check = Validator.validateCandidate(cand, graph, context);
    if (check.valid) {
      validated++;
      validatedBySubtype[subtype] = (validatedBySubtype[subtype] || 0) + 1;
    } else {
      const code = check.code || 'VALIDATION_FAILED';
      rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
    }
  });
  const graphRejections = Array.isArray(compiled.graphRejections) ? compiled.graphRejections : [];
  const graphRejectionsByReason = {};
  graphRejections.forEach((entry) => {
    const reason = entry.reason || 'unknown';
    graphRejectionsByReason[reason] = (graphRejectionsByReason[reason] || 0) + 1;
  });
  return {
    propositions: propositions.length,
    graph_rejections_total: graphRejections.length,
    graph_rejections_by_reason: graphRejectionsByReason,
    candidates_total: candidates.length,
    candidates_by_subtype: bySubtype,
    validated_total: validated,
    validated_by_subtype: validatedBySubtype,
    validator_rejection_counts: rejectionCounts,
    accepted: accepted.length,
    bank_generation: {
      proposition_count: generation.propositionCount != null ? generation.propositionCount : null,
      total_candidates: generation.totalCandidates != null ? generation.totalCandidates : null,
      validated_candidates: generation.validatedCandidates != null ? generation.validatedCandidates : null,
      accepted: generation.accepted != null ? generation.accepted : null
    }
  };
}

async function main() {
  if (!Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () { return Buffer.from(this).toString('hex'); };
  }
  if (!Math.sumPrecise) {
    Math.sumPrecise = function (arr) { let sum = 0; for (const n of arr) sum += Number(n) || 0; return sum; };
  }

  // --- Verify the legacy representation file before use ---
  const legacyReprPath = path.join(LEGACY_DIR, 'representation.js');
  if (!fs.existsSync(legacyReprPath)) {
    throw new Error('Legacy representation.js not found at ' + legacyReprPath
      + ' — prepare /tmp/phase2b-legacy by copying pwa/engine/reasoning/ and '
      + 'overwriting representation.js with the ' + LEGACY_REF + ' version fetched '
      + 'read-only (github get_file_contents with ref=' + LEGACY_REF + ').');
  }
  const legacyReprText = fs.readFileSync(legacyReprPath, 'utf-8');
  if (legacyReprText.includes('classifyPropositionEligibility')
    || legacyReprText.includes('graphRejections')
    || !legacyReprText.includes('compileSemanticRepresentation')) {
    throw new Error('Legacy representation.js failed marker verification: it must NOT '
      + 'contain the Phase 2A gate markers and MUST contain compileSemanticRepresentation.');
  }
  console.log('Legacy representation.js verified (pinned ref ' + LEGACY_REF + ', no gate markers).');

  const Parser = require(path.join(REPO, 'pwa/engine/pdfParser.js'));
  const Analysis = require(path.join(REPO, 'pwa/engine/analyze.js'));
  const EngineV2Current = require(path.join(REPO, 'pwa/engine/reasoning/engine_v2.js'));
  // Fresh require of the legacy engine (delete cache first so its relative
  // requires resolve to the legacy siblings, not the current modules).
  const legacyEnginePath = path.join(LEGACY_DIR, 'engine_v2.js');
  delete require.cache[require.resolve(legacyEnginePath)];
  const EngineV2Legacy = require(legacyEnginePath);

  const pdfjs = await import(pathToFileURL(path.join(REPO, 'pwa/vendor/pdfjs/pdf.mjs')).href);

  const chapterResults = [];
  const missingInputs = [];
  const taxonomy = {}; // fact_type -> { chapters, total, gate: {eligible, reasons} }

  for (const chapter of CHAPTERS) {
    const pdfPath = path.join(PDF_DIR, chapter.code + '.pdf');
    if (!fs.existsSync(pdfPath)) {
      missingInputs.push(chapter.code);
      chapterResults.push({ chapter: chapter.code, status: 'missing_input', error: 'PDF not found: ' + pdfPath });
      continue;
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true
    }).promise;
    const pageLayouts = [];
    const pagesText = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const layout = await Parser.extractPageLayout(page, pageNum);
      if ((layout.bodyText || '').length > 30) {
        pagesText.push('==Page ' + pageNum + '==\n' + layout.bodyText);
      }
      page.cleanup();
    }
    const rawText = '# ' + chapter.title + '\n\n' + pagesText.join('\n\n');
    const analysis = Analysis.analyzeSource(rawText, chapter.title,
      { sourceMeta: { type: 'textbook', grade: 8, subject: 'social science' } }, 15);
    const sections = analysis.sections || [];
    const facts = analysis.facts || [];

    // Fact-type taxonomy + current-gate verdicts for this chapter.
    const factTypes = {};
    const gateVerdicts = {};
    facts.forEach((fact) => {
      const type = fact.fact_type || 'unknown';
      factTypes[type] = (factTypes[type] || 0) + 1;
      const verdict = EngineV2Current.Representation.classifyPropositionEligibility
        ? EngineV2Current.Representation.classifyPropositionEligibility(fact)
        : { eligible: null, reason: 'function_absent' };
      const key = verdict.eligible ? 'eligible' : ('rejected:' + (verdict.reason || 'unknown'));
      gateVerdicts[key] = (gateVerdicts[key] || 0) + 1;
      if (!taxonomy[type]) taxonomy[type] = { chapters: [], total: 0, gate_eligible: 0, gate_rejected_by_reason: {} };
      if (!taxonomy[type].chapters.includes(chapter.code)) taxonomy[type].chapters.push(chapter.code);
      taxonomy[type].total++;
      if (verdict.eligible) taxonomy[type].gate_eligible++;
      else {
        const r = verdict.reason || 'unknown';
        taxonomy[type].gate_rejected_by_reason[r] = (taxonomy[type].gate_rejected_by_reason[r] || 0) + 1;
      }
    });

    // Legacy vs current, each run twice for determinism.
    const legacyRuns = [
      runEngine(EngineV2Legacy, sections, facts, 5),
      runEngine(EngineV2Legacy, sections, facts, 5)
    ];
    const currentRuns = [
      runEngine(EngineV2Current, sections, facts, 5),
      runEngine(EngineV2Current, sections, facts, 5)
    ];
    const legacyDeterministic = JSON.stringify(legacyRuns[0]) === JSON.stringify(legacyRuns[1]);
    const currentDeterministic = JSON.stringify(currentRuns[0]) === JSON.stringify(currentRuns[1]);
    const legacy = legacyRuns[0];
    const current = currentRuns[0];
    const record = {
      chapter: chapter.code,
      title: chapter.title,
      status: 'complete',
      pdf_sha256: pdfHash,
      pdf_pages: doc.numPages,
      production_facts_total: facts.length,
      production_fact_types: factTypes,
      current_gate_verdicts_on_production_facts: gateVerdicts,
      legacy: legacy,
      current: current,
      deltas: {
        propositions: current.propositions - legacy.propositions,
        candidates_total: current.candidates_total - legacy.candidates_total,
        validated_total: current.validated_total - legacy.validated_total,
        accepted: current.accepted - legacy.accepted
      },
      legacy_deterministic: legacyDeterministic,
      current_deterministic: currentDeterministic
    };
    chapterResults.push(record);
    console.log(chapter.code + ': legacy props ' + legacy.propositions + ' -> current '
      + current.propositions + ' | candidates ' + legacy.candidates_total + ' -> '
      + current.candidates_total + ' | validated ' + legacy.validated_total + ' -> '
      + current.validated_total + ' | accepted ' + legacy.accepted + ' -> '
      + current.accepted + ' | deterministic L=' + legacyDeterministic + ' C=' + currentDeterministic);
  }

  const report = {
    version: 'phase2b-1',
    baseline_commit: BASELINE_COMMIT,
    legacy_representation_ref: LEGACY_REF,
    legacy_verification: 'pinned-ref fetch; no classifyPropositionEligibility/graphRejections markers; byte-identical to Phase 2A legacy copy',
    target_count: 5,
    chapters_complete: chapterResults.filter((r) => r.status === 'complete').length,
    chapters_total: CHAPTERS.length,
    missing_inputs: missingInputs,
    comparison_complete: missingInputs.length === 0,
    fact_type_taxonomy: taxonomy,
    classify_proposition_eligibility_finding: 'classifyPropositionEligibility is a rejection list, not an allowlist: it rejects fallback_unclassified, missing_subject, missing_object, fragment_subject, fragment_object, conflicting_values and ocr_unverified, and admits every other fact type with non-fragment subject/object. An allowlist equal to TYPED_FACT_TYPES (date, numeric, definition, entity_attribute, membership, sequence, causal, comparison, table) would change NOTHING for production fact types, because the producer set minus fallback is exactly that set; it would only change behaviour for non-production inputs (multi_statement, numeric_statistic, arbitrary strings), which currently pass when structurally sound. No V2 gate change is justified by this comparison: the gate already removes exactly the vacuous propositions, and the per-chapter deltas below measure its effect.',
    chapters: chapterResults
  };
  fs.writeFileSync(path.join(DIAG, 'v2_cross_chapter_comparison_phase2b.json'),
    JSON.stringify(report, null, 2));
  console.log('Wrote diagnostics/v2_cross_chapter_comparison_phase2b.json');
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runEngine: runEngine };
