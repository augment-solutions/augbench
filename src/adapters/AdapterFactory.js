/**
 * Factory for creating AI assistant adapter instances
 */

const { Logger } = require('../utils/Logger');
const { ClaudeCodeAdapter } = require('./ClaudeCodeAdapter');
const { AugmentCLIAdapter } = require('./AugmentCLIAdapter');
const { CursorCLIAdapter } = require('./CursorCLIAdapter');

class AdapterFactory {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.adapterRegistry = new Map();
    this.registerBuiltInAdapters();
  }

  /**
   * Register built-in adapters
   */
  registerBuiltInAdapters() {
    this.registerAdapter('Claude Code', ClaudeCodeAdapter);
    this.registerAdapter('Augment CLI', AugmentCLIAdapter);
    this.registerAdapter('Cursor CLI', CursorCLIAdapter);
  }

  /**
   * Register an adapter class
   * 
   * @param {string} name - The adapter name
   * @param {Class} AdapterClass - The adapter class constructor
   */
  registerAdapter(name, AdapterClass) {
    this.adapterRegistry.set(name, AdapterClass);
    this.logger.debug(`Registered adapter: ${name}`);
  }

  /**
   * Create an adapter instance
   * 
   * @param {string} name - The adapter name
   * @param {Object} options - Options for the adapter
   * @returns {Promise<BaseAdapter>} - The adapter instance
   */
  async createAdapter(name, options = {}) {
    const AdapterClass = this.adapterRegistry.get(name);
    
    if (!AdapterClass) {
      throw new Error(`Unknown adapter: ${name}. Available adapters: ${this.getAvailableAdapters().join(', ')}`);
    }

    try {
      const adapter = new AdapterClass({ ...this.options, ...options });
      await adapter.initialize();
      
      this.logger.debug(`Created adapter instance: ${name}`);
      return adapter;
      
    } catch (error) {
      throw new Error(`Failed to create adapter ${name}: ${error.message}`);
    }
  }

  /**
   * Get list of available adapter names
   * 
   * @returns {string[]} - Array of adapter names
   */
  getAvailableAdapters() {
    return Array.from(this.adapterRegistry.keys());
  }

  /**
   * Get adapter metadata
   * 
   * @param {string} name - The adapter name
   * @returns {Object} - Adapter metadata
   */
  getAdapterInfo(name) {
    const AdapterClass = this.adapterRegistry.get(name);
    
    if (!AdapterClass) {
      throw new Error(`Unknown adapter: ${name}`);
    }

    // Create a temporary instance to get metadata
    const tempAdapter = new AdapterClass(this.options);
    return tempAdapter.getMetadata();
  }

  /**
   * Get information about all available adapters
   * 
   * @returns {Object[]} - Array of adapter information
   */
  getAllAdaptersInfo() {
    return this.getAvailableAdapters().map(name => {
      try {
        return this.getAdapterInfo(name);
      } catch (error) {
        this.logger.warn(`Failed to get info for adapter ${name}: ${error.message}`);
        return {
          name,
          error: error.message
        };
      }
    });
  }

  /**
   * Validate that all requested adapters are available
   * 
   * @param {string[]} adapterNames - Array of adapter names to validate
   * @throws {Error} - If any adapter is not available
   */
  validateAdapters(adapterNames) {
    const availableAdapters = this.getAvailableAdapters();
    const invalidAdapters = adapterNames.filter(name => !availableAdapters.includes(name));
    
    if (invalidAdapters.length > 0) {
      throw new Error(
        `Invalid adapters: ${invalidAdapters.join(', ')}. ` +
        `Available adapters: ${availableAdapters.join(', ')}`
      );
    }
  }

  /**
   * Create multiple adapter instances
   * 
   * @param {string[]} adapterNames - Array of adapter names
   * @param {Object} options - Options for all adapters
   * @returns {Promise<Map<string, BaseAdapter>>} - Map of adapter name to instance
   */
  async createAdapters(adapterNames, options = {}) {
    this.validateAdapters(adapterNames);
    
    const adapters = new Map();
    
    for (const name of adapterNames) {
      try {
        const adapter = await this.createAdapter(name, options);
        adapters.set(name, adapter);
      } catch (error) {
        this.logger.error(`Failed to create adapter ${name}: ${error.message}`);
        throw error;
      }
    }
    
    return adapters;
  }

  /**
   * Check availability of adapters
   * 
   * @param {string[]} adapterNames - Array of adapter names to check
   * @returns {Promise<Object>} - Map of adapter name to availability status
   */
  async checkAdapterAvailability(adapterNames) {
    const availability = {};
    
    for (const name of adapterNames) {
      try {
        const adapter = await this.createAdapter(name);
        availability[name] = {
          available: await adapter.isAvailable(),
          version: null
        };
        
        if (availability[name].available) {
          try {
            availability[name].version = await adapter.getVersion();
          } catch (error) {
            this.logger.warn(`Could not get version for ${name}: ${error.message}`);
          }
        }
        
        await adapter.cleanup();
        
      } catch (error) {
        availability[name] = {
          available: false,
          error: error.message
        };
      }
    }
    
    return availability;
  }

  /**
   * Cleanup all adapters
   * 
   * @param {Map<string, BaseAdapter>} adapters - Map of adapters to cleanup
   */
  async cleanupAdapters(adapters) {
    for (const [name, adapter] of adapters) {
      try {
        await adapter.cleanup();
        this.logger.debug(`Cleaned up adapter: ${name}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup adapter ${name}: ${error.message}`);
      }
    }
  }
}

module.exports = { AdapterFactory };
