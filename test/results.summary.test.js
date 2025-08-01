const { describe, it } = require('mocha');
const { expect } = require('chai');
const { ResultsStorage } = require('../src/utils/ResultsStorage');

describe('ResultsStorage summary metrics', function () {
  it('computes taskCompletionRate, agentSuccessRate (quality/completion), llmCallErrorRate, outputFormatSuccessRate', function () {
    const storageQuality = new ResultsStorage({ metrics_config: { agent_success: { mode: 'quality', threshold: 7 } } });
    const storageCompletion = new ResultsStorage({ metrics_config: { agent_success: { mode: 'completion' } } });

    const results = [
      {
        prompt: 'p1',
        assistant: 'A',
        runs: [
          { run_id: 1, response_time: 1.1, output_quality: 8, output_format_success: 1 },
          { run_id: 2, response_time: 2.2, output_quality: 6, output_format_success: 0, _evaluator_errors: ['instruction_adherence'] },
          { run_id: 3, error: 'fail', response_time: null, output_quality: null }
        ]
      }
    ];

    const s1 = storageQuality.generateSummary(results);
    const a1 = s1.assistants['A'];
    expect(a1.taskCompletionRate).to.equal(2 / 3);
    expect(a1.agentSuccessRate).to.equal(1 / 3); // only run1 meets threshold
    expect(a1.llmCallErrorRate).to.equal(1 / 3);
    expect(a1.outputFormatSuccessRate).to.equal(1 / 3);

    const s2 = storageCompletion.generateSummary(results);
    const a2 = s2.assistants['A'];
    expect(a2.agentSuccessRate).to.equal(a2.taskCompletionRate);
  });
});

