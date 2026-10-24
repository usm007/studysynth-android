/**
 * Deterministic engine benchmark.
 *
 * Measures parsing, fact extraction, inventory construction, generation, and
 * strict validation separately at 10, 100, and 500 source facts. The synthetic
 * document uses explicit date statements so every size exercises the same
 * extraction and candidate paths without relying on network access.
 */

const Engine = require('../engine/generator.js');

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function makeDocument(factCount) {
  const lines = ['# Deterministic Benchmark Source', ''];
  for (let index = 0; index < factCount; index++) {
    const subject = `Organisation ${String(index + 1).padStart(4, '0')}`;
    const year = 1900 + (index % 120);
    lines.push(`${subject} was established in ${year}.`);
  }
  return lines.join('\n');
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runOnce(factCount) {
  const raw = makeDocument(factCount);

  let start = process.hrtime.bigint();
  const sections = Engine.parseRawDocument(raw, `Benchmark ${factCount}`);
  const parseMs = elapsedMs(start);

  start = process.hrtime.bigint();
  const extracted = Engine.extractSourceFacts(sections);
  const extractMs = elapsedMs(start);

  start = process.hrtime.bigint();
  const conflictResult = Engine.detectFactConflicts(extracted);
  const conflictMs = elapsedMs(start);

  start = process.hrtime.bigint();
  const inventory = Engine.buildKnowledgeInventory(sections, {
    facts: conflictResult.facts,
    conflicts: conflictResult.conflicts
  });
  const inventoryMs = elapsedMs(start);

  start = process.hrtime.bigint();
  const bank = Engine.generateQuestionBank(inventory, {
    targetCount: 15,
    facts: conflictResult.facts,
    conflicts: conflictResult.conflicts,
    sections
  });
  const generateMs = elapsedMs(start);

  start = process.hrtime.bigint();
  const validation = Engine.validateQuestionBank(bank, {
    facts: conflictResult.facts,
    sections,
    candidateCount: bank.generation.totalCandidates,
    rejectionCounts: bank.generation.rejectionCounts
  });
  const validateMs = elapsedMs(start);

  if (!validation.valid) {
    throw new Error(`Benchmark ${factCount} produced an invalid bank.`);
  }
  if (!bank.length) {
    throw new Error(`Benchmark ${factCount} produced no verified questions.`);
  }

  return {
    facts: conflictResult.facts.length,
    units: inventory.length,
    questions: bank.length,
    candidates: bank.generation.totalCandidates,
    parseMs,
    extractMs,
    conflictMs,
    inventoryMs,
    generateMs,
    validateMs,
    totalMs: parseMs + extractMs + conflictMs + inventoryMs + generateMs + validateMs
  };
}

function run(factCount, iterations) {
  const runs = [];
  for (let i = 0; i < iterations; i++) runs.push(runOnce(factCount));
  const keys = [
    'parseMs', 'extractMs', 'conflictMs', 'inventoryMs', 'generateMs',
    'validateMs', 'totalMs'
  ];
  const result = { requestedFacts: factCount };
  for (const key of keys) result[key] = median(runs.map((run) => run[key]));
  result.facts = runs[0].facts;
  result.units = runs[0].units;
  result.questions = runs[0].questions;
  result.candidates = runs[0].candidates;
  return result;
}

const iterations = Number(process.env.BENCH_ITERATIONS) || 3;
const sizes = [10, 100, 500];
const results = [];

console.log('--- StudySynth Lite Engine Benchmark ---');
console.log(`Median of ${iterations} runs per size, milliseconds.\n`);

for (const size of sizes) {
  const result = run(size, iterations);
  results.push(result);
  console.log(
    `${String(size).padStart(3)} facts · ` +
    `parsed ${result.units} units · ` +
    `${result.questions}/${result.candidates} verified/candidates`
  );
  console.log(
    `  parse ${result.parseMs.toFixed(2)} ms · ` +
    `extract ${result.extractMs.toFixed(2)} ms · ` +
    `conflicts ${result.conflictMs.toFixed(2)} ms · ` +
    `inventory ${result.inventoryMs.toFixed(2)} ms · ` +
    `generate ${result.generateMs.toFixed(2)} ms · ` +
    `validate ${result.validateMs.toFixed(2)} ms · ` +
    `total ${result.totalMs.toFixed(2)} ms\n`
  );
}

const oversized = results.find((result) => result.facts < result.requestedFacts);
if (oversized) {
  throw new Error(`Parsing lost facts at size ${oversized.requestedFacts}.`);
}

console.log('Benchmark complete. All timed stages produced a valid bank.');
