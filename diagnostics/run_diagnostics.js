/**
 * StudySynth Lite — Diagnostic Instrument Pass 1
 * trace_geography_pipeline.js
 * 
 * Instruments every pipeline boundary (Stages 1 through 12) for:
 * 1. Target Failure: The 1000 km map-scale candidate
 * 2. Control Sample 1: Valid ordinary prose definition (map projection)
 * 3. Control Sample 2: Malformed entity/attribute involving running page furniture
 */

const fs = require('fs');
const path = require('path');

// Polyfills for Node environment
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

async function runDiagnostic() {
  const pdfjs = await import('../pwa/vendor/pdfjs/pdf.mjs');
  const Engine = require('../pwa/engine/generator.js');
  const EngineV2 = require('../pwa/engine/reasoning/engine_v2.js');
  const Analysis = require('../pwa/engine/analyze.js');

  const pdfPath = 'C:/Users/Admin/Desktop/NCERT/8.2/hees201.pdf';
  const outDir = path.resolve(__dirname);
  fs.mkdirSync(outDir, { recursive: true });

  const traceLog = {
    metadata: {
      timestamp: new Date().toISOString(),
      pdfPath,
      gitRevision: '6f41314',
      branch: 'main'
    },
    stages: {}
  };

  console.log('[Diagnostic] 1. Loading PDF:', pdfPath);
  const buffer = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data: buffer,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  }).promise;

  // --------------------------------------------------------------------------
  // STAGE 1: PDF Extraction (Page by Page)
  // STAGE 2: Text-item & Block Segmentation with Coordinates
  // STAGE 3: Structural Classification (Header/Footer/Caption/Diagram/Body)
  // --------------------------------------------------------------------------
  console.log('[Diagnostic] 2. Extracting pages & inspecting layout...');
  const pageRecords = [];
  const pagesText = [];

  for (let pageNum = 1; pageNum <= 20; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();

    const rawItems = content.items.map((it, idx) => ({
      itemIndex: idx,
      str: it.str,
      x: Math.round(it.transform[4] * 10) / 10,
      y: Math.round(it.transform[5] * 10) / 10,
      width: Math.round(it.width * 10) / 10,
      height: Math.round(it.height * 10) / 10,
      fontName: it.fontName
    }));

    // Focus on key pages for detailed item capture: Page 2 (Control 1), Page 9 (Target failure), Page 10 (Target continuation)
    if ([2, 8, 9, 10].includes(pageNum)) {
      pageRecords.push({
        pageNum,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        totalItems: rawItems.length,
        items: rawItems
      });
    }

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

  traceLog.stages.stage1_pdf_pages = {
    totalPagesInDoc: doc.numPages,
    pagesAnalyzedCount: pagesText.length,
    inspectedPages: pageRecords.map(p => ({
      pageNum: p.pageNum,
      totalItems: p.totalItems,
      sampleItems: p.items.filter(it => it.str.trim().length > 0).slice(0, 15)
    }))
  };

  traceLog.stages.stage2_layout_items = {
    page9_figure_and_map_labels: pageRecords.find(p => p.pageNum === 9)?.items.filter(it => it.str.trim().length > 0),
    page10_header_and_body: pageRecords.find(p => p.pageNum === 10)?.items.filter(it => it.str.trim().length > 0).slice(0, 10),
    page2_prose_definition: pageRecords.find(p => p.pageNum === 2)?.items.filter(it => it.str.includes('projection') || it.str.includes('flat'))
  };

  // Check Stage 3: Does the pipeline implement layout/classification?
  traceLog.stages.stage3_classification_status = {
    implemented: false,
    finding: 'Neither batch_generate_all_ncert.js nor generator.js classifies text by coordinates, font, or element type (header, footer, caption, map label). All items in content.items are flattened via array join(" ").'
  };

  // --------------------------------------------------------------------------
  // STAGE 4: Page and Section Segmentation
  // --------------------------------------------------------------------------
  console.log('[Diagnostic] 3. Running Page & Section Segmentation...');
  const rawDocumentText = '# NCERT Class 8 Geography — Chapter 1: World Geography: Some Glimpses\n\n' + pagesText.join('\n\n');
  const sections = Engine.parseRawDocument(rawDocumentText, 'NCERT Class 8 Geography: World Geography: Some Glimpses');

  traceLog.stages.stage4_sections = {
    totalSectionsParsed: sections.length,
    sections: sections.map(s => ({
      id: s.id,
      title: s.title,
      textLength: s.text ? s.text.length : 0,
      page: s.page,
      contains1000km: s.text ? s.text.includes('1000 km') : false,
      containsMapProjection: s.text ? s.text.includes('map projection') : false
    }))
  };

  // --------------------------------------------------------------------------
  // STAGE 5: Sentence and Clause Segmentation
  // --------------------------------------------------------------------------
  console.log('[Diagnostic] 4. Sentence Segmentation...');
  const targetSection = sections.find(s => s.text && s.text.includes('1000 km'));
  const allSentences = targetSection ? Engine.splitSentences(targetSection.text) : [];

  const targetSentence = allSentences.find(s => s.includes('1000 km'));
  const control1Sentence = allSentences.find(s => s.includes('map projection'));
  const control2Sentence = allSentences.find(s => s.includes('Great Barrier Reef') && s.includes('Exploring Society'));

  traceLog.stages.stage5_sentences = {
    totalSentences: allSentences.length,
    targetFailureSentence: {
      text: targetSentence,
      length: targetSentence ? targetSentence.length : 0,
      finding: 'The entire block spanning Page 9 map labels, compass directions, Page 10 header, chapter subhead, and the first body sentence was merged into a single 272-character sentence because no terminal period existed in the map stream.'
    },
    control1Sentence: {
      text: control1Sentence,
      length: control1Sentence ? control1Sentence.length : 0
    },
    control2Sentence: {
      text: control2Sentence,
      length: control2Sentence ? control2Sentence.length : 0
    }
  };

  // --------------------------------------------------------------------------
  // STAGE 6: Extracted Facts (Relations, Types, Spans)
  // --------------------------------------------------------------------------
  console.log('[Diagnostic] 5. Extracting Facts...');
  const analysisResult = Analysis.analyzeSource(
    rawDocumentText,
    'NCERT Class 8 Geography: World Geography: Some Glimpses',
    { sourceMeta: { type: 'textbook', grade: 8, subject: 'geography' } },
    15
  );

  const facts = analysisResult.facts;
  const targetFact = facts.find(f => f.fact_id === 'F-LITE-092' || (f.object === '1000 km' && f.fact_type === 'numeric'));
  const control1Fact = facts.find(f => f.object && f.object.includes('map projection'));
  const control2Fact = facts.find(f => f.fact_id === 'F-LITE-091' || (f.subject && f.subject.includes('Exploring Society')));

  traceLog.stages.stage6_facts = {
    totalFactsExtracted: facts.length,
    targetFact,
    control1Fact,
    control2Fact
  };

  // --------------------------------------------------------------------------
  // STAGE 7: Knowledge Graph / Semantic Propositions
  // STAGE 8: Reasoning Operator Inputs & Preconditions
  // STAGE 9: Derived Propositions & Proof-Trace Premises
  // --------------------------------------------------------------------------
  console.log('[Diagnostic] 6. Reasoning V2 Engine Trace...');
  const compiled = EngineV2.generateReasoningQuestionBank(sections, { facts: analysisResult.facts, targetCount: 5 });

  traceLog.stages.stage7_to_9_reasoning_v2 = {
    v2QuestionCount: compiled.length,
    v2Items: compiled.map(q => ({
      id: q.id,
      subtype: q.question_subtype,
      operator: q.proof_trace ? q.proof_trace.operator : q.primary_operator,
      stem: q.stem,
      proof_steps: q.proof_trace ? q.proof_trace.steps : []
    }))
  };

  // --------------------------------------------------------------------------
  // STAGE 10: Candidate Question Stem, Expected Answer, Options, Metadata
  // STAGE 11: Validator Gate Result and Acceptance/Rejection Code
  // STAGE 12: Final Serialized Question-Bank Record
  // --------------------------------------------------------------------------
  console.log('[Diagnostic] 7. Inspecting Question Generation & Validation...');
  const targetQuestion = analysisResult.questions.find(q =>
    q.id === 'Q-LITE-001' || (q.stem && q.stem.includes('Equator ASIA AFRICA'))
  );
  const control1Question = analysisResult.questions.find(q =>
    q.id === 'Q-LITE-002' || (q.stem && q.stem.includes('flat surface'))
  );
  const control2Question = analysisResult.questions.find(q =>
    q.id === 'Q-LITE-011' || (q.stem && q.stem.includes('London Europe Mumbai'))
  );

  // Run validator directly to inspect how/why it validated
  const targetValidation = Engine.validateQuestion(targetQuestion, facts, { sections });
  const control1Validation = Engine.validateQuestion(control1Question, facts, { sections });
  const control2Validation = Engine.validateQuestion(control2Question, facts, { sections });

  traceLog.stages.stage10_to_12_questions = {
    targetFailure: {
      question: targetQuestion,
      validationResult: targetValidation
    },
    control1: {
      question: control1Question,
      validationResult: control1Validation
    },
    control2: {
      question: control2Question,
      validationResult: control2Validation
    }
  };

  // Write trace log to diagnostics directory
  const traceFilePath = path.join(outDir, 'pipeline_trace_data.json');
  fs.writeFileSync(traceFilePath, JSON.stringify(traceLog, null, 2), 'utf-8');
  console.log('[Diagnostic] ✓ Trace data saved to:', traceFilePath);

  return traceLog;
}

runDiagnostic().catch((err) => {
  console.error('[Diagnostic Fatal Error]:', err);
  process.exit(1);
});
