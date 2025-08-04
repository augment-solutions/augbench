/**
 * Abstract class for metrics that can be measured directly by the benchmark tool
 * (e.g., response time, memory usage, etc.)
 */

const { BaseMetric } = require('./BaseMetric');

class MeasurableMetric extends BaseMetric {
  constructor(name, options = {}) {
    super(name, options);
    if (new.target === MeasurableMetric) {
      throw new Error('MeasurableMetric is an abstract class and cannot be instantiated directly');
    }
    this.precision = options.precision || 2;
    this.minValue = options.minValue;
    this.maxValue = options.maxValue;
  }

  /**
   * Abstract method to perform the actual measurement
   * Must be implemented by subclasses
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context for measurement
   * @returns {Promise<number>} - The measured numeric value
   */
  async performMeasurement(output, context = {}) {
    throw new Error('performMeasurement() method must be implemented by subclasses');
  }

  /**
   * Measure the metric with validation and formatting
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context for measurement
   * @returns {Promise<number>} - The measured value
   */
  async measure(output, context = {}) {
    this.logger && this.logger.debug && this.logger.debug(`[metric:${this.name}] Measuring (MeasurableMetric). Context keys: ${Object.keys(context || {}).join(', ')}`);
    const rawValue = await this.performMeasurement(output, context);
    this.logger && this.logger.debug && this.logger.debug(`[metric:${this.name}] Raw measured value: ${rawValue}`);

    if (!this.validateValue(rawValue)) {
      throw new Error(`Invalid measurement value: ${rawValue}`);
    }

    const formatted = this.formatMeasuredValue(rawValue);
    this.logger && this.logger.debug && this.logger.debug(`[metric:${this.name}] Formatted measured value: ${formatted}`);
    return formatted;
  }

  /**
   * Validate the measured numeric value
   * 
   * @param {number} value - The value to validate
   * @returns {boolean} - Whether the value is valid
   */
  validateValue(value) {
    if (!super.validateValue(value)) {
      return false;
    }
    
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }
    
    if (this.minValue !== undefined && value < this.minValue) {
      return false;
    }
    
    if (this.maxValue !== undefined && value > this.maxValue) {
      return false;
    }
    
    return true;
  }

  /**
   * Format the measured numeric value
   * 
   * @param {number} value - The value to format
   * @returns {number} - Formatted value with appropriate precision
   */
  formatMeasuredValue(value) {
    if (typeof value !== 'number') {
      return value;
    }
    
    return parseFloat(value.toFixed(this.precision));
  }

  /**
   * Get statistical information about a set of measurements
   * 
   * @param {number[]} values - Array of measured values
   * @returns {Object} - Statistical summary
   */
  getStatistics(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return {
        count: 0,
        min: null,
        max: null,
        mean: null,
        median: null,
        stdDev: null
      };
    }
    
    const sortedValues = [...values].sort((a, b) => a - b);
    const count = values.length;
    const min = sortedValues[0];
    const max = sortedValues[count - 1];
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / count;
    
    // Calculate median
    const median = count % 2 === 0
      ? (sortedValues[count / 2 - 1] + sortedValues[count / 2]) / 2
      : sortedValues[Math.floor(count / 2)];
    
    // Calculate standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);
    
    return {
      count,
      min: this.formatMeasuredValue(min),
      max: this.formatMeasuredValue(max),
      mean: this.formatMeasuredValue(mean),
      median: this.formatMeasuredValue(median),
      stdDev: this.formatMeasuredValue(stdDev)
    };
  }
}

module.exports = { MeasurableMetric };
