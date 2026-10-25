const Engine = require('../engine/generator.js');
const EngineV2 = require('../engine/reasoning/engine_v2.js');

const scientificPassage = `# Deep Sea Oceanography & Hydrothermal Vent Ecosystems

## Hydrothermal Fluid Mechanics
Sub-seafloor volcanic magma chambers heat percolating seawater to over 400°C.
When extreme thermal energy superheats the fluid, minerals dissolve rapidly from the basaltic crust.
Superheated hydrothermal fluid rises buoyantly through vents because hot water is less dense than cold ambient seawater.
As the acidic fluid discharges into alkaline ocean water, dissolved minerals precipitate and form polymetallic sulfide chimneys.

## Chemosynthesis & Ecological Adaptations
Photosynthesis produces organic matter in sunlit surface waters, but sunlight cannot penetrate the abyss.
Hydrothermal vent ecosystems depend on chemosynthetic bacteria to synthesize organic carbohydrates.
Chemosynthetic bacteria oxidize toxic hydrogen sulfide, which enables tube worms and giant clams to survive in total darkness.
Deep ocean trenches are colder and under greater hydrostatic pressure than shallow coastal waters.
Most marine organisms require dissolved oxygen for cellular respiration, with the exception of anaerobic vent archaea.
If hydrothermal vent fluid emissions cease, local chemosynthetic food webs collapse due to starvation.`;

const sections = Engine.parseRawDocument(scientificPassage, 'Deep Sea Oceanography');

console.log('========================================================================');
console.log('PART 1: DEDICATED REASONING ENGINE V2 (Proof-Carrying Conceptual MCQs)');
console.log('========================================================================');
const reasoningBank = EngineV2.generateReasoningQuestionBank(sections, { targetCount: 6 });

console.log('Generated Reasoning Questions Count:', reasoningBank.length);
reasoningBank.forEach((q, i) => {
  console.log('\n[' + (i + 1) + '] ID: ' + q.id + ' | Subtype: ' + q.question_subtype + ' | Difficulty: ' + q.difficulty + ' | Key: ' + q.answer_key);
  console.log('Stem: ' + q.stem);
  console.log('Options:');
  q.options.forEach(o => {
    const mark = o.is_correct ? ' (CORRECT)' : ' [' + o.distractor_origin + ']';
    console.log('  ' + o.key + ') ' + o.text + mark);
  });
  console.log('Explanation: ' + q.explanation);
  if (q.proof_trace) {
    console.log('Proof Operator: ' + q.proof_trace.operator);
    console.log('Inference Steps:');
    q.proof_trace.steps.forEach(s => console.log('   • ' + s));
  }
});

console.log('\n========================================================================');
console.log('PART 2: INTEGRATED PRODUCTION PIPELINE (Full App Backfill & Schema)');
console.log('========================================================================');
const facts = Engine.extractSourceFacts(sections);
const conflicts = Engine.detectFactConflicts(facts);
const inventory = Engine.buildKnowledgeInventory(sections, { facts: conflicts.facts, conflicts: conflicts.conflicts });
const prodBank = Engine.generateQuestionBank(inventory, { sections, facts: conflicts.facts, conflicts: conflicts.conflicts, targetCount: 8 });

console.log('Generated Production Questions Count:', prodBank.length);
prodBank.slice(0, 4).forEach((q, i) => {
  console.log('\n[' + (i + 1) + '] ID: ' + q.id + ' | Subtype: ' + q.question_subtype + ' | Key: ' + q.answer_key);
  console.log('Stem: ' + q.stem);
  console.log('Correct Answer: ' + q.options.find(o => o.is_correct).text);
});
