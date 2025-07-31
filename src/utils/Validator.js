/**
 * Input validation utilities
 */

const path = require('path');
const { FileSystem } = require('./FileSystem');
const { ErrorHandler } = require('./ErrorHandler');

class Validator {
  constructor(options = {}) {
    this.options = options;
    this.fs = new FileSystem(options);
    this.errorHandler = new ErrorHandler(options);
  }

  /**
   * Validate file path
   * 
   * @param {string} filePath - Path to validate
   * @param {Object} options - Validation options
   * @returns {Promise<boolean>} - Whether path is valid
   */
  async validateFilePath(filePath, options = {}) {
    const { mustExist = true, mustBeFile = true, mustBeReadable = true } = options;
    
    try {
      this.errorHandler.validateInput(filePath, {
        required: true,
        type: 'string',
        string: { minLength: 1 }
      });
      
      const absolutePath = this.fs.getAbsolutePath(filePath);
      
      if (mustExist) {
        if (!(await this.fs.exists(absolutePath))) {
          throw new Error(`Path does not exist: ${filePath}`);
        }
        
        const stats = await this.fs.getStats(absolutePath);
        
        if (mustBeFile && !stats.isFile()) {
          throw new Error(`Path is not a file: ${filePath}`);
        }
        
        if (mustBeReadable) {
          try {
            await this.fs.readText(absolutePath);
          } catch (error) {
            throw new Error(`File is not readable: ${filePath}`);
          }
        }
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'file_validation');
      throw error;
    }
  }

  /**
   * Validate directory path
   * 
   * @param {string} dirPath - Directory path to validate
   * @param {Object} options - Validation options
   * @returns {Promise<boolean>} - Whether directory is valid
   */
  async validateDirectoryPath(dirPath, options = {}) {
    const { mustExist = true, mustBeWritable = false } = options;
    
    try {
      this.errorHandler.validateInput(dirPath, {
        required: true,
        type: 'string',
        string: { minLength: 1 }
      });
      
      const absolutePath = this.fs.getAbsolutePath(dirPath);
      
      if (mustExist) {
        if (!(await this.fs.exists(absolutePath))) {
          throw new Error(`Directory does not exist: ${dirPath}`);
        }
        
        const stats = await this.fs.getStats(absolutePath);
        if (!stats.isDirectory()) {
          throw new Error(`Path is not a directory: ${dirPath}`);
        }
      }
      
      if (mustBeWritable) {
        // Test write access by creating a temporary file
        const testFile = path.join(absolutePath, '.backbencher-test');
        try {
          await this.fs.writeText(testFile, 'test');
          await this.fs.exists(testFile); // Clean up
        } catch (error) {
          throw new Error(`Directory is not writable: ${dirPath}`);
        }
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'directory_validation');
      throw error;
    }
  }

