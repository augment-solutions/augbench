const { describe, it } = require('mocha');
const { expect } = require('chai');
const { BenchmarkCLI } = require('../src/cli/BenchmarkCLI');

describe('BenchmarkCLI formatSummary', function () {
  it('formats assistant summary with rates and averages', function () {
    const cli = new BenchmarkCLI({ quiet: true });
    const settings = { metrics_config: { agent_success: { mode: 'quality', threshold: 7 } } };
    const results = [
      { prompt: 'p1', assistant: 'X', runs: [
        { run_id: 1, response_time: 1.5, output_quality: 8, output_format_success: 1 },
        { run_id: 2, response_time: 2.5, output_quality: 6, output_format_success: 0, _evaluator_errors: ['m'] },
        { run_id: 3, error: 'oops', response_time: null, output_quality: null }
      ]}
    ];
    const txt = cli.formatSummary(results, settings, { color: false });
    expect(txt).to.include('Summary per assistant:');
    expect(txt).to.include('- X: runs=3');
    expect(txt).to.include('completed=66.7%');
    expect(txt).to.include('agent_success=33.3%');
    expect(txt).to.include('format_ok=33.3%');
    expect(txt).to.include('llm_err=33.3%');
  });
});

