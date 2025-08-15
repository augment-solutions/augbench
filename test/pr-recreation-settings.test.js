/**
 * Tests for PR Recreation Mode settings validation
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const fs = require('fs-extra');
const path = require('path');
const { SettingsManager } = require('../src/config/SettingsManager');

describe('PR Recreation Mode Settings', function() {
  this.timeout(10000);
  
  let settingsManager;
  let testDir;
  let settingsPath;
  
  beforeEach(async function() {
    testDir = path.join(__dirname, 'temp-pr-settings');
    await fs.ensureDir(testDir);
    
    settingsPath = path.join(testDir, 'settings.json');
    
    settingsManager = new SettingsManager({
      verbose: false,
      quiet: true,
      settingsPath
    });
  });
  
  afterEach(async function() {
    await fs.remove(testDir);
  });
  
  describe('schema validation', function() {
    it('should validate standard mode settings', async function() {
      const standardSettings = {
        mode: 'standard',
        num_prompts: 2,
        prompts: ['prompt1.md', 'prompt2.md'],
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['response_time', 'output_quality']
      };
      
      await fs.writeJSON(settingsPath, standardSettings);
      
      // Mock prompt file existence
      const originalExists = settingsManager.fs.exists;
      settingsManager.fs.exists = async (path) => {
        if (path.includes('prompt1.md') || path.includes('prompt2.md')) {
          return true;
        }
        return originalExists.call(settingsManager.fs, path);
      };
      
      try {
        const validated = await settingsManager.validateSettings();
        expect(validated.mode).to.equal('standard');
        expect(validated.num_prompts).to.equal(2);
        expect(validated.prompts).to.have.length(2);
      } finally {
        settingsManager.fs.exists = originalExists;
      }
    });
    
    it('should validate PR recreation mode settings', async function() {
      const prSettings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        num_prs: 3,
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'pr_test_results',
        metrics: ['ast_similarity', 'instruction_adherence']
      };
      
      await fs.writeJSON(settingsPath, prSettings);
      
      const validated = await settingsManager.validateSettings();
      expect(validated.mode).to.equal('pr_recreate');
      expect(validated.target_repo_url).to.equal('https://github.com/test/repo.git');
      expect(validated.num_prs).to.equal(3);
    });
    
    it('should default to standard mode when mode is not specified', async function() {
      const settings = {
        num_prompts: 1,
        prompts: ['prompt1.md'],
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['response_time']
      };
      
      await fs.writeJSON(settingsPath, settings);
      
      // Mock prompt file existence
      const originalExists = settingsManager.fs.exists;
      settingsManager.fs.exists = async (path) => {
        if (path.includes('prompt1.md')) {
          return true;
        }
        return originalExists.call(settingsManager.fs, path);
      };
      
      try {
        const validated = await settingsManager.validateSettings();
        expect(validated.mode).to.equal('standard');
      } finally {
        settingsManager.fs.exists = originalExists;
      }
    });
    
    it('should reject invalid mode values', async function() {
      const invalidSettings = {
        mode: 'invalid_mode',
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['response_time']
      };
      
      await fs.writeJSON(settingsPath, invalidSettings);
      
      try {
        await settingsManager.validateSettings();
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Settings validation failed');
        expect(error.message).to.include('must be one of');
      }
    });
  });
  
  describe('PR recreation mode validation', function() {
    it('should require target_repo_url in PR recreation mode', async function() {
      const invalidSettings = {
        mode: 'pr_recreate',
        num_prs: 3,
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['ast_similarity']
      };
      
      await fs.writeJSON(settingsPath, invalidSettings);
      
      try {
        await settingsManager.validateSettings();
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('target_repo_url');
        expect(error.message).to.include('required');
      }
    });
    
    it('should require num_prs in PR recreation mode', async function() {
      const invalidSettings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['ast_similarity']
      };
      
      await fs.writeJSON(settingsPath, invalidSettings);
      
      try {
        await settingsManager.validateSettings();
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('num_prs');
        expect(error.message).to.include('required');
      }
    });
    
    it('should validate Git repository URL format', async function() {
      const invalidSettings = {
        mode: 'pr_recreate',
        target_repo_url: 'not-a-valid-git-url',
        num_prs: 3,
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['ast_similarity']
      };
      
      await fs.writeJSON(settingsPath, invalidSettings);
      
      try {
        await settingsManager.validateSettings();
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('valid Git repository URL');
      }
    });
    
    it('should accept valid Git repository URLs', async function() {
      const validUrls = [
        'https://github.com/user/repo.git',
        'https://gitlab.com/user/repo.git',
        'git@github.com:user/repo.git',
        'https://github.com/user/repo'
      ];
      
      for (const url of validUrls) {
        const settings = {
          mode: 'pr_recreate',
          target_repo_url: url,
          num_prs: 3,
          assistants: ['Claude Code'],
          runs_per_prompt: 1,
          output_filename: 'test_results',
          metrics: ['ast_similarity']
        };
        
        await fs.writeJSON(settingsPath, settings);
        
        const validated = await settingsManager.validateSettings();
        expect(validated.target_repo_url).to.equal(url);
      }
    });
    
    it('should warn about high num_prs values', async function() {
      const settings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        num_prs: 60,
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['ast_similarity']
      };
      
      await fs.writeJSON(settingsPath, settings);
      
      // Capture logger warnings
      const warnings = [];
      const originalWarn = settingsManager.logger.warn;
      settingsManager.logger.warn = (message) => {
        warnings.push(message);
      };
      
      try {
        await settingsManager.validateSettings();
        expect(warnings.some(w => w.includes('num_prs is set to 60'))).to.be.true;
      } finally {
        settingsManager.logger.warn = originalWarn;
      }
    });
    
    it('should warn about missing PR-specific metrics', async function() {
      const settings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        num_prs: 3,
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['response_time', 'output_quality'] // Missing PR-specific metrics
      };
      
      await fs.writeJSON(settingsPath, settings);
      
      // Capture logger warnings
      const warnings = [];
      const originalWarn = settingsManager.logger.warn;
      settingsManager.logger.warn = (message) => {
        warnings.push(message);
      };
      
      try {
        await settingsManager.validateSettings();
        expect(warnings.some(w => w.includes('ast_similarity, instruction_adherence'))).to.be.true;
      } finally {
        settingsManager.logger.warn = originalWarn;
      }
    });
  });
  
  describe('standard mode validation', function() {
    it('should not require PR-specific fields in standard mode', async function() {
      const settings = {
        mode: 'standard',
        num_prompts: 1,
        prompts: ['prompt1.md'],
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['response_time']
      };
      
      await fs.writeJSON(settingsPath, settings);
      
      // Mock prompt file existence
      const originalExists = settingsManager.fs.exists;
      settingsManager.fs.exists = async (path) => {
        if (path.includes('prompt1.md')) {
          return true;
        }
        return originalExists.call(settingsManager.fs, path);
      };
      
      try {
        const validated = await settingsManager.validateSettings();
        expect(validated.mode).to.equal('standard');
        expect(validated).to.not.have.property('target_repo_url');
        expect(validated).to.not.have.property('num_prs');
      } finally {
        settingsManager.fs.exists = originalExists;
      }
    });
    
    it('should validate num_prompts matches prompts array length in standard mode', async function() {
      const settings = {
        mode: 'standard',
        num_prompts: 3,
        prompts: ['prompt1.md', 'prompt2.md'], // Mismatch: 3 vs 2
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['response_time']
      };
      
      await fs.writeJSON(settingsPath, settings);
      
      try {
        await settingsManager.validateSettings();
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('num_prompts must match the length of prompts array');
      }
    });
    
    it('should not validate prompts array length in PR recreation mode', async function() {
      const settings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        num_prs: 3,
        num_prompts: 5, // This should be ignored in PR mode
        prompts: ['prompt1.md'], // This should be ignored in PR mode
        assistants: ['Claude Code'],
        runs_per_prompt: 1,
        output_filename: 'test_results',
        metrics: ['ast_similarity']
      };
      
      await fs.writeJSON(settingsPath, settings);
      
      const validated = await settingsManager.validateSettings();
      expect(validated.mode).to.equal('pr_recreate');
      // Should not throw error about prompts array length mismatch
    });
  });
  
  describe('template generation', function() {
    it('should include mode field in generated template', async function() {
      await settingsManager.createTemplate();
      
      const template = await fs.readJSON(settingsPath);
      expect(template).to.have.property('mode');
      expect(template.mode).to.equal('standard');
    });
  });
  
  describe('displaySettings', function() {
    it('should display mode-specific information', async function() {
      const prSettings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        num_prs: 5,
        assistants: ['Claude Code'],
        runs_per_prompt: 2,
        output_filename: 'pr_results',
        metrics: ['ast_similarity']
      };
      
      await fs.writeJSON(settingsPath, prSettings);
      
      // Capture logger output
      const logs = [];
      const originalInfo = settingsManager.logger.info;
      settingsManager.logger.info = (message) => {
        logs.push(message);
      };
      
      try {
        await settingsManager.displaySettings();
        
        expect(logs.some(log => log.includes('Mode: pr_recreate'))).to.be.true;
        expect(logs.some(log => log.includes('Target repository: https://github.com/test/repo.git'))).to.be.true;
        expect(logs.some(log => log.includes('Number of PRs: 5'))).to.be.true;
        expect(logs.some(log => log.includes('Assistants: Claude Code'))).to.be.true;
      } finally {
        settingsManager.logger.info = originalInfo;
      }
    });
  });
});
