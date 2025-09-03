import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DiffMetric } from '../../../metrics/DiffMetric.js';

// Mock the Process module
const mockRun = (command, options) => {
  if (command === 'git rev-parse --is-inside-work-tree') {
    return { ok: true, stdout: 'true' };
  }
  if (command === 'git diff --name-status') {
    return { 
      ok: true, 
      stdout: 'M\tfile1.js\nA\tfile2.js\nD\tfile3.js\n' 
    };
  }
  if (command === 'git diff --numstat') {
    return { 
      ok: true, 
      stdout: '10\t5\tfile1.js\n20\t0\tfile2.js\n0\t15\tfile3.js\n' 
    };
  }
  if (command === 'git ls-files --others --exclude-standard') {
    return { 
      ok: true, 
      stdout: 'untracked1.js\nuntracked2.js\n' 
    };
  }
  return { ok: false, stdout: '', stderr: 'Command not found' };
};

describe('DiffMetric', () => {
  let metric;

  beforeEach(() => {
    metric = new DiffMetric();
    // Mock the run function
    metric.constructor.prototype.run = mockRun;
  });

  it('should return zero metrics when no cwd provided', async () => {
    const result = await metric.measure({});
    
    assert.deepStrictEqual(result, {
      files_added: 0,
      files_modified: 0,
      files_deleted: 0,
      lines_added: 0,
      lines_modified: 0,
      lines_deleted: 0
    });
  });

  it('should return zero metrics when not in git repository', async () => {
    const mockRunNotGit = () => ({ ok: false, stdout: '', stderr: 'Not a git repository' });
    metric.constructor.prototype.run = mockRunNotGit;
    
    const result = await metric.measure({ cwd: '/tmp' });
    
    assert.deepStrictEqual(result, {
      files_added: 0,
      files_modified: 0,
      files_deleted: 0,
      lines_added: 0,
      lines_modified: 0,
      lines_deleted: 0
    });
  });

  it('should count tracked changes and untracked files', async () => {
    // Override run function for this test
    const testRun = (command) => {
      if (command === 'git rev-parse --is-inside-work-tree') {
        return { ok: true, stdout: 'true' };
      }
      if (command === 'git diff --name-status') {
        return { ok: true, stdout: 'M\tfile1.js\nA\tfile2.js\nD\tfile3.js\n' };
      }
      if (command === 'git diff --numstat') {
        return { ok: true, stdout: '10\t5\tfile1.js\n20\t0\tfile2.js\n0\t15\tfile3.js\n' };
      }
      if (command === 'git ls-files --others --exclude-standard') {
        return { ok: true, stdout: 'untracked1.js\nuntracked2.js\n' };
      }
      return { ok: false };
    };
    
    metric.constructor.prototype.run = testRun;
    
    const result = await metric.measure({ cwd: '/test/repo' });
    
    assert.strictEqual(result.files_added, 3); // 1 tracked + 2 untracked
    assert.strictEqual(result.files_modified, 1);
    assert.strictEqual(result.files_deleted, 1);
    assert.strictEqual(result.lines_added, 30); // 10 + 20 + 0
    assert.strictEqual(result.lines_deleted, 20); // 5 + 0 + 15
    assert.strictEqual(result.lines_modified, 0);
  });

  it('should handle binary files correctly', async () => {
    const testRun = (command) => {
      if (command === 'git rev-parse --is-inside-work-tree') {
        return { ok: true, stdout: 'true' };
      }
      if (command === 'git diff --name-status') {
        return { ok: true, stdout: 'M\tfile1.js\nM\tbinary.png\n' };
      }
      if (command === 'git diff --numstat') {
        // Binary files show as "-" in numstat
        return { ok: true, stdout: '10\t5\tfile1.js\n-\t-\tbinary.png\n' };
      }
      if (command === 'git ls-files --others --exclude-standard') {
        return { ok: true, stdout: '' };
      }
      return { ok: false };
    };
    
    metric.constructor.prototype.run = testRun;
    
    const result = await metric.measure({ cwd: '/test/repo' });
    
    assert.strictEqual(result.files_modified, 2);
    assert.strictEqual(result.lines_added, 10); // Only text file counted
    assert.strictEqual(result.lines_deleted, 5); // Only text file counted
  });
});
