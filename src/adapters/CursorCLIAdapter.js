/**
 * Adapter for Cursor CLI AI assistant
 */

const { spawn } = require('child_process');
const path = require('path');
const { BaseAdapter } = require('./BaseAdapter');

class CursorCLIAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('Cursor CLI', options);
    this.command = options.command || 'cursor-agent';
    this.args = options.args || [];
    this.model = options.model || null; // Allow model specification
    this.outputFormat = options.outputFormat || 'text'; // text or json
  }

  /**
   * Execute Cursor CLI with the given prompt and repository context
   * 
   * @param {string} promptFile - Path to the prompt file
   * @param {string} repositoryPath - Path to the repository for context
   * @returns {Promise<string>} - Cursor CLI's output
   */
  async execute(promptFile, repositoryPath) {
    await this.validateRepository(repositoryPath);
    const promptContent = await this.readPrompt(promptFile);

    return this.executeWithRetry(async () => {
      return this.executeWithTimeout(
        this.runCursorCLI(promptContent, repositoryPath)
      );
    }, 'Cursor CLI execution');
  }

  /**
   * Run Cursor CLI command
   * 
   * @param {string} promptContent - The prompt content
   * @param {string} repositoryPath - Path to the repository
   * @returns {Promise<string>} - Command output
   */
  async runCursorCLI(promptContent, repositoryPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-p', // Use print mode for non-interactive execution
        promptContent,
        '--output-format', this.outputFormat,
        ...this.args
      ];

      // Add model specification if provided
      if (this.model) {
        args.push('--model', this.model);
      }
      
      this.logger.debug(`Executing: ${this.command} ${args.slice(0, 2).join(' ')} [prompt] ${args.slice(3).join(' ')}`);
      
      const child = spawn(this.command, args, {
        cwd: repositoryPath,
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
          this.logger.debug(`Cursor CLI completed successfully`);
          resolve(stdout.trim());
        } else {
          const error = new Error(`Cursor CLI exited with code ${code}: ${stderr}`);
          this.logger.error(error.message);
          reject(error);
        }
      });
      
      child.on('error', (error) => {
        this.logger.error(`Cursor CLI process error: ${error.message}`);
        reject(new Error(`Failed to start Cursor CLI: ${error.message}`));
      });
    });
  }

  /**
   * Check if Cursor CLI is available
   * 
   * @returns {Promise<boolean>} - Whether Cursor CLI is available
   */
  async isAvailable() {
    try {
      await this.executeWithTimeout(
        this.runCommand([this.command, '--help']),
        10000 // 10 second timeout for availability check
      );
      return true;
    } catch (error) {
      this.logger.debug(`Cursor CLI not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Cursor CLI version
   * 
   * @returns {Promise<string>} - Version information
   */
  async getVersion() {
    try {
      // Cursor CLI doesn't have a --version flag, so we'll use --help and extract info
      const output = await this.runCommand([this.command, '--help']);
      
      // Extract version info from help output if available
      const lines = output.split('\n');
      const versionLine = lines.find(line => 
        line.toLowerCase().includes('version') || 
        line.toLowerCase().includes('cursor cli')
      );
      
      if (versionLine) {
        return versionLine.trim();
      }
      
      return 'Cursor CLI (version unknown)';
    } catch (error) {
      throw new Error(`Failed to get Cursor CLI version: ${error.message}`);
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
   * Get adapter metadata
   * 
   * @returns {Object} - Adapter metadata
   */
  getMetadata() {
    return {
      name: this.name,
      description: 'Cursor CLI AI assistant adapter for terminal-based AI interactions',
      version: '1.0.0',
      author: 'Augbench',
      capabilities: [
        'Code generation and modification',
        'File operations',
        'Shell command execution',
        'Interactive and non-interactive modes',
        'MCP (Model Context Protocol) support',
        'Rules system integration'
      ],
      requirements: [
        'Cursor CLI installed and accessible via cursor-agent command',
        'Proper authentication configured for Cursor'
      ],
      supportedFormats: ['text', 'json'],
      defaultTimeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }

  /**
   * Initialize the adapter
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger.debug('Initializing Cursor CLI adapter...');
    
    // Check if Cursor CLI is available
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Cursor CLI is not available. Please ensure cursor-agent is installed and accessible.');
    }
    
    this.logger.debug('Cursor CLI adapter initialized successfully');
  }

  /**
   * Cleanup the adapter
   */
  async cleanup() {
    this.logger.debug('Cleaning up Cursor CLI adapter...');
    // No specific cleanup needed for Cursor CLI
  }
}

module.exports = { CursorCLIAdapter };
