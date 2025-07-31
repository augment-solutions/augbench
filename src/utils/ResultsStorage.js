/**
 * Results storage and management system
 */

const path = require('path');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');

class ResultsStorage {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
  }

  /**
   * Save benchmark results to file
   * 
   * @param {Array} results - Array of benchmark results
   * @param {string} outputFilename - Output filename
   * @param {Object} metadata - Additional metadata to include
   * @returns {Promise<string>} - Path to saved file
   */
  async saveResults(results, outputFilename, metadata = {}) {
    const outputPath = this.fs.getAbsolutePath(outputFilename);
    
    // Validate results format
    this.validateResults(results);
    
    // Create results object with metadata
    const resultsObject = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        totalRuns: this.calculateTotalRuns(results),
        ...metadata
      },
      results: results
    };
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await this.fs.ensureDir(outputDir);
    
    // Save results
    await this.fs.writeJSON(outputPath, resultsObject, { indent: 2 });
    
    this.logger.success(`Results saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Load benchmark results from file
   * 
   * @param {string} filePath - Path to results file
   * @returns {Promise<Object>} - Loaded results object
   */
  async loadResults(filePath) {
    const absolutePath = this.fs.getAbsolutePath(filePath);
    
    if (!(await this.fs.exists(absolutePath))) {
      throw new Error(`Results file not found: ${filePath}`);
    }
    
    const resultsObject = await this.fs.readJSON(absolutePath);
    
    // Validate loaded results
    this.validateResultsObject(resultsObject);
    
    this.logger.debug(`Loaded results from: ${absolutePath}`);
    return resultsObject;
  }

  /**
   * Validate results array format
   * 
   * @param {Array} results - Results array to validate
   * @throws {Error} - If results format is invalid
   */
  validateResults(results) {
    if (!Array.isArray(results)) {
      throw new Error('Results must be an array');
    }
    
    for (const result of results) {
      this.validateResultEntry(result);
    }
  }

  /**
   * Validate individual result entry
   * 
   * @param {Object} result - Result entry to validate
   * @throws {Error} - If result format is invalid
   */
  validateResultEntry(result) {
    const requiredFields = ['prompt', 'assistant', 'runs'];
    
    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new Error(`Result entry missing required field: ${field}`);
      }
    }
    
    if (typeof result.prompt !== 'string') {
      throw new Error('Result prompt must be a string');
    }
    
    if (typeof result.assistant !== 'string') {
      throw new Error('Result assistant must be a string');
    }
    
    if (!Array.isArray(result.runs)) {
      throw new Error('Result runs must be an array');
    }
    
    for (const run of result.runs) {
      this.validateRunEntry(run);
    }
  }

  /**
   * Validate individual run entry
   * 
   * @param {Object} run - Run entry to validate
   * @throws {Error} - If run format is invalid
   */
  validateRunEntry(run) {
    if (typeof run.run_id !== 'number') {
      throw new Error('Run entry must have numeric run_id');
    }
    
    // response_time can be null for failed runs
    if (run.response_time !== null && typeof run.response_time !== 'number') {
      throw new Error('Run response_time must be a number or null');
    }
    
    // Other metrics can be null for failed runs
    // Additional validation can be added here for specific metrics
  }

  /**
   * Validate complete results object
   * 
   * @param {Object} resultsObject - Results object to validate
   * @throws {Error} - If results object format is invalid
   */
  validateResultsObject(resultsObject) {
    if (!resultsObject.results) {
      throw new Error('Results object must have results field');
    }
    
    this.validateResults(resultsObject.results);
    
    if (resultsObject.metadata && typeof resultsObject.metadata !== 'object') {
      throw new Error('Results metadata must be an object');
    }
  }

  /**
   * Calculate total number of runs in results
   * 
   * @param {Array} results - Results array
   * @returns {number} - Total number of runs
   */
  calculateTotalRuns(results) {
    return results.reduce((total, result) => {
      return total + (result.runs ? result.runs.length : 0);
    }, 0);
  }

  /**
   * Generate summary statistics from results
   * 
   * @param {Array} results - Results array
   * @returns {Object} - Summary statistics
   */
  generateSummary(results) {
    const summary = {
      totalPrompts: results.length,
      totalAssistants: new Set(results.map(r => r.assistant)).size,
      totalRuns: this.calculateTotalRuns(results),
      assistants: {},
      prompts: {}
    };
    
    // Analyze by assistant
    for (const result of results) {
      if (!summary.assistants[result.assistant]) {
        summary.assistants[result.assistant] = {
          prompts: 0,
          runs: 0,
          successfulRuns: 0,
          failedRuns: 0,
          avgResponseTime: null,
          avgQuality: null
        };
      }
      
      const assistantSummary = summary.assistants[result.assistant];
      assistantSummary.prompts++;
      assistantSummary.runs += result.runs.length;
      
      // Analyze runs
      const responseTimes = [];
      const qualityScores = [];
      
      for (const run of result.runs) {
        if (run.error) {
          assistantSummary.failedRuns++;
        } else {
          assistantSummary.successfulRuns++;
          
          if (run.response_time !== null) {
            responseTimes.push(run.response_time);
          }
          
          if (run.output_quality !== null) {
            qualityScores.push(run.output_quality);
          }
        }
      }
      
      // Calculate averages
      if (responseTimes.length > 0) {
        const avgTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        assistantSummary.avgResponseTime = Math.round(avgTime * 100) / 100;
      }
      
      if (qualityScores.length > 0) {
        const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
        assistantSummary.avgQuality = Math.round(avgQuality * 100) / 100;
      }
    }
    
    // Analyze by prompt
    for (const result of results) {
      if (!summary.prompts[result.prompt]) {
        summary.prompts[result.prompt] = {
          assistants: 0,
          runs: 0
        };
      }
      
      summary.prompts[result.prompt].assistants++;
      summary.prompts[result.prompt].runs += result.runs.length;
    }
    
    return summary;
  }

  /**
   * Export results to different formats
   * 
   * @param {Array} results - Results array
   * @param {string} format - Export format ('json', 'csv')
   * @param {string} outputPath - Output file path
   * @returns {Promise<string>} - Path to exported file
   */
  async exportResults(results, format, outputPath) {
    const absolutePath = this.fs.getAbsolutePath(outputPath);
    
    switch (format.toLowerCase()) {
      case 'json':
        await this.fs.writeJSON(absolutePath, { results });
        break;
        
      case 'csv':
        const csvContent = this.convertToCSV(results);
        await this.fs.writeText(absolutePath, csvContent);
        break;
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
    
    this.logger.success(`Results exported to: ${absolutePath}`);
    return absolutePath;
  }

  /**
   * Convert results to CSV format
   * 
   * @param {Array} results - Results array
   * @returns {string} - CSV content
   */
  convertToCSV(results) {
    const headers = ['prompt', 'assistant', 'run_id', 'response_time', 'output_quality', 'error'];
    const rows = [headers.join(',')];
    
    for (const result of results) {
      for (const run of result.runs) {
        const row = [
          `"${result.prompt}"`,
          `"${result.assistant}"`,
          run.run_id,
          run.response_time || '',
          run.output_quality || '',
          run.error ? `"${run.error}"` : ''
        ];
        rows.push(row.join(','));
      }
    }
    
    return rows.join('\n');
  }
}

module.exports = { ResultsStorage };
