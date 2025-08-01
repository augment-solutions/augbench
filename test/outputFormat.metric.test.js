const { describe, it } = require('mocha');
const { expect } = require('chai');
const { OutputFormatSuccessMetric } = require('../src/metrics/OutputFormatSuccessMetric');
const { FileSystem } = require('../src/utils/FileSystem');
const path = require('path');
const fs = require('fs-extra');

describe('OutputFormatSuccessMetric', function () {
  this.timeout(5000);

  it('returns 1 for regex match, 0 for non-match, null when unconfigured', async function () {
    const metric = new OutputFormatSuccessMetric('output_format_success', { metrics_config: { output_format: { regex: '^OK$' } } });
    await metric.initialize();
    expect(await metric.measure('OK', {})).to.equal(1);
    expect(await metric.measure('NOPE', {})).to.equal(0);

    const metric2 = new OutputFormatSuccessMetric('output_format_success', { metrics_config: { output_format: {} } });
    await metric2.initialize();
    expect(await metric2.measure('anything', {})).to.equal(null);
  });

  it('validates JSON against schema path', async function () {
    const tmpDir = path.join(__dirname, 'temp-of');
    await fs.ensureDir(tmpDir);
    const schemaPath = path.join(tmpDir, 'schema.json');
    await fs.writeJSON(schemaPath, { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] }, { spaces: 2 });

    const metric = new OutputFormatSuccessMetric('output_format_success', { metrics_config: { output_format: { json_schema_path: schemaPath } } });
    await metric.initialize();

    expect(await metric.measure('{"x": 1}', {})).to.equal(1);
    expect(await metric.measure('{"x": "bad"}', {})).to.equal(0);

    // Broken path -> null
    const metric2 = new OutputFormatSuccessMetric('output_format_success', { metrics_config: { output_format: { json_schema_path: path.join(tmpDir, 'missing.json') } } });
    await metric2.initialize();
    expect(await metric2.measure('{"x": 1}', {})).to.equal(null);
  });
});

