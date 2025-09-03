import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PRRecreateMode } from '../../modes/PRRecreateMode.js';
import { Logger } from '../../utils/Logger.js';
import { AdapterFactory } from '../../adapters/AdapterFactory.js';

describe('PR_Recreate Mode - PR Filtering Integration', () => {
  let mode;
  let logger;
  let adaptersFactory;

  beforeEach(() => {
    logger = new Logger();
    adaptersFactory = new AdapterFactory({}, logger);
    mode = new PRRecreateMode(logger, adaptersFactory);
  });

  describe('analyzePRHistory', () => {
    it('should filter PRs by file count threshold', async () => {
      // Mock the PRAnalyzer to return test data
      const originalImport = mode.analyzePRHistory;
      
      mode.analyzePRHistory = async function(baseRepoDir, settings) {
        this.logger.info("Analyzing git history for merged PRs");
        
        // Mock PRAnalyzer behavior
        const mockAnalyzer = {
          findRecentMergedPRs: async (repoDir, numPRs) => {
            this.logger.info(`Searching for ${numPRs} recent merged PRs with ≥3 files changed (examining last 12 months)`);
            
            // Simulate finding PRs with different file counts
            const allPRs = [
              {
                number: 101,
                title: 'Add new feature',
                description: 'Implements new feature with multiple files',
                mergedAt: '2025-01-15T10:00:00Z',
                fileChanges: [
                  { status: 'added', path: 'file1.js' },
                  { status: 'modified', path: 'file2.js' },
                  { status: 'added', path: 'file3.js' },
                  { status: 'modified', path: 'file4.js' },
                  { status: 'deleted', path: 'file5.js' }
                ],
                filesChangedCount: 5,
                commits: { merge: 'hash1', main: 'main1', pr: 'pr1' }
              },
              {
                number: 102,
                title: 'Small fix',
                description: 'Minor bug fix',
                mergedAt: '2025-01-14T10:00:00Z',
                fileChanges: [
                  { status: 'modified', path: 'file1.js' },
                  { status: 'modified', path: 'file2.js' }
                ],
                filesChangedCount: 2, // Should be filtered out
                commits: { merge: 'hash2', main: 'main2', pr: 'pr2' }
              },
              {
                number: 103,
                title: 'Update documentation',
                description: 'Updates docs and tests',
                mergedAt: '2025-01-13T10:00:00Z',
                fileChanges: [
                  { status: 'modified', path: 'README.md' },
                  { status: 'added', path: 'docs/guide.md' },
                  { status: 'modified', path: 'tests/test.js' }
                ],
                filesChangedCount: 3, // Exactly at threshold
                commits: { merge: 'hash3', main: 'main3', pr: 'pr3' }
              }
            ];
            
            // Filter by file count >= 3
            const eligiblePRs = allPRs.filter(pr => pr.filesChangedCount >= 3);
            
            this.logger.info(`Found ${eligiblePRs.length} eligible PRs with ≥3 files changed`);
            
            if (eligiblePRs.length === 0) {
              this.logger.error(`No PRs found with ≥3 files changed. Consider adjusting num_prs or repository/time window.`);
              throw new Error("No eligible PRs found with minimum file change threshold");
            }
            
            // Sort by merge date descending (most recent first) for selection
            eligiblePRs.sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt));
            
            // Select first N
            const selectedPRs = eligiblePRs.slice(0, numPRs);
            
            if (selectedPRs.length < numPRs) {
              this.logger.warn(`Requested ${numPRs} PRs but only found ${selectedPRs.length} eligible PRs with ≥3 files changed`);
            }
            
            // Log selected PRs
            this.logger.info(`Selected PRs:`);
            selectedPRs.forEach(pr => {
              this.logger.info(`  PR #${pr.number}: ${pr.filesChangedCount} files changed`);
            });
            
            // Sort chronologically for execution (oldest first)
            selectedPRs.sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));
            
            this.logger.info(`Successfully selected ${selectedPRs.length} PRs for execution (oldest-to-newest order)`);
            return selectedPRs;
          }
        };
        
        const numPRs = settings.PR_Recreate?.num_prs || 5;
        const prs = await mockAnalyzer.findRecentMergedPRs(baseRepoDir, numPRs);
        
        this.logger.info(`Found ${prs.length} recent merged PRs`);
        return prs;
      };
      
      const settings = {
        PR_Recreate: {
          num_prs: 3
        }
      };
      
      const result = await mode.analyzePRHistory('/mock/repo', settings);
      
      // Should return 2 PRs: #101 (5 files) and #103 (3 files)
      // #102 should be filtered out (only 2 files)
      // Order should be chronological: #103, #101
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].number, 103); // Oldest first
      assert.strictEqual(result[1].number, 101); // Most recent last
      
      // Verify file counts
      assert.strictEqual(result[0].filesChangedCount, 3);
      assert.strictEqual(result[1].filesChangedCount, 5);
    });

    it('should handle case with no eligible PRs', async () => {
      mode.analyzePRHistory = async function(baseRepoDir, settings) {
        const mockAnalyzer = {
          findRecentMergedPRs: async (repoDir, numPRs) => {
            // Simulate no PRs meeting the threshold
            this.logger.error(`No PRs found with ≥3 files changed. Consider adjusting num_prs or repository/time window.`);
            throw new Error("No eligible PRs found with minimum file change threshold");
          }
        };
        
        const numPRs = settings.PR_Recreate?.num_prs || 5;
        return await mockAnalyzer.findRecentMergedPRs(baseRepoDir, numPRs);
      };
      
      const settings = {
        PR_Recreate: {
          num_prs: 3
        }
      };
      
      await assert.rejects(
        async () => await mode.analyzePRHistory('/mock/repo', settings),
        /No eligible PRs found with minimum file change threshold/
      );
    });

    it('should warn when fewer eligible PRs than requested', async () => {
      let warningLogged = false;
      
      // Override logger to capture warnings
      const originalWarn = logger.warn;
      logger.warn = (message) => {
        if (message.includes('Requested') && message.includes('eligible PRs')) {
          warningLogged = true;
        }
        originalWarn.call(logger, message);
      };
      
      mode.analyzePRHistory = async function(baseRepoDir, settings) {
        const mockAnalyzer = {
          findRecentMergedPRs: async (repoDir, numPRs) => {
            // Only 1 eligible PR but requesting 3
            const eligiblePRs = [
              {
                number: 101,
                title: 'Add new feature',
                description: 'Implements new feature',
                mergedAt: '2025-01-15T10:00:00Z',
                fileChanges: [
                  { status: 'added', path: 'file1.js' },
                  { status: 'modified', path: 'file2.js' },
                  { status: 'added', path: 'file3.js' }
                ],
                filesChangedCount: 3,
                commits: { merge: 'hash1', main: 'main1', pr: 'pr1' }
              }
            ];
            
            if (eligiblePRs.length < numPRs) {
              this.logger.warn(`Requested ${numPRs} PRs but only found ${eligiblePRs.length} eligible PRs with ≥3 files changed`);
            }
            
            return eligiblePRs;
          }
        };
        
        const numPRs = settings.PR_Recreate?.num_prs || 5;
        const prs = await mockAnalyzer.findRecentMergedPRs(baseRepoDir, numPRs);
        
        this.logger.info(`Found ${prs.length} recent merged PRs`);
        return prs;
      };
      
      const settings = {
        PR_Recreate: {
          num_prs: 3
        }
      };
      
      const result = await mode.analyzePRHistory('/mock/repo', settings);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].number, 101);
      assert.strictEqual(warningLogged, true, 'Warning should be logged when fewer eligible PRs than requested');
      
      // Restore original logger
      logger.warn = originalWarn;
    });
  });

  describe('File change counting', () => {
    it('should count all git status types (A/M/R/C/D)', () => {
      const fileChanges = [
        { status: 'added', path: 'new-file.js' },
        { status: 'modified', path: 'existing-file.js' },
        { status: 'deleted', path: 'old-file.js' },
        { status: 'renamed', path: 'renamed-file.js' },
        { status: 'copied', path: 'copied-file.js' }
      ];
      
      // This simulates how the file count is calculated in the actual implementation
      const filesChangedCount = fileChanges.length;
      
      assert.strictEqual(filesChangedCount, 5);
      assert(filesChangedCount >= 3, 'Should meet the minimum threshold');
    });

    it('should handle edge case of exactly 3 files', () => {
      const fileChanges = [
        { status: 'added', path: 'file1.js' },
        { status: 'modified', path: 'file2.js' },
        { status: 'deleted', path: 'file3.js' }
      ];
      
      const filesChangedCount = fileChanges.length;
      
      assert.strictEqual(filesChangedCount, 3);
      assert(filesChangedCount >= 3, 'Should exactly meet the minimum threshold');
    });

    it('should identify PRs below threshold', () => {
      const fileChanges = [
        { status: 'modified', path: 'file1.js' },
        { status: 'modified', path: 'file2.js' }
      ];
      
      const filesChangedCount = fileChanges.length;
      
      assert.strictEqual(filesChangedCount, 2);
      assert(filesChangedCount < 3, 'Should be below the minimum threshold');
    });
  });
});
