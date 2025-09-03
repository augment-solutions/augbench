import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AdapterFactory } from '../../../adapters/AdapterFactory.js';
import { ShellCommandAdapter } from '../../../adapters/ShellCommandAdapter.js';

describe('AdapterFactory', () => {
  let factory;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {}
    };
  });

  it('should create ShellCommandAdapter when commandTemplate is provided', () => {
    const settings = {
      agent_config: {
        'Test Agent': {
          commandTemplate: 'echo "{prompt}"',
          timeout: 5000
        }
      }
    };
    
    factory = new AdapterFactory(mockLogger, settings);
    const adapter = factory.create('Test Agent');
    
    assert(adapter instanceof ShellCommandAdapter);
    assert.strictEqual(adapter.name, 'Test Agent');
    assert.strictEqual(adapter.template, 'echo "{prompt}"');
    assert.strictEqual(adapter.timeout, 5000);
  });

  it('should use default timeout when not specified', () => {
    const settings = {
      agent_config: {
        'Test Agent': {
          commandTemplate: 'echo "{prompt}"'
        }
      }
    };
    
    factory = new AdapterFactory(mockLogger, settings);
    const adapter = factory.create('Test Agent');
    
    assert(adapter instanceof ShellCommandAdapter);
    assert.strictEqual(adapter.timeout, 600000); // default timeout
  });

  it('should create NoopAdapter when no commandTemplate is provided', () => {
    const settings = {
      agent_config: {
        'Test Agent': {}
      }
    };
    
    factory = new AdapterFactory(mockLogger, settings);
    const adapter = factory.create('Test Agent');
    
    assert.strictEqual(adapter.constructor.name, 'NoopAdapter');
    assert.strictEqual(adapter.name, 'Test Agent');
  });

  it('should create NoopAdapter for unknown agent', () => {
    const settings = { agent_config: {} };
    
    factory = new AdapterFactory(mockLogger, settings);
    const adapter = factory.create('Unknown Agent');
    
    assert.strictEqual(adapter.constructor.name, 'NoopAdapter');
    assert.strictEqual(adapter.name, 'Unknown Agent');
  });

  it('should handle missing agent_config gracefully', () => {
    const settings = {};
    
    factory = new AdapterFactory(mockLogger, settings);
    const adapter = factory.create('Test Agent');
    
    assert.strictEqual(adapter.constructor.name, 'NoopAdapter');
  });
});
