/**
 * PR Staging Manager - Manages directory structure for PR recreation mode
 */

const path = require('path');
const fs = require('fs-extra');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');
const { GitManager } = require('./GitManager');
const { PRChangeManager } = require('./PRChangeManager');

class PRStagingManager {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.git = new GitManager(options);
    this.prChangeManager = new PRChangeManager(options);
  }

  /**
   * Setup directory structure for PR recreation mode
   * @param {string} stagingDir - Base staging directory
   * @param {Array} assistants - List of assistant names
   * @param {Array} prs - Array of PR metadata
   * @returns {Promise<Object>} - Directory structure information
   */
  async setupPRDirectories(stagingDir, assistants, prs) {
    this.logger.info('Setting up PR recreation directory structure...');
    
    const structure = {
      base: stagingDir,
      human: path.join(stagingDir, 'human'),
      agents: {},
      prompts: path.join(stagingDir, 'prompts'),
      baseRepo: path.join(stagingDir, 'base_repo')
    };

    // Create base directories
    await this.fs.ensureDir(structure.human);
    await this.fs.ensureDir(structure.prompts);
    await this.fs.ensureDir(structure.baseRepo);

    // Create agent directories
    for (const assistant of assistants) {
      const agentSlug = this.agentSlug(assistant);
      structure.agents[assistant] = path.join(stagingDir, 'agents', agentSlug);
      await this.fs.ensureDir(structure.agents[assistant]);
      
      // Create subdirectories for each PR
      for (const pr of prs) {
        const prDir = path.join(structure.agents[assistant], `pr_${pr.order}_${pr.number}`);
        await this.fs.ensureDir(prDir);
      }
    }

    this.logger.success('PR recreation directory structure created');
    return structure;
  }

  /**
   * Prepare human reference code for each PR (stores only incremental changes)
   * @param {string} repoUrl - Repository URL
   * @param {Array} prs - Array of PR metadata
   * @param {Object} structure - Directory structure
   * @returns {Promise<void>}
   */
  async prepareHumanReference(repoUrl, prs, structure) {
    this.logger.info('Preparing human reference code for each PR...');

    // Clone repository to temporary location
    const tempRepo = path.join(structure.base, 'temp_repo');
    await this.cloneRepository(repoUrl, tempRepo);

    try {
      for (const pr of prs) {
        this.logger.debug(`Preparing human reference for PR ${pr.number}`);

        // Checkout the merge commit to get the final state
        await this.git.runGit(['-C', tempRepo, 'checkout', pr.commits.merge]);

        // Create human reference directory for this PR
        const humanPRDir = path.join(structure.human, `pr_${pr.order}_${pr.number}`);
        await this.fs.ensureDir(humanPRDir);

        // Store only the incremental changes for this PR
        await this.prChangeManager.storeIncrementalChanges(
          structure.baseRepo,
          tempRepo,
          humanPRDir,
          pr
        );

        this.logger.debug(`Stored incremental human changes for PR ${pr.number}`);
      }
    } finally {
      // Clean up temporary repository
      if (await this.fs.exists(tempRepo)) {
        await fs.remove(tempRepo);
      }
    }

    this.logger.success('Human reference code prepared');
  }

  /**
   * Prepare base repository state (before all PRs)
   * @param {string} repoUrl - Repository URL
   * @param {Array} prs - Array of PR metadata (sorted chronologically)
   * @param {Object} structure - Directory structure
   * @returns {Promise<void>}
   */
  async prepareBaseRepository(repoUrl, prs, structure) {
    this.logger.info('Preparing base repository state...');
    
    if (prs.length === 0) {
      throw new Error('No PRs provided for base repository preparation');
    }

    // Clone repository
    await this.cloneRepository(repoUrl, structure.baseRepo);

    // Get the main parent of the first (oldest) PR to establish base state
    const firstPR = prs[0];
    const baseCommit = firstPR.commits.main;
    
    this.logger.debug(`Setting base repository to commit: ${baseCommit}`);
    await this.git.runGit(['-C', structure.baseRepo, 'checkout', baseCommit]);

    // Remove .git directory to prevent confusion
    const gitDir = path.join(structure.baseRepo, '.git');
    if (await this.fs.exists(gitDir)) {
      await fs.remove(gitDir);
    }

    this.logger.success('Base repository state prepared');
  }

  /**
   * Prepare agent working directories with base repository state
   * @param {Array} assistants - List of assistant names
   * @param {Object} structure - Directory structure
   * @returns {Promise<void>}
   */
  async prepareAgentWorkingDirectories(assistants, structure) {
    this.logger.info('Preparing agent working directories...');

    for (const assistant of assistants) {
      const agentBaseDir = path.join(structure.agents[assistant], 'base');
      await this.fs.ensureDir(agentBaseDir);
      
      // Copy base repository state to agent's base directory
      await fs.copy(structure.baseRepo, agentBaseDir, {
        dereference: true
      });
      
      this.logger.debug(`Prepared base working directory for ${assistant}`);
    }

    this.logger.success('Agent working directories prepared');
  }

  /**
   * Update agent's incremental code after successful PR completion
   * @param {string} assistant - Assistant name
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @param {string} agentOutputPath - Path to agent's successful output
   * @returns {Promise<Object>} - Change summary and metadata
   */
  async updateAgentIncrementalCode(assistant, pr, structure, agentOutputPath) {
    this.logger.debug(`Updating incremental code for ${assistant} after PR ${pr.number}`);

    const agentBaseDir = path.join(structure.agents[assistant], 'base');
    const agentPRDir = path.join(structure.agents[assistant], `pr_${pr.order}_${pr.number}`);

    if (!await this.fs.exists(agentOutputPath)) {
      this.logger.warn(`Agent output path not found: ${agentOutputPath}`);
      return null;
    }

    // Store only the incremental changes in the PR directory
    const changeResult = await this.prChangeManager.storeIncrementalChanges(
      agentBaseDir,
      agentOutputPath,
      agentPRDir,
      pr
    );

    // Apply the changes to the base directory for the next PR
    await this.prChangeManager.applyIncrementalChanges(agentBaseDir, agentPRDir);

    this.logger.debug(`Updated base code for ${assistant} with PR ${pr.number} changes`);

    return changeResult;
  }

  /**
   * Clone repository with authentication
   * @param {string} repoUrl - Repository URL
   * @param {string} destDir - Destination directory
   * @returns {Promise<void>}
   */
  async cloneRepository(repoUrl, destDir) {
    const token = process.env.GH_TOKEN || process.env.GIT_TOKEN;
    const args = [];
    
    if (token) {
      args.push('-c', `http.extraHeader=Authorization: Bearer ${token}`);
    }
    
    args.push('clone', repoUrl, destDir);
    
    await this.git.runGit(args);
  }

  /**
   * Create agent slug from name
   * @param {string} name - Assistant name
   * @returns {string} - Slugified name
   */
  agentSlug(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9\-_]+/g, '-');
  }

  /**
   * Get agent working directory for a specific PR
   * @param {string} assistant - Assistant name
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @returns {string} - Working directory path
   */
  getAgentPRWorkingDir(assistant, pr, structure) {
    return path.join(structure.agents[assistant], `pr_${pr.order}_${pr.number}`);
  }

  /**
   * Get agent base directory
   * @param {string} assistant - Assistant name
   * @param {Object} structure - Directory structure
   * @returns {string} - Base directory path
   */
  getAgentBaseDir(assistant, structure) {
    return path.join(structure.agents[assistant], 'base');
  }

  /**
   * Get human reference directory for a specific PR
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @returns {string} - Human reference directory path
   */
  getHumanReferenceDir(pr, structure) {
    return path.join(structure.human, `pr_${pr.order}_${pr.number}`);
  }

  /**
   * Get prompt file path for a specific PR
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @returns {string} - Prompt file path
   */
  getPromptPath(pr, structure) {
    return path.join(structure.prompts, `pr_${pr.order}_${pr.number}.md`);
  }

  /**
   * Compare human and agent changes for a PR
   * @param {string} assistant - Assistant name
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @returns {Promise<Object>} - Comparison results
   */
  async compareHumanAndAgentChanges(assistant, pr, structure) {
    const humanPRDir = this.getHumanReferenceDir(pr, structure);
    const agentPRDir = this.getAgentPRWorkingDir(assistant, pr, structure);

    return await this.prChangeManager.compareChanges(
      humanPRDir,
      agentPRDir,
      structure.baseRepo
    );
  }

  /**
   * Generate console output for PR run
   * @param {string} assistant - Assistant name
   * @param {Object} pr - PR metadata
   * @param {number} runNumber - Current run number
   * @param {number} totalRuns - Total number of runs
   * @param {Object} comparison - Comparison results
   * @returns {string} - Formatted console output
   */
  generateConsoleOutput(assistant, pr, runNumber, totalRuns, comparison) {
    return this.prChangeManager.formatConsoleOutput(
      assistant,
      pr,
      runNumber,
      totalRuns,
      comparison
    );
  }

  /**
   * Get human changes for a PR
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @returns {Promise<Object>} - Human changes with hash
   */
  async getHumanChanges(pr, structure) {
    const humanPRDir = this.getHumanReferenceDir(pr, structure);
    return await this.prChangeManager.getHumanChanges(humanPRDir, structure.baseRepo);
  }

  /**
   * Clean up staging directories
   * @param {Object} structure - Directory structure
   * @returns {Promise<void>}
   */
  async cleanup(structure) {
    this.logger.info('Cleaning up PR staging directories...');
    
    if (await this.fs.exists(structure.base)) {
      await fs.remove(structure.base);
    }
    
    this.logger.success('PR staging directories cleaned up');
  }
}

module.exports = { PRStagingManager };
