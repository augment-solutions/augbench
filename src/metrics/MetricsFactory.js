/**
 * Factory for creating metric instances
 */

const { Logger } = require('../utils/Logger');
const { ResponseTimeMetric } = require('./ResponseTimeMetric');
const { OutputQualityMetric } = require('./OutputQualityMetric');
const { OutputFormatSuccessMetric } = require('./OutputFormatSuccessMetric');
const { InstructionAdherenceMetric } = require('./InstructionAdherenceMetric');
const { ContextAdherenceMetric } = require('./ContextAdherenceMetric');
const { StepsPerTaskMetric } = require('./StepsPerTaskMetric');
const { ASTSimilarityMetric } = require('./ASTSimilarityMetric');

class MetricsFactory {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.metricRegistry = new Map();
    this.registerBuiltInMetrics();
  }

  /**
   * Register built-in metrics
   */
  registerBuiltInMetrics() {
    this.registerMetric('response_time', ResponseTimeMetric);
    this.registerMetric('output_quality', OutputQualityMetric);
    this.registerMetric('output_format_success', OutputFormatSuccessMetric);
    this.registerMetric('instruction_adherence', InstructionAdherenceMetric);
    this.registerMetric('context_adherence', ContextAdherenceMetric);
    this.registerMetric('steps_per_task', StepsPerTaskMetric);
    this.registerMetric('ast_similarity', ASTSimilarityMetric);
  }

  /**
   * Register a metric class
   * 
   * @param {string} name - The metric name
   * @param {Class} MetricClass - The metric class constructor
   */
  registerMetric(name, MetricClass) {
    this.metricRegistry.set(name, MetricClass);
    this.logger.debug(`Registered metric: ${name}`);
  }

  /**
   * Create a metric instance
   * 
   * @param {string} name - The metric name
   * @param {Object} options - Options for the metric
   * @returns {Promise<BaseMetric>} - The metric instance
   */
  async createMetric(name, options = {}) {
    const MetricClass = this.metricRegistry.get(name);
    
    if (!MetricClass) {
      throw new Error(`Unknown metric: ${name}. Available metrics: ${this.getAvailableMetrics().join(', ')}`);
    }

    try {
      const metric = new MetricClass(name, { ...this.options, ...options });
      await metric.initialize();
      
      this.logger.debug(`Created metric instance: ${name}`);
      return metric;
      
    } catch (error) {
      throw new Error(`Failed to create metric ${name}: ${error.message}`);
    }
  }

  /**
   * Get list of available metric names
   * 
   * @returns {string[]} - Array of metric names
   */
  getAvailableMetrics() {
    return Array.from(this.metricRegistry.keys());
  }

  /**
   * Get metric metadata
   * 
   * @param {string} name - The metric name
   * @returns {Object} - Metric metadata
   */
  getMetricInfo(name) {
    const MetricClass = this.metricRegistry.get(name);
    
    if (!MetricClass) {
      throw new Error(`Unknown metric: ${name}`);
    }

    // Create a temporary instance to get metadata
    const tempMetric = new MetricClass(name, this.options);
    return tempMetric.getMetadata();
  }

  /**
   * Get information about all available metrics
   * 
   * @returns {Object[]} - Array of metric information
   */
  getAllMetricsInfo() {
    return this.getAvailableMetrics().map(name => {
      try {
        return this.getMetricInfo(name);
      } catch (error) {
        this.logger.warn(`Failed to get info for metric ${name}: ${error.message}`);
        return {
          name,
          error: error.message
        };
      }
    });
  }

  /**
   * Validate that all requested metrics are available
   * 
   * @param {string[]} metricNames - Array of metric names to validate
   * @throws {Error} - If any metric is not available
   */
  validateMetrics(metricNames) {
    const availableMetrics = this.getAvailableMetrics();
    const invalidMetrics = metricNames.filter(name => !availableMetrics.includes(name));
    
    if (invalidMetrics.length > 0) {
      throw new Error(
        `Invalid metrics: ${invalidMetrics.join(', ')}. ` +
        `Available metrics: ${availableMetrics.join(', ')}`
      );
    }
  }

  /**
   * Create multiple metric instances
   * 
   * @param {string[]} metricNames - Array of metric names
   * @param {Object} options - Options for all metrics
   * @returns {Promise<Map<string, BaseMetric>>} - Map of metric name to instance
   */
  async createMetrics(metricNames, options = {}) {
    this.validateMetrics(metricNames);
    
    const metrics = new Map();
    
    for (const name of metricNames) {
      try {
        const metric = await this.createMetric(name, options);
        metrics.set(name, metric);
      } catch (error) {
        this.logger.error(`Failed to create metric ${name}: ${error.message}`);
        throw error;
      }
    }
    
    return metrics;
  }

  /**
   * Cleanup all metrics
   * 
   * @param {Map<string, BaseMetric>} metrics - Map of metrics to cleanup
   */
  async cleanupMetrics(metrics) {
    for (const [name, metric] of metrics) {
      try {
        await metric.cleanup();
        this.logger.debug(`Cleaned up metric: ${name}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup metric ${name}: ${error.message}`);
      }
    }
  }
}

module.exports = { MetricsFactory };
