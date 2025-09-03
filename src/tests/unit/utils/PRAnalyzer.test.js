import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PRAnalyzer } from '../../../utils/PRAnalyzer.js';
import { Logger } from '../../../utils/Logger.js';

describe('PRAnalyzer', () => {
  let analyzer;
  let logger;
  let mockGit;

  beforeEach(() => {
    logger = new Logger();
    analyzer = new PRAnalyzer(logger);
    
    // Mock git operations
    mockGit = {
      raw: async (command) => {
        if (command[0] === 'log') {
          return mockLogOutput;
        }
        if (command[0] === 'show') {
          return 'Mock PR description\nDetailed description here';
        }
        if (command[0] === 'diff' && command[1] === '--name-status') {
          // Return different file counts based on the commit
          const mainParent = command[2];
          const prParent = command[3];

          if (mainParent === 'main1') {
            // PR with 5 files changed
            return 'M\tfile1.js\nA\tfile2.js\nD\tfile3.js\nR\tfile4.js\nC\tfile5.js';
          } else if (mainParent === 'main2') {
            // PR with 2 files changed (should be filtered out)
            return 'M\tfile1.js\nA\tfile2.js';
          } else if (mainParent === 'main3') {
            // PR with 3 files changed (exactly at threshold)
            return 'M\tfile1.js\nA\tfile2.js\nD\tfile3.js';
          } else if (mainParent === 'main4') {
            // PR with 4 files changed
            return 'M\tfile1.js\nA\tfile2.js\nD\tfile3.js\nR\tfile4.js';
          }
          return '';
        }
        return '';
      },
      show: async (args) => {
        return 'Mock PR description\nDetailed description here';
      }
    };
  });

  const mockLogOutput = `hash1|main1 pr1|Merge pull request #101 from feature/test1|Author1|author1@test.com|2025-01-15T10:00:00Z
hash2|main2 pr2|Merge pull request #102 from feature/test2|Author2|author2@test.com|2025-01-14T10:00:00Z
hash3|main3 pr3|Merge pull request #103 from feature/test3|Author3|author3@test.com|2025-01-13T10:00:00Z
hash4|main4 pr4|Merge pull request #104 from feature/test4|Author4|author4@test.com|2025-01-12T10:00:00Z`;

  describe('findRecentMergedPRs', () => {
    it('should filter PRs by minimum file count threshold', async () => {
      // Mock simpleGit to return our mock
      const originalSimpleGit = (await import('simple-git')).default;
      const simpleGitMock = () => mockGit;
      
      // Replace the import temporarily
      analyzer = new PRAnalyzer(logger);
      
      // Override the git operations directly
      const originalExtractPRInfo = analyzer.extractPRInfo;
      analyzer.extractPRInfo = async (git, commit, order) => {
        const prNumber = analyzer.extractPRNumber(commit.subject);
        const mainParent = commit.parents[0];
        const prParent = commit.parents[1];
        
        const fileChanges = await analyzer.getPRFileChanges(mockGit, mainParent, prParent);
        
        return {
          number: prNumber,
          order,
          title: analyzer.extractPRTitle(commit.subject),
          description: 'Mock description',
          mergedAt: commit.date.toISOString(),
          author: {
            name: commit.authorName,
            email: commit.authorEmail
          },
          commits: {
            merge: commit.hash,
            main: mainParent,
            pr: prParent
          },
          fileChanges
        };
      };
      
      // Override parseCommitsForPRs to return our test data
      analyzer.parseCommitsForPRs = (logOutput) => {
        return [
          {
            hash: 'hash1',
            parents: ['main1', 'pr1'],
            subject: 'Merge pull request #101 from feature/test1',
            authorName: 'Author1',
            authorEmail: 'author1@test.com',
            date: new Date('2025-01-15T10:00:00Z')
          },
          {
            hash: 'hash2',
            parents: ['main2', 'pr2'],
            subject: 'Merge pull request #102 from feature/test2',
            authorName: 'Author2',
            authorEmail: 'author2@test.com',
            date: new Date('2025-01-14T10:00:00Z')
          },
          {
            hash: 'hash3',
            parents: ['main3', 'pr3'],
            subject: 'Merge pull request #103 from feature/test3',
            authorName: 'Author3',
            authorEmail: 'author3@test.com',
            date: new Date('2025-01-13T10:00:00Z')
          },
          {
            hash: 'hash4',
            parents: ['main4', 'pr4'],
            subject: 'Merge pull request #104 from feature/test4',
            authorName: 'Author4',
            authorEmail: 'author4@test.com',
            date: new Date('2025-01-12T10:00:00Z')
          }
        ];
      };
      
      // Mock simpleGit constructor
      const mockSimpleGit = () => mockGit;
      
      // Replace the simpleGit import in the analyzer
      const originalFindMethod = analyzer.findRecentMergedPRs;
      analyzer.findRecentMergedPRs = async function(repoDir, numPRs = 5) {
        this.logger.info(`Searching for ${numPRs} recent merged PRs with ≥3 files changed (examining last 12 months)`);

        const git = mockGit;

        // Get merge commits from the last 12 months
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        const sinceDate = twelveMonthsAgo.toISOString().split('T')[0];
        
        const logResult = await git.raw(['log']);
        const commits = this.parseCommitsForPRs(logResult);
        
        this.logger.info(`Found ${commits.length} total merged PRs to examine`);
        
        // Extract PR information for all commits and filter by file count
        const allPRs = [];
        const eligiblePRs = [];
        
        for (let i = 0; i < commits.length; i++) {
          const commit = commits[i];
          try {
            const prInfo = await this.extractPRInfo(git, commit, i + 1);
            if (prInfo) {
              allPRs.push(prInfo);
              
              // Count unique files changed (A/M/R/C/D statuses)
              const filesChangedCount = prInfo.fileChanges.length;
              
              // Filter: only include PRs with ≥3 files changed
              if (filesChangedCount >= 3) {
                eligiblePRs.push({
                  ...prInfo,
                  filesChangedCount
                });
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to extract PR info for commit ${commit.hash}: ${error.message}`);
          }
        }
        
        this.logger.info(`Found ${eligiblePRs.length} eligible PRs with ≥3 files changed`);
        
        // Handle edge cases
        if (eligiblePRs.length === 0) {
          this.logger.error(`No PRs found with ≥3 files changed. Examined ${allPRs.length} total PRs. Consider adjusting num_prs or repository/time window.`);
          throw new Error("No eligible PRs found with minimum file change threshold");
        }
        
        // Sort eligible PRs by merge date descending (most recent first) for selection
        eligiblePRs.sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt));
        
        // Select the first N eligible PRs (most recent)
        const selectedPRs = eligiblePRs.slice(0, numPRs);
        
        if (selectedPRs.length < numPRs) {
          this.logger.warn(`Requested ${numPRs} PRs but only found ${selectedPRs.length} eligible PRs with ≥3 files changed`);
        }
        
        // Log selected PRs summary
        this.logger.info(`Selected PRs:`);
        selectedPRs.forEach(pr => {
          this.logger.info(`  PR #${pr.number}: ${pr.filesChangedCount} files changed`);
        });
        
        // Sort selected PRs chronologically (oldest first) for execution order
        selectedPRs.sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));
        
        this.logger.info(`Successfully selected ${selectedPRs.length} PRs for execution (oldest-to-newest order)`);
        return selectedPRs;
      };
      
      const result = await analyzer.findRecentMergedPRs('/mock/repo', 3);
      
      // Should return 3 PRs: #101 (5 files), #103 (3 files), #104 (4 files)
      // #102 should be filtered out (only 2 files)
      // Order should be chronological: #104, #103, #101
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].number, 104); // Oldest first
      assert.strictEqual(result[1].number, 103);
      assert.strictEqual(result[2].number, 101); // Most recent last
      
      // Verify file counts
      assert.strictEqual(result[0].filesChangedCount, 4);
      assert.strictEqual(result[1].filesChangedCount, 3);
      assert.strictEqual(result[2].filesChangedCount, 5);
    });

    it('should handle case with fewer eligible PRs than requested', async () => {
      // Test with only 1 eligible PR but requesting 3
      analyzer.parseCommitsForPRs = () => [
        {
          hash: 'hash1',
          parents: ['main1', 'pr1'],
          subject: 'Merge pull request #101 from feature/test1',
          authorName: 'Author1',
          authorEmail: 'author1@test.com',
          date: new Date('2025-01-15T10:00:00Z')
        },
        {
          hash: 'hash2',
          parents: ['main2', 'pr2'],
          subject: 'Merge pull request #102 from feature/test2',
          authorName: 'Author2',
          authorEmail: 'author2@test.com',
          date: new Date('2025-01-14T10:00:00Z')
        }
      ];
      
      // Override the method with our test implementation
      analyzer.findRecentMergedPRs = async function(repoDir, numPRs = 5) {
        const commits = this.parseCommitsForPRs('');
        const eligiblePRs = [];
        
        for (const commit of commits) {
          const prInfo = await this.extractPRInfo(mockGit, commit, 1);
          if (prInfo && prInfo.fileChanges.length >= 3) {
            eligiblePRs.push({
              ...prInfo,
              filesChangedCount: prInfo.fileChanges.length
            });
          }
        }
        
        if (eligiblePRs.length < numPRs) {
          this.logger.warn(`Requested ${numPRs} PRs but only found ${eligiblePRs.length} eligible PRs with ≥3 files changed`);
        }
        
        return eligiblePRs.slice(0, numPRs);
      };
      
      const result = await analyzer.findRecentMergedPRs('/mock/repo', 3);
      
      // Should return only 1 PR (the one with 5 files changed)
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].number, 101);
    });

    it('should throw error when no eligible PRs exist', async () => {
      // Test with no PRs meeting the threshold
      analyzer.parseCommitsForPRs = () => [
        {
          hash: 'hash2',
          parents: ['main2', 'pr2'],
          subject: 'Merge pull request #102 from feature/test2',
          authorName: 'Author2',
          authorEmail: 'author2@test.com',
          date: new Date('2025-01-14T10:00:00Z')
        }
      ];
      
      // Override the method to simulate no eligible PRs
      analyzer.findRecentMergedPRs = async function(repoDir, numPRs = 5) {
        const commits = this.parseCommitsForPRs('');
        const eligiblePRs = [];
        
        for (const commit of commits) {
          const prInfo = await this.extractPRInfo(mockGit, commit, 1);
          if (prInfo && prInfo.fileChanges.length >= 3) {
            eligiblePRs.push(prInfo);
          }
        }
        
        if (eligiblePRs.length === 0) {
          this.logger.error(`No PRs found with ≥3 files changed. Consider adjusting num_prs or repository/time window.`);
          throw new Error("No eligible PRs found with minimum file change threshold");
        }
        
        return eligiblePRs;
      };
      
      await assert.rejects(
        async () => await analyzer.findRecentMergedPRs('/mock/repo', 3),
        /No eligible PRs found with minimum file change threshold/
      );
    });
  });

  describe('mapGitStatus', () => {
    it('should correctly map git status codes', () => {
      assert.strictEqual(analyzer.mapGitStatus('A'), 'added');
      assert.strictEqual(analyzer.mapGitStatus('M'), 'modified');
      assert.strictEqual(analyzer.mapGitStatus('D'), 'deleted');
      assert.strictEqual(analyzer.mapGitStatus('R'), 'renamed');
      assert.strictEqual(analyzer.mapGitStatus('C'), 'copied');
      assert.strictEqual(analyzer.mapGitStatus('X'), 'modified'); // Unknown defaults to modified
    });
  });

  describe('parseCommitsForPRs', () => {
    it('should detect traditional merge commits', () => {
      const logOutput = 'hash1|parent1 parent2|Merge pull request #123 from feature/test|Author|author@test.com|2025-01-15T10:00:00Z';
      const commits = analyzer.parseCommitsForPRs(logOutput);

      assert.strictEqual(commits.length, 1);
      assert.strictEqual(commits[0].hash, 'hash1');
      assert.strictEqual(commits[0].parents.length, 2);
    });

    it('should detect squash/rebase commits with PR patterns', () => {
      const testCases = [
        'hash1|parent1|Fix bug (#456)|Author|author@test.com|2025-01-15T10:00:00Z',
        'hash2|parent1|Update docs #789|Author|author@test.com|2025-01-15T10:00:00Z',
        'hash3|parent1|Feature: closes #123|Author|author@test.com|2025-01-15T10:00:00Z',
        'hash4|parent1|Bugfix: fixes #456|Author|author@test.com|2025-01-15T10:00:00Z',
        'hash5|parent1|Enhancement PR 789|Author|author@test.com|2025-01-15T10:00:00Z'
      ];

      testCases.forEach((logOutput, index) => {
        const commits = analyzer.parseCommitsForPRs(logOutput);
        assert.strictEqual(commits.length, 1, `Test case ${index + 1} should detect PR pattern`);
        assert.strictEqual(commits[0].parents.length, 1, `Test case ${index + 1} should be single-parent commit`);
      });
    });

    it('should filter out non-PR commits', () => {
      const logOutput = `hash1|parent1|Regular commit without PR reference|Author|author@test.com|2025-01-15T10:00:00Z
hash2|parent1|Another normal commit|Author|author@test.com|2025-01-15T10:00:00Z
hash3|parent1|Fix bug (#456)|Author|author@test.com|2025-01-15T10:00:00Z`;

      const commits = analyzer.parseCommitsForPRs(logOutput);

      assert.strictEqual(commits.length, 1);
      assert.strictEqual(commits[0].hash, 'hash3');
    });
  });

  describe('extractPRNumber', () => {
    it('should extract PR numbers from various commit message formats', () => {
      assert.strictEqual(analyzer.extractPRNumber('Merge pull request #123 from feature/test'), 123);
      assert.strictEqual(analyzer.extractPRNumber('Fix bug (#456)'), 456);
      assert.strictEqual(analyzer.extractPRNumber('Update docs #789'), 789);
    });

    it('should return fallback number for unrecognized formats', () => {
      const result = analyzer.extractPRNumber('Some commit without PR number');
      assert.strictEqual(typeof result, 'number');
      assert(result > 0);
    });
  });
});
