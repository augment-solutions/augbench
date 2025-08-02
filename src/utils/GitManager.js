/**
 * GitManager - helper for Git operations and connectivity checks
 */

const { spawn } = require('child_process');
const path = require('path');
const { Logger } = require('./Logger');

class GitManager {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
  }

  runGit(args, opts = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...opts,
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code === 0) resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
        else reject(new Error(stderr || `git ${args.join(' ')} exited with ${code}`));
      });
      proc.on('error', (err) => reject(err));
    });
  }

  async getVersion() {
    const { stdout } = await this.runGit(['--version']);
    // Example: git version 2.42.0
    return stdout.trim();
  }

  async ensureMinVersion(min = '2.30.0') {
    const v = await this.getVersion();
    const match = v.match(/git\s+version\s+(\d+)\.(\d+)\.(\d+)/i);
    if (!match) throw new Error(`Unable to parse git version: ${v}`);
    const cur = match.slice(1, 4).map((n) => parseInt(n, 10));
    const minParts = min.split('.').map((n) => parseInt(n, 10));
    const ok = (cur[0] > minParts[0]) || (cur[0] === minParts[0] && cur[1] > minParts[1]) || (cur[0] === minParts[0] && cur[1] === minParts[1] && cur[2] >= minParts[2]);
    if (!ok) throw new Error(`Git version ${v} is below required minimum ${min}`);
    return v;
  }

  /**
   * Test remote connectivity with ls-remote
   * For HTTPS, you can pass a token to add Authorization header without leaking via URL.
   */
  async testConnectivity(url, token) {
    const args = token ? ['-c', `http.extraHeader=Authorization: Bearer ${token}`, 'ls-remote', '--heads', '--tags', url] : ['ls-remote', '--heads', '--tags', url];
    try {
      await this.runGit(args);
      return true;
    } catch (e) {
      this.logger.debug(`Git connectivity failed for ${url}: ${e.message}`);
      return false;
    }
  }

  /**
   * Clone a remote repository
   */
  async clone(url, dest, { branch, token } = {}) {
    const args = [];
    if (token) args.push('-c', `http.extraHeader=Authorization: Bearer ${token}`);
    args.push('clone');
    if (branch) args.push('--branch', branch);
    args.push('--depth', '1');
    args.push(url, dest);
    await this.runGit(args);
  }

  /**
   * Checkout a specific ref (commit or tag) in a repository
   */
  async checkoutRef(dest, ref) {
    if (!ref) return;
    await this.runGit(['-C', dest, 'fetch', '--depth', '1', 'origin', ref]).catch(() => {});
    await this.runGit(['-C', dest, 'checkout', '--detach', ref]);
  }
}

module.exports = { GitManager };

