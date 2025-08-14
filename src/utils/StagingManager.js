/**
 * StagingManager - manages per-assistant working directories
 */

const path = require('path');
const fs = require('fs-extra');
const { FileSystem } = require('./FileSystem');
const { Logger } = require('./Logger');
const { GitManager } = require('./GitManager');

class StagingManager {
  constructor(options = {}) {
    this.options = options;
    this.fs = new FileSystem(options);
    this.logger = new Logger(options);
    this.git = new GitManager(options);
  }

  agentSlug(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9\-_]+/g, '-');
  }

  getAgentDir(stageDir, assistantName) {
    const slug = this.agentSlug(assistantName);
    return path.join(this.fs.getAbsolutePath(stageDir || './stage'), slug);
  }

  async ensureOutputDir(agentDir, runId) {
    const outDir = path.join(agentDir, 'augbench_output', String(runId || '')); // caller may pass undefined
    await fs.ensureDir(path.dirname(outDir));
    return path.join(agentDir, 'augbench_output');
  }

  async prepareForAssistant(assistantName, { repo_url, repo_path, stage_dir = './stage', branch, ref, tokenEnv } = {}) {
    const agentDir = this.getAgentDir(stage_dir, assistantName);

    if (await this.fs.exists(agentDir)) {
      const msg = `Staging directory already exists for agent '${assistantName}' at ${agentDir}. Delete it or change --stage-dir. Exiting per clean-state policy.`;
      this.logger.warn(msg);
      throw new Error(msg);
    }

    await this.fs.ensureDir(path.dirname(agentDir));

    if (repo_url) {
      const token = process.env[tokenEnv || 'GH_TOKEN'] || process.env.GIT_TOKEN;
      this.logger.info(`Cloning ${repo_url} into ${agentDir}${branch ? ` (branch: ${branch})` : ''}${ref ? ` (ref: ${ref})` : ''}`);
      await this.git.clone(repo_url, agentDir, { branch, token });
      if (ref) await this.git.checkoutRef(agentDir, ref);
    } else if (repo_path) {
      const absSrc = this.fs.getAbsolutePath(repo_path);
      this.logger.info(`Copying from ${absSrc} into ${agentDir}`);
      await fs.copy(absSrc, agentDir, { dereference: true, filter: (src) => !/\.git(\/|$)/.test(src) });
    } else {
      throw new Error('prepareForAssistant requires repo_url or repo_path');
    }

    // Output artifacts directory (parent)
    await fs.ensureDir(path.join(agentDir, 'augbench_output'));

    return agentDir;
  }
}

module.exports = { StagingManager };

