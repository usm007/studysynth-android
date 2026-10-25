/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * run_ncert_judiciary.js — Extract and reason over real NCERT Class 8 textbook PDF:
 * "The Role of the Judiciary in Our Society" (hees204.pdf).
 */

const fs = require('fs');
const path = require('path');

// Polyfills for Node environment with bundled web PDF.js build
if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    return Buffer.from(this).toString('hex');
  };
}
if (!Math.sumPrecise) {
  Math.sumPrecise = function (arr) {
    let sum = 0;
    for (const n of arr) sum += Number(n) || 0;
    return sum;
  };
}

async function run() {
  const pdfjs = await import('../vendor/pdfjs/pdf.mjs');
  const Engine = require('../engine/generator.js');
  const EngineV2 = require('../engine/reasoning/engine_v2.js');
  const Analysis = require('../engine/analyze.js');

  const pdfPath = 'C:/Users/Admin/Desktop/NCERT/8.2/hees204.pdf';
  console.log(`[1] Loading NCERT Textbook PDF from: ${pdfPath}`);

  const buffer = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data: buffer,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  }).promise;

  console.log(`[2] Successfully opened PDF: "${path.basename(pdfPath)}" (${doc.numPages} pages)`);

  const pagesText = [];
  // Extract text across chapters
  for (let pageNum = 1; pageNum <= Math.min(10, doc.numPages); pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 50) {
      pagesText.push(`==Page ${pageNum}==\n${text}`);
    }
    page.cleanup();
  }

  const rawDocumentText = `# NCERT Class 8 Civics — The Role of the Judiciary in Our Society\n\n` + pagesText.join('\n\n');
  console.log(`[3] Extracted document text: ${rawDocumentText.length} characters across ${pagesText.length} pages.`);

  console.log('\n[4] Executing Reasoning Engine V2 Compilation & Question Generation...');
  const title = 'NCERT Class 8 Civics: The Role of the Judiciary in Our Society';

  // 1. Analyze using Production Pipeline
  const analysisResult = Analysis.analyzeSource(
    rawDocumentText,
    title,
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'civics' } },
    15
  );

  console.log(`\n========================================================================`);
  console.log(`STUDYSYNTH LITE ANALYSIS & QUESTION GENERATION REPORT`);
  console.log(`========================================================================`);
  console.log(`Source Document: ${title}`);
  console.log(`Sections Identified: ${analysisResult.sections.length}`);
  console.log(`Facts / Propositions Extracted: ${analysisResult.facts.length}`);
  console.log(`Total Verified Questions Published: ${analysisResult.questions.length}`);

  const subtypeCounts = {};
  analysisResult.questions.forEach((q) => {
    subtypeCounts[q.question_subtype] = (subtypeCounts[q.question_subtype] || 0) + 1;
  });
  console.log('\n--- Question Subtype Distribution ---');
  console.log(JSON.stringify(subtypeCounts, null, 2));

  console.log('\n========================================================================');
  console.log('GENERATED SOURCE-GROUNDED QUESTIONS');
  console.log('========================================================================');

  analysisResult.questions.forEach((q, idx) => {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[Item ${idx + 1}] ID: ${q.id} | Subtype: ${q.question_subtype} | Key: ${q.answer_key}`);
    console.log(`Stem: ${q.stem}`);
    console.log('Options:');
    q.options.forEach((opt) => {
      const tag = opt.is_correct ? ' (CORRECT)' : ` [Origin: ${opt.distractor_origin}]`;
      console.log(`   ${opt.key}) ${opt.text}${tag}`);
    });
    console.log(`Supporting Excerpt: "${q.supporting_excerpt}"`);
    console.log(`Explanation: ${q.explanation}`);
    if (q.proof_trace) {
      console.log(`Proof Operator: ${q.proof_trace.operator}`);
      console.log('Proof Steps:');
      (q.proof_trace.steps || []).forEach((step) => console.log(`   • ${step}`));
    }
  });

  // 2. Also run dedicated Reasoning V2 for additional conceptual questions
  const sections = Engine.parseRawDocument(rawDocumentText, title);
  const v2Bank = EngineV2.generateReasoningQuestionBank(sections, { targetCount: 5 });
  console.log(`\n========================================================================`);
  console.log('DEDICATED REASONING ENGINE V2 (Conceptual Proof-Carrying Items)');
  console.log(`========================================================================`);
  console.log(`V2 Candidates Generated: ${v2Bank.length}`);
  v2Bank.forEach((q, idx) => {
    console.log(`\n[V2-${idx + 1}] Subtype: ${q.question_subtype} | Difficulty: ${q.difficulty} | Key: ${q.answer_key}`);
    console.log(`Stem: ${q.stem}`);
    console.log(`Correct Answer: ${q.options.find((o) => o.is_correct).text}`);
    if (q.proof_trace) {
      console.log(`Operator: ${q.proof_trace.operator}`);
      console.log(`Steps: ${q.proof_trace.steps.join(' -> ')}`);
    }
  });
}

run().catch((err) => {
  console.error('Fatal error during NCERT processing:', err);
  process.exit(1);
});
