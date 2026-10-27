/**
 * StudySynth Lite — Batch NCERT Class 8 Question Generator (Repair 002)
 * Generates verified production questions and conceptual reasoning V2 questions
 * from all 8 NCERT Class 8 Social Science textbook PDFs.
 * Outputs individual markdown files into the staging directory: pwa/data/ncert_8_2_staged/
 */

const fs = require('fs');
const path = require('path');

// Node.js environment polyfills for web PDF.js build
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

const CHAPTER_MANIFEST = [
  {
    file: 'hees201.pdf',
    chapterNum: 1,
    subject: 'Geography',
    title: 'World Geography: Some Glimpses',
    outBase: 'hees201_world_geography'
  },
  {
    file: 'hees202.pdf',
    chapterNum: 2,
    subject: 'History',
    title: 'India’s Long Road to Independence',
    outBase: 'hees202_indias_road_to_independence'
  },
  {
    file: 'hees203.pdf',
    chapterNum: 3,
    subject: 'Art & Heritage',
    title: 'A Journey Through Indian Architecture',
    outBase: 'hees203_journey_through_indian_architecture'
  },
  {
    file: 'hees204.pdf',
    chapterNum: 4,
    subject: 'Civics',
    title: 'The Role of the Judiciary in Our Society',
    outBase: 'hees204_judiciary_in_our_society'
  },
  {
    file: 'hees205.pdf',
    chapterNum: 5,
    subject: 'Civics',
    title: 'Citizenship: Rights and Duties',
    outBase: 'hees205_citizenship_rights_and_duties'
  },
  {
    file: 'hees206.pdf',
    chapterNum: 6,
    subject: 'Economics / Geography',
    title: 'Dynamics of Population',
    outBase: 'hees206_dynamics_of_population'
  },
  {
    file: 'hees207.pdf',
    chapterNum: 7,
    subject: 'Geography / Sociology',
    title: 'India’s Urban Landscape',
    outBase: 'hees207_indias_urban_landscape'
  },
  {
    file: 'hees209.pdf',
    chapterNum: 8,
    subject: 'History / Culture',
    title: 'Cultural Currents: 13th to 17th Centuries',
    outBase: 'hees209_cultural_currents_13th_to_17th_centuries'
  }
];

function padNumber(num, size) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

const Parser = require('../engine/pdfParser.js');

/**
 * Repair 002: the batch generator no longer maintains a competing layout
 * algorithm. It calls the single shared geometry-aware extractor in
 * pwa/engine/pdfParser.js (extractPageLayout), which returns structured
 * blocks, body text, and diagnostics. Only accepted body/heading text is
 * sent onward; captions, diagram labels, page furniture, fragments and
 * ambiguous blocks are preserved in blocks/stats, not merged into prose.
 */
async function extractPageLayoutText(page, pageNum) {
  const layout = await Parser.extractPageLayout(page, pageNum);
  const counts = (layout.stats && layout.stats.countsByType) || {};
  return {
    text: layout.bodyText,
    bodyText: layout.bodyText,
    bodyOnlyText: layout.bodyOnlyText,
    blocks: layout.blocks,
    stats: layout.stats,
    furnitureCount: counts.page_furniture || 0,
    diagramCount: counts.diagram || 0
  };
}

