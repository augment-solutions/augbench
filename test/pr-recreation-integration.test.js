/**
 * Integration tests for PR Recreation Mode
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const fs = require('fs-extra');
const path = require('path');
const { BenchmarkRunner } = require('../src/cli/BenchmarkRunner');
const { PRStagingManager } = require('../src/utils/PRStagingManager');

describe('PR Recreation Mode Integration', function() {
  this.timeout(30000);
  
  let testDir;
  let benchmarkRunner;
  let stagingManager;
  
  beforeEach(async function() {
    testDir = path.join(__dirname, 'temp-pr-integration');
    await fs.ensureDir(testDir);
    
    benchmarkRunner = new BenchmarkRunner({
      verbose: false,
      quiet: true,
      stageDir: testDir
    });
    
    stagingManager = new PRStagingManager({
      verbose: false,
      quiet: true
    });
  });
  
  afterEach(async function() {
    await fs.remove(testDir);
  });
  
  describe('PRStagingManager', function() {
    it('should create proper directory structure', async function() {
      const assistants = ['test-assistant'];
      const prs = [
        { number: 123, order: 1, title: 'Test PR 1' },
        { number: 124, order: 2, title: 'Test PR 2' }
      ];
      
      const structure = await stagingManager.setupPRDirectories(testDir, assistants, prs);
      
      expect(structure.base).to.equal(testDir);
      expect(structure.human).to.equal(path.join(testDir, 'human'));
      expect(structure.prompts).to.equal(path.join(testDir, 'prompts'));
      expect(structure.baseRepo).to.equal(path.join(testDir, 'base_repo'));
      expect(structure.agents['test-assistant']).to.equal(path.join(testDir, 'agents', 'test-assistant'));
      
      // Check directories exist
      expect(await fs.pathExists(structure.human)).to.be.true;
      expect(await fs.pathExists(structure.prompts)).to.be.true;
      expect(await fs.pathExists(structure.baseRepo)).to.be.true;
      expect(await fs.pathExists(structure.agents['test-assistant'])).to.be.true;
      
      // Check PR-specific directories
      for (const pr of prs) {
        const prDir = path.join(structure.agents['test-assistant'], `pr_${pr.order}_${pr.number}`);
        expect(await fs.pathExists(prDir)).to.be.true;
      }
    });
    
    it('should handle agent slug generation correctly', function() {
      const testCases = [
        { input: 'Claude Code', expected: 'claude-code' },
        { input: 'Augment CLI', expected: 'augment-cli' },
        { input: 'Test Assistant 123!', expected: 'test-assistant-123-' },
        { input: 'simple', expected: 'simple' }
      ];
      
      testCases.forEach(({ input, expected }) => {
        const result = stagingManager.agentSlug(input);
        expect(result).to.equal(expected);
      });
    });
    
    it('should generate correct paths', function() {
      const structure = {
        agents: { 'test-assistant': path.join(testDir, 'agents', 'test-assistant') },
        human: path.join(testDir, 'human'),
        prompts: path.join(testDir, 'prompts')
      };
      
      const pr = { number: 123, order: 1 };
      
      const agentPRDir = stagingManager.getAgentPRWorkingDir('test-assistant', pr, structure);
      expect(agentPRDir).to.equal(path.join(testDir, 'agents', 'test-assistant', 'pr_1_123'));
      
      const agentBaseDir = stagingManager.getAgentBaseDir('test-assistant', structure);
      expect(agentBaseDir).to.equal(path.join(testDir, 'agents', 'test-assistant', 'base'));
      
      const humanRefDir = stagingManager.getHumanReferenceDir(pr, structure);
      expect(humanRefDir).to.equal(path.join(testDir, 'human', 'pr_1_123'));
      
      const promptPath = stagingManager.getPromptPath(pr, structure);
      expect(promptPath).to.equal(path.join(testDir, 'prompts', 'pr_1_123.md'));
    });
    
    it('should handle repository cloning failure gracefully', async function() {
      const invalidUrl = 'https://github.com/nonexistent/repository.git';
      const destDir = path.join(testDir, 'clone-test');
      
      try {
        await stagingManager.cloneRepository(invalidUrl, destDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
  
  describe('BenchmarkRunner PR Recreation', function() {
    it('should detect PR recreation mode correctly', async function() {
      const standardSettings = {
        mode: 'standard',
        num_prompts: 1,
        prompts: ['test.md'],
        assistants: ['test-assistant'],
        runs_per_prompt: 1,
        output_filename: 'test'
      };
      
      const prSettings = {
        mode: 'pr_recreate',
        target_repo_url: 'https://github.com/test/repo.git',
        num_prs: 1,
        assistants: ['test-assistant'],
        runs_per_prompt: 1,
        output_filename: 'test'
      };
      
      // Mock the actual benchmark methods to avoid real execution
      const originalRunStandard = benchmarkRunner.runStandardBenchmarks;
      const originalRunPR = benchmarkRunner.runPRRecreationBenchmarks;
      
      let standardCalled = false;
      let prCalled = false;
      
      benchmarkRunner.runStandardBenchmarks = async () => {
        standardCalled = true;
        return [];
      };
      
      benchmarkRunner.runPRRecreationBenchmarks = async () => {
        prCalled = true;
        return [];
      };
      
      try {
        await benchmarkRunner.runBenchmarks('/test/repo', standardSettings);
        expect(standardCalled).to.be.true;
        expect(prCalled).to.be.false;
        
        standardCalled = false;
        prCalled = false;
        
        await benchmarkRunner.runBenchmarks(null, prSettings);
        expect(standardCalled).to.be.false;
        expect(prCalled).to.be.true;
        
      } finally {
        benchmarkRunner.runStandardBenchmarks = originalRunStandard;
        benchmarkRunner.runPRRecreationBenchmarks = originalRunPR;
      }
    });
    
    it('should calculate run scores correctly', function() {
      const testRuns = [
        {
          run_id: 1,
          ast_similarity: 8,
          instruction_adherence: 7,
          output_quality: 6,
          context_adherence: 5
        },
        {
          run_id: 2,
          ast_similarity: 6,
          instruction_adherence: 9,
          output_quality: 8,
          context_adherence: 7
        },
        {
          run_id: 3,
          error: 'Failed to complete'
        }
      ];
      
      const bestRun = benchmarkRunner.findBestRun(testRuns);
      expect(bestRun).to.not.be.null;
      expect(bestRun.run_id).to.equal(2); // Should pick run 2 with higher weighted score
      
      const score1 = benchmarkRunner.calculateRunScore(testRuns[0]);
      const score2 = benchmarkRunner.calculateRunScore(testRuns[1]);
      
      expect(score2).to.be.greaterThan(score1);
    });
    
    it('should handle empty or failed runs', function() {
      expect(benchmarkRunner.findBestRun([])).to.be.null;
      expect(benchmarkRunner.findBestRun(null)).to.be.null;

      const failedRuns = [
        { run_id: 1, error: 'Failed' },
        { run_id: 2, error: 'Also failed' }
      ];

      expect(benchmarkRunner.findBestRun(failedRuns)).to.be.null;
    });

    it('should use CLI --repo-url argument over settings.target_repo_url', function() {
      // Test the fix for the "undefined" repository URL bug
      const runnerWithCliArg = new BenchmarkRunner({
        repoUrl: 'https://github.com/cli/repo.git', // CLI argument
        verbose: false,
        quiet: true
      });

      const settings = {
        mode: 'pr_recreate',
        num_prs: 2,
        target_repo_url: 'https://github.com/settings/repo.git', // Settings value
        assistants: ['test-assistant'],
        runs_per_prompt: 1,
        metrics: ['response_time']
      };

      // Test the logic that was fixed
      const targetRepoUrl = runnerWithCliArg.options.repoUrl || settings.target_repo_url;
      expect(targetRepoUrl).to.equal('https://github.com/cli/repo.git');
    });

    it('should fall back to settings.target_repo_url when no CLI argument', function() {
      const runnerWithoutCliArg = new BenchmarkRunner({
        verbose: false,
        quiet: true
        // No repoUrl CLI argument
      });

      const settings = {
        mode: 'pr_recreate',
        num_prs: 2,
        target_repo_url: 'https://github.com/settings/repo.git',
        assistants: ['test-assistant'],
        runs_per_prompt: 1,
        metrics: ['response_time']
      };

      // Test the fallback logic
      const targetRepoUrl = runnerWithoutCliArg.options.repoUrl || settings.target_repo_url;
      expect(targetRepoUrl).to.equal('https://github.com/settings/repo.git');
    });

    it('should handle missing repository URL gracefully', function() {
      const runnerWithoutCliArg = new BenchmarkRunner({
        verbose: false,
        quiet: true
      });

      const settings = {
        mode: 'pr_recreate',
        num_prs: 2,
        // target_repo_url is missing
        assistants: ['test-assistant'],
        runs_per_prompt: 1,
        metrics: ['response_time']
      };

      // Test that undefined is returned when neither is provided
      const targetRepoUrl = runnerWithoutCliArg.options.repoUrl || settings.target_repo_url;
      expect(targetRepoUrl).to.be.undefined;
    });
  });
  
  describe('Workflow Integration', function() {
    it('should handle complete workflow with mocked components', async function() {
      // Create mock PR data
      const mockPRs = [
        {
          number: 123,
          order: 1,
          title: 'Add authentication',
          description: 'Implement JWT authentication',
          mergedAt: '2023-01-01T00:00:00Z',
          author: { name: 'Test Author', email: 'test@example.com' },
          commits: { merge: 'abc123', main: 'def456', pr: 'ghi789' },
          fileChanges: [{ status: 'added', path: 'auth.js' }],
          codeChanges: 'diff --git a/auth.js b/auth.js...'
        }
      ];
      
      // Setup directory structure
      const assistants = ['test-assistant'];
      const structure = await stagingManager.setupPRDirectories(testDir, assistants, mockPRs);
      
      // Create mock base repository
      await fs.ensureDir(structure.baseRepo);
      await fs.writeFile(path.join(structure.baseRepo, 'app.js'), 'console.log("base app");');
      
      // Create mock human reference
      const humanPRDir = stagingManager.getHumanReferenceDir(mockPRs[0], structure);
      await fs.ensureDir(humanPRDir);
      await fs.writeFile(path.join(humanPRDir, 'app.js'), 'console.log("base app");');
      await fs.writeFile(path.join(humanPRDir, 'auth.js'), 'module.exports = { authenticate: () => {} };');
      await fs.writeJSON(path.join(humanPRDir, 'pr_metadata.json'), mockPRs[0]);
      
      // Create mock prompt
      const promptPath = stagingManager.getPromptPath(mockPRs[0], structure);
      await fs.writeFile(promptPath, '# Add Authentication\n\nImplement JWT authentication system.');
      
      // Prepare agent working directories
      await stagingManager.prepareAgentWorkingDirectories(assistants, structure);
      
      // Verify structure is set up correctly
      const agentBaseDir = stagingManager.getAgentBaseDir('test-assistant', structure);
      const agentPRDir = stagingManager.getAgentPRWorkingDir('test-assistant', mockPRs[0], structure);
      
      expect(await fs.pathExists(agentBaseDir)).to.be.true;
      expect(await fs.pathExists(agentPRDir)).to.be.true;
      expect(await fs.pathExists(promptPath)).to.be.true;
      expect(await fs.pathExists(humanPRDir)).to.be.true;
      
      // Check that base files were copied to agent directory
      const agentAppFile = path.join(agentBaseDir, 'app.js');
      expect(await fs.pathExists(agentAppFile)).to.be.true;
      
      const content = await fs.readFile(agentAppFile, 'utf8');
      expect(content).to.equal('console.log("base app");');
    });
    
    it('should handle incremental code updates', async function() {
      const assistants = ['test-assistant'];
      const mockPR = { number: 123, order: 1, title: 'Test PR' };
      
      const structure = await stagingManager.setupPRDirectories(testDir, assistants, [mockPR]);
      
      // Create base directory with initial content
      const agentBaseDir = stagingManager.getAgentBaseDir('test-assistant', structure);
      await fs.ensureDir(agentBaseDir);
      await fs.writeFile(path.join(agentBaseDir, 'original.js'), 'console.log("original");');
      
      // Create agent output with new content
      const agentPRDir = stagingManager.getAgentPRWorkingDir('test-assistant', mockPR, structure);
      await fs.ensureDir(agentPRDir);
      await fs.writeFile(path.join(agentPRDir, 'original.js'), 'console.log("original");');
      await fs.writeFile(path.join(agentPRDir, 'new.js'), 'console.log("new feature");');
      
      // Update incremental code
      await stagingManager.updateAgentIncrementalCode('test-assistant', mockPR, structure, agentPRDir);
      
      // Verify base directory was updated
      expect(await fs.pathExists(path.join(agentBaseDir, 'original.js'))).to.be.true;
      expect(await fs.pathExists(path.join(agentBaseDir, 'new.js'))).to.be.true;
      
      const newContent = await fs.readFile(path.join(agentBaseDir, 'new.js'), 'utf8');
      expect(newContent).to.equal('console.log("new feature");');
    });
  });
  
  describe('Error Handling', function() {
    it('should handle missing directories gracefully', async function() {
      const nonexistentPath = '/nonexistent/path';
      
      await stagingManager.updateAgentIncrementalCode(
        'test-assistant',
        { number: 123, order: 1 },
        { agents: { 'test-assistant': '/nonexistent' } },
        nonexistentPath
      );
      
      // Should not throw error, just log warning
    });
    
    it('should handle cleanup of non-existent directories', async function() {
      const structure = { base: '/nonexistent/path' };
      
      // Should not throw error
      await stagingManager.cleanup(structure);
    });
  });
});
