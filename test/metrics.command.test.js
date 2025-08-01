const { describe, it } = require('mocha');
const { expect } = require('chai');
const path = require('path');
const { spawn } = require('child_process');

function runNode(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(__dirname, '../src/index.js'), ...args], { stdio: 'pipe' });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => {
      resolve({ code, out, err });
    });
    child.on('error', reject);
  });
}

describe('metrics command', function () {
  this.timeout(10000);

  it('prints available metrics in text', async function () {
    const { code, out } = await runNode(['metrics']);
    expect(code).to.equal(0);
    expect(out).to.include('Available metrics:');
    expect(out).to.include('response_time');
    expect(out).to.include('output_quality');
  });

  it('prints JSON with --json', async function () {
    const { code, out } = await runNode(['metrics', '--json']);
    expect(code).to.equal(0);
    const parsed = JSON.parse(out);
    expect(parsed).to.have.property('metrics');
    expect(parsed.metrics).to.be.an('array');
    const names = parsed.metrics.map((m) => m.name);
    expect(names).to.include('response_time');
    expect(parsed).to.have.property('metrics_config');
    expect(parsed.metrics_config).to.have.property('agent_success');
  });
});

