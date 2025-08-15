/**
 * PR Analyzer - Analyzes Git repositories to extract PR information for recreation
 */

const path = require('path');
const fs = require('fs-extra');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');
const { GitManager } = require('./GitManager');

class PRAnalyzer {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.git = new GitManager(options);
  }

  /**
   * Analyze repository and extract recent merged PRs
   * @param {string} repoUrl - Repository URL to analyze
   * @param {number} numPRs - Number of recent PRs to extract
   * @param {string} stagingDir - Directory to clone repository
   * @returns {Promise<Array>} - Array of PR metadata objects
   */
  async analyzePRs(repoUrl, numPRs, stagingDir) {
    this.logger.info(`Analyzing ${numPRs} recent PRs from ${repoUrl}`);
    
    // Create staging directory
    const repoDir = path.join(stagingDir, 'pr_analysis_repo');
    await this.fs.ensureDir(path.dirname(repoDir));
    
    // Clean up existing directory if it exists
    if (await this.fs.exists(repoDir)) {
      await fs.remove(repoDir);
    }

    try {
      // Clone repository with full history
      await this.cloneRepositoryWithHistory(repoUrl, repoDir);
      
      // Extract PR information
      const prs = await this.extractPRInformation(repoDir, numPRs);
      
      // Sort PRs chronologically (oldest first)
      prs.sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));
      
      this.logger.success(`Successfully analyzed ${prs.length} PRs`);
      return prs;
      
    } catch (error) {
      this.logger.error(`Failed to analyze PRs: ${error.message}`);
      throw error;
    } finally {
      // Clean up cloned repository
      if (await this.fs.exists(repoDir)) {
        await fs.remove(repoDir);
      }
    }
  }

  /**
   * Clone repository with full history for PR analysis
   * @param {string} repoUrl - Repository URL
   * @param {string} repoDir - Local directory to clone to
   */
  async cloneRepositoryWithHistory(repoUrl, repoDir) {
    this.logger.info(`Cloning repository with full history: ${repoUrl}`);
    
    const token = process.env.GH_TOKEN || process.env.GIT_TOKEN;
    const args = [];
    
    if (token) {
      args.push('-c', `http.extraHeader=Authorization: Bearer ${token}`);
    }
    
    args.push('clone', repoUrl, repoDir);
    
    await this.git.runGit(args);
    this.logger.debug(`Repository cloned to: ${repoDir}`);
  }

  /**
   * Extract PR information from Git history
   * @param {string} repoDir - Repository directory
   * @param {number} numPRs - Number of PRs to extract
   * @returns {Promise<Array>} - Array of PR objects
   */
  async extractPRInformation(repoDir, numPRs) {
    this.logger.info(`Extracting PR information from Git history`);
    
    // Get merge commits (PRs are typically merged via merge commits)
    const mergeCommits = await this.getMergeCommits(repoDir, numPRs * 2); // Get extra to filter
    
    const prs = [];
    let prOrder = 1;
    
    for (const commit of mergeCommits) {
      if (prs.length >= numPRs) break;
      
      try {
        const prInfo = await this.extractPRFromMergeCommit(repoDir, commit, prOrder);
        if (prInfo) {
          prs.push(prInfo);
          prOrder++;
        }
      } catch (error) {
        this.logger.warn(`Failed to extract PR info from commit ${commit.hash}: ${error.message}`);
      }
    }
    
    return prs;
  }

  /**
   * Get merge commits from Git history
   * @param {string} repoDir - Repository directory
   * @param {number} limit - Maximum number of commits to retrieve
   * @returns {Promise<Array>} - Array of merge commit objects
   */
  async getMergeCommits(repoDir, limit) {
    const { stdout } = await this.git.runGit([
      '-C', repoDir,
      'log',
      '--merges',
      '--pretty=format:%H|%s|%ai|%an|%ae',
      `-n`, String(limit),
      '--first-parent'
    ]);
    
    return stdout.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [hash, subject, date, authorName, authorEmail] = line.split('|');
        return {
          hash,
          subject,
          date,
          authorName,
          authorEmail
        };
      });
  }

  /**
   * Extract PR information from a merge commit
   * @param {string} repoDir - Repository directory
   * @param {Object} commit - Merge commit object
   * @param {number} order - PR order number
   * @returns {Promise<Object|null>} - PR information object or null if not a valid PR
   */
  async extractPRFromMergeCommit(repoDir, commit, order) {
    // Extract PR number from commit message (GitHub format: "Merge pull request #123")
    const prMatch = commit.subject.match(/Merge pull request #(\d+)/i);
    if (!prMatch) {
      return null; // Not a PR merge commit
    }
    
    const prNumber = parseInt(prMatch[1]);
    
    // Get the parent commits to find the PR branch
    const { stdout: parents } = await this.git.runGit([
      '-C', repoDir,
      'show',
      '--pretty=format:%P',
      '-s',
      commit.hash
    ]);
    
    const parentHashes = parents.trim().split(' ');
    if (parentHashes.length < 2) {
      return null; // Not a merge commit
    }
    
    const mainParent = parentHashes[0];
    const prParent = parentHashes[1];
    
    // Get PR description from commit body
    const { stdout: commitBody } = await this.git.runGit([
      '-C', repoDir,
      'show',
      '--pretty=format:%B',
      '-s',
      commit.hash
    ]);
    
    // Extract description (everything after the first line)
    const lines = commitBody.split('\n');
    const description = lines.slice(1).join('\n').trim() || commit.subject;
    
    // Get file changes in the PR
    const fileChanges = await this.getPRFileChanges(repoDir, mainParent, prParent);
    
    // Get the actual code changes
    const codeChanges = await this.getPRCodeChanges(repoDir, mainParent, commit.hash);
    
    return {
      number: prNumber,
      order,
      title: this.extractPRTitle(commit.subject),
      description,
      mergedAt: commit.date,
      author: {
        name: commit.authorName,
        email: commit.authorEmail
      },
      commits: {
        merge: commit.hash,
        main: mainParent,
        pr: prParent
      },
      fileChanges,
      codeChanges
    };
  }

  /**
   * Extract PR title from commit subject
   * @param {string} subject - Commit subject
   * @returns {string} - Extracted PR title
   */
  extractPRTitle(subject) {
    // Remove "Merge pull request #123 from branch" and extract title
    const match = subject.match(/Merge pull request #\d+ from [^:]+:?\s*(.+)/i);
    return match ? match[1].trim() : subject;
  }

  /**
   * Get file changes in the PR
   * @param {string} repoDir - Repository directory
   * @param {string} mainParent - Main branch parent commit
   * @param {string} prParent - PR branch parent commit
   * @returns {Promise<Array>} - Array of changed files
   */
  async getPRFileChanges(repoDir, mainParent, prParent) {
    try {
      const { stdout } = await this.git.runGit([
        '-C', repoDir,
        'diff',
        '--name-status',
        mainParent,
        prParent
      ]);
      
      return stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [status, ...pathParts] = line.split('\t');
          const filePath = pathParts.join('\t');
          return {
            status: this.mapGitStatus(status),
            path: filePath
          };
        });
    } catch (error) {
      this.logger.warn(`Failed to get file changes: ${error.message}`);
      return [];
    }
  }

  /**
   * Get the actual code changes in the PR
   * @param {string} repoDir - Repository directory
   * @param {string} mainParent - Main branch parent commit
   * @param {string} mergeCommit - Merge commit hash
   * @returns {Promise<string>} - Diff content
   */
  async getPRCodeChanges(repoDir, mainParent, mergeCommit) {
    try {
      const { stdout } = await this.git.runGit([
        '-C', repoDir,
        'diff',
        mainParent,
        mergeCommit
      ]);
      
      return stdout;
    } catch (error) {
      this.logger.warn(`Failed to get code changes: ${error.message}`);
      return '';
    }
  }

  /**
   * Map Git status codes to readable format
   * @param {string} status - Git status code
   * @returns {string} - Readable status
   */
  mapGitStatus(status) {
    const statusMap = {
      'A': 'added',
      'M': 'modified',
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied',
      'T': 'type-changed'
    };
    
    return statusMap[status] || status;
  }
}

module.exports = { PRAnalyzer };
