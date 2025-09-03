import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ASTSimilarityMetric } from '../../../metrics/ASTSimilarityMetric.js';

describe('ASTSimilarityMetric', () => {
  let metric;

  beforeEach(() => {
    metric = new ASTSimilarityMetric();
  });

  it('should initialize with WASM support when grammars are available', async () => {
    await metric.initialize();
    
    // Should have attempted to load grammars
    assert(metric.supportedLanguages instanceof Map);
  });

  it('should detect language from file extension', () => {
    // Mock supported languages
    metric.supportedLanguages.set('javascript', {
      extensions: ['.js', '.jsx', '.mjs']
    });
    metric.supportedLanguages.set('typescript', {
      extensions: ['.ts', '.tsx']
    });

    assert(metric.getLanguageForFile('test.js'));
    assert(metric.getLanguageForFile('component.jsx'));
    assert(metric.getLanguageForFile('module.ts'));
    assert(metric.getLanguageForFile('component.tsx'));
    assert.strictEqual(metric.getLanguageForFile('test.txt'), null);
  });

  it('should identify code files correctly', () => {
    assert(metric.isCodeFile('test.js'));
    assert(metric.isCodeFile('test.py'));
    assert(metric.isCodeFile('test.ts'));
    assert(metric.isCodeFile('test.java'));
    assert(!metric.isCodeFile('test.txt'));
    assert(!metric.isCodeFile('README.md'));
  });

  it('should fallback to text-based comparison when WASM fails', async () => {
    const content1 = `function test() {
  return true;
}`;
    const content2 = `function test() {
  return false;
}`;

    const parsed1 = await metric.parseCode(content1, 'test.js');
    const parsed2 = await metric.parseCode(content2, 'test.js');

    // Should fallback to text-based when WASM not available
    if (parsed1.isTextBased) {
      assert(parsed1.lines);
      assert(parsed1.content);
      assert.strictEqual(parsed1.isTextBased, true);
    }
  });

  it('should calculate text similarity correctly', () => {
    const parsed1 = {
      lines: ['function test() {', '  return true;', '}'],
      content: 'function test() {\n  return true;\n}'
    };
    const parsed2 = {
      lines: ['function test() {', '  return false;', '}'],
      content: 'function test() {\n  return false;\n}'
    };

    const similarity = metric.calculateTextSimilarity(parsed1, parsed2);
    
    // Should have some similarity (shared function structure)
    assert(similarity > 0);
    assert(similarity <= 1);
  });

  it('should handle empty or null inputs gracefully', () => {
    assert.strictEqual(metric.calculateTextSimilarity(null, null), 0);
    assert.strictEqual(metric.calculateTextSimilarity({lines: []}, {lines: []}), 1);
    assert.strictEqual(metric.calculateTextSimilarity({lines: ['test']}, {lines: []}), 0);
  });

  it('should extract AST features when tree-sitter is available', () => {
    // Mock AST node
    const mockNode = {
      type: 'function_declaration',
      childCount: 2,
      child: (i) => {
        if (i === 0) return { type: 'identifier', childCount: 0, child: () => null };
        if (i === 1) return { type: 'block_statement', childCount: 1, child: () => ({ type: 'return_statement', childCount: 0, child: () => null }) };
        return null;
      }
    };

    const features = metric.extractASTFeatures(mockNode);
    
    assert(features.nodeTypes instanceof Map);
    assert(typeof features.depth === 'number');
    assert(typeof features.totalNodes === 'number');
    assert(typeof features.functionCount === 'number');
    assert(features.totalNodes > 0);
  });

  it('should compare AST features correctly', () => {
    const features1 = {
      nodeTypes: new Map([['function_declaration', 1], ['identifier', 2]]),
      depth: 3,
      totalNodes: 5,
      functionCount: 1,
      classCount: 0,
      variableCount: 2
    };

    const features2 = {
      nodeTypes: new Map([['function_declaration', 1], ['identifier', 2]]),
      depth: 3,
      totalNodes: 5,
      functionCount: 1,
      classCount: 0,
      variableCount: 2
    };

    const similarity = metric.compareASTFeatures(features1, features2);
    
    // Identical features should have similarity of 1
    assert.strictEqual(similarity, 1);
  });

  it('should calculate normalized similarity correctly', () => {
    assert.strictEqual(metric.normalizedSimilarity(0, 0), 1);
    assert.strictEqual(metric.normalizedSimilarity(5, 5), 1);
    assert.strictEqual(metric.normalizedSimilarity(2, 4), 0.5);
    assert.strictEqual(metric.normalizedSimilarity(4, 2), 0.5);
    assert.strictEqual(metric.normalizedSimilarity(0, 5), 0);
  });

  it('should compare node types correctly', () => {
    const types1 = new Map([['function', 2], ['variable', 3]]);
    const types2 = new Map([['function', 2], ['variable', 1], ['class', 1]]);

    const similarity = metric.compareNodeTypes(types1, types2);
    
    assert(similarity > 0);
    assert(similarity <= 1);
  });
});
