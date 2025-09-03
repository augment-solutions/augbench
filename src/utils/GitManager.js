import simpleGit from "simple-git";
import fs from "fs";
import { run } from "./Process.js";

export class GitManager {
  static async versionOk(min = "2.30.0") {
    const res = await run("git --version");
    if (!res.ok) return { ok: false, message: "git not found" };
    const m = res.stdout.match(/git version (\d+\.\d+\.\d+)/);
    if (!m) return { ok: false, message: `unexpected git version output: ${res.stdout}` };
    return { ok: GitManager._semverGte(m[1], min), version: m[1] };
  }

  static async remoteBranchExists(url, branch) {
    const res = await run(`git ls-remote --heads ${url} ${branch}`);
    return !!(res.ok && res.stdout && res.stdout.includes("refs/heads/" + branch));
  }

  static async repoHasBranch(path, branch) {
    try {
      // Check if directory exists first
      if (!fs.existsSync(path)) {
        return false;
      }

      const git = simpleGit({ baseDir: path });
      const branches = await git.branch(["-a"]);
      return !!branches.all.find(b => b.endsWith("/" + branch) || b === branch);
    } catch {
      return false;
    }
  }

  static _semverGte(a, b) {
    const pa = a.split(".").map(n => parseInt(n, 10));
    const pb = b.split(".").map(n => parseInt(n, 10));
    for (let i = 0; i < 3; i++) {
      if (pa[i] > pb[i]) return true;
      if (pa[i] < pb[i]) return false;
    }
    return true;
  }

  static async createWorktree(repoPath, worktreePath, commitish) {
    const git = simpleGit({ baseDir: repoPath });
    await git.raw(['worktree', 'add', worktreePath, commitish]);
    return worktreePath;
  }

  static async removeWorktree(repoPath, worktreePath) {
    const git = simpleGit({ baseDir: repoPath });
    try {
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
    } catch (error) {
      // Worktree might not exist, ignore error
    }
  }

  static async listWorktrees(repoPath) {
    const git = simpleGit({ baseDir: repoPath });
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    return result.trim().split('\n\n').map(block => {
      const lines = block.split('\n');
      const worktree = { path: '', head: '', branch: '' };

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktree.path = line.substring(9);
        } else if (line.startsWith('HEAD ')) {
          worktree.head = line.substring(5);
        } else if (line.startsWith('branch ')) {
          worktree.branch = line.substring(7);
        }
      }

      return worktree;
    });
  }

  static async cherryPick(repoPath, commitish) {
    const git = simpleGit({ baseDir: repoPath });
    try {
      await git.raw(['cherry-pick', commitish]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async createBranch(repoPath, branchName, startPoint = null) {
    const git = simpleGit({ baseDir: repoPath });
    const args = ['checkout', '-b', branchName];
    if (startPoint) args.push(startPoint);
    await git.raw(args);
  }

  static async switchBranch(repoPath, branchName) {
    const git = simpleGit({ baseDir: repoPath });
    await git.checkout(branchName);
  }

  static async getCurrentCommit(repoPath) {
    const git = simpleGit({ baseDir: repoPath });
    const result = await git.raw(['rev-parse', 'HEAD']);
    return result.trim();
  }

  static async getDiffBetweenCommits(repoPath, commit1, commit2, options = {}) {
    const git = simpleGit({ baseDir: repoPath });
    const args = ['diff'];

    if (options.nameOnly) args.push('--name-only');
    if (options.nameStatus) args.push('--name-status');
    if (options.numstat) args.push('--numstat');

    args.push(commit1, commit2);

    const result = await git.raw(args);
    return result.trim();
  }
}

