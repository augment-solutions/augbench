/**
 * Adapter for Augment CLI AI assistant
 */

const { spawn } = require('child_process');
const path = require('path');
const { BaseAdapter } = require('./BaseAdapter');

class AugmentCLIAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('Augment CLI', options);
    this.command = options.command || 'auggie';
    this.args = options.args || [];
  }

  /**
   * Execute Augment CLI with the given prompt and repository context
   * 
   * @param {string} promptFile - Path to the prompt file
   * @param {string} repositoryPath - Path to the repository for context
   * @returns {Promise<string>} - Augment CLI's output
   */
  async execute(promptFile, repositoryPath) {
    await this.validateRepository(repositoryPath);
    // Read once for validation/logging and compute absolute path for CLI
    await this.readPrompt(promptFile);
    const promptPath = this.fs.getAbsolutePath(promptFile);

    return this.executeWithRetry(async () => {
      return this.executeWithTimeout(
        this.runAugmentCLI(promptPath, repositoryPath)
      );
    }, 'Augment CLI execution');
  }

  /**
   * Run Augment CLI command
   * 
   * @param {string} promptContent - The prompt content
   * @param {string} repositoryPath - Path to the repository
   * @returns {Promise<string>} - Command output
   */
  async runAugmentCLI(promptPath, repositoryPath) {
    return new Promise((resolve, reject) => {
      const args = [
        ...this.args,
        '--workspace-root', repositoryPath,
        '--instruction-file', promptPath,
        '--print'
      ];
      
      this.logger.debug(`Executing: ${this.command} ${args.join(' ')}`);
      
      const child = spawn(this.command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.debug(`Augment CLI completed successfully`);
          resolve(stdout.trim());
        } else {
          const error = new Error(`Augment CLI exited with code ${code}: ${stderr}`);
          this.logger.error(error.message);
          reject(error);
        }
      });
      
      child.on('error', (error) => {
        this.logger.error(`Augment CLI process error: ${error.message}`);
        reject(new Error(`Failed to start Augment CLI: ${error.message}`));
      });
      
      // Using --instruction-file, no need to write to stdin
    });
  }

  /**
   * Check if Augment CLI is available
   * 
   * @returns {Promise<boolean>} - Whether Augment CLI is available
   */
  async isAvailable() {
    try {
      await this.executeWithTimeout(
        this.runCommand([this.command, '--version']),
        10000 // 10 second timeout for availability check
      );
      return true;
    } catch (error) {
      this.logger.debug(`Augment CLI not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Augment CLI version
   * 
   * @returns {Promise<string>} - Version information
   */
  async getVersion() {
    try {
      const output = await this.runCommand([this.command, '--version']);
      return output.trim();
    } catch (error) {
      throw new Error(`Failed to get Augment CLI version: ${error.message}`);
    }
  }

  /**
   * Run a command and return its output
   * 
   * @param {string[]} command - Command and arguments
   * @returns {Promise<string>} - Command output
   */
  async runCommand(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command;
      
      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to run command: ${error.message}`));
      });
    });
  }

  /**
   * Get Augment CLI specific configuration
   * 
   * @returns {Object} - Configuration object
   */
  getConfiguration() {
    return {
      command: this.command,
      args: this.args,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }
}

module.exports = { AugmentCLIAdapter };
