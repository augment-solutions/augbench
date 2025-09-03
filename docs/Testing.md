# Testing Guide

This document outlines the testing strategy and guidelines for augbench development and validation.

## Testing Strategy

### Test Categories

#### 1. Unit Tests
- **Location**: `src/tests/`
- **Coverage**: Individual components and utilities
- **Framework**: Node.js built-in test runner or Jest
- **Scope**: Isolated functionality testing

#### 2. Integration Tests
- **Location**: `src/tests/integration/`
- **Coverage**: Component interactions and workflows
- **Scope**: Mode execution, metric collection, reporting

#### 3. End-to-End Tests
- **Location**: `src/tests/e2e/`
- **Coverage**: Complete benchmark workflows
- **Scope**: Full CLI execution with real repositories

#### 4. Validation Tests
- **Location**: `src/tests/validation/`
- **Coverage**: Configuration validation and system requirements
- **Scope**: Settings validation, dependency checks

## Test Structure

### Directory Layout
```
src/tests/
├── unit/
│   ├── adapters/
│   │   ├── AdapterFactory.test.js
│   │   └── ShellCommandAdapter.test.js
│   ├── metrics/
│   │   ├── ResponseTimeMetric.test.js
│   │   ├── DiffMetric.test.js
│   │   ├── LLMEvaluatorMetric.test.js
│   │   └── ASTSimilarityMetric.test.js
│   ├── modes/
│   │   ├── LLMEvaluatorMode.test.js
│   │   └── PRRecreateMode.test.js
│   ├── utils/
│   │   ├── GitManager.test.js
│   │   ├── PRAnalyzer.test.js
│   │   ├── PromptGenerator.test.js
│   │   └── FileSystem.test.js
│   └── config/
│       └── SettingsManager.test.js
├── integration/
│   ├── llm-evaluator-workflow.test.js
│   ├── pr-recreate-workflow.test.js
│   └── metrics-collection.test.js
├── e2e/
│   ├── benchmark-execution.test.js
│   └── report-generation.test.js
├── validation/
│   ├── settings-validation.test.js
│   └── system-requirements.test.js
└── fixtures/
    ├── sample-repos/
    ├── test-prompts/
    └── mock-responses/
```

## Unit Testing Guidelines

### Adapter Tests

#### AdapterFactory.test.js
```javascript
import { describe, it, expect } from 'node:test';
import { AdapterFactory } from '../../adapters/AdapterFactory.js';

describe('AdapterFactory', () => {
  it('should create ShellCommandAdapter for known agents', () => {
    const factory = new AdapterFactory();
    const adapter = factory.create('Augment CLI');
    expect(adapter.constructor.name).toBe('ShellCommandAdapter');
  });

  it('should throw error for unknown agents', () => {
    const factory = new AdapterFactory();
    expect(() => factory.create('Unknown Agent')).toThrow();
  });
});
```

#### ShellCommandAdapter.test.js
```javascript
import { describe, it, expect, mock } from 'node:test';
import { ShellCommandAdapter } from '../../adapters/ShellCommandAdapter.js';

describe('ShellCommandAdapter', () => {
  it('should execute command with prompt substitution', async () => {
    const adapter = new ShellCommandAdapter('echo "{prompt}"');
    const result = await adapter.execute('test-prompt');
    expect(result.output).toContain('test-prompt');
  });

  it('should handle command timeouts', async () => {
    const adapter = new ShellCommandAdapter('sleep 10', { timeout: 100 });
    await expect(adapter.execute('test')).rejects.toThrow('timeout');
  });
});
```

### Metrics Tests

#### ResponseTimeMetric.test.js
```javascript
import { describe, it, expect } from 'node:test';
import { ResponseTimeMetric } from '../../metrics/ResponseTimeMetric.js';

describe('ResponseTimeMetric', () => {
  it('should measure execution time', async () => {
    const metric = new ResponseTimeMetric();
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    const time = await metric.measure(() => delay(100));
    expect(time).toBeGreaterThan(0.09); // ~100ms
    expect(time).toBeLessThan(0.2);     // Allow some variance
  });
});
```

#### LLMEvaluatorMetric.test.js
```javascript
import { describe, it, expect, beforeEach } from 'node:test';
import { LLMEvaluatorMetric } from '../../metrics/LLMEvaluatorMetric.js';

describe('LLMEvaluatorMetric', () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LLM_ANTHROPIC_API_KEY = 'test-key';
  });

  it('should parse score from LLM response', () => {
    const metric = new LLMEvaluatorMetric('test', 'test prompt');
    expect(metric.parseScore('Score: 8')).toBe(8);
    expect(metric.parseScore('8/10')).toBe(8);
    expect(metric.parseScore('Rating: 7.5')).toBe(7.5);
  });

  it('should handle invalid responses', () => {
    const metric = new LLMEvaluatorMetric('test', 'test prompt');
    expect(metric.parseScore('No score found')).toBe(5); // Default
  });
});
```

### Mode Tests

