/**
 * StudySynth Lite — Repair 002 question-bank audit.
 *
 * Reads the generated Repair 002 sidecars and verifies the integrity contracts
 * that the engine is supposed to guarantee:
 *   - exactly four distinct, non-empty options and one correct key;
 *   - no fabricated filler, no option that repeats the key;
 *   - every evidence offset is valid and every excerpt is grounded;
 *   - V2 questions use only the production operator allowlist and carry
 *     resolvable proof premises;
 *   - every chapter records real page coverage.
 *
 * Usage: node tests/audit_question_bank.js [outputDir]
 * Writes audit_report.json next to the sidecars and exits non-zero on failure.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.resolve(__dirname, '../data/ncert_8_2_repair_002');
const PRODUCTION_OPERATORS = new Set(['OP_B', 'OP_C', 'OP_F', 'OP_H', 'OP_I', 'OP_J']);
const FILLER_OPTION = /^(?:none\s+of\s+(?:these|the\s+above)|all\s+of\s+the\s+above|not\s+stated|cannot\s+be\s+determined|unknown|tbd|lorem\s+ipsum|option\s+[a-d]|generic\s+filler)$/i;
const KNOWN_FILLER = new Set([
  'communication relay', 'sample collection', 'orbit correction',
  'temperature measurement', 'power generation', 'data storage',
  'statutory regulator', 'advisory body', 'public broadcaster',
  'research institution', 'implementing agency', 'judicial authority',
  'solid-propellant boosters', 'ion thrusters', 'solar sails',
  'hydraulic actuators', 'electric batteries', 'mechanical springs',
  'the object to move more slowly', 'the object to remain stationary',
  'the object to gain mass', 'the object to change colour'
]);
const TRUNCATED_LAST_WORD = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'but', 'with',
  'for', 'from', 'by', 'as', 'that', 'which', 'who', 'whom', 'whose', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'its',
  'their', 'his', 'her', 'this', 'these', 'those', 'such', 'than', 'then',
  'when', 'where', 'while', 'because', 'into', 'over', 'under', 'between',
  'among', 'through', 'during', 'about', 'after', 'before', 'against',
  'within', 'without', 'across', 'along', 'around', 'behind', 'below',
  'above', 'near', 'regarding', 'including',
  'per', 'via'
]);
const BAD_V2_STEM = /\b(?:versus|vs\.?)\s+(?:hence|however|thus|therefore|moreover)\b|\b(?:produces?|causes?|triggers?|results?\s+in)\s+to\s+\w+/i;

function normalize(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function isBlank(value) {
  return !normalize(value);
}

function endsOnFunctionWord(value) {
  const text = normalize(value);
  if (/(?:and\s+)?so\s+on$/.test(text)) return false;
  const tokens = text.split(/\s+/);
  const rawLast = tokens.length ? tokens[tokens.length - 1] : '';
  const last = rawLast.replace(/[.,;:!?"'”’)\]]+$/g, '');
  // Apostrophes are word-internal ("Qur'an"), never a function word boundary.
  if (!last || /[’']/.test(rawLast)) return false;
  return TRUNCATED_LAST_WORD.has(last);
}

function operatorCode(value) {
  const match = String(value || '').match(/^OP_[A-Z]/);
  return match ? match[0] : '';
}

function auditOptions(question, label, errors) {
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length !== 4) {
    errors.push(`${label}: expected exactly 4 options, found ${options.length}`);
  }
  const keys = new Set();
  const texts = new Set();
  let correctCount = 0;
  let correctKey = null;
  for (const option of options) {
    if (!option || isBlank(option.text)) {
      errors.push(`${label}: empty option text`);
      continue;
    }
    const key = String(option.key || '').trim().toUpperCase();
    if (!/^[A-D]$/.test(key)) errors.push(`${label}: option key "${option.key}" is not A-D`);
    if (keys.has(key)) errors.push(`${label}: duplicate option key ${key}`);
    keys.add(key);

    const text = normalize(option.text);
    if (texts.has(text)) errors.push(`${label}: duplicate option text "${option.text}"`);
    texts.add(text);

    if (FILLER_OPTION.test(text) || KNOWN_FILLER.has(text)) {
      errors.push(`${label}: fabricated filler option "${option.text}"`);
    }
    if (text.length > 160) errors.push(`${label}: option is a run-on (${text.length} chars): "${option.text}"`);
    if (endsOnFunctionWord(text)) errors.push(`${label}: option ends on a function word (truncated): "${option.text}"`);
    if (!/[A-Za-z0-9]/.test(text)) errors.push(`${label}: option has no letters or digits: "${option.text}"`);

    if (option.is_correct) {
      correctCount += 1;
      correctKey = key;
    }
  }
  if (correctCount !== 1) errors.push(`${label}: expected exactly 1 correct option, found ${correctCount}`);
  if (correctKey && String(question.answer_key || '').toUpperCase() !== correctKey) {
    errors.push(`${label}: answer_key "${question.answer_key}" does not match correct option ${correctKey}`);
  }
  if (question.expected_answer && normalize(question.expected_answer) !== normalize((options.find((o) => o && o.is_correct) || {}).text)) {
    errors.push(`${label}: expected_answer does not match the correct option`);
  }
}

function auditProductionQuestion(question, index, factsById, errors) {
  const label = `production[${index}] ${question && question.id ? question.id : '?'}`;
  if (!question || !question.stem || isBlank(question.stem)) {
    errors.push(`${label}: missing stem`);
    return;
  }
  auditOptions(question, label, errors);
  for (const option of question.options || []) {
    if (!option.is_correct && !option.distractor_origin) {
      errors.push(`${label}: distractor has no typed origin: "${option.text}"`);
    }
    if (option.distractor_origin && /controlled_/i.test(option.distractor_origin)) {
      errors.push(`${label}: distractor uses a retired generic pool (${option.distractor_origin})`);
    }
  }
  if (question.supporting_excerpt && !isBlank(question.supporting_excerpt)) {
    const grounded = (question.evidence && Array.isArray(question.evidence.excerpts) && question.evidence.excerpts.length > 0) ||
      (question.evidence && Array.isArray(question.evidence.source_offsets) && question.evidence.source_offsets.length > 0);
    if (!grounded) errors.push(`${label}: excerpt has no evidence record`);
  }
  if (question.evidence && Array.isArray(question.evidence.source_offsets)) {
    for (const offset of question.evidence.source_offsets) {
      if (!offset || !Number.isInteger(offset.start) || !Number.isInteger(offset.end)) {
        errors.push(`${label}: malformed source offset`);
        continue;
      }
      if (offset.start < 0 || offset.end <= offset.start) {
        errors.push(`${label}: invalid source offset ${offset.start}-${offset.end}`);
      }
      if (offset.fact_id && !factsById.has(offset.fact_id)) {
        errors.push(`${label}: source offset references unknown fact ${offset.fact_id}`);
      }
    }
  }
}

function auditV2Question(question, index, factsById, graphPropIds, errors, prefix) {
  const label = `${prefix || 'reasoning_v2'}[${index}] ${question && question.id ? question.id : '?'}`;
  if (!question || !question.stem || isBlank(question.stem)) {
    errors.push(`${label}: missing stem`);
    return;
  }
  const operator = String(question.primary_operator || (question.proof_trace && question.proof_trace.operator) || '');
  const code = operatorCode(operator);
  if (!PRODUCTION_OPERATORS.has(code)) {
    errors.push(`${label}: operator ${operator || '(none)'} is not in the production allowlist`);
  }
  if (BAD_V2_STEM.test(question.stem)) {
    errors.push(`${label}: stem contains a malformed causal/contrast phrase: "${question.stem}"`);
  }
  if (endsOnFunctionWord(question.stem)) {
    errors.push(`${label}: stem ends on a function word: "${question.stem}"`);
  }
  auditOptions(question, label, errors);

  const proof = question.proof_trace || {};
  const premises = Array.isArray(proof.premises) ? proof.premises : [];
  if (!premises.length) errors.push(`${label}: proof trace has no premises`);
  for (const premise of premises) {
    if (factsById.has(premise)) continue;
    if (graphPropIds.has(premise)) continue;
    errors.push(`${label}: proof premise ${premise} is not a source fact or graph proposition`);
  }
  if (question.verification && question.verification.status !== 'verified') {
    errors.push(`${label}: verification status is "${question.verification.status}", not verified`);
  }
  for (const option of question.options || []) {
    if (!option.is_correct && !option.distractor_origin && !option.transformation_type) {
      errors.push(`${label}: V2 distractor is untyped: "${option.text}"`);
    }
  }
}

function auditChapter(filePath) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { file: path.basename(filePath), errors: [`unreadable sidecar: ${err.message}`], warnings, counts: {} };
  }

  const coverage = data.coverage || {};
  if (!coverage.totalPages || coverage.totalPages < 1) errors.push('coverage: totalPages missing');
  if (!coverage.pagesProcessed || coverage.pagesProcessed < 1) errors.push('coverage: pagesProcessed missing');
  if (coverage.pagesProcessed > coverage.totalPages) errors.push('coverage: pagesProcessed exceeds totalPages');
  if (!coverage.pagesWithBody || coverage.pagesWithBody < 1) errors.push('coverage: no page yielded body prose');
  if (!coverage.blockTypes || !coverage.blockTypes.body) errors.push('coverage: no body blocks recorded');
  if (coverage.pagesProcessed !== coverage.totalPages) {
    warnings.push(`coverage: processed ${coverage.pagesProcessed} of ${coverage.totalPages} pages (page limit in effect)`);
  }

  const facts = Array.isArray(data.facts) ? data.facts : [];
  const factsById = new Set();
  for (const fact of facts) {
    if (!fact.fact_id) {
      errors.push('fact: missing fact_id');
      continue;
    }
    factsById.add(fact.fact_id);
    if (fact.relation !== 'unclassified') {
      if (isBlank(fact.subject) || isBlank(fact.object)) {
        errors.push(`${fact.fact_id}: typed fact has an empty subject or object`);
      }
      if (fact.sentence_role !== 'assertion') {
        errors.push(`${fact.fact_id}: typed fact has sentence_role "${fact.sentence_role}"`);
      }
      if (!fact.source_text || isBlank(fact.source_text)) {
        errors.push(`${fact.fact_id}: typed fact has no source text`);
      }
      if (!Number.isInteger(fact.source_start) || !Number.isInteger(fact.source_end) ||
          fact.source_start < 0 || fact.source_end <= fact.source_start) {
        errors.push(`${fact.fact_id}: invalid source offsets`);
      }
    }
  }

  const graphPropIds = new Set(
    (Array.isArray(data.graph_propositions) ? data.graph_propositions : [])
      .map((prop) => (prop && prop.id) || null)
      .filter(Boolean)
  );

  const questions = Array.isArray(data.questions) ? data.questions : [];
  questions.forEach((question, index) => {
    if (question && question.primary_operator) {
      auditV2Question(question, index, factsById, graphPropIds, errors, 'production');
    } else {
      auditProductionQuestion(question, index, factsById, errors);
    }
  });

  const v2 = Array.isArray(data.reasoning_v2) ? data.reasoning_v2 : [];
  v2.forEach((question, index) => auditV2Question(question, index, factsById, graphPropIds, errors));

  const stems = new Map();
  for (const question of questions.concat(v2)) {
    const stem = normalize(question.stem);
    if (!stem) continue;
    // A V2 item is published in both the bank and the reasoning sidecar; that
    // is the same question, not a duplicate.
    const identity = question.candidate_id || question.id || stem;
    if (stems.has(stem)) {
      if (stems.get(stem) !== identity) errors.push(`duplicate stem: "${question.stem}"`);
      continue;
    }
    stems.set(stem, identity);
  }

  return {
    file: path.basename(filePath),
    chapter: data.meta ? data.meta.chapterNum : null,
    title: data.meta ? data.meta.title : null,
    errors,
    warnings,
    counts: {
      facts: facts.length,
      typedFacts: facts.filter((fact) => fact.relation !== 'unclassified').length,
      production: questions.filter((question) => !question.primary_operator).length,
      reasoningV2: v2.length
    },
    coverage: {
      pagesProcessed: coverage.pagesProcessed || 0,
      totalPages: coverage.totalPages || 0,
      pagesWithBody: coverage.pagesWithBody || 0,
      blockTypes: coverage.blockTypes || {}
    }
  };
}

function main() {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR;
  if (!fs.existsSync(targetDir)) {
    console.error(`Audit target not found: ${targetDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(targetDir)
    .filter((name) => name.endsWith('.json') && name !== 'summary_manifest.json' && name !== 'audit_report.json')
    .sort();

  if (!files.length) {
    console.error(`No chapter sidecars found in ${targetDir}`);
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log('STUDYSYNTH LITE — REPAIR 002 QUESTION-BANK AUDIT');
  console.log('='.repeat(72));
  console.log(`Target: ${targetDir}`);
  console.log(`Chapters: ${files.length}\n`);

  const chapters = files.map((name) => auditChapter(path.join(targetDir, name)));
  const totals = chapters.reduce((acc, chapter) => {
    acc.errors += chapter.errors.length;
    acc.warnings += chapter.warnings.length;
    acc.facts += chapter.counts.facts || 0;
    acc.typedFacts += chapter.counts.typedFacts || 0;
    acc.production += chapter.counts.production || 0;
    acc.reasoningV2 += chapter.counts.reasoningV2 || 0;
    return acc;
  }, { errors: 0, warnings: 0, facts: 0, typedFacts: 0, production: 0, reasoningV2: 0 });

  for (const chapter of chapters) {
    const status = chapter.errors.length ? 'FAIL' : (chapter.warnings.length ? 'WARN' : 'PASS');
    console.log(`[${status}] ${chapter.file}`);
    console.log(`       Ch ${chapter.chapter || '?'} | facts ${chapter.counts.typedFacts}/${chapter.counts.facts} typed | production ${chapter.counts.production} | V2 ${chapter.counts.reasoningV2}`);
    console.log(`       pages ${chapter.coverage.pagesWithBody}/${chapter.coverage.pagesProcessed} with body (of ${chapter.coverage.totalPages})`);
    for (const error of chapter.errors) console.log(`       ERROR: ${error}`);
    for (const warning of chapter.warnings) console.log(`       WARN:  ${warning}`);
  }

  console.log('\n' + '-'.repeat(72));
  console.log(`Totals: ${totals.production} production + ${totals.reasoningV2} V2 = ${totals.production + totals.reasoningV2} questions`);
  console.log(`        ${totals.typedFacts}/${totals.facts} facts typed | ${totals.errors} errors | ${totals.warnings} warnings`);

  const report = {
    generated_at: new Date().toISOString(),
    target: targetDir,
    production_operators: Array.from(PRODUCTION_OPERATORS),
    totals,
    chapters
  };
  const reportPath = path.join(targetDir, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport: ${reportPath}`);

  if (totals.errors > 0) {
    console.error('\nAUDIT FAILED');
    process.exit(1);
  }
  console.log('\nAUDIT PASSED');
}

main();
