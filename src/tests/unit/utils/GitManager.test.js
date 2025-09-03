import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GitManager } from '../../../utils/GitManager.js';

describe('GitManager', () => {
  describe('versionOk', () => {
    it('should validate git version correctly', async () => {
      const result = await GitManager.versionOk('2.30.0');
      
      assert(typeof result === 'object', 'Result should be an object');
      assert(typeof result.ok === 'boolean', 'Result should have ok boolean');
      
      if (result.ok) {
        assert(typeof result.version === 'string', 'Result should have version string');
        assert(result.version.match(/^\d+\.\d+\.\d+/), 'Version should match semver pattern');
      } else {
        assert(typeof result.message === 'string', 'Result should have error message');
      }
    });

    it('should reject versions below minimum', async () => {
      // Test with a very high minimum version that should fail
      const result = await GitManager.versionOk('99.0.0');
      
      assert.strictEqual(result.ok, false, 'Should reject version below minimum');
    });
  });

  describe('_semverGte', () => {
    it('should compare semantic versions correctly', () => {
      // Test equal versions
      assert(GitManager._semverGte('2.30.0', '2.30.0'), '2.30.0 should be >= 2.30.0');
      
      // Test greater major version
      assert(GitManager._semverGte('3.0.0', '2.30.0'), '3.0.0 should be >= 2.30.0');
      
      // Test greater minor version
      assert(GitManager._semverGte('2.31.0', '2.30.0'), '2.31.0 should be >= 2.30.0');
      
      // Test greater patch version
      assert(GitManager._semverGte('2.30.1', '2.30.0'), '2.30.1 should be >= 2.30.0');
      
      // Test lesser version
      assert(!GitManager._semverGte('2.29.0', '2.30.0'), '2.29.0 should not be >= 2.30.0');
      assert(!GitManager._semverGte('1.30.0', '2.30.0'), '1.30.0 should not be >= 2.30.0');
      assert(!GitManager._semverGte('2.30.0', '2.30.1'), '2.30.0 should not be >= 2.30.1');
    });
  });

  describe('remoteBranchExists', () => {
    it('should handle invalid repository URLs gracefully', async () => {
      const exists = await GitManager.remoteBranchExists('https://invalid-repo-url.git', 'main');
      
      assert.strictEqual(exists, false, 'Should return false for invalid repository');
    });
  });

  describe('repoHasBranch', () => {
    it('should handle invalid repository paths gracefully', async () => {
      const exists = await GitManager.repoHasBranch('/invalid/path', 'main');
      
      assert.strictEqual(exists, false, 'Should return false for invalid repository path');
    });
  });

  describe('getCurrentCommit', () => {
    it('should handle invalid repository paths gracefully', async () => {
      try {
        await GitManager.getCurrentCommit('/invalid/path');
        assert.fail('Should throw error for invalid repository path');
      } catch (error) {
        assert(error instanceof Error, 'Should throw an Error');
      }
    });
  });

  describe('getDiffBetweenCommits', () => {
    it('should handle invalid repository paths gracefully', async () => {
      try {
        await GitManager.getDiffBetweenCommits('/invalid/path', 'commit1', 'commit2');
        assert.fail('Should throw error for invalid repository path');
      } catch (error) {
        assert(error instanceof Error, 'Should throw an Error');
      }
    });

    it('should handle options correctly', async () => {
      try {
        await GitManager.getDiffBetweenCommits('/invalid/path', 'commit1', 'commit2', {
          nameOnly: true,
          nameStatus: true,
          numstat: true
        });
        assert.fail('Should throw error for invalid repository path');
      } catch (error) {
        assert(error instanceof Error, 'Should throw an Error');
      }
    });
  });
});
