/**
 * Base abstract class for AI assistant adapters
 */

const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');

class BaseAdapter {
  constructor(name, options = {}) {
    if (this.constructor === BaseAdapter) {
      throw new Error('BaseAdapter is an abstract class and cannot be instantiated directly');
    }
    
    this.name = name;
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.timeout = options.timeout || 300000; // 5 minutes default
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Abstract method to execute the AI assistant
   * Must be implemented by subclasses
   * 
   * @param {string} promptFile - Path to the prompt file
   * @param {string} repositoryPath - Path to the repository for context
   * @returns {Promise<string>} - The assistant's output
   */
  async execute(promptFile, repositoryPath) {
    throw new Error('execute() method must be implemented by subclasses');
  }

  /**
   * Abstract method to check if the assistant is available
   * Must be implemented by subclasses
   * 
   * @returns {Promise<boolean>} - Whether the assistant is available
   */
  async isAvailable() {
    throw new Error('isAvailable() method must be implemented by subclasses');
  }

  /**
   * Abstract method to get assistant version information
   * Must be implemented by subclasses
   * 
   * @returns {Promise<string>} - Version information
   */
  async getVersion() {
    throw new Error('getVersion() method must be implemented by subclasses');
  }

  /**
   * Read prompt content from file
   * 
   * @param {string} promptFile - Path to the prompt file
   * @returns {Promise<string>} - Prompt content
   */
  async readPrompt(promptFile) {
    const promptPath = this.fs.getAbsolutePath(promptFile);
    
    if (!(await this.fs.exists(promptPath))) {
      throw new Error(`Prompt file not found: ${promptFile}`);
    }
    
    const content = await this.fs.readText(promptPath);
    this.logger.debug(`Read prompt from ${promptFile} (${content.length} characters)`);
    
    return content;
  }

  /**
   * Validate repository path
   * 
   * @param {string} repositoryPath - Path to the repository
   * @throws {Error} - If repository is invalid
   */
  async validateRepository(repositoryPath) {
    if (!(await this.fs.exists(repositoryPath))) {
      throw new Error(`Repository path does not exist: ${repositoryPath}`);
    }
    
    const stats = await this.fs.getStats(repositoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Repository path is not a directory: ${repositoryPath}`);
    }
    
    this.logger.debug(`Validated repository: ${repositoryPath}`);
  }

  /**
   * Execute with retry logic
   * 
   * @param {Function} operation - The operation to execute
   * @param {string} operationName - Name of the operation for logging
   * @returns {Promise<any>} - Result of the operation
   */
  async executeWithRetry(operation, operationName = 'operation') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`${operationName} attempt ${attempt}/${this.maxRetries}`);
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`${operationName} attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`${operationName} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Create a timeout promise
   * 
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} - Promise that rejects after timeout
   */
  createTimeoutPromise(timeoutMs) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Execute operation with timeout
   * 
   * @param {Promise} operation - The operation promise
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<any>} - Result of the operation
   */
  async executeWithTimeout(operation, timeoutMs = this.timeout) {
    return Promise.race([
      operation,
      this.createTimeoutPromise(timeoutMs)
    ]);
  }

  /**
   * Get adapter metadata
   * 
   * @returns {Object} - Adapter metadata
   */
  getMetadata() {
    return {
      name: this.name,
      type: this.constructor.name,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }

  /**
   * Initialize the adapter (called before first use)
   * Can be overridden by subclasses for setup logic
   */
  async initialize() {
    this.logger.debug(`Initializing adapter: ${this.name}`);
    
    // Check if adapter is available
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(`Adapter ${this.name} is not available`);
    }
    
    // Get version information
    try {
      const version = await this.getVersion();
      this.logger.debug(`${this.name} version: ${version}`);
    } catch (error) {
      this.logger.warn(`Could not get version for ${this.name}: ${error.message}`);
    }
  }

  /**
   * Cleanup the adapter (called after all executions)
   * Can be overridden by subclasses for cleanup logic
   */
  async cleanup() {
    this.logger.debug(`Cleaning up adapter: ${this.name}`);
    // Default implementation does nothing
  }
}

module.exports = { BaseAdapter };
