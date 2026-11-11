/**
 * StudySynth Lite — Batch NCERT Class 8 Question Generator (Targeted Repair 002)
 *
 * Uses the shared, layout-aware PDF extractor from engine/pdfParser.js so the
 * batch path and the app path can never diverge. Only confirmed `body` blocks
 * are fed to the generator; headings are emitted as section markers and every
 * other block type (caption, table, diagram, page_furniture, fragment,
 * ambiguous) is recorded but never used as a fact source.
 *
 * Outputs strictly into pwa/data/ncert_8_2_repair_002/.
 */

const fs = require('fs');
const path = require('path');

// Node.js environment polyfills for the browser PDF.js build.
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

const OUTPUT_DIR = path.resolve(__dirname, '../data/ncert_8_2_repair_002');
const FORBIDDEN_OUTPUT_DIRS = [
  path.resolve(__dirname, '../data/ncert_8_2'),
  path.resolve(__dirname, '../data/ncert_8_2_staged')
];

function padNumber(num, size) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

function assertSafeOutputDir(dir) {
  const resolved = path.resolve(dir);
  for (const forbidden of FORBIDDEN_OUTPUT_DIRS) {
    if (resolved === forbidden || resolved.startsWith(forbidden + path.sep)) {
      throw new Error('Refusing to write Repair 002 output into baseline directory: ' + resolved);
    }
  }
}

/**
 * Extracts one page through the shared layout engine and renders the document
 * stream. Body blocks become prose; headings become section markers. Nothing
 * else is ever promoted to prose.
 */
async function extractPageThroughSharedLayout(parser, page, pageNumber) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const layout = parser.extractPageLayout(content, viewport, pageNumber);

  const headings = layout.blocks
    .filter((block) => block.type === 'heading')
    .map((block) => block.text.replace(/\s+/g, ' ').trim())
    .filter((text) => text && text.length <= 120);

  const bodyText = layout.bodyText.trim();
  const parts = [];
  if (headings.length) parts.push(headings.map((text) => '# ' + text).join('\n'));
  if (bodyText) parts.push(bodyText);

  return {
    pageNumber,
    text: parts.join('\n\n'),
    hasBody: layout.stats.bodyBlockCount > 0,
    textItemCount: layout.stats.textItemCount,
    bodyBlockCount: layout.stats.bodyBlockCount,
    blockCount: layout.stats.blockCount,
    blockTypes: layout.blocks.reduce((acc, block) => {
      acc[block.type] = (acc[block.type] || 0) + 1;
      return acc;
    }, {})
  };
}

function mergeBlockTypes(target, source) {
  for (const [type, count] of Object.entries(source || {})) {
    target[type] = (target[type] || 0) + count;
  }
  return target;
}

