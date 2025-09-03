import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LLMEvaluatorMetric } from '../../../metrics/LLMEvaluatorMetric.js';

describe('LLMEvaluatorMetric', () => {
  let metric;
  let mockRun;

  beforeEach(() => {
    metric = new LLMEvaluatorMetric('test_metric', 'Test evaluation prompt');
    
    // Mock the run function
    mockRun = (command, options) => {
      if (command === 'git diff --unified=3') {
        return { 
          ok: true, 
          stdout: `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,4 @@
 function test() {
+  console.log('new line');
   return true;
 }`
        };
      }
      return { ok: false, stdout: '', stderr: 'Command failed' };
    };
    
    // Override the run import
    metric.constructor.prototype.run = mockRun;
  });

  it('should use diff when available and smaller than 70% of output', async () => {
    const longOutput = 'x'.repeat(1000); // 1000 chars
    const optimized = await metric.optimizePayload(longOutput, '/test/repo');
    
    assert(optimized.startsWith('Agent Changes (unified diff):'));
    assert(optimized.includes('function test()'));
    assert(optimized.includes('+  console.log(\'new line\');'));
  });

  it('should fallback to truncation when diff is not available', async () => {
    // Mock run to return no diff
    metric.constructor.prototype.run = () => ({ ok: false, stdout: '' });
    
    const output = 'x'.repeat(5000); // 5KB output
    const optimized = await metric.optimizePayload(output, '/test/repo');
    
    assert(optimized.includes('...[truncated to last 4096 bytes]'));
    assert(optimized.length <= 4096 + 50); // Allow for truncation message
  });

  it('should fallback to truncation when diff is larger than 70% of output', async () => {
    const shortOutput = 'short output'; // 12 chars
    // Diff is much longer than 70% of output (8.4 chars)
    const optimized = await metric.optimizePayload(shortOutput, '/test/repo');
    
    assert(optimized.includes('...[truncated to last 4096 bytes]'));
  });

  it('should handle missing cwd gracefully', async () => {
    const output = 'x'.repeat(5000);
    const optimized = await metric.optimizePayload(output, null);
    
    assert(optimized.includes('...[truncated to last 4096 bytes]'));
  });

  it('should return original output when smaller than limit', async () => {
    const smallOutput = 'small output';
    const optimized = await metric.optimizePayload(smallOutput, null);
    
    assert.strictEqual(optimized, smallOutput);
  });

  it('should truncate output correctly', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz'; // 26 chars
    const truncated = metric.truncateOutput(text, 10);
    
    assert(truncated.startsWith('...[truncated to last 10 bytes]'));
    assert(truncated.endsWith('qrstuvwxyz')); // last 10 chars
  });

  it('should return original text when under limit', () => {
    const text = 'short';
    const truncated = metric.truncateOutput(text, 10);
    
    assert.strictEqual(truncated, text);
  });

  it('should generate unified diff correctly', async () => {
    const diff = await metric.generateUnifiedDiff('/test/repo');
    
    assert(diff.includes('diff --git'));
    assert(diff.includes('function test()'));
    assert(diff.includes('+  console.log(\'new line\');'));
  });

  it('should return null when no diff available', async () => {
    metric.constructor.prototype.run = () => ({ ok: true, stdout: '' });
    
    const diff = await metric.generateUnifiedDiff('/test/repo');
    
    assert.strictEqual(diff, null);
  });

  it('should parse score correctly', () => {
    const response = 'Score: 8 - Good implementation with minor issues';
    const score = metric.parseScore(response);
    
    assert.strictEqual(score, 8);
  });

  it('should handle score parsing errors', () => {
    const response = 'Invalid response format';

    assert.throws(() => {
      metric.parseScore(response);
    }, /Could not parse assessment score/);
  });
});