  /**
   * Validate URL format
   * 
   * @param {string} url - URL to validate
   * @param {Object} options - Validation options
   * @returns {boolean} - Whether URL is valid
   */
  validateUrl(url, options = {}) {
    const { protocols = ['http', 'https'] } = options;
    
    try {
      this.errorHandler.validateInput(url, {
        required: true,
        type: 'string',
        string: { minLength: 1 }
      });
      
      const urlObj = new URL(url);
      
      if (!protocols.includes(urlObj.protocol.slice(0, -1))) {
        throw new Error(`URL protocol must be one of: ${protocols.join(', ')}`);
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'url_validation');
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Validate API key format
   * 
   * @param {string} apiKey - API key to validate
   * @param {Object} options - Validation options
   * @returns {boolean} - Whether API key is valid
   */
  validateApiKey(apiKey, options = {}) {
    const { minLength = 10, maxLength = 200 } = options;
    
    try {
      this.errorHandler.validateInput(apiKey, {
        required: true,
        type: 'string',
        string: { minLength, maxLength }
      });
      
      // Check for common invalid patterns
      if (apiKey.includes(' ')) {
        throw new Error('API key should not contain spaces');
      }
      
      if (apiKey.toLowerCase().includes('your-api-key') || 
          apiKey.toLowerCase().includes('placeholder')) {
        throw new Error('API key appears to be a placeholder');
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'api_key_validation');
      throw error;
    }
  }

  /**
   * Validate settings object
   * 
   * @param {Object} settings - Settings object to validate
   * @returns {boolean} - Whether settings are valid
   */
  validateSettings(settings) {
    try {
      // Basic structure validation
      this.errorHandler.validateInput(settings, {
        required: true,
        type: 'object'
      });
      
      // Required fields
      const requiredFields = ['num_prompts', 'prompts', 'assistants', 'runs_per_prompt', 'output_filename', 'metrics'];
      for (const field of requiredFields) {
        if (!(field in settings)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      // Validate num_prompts
      this.errorHandler.validateInput(settings.num_prompts, {
        required: true,
        type: 'number',
        number: { min: 1, integer: true }
      });
      
      // Validate prompts array
      this.errorHandler.validateInput(settings.prompts, {
        required: true,
        type: 'array',
        array: { minLength: 1 }
      });
      
      // Check prompts array length matches num_prompts
      if (settings.prompts.length !== settings.num_prompts) {
        throw new Error('num_prompts must match prompts array length');
      }
      
      // Validate each prompt
      for (const prompt of settings.prompts) {
        this.errorHandler.validateInput(prompt, {
          required: true,
          type: 'string',
          string: { minLength: 1 }
        });
      }
      
      // Validate assistants array
      this.errorHandler.validateInput(settings.assistants, {
        required: true,
        type: 'array',
        array: { minLength: 1 }
      });
      
      // Validate each assistant
      for (const assistant of settings.assistants) {
        this.errorHandler.validateInput(assistant, {
          required: true,
          type: 'string',
          string: { minLength: 1 }
        });
      }
      
      // Validate runs_per_prompt
      this.errorHandler.validateInput(settings.runs_per_prompt, {
        required: true,
        type: 'number',
        number: { min: 1, integer: true }
      });
      
      // Validate output_filename
      this.errorHandler.validateInput(settings.output_filename, {
        required: true,
        type: 'string',
        string: { minLength: 1 }
      });
      
      // Validate metrics array
      this.errorHandler.validateInput(settings.metrics, {
        required: true,
        type: 'array',
        array: { minLength: 1 }
      });
      
      // Validate each metric
      for (const metric of settings.metrics) {
        this.errorHandler.validateInput(metric, {
          required: true,
          type: 'string',
          string: { minLength: 1 }
        });
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'settings_validation');
      throw error;
    }
  }

  /**
   * Validate environment configuration
   * 
   * @param {Object} env - Environment variables object
   * @returns {boolean} - Whether environment is valid
   */
  validateEnvironment(env = process.env) {
    try {
      // Validate LLM endpoint
      if (!env.LLM_OPENAI_ENDPOINT) {
        throw new Error('LLM_OPENAI_ENDPOINT environment variable is required');
      }
      this.validateUrl(env.LLM_OPENAI_ENDPOINT);
      
      // Validate API key
      if (!env.LLM_API_KEY) {
        throw new Error('LLM_API_KEY environment variable is required');
      }
      this.validateApiKey(env.LLM_API_KEY);
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'environment_validation');
      throw error;
    }
  }

  /**
   * Validate command line arguments
   * 
   * @param {Object} args - Parsed command line arguments
   * @param {string} command - Command being executed
   * @returns {boolean} - Whether arguments are valid
   */
  validateCommandArgs(args, command) {
    try {
      switch (command) {
        case 'benchmark':
          if (args.repository) {
            this.errorHandler.validateInput(args.repository, {
              required: true,
              type: 'string',
              string: { minLength: 1 }
            });
          }
          if (args.settings) {
            this.errorHandler.validateInput(args.settings, {
              required: true,
              type: 'string',
              string: { minLength: 1 }
            });
          }
          break;
          
        case 'validate':
          if (args.settings) {
            this.errorHandler.validateInput(args.settings, {
              required: true,
              type: 'string',
              string: { minLength: 1 }
            });
          }
          break;
          
        case 'init':
          // No specific validation needed for init command
          break;
          
        default:
          throw new Error(`Unknown command: ${command}`);
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'command_args_validation');
      throw error;
    }
  }
}

module.exports = { Validator };