function buildMarkdownReport(meta, prodQuestions, v2Questions, coverage) {
  const legacyQuestions = prodQuestions.filter((question) => !question.primary_operator);
  const totalCount = legacyQuestions.length + v2Questions.length;
  let md = `# NCERT Class 8 Social Science — Generated Question Bank (Repair 002)\n`;
  md += `## Chapter ${meta.chapterNum}: ${meta.title}\n\n`;
  md += `- **Source Document:** \`${meta.file}\`\n`;
  md += `- **Discipline / Subject:** ${meta.subject}\n`;
  md += `- **Target Standard:** NCERT Class 8 (Curriculum 8.2)\n`;
  md += `- **Pages Processed:** ${coverage.pagesProcessed} of ${coverage.totalPages} pages in textbook PDF\n`;
  md += `- **Pages With Body Prose:** ${coverage.pagesWithBody} of ${coverage.pagesProcessed}\n`;
  md += `- **Pages Without Body Prose:** ${coverage.pagesWithoutBody} (cover, map, figure, or exercise-only pages)\n`;
  md += `- **Total Questions Generated:** ${totalCount} items (${legacyQuestions.length} factual recall items + ${v2Questions.length} conceptual reasoning proof items)\n`;
  md += `- **Engine Version:** StudySynth Lite — Deterministic Reasoning Engine V2 (Targeted Repair 002)\n\n`;
  md += `---\n\n`;

  md += `### Question Distribution Overview\n\n`;
  md += `| Category | Count | Question Types / Subtypes |\n`;
  md += `| :--- | :--- | :--- |\n`;
  const prodSubtypes = {};
  legacyQuestions.forEach((q) => {
    prodSubtypes[q.question_subtype] = (prodSubtypes[q.question_subtype] || 0) + 1;
  });
  const v2Subtypes = {};
  v2Questions.forEach((q) => {
    v2Subtypes[q.question_subtype] = (v2Subtypes[q.question_subtype] || 0) + 1;
  });

  const prodSubStr = Object.entries(prodSubtypes).map(([k, v]) => `${k} (${v})`).join(', ') || 'None';
  const v2SubStr = Object.entries(v2Subtypes).map(([k, v]) => `${k} (${v})`).join(', ') || 'None';

  md += `| **Production Questions** | ${legacyQuestions.length} | ${prodSubStr} |\n`;
  md += `| **Conceptual Reasoning V2** | ${v2Questions.length} | ${v2SubStr} |\n`;
  md += `| **Total** | **${totalCount}** | Verified Evidence-Grounded Items |\n\n`;
  md += `---\n\n`;

  md += `## Part I: Verified Production Questions\n\n`;
  legacyQuestions.forEach((q, idx) => {
    const uniqueId = `Q-P${meta.chapterNum}-${padNumber(idx + 1, 3)}`;
    md += `### Question ${idx + 1} [${uniqueId}]\n`;
    md += `- **Subtype:** \`${q.question_subtype}\`\n`;
    md += `- **Cognitive Category:** \`${q.cognitive_category || 'understanding'}\`\n`;
    md += `- **Answer Key:** **${q.answer_key}**\n\n`;
    md += `**Stem:**\n> ${q.stem}\n\n`;
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
      q.proof_trace.steps.forEach((st) => { md += `- ${st}\n`; });
      md += `\n`;
    }
    md += `---\n\n`;
  });

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
  assertSafeOutputDir(OUTPUT_DIR);

  const pdfjs = await import('../vendor/pdfjs/pdf.mjs');
  const OfflineDocParser = require('../engine/pdfParser.js');
  const Engine = require('../engine/generator.js');
  const EngineV2 = require('../engine/reasoning/engine_v2.js');
  const Analysis = require('../engine/analyze.js');

  const pdfDir = 'C:/Users/Admin/Desktop/NCERT/8.2';
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const pageLimitArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  console.log(`========================================================================`);
  console.log(`STUDYSYNTH LITE — NCERT CLASS 8 BATCH GENERATOR (REPAIR 002)`);
  console.log(`========================================================================`);
  console.log(`Source Folder: ${pdfDir}`);
  console.log(`Output Folder: ${OUTPUT_DIR}`);
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
    const blockTypes = {};
    let pagesWithBody = 0;
    let textItemCount = 0;

    for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
      const page = await doc.getPage(pageNum);
      const pageResult = await extractPageThroughSharedLayout(OfflineDocParser, page, pageNum);
      if (pageResult.hasBody) pagesWithBody += 1;
      textItemCount += pageResult.textItemCount;
      mergeBlockTypes(blockTypes, pageResult.blockTypes);
      if (pageResult.text && pageResult.text.length > 30) {
        pagesText.push(`==Page ${pageNum}==\n${pageResult.text}`);
      }
      page.cleanup();
    }

    const coverage = {
      totalPages,
      pagesProcessed: pagesToRead,
      pagesWithBody,
      pagesWithoutBody: pagesToRead - pagesWithBody,
      textItemCount,
      blockTypes
    };

    const rawDocumentText = `# NCERT Class 8 ${item.subject} — Chapter ${item.chapterNum}: ${item.title}\n\n` + pagesText.join('\n\n');
    console.log(`  Extracted: ${rawDocumentText.length} chars; body prose on ${pagesWithBody}/${pagesToRead} pages`);
    console.log(`  Blocks: ${Object.entries(blockTypes).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);

    const analysisResult = Analysis.analyzeSource(
      rawDocumentText,
      `NCERT Class 8 ${item.subject}: ${item.title}`,
      { sourceMeta: { type: 'textbook', grade: 8, subject: item.subject.toLowerCase() } },
      15
    );

    const prodQuestions = analysisResult.questions || [];
    console.log(`  Production Questions: ${prodQuestions.length} verified items`);

    const sectionsToUse = (analysisResult.sections && analysisResult.sections.length > 0)
      ? analysisResult.sections
      : Engine.parseRawDocument(rawDocumentText, item.title);
    let v2Questions = [];
    const v2Target = 5;
    try {
      v2Questions = EngineV2.generateReasoningQuestionBank(sectionsToUse, {
        facts: analysisResult.facts,
        targetCount: Math.min(5, v2Target)
      });
    } catch (v2Err) {
      console.warn(`  Warning: V2 engine generation encountered issue: ${v2Err.message}`);
    }
    console.log(`  Reasoning V2 Questions: ${v2Questions.length} conceptual proof items`);

    const mdContent = buildMarkdownReport(item, prodQuestions, v2Questions, coverage);
    const localFilePath = path.join(OUTPUT_DIR, `${item.outBase}.md`);
    fs.writeFileSync(localFilePath, mdContent, 'utf-8');

    const graph = v2Questions && v2Questions.graph;
    const graphPropositions = graph && typeof graph.getAllPropositions === 'function'
      ? graph.getAllPropositions().map((prop) => ({
          id: prop.id,
          subject: prop.subject,
          predicate: prop.predicate,
          relation_type: prop.relation_type,
          object: prop.object,
          is_derived: Boolean(prop.is_derived)
        }))
      : [];

    const jsonPath = path.join(OUTPUT_DIR, `${item.outBase}.json`);
    const sidecar = {
      meta: {
        file: item.file,
        chapterNum: item.chapterNum,
        subject: item.subject,
        title: item.title,
        outBase: item.outBase,
        engine: 'repair-002'
      },
      coverage,
      generation: analysisResult.generation || null,
      validation: analysisResult.validation || null,
      facts: (analysisResult.facts || []).map((fact) => ({        fact_id: fact.fact_id,
        subject: fact.subject,
        relation: fact.relation,
        object: fact.object,
        source_text: fact.source_text,
        source_start: fact.source_start,
        source_end: fact.source_end,
        sentence_role: fact.sentence_role || null,
        page: fact.page || null
      })),
      questions: prodQuestions,
      reasoning_v2: v2Questions,
      graph_propositions: graphPropositions
    };
    fs.writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2), 'utf-8');

    console.log(`  ✓ Saved: ${localFilePath}`);
    console.log(`  ✓ Saved: ${jsonPath}`);

    resultsSummary.push({
      chapter: item.chapterNum,
      title: item.title,
      file: item.file,
      outBase: item.outBase,
      coverage,
      prodCount: prodQuestions.filter((question) => !question.primary_operator).length,
      v2Count: v2Questions.length,
      total: prodQuestions.filter((question) => !question.primary_operator).length + v2Questions.length,
      factCount: (analysisResult.facts || []).length,
      stagedFile: localFilePath,
      dataFile: jsonPath
    });
  }

  console.log(`\n========================================================================`);
  console.log(`BATCH PROCESSING COMPLETE (REPAIR 002)`);
  console.log(`========================================================================`);
  console.table(resultsSummary.map((r) => ({
    Chapter: `Ch ${r.chapter}`,
    Title: r.title.slice(0, 30),
    PDF: r.file,
    Pages: `${r.coverage.pagesWithBody}/${r.coverage.pagesProcessed}`,
    Facts: r.factCount,
    'Prod Qs': r.prodCount,
    'V2 Qs': r.v2Count,
    Total: r.total
  })));

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary_manifest.json'),
    JSON.stringify(resultsSummary, null, 2),
    'utf-8'
  );
  console.log(`Summary manifest: ${path.join(OUTPUT_DIR, 'summary_manifest.json')}`);
}

batchProcess().catch((err) => {
  console.error('Fatal batch generator error:', err);
  process.exit(1);
});
