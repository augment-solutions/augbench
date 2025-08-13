/**
 * Base abstract class for all metrics
 */

const { Logger } = require('../utils/Logger');

class BaseMetric {
  constructor(name, options = {}) {
    if (this.constructor === BaseMetric) {
      throw new Error('BaseMetric is an abstract class and cannot be instantiated directly');
    }

    this.name = name;
    this.options = options;
    this.description = options.description || '';
    this.unit = options.unit || '';
    this.logger = new Logger(options);
  }

  /**
   * Abstract method to measure the metric
   * Must be implemented by subclasses
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context for measurement
   * @returns {Promise<number|string>} - The measured value
   */
  async measure(output, context = {}) {
    throw new Error('measure() method must be implemented by subclasses');
  }

  /**
   * Validate the measured value
   * Can be overridden by subclasses for custom validation
   * 
   * @param {any} value - The value to validate
   * @returns {boolean} - Whether the value is valid
   */
  validateValue(value) {
    return value !== null && value !== undefined;
  }

  /**
   * Format the measured value for display
   * Can be overridden by subclasses for custom formatting
   * 
   * @param {any} value - The value to format
   * @returns {string} - Formatted value
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    
    if (typeof value === 'number') {
      return this.unit ? `${value} ${this.unit}` : value.toString();
    }
    
    return value.toString();
  }

  /**
   * Get metric metadata
   * 
   * @returns {Object} - Metric metadata
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      unit: this.unit,
      type: this.constructor.name
    };
  }

  /**
   * Initialize the metric (called before first use)
   * Can be overridden by subclasses for setup logic
   */
  async initialize() {
    // Default implementation does nothing
  }

  /**
   * Cleanup the metric (called after all measurements)
   * Can be overridden by subclasses for cleanup logic
   */
  async cleanup() {
    // Default implementation does nothing
  }
}

module.exports = { BaseMetric };
