import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ResponseTimeMetric } from '../../../metrics/ResponseTimeMetric.js';

describe('ResponseTimeMetric', () => {
  it('should measure execution time correctly', async () => {
    const metric = new ResponseTimeMetric();
    
    // Test with a function that takes ~100ms
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const time = await metric.measure(() => delay(100));
    
    // Should be approximately 0.1 seconds (allow some variance)
    assert(time >= 0.09, `Expected time >= 0.09, got ${time}`);
    assert(time <= 0.2, `Expected time <= 0.2, got ${time}`);
  });

  it('should return time in seconds', async () => {
    const metric = new ResponseTimeMetric();
    
    const time = await metric.measure(() => Promise.resolve());
    
    // Should be a small positive number (in seconds)
    assert(typeof time === 'number', 'Time should be a number');
    assert(time >= 0, 'Time should be non-negative');
    assert(time < 1, 'Time should be less than 1 second for immediate resolution');
  });

  it('should handle async functions', async () => {
    const metric = new ResponseTimeMetric();
    
    const asyncFunction = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'result';
    };
    
    const time = await metric.measure(asyncFunction);
    
    assert(time >= 0.04, `Expected time >= 0.04, got ${time}`);
    assert(time <= 0.1, `Expected time <= 0.1, got ${time}`);
  });

  it('should handle synchronous functions', async () => {
    const metric = new ResponseTimeMetric();
    
    const syncFunction = () => {
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      return sum;
    };
    
    const time = await metric.measure(syncFunction);
    
    assert(typeof time === 'number', 'Time should be a number');
    assert(time >= 0, 'Time should be non-negative');
  });

  it('should have correct metric name', () => {
    const metric = new ResponseTimeMetric();
    assert.strictEqual(metric.name, 'response_time');
  });
});
