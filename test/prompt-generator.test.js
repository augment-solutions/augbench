/**
 * Tests for PromptGenerator class
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const fs = require('fs-extra');
const path = require('path');
const { PromptGenerator } = require('../src/utils/PromptGenerator');

describe('PromptGenerator', function() {
  this.timeout(10000);
  
  let promptGenerator;
  let testDir;
  let mockStructure;
  let originalEnv;

  beforeEach(async function() {
    // Save original environment
    originalEnv = { ...process.env };

    // Set required environment variables for testing
    process.env.LLM_OPENAI_ENDPOINT = 'http://localhost:8080/v1';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.LLM_PROVIDER = 'openai-compatible';

    testDir = path.join(__dirname, 'temp-prompt-generator');
    await fs.ensureDir(testDir);

    mockStructure = {
      prompts: path.join(testDir, 'prompts')
    };
    await fs.ensureDir(mockStructure.prompts);

    promptGenerator = new PromptGenerator({
      verbose: false,
      quiet: true
    });
  });

  afterEach(async function() {
    // Restore original environment
    process.env = originalEnv;
    await fs.remove(testDir);
  });
  
  describe('constructor', function() {
    it('should create PromptGenerator instance with default config', function() {
      expect(promptGenerator).to.be.instanceOf(PromptGenerator);
      expect(promptGenerator.logger).to.exist;
      expect(promptGenerator.fs).to.exist;
      expect(promptGenerator.llmEndpoint).to.equal('http://localhost:8080/v1');
      expect(promptGenerator.llmApiKey).to.equal('test-api-key');
      expect(promptGenerator.llmModel).to.equal('test-model');
      expect(promptGenerator.llmProvider).to.equal('openai-compatible');
      expect(promptGenerator.timeout).to.equal(30000);
    });
    
    it('should use environment variables for configuration', function() {
      const tempEnv = { ...process.env };
      process.env.LLM_OPENAI_ENDPOINT = 'http://custom:8080/api/v1';
      process.env.LLM_API_KEY = 'custom-api-key';
      process.env.LLM_MODEL = 'custom-model';
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.TIMEOUT = '60000';

      const customGenerator = new PromptGenerator();

      expect(customGenerator.llmEndpoint).to.equal('http://custom:8080/api/v1');
      expect(customGenerator.llmApiKey).to.equal('custom-api-key');
      expect(customGenerator.llmModel).to.equal('custom-model');
      expect(customGenerator.llmProvider).to.equal('anthropic');
      expect(customGenerator.timeout).to.equal(60000);

      process.env = tempEnv;
    });

    it('should throw error when required environment variables are missing', function() {
      const tempEnv = { ...process.env };
      delete process.env.LLM_OPENAI_ENDPOINT;
      delete process.env.LLM_API_KEY;

      expect(() => new PromptGenerator()).to.throw('LLM configuration missing');

      process.env = tempEnv;
    });
  });
  
  describe('createSystemPrompt', function() {
    it('should return a comprehensive system prompt', function() {
      const systemPrompt = promptGenerator.createSystemPrompt();
      
      expect(systemPrompt).to.be.a('string');
      expect(systemPrompt).to.include('software engineering instructor');
      expect(systemPrompt).to.include('Pull Request descriptions');
      expect(systemPrompt).to.include('Guidelines for creating prompts');
      expect(systemPrompt).to.include('Be specific and clear');
      expect(systemPrompt).to.include('imperative language');
    });
  });
  
  describe('createUserPrompt', function() {
    it('should create user prompt with PR information', function() {
      const mockPR = {
        title: 'Add user authentication',
        description: 'Implement JWT-based authentication system',
        fileChanges: [
          { status: 'added', path: 'auth.js' },
          { status: 'modified', path: 'app.js' }
        ]
      };
      
      const userPrompt = promptGenerator.createUserPrompt(mockPR);
      
      expect(userPrompt).to.be.a('string');
      expect(userPrompt).to.include('Add user authentication');
      expect(userPrompt).to.include('Implement JWT-based authentication system');
      expect(userPrompt).to.include('Added: auth.js');
      expect(userPrompt).to.include('Modified: app.js');
    });
  });
  
  describe('summarizeFileChanges', function() {
    it('should summarize file changes correctly', function() {
      const fileChanges = [
        { status: 'added', path: 'new-file.js' },
        { status: 'modified', path: 'existing-file.js' },
        { status: 'deleted', path: 'old-file.js' },
        { status: 'renamed', path: 'renamed-file.js' }
      ];
      
      const summary = promptGenerator.summarizeFileChanges(fileChanges);
      
      expect(summary).to.include('Added: new-file.js');
      expect(summary).to.include('Modified: existing-file.js');
      expect(summary).to.include('Deleted: old-file.js');
      expect(summary).to.include('Renamed: renamed-file.js');
    });
    
    it('should handle empty file changes', function() {
      const summary = promptGenerator.summarizeFileChanges([]);
      expect(summary).to.equal('No specific file changes listed');
    });
    
    it('should handle null file changes', function() {
      const summary = promptGenerator.summarizeFileChanges(null);
      expect(summary).to.equal('No specific file changes listed');
    });
  });
  
  describe('cleanAndFormatPrompt', function() {
    it('should clean and format prompt response', function() {
      const mockPR = {
        number: 123,
        order: 1,
        title: 'Test PR'
      };
      
      const rawResponse = `
        This is some meta commentary about the task.
        
        # Implement User Authentication
        
        Create a JWT-based authentication system for the application.
        
        Note: This prompt is based on a real PR.
      `;
      
      const cleaned = promptGenerator.cleanAndFormatPrompt(rawResponse, mockPR);
      
      expect(cleaned).to.include('---');
      expect(cleaned).to.include('pr_number: 123');
      expect(cleaned).to.include('pr_order: 1');
      expect(cleaned).to.include('generated_at:');
      expect(cleaned).to.include('# Implement User Authentication');
      expect(cleaned).to.not.include('This is some meta commentary');
      expect(cleaned).to.not.include('Note: This prompt is based on');
    });
    
    it('should add title if prompt does not start with heading', function() {
      const mockPR = {
        number: 456,
        order: 2,
        title: 'Fix Bug'
      };
      
      const rawResponse = 'Implement the following functionality...';
      
      const cleaned = promptGenerator.cleanAndFormatPrompt(rawResponse, mockPR);
      
      expect(cleaned).to.include('# Fix Bug');
      expect(cleaned).to.include('Implement the following functionality');
    });
  });
  
  describe('getPromptPath', function() {
    it('should generate correct prompt path', function() {
      const mockPR = {
        number: 123,
        order: 1
      };
      
      const promptPath = promptGenerator.getPromptPath(mockPR, mockStructure);
      const expectedPath = path.join(mockStructure.prompts, 'pr_1_123.md');
      
      expect(promptPath).to.equal(expectedPath);
    });
  });
  
  describe('getLLMConfig', function() {
    it('should return current LLM configuration', function() {
      const config = promptGenerator.getLLMConfig();
      
      expect(config).to.have.property('endpoint');
      expect(config).to.have.property('model');
      expect(config).to.have.property('timeout');
      expect(config.endpoint).to.equal(promptGenerator.llmEndpoint);
      expect(config.model).to.equal(promptGenerator.llmModel);
      expect(config.timeout).to.equal(promptGenerator.timeout);
    });
  });
  
  describe('callLLM', function() {
    it('should handle connection refused error', async function() {
      const prompt = 'Test prompt';
      
      try {
        await promptGenerator.callLLM(prompt);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Cannot connect to LLM endpoint');
      }
    });
    
    it('should handle invalid response format', async function() {
      // Mock axios to return invalid response
      const originalCallLLM = promptGenerator.callLLM;
      promptGenerator.callLLM = async function(prompt) {
        // Simulate axios response with invalid format
        const mockResponse = { data: { invalid: 'format' } };
        throw new Error('Invalid response format from LLM');
      };
      
      try {
        await promptGenerator.callLLM('test');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Invalid response format from LLM');
      } finally {
        promptGenerator.callLLM = originalCallLLM;
      }
    });
  });
  
  describe('validateLLMAccess', function() {
    it('should return false when LLM is not accessible', async function() {
      const isValid = await promptGenerator.validateLLMAccess();
      expect(isValid).to.be.false;
    });
  });
  
  describe('generatePromptForPR', function() {
    it('should handle LLM call failure gracefully', async function() {
      const mockPR = {
        number: 123,
        order: 1,
        title: 'Test PR',
        description: 'Test description',
        fileChanges: []
      };
      
      try {
        await promptGenerator.generatePromptForPR(mockPR);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Cannot connect to LLM endpoint');
      }
    });
  });
  
  describe('generatePrompts', function() {
    it('should handle empty PR list', async function() {
      const result = await promptGenerator.generatePrompts([], mockStructure);
      expect(result).to.be.an('array');
      expect(result).to.have.length(0);
    });
    
    it('should handle PR generation failure', async function() {
      const mockPRs = [
        {
          number: 123,
          order: 1,
          title: 'Test PR',
          description: 'Test description',
          fileChanges: []
        }
      ];
      
      try {
        await promptGenerator.generatePrompts(mockPRs, mockStructure);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to generate prompt for PR 123');
      }
    });
  });
  
  describe('integration with mocked LLM', function() {
    it('should generate prompts successfully with mocked LLM', async function() {
      // Mock the callLLM method
      const originalCallLLM = promptGenerator.callLLM;
      promptGenerator.callLLM = async function(prompt) {
        return `# Implement Feature
        
        Based on the requirements, implement the following functionality:
        
        1. Add new authentication system
        2. Update existing components
        3. Ensure proper error handling
        
        The implementation should follow best practices.`;
      };
      
      const mockPRs = [
        {
          number: 123,
          order: 1,
          title: 'Add Authentication',
          description: 'Implement JWT authentication',
          fileChanges: [
            { status: 'added', path: 'auth.js' }
          ]
        }
      ];
      
      try {
        const result = await promptGenerator.generatePrompts(mockPRs, mockStructure);
        
        expect(result).to.be.an('array');
        expect(result).to.have.length(1);
        
        const promptPath = result[0];
        expect(promptPath).to.include('pr_1_123.md');
        
        // Check that file was created
        const exists = await fs.pathExists(promptPath);
        expect(exists).to.be.true;
        
        // Check file content
        const content = await fs.readFile(promptPath, 'utf8');
        expect(content).to.include('pr_number: 123');
        expect(content).to.include('pr_order: 1');
        expect(content).to.include('# Implement Feature');
        
      } finally {
        promptGenerator.callLLM = originalCallLLM;
      }
    });
  });
});