#### LLMEvaluatorMode.test.js
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import { LLMEvaluatorMode } from '../../modes/LLMEvaluatorMode.js';
import fs from 'fs-extra';

describe('LLMEvaluatorMode', () => {
  const testStageDir = './test-stage';
  
  beforeEach(async () => {
    await fs.ensureDir(testStageDir);
  });
  
  afterEach(async () => {
    await fs.remove(testStageDir);
  });

  it('should create agent workspaces', async () => {
    const mode = new LLMEvaluatorMode();
    const settings = {
      agents: ['Test Agent'],
      repo_path: './test-repo',
      stage_dir: testStageDir
    };
    
    // Mock implementation
    await mode.setupAgentWorkspaces(settings);
    
    const agentDir = path.join(testStageDir, 'Test_Agent');
    expect(await fs.pathExists(agentDir)).toBe(true);
  });
});
```

## Integration Testing

### Workflow Tests

#### llm-evaluator-workflow.test.js
```javascript
import { describe, it, expect } from 'node:test';
import { BenchmarkRunner } from '../../cli/BenchmarkRunner.js';

describe('LLM Evaluator Workflow', () => {
  it('should complete full workflow with test repository', async () => {
    const settings = {
      mode: 'LLM_Evaluator',
      agents: ['echo'],
      repo_path: './test-fixtures/sample-repo',
      metrics: ['response_time'],
      runs_per_prompt: 1,
      stage_dir: './test-stage'
    };
    
    const runner = new BenchmarkRunner();
    await expect(runner.run(settings)).resolves.not.toThrow();
  });
});
```

### Metrics Collection Tests

#### metrics-collection.test.js
```javascript
import { describe, it, expect } from 'node:test';
import { MetricsFactory } from '../../metrics/MetricsFactory.js';

describe('Metrics Collection', () => {
  it('should collect all configured metrics', async () => {
    const metrics = MetricsFactory.create([
      'response_time',
      'diff_metrics'
    ]);
    
    expect(metrics).toHaveLength(2);
    expect(metrics[0].name).toBe('response_time');
    expect(metrics[1].name).toBe('diff_metrics');
  });
});
```

## End-to-End Testing

### Full Benchmark Execution

#### benchmark-execution.test.js
```javascript
import { describe, it, expect } from 'node:test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Benchmark Execution', () => {
  it('should run complete benchmark via CLI', async () => {
    const { stdout, stderr } = await execAsync(
      'node bin/augbench.js benchmark --config test-settings.json'
    );
    
    expect(stderr).toBe('');
    expect(stdout).toContain('Benchmark complete');
  });
});
```

## Test Fixtures

### Sample Repository Structure
```
src/tests/fixtures/sample-repos/
├── simple-js/
│   ├── package.json
│   ├── src/
│   │   └── index.js
│   └── README.md
├── python-project/
│   ├── requirements.txt
│   ├── src/
│   │   └── main.py
│   └── README.md
└── multi-language/
    ├── package.json
    ├── src/
    │   ├── index.js
    │   └── utils.py
    └── README.md
```

### Mock Responses
```javascript
// src/tests/fixtures/mock-responses/llm-responses.js
export const mockLLMResponses = {
  completeness: 'Score: 8\nThe implementation covers most requirements...',
  technical_correctness: 'Rating: 7/10\nTechnically sound but missing...',
  clarity: 'Score: 9\nVery clear and well-organized code...'
};
```

## Test Execution

### Running Tests

#### All Tests
```bash
npm test
```

#### Unit Tests Only
```bash
npm run test:unit
```

#### Integration Tests
```bash
npm run test:integration
```

#### End-to-End Tests
```bash
npm run test:e2e
```

#### Coverage Report
```bash
npm run test:coverage
```

### Test Configuration

#### package.json Scripts
```json
{
  "scripts": {
    "test": "node --test src/tests/**/*.test.js",
    "test:unit": "node --test src/tests/unit/**/*.test.js",
    "test:integration": "node --test src/tests/integration/**/*.test.js",
    "test:e2e": "node --test src/tests/e2e/**/*.test.js",
    "test:coverage": "c8 npm test",
    "test:watch": "node --test --watch src/tests/**/*.test.js"
  }
}
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      
      # E2E tests only on Node 22
      - run: npm run test:e2e
        if: matrix.node-version == '22'
```

## Testing Best Practices

### General Guidelines
1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test artifacts
3. **Mocking**: Mock external dependencies and APIs
4. **Assertions**: Use descriptive assertion messages
5. **Coverage**: Aim for >80% code coverage

### Specific Recommendations
1. **Git Operations**: Use temporary directories for git tests
2. **File System**: Clean up created files and directories
3. **Network Calls**: Mock API responses for reliability
4. **Timeouts**: Use appropriate timeouts for async operations
5. **Environment**: Isolate test environment variables

### Performance Testing
1. **Benchmark Tests**: Measure execution time improvements
2. **Memory Usage**: Monitor memory consumption
3. **Concurrency**: Test parallel execution scenarios
4. **Resource Limits**: Test behavior under resource constraints
