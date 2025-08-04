/**
 * Repository selection and validation module
 */

const { prompt } = require('../utils/inquirerCompat');
const path = require('path');
const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');

class RepositorySelector {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
  }

  /**
   * Select and validate repository path
   */
  async selectRepository(providedPath) {
    let repositoryPath = providedPath;

    // If no path provided, prompt user
    if (!repositoryPath) {
      const { path: userPath } = await prompt([
        {
          type: 'input',
          name: 'path',
          message: 'Enter the git repository path for benchmarking context:',
          default: process.cwd(),
          validate: async (input) => {
            if (!input || input.trim() === '') {
              return 'Repository path cannot be empty';
            }
            return true;
          }
        }
      ]);
      repositoryPath = userPath;
    }

    // Normalize and validate the path
    repositoryPath = this.fs.getAbsolutePath(repositoryPath.trim());
    
    await this.validateRepository(repositoryPath);
    
    this.logger.success(`Repository selected: ${repositoryPath}`);
    return repositoryPath;
  }

  /**
   * Validate that the path is a valid git repository
   */
  async validateRepository(repositoryPath) {
    // Check if path exists
    if (!(await this.fs.exists(repositoryPath))) {
      throw new Error(`Repository path does not exist: ${repositoryPath}`);
    }

    // Check if it's a directory
    const stats = await this.fs.getStats(repositoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Repository path is not a directory: ${repositoryPath}`);
    }

    // Check if it's a git repository
    if (!(await this.fs.isGitRepository(repositoryPath))) {
      this.logger.warn(`Warning: ${repositoryPath} does not appear to be a git repository`);
      
      const { proceed } = await prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Do you want to proceed anyway?',
          default: false
        }
      ]);

      if (!proceed) {
        throw new Error('Repository validation cancelled by user');
      }
    }

    this.logger.debug(`Repository validation passed: ${repositoryPath}`);
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(repositoryPath) {
    const info = {
      path: repositoryPath,
      name: path.basename(repositoryPath),
      isGitRepo: await this.fs.isGitRepository(repositoryPath)
    };

    this.logger.debug('Repository info:', info);
    return info;
  }
}

module.exports = { RepositorySelector };
