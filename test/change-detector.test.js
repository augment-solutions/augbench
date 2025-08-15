/**
 * Tests for ChangeDetector utility
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs-extra');
const { ChangeDetector } = require('../src/utils/ChangeDetector');

describe('ChangeDetector', () => {
  let changeDetector;
  let tempDir;
  let baseDir;
  let targetDir;

  beforeEach(async () => {
    changeDetector = new ChangeDetector({ silent: true });
    tempDir = path.join(__dirname, 'temp-change-detector');
    baseDir = path.join(tempDir, 'base');
    targetDir = path.join(tempDir, 'target');
    
    await fs.ensureDir(baseDir);
    await fs.ensureDir(targetDir);
  });

  afterEach(async () => {
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('computeChanges', () => {
    it('should detect added files', async () => {
      // Setup base directory with one file
      await fs.writeFile(path.join(baseDir, 'existing.txt'), 'existing content');
      
      // Setup target directory with existing file plus new file
      await fs.writeFile(path.join(targetDir, 'existing.txt'), 'existing content');
      await fs.writeFile(path.join(targetDir, 'new.txt'), 'new content');
      
      const changes = await changeDetector.computeChanges(baseDir, targetDir);
      
      expect(changes.added).to.have.length(1);
      expect(changes.added[0].path).to.equal('new.txt');
      expect(changes.modified).to.have.length(0);
      expect(changes.deleted).to.have.length(0);
      expect(changes.unchanged).to.have.length(1);
    });

    it('should detect modified files', async () => {
      // Setup base directory
      await fs.writeFile(path.join(baseDir, 'file.txt'), 'original content');
      
      // Setup target directory with modified file
      await fs.writeFile(path.join(targetDir, 'file.txt'), 'modified content');
      
      const changes = await changeDetector.computeChanges(baseDir, targetDir);
      
      expect(changes.added).to.have.length(0);
      expect(changes.modified).to.have.length(1);
      expect(changes.modified[0].path).to.equal('file.txt');
      expect(changes.deleted).to.have.length(0);
      expect(changes.unchanged).to.have.length(0);
    });

    it('should detect deleted files', async () => {
      // Setup base directory with two files
      await fs.writeFile(path.join(baseDir, 'keep.txt'), 'keep this');
      await fs.writeFile(path.join(baseDir, 'delete.txt'), 'delete this');
      
      // Setup target directory with only one file
      await fs.writeFile(path.join(targetDir, 'keep.txt'), 'keep this');
      
      const changes = await changeDetector.computeChanges(baseDir, targetDir);
      
      expect(changes.added).to.have.length(0);
      expect(changes.modified).to.have.length(0);
      expect(changes.deleted).to.have.length(1);
      expect(changes.deleted[0].path).to.equal('delete.txt');
      expect(changes.unchanged).to.have.length(1);
    });

    it('should handle nested directories', async () => {
      // Setup base directory with nested structure
      await fs.ensureDir(path.join(baseDir, 'subdir'));
      await fs.writeFile(path.join(baseDir, 'subdir', 'nested.txt'), 'nested content');
      
      // Setup target directory with modified nested file
      await fs.ensureDir(path.join(targetDir, 'subdir'));
      await fs.writeFile(path.join(targetDir, 'subdir', 'nested.txt'), 'modified nested content');
      
      const changes = await changeDetector.computeChanges(baseDir, targetDir);
      
      expect(changes.modified).to.have.length(1);
      expect(changes.modified[0].path).to.equal(path.join('subdir', 'nested.txt'));
    });
  });

  describe('generateChangesHash', () => {
    it('should generate consistent hashes for same changes', async () => {
      const changes = {
        added: [{ path: 'new.txt', hash: 'abc123' }],
        modified: [{ path: 'mod.txt', oldHash: 'def456', newHash: 'ghi789' }],
        deleted: [{ path: 'del.txt', hash: 'jkl012' }]
      };
      
      const hash1 = changeDetector.generateChangesHash(changes);
      const hash2 = changeDetector.generateChangesHash(changes);
      
      expect(hash1).to.equal(hash2);
      expect(hash1).to.be.a('string');
      expect(hash1).to.have.length(8);
    });

    it('should generate different hashes for different changes', async () => {
      const changes1 = {
        added: [{ path: 'file1.txt', hash: 'abc123' }],
        modified: [],
        deleted: []
      };
      
      const changes2 = {
        added: [{ path: 'file2.txt', hash: 'def456' }],
        modified: [],
        deleted: []
      };
      
      const hash1 = changeDetector.generateChangesHash(changes1);
      const hash2 = changeDetector.generateChangesHash(changes2);
      
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe('computeSimilarity', () => {
    it('should return 100% for identical changes', () => {
      const changes1 = {
        added: [{ path: 'file1.txt' }],
        modified: [{ path: 'file2.txt' }],
        deleted: []
      };
      
      const changes2 = {
        added: [{ path: 'file1.txt' }],
        modified: [{ path: 'file2.txt' }],
        deleted: []
      };
      
      const similarity = changeDetector.computeSimilarity(changes1, changes2);
      expect(similarity).to.equal(100);
    });

    it('should return 0% for completely different changes', () => {
      const changes1 = {
        added: [{ path: 'file1.txt' }],
        modified: [],
        deleted: []
      };
      
      const changes2 = {
        added: [{ path: 'file2.txt' }],
        modified: [],
        deleted: []
      };
      
      const similarity = changeDetector.computeSimilarity(changes1, changes2);
      expect(similarity).to.equal(0);
    });

    it('should return 50% for half-overlapping changes', () => {
      const changes1 = {
        added: [{ path: 'file1.txt' }, { path: 'file2.txt' }],
        modified: [],
        deleted: []
      };
      
      const changes2 = {
        added: [{ path: 'file1.txt' }, { path: 'file3.txt' }],
        modified: [],
        deleted: []
      };
      
      const similarity = changeDetector.computeSimilarity(changes1, changes2);
      expect(similarity).to.equal(33); // 1 intersection / 3 union = 33%
    });
  });

  describe('extractChanges', () => {
    it('should extract only changed files to target directory', async () => {
      // Setup source directory
      await fs.writeFile(path.join(baseDir, 'unchanged.txt'), 'unchanged');
      await fs.writeFile(path.join(baseDir, 'modified.txt'), 'modified content');
      await fs.writeFile(path.join(baseDir, 'added.txt'), 'new content');
      
      const changes = {
        added: [{ path: 'added.txt', hash: 'abc123' }],
        modified: [{ path: 'modified.txt', oldHash: 'def456', newHash: 'ghi789' }],
        deleted: [],
        summary: { filesChanged: 2, linesAdded: 10, linesDeleted: 5, totalFiles: 3 }
      };
      
      const extractDir = path.join(tempDir, 'extracted');
      await changeDetector.extractChanges(baseDir, extractDir, changes);
      
      // Check that only changed files were extracted
      expect(await fs.pathExists(path.join(extractDir, 'added.txt'))).to.be.true;
      expect(await fs.pathExists(path.join(extractDir, 'modified.txt'))).to.be.true;
      expect(await fs.pathExists(path.join(extractDir, 'unchanged.txt'))).to.be.false;
      
      // Check metadata file was created
      expect(await fs.pathExists(path.join(extractDir, 'changes_metadata.json'))).to.be.true;
      
      const metadata = await fs.readJSON(path.join(extractDir, 'changes_metadata.json'));
      expect(metadata.summary.filesChanged).to.equal(2);
      expect(metadata.hash).to.be.a('string');
    });
  });
});
