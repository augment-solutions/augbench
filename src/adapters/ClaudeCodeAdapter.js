/**
 * Adapter for Claude Code AI assistant
 */

const { spawn } = require('child_process');
const path = require('path');
const { BaseAdapter } = require('./BaseAdapter');

class ClaudeCodeAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('Claude Code', options);
    this.command = options.command || 'claude';
    this.args = options.args || [];
  }

  /**
   * Execute Claude Code with the given prompt and repository context
   * 
   * @param {string} promptFile - Path to the prompt file
   * @param {string} repositoryPath - Path to the repository for context
   * @returns {Promise<string>} - Claude Code's output
   */
  async execute(promptFile, repositoryPath) {
    await this.validateRepository(repositoryPath);
    const promptContent = await this.readPrompt(promptFile);
    
    return this.executeWithRetry(async () => {
      return this.executeWithTimeout(
        this.runClaudeCode(promptContent, repositoryPath)
      );
    }, 'Claude Code execution');
  }

  /**
   * Run Claude Code command
   * 
   * @param {string} promptContent - The prompt content
   * @param {string} repositoryPath - Path to the repository
   * @returns {Promise<string>} - Command output
   */
  async runClaudeCode(promptContent, repositoryPath) {
    return new Promise((resolve, reject) => {
      const args = [
        ...this.args,
        '--context', repositoryPath,
        '--prompt', promptContent
      ];
      
      this.logger.debug(`Executing: ${this.command} ${args.join(' ')}`);
      
      const process = spawn(this.command, args, {
        cwd: repositoryPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          this.logger.debug(`Claude Code completed successfully`);
          resolve(stdout.trim());
        } else {
          const error = new Error(`Claude Code exited with code ${code}: ${stderr}`);
          this.logger.error(error.message);
          reject(error);
        }
      });
      
      process.on('error', (error) => {
        this.logger.error(`Claude Code process error: ${error.message}`);
        reject(new Error(`Failed to start Claude Code: ${error.message}`));
      });
      
      // Send prompt to stdin if needed
      if (process.stdin.writable) {
        process.stdin.write(promptContent);
        process.stdin.end();
      }
    });
  }

  /**
   * Check if Claude Code is available
   * 
   * @returns {Promise<boolean>} - Whether Claude Code is available
   */
  async isAvailable() {
    try {
      await this.executeWithTimeout(
        this.runCommand([this.command, '--version']),
        10000 // 10 second timeout for availability check
      );
      return true;
    } catch (error) {
      this.logger.debug(`Claude Code not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Claude Code version
   * 
   * @returns {Promise<string>} - Version information
   */
  async getVersion() {
    try {
      const output = await this.runCommand([this.command, '--version']);
      return output.trim();
    } catch (error) {
      throw new Error(`Failed to get Claude Code version: ${error.message}`);
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
      
      const process = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(new Error(`Failed to run command: ${error.message}`));
      });
    });
  }

  /**
   * Get Claude Code specific configuration
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

module.exports = { ClaudeCodeAdapter };
