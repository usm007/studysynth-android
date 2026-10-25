/**
 * StudySynth Lite — Batch NCERT Class 8 Question Generator
 * Generates verified production questions and conceptual reasoning V2 questions
 * from all 8 NCERT Class 8 Social Science textbook PDFs.
 * Outputs individual markdown files for each PDF.
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

function buildMarkdownReport(meta, prodQuestions, v2Questions, pagesAnalyzed, totalPages) {
  let md = `# NCERT Class 8 Social Science — Generated Question Bank\n`;
  md += `## Chapter ${meta.chapterNum}: ${meta.title}\n\n`;
  md += `- **Source Document:** \`${meta.file}\`\n`;
  md += `- **Discipline / Subject:** ${meta.subject}\n`;
  md += `- **Target Standard:** NCERT Class 8 (Curriculum 8.2)\n`;
  md += `- **Pages Processed:** ${pagesAnalyzed} of ${totalPages} pages in textbook PDF\n`;
  md += `- **Total Questions Generated:** ${prodQuestions.length + v2Questions.length} items (${prodQuestions.length} production items + ${v2Questions.length} conceptual reasoning proof items)\n`;
  md += `- **Engine Version:** StudySynth Lite — Deterministic Reasoning Engine V2 (100% Offline, Zero-LLM)\n\n`;
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

  // Part I: Production Questions
  md += `## Part I: Verified Production Questions\n\n`;
  prodQuestions.forEach((q, idx) => {
    md += `### Question ${idx + 1} [${q.id}]\n`;
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
      q.proof_trace.steps.forEach(st => md += `- ${st}\n`);
      md += `\n`;
    }
    md += `---\n\n`;
  });

  // Part II: Reasoning V2 Questions
  if (v2Questions.length > 0) {
    md += `## Part II: Conceptual Reasoning V2 Items (With Inference & Proof Traces)\n\n`;
    v2Questions.forEach((q, idx) => {
      md += `### Conceptual Item ${idx + 1} [${q.id}]\n`;
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

  const pdfDir = 'C:/Users/Admin/Desktop/NCERT/8.2';
  const outDirLocal = path.resolve(__dirname, '../data/ncert_8_2');
  const outDirDesktop = 'C:/Users/Admin/Desktop/NCERT/8.2';

  fs.mkdirSync(outDirLocal, { recursive: true });

  console.log(`========================================================================`);
  console.log(`STUDYSYNTH LITE — NCERT CLASS 8 BATCH QUESTION GENERATOR`);
  console.log(`========================================================================`);
  console.log(`Source Folder: ${pdfDir}`);
  console.log(`Local Output Folder: ${outDirLocal}`);
  console.log(`Desktop Output Folder: ${outDirDesktop}`);
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
    // Extract pages: analyze up to 20 substantive pages for comprehensive coverage
    const pagesToRead = Math.min(20, totalPages);
    const pagesText = [];

    for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 50) {
        pagesText.push(`==Page ${pageNum}==\n${text}`);
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

    // Save to local pwa/data/ncert_8_2/
    const localFilePath = path.join(outDirLocal, `${item.outBase}.md`);
    fs.writeFileSync(localFilePath, mdContent, 'utf-8');

    // Also save directly to Desktop/NCERT/8.2/
    const desktopFilePath = path.join(outDirDesktop, `${item.outBase}.md`);
    fs.writeFileSync(desktopFilePath, mdContent, 'utf-8');

    console.log(`  ✓ Saved: ${localFilePath}`);
    console.log(`  ✓ Saved: ${desktopFilePath}`);

    resultsSummary.push({
      chapter: item.chapterNum,
      title: item.title,
      file: item.file,
      prodCount: prodQuestions.length,
      v2Count: v2Questions.length,
      total: prodQuestions.length + v2Questions.length,
      localFile: localFilePath,
      desktopFile: desktopFilePath
    });
  }

  console.log(`\n========================================================================`);
  console.log(`BATCH PROCESSING COMPLETE`);
  console.log(`========================================================================`);
  console.table(resultsSummary.map(r => ({
    Chapter: `Ch ${r.chapter}`,
    Title: r.title.slice(0, 32),
    PDF: r.file,
    'Prod Qs': r.prodCount,
    'V2 Qs': r.v2Count,
    Total: r.total
  })));
}

batchProcess().catch((err) => {
  console.error('Fatal batch generator error:', err);
  process.exit(1);
});
