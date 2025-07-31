/**
 * Environment configuration management
 */

const inquirer = require('inquirer');
const dotenv = require('dotenv');
const path = require('path');
const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');

class EnvironmentConfig {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.envPath = path.join(process.cwd(), '.env');
    this.requiredVars = ['LLM_OPENAI_ENDPOINT', 'LLM_API_KEY'];
  }

  /**
   * Configure environment variables
   */
  async configure() {
    this.logger.info('Checking environment configuration...');
    
    // Load existing .env file if it exists
    await this.loadEnvFile();
    
    // Check for required environment variables
    const missingVars = this.getMissingVariables();
    
    if (missingVars.length > 0) {
      this.logger.warn(`Missing environment variables: ${missingVars.join(', ')}`);
      await this.promptForMissingVariables(missingVars);
    } else {
      this.logger.success('Environment configuration is complete');
    }
    
    // Validate the configuration
    await this.validate();
  }

  /**
   * Load .env file if it exists
   */
  async loadEnvFile() {
    if (await this.fs.exists(this.envPath)) {
      dotenv.config({ path: this.envPath });
      this.logger.debug(`Loaded .env file from ${this.envPath}`);
    } else {
      this.logger.debug('.env file not found');
    }
  }

  /**
   * Get list of missing required environment variables
   */
  getMissingVariables() {
    return this.requiredVars.filter(varName => {
      const value = process.env[varName];
      return !value || value.trim() === '';
    });
  }

  /**
   * Prompt user for missing environment variables
   */
  async promptForMissingVariables(missingVars) {
    this.logger.info('Please provide the missing environment variables:');
    
    const answers = await inquirer.prompt(
      missingVars.map(varName => ({
        type: varName.includes('KEY') ? 'password' : 'input',
        name: varName,
        message: `Enter ${varName}:`,
        validate: (input) => {
          if (!input || input.trim() === '') {
            return `${varName} cannot be empty`;
          }
          return true;
        }
      }))
    );

    // Set the environment variables
    for (const [varName, value] of Object.entries(answers)) {
      process.env[varName] = value;
    }

    // Update or create .env file
    await this.updateEnvFile(answers);
  }

  /**
   * Update .env file with new variables
   */
  async updateEnvFile(newVars) {
    let envContent = '';
    
    // Read existing .env content if file exists
    if (await this.fs.exists(this.envPath)) {
      envContent = await this.fs.readText(this.envPath);
    }

    // Parse existing variables
    const existingVars = {};
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          existingVars[key] = valueParts.join('=');
        }
      }
    });

    // Merge with new variables
    const allVars = { ...existingVars, ...newVars };

    // Generate new .env content
    const newContent = Object.entries(allVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await this.fs.writeText(this.envPath, newContent);
    this.logger.success(`Updated .env file: ${this.envPath}`);
  }

  /**
   * Validate environment configuration
   */
  async validate() {
    const missingVars = this.getMissingVariables();
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Validate endpoint URL format
    const endpoint = process.env.LLM_OPENAI_ENDPOINT;
    if (!this.isValidUrl(endpoint)) {
      throw new Error(`Invalid LLM_OPENAI_ENDPOINT URL format: ${endpoint}`);
    }

    // Validate API key format (basic check)
    const apiKey = process.env.LLM_API_KEY;
    if (apiKey.length < 10) {
      throw new Error('LLM_API_KEY appears to be too short');
    }

    this.logger.debug('Environment validation passed');
  }

  /**
   * Check if a string is a valid URL
   */
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create template .env file
   */
  async createTemplateEnv(force = false) {
    if (!force && await this.fs.exists(this.envPath)) {
      this.logger.info('.env file already exists');
      return;
    }

    const template = `# Backbencher Environment Configuration
# LLM endpoint URL (e.g., https://api.openai.com/v1)
LLM_OPENAI_ENDPOINT=

# API key for the LLM service
LLM_API_KEY=

# Optional: Additional configuration
# DEBUG=false
# TIMEOUT=30000
`;

    await this.fs.writeText(this.envPath, template);
    this.logger.success(`Created template .env file: ${this.envPath}`);
  }

  /**
   * Get current environment configuration
   */
  getConfig() {
    return {
      endpoint: process.env.LLM_OPENAI_ENDPOINT,
      apiKey: process.env.LLM_API_KEY ? '***' : undefined, // Mask API key
      envFileExists: this.fs.exists(this.envPath)
    };
  }
}

module.exports = { EnvironmentConfig };
