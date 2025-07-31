/**
 * File system utilities for cross-platform file operations
 */

const fs = require('fs-extra');
const path = require('path');
const { Logger } = require('./Logger');

class FileSystem {
  constructor(options = {}) {
    this.logger = new Logger(options);
  }

  /**
   * Check if a file exists
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a JSON file and parse it
   */
  async readJSON(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to read JSON file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Write data to a JSON file
   */
  async writeJSON(filePath, data, options = {}) {
    try {
      const jsonString = JSON.stringify(data, null, options.indent || 2);
      await fs.writeFile(filePath, jsonString, 'utf8');
      this.logger.debug(`Written JSON to ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to write JSON file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Read a text file
   */
  async readText(filePath) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Write text to a file
   */
  async writeText(filePath, content) {
    try {
      await fs.writeFile(filePath, content, 'utf8');
      this.logger.debug(`Written text to ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Ensure a directory exists
   */
  async ensureDir(dirPath) {
    try {
      await fs.ensureDir(dirPath);
      this.logger.debug(`Ensured directory exists: ${dirPath}`);
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Get absolute path, handling cross-platform differences
   */
  getAbsolutePath(inputPath) {
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    return path.resolve(process.cwd(), inputPath);
  }

  /**
   * Validate that a path is a valid git repository
   */
  async isGitRepository(repoPath) {
    const gitPath = path.join(repoPath, '.git');
    return await this.exists(gitPath);
  }

  /**
   * Get file stats
   */
  async getStats(filePath) {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      throw new Error(`Failed to get stats for ${filePath}: ${error.message}`);
    }
  }
}

module.exports = { FileSystem };