function buildMarkdownReport(meta, prodQuestions, v2Questions, pagesAnalyzed, totalPages) {
  let md = `# NCERT Class 8 Social Science — Generated Question Bank (Staged Repair 002)\n`;
  md += `## Chapter ${meta.chapterNum}: ${meta.title}\n\n`;
  md += `- **Source Document:** \`${meta.file}\`\n`;
  md += `- **Discipline / Subject:** ${meta.subject}\n`;
  md += `- **Target Standard:** NCERT Class 8 (Curriculum 8.2)\n`;
  md += `- **Pages Processed:** ${pagesAnalyzed} of ${totalPages} pages in textbook PDF\n`;
  md += `- **Total Questions Generated:** ${prodQuestions.length + v2Questions.length} items (${prodQuestions.length} production items + ${v2Questions.length} conceptual reasoning proof items)\n`;
  md += `- **Engine Version:** StudySynth Lite — Deterministic Reasoning Engine V2 (Repair 002)\n\n`;
  md += `---\n\n`;

  // Summary Table
  md += `### Question Distribution Overview\n\n`;
  md += `| Category | Count | Question Types / Subtypes |\n`;
  md += `| :--- | :--- | :--- |\n`;
  const prodSubtypes = {};
  prodQuestions.forEach(q => prodSubtypes[q.question_subtype] = (prodSubtypes[q.question_subtype] || 0) + 1);
  const v2Subtypes = {};
  v2Questions.forEach(q => v2Subtypes[q.question_subtype] = (v2Subtypes[q.question_subtype] || 0) + 1);

  const prodSubStr = Object.entries(prodSubtypes).map(([k, v]) => `${k} (${v})`).join(', ') || 'None';
  const v2SubStr = Object.entries(v2Subtypes).map(([k, v]) => `${k} (${v})`).join(', ') || 'None';

  md += `| **Production Questions** | ${prodQuestions.length} | ${prodSubStr} |\n`;
  md += `| **Conceptual Reasoning V2** | ${v2Questions.length} | ${v2SubStr} |\n`;
  md += `| **Total** | **${prodQuestions.length + v2Questions.length}** | Verified Evidence-Grounded Items |\n\n`;
  md += `---\n\n`;

  // Part I: Production Questions with deterministic unique namespaced IDs
  md += `## Part I: Verified Production Questions\n\n`;
  prodQuestions.forEach((q, idx) => {
    const uniqueId = `Q-P${meta.chapterNum}-${padNumber(idx + 1, 3)}`;
    md += `### Question ${idx + 1} [${uniqueId}]\n`;
    md += `- **Subtype:** \`${q.question_subtype}\`\n`;
    md += `- **Difficulty:** \`${q.difficulty || 'medium'}\`\n`;
    md += `- **Cognitive Category:** \`${q.cognitive_level || q.cognitive_category || 'understanding'}\`\n`;
    md += `- **Answer Key:** **${q.answer_key}**\n\n`;
    md += `**Stem:**\n> ${q.stem}\n\n`;
    // Phase 8 fix: multi-statement questions are unanswerable in markdown
    // unless their statements are printed. The app renderer already does
    // this; the batch report did not, which is why Phase 8 inspection
    // found stems with no statements at all.
    if (Array.isArray(q.statements) && q.statements.length) {
      md += `**Statements:**\n`;
      q.statements.forEach((s) => {
        md += `- **${s.number || s.index})** ${s.text}\n`;
      });
      md += `\n${q.prompt_suffix || 'Which of the statements given above is/are correct?'}\n\n`;
    }
    md += `**Options:**\n`;
    q.options.forEach((opt) => {
      const mark = opt.is_correct
        ? ' **(CORRECT ANSWER)**'
        : ` *(Distractor Origin: \`${opt.distractor_origin || 'entity-pool'}\`)*`;
      md += `- **${opt.key})** ${opt.text}${mark}\n`;
    });
    if (q.supporting_excerpt) {
      md += `\n**Supporting Textbook Excerpt:**\n> "${q.supporting_excerpt}"\n\n`;
    }
    md += `**Explanation:**\n${q.explanation}\n\n`;
    if (q.proof_trace && q.proof_trace.steps && q.proof_trace.steps.length > 0) {
      md += `**Proof Trace:**\n`;
      q.proof_trace.steps.forEach(st => md += `- ${st}\n`);
      md += `\n`;
    }
    md += `---\n\n`;
  });

  // Part II: Reasoning V2 Questions with deterministic unique namespaced IDs
  if (v2Questions.length > 0) {
    md += `## Part II: Conceptual Reasoning V2 Items (With Inference & Proof Traces)\n\n`;
    v2Questions.forEach((q, idx) => {
      const uniqueId = `Q-C${meta.chapterNum}-${padNumber(idx + 1, 3)}`;
      md += `### Conceptual Item ${idx + 1} [${uniqueId}]\n`;
      md += `- **Subtype:** \`${q.question_subtype}\`\n`;
      md += `- **Cognitive Difficulty:** \`${q.difficulty}\`\n`;
      md += `- **Reasoning Operator:** \`${q.proof_trace ? q.proof_trace.operator : q.primary_operator}\`\n`;
      md += `- **Answer Key:** **${q.answer_key}**\n\n`;
      md += `**Stem:**\n> ${q.stem}\n\n`;
      md += `**Options:**\n`;
      q.options.forEach((opt) => {
        const mark = opt.is_correct
          ? ' **(CORRECT ANSWER)**'
          : ` *(Distractor Strategy: \`${opt.transformation_type || 'misconception'}\`)*`;
        md += `- **${opt.key})** ${opt.text}${mark}\n`;
      });
      md += `\n**Proof Trace & Inference Steps:**\n`;
      if (q.proof_trace && Array.isArray(q.proof_trace.steps)) {
        q.proof_trace.steps.forEach((step) => {
          md += `- ${step}\n`;
        });
      }
      if (q.supporting_excerpt) {
        md += `\n**Supporting Textbook Excerpt:**\n> "${q.supporting_excerpt}"\n\n`;
      }
      md += `**Explanation:**\n${q.explanation}\n\n`;
      md += `---\n\n`;
    });
  }

  return md;
}

