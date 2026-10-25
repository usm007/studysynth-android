/**
 * StudySynth Lite — Background analysis worker.
 * Reuses the exact deterministic engine and the shared analysis pipeline.
 * Progress messages are emitted only at real stage boundaries.
 */

// Reasoning V2 dependency chain (Repair 002, Phase 6): the worker must
// load the same complete chain as the browser, in dependency order,
// before generator.js, so StudySynthReasoningV2 is available when the
// analysis pipeline runs. No module is loaded twice via a competing path.
importScripts(
  './reasoning/types.js',
  './reasoning/linguistics.js',
  './reasoning/representation.js',
  './reasoning/graph.js',
  './reasoning/distractors.js',
  './reasoning/operators.js',
  './reasoning/constructors.js',
  './reasoning/validator.js',
  './reasoning/ranking.js',
  './reasoning/engine_v2.js',
  './generator.js',
  './analyze.js'
);

function post(message) {
  self.postMessage(message);
}

self.addEventListener('message', function (event) {
  const data = event.data || {};
  if (data.type !== 'generate') return;

  const jobId = data.jobId;
  try {
    const analyzed = self.StudySynthAnalysis.analyzeSource(
      data.text,
      data.title,
      data.sourceMeta,
      data.targetCount,
      {
        onStage: function (stage, detail) {
          post({
            type: 'progress',
            jobId: jobId,
            stage: stage,
            message: (detail && detail.message) || '',
            progress: { indeterminate: true }
          });
        }
      }
    );

    post({
      type: 'result',
      jobId: jobId,
      analyzed: {
        sectionsCount: analyzed.sections.length,
        inventory: analyzed.inventory,
        questions: analyzed.questions,
        generation: analyzed.generation,
        validation: analyzed.validation,
        generationError: analyzed.generationError ? {
          code: analyzed.generationError.code || '',
          message: analyzed.generationError.message || ''
        } : null
      }
    });
  } catch (err) {
    post({
      type: 'error',
      jobId: jobId,
      code: (err && err.code) || 'WORKER_FAILED',
      message: (err && err.message) || 'The on-device engine could not finish this document.'
    });
  }
});
