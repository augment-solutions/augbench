/**
 * Tests for PRChangeManager utility
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs-extra');
const { PRChangeManager } = require('../src/utils/PRChangeManager');

describe('PRChangeManager', () => {
  let prChangeManager;
  let tempDir;
  let baseDir;
  let agentOutputDir;
  let prChangesDir;

  beforeEach(async () => {
    prChangeManager = new PRChangeManager({ silent: true });
    tempDir = path.join(__dirname, 'temp-pr-change-manager');
    baseDir = path.join(tempDir, 'base');
    agentOutputDir = path.join(tempDir, 'agent-output');
    prChangesDir = path.join(tempDir, 'pr-changes');
    
    await fs.ensureDir(baseDir);
    await fs.ensureDir(agentOutputDir);
    await fs.ensureDir(prChangesDir);
  });

  afterEach(async () => {
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('storeIncrementalChanges', () => {
    it('should store only incremental changes', async () => {
      // Setup base directory
      await fs.writeFile(path.join(baseDir, 'existing.txt'), 'original content');
      
      // Setup agent output with changes
      await fs.writeFile(path.join(agentOutputDir, 'existing.txt'), 'modified content');
      await fs.writeFile(path.join(agentOutputDir, 'new.txt'), 'new file content');
      
      const prInfo = { number: 123, order: 1, title: 'Test PR' };
      
      const result = await prChangeManager.storeIncrementalChanges(
        baseDir,
        agentOutputDir,
        prChangesDir,
        prInfo
      );
      
      // Check that only changed files were stored
      expect(await fs.pathExists(path.join(prChangesDir, 'existing.txt'))).to.be.true;
      expect(await fs.pathExists(path.join(prChangesDir, 'new.txt'))).to.be.true;
      
      // Check metadata was created
      expect(await fs.pathExists(path.join(prChangesDir, 'pr_changes_metadata.json'))).to.be.true;
      
      const metadata = await fs.readJSON(path.join(prChangesDir, 'pr_changes_metadata.json'));
      expect(metadata.pr.number).to.equal(123);
      expect(metadata.changeHash).to.be.a('string');
      expect(metadata.changes.added).to.have.length(1);
      expect(metadata.changes.modified).to.have.length(1);
      
      expect(result.changeHash).to.equal(metadata.changeHash);
      expect(result.summary.filesChanged).to.equal(2);
    });
  });

  describe('applyIncrementalChanges', () => {
    it('should apply changes from PR directory to base', async () => {
      // Setup base directory
      await fs.writeFile(path.join(baseDir, 'existing.txt'), 'original content');
      
      // Setup PR changes directory with incremental changes
      await fs.writeFile(path.join(prChangesDir, 'existing.txt'), 'modified content');
      await fs.writeFile(path.join(prChangesDir, 'new.txt'), 'new file content');
      
      const metadata = {
        pr: { number: 123 },
        changeHash: 'abc12345',
        changes: {
          added: [{ path: 'new.txt', hash: 'def456' }],
          modified: [{ path: 'existing.txt', oldHash: 'ghi789', newHash: 'jkl012' }],
          deleted: []
        }
      };
      
      await fs.writeJSON(path.join(prChangesDir, 'pr_changes_metadata.json'), metadata);
      
      await prChangeManager.applyIncrementalChanges(baseDir, prChangesDir);
      
      // Check that changes were applied to base
      const existingContent = await fs.readFile(path.join(baseDir, 'existing.txt'), 'utf8');
      expect(existingContent).to.equal('modified content');
      
      const newContent = await fs.readFile(path.join(baseDir, 'new.txt'), 'utf8');
      expect(newContent).to.equal('new file content');
    });

    it('should handle file deletions', async () => {
      // Setup base directory with file to be deleted
      await fs.writeFile(path.join(baseDir, 'to-delete.txt'), 'will be deleted');
      await fs.writeFile(path.join(baseDir, 'to-keep.txt'), 'will be kept');
      
      const metadata = {
        pr: { number: 123 },
        changeHash: 'abc12345',
        changes: {
          added: [],
          modified: [],
          deleted: [{ path: 'to-delete.txt', hash: 'xyz789' }]
        }
      };
      
      await fs.writeJSON(path.join(prChangesDir, 'pr_changes_metadata.json'), metadata);
      
      await prChangeManager.applyIncrementalChanges(baseDir, prChangesDir);
      
      // Check that file was deleted
      expect(await fs.pathExists(path.join(baseDir, 'to-delete.txt'))).to.be.false;
      expect(await fs.pathExists(path.join(baseDir, 'to-keep.txt'))).to.be.true;
    });
  });

  describe('compareChanges', () => {
    it('should compare human and agent changes', async () => {
      // Setup human PR directory
      const humanPRDir = path.join(tempDir, 'human-pr');
      await fs.ensureDir(humanPRDir);
      await fs.writeFile(path.join(humanPRDir, 'file1.txt'), 'human version');
      await fs.writeFile(path.join(humanPRDir, 'file2.txt'), 'human file 2');
      
      // Setup agent PR directory with metadata
      await fs.writeFile(path.join(prChangesDir, 'file1.txt'), 'agent version');
      await fs.writeFile(path.join(prChangesDir, 'file3.txt'), 'agent file 3');
      
      const agentMetadata = {
        pr: { number: 123 },
        changeHash: 'agent123',
        changes: {
          added: [{ path: 'file3.txt' }],
          modified: [{ path: 'file1.txt' }],
          deleted: []
        }
      };
      
      await fs.writeJSON(path.join(prChangesDir, 'pr_changes_metadata.json'), agentMetadata);
      
      // Setup base directory
      await fs.writeFile(path.join(baseDir, 'original.txt'), 'original content');
      
      const comparison = await prChangeManager.compareChanges(humanPRDir, prChangesDir, baseDir);
      
      expect(comparison.human.hash).to.be.a('string');
      expect(comparison.agent.hash).to.equal('agent123');
      expect(comparison.similarity).to.be.a('number');
      expect(comparison.comparison.exactMatch).to.be.a('boolean');
      expect(comparison.comparison.similarityPercentage).to.equal(comparison.similarity);
    });
  });

  describe('formatChangeSummary', () => {
    it('should format change summary correctly', () => {
      const changes = {
        summary: {
          filesChanged: 3,
          linesAdded: 25,
          linesDeleted: 10,
          totalFiles: 5
        }
      };
      
      const summary = prChangeManager.formatChangeSummary(changes);
      expect(summary).to.equal('files: 3, +25/-10 lines');
    });

    it('should handle no changes', () => {
      const changes = {
        summary: {
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0,
          totalFiles: 2
        }
      };
      
      const summary = prChangeManager.formatChangeSummary(changes);
      expect(summary).to.equal('no changes');
    });
  });

  describe('formatConsoleOutput', () => {
    it('should format console output correctly', () => {
      const assistantName = 'TestAssistant';
      const prInfo = { order: 1, number: 123 };
      const runNumber = 2;
      const totalRuns = 3;
      
      const comparison = {
        human: {
          hash: 'human123',
          summary: 'files: 2, +15/-5 lines'
        },
        agent: {
          hash: 'agent456',
          summary: 'files: 3, +20/-8 lines',
          changes: {
            added: [{ path: 'new.txt' }],
            modified: [{ path: 'existing.txt', linesAdded: 10, linesDeleted: 3 }],
            deleted: []
          }
        },
        similarity: 75
      };
      
      const output = prChangeManager.formatConsoleOutput(
        assistantName,
        prInfo,
        runNumber,
        totalRuns,
        comparison
      );
      
      expect(output).to.include('[PR 1 - TestAssistant - Run 2/3]');
      expect(output).to.include('Human changes: human123');
      expect(output).to.include('TestAssistant changes: agent456');
      expect(output).to.include('75% similarity');
      expect(output).to.include('existing.txt (+10/-3)');
    });
  });

  describe('validatePRChanges', () => {
    it('should validate valid PR changes directory', async () => {
      const metadata = {
        pr: { number: 123 },
        changeHash: 'abc123',
        changes: { added: [], modified: [], deleted: [] }
      };
      
      await fs.writeJSON(path.join(prChangesDir, 'pr_changes_metadata.json'), metadata);
      
      const isValid = await prChangeManager.validatePRChanges(prChangesDir);
      expect(isValid).to.be.true;
    });

    it('should reject invalid PR changes directory', async () => {
      const isValid = await prChangeManager.validatePRChanges(prChangesDir);
      expect(isValid).to.be.false;
    });
  });
});
