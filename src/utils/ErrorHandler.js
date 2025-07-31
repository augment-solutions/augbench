/**
 * Comprehensive error handling and validation utilities
 */

const { Logger } = require('./Logger');

class ErrorHandler {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.errorCounts = new Map();
  }

  /**
   * Handle and categorize errors
   * 
   * @param {Error} error - The error to handle
   * @param {string} context - Context where the error occurred
   * @param {Object} options - Error handling options
   * @returns {Object} - Processed error information
   */
  handleError(error, context = 'unknown', options = {}) {
    const errorInfo = this.categorizeError(error, context);
    
    // Track error frequency
    this.trackError(errorInfo.category, context);
    
    // Log the error appropriately
    this.logError(errorInfo, options);
    
    // Determine if recovery is possible
    errorInfo.recoverable = this.isRecoverable(errorInfo);
    
    return errorInfo;
  }

  /**
   * Categorize error by type and severity
   * 
   * @param {Error} error - The error to categorize
   * @param {string} context - Context where the error occurred
   * @returns {Object} - Error information with category
   */
  categorizeError(error, context) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      context: context,
      timestamp: new Date().toISOString(),
      category: 'unknown',
      severity: 'medium'
    };

    // Categorize by error type
    if (error.code === 'ENOENT') {
      errorInfo.category = 'file_not_found';
      errorInfo.severity = 'high';
    } else if (error.code === 'EACCES') {
      errorInfo.category = 'permission_denied';
      errorInfo.severity = 'high';
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      errorInfo.category = 'timeout';
      errorInfo.severity = 'medium';
    } else if (error.message.includes('network') || error.message.includes('connection')) {
      errorInfo.category = 'network';
      errorInfo.severity = 'medium';
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      errorInfo.category = 'validation';
      errorInfo.severity = 'high';
    } else if (error.message.includes('not found') || error.message.includes('missing')) {
      errorInfo.category = 'missing_resource';
      errorInfo.severity = 'high';
    } else if (error.message.includes('parse') || error.message.includes('JSON')) {
      errorInfo.category = 'parsing';
      errorInfo.severity = 'high';
    } else if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      errorInfo.category = 'programming';
      errorInfo.severity = 'critical';
    }

    return errorInfo;
  }

  /**
   * Determine if an error is recoverable
   * 
   * @param {Object} errorInfo - Error information
   * @returns {boolean} - Whether the error is recoverable
   */
  isRecoverable(errorInfo) {
    const recoverableCategories = ['timeout', 'network', 'temporary'];
    const nonRecoverableCategories = ['validation', 'programming', 'permission_denied'];
    
    if (nonRecoverableCategories.includes(errorInfo.category)) {
      return false;
    }
    
    if (recoverableCategories.includes(errorInfo.category)) {
      return true;
    }
    
    // Check error frequency - too many errors of same type = not recoverable
    const errorCount = this.errorCounts.get(`${errorInfo.category}:${errorInfo.context}`) || 0;
    return errorCount < 5;
  }

  /**
   * Track error frequency
   * 
   * @param {string} category - Error category
   * @param {string} context - Error context
   */
  trackError(category, context) {
    const key = `${category}:${context}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
  }

  /**
   * Log error with appropriate level
   * 
   * @param {Object} errorInfo - Error information
   * @param {Object} options - Logging options
   */
  logError(errorInfo, options = {}) {
    const { suppressLogging = false, includeStack = false } = options;
    
    if (suppressLogging) {
      return;
    }
    
    const logMessage = `[${errorInfo.category}] ${errorInfo.message}`;
    
    switch (errorInfo.severity) {
      case 'critical':
        this.logger.error(logMessage);
        if (includeStack && errorInfo.stack) {
          this.logger.error('Stack trace:', errorInfo.stack);
        }
        break;
      case 'high':
        this.logger.error(logMessage);
        break;
      case 'medium':
        this.logger.warn(logMessage);
        break;
      default:
        this.logger.debug(logMessage);
    }
  }

  /**
   * Create user-friendly error messages
   * 
   * @param {Object} errorInfo - Error information
   * @returns {string} - User-friendly error message
   */
  createUserMessage(errorInfo) {
    const suggestions = this.getSuggestions(errorInfo);
    
    let message = `Error: ${errorInfo.message}`;
    
    if (suggestions.length > 0) {
      message += '\n\nSuggestions:';
      suggestions.forEach((suggestion, index) => {
        message += `\n${index + 1}. ${suggestion}`;
      });
    }
    
    return message;
  }

  /**
   * Get suggestions for error resolution
   * 
   * @param {Object} errorInfo - Error information
   * @returns {string[]} - Array of suggestions
   */
  getSuggestions(errorInfo) {
    const suggestions = [];
    
    switch (errorInfo.category) {
      case 'file_not_found':
        suggestions.push('Check if the file path is correct');
        suggestions.push('Ensure the file exists and is accessible');
        break;
      case 'permission_denied':
        suggestions.push('Check file/directory permissions');
        suggestions.push('Run with appropriate privileges if necessary');
        break;
      case 'timeout':
        suggestions.push('Check network connectivity');
        suggestions.push('Try increasing timeout values');
        suggestions.push('Retry the operation');
        break;
      case 'network':
        suggestions.push('Check internet connection');
        suggestions.push('Verify API endpoints are accessible');
        suggestions.push('Check firewall settings');
        break;
      case 'validation':
        suggestions.push('Review input parameters');
        suggestions.push('Check configuration file format');
        suggestions.push('Ensure all required fields are provided');
        break;
      case 'missing_resource':
        suggestions.push('Install missing dependencies');
        suggestions.push('Check if required tools are in PATH');
        suggestions.push('Verify configuration is complete');
        break;
      case 'parsing':
        suggestions.push('Check file format and syntax');
        suggestions.push('Validate JSON/configuration files');
        suggestions.push('Remove any invalid characters');
        break;
    }
    
    return suggestions;
  }

  /**
   * Validate input parameters
   * 
   * @param {any} value - Value to validate
   * @param {Object} rules - Validation rules
   * @throws {Error} - If validation fails
   */
  validateInput(value, rules) {
    const errors = [];
    
    // Required check
    if (rules.required && (value === null || value === undefined || value === '')) {
      errors.push('Value is required');
    }
    
    // Type check
    if (value !== null && value !== undefined && rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`Expected type ${rules.type}, got ${actualType}`);
      }
    }
    
    // String validations
    if (typeof value === 'string' && rules.string) {
      if (rules.string.minLength && value.length < rules.string.minLength) {
        errors.push(`String must be at least ${rules.string.minLength} characters`);
      }
      if (rules.string.maxLength && value.length > rules.string.maxLength) {
        errors.push(`String must be at most ${rules.string.maxLength} characters`);
      }
      if (rules.string.pattern && !rules.string.pattern.test(value)) {
        errors.push('String does not match required pattern');
      }
    }
    
    // Number validations
    if (typeof value === 'number' && rules.number) {
      if (rules.number.min !== undefined && value < rules.number.min) {
        errors.push(`Number must be at least ${rules.number.min}`);
      }
      if (rules.number.max !== undefined && value > rules.number.max) {
        errors.push(`Number must be at most ${rules.number.max}`);
      }
      if (rules.number.integer && !Number.isInteger(value)) {
        errors.push('Number must be an integer');
      }
    }
    
    // Array validations
    if (Array.isArray(value) && rules.array) {
      if (rules.array.minLength && value.length < rules.array.minLength) {
        errors.push(`Array must have at least ${rules.array.minLength} items`);
      }
      if (rules.array.maxLength && value.length > rules.array.maxLength) {
        errors.push(`Array must have at most ${rules.array.maxLength} items`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Get error statistics
   * 
   * @returns {Object} - Error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      byCategory: {},
      byContext: {},
      mostFrequent: null
    };
    
    let maxCount = 0;
    let mostFrequentKey = null;
    
    for (const [key, count] of this.errorCounts) {
      stats.totalErrors += count;
      
      const [category, context] = key.split(':');
      stats.byCategory[category] = (stats.byCategory[category] || 0) + count;
      stats.byContext[context] = (stats.byContext[context] || 0) + count;
      
      if (count > maxCount) {
        maxCount = count;
        mostFrequentKey = key;
      }
    }
    
    if (mostFrequentKey) {
      const [category, context] = mostFrequentKey.split(':');
      stats.mostFrequent = { category, context, count: maxCount };
    }
    
    return stats;
  }

  /**
   * Reset error tracking
   */
  reset() {
    this.errorCounts.clear();
  }
}

module.exports = { ErrorHandler };
