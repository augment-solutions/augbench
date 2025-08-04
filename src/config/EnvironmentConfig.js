/**
 * Environment configuration management
 */

const { prompt } = require('../utils/inquirerCompat');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');

class EnvironmentConfig {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.envPath = path.join(process.cwd(), '.env');
    this.requiredVars = ['LLM_OPENAI_ENDPOINT', 'LLM_API_KEY']; // core required
    // Optional but recommended for non-OpenAI providers:
    this.optionalVars = ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_ANTHROPIC_VERSION'];
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
    
    const answers = await prompt(
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
    // Ensure .env is loaded even when running `backbencher validate`
    await this.loadEnvFile();

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
    if (!apiKey || apiKey.length < 10) {
      throw new Error('LLM_API_KEY appears to be too short');
    }

    // Provider-aware connectivity test
    await this.testLlmConnectivity();

    this.logger.debug('Environment validation passed');
  }

  /**
   * Test LLM connectivity with minimal/zero-cost calls where possible
   */
  async testLlmConnectivity() {
    const endpoint = process.env.LLM_OPENAI_ENDPOINT;
    const apiKey = process.env.LLM_API_KEY;
    const provider = (process.env.LLM_PROVIDER || 'openai-compatible').toLowerCase();
    const model = process.env.LLM_MODEL;

    const timeout = 10000; // 10s connectivity timeout

    this.logger.info('Testing LLM connectivity...');

    try {
      if (provider === 'anthropic') {
        if (!model || model.trim() === '') {
          throw new Error('LLM_MODEL is required when LLM_PROVIDER=anthropic');
        }
        // Minimal Anthropic Messages call (may incur negligible cost)
        const res = await axios.post(
          `${endpoint}/messages`,
          {
            model,
            max_tokens: 1,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Respond with OK' }]
              }
            ]
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': process.env.LLM_ANTHROPIC_VERSION || '2023-06-01',
              'Content-Type': 'application/json'
            },
            timeout
          }
        );
        if (!res.data || !Array.isArray(res.data.content)) {
          throw new Error('Anthropic connectivity failed: unexpected response');
        }
        this.logger.success('Anthropic connectivity OK');
      } else {
        // OpenAI-compatible: prefer GET /models (usually free)
        const res = await axios.get(`${endpoint}/models`, {
          headers: {
            Authorization: `Bearer ${apiKey}`
          },
          timeout
        });
        if (!res.data) {
          throw new Error('OpenAI-compatible connectivity failed: empty response');
        }
        this.logger.success('OpenAI-compatible connectivity OK');
      }
    } catch (err) {
      const hint = provider === 'anthropic'
        ? 'Check LLM_OPENAI_ENDPOINT=https://api.anthropic.com/v1, LLM_API_KEY, LLM_MODEL, and LLM_ANTHROPIC_VERSION.'
        : 'Check LLM_OPENAI_ENDPOINT (e.g., https://openrouter.ai/api/v1), LLM_API_KEY, and permissions.';
      throw new Error(`LLM connectivity test failed (${provider}): ${err.message}. ${hint}`);
    }
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
# LLM endpoint URL
# - OpenAI-compatible gateway (e.g., https://openrouter.ai/api/v1 or your litellm server)
# - Or Anthropic native (https://api.anthropic.com/v1) when using LLM_PROVIDER=anthropic
LLM_OPENAI_ENDPOINT=

# API key for the LLM service (Gateway key or Anthropic key)
LLM_API_KEY=

# Optional: Select model id (e.g., anthropic/claude-3.5-sonnet-20241022)
# If not set, defaults to gpt-3.5-turbo
LLM_MODEL=

# Optional: Provider hint
# - openai-compatible (default): uses /chat/completions
# - anthropic: uses /messages with x-api-key & anthropic-version
LLM_PROVIDER=

# Optional: Anthropic API version (only when LLM_PROVIDER=anthropic)
# Default: 2023-06-01 (update to current if needed)
LLM_ANTHROPIC_VERSION=2023-06-01

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
