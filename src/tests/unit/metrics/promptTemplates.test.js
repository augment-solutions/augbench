import { describe, it } from 'node:test';
import assert from 'node:assert';
import { METRIC_PROMPTS } from '../../../metrics/promptTemplates.js';

describe('METRIC_PROMPTS', () => {
  const expectedMetrics = [
    'completeness',
    'technical_correctness', 
    'functional_correctness',
    'clarity',
    'instruction_adherence'
  ];

  it('should contain all expected metric prompts', () => {
    expectedMetrics.forEach(metric => {
      assert(METRIC_PROMPTS.hasOwnProperty(metric), `Missing prompt for ${metric}`);
      assert(typeof METRIC_PROMPTS[metric] === 'string', `Prompt for ${metric} should be a string`);
      assert(METRIC_PROMPTS[metric].length > 0, `Prompt for ${metric} should not be empty`);
    });
  });

  it('should have prompts with consistent format', () => {
    expectedMetrics.forEach(metric => {
      const prompt = METRIC_PROMPTS[metric];
      
      // Should start with "Rate [metric] 1-10"
      assert(prompt.startsWith('Rate'), `${metric} prompt should start with "Rate"`);
      assert(prompt.includes('1-10'), `${metric} prompt should include "1-10" scale`);
      
      // Should have criteria section
      assert(prompt.includes('Criteria:'), `${metric} prompt should have "Criteria:" section`);
      
      // Should end with response format
      assert(prompt.includes('Respond: "Score: X - one-line justification"'), 
        `${metric} prompt should include response format`);
    });
  });

  it('should have token-efficient prompts', () => {
    expectedMetrics.forEach(metric => {
      const prompt = METRIC_PROMPTS[metric];
      
      // Each prompt should be reasonably concise (under 500 chars as rough guideline)
      assert(prompt.length < 500, 
        `${metric} prompt should be token-efficient (under 500 chars), got ${prompt.length}`);
      
      // Should not contain filename references
      assert(!prompt.includes('file'), `${metric} prompt should not reference files`);
      assert(!prompt.includes('.js'), `${metric} prompt should not reference specific file types`);
      assert(!prompt.includes('.py'), `${metric} prompt should not reference specific file types`);
    });
  });

  it('should have criteria bullets for each prompt', () => {
    expectedMetrics.forEach(metric => {
      const prompt = METRIC_PROMPTS[metric];
      
      // Should have bullet points (•)
      const bulletCount = (prompt.match(/•/g) || []).length;
      assert(bulletCount >= 3, `${metric} prompt should have at least 3 criteria bullets, got ${bulletCount}`);
      assert(bulletCount <= 6, `${metric} prompt should have at most 6 criteria bullets, got ${bulletCount}`);
    });
  });

  it('should have unique content for each metric', () => {
    const prompts = expectedMetrics.map(metric => METRIC_PROMPTS[metric]);
    const uniquePrompts = new Set(prompts);
    
    assert.strictEqual(prompts.length, uniquePrompts.size, 
      'All metric prompts should be unique');
  });

  it('should be parseable for Score format', () => {
    // Test that the response format is consistent and parseable
    const testResponse = 'Score: 8 - Good implementation';
    const scoreMatch = testResponse.match(/Score:\s*(\d+(?:\.\d+)?)/i);
    
    assert(scoreMatch, 'Response format should be parseable');
    assert.strictEqual(parseFloat(scoreMatch[1]), 8, 'Score should be extractable');
  });

  it('should have appropriate content for each metric type', () => {
    // Completeness should focus on requirements coverage
    assert(METRIC_PROMPTS.completeness.includes('requirements'), 
      'Completeness should mention requirements');
    
    // Technical correctness should focus on syntax and APIs
    assert(METRIC_PROMPTS.technical_correctness.includes('syntax'), 
      'Technical correctness should mention syntax');
    
    // Functional correctness should focus on logic and execution
    assert(METRIC_PROMPTS.functional_correctness.includes('logic'), 
      'Functional correctness should mention logic');
    
    // Clarity should focus on readability
    assert(METRIC_PROMPTS.clarity.includes('readable'), 
      'Clarity should mention readability');
    
    // Instruction adherence should focus on following constraints
    assert(METRIC_PROMPTS.instruction_adherence.includes('constraints'), 
      'Instruction adherence should mention constraints');
  });
});