async function batchProcess() {
  const pdfjs = await import('../vendor/pdfjs/pdf.mjs');
  const Engine = require('../engine/generator.js');
  const EngineV2 = require('../engine/reasoning/engine_v2.js');
  const Analysis = require('../engine/analyze.js');

  // Repair 002: source directory is configurable (NCERT_PDF_DIR) so the
  // batch can run outside the original Windows workstation; the
  // Windows default is kept for backward compatibility.
  const pdfDir = process.env.NCERT_PDF_DIR || 'C:/Users/Admin/Desktop/NCERT/8.2';
  // Phase 2E opt-in shadow telemetry. This diagnostics-only branch runs
  // BEFORE any bank-writing routine and returns before the production
  // chapter loop, so telemetry mode can never write banks, the
  // consolidated file, or the standard manifest: it writes only the
  // Phase 2E diagnostic files via the shared harness module (the same
  // module the standalone diagnostics script uses, so the two entry
  // points cannot diverge). Without the flag, execution reaches the
  // exact production path below, unchanged. The branch extracts page
  // layouts itself through the same pdfParser.extractPageLayout call
  // the production loop uses; it does not reuse production analysis
  // output, because production analysis must not run in telemetry mode.
  if (process.argv.includes('--shadow-telemetry')) {
    console.log(`========================================================================`);
    console.log(`STUDYSYNTH LITE — SHADOW TELEMETRY ONLY (PHASE 2E, DIAGNOSTICS-ONLY)`);
    console.log(`========================================================================`);
    console.log(`Source Folder: ${pdfDir}`);
    console.log(`Diagnostics Output Folder: ${path.resolve(__dirname, '../../diagnostics')}`);
    console.log(`No production banks, consolidated file, or standard manifest will be written.`);
    const harness = require('../../diagnostics/tools/diagnose_corpus_phase2e.js');
    await harness.runShadowTelemetry(pdfDir, path.resolve(__dirname, '../../diagnostics'));
    console.log(`SHADOW TELEMETRY COMPLETE (no production output written).`);
    return;
  }
  // Staging output directory: preserves original question banks completely untouched
  const outDirStaged = path.resolve(__dirname, '../data/ncert_8_2_staged');
  fs.mkdirSync(outDirStaged, { recursive: true });

  // Optional page limit argument (e.g. "node batch_generate_all_ncert.js 20")
  const pageLimitArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  console.log(`========================================================================`);
  console.log(`STUDYSYNTH LITE — NCERT CLASS 8 BATCH GENERATOR (STAGED REPAIR 002)`);
  console.log(`========================================================================`);
  console.log(`Source Folder: ${pdfDir}`);
  console.log(`Staging Output Folder: ${outDirStaged}`);
  console.log(`Page Processing Mode: ${pageLimitArg ? `Limited to first ${pageLimitArg} pages` : 'Full Chapter (ALL pages)'}`);
  console.log(`Chapters to process: ${CHAPTER_MANIFEST.length}`);

  const resultsSummary = [];

  for (const item of CHAPTER_MANIFEST) {
    const pdfPath = path.join(pdfDir, item.file);
    if (!fs.existsSync(pdfPath)) {
      console.error(`[SKIP] Missing file: ${pdfPath}`);
      continue;
    }

    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Processing Chapter ${item.chapterNum}: "${item.title}" (${item.file})...`);

    const buffer = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({
      data: buffer,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true
    }).promise;

    const totalPages = doc.numPages;
    const pagesToRead = pageLimitArg && pageLimitArg > 0 ? Math.min(pageLimitArg, totalPages) : totalPages;
    const pagesText = [];

    for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
      const page = await doc.getPage(pageNum);
      const layoutResult = await extractPageLayoutText(page, pageNum);
      if (layoutResult.text && layoutResult.text.length > 30) {
        pagesText.push(`==Page ${pageNum}==\n${layoutResult.text}`);
      }
      page.cleanup();
    }

    const rawDocumentText = `# NCERT Class 8 ${item.subject} — Chapter ${item.chapterNum}: ${item.title}\n\n` + pagesText.join('\n\n');
    console.log(`  Extracted: ${rawDocumentText.length} chars from ${pagesText.length} pages (of ${totalPages} total)`);

    // 1. Run Production Question Generator (targeting 15 verified questions)
    const analysisResult = Analysis.analyzeSource(
      rawDocumentText,
      `NCERT Class 8 ${item.subject}: ${item.title}`,
      { sourceMeta: { type: 'textbook', grade: 8, subject: item.subject.toLowerCase() } },
      15
    );

    const prodQuestions = analysisResult.questions || [];
    console.log(`  Production Questions: ${prodQuestions.length} verified items`);

    // 2. Run Conceptual Reasoning V2 Engine (targeting 5 deep proof items)
    const sectionsToUse = (analysisResult.sections && analysisResult.sections.length > 0)
      ? analysisResult.sections
      : Engine.parseRawDocument(rawDocumentText, item.title);
    let v2Questions = [];
    try {
      v2Questions = EngineV2.generateReasoningQuestionBank(sectionsToUse, {
        facts: analysisResult.facts,
        targetCount: 5
      });
    } catch (v2Err) {
      console.warn(`  Warning: V2 engine generation encountered issue: ${v2Err.message}`);
    }
    console.log(`  Reasoning V2 Questions: ${v2Questions.length} conceptual proof items`);

    // 3. Build Markdown Report
    const mdContent = buildMarkdownReport(item, prodQuestions, v2Questions, pagesText.length, totalPages);

    // Save strictly to local staged directory: pwa/data/ncert_8_2_staged/
    const localFilePath = path.join(outDirStaged, `${item.outBase}.md`);
    fs.writeFileSync(localFilePath, mdContent, 'utf-8');

    console.log(`  ✓ Saved: ${localFilePath}`);

    resultsSummary.push({
      chapter: item.chapterNum,
      title: item.title,
      file: item.file,
      pagesProcessed: `${pagesText.length}/${totalPages}`,
      prodCount: prodQuestions.length,
      v2Count: v2Questions.length,
      total: prodQuestions.length + v2Questions.length,
      stagedFile: localFilePath
    });
  }

  console.log(`\n========================================================================`);
  console.log(`BATCH PROCESSING COMPLETE (STAGED REPAIR 002)`);
  console.log(`========================================================================`);
  console.table(resultsSummary.map(r => ({
    Chapter: `Ch ${r.chapter}`,
    Title: r.title.slice(0, 30),
    PDF: r.file,
    Pages: r.pagesProcessed,
    'Prod Qs': r.prodCount,
    'V2 Qs': r.v2Count,
    Total: r.total
  })));

  // Write summary manifest only when at least one chapter was actually
  // processed. An all-skipped run must not overwrite a previous manifest
  // with an empty list (Repair 002 safety fix, found during the Phase 8
  // attempt with missing source PDFs).
  if (resultsSummary.length > 0) {
    fs.writeFileSync(
      path.join(outDirStaged, 'summary_manifest.json'),
      JSON.stringify(resultsSummary, null, 2),
      'utf-8'
    );
  } else {
    console.warn('No chapters were processed; existing summary_manifest.json was left untouched.');
  }
}

batchProcess().catch((err) => {
  console.error('Fatal batch generator error:', err);
  process.exit(1);
});
