import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import { SettingsManager } from '../../../config/SettingsManager.js';

describe('SettingsManager', () => {
  const testConfigPath = './test-settings.json';
  
  afterEach(async () => {
    // Clean up test files
    if (await fs.pathExists(testConfigPath)) {
      await fs.remove(testConfigPath);
    }
  });

  describe('loadFromFile', () => {
    it('should load valid LLM_Evaluator settings', async () => {
      const validSettings = {
        agents: ['Augment CLI'],
        mode: 'LLM_Evaluator',
        repo_path: './test-repo',
        metrics: ['response_time'],
        runs_per_prompt: 1,
        parallel_agents: false,
        output_filename: 'test_results',
        stage_dir: './test-stage'
      };

      await fs.writeFile(testConfigPath, JSON.stringify(validSettings, null, 2));
      
      const settings = await SettingsManager.loadFromFile(testConfigPath);
      
      assert.strictEqual(settings.mode, 'LLM_Evaluator');
      assert.strictEqual(settings.agents.length, 1);
      assert.strictEqual(settings.agents[0], 'Augment CLI');
      assert.strictEqual(settings.repo_path, './test-repo');
    });

    it('should load valid PR_Recreate settings', async () => {
      const validSettings = {
        agents: ['Claude Code'],
        mode: 'PR_Recreate',
        repo_url: 'https://github.com/owner/repo.git',
        metrics: ['response_time', 'ast_similarity'],
        runs_per_prompt: 1,
        parallel_agents: false,
        output_filename: 'pr_results',
        stage_dir: './test-stage',
        PR_Recreate: {
          num_prs: 3
        }
      };

      await fs.writeFile(testConfigPath, JSON.stringify(validSettings, null, 2));
      
      const settings = await SettingsManager.loadFromFile(testConfigPath);
      
      assert.strictEqual(settings.mode, 'PR_Recreate');
      assert.strictEqual(settings.repo_url, 'https://github.com/owner/repo.git');
      assert.strictEqual(settings.PR_Recreate.num_prs, 3);
    });

    it('should reject invalid mode', async () => {
      const invalidSettings = {
        agents: ['Test Agent'],
        mode: 'Invalid_Mode',
        repo_path: './test-repo'
      };

      await fs.writeFile(testConfigPath, JSON.stringify(invalidSettings, null, 2));
      
      try {
        await SettingsManager.loadFromFile(testConfigPath);
        assert.fail('Should throw error for invalid mode');
      } catch (error) {
        assert(error.message.includes('mode'), 'Error should mention mode validation');
      }
    });

    it('should reject LLM_Evaluator without repo_url or repo_path', async () => {
      const invalidSettings = {
        agents: ['Test Agent'],
        mode: 'LLM_Evaluator'
      };

      await fs.writeFile(testConfigPath, JSON.stringify(invalidSettings, null, 2));
      
      try {
        await SettingsManager.loadFromFile(testConfigPath);
        assert.fail('Should throw error for missing repo configuration');
      } catch (error) {
        assert(error.message.includes('repo_url or repo_path is required'), 'Error should mention repo requirement');
      }
    });

    it('should reject PR_Recreate without repo_url', async () => {
      const invalidSettings = {
        agents: ['Test Agent'],
        mode: 'PR_Recreate',
        repo_path: './local-repo'
      };

      await fs.writeFile(testConfigPath, JSON.stringify(invalidSettings, null, 2));
      
      try {
        await SettingsManager.loadFromFile(testConfigPath);
        assert.fail('Should throw error for PR_Recreate with repo_path');
      } catch (error) {
        assert(error.message.includes('repo_url is required for PR_Recreate'), 'Error should mention repo_url requirement');
      }
    });

    it('should reject PR_Recreate with repo_path', async () => {
      const invalidSettings = {
        agents: ['Test Agent'],
        mode: 'PR_Recreate',
        repo_url: 'https://github.com/owner/repo.git',
        repo_path: './local-repo'
      };

      await fs.writeFile(testConfigPath, JSON.stringify(invalidSettings, null, 2));
      
      try {
        await SettingsManager.loadFromFile(testConfigPath);
        assert.fail('Should throw error for PR_Recreate with repo_path');
      } catch (error) {
        assert(error.message.includes('repo_path may not be used in PR_Recreate'), 'Error should mention repo_path restriction');
      }
    });

    it('should throw error for missing file', async () => {
      try {
        await SettingsManager.loadFromFile('./non-existent-file.json');
        assert.fail('Should throw error for missing file');
      } catch (error) {
        assert(error.message.includes('Missing'), 'Error should mention missing file');
      }
    });

    it('should throw error for invalid JSON', async () => {
      await fs.writeFile(testConfigPath, '{ invalid json }');
      
      try {
        await SettingsManager.loadFromFile(testConfigPath);
        assert.fail('Should throw error for invalid JSON');
      } catch (error) {
        assert(error instanceof Error, 'Should throw an Error');
      }
    });

    it('should apply default values', async () => {
      const minimalSettings = {
        agents: ['Test Agent'],
        mode: 'LLM_Evaluator',
        repo_path: './test-repo'
      };

      await fs.writeFile(testConfigPath, JSON.stringify(minimalSettings, null, 2));
      
      const settings = await SettingsManager.loadFromFile(testConfigPath);
      
      // Check default values are applied
      assert.strictEqual(settings.runs_per_prompt, 1);
      assert.strictEqual(settings.parallel_agents, false);
      assert.strictEqual(settings.stage_dir, './stage');
      assert(Array.isArray(settings.metrics), 'Metrics should be an array');
    });
  });
});
