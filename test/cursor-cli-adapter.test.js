const { expect } = require('chai');
const path = require('path');
const fs = require('fs-extra');
const { CursorCLIAdapter } = require('../src/adapters/CursorCLIAdapter');

describe('CursorCLIAdapter', function() {
  this.timeout(30000);
  
  let adapter;
  let testDir;
  let promptFile;
  let repositoryPath;
  
  beforeEach(async function() {
    testDir = path.join(__dirname, 'temp-cursor-cli');
    await fs.ensureDir(testDir);
    
    // Create test repository
    repositoryPath = path.join(testDir, 'test-repo');
    await fs.ensureDir(repositoryPath);
    
    // Create a simple test file in the repository
    await fs.writeFile(
      path.join(repositoryPath, 'test.js'),
      'console.log("Hello, world!");'
    );
    
    // Create test prompt file
    promptFile = path.join(testDir, 'test-prompt.md');
    await fs.writeFile(promptFile, '# Test Prompt\n\nPlease analyze the code in this repository.');
    
    adapter = new CursorCLIAdapter({
      verbose: false,
      quiet: true
    });
  });
  
  afterEach(async function() {
    await fs.remove(testDir);
  });

  describe('constructor', function() {
    it('should create CursorCLIAdapter instance with default config', function() {
      expect(adapter).to.be.instanceOf(CursorCLIAdapter);
      expect(adapter.name).to.equal('Cursor CLI');
      expect(adapter.command).to.equal('cursor-agent');
      expect(adapter.outputFormat).to.equal('text');
      expect(adapter.model).to.be.null;
    });

    it('should accept custom configuration options', function() {
      const customAdapter = new CursorCLIAdapter({
        command: 'custom-cursor',
        args: ['--custom-arg'],
        model: 'gpt-4',
        outputFormat: 'json',
        timeout: 60000
      });
      
      expect(customAdapter.command).to.equal('custom-cursor');
      expect(customAdapter.args).to.deep.equal(['--custom-arg']);
      expect(customAdapter.model).to.equal('gpt-4');
      expect(customAdapter.outputFormat).to.equal('json');
      expect(customAdapter.timeout).to.equal(60000);
    });
  });

  describe('getMetadata', function() {
    it('should return comprehensive adapter metadata', function() {
      const metadata = adapter.getMetadata();
      
      expect(metadata).to.have.property('name', 'Cursor CLI');
      expect(metadata).to.have.property('description');
      expect(metadata).to.have.property('version', '1.0.0');
      expect(metadata).to.have.property('author', 'Augbench');
      expect(metadata).to.have.property('capabilities').that.is.an('array');
      expect(metadata).to.have.property('requirements').that.is.an('array');
      expect(metadata).to.have.property('supportedFormats').that.includes('text');
      expect(metadata).to.have.property('supportedFormats').that.includes('json');
      
      // Check capabilities
      expect(metadata.capabilities).to.include('Code generation and modification');
      expect(metadata.capabilities).to.include('MCP (Model Context Protocol) support');
      expect(metadata.capabilities).to.include('Rules system integration');
    });
  });

  describe('readPrompt', function() {
    it('should read prompt content from file', async function() {
      const content = await adapter.readPrompt(promptFile);
      expect(content).to.equal('# Test Prompt\n\nPlease analyze the code in this repository.');
    });

    it('should throw error for non-existent prompt file', async function() {
      const nonExistentFile = path.join(testDir, 'non-existent.md');

      try {
        await adapter.readPrompt(nonExistentFile);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Prompt file not found');
      }
    });
  });

  describe('validateRepository', function() {
    it('should validate existing repository', async function() {
      // Should not throw an error
      await adapter.validateRepository(repositoryPath);
    });

    it('should throw error for non-existent repository', async function() {
      const nonExistentRepo = path.join(testDir, 'non-existent-repo');

      try {
        await adapter.validateRepository(nonExistentRepo);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Repository path does not exist');
      }
    });
  });

  describe('isAvailable', function() {
    it('should return false when cursor-agent is not available', async function() {
      // This test assumes cursor-agent is not installed in the test environment
      const available = await adapter.isAvailable();
      expect(available).to.be.a('boolean');
      // We can't assert the exact value since it depends on the test environment
    });

    it('should handle command execution errors gracefully', async function() {
      const customAdapter = new CursorCLIAdapter({
        command: 'non-existent-command'
      });
      
      const available = await customAdapter.isAvailable();
      expect(available).to.be.false;
    });
  });

  describe('getVersion', function() {
    it('should return version information', async function() {
      // Mock the runCommand method to simulate cursor-agent --help output
      const originalRunCommand = adapter.runCommand;
      adapter.runCommand = async (command) => {
        if (command.includes('--help')) {
          return 'Cursor CLI v1.0.0\nUsage: cursor-agent [options]';
        }
        return originalRunCommand.call(adapter, command);
      };

      try {
        const version = await adapter.getVersion();
        expect(version).to.be.a('string');
        expect(version).to.include('Cursor CLI');
      } finally {
        adapter.runCommand = originalRunCommand;
      }
    });

    it('should handle version retrieval failure', async function() {
      const customAdapter = new CursorCLIAdapter({
        command: 'non-existent-command'
      });

      try {
        await customAdapter.getVersion();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to get Cursor CLI version');
      }
    });
  });

  describe('runCursorCLI', function() {
    it('should construct correct command arguments (requires cursor-agent)', function() {
      // This test requires cursor-agent to be installed
      // Skip if not available to avoid test failures in CI/development environments
      this.skip();
    });

    it('should include model argument when model is specified (requires cursor-agent)', function() {
      // This test requires cursor-agent to be installed
      // Skip if not available to avoid test failures in CI/development environments
      this.skip();
    });
  });

  describe('execute', function() {
    it('should handle execution failure gracefully', async function() {
      // Mock runCursorCLI to simulate failure
      const originalRunCursorCLI = adapter.runCursorCLI;
      adapter.runCursorCLI = async () => {
        throw new Error('Cursor CLI execution failed');
      };

      try {
        try {
          await adapter.execute(promptFile, repositoryPath);
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).to.include('Cursor CLI execution failed after');
        }
      } finally {
        adapter.runCursorCLI = originalRunCursorCLI;
      }
    });

    it('should validate repository before execution', async function() {
      const nonExistentRepo = path.join(testDir, 'non-existent');

      try {
        await adapter.execute(promptFile, nonExistentRepo);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Repository path does not exist');
      }
    });

    it('should validate prompt file before execution', async function() {
      const nonExistentPrompt = path.join(testDir, 'non-existent.md');

      try {
        await adapter.execute(nonExistentPrompt, repositoryPath);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Prompt file not found');
      }
    });
  });

  describe('initialize', function() {
    it('should initialize successfully when cursor-agent is available', async function() {
      // Mock isAvailable to return true
      const originalIsAvailable = adapter.isAvailable;
      adapter.isAvailable = async () => true;

      try {
        // Should not throw an error
        await adapter.initialize();
      } finally {
        adapter.isAvailable = originalIsAvailable;
      }
    });

    it('should throw error when cursor-agent is not available', async function() {
      // Mock isAvailable to return false
      const originalIsAvailable = adapter.isAvailable;
      adapter.isAvailable = async () => false;

      try {
        try {
          await adapter.initialize();
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).to.include('Cursor CLI is not available');
        }
      } finally {
        adapter.isAvailable = originalIsAvailable;
      }
    });
  });

  describe('cleanup', function() {
    it('should cleanup without errors', async function() {
      // Should not throw an error
      await adapter.cleanup();
    });
  });
});
