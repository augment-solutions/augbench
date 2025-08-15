/**
 * PRChangeManager - Manages PR-specific change operations and comparisons
 */

const path = require('path');
const fs = require('fs-extra');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');
const { ChangeDetector } = require('./ChangeDetector');

class PRChangeManager {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.changeDetector = new ChangeDetector(options);
  }

  /**
   * Store only the incremental changes for a PR
   * @param {string} baseDir - Base directory (before changes)
   * @param {string} agentOutputDir - Agent's output directory (after changes)
   * @param {string} prChangesDir - Directory to store only the changes
   * @param {Object} prInfo - PR information
   * @returns {Promise<Object>} - Change summary and metadata
   */
  async storeIncrementalChanges(baseDir, agentOutputDir, prChangesDir, prInfo) {
    this.logger.debug(`Storing incremental changes for PR ${prInfo.number}`);
    
    // Compute changes between base and agent output
    const changes = await this.changeDetector.computeChanges(baseDir, agentOutputDir);
    
    // Extract only the changed files to the PR directory
    await this.changeDetector.extractChanges(agentOutputDir, prChangesDir, changes);
    
    // Generate change hash
    const changeHash = this.changeDetector.generateChangesHash(changes);
    
    // Store PR-specific metadata
    const metadata = {
      pr: prInfo,
      timestamp: new Date().toISOString(),
      changeHash,
      changes,
      summary: this.formatChangeSummary(changes)
    };
    
    const metadataPath = path.join(prChangesDir, 'pr_changes_metadata.json');
    await this.fs.writeJSON(metadataPath, metadata, { indent: 2 });
    
    this.logger.debug(`Stored ${changes.summary.filesChanged} changed files for PR ${prInfo.number}`);
    
    return {
      changeHash,
      changes,
      summary: changes.summary,
      metadata
    };
  }

  /**
   * Apply incremental changes to a base directory
   * @param {string} baseDir - Base directory to apply changes to
   * @param {string} prChangesDir - Directory containing the changes
   * @returns {Promise<void>}
   */
  async applyIncrementalChanges(baseDir, prChangesDir) {
    this.logger.debug(`Applying incremental changes from ${prChangesDir} to ${baseDir}`);
    
    // Read metadata to understand what changes to apply
    const metadataPath = path.join(prChangesDir, 'pr_changes_metadata.json');
    if (!await this.fs.exists(metadataPath)) {
      throw new Error(`No metadata found in ${prChangesDir}`);
    }
    
    const metadata = await this.fs.readJSON(metadataPath);
    const changes = metadata.changes;
    
    // Apply added and modified files
    const filesToApply = [...changes.added, ...changes.modified];
    
    for (const file of filesToApply) {
      const sourcePath = path.join(prChangesDir, file.path);
      const targetPath = path.join(baseDir, file.path);
      
      if (await this.fs.exists(sourcePath)) {
        await this.fs.ensureDir(path.dirname(targetPath));
        await fs.copy(sourcePath, targetPath, { overwrite: true });
      }
    }
    
    // Handle deleted files
    for (const file of changes.deleted) {
      const targetPath = path.join(baseDir, file.path);
      if (await this.fs.exists(targetPath)) {
        await fs.remove(targetPath);
      }
    }
    
    this.logger.debug(`Applied ${filesToApply.length} file changes and ${changes.deleted.length} deletions`);
  }

  /**
   * Compare human and agent changes for a PR
   * @param {string} humanPRDir - Human reference directory
   * @param {string} agentPRDir - Agent changes directory
   * @param {string} baseDir - Base directory (before any changes)
   * @returns {Promise<Object>} - Comparison results
   */
  async compareChanges(humanPRDir, agentPRDir, baseDir) {
    this.logger.debug('Comparing human and agent changes');
    
    // Compute human changes
    const humanChanges = await this.changeDetector.computeChanges(baseDir, humanPRDir);
    const humanHash = this.changeDetector.generateChangesHash(humanChanges);
    
    // Read agent changes metadata
    const agentMetadataPath = path.join(agentPRDir, 'pr_changes_metadata.json');
    let agentChanges, agentHash;
    
    if (await this.fs.exists(agentMetadataPath)) {
      const agentMetadata = await this.fs.readJSON(agentMetadataPath);
      agentChanges = agentMetadata.changes;
      agentHash = agentMetadata.changeHash;
    } else {
      // Fallback: compute agent changes if metadata doesn't exist
      agentChanges = await this.changeDetector.computeChanges(baseDir, agentPRDir);
      agentHash = this.changeDetector.generateChangesHash(agentChanges);
    }
    
    // Compute similarity
    const similarity = this.changeDetector.computeSimilarity(humanChanges, agentChanges);
    
    return {
      human: {
        hash: humanHash,
        changes: humanChanges,
        summary: this.formatChangeSummary(humanChanges)
      },
      agent: {
        hash: agentHash,
        changes: agentChanges,
        summary: this.formatChangeSummary(agentChanges)
      },
      similarity,
      comparison: {
        exactMatch: humanHash === agentHash,
        similarityPercentage: similarity
      }
    };
  }

  /**
   * Format change summary for display
   * @param {Object} changes - Changes object
   * @returns {string} - Formatted summary
   */
  formatChangeSummary(changes) {
    const summary = changes.summary || {};
    const parts = [];

    if (summary.filesChanged > 0) {
      parts.push(`files: ${summary.filesChanged}`);
    }

    if (summary.linesAdded > 0 || summary.linesDeleted > 0) {
      parts.push(`+${summary.linesAdded || 0}/-${summary.linesDeleted || 0} lines`);
    }

    return parts.join(', ') || 'no changes';
  }

  /**
   * Generate console output for PR run
   * @param {string} assistantName - Assistant name
   * @param {Object} prInfo - PR information
   * @param {number} runNumber - Current run number
   * @param {number} totalRuns - Total number of runs
   * @param {Object} comparison - Comparison results from compareChanges
   * @returns {string} - Formatted console output
   */
  formatConsoleOutput(assistantName, prInfo, runNumber, totalRuns, comparison) {
    const lines = [];
    
    lines.push(`[PR ${prInfo.order} - ${assistantName} - Run ${runNumber}/${totalRuns}]`);
    lines.push(`├─ Human changes: ${comparison.human.hash} (${comparison.human.summary})`);
    lines.push(`├─ ${assistantName} changes: ${comparison.agent.hash} (${comparison.agent.summary})`);
    lines.push(`├─ Hash comparison: ${comparison.similarity}% similarity`);
    
    // Add diff summary for top changed files
    const agentChanges = comparison.agent.changes;
    const topChanges = [...agentChanges.added, ...agentChanges.modified]
      .slice(0, 3) // Show top 3 changes
      .map(file => {
        if (file.linesAdded !== undefined) {
          return `${file.path} (+${file.linesAdded}/-${file.linesDeleted || 0})`;
        } else {
          return `${file.path} (new)`;
        }
      });
    
    if (topChanges.length > 0) {
      lines.push(`└─ Diff summary: ${topChanges.join(', ')}`);
    } else {
      lines.push(`└─ Diff summary: no changes detected`);
    }
    
    return lines.join('\n');
  }

  /**
   * Get human changes for a PR
   * @param {string} humanPRDir - Human reference directory
   * @param {string} baseDir - Base directory
   * @returns {Promise<Object>} - Human changes with hash
   */
  async getHumanChanges(humanPRDir, baseDir) {
    const changes = await this.changeDetector.computeChanges(baseDir, humanPRDir);
    const hash = this.changeDetector.generateChangesHash(changes);
    
    return {
      hash,
      changes,
      summary: this.formatChangeSummary(changes)
    };
  }

  /**
   * Validate that a PR changes directory contains valid incremental changes
   * @param {string} prChangesDir - PR changes directory
   * @returns {Promise<boolean>} - True if valid
   */
  async validatePRChanges(prChangesDir) {
    try {
      const metadataPath = path.join(prChangesDir, 'pr_changes_metadata.json');
      if (!await this.fs.exists(metadataPath)) {
        return false;
      }

      const metadata = await this.fs.readJSON(metadataPath);
      return !!(metadata.changes && metadata.changeHash && metadata.pr);
    } catch (error) {
      this.logger.warn(`Failed to validate PR changes: ${error.message}`);
      return false;
    }
  }

  /**
   * Clean up temporary files and ensure directory structure
   * @param {string} prChangesDir - PR changes directory
   * @returns {Promise<void>}
   */
  async cleanupPRChanges(prChangesDir) {
    // Remove any temporary files that might have been created
    const tempFiles = ['changes_metadata.json']; // Keep only pr_changes_metadata.json
    
    for (const tempFile of tempFiles) {
      const tempPath = path.join(prChangesDir, tempFile);
      if (await this.fs.exists(tempPath)) {
        await fs.remove(tempPath);
      }
    }
  }
}

module.exports = { PRChangeManager };
