/**
 * Response Time Metric - Measures execution time of AI assistants
 */

const { MeasurableMetric } = require('./MeasurableMetric');

class ResponseTimeMetric extends MeasurableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Measures the response time of AI assistant execution in seconds',
      unit: 'seconds',
      precision: 2,
      minValue: 0,
      ...options
    });
  }

  /**
   * Perform response time measurement
   * Note: This metric is actually measured by the BenchmarkRunner
   * This method is here for completeness but won't be called directly
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context including timing info
   * @returns {Promise<number>} - The response time in seconds
   */
  async performMeasurement(output, context = {}) {
    // If timing information is provided in context, use it
    if (context.startTime && context.endTime) {
      const responseTime = (context.endTime - context.startTime) / 1000;
      return responseTime;
    }
    
    // If response time is directly provided in context
    if (context.responseTime !== undefined) {
      return context.responseTime;
    }
    
    // This shouldn't happen in normal operation as timing is handled by BenchmarkRunner
    throw new Error('Response time measurement requires timing information in context');
  }

  /**
   * Validate response time value
   * 
   * @param {number} value - The response time value
   * @returns {boolean} - Whether the value is valid
   */
  validateValue(value) {
    if (!super.validateValue(value)) {
      return false;
    }
    
    // Response time should be positive
    if (value < 0) {
      return false;
    }
    
    // Sanity check: response time shouldn't be more than 1 hour
    if (value > 3600) {
      return false;
    }
    
    return true;
  }

  /**
   * Get performance categories based on response time
   * 
   * @param {number} responseTime - The response time in seconds
   * @returns {string} - Performance category
   */
  getPerformanceCategory(responseTime) {
    if (responseTime < 5) {
      return 'Excellent';
    } else if (responseTime < 15) {
      return 'Good';
    } else if (responseTime < 30) {
      return 'Average';
    } else if (responseTime < 60) {
      return 'Slow';
    } else {
      return 'Very Slow';
    }
  }

  /**
   * Format response time with performance category
   * 
   * @param {number} value - The response time value
   * @returns {string} - Formatted value with category
   */
  formatValue(value) {
    const formatted = super.formatValue(value);
    const category = this.getPerformanceCategory(value);
    return `${formatted} (${category})`;
  }

  /**
   * Get detailed statistics for response times
   * 
   * @param {number[]} values - Array of response time values
   * @returns {Object} - Detailed statistics
   */
  getDetailedStatistics(values) {
    const baseStats = super.getStatistics(values);
    
    if (values.length === 0) {
      return baseStats;
    }
    
    // Calculate percentiles
    const sortedValues = [...values].sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedValues, 50);
    const p90 = this.getPercentile(sortedValues, 90);
    const p95 = this.getPercentile(sortedValues, 95);
    const p99 = this.getPercentile(sortedValues, 99);
    
    // Categorize performance
    const categories = values.reduce((acc, value) => {
      const category = this.getPerformanceCategory(value);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    return {
      ...baseStats,
      percentiles: {
        p50: this.formatMeasuredValue(p50),
        p90: this.formatMeasuredValue(p90),
        p95: this.formatMeasuredValue(p95),
        p99: this.formatMeasuredValue(p99)
      },
      performanceCategories: categories
    };
  }

  /**
   * Calculate percentile value
   * 
   * @param {number[]} sortedValues - Sorted array of values
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} - Percentile value
   */
  getPercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) {
      return 0;
    }
    
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedValues[lower];
    }
    
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }
}

module.exports = { ResponseTimeMetric };
