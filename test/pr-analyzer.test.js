/**
 * Tests for PRAnalyzer class
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const fs = require('fs-extra');
const path = require('path');
const { PRAnalyzer } = require('../src/utils/PRAnalyzer');

describe('PRAnalyzer', function() {
  this.timeout(30000);
  
  let prAnalyzer;
  let testDir;
  
  beforeEach(async function() {
    testDir = path.join(__dirname, 'temp-pr-analyzer');
    await fs.ensureDir(testDir);
    
    prAnalyzer = new PRAnalyzer({
      verbose: false,
      quiet: true
    });
  });
  
  afterEach(async function() {
    await fs.remove(testDir);
  });
  
  describe('constructor', function() {
    it('should create PRAnalyzer instance', function() {
      expect(prAnalyzer).to.be.instanceOf(PRAnalyzer);
      expect(prAnalyzer.logger).to.exist;
      expect(prAnalyzer.fs).to.exist;
      expect(prAnalyzer.git).to.exist;
    });
  });
  
  describe('extractPRTitle', function() {
    it('should extract PR title from merge commit subject', function() {
      const testCases = [
        {
          subject: 'Merge pull request #123 from feature/branch: Add new feature',
          expected: 'Add new feature'
        },
        {
          subject: 'Merge pull request #456 from user/fix-bug: Fix critical bug',
          expected: 'Fix critical bug'
        },
        {
          subject: 'Merge pull request #789 from org/repo:feature Update documentation',
          expected: 'Update documentation'
        },
        {
          subject: 'Regular commit message',
          expected: 'Regular commit message'
        }
      ];
      
      testCases.forEach(({ subject, expected }) => {
        const result = prAnalyzer.extractPRTitle(subject);
        expect(result).to.equal(expected);
      });
    });
  });
  
  describe('mapGitStatus', function() {
    it('should map Git status codes correctly', function() {
      const statusMap = {
        'A': 'added',
        'M': 'modified',
        'D': 'deleted',
        'R': 'renamed',
        'C': 'copied',
        'T': 'type-changed',
        'X': 'X'
      };
      
      Object.entries(statusMap).forEach(([status, expected]) => {
        const result = prAnalyzer.mapGitStatus(status);
        expect(result).to.equal(expected);
      });
    });
  });
  
  describe('getMergeCommits', function() {
    it('should handle empty repository gracefully', async function() {
      // Create empty git repository
      const emptyRepo = path.join(testDir, 'empty-repo');
      await fs.ensureDir(emptyRepo);
      
      try {
        await prAnalyzer.git.runGit(['init'], { cwd: emptyRepo });
        const commits = await prAnalyzer.getMergeCommits(emptyRepo, 5);
        expect(commits).to.be.an('array');
        expect(commits).to.have.length(0);
      } catch (error) {
        // Expected for empty repository
        expect(error.message).to.include('does not have any commits yet');
      }
    });
  });
  
  describe('extractPRFromMergeCommit', function() {
    it('should return null for non-PR merge commits', async function() {
      const mockCommit = {
        hash: 'abc123',
        subject: 'Merge branch feature into main',
        date: '2023-01-01T00:00:00Z',
        authorName: 'Test Author',
        authorEmail: 'test@example.com'
      };
      
      const result = await prAnalyzer.extractPRFromMergeCommit('/nonexistent', mockCommit, 1);
      expect(result).to.be.null;
    });
    
    it('should extract PR number from valid merge commit', async function() {
      const mockCommit = {
        hash: 'abc123',
        subject: 'Merge pull request #123 from feature/branch',
        date: '2023-01-01T00:00:00Z',
        authorName: 'Test Author',
        authorEmail: 'test@example.com'
      };
      
      // Mock git commands to avoid actual git operations
      const originalRunGit = prAnalyzer.git.runGit;
      prAnalyzer.git.runGit = async (args) => {
        if (args.includes('show') && args.includes('--pretty=format:%P')) {
          return { stdout: 'parent1 parent2' };
        }
        if (args.includes('show') && args.includes('--pretty=format:%B')) {
          return { stdout: 'Merge pull request #123 from feature/branch\n\nAdd new feature' };
        }
        if (args.includes('diff') && args.includes('--name-status')) {
          return { stdout: 'M\tfile1.js\nA\tfile2.js' };
        }
        if (args.includes('diff') && !args.includes('--name-status')) {
          return { stdout: 'diff --git a/file1.js b/file1.js\n...' };
        }
        return { stdout: '' };
      };
      
      try {
        const result = await prAnalyzer.extractPRFromMergeCommit('/mock-repo', mockCommit, 1);
        
        expect(result).to.not.be.null;
        expect(result.number).to.equal(123);
        expect(result.order).to.equal(1);
        expect(result.title).to.equal('Merge pull request #123 from feature/branch');
        expect(result.author.name).to.equal('Test Author');
        expect(result.author.email).to.equal('test@example.com');
        expect(result.fileChanges).to.be.an('array');
        expect(result.fileChanges).to.have.length(2);
        expect(result.fileChanges[0].status).to.equal('modified');
        expect(result.fileChanges[0].path).to.equal('file1.js');
        expect(result.fileChanges[1].status).to.equal('added');
        expect(result.fileChanges[1].path).to.equal('file2.js');
      } finally {
        prAnalyzer.git.runGit = originalRunGit;
      }
    });
  });
  
  describe('analyzePRs', function() {
    it('should handle repository clone failure gracefully', async function() {
      const invalidRepoUrl = 'https://github.com/nonexistent/repository.git';
      
      try {
        await prAnalyzer.analyzePRs(invalidRepoUrl, 1, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to analyze PRs');
      }
    });
    
    it('should validate input parameters', async function() {
      try {
        await prAnalyzer.analyzePRs('', 0, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
  
  describe('cloneRepositoryWithHistory', function() {
    it('should handle invalid repository URL', async function() {
      const invalidUrl = 'not-a-valid-url';
      const destDir = path.join(testDir, 'clone-test');
      
      try {
        await prAnalyzer.cloneRepositoryWithHistory(invalidUrl, destDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
  
  describe('getPRFileChanges', function() {
    it('should handle git diff failure gracefully', async function() {
      // Mock git to simulate failure
      const originalRunGit = prAnalyzer.git.runGit;
      prAnalyzer.git.runGit = async () => {
        throw new Error('Git command failed');
      };
      
      try {
        const result = await prAnalyzer.getPRFileChanges('/mock-repo', 'commit1', 'commit2');
        expect(result).to.be.an('array');
        expect(result).to.have.length(0);
      } finally {
        prAnalyzer.git.runGit = originalRunGit;
      }
    });
  });
  
  describe('getPRCodeChanges', function() {
    it('should handle git diff failure gracefully', async function() {
      // Mock git to simulate failure
      const originalRunGit = prAnalyzer.git.runGit;
      prAnalyzer.git.runGit = async () => {
        throw new Error('Git command failed');
      };
      
      try {
        const result = await prAnalyzer.getPRCodeChanges('/mock-repo', 'commit1', 'commit2');
        expect(result).to.equal('');
      } finally {
        prAnalyzer.git.runGit = originalRunGit;
      }
    });
  });
  
  describe('integration', function() {
    it('should handle complete workflow with mocked git operations', async function() {
      // Mock all git operations for integration test
      const originalRunGit = prAnalyzer.git.runGit;
      prAnalyzer.git.runGit = async (args, opts) => {
        if (args.includes('clone')) {
          // Simulate successful clone
          const destDir = args[args.length - 1];
          await fs.ensureDir(destDir);
          return { stdout: '' };
        }
        if (args.includes('log') && args.includes('--merges')) {
          return { 
            stdout: 'abc123|Merge pull request #123 from feature/branch|2023-01-01T00:00:00Z|Test Author|test@example.com\n' +
                   'def456|Merge pull request #124 from another/branch|2023-01-02T00:00:00Z|Another Author|another@example.com'
          };
        }
        if (args.includes('show') && args.includes('--pretty=format:%P')) {
          return { stdout: 'parent1 parent2' };
        }
        if (args.includes('show') && args.includes('--pretty=format:%B')) {
          return { stdout: 'Merge pull request #123\n\nAdd new feature' };
        }
        if (args.includes('diff')) {
          return { stdout: 'M\tfile1.js' };
        }
        return { stdout: '' };
      };
      
      try {
        const result = await prAnalyzer.analyzePRs('https://github.com/test/repo.git', 2, testDir);
        
        expect(result).to.be.an('array');
        expect(result).to.have.length(2);
        expect(result[0].number).to.equal(123);
        expect(result[1].number).to.equal(124);
        // Should be sorted chronologically (oldest first)
        expect(new Date(result[0].mergedAt)).to.be.lessThan(new Date(result[1].mergedAt));
      } finally {
        prAnalyzer.git.runGit = originalRunGit;
      }
    });
  });
});
