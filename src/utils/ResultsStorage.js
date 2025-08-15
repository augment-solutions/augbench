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
    // Validate results format
    this.validateResults(results);

    // Build standardized output directory and base name
    const outputDir = this.options.output ? this.fs.getAbsolutePath(this.options.output) : this.fs.getAbsolutePath('./results');
    await this.fs.ensureDir(outputDir);

    // Sanitize base name (outputFilename is a base without .json per validation rules)
    const baseRaw = String(outputFilename || '').trim();
    const sanitized = baseRaw
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/^[\s.]+|[\s.]+$/g, '');
    const baseName = sanitized.length ? sanitized : 'results';

    const outputPath = path.join(outputDir, `${baseName}.json`);

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

    // Save results atomically (overwrite allowed)
    await this.fs.writeJSONAtomic(outputPath, resultsObject, { indent: 2 });

    // Generate charts for metrics actually measured
    const metrics = this.discoverMeasuredMetrics(results);
    const { Charts } = require('./Charts');
    const charts = new Charts(this.options);
    const unitsMap = { response_time: 's' };
    const rangesMap = {
      output_quality: [0, 10],
      ast_similarity: [0, 10],
      instruction_adherence: [0, 10],
      context_adherence: [0, 10]
    };
    let pngPaths = [];
    try {
      // Detect if this is PR recreation mode
      const isPRMode = this.isPRRecreationMode(results);

      pngPaths = await charts.generateMetricCharts(results, metrics, {
        width: 1200,
        height: 800,
        dpi: 192,
        outputDir,
        baseName,
        unitsMap,
        rangesMap,
        isPRMode
      });
    } catch (e) {
      this.logger.warn(`Failed to generate charts: ${e.message}`);
    }

    // Logging
    const numRuns = this.calculateTotalRuns(results);
    const numAgents = new Set(results.map(r => r.assistant)).size;
    this.logger.success(`Results saved to: ${outputPath}`);
    if (pngPaths.length) {
      this.logger.info(`Generated ${pngPaths.length} PNG chart(s) for metrics: ${metrics.join(', ')}`);
      pngPaths.forEach(p => this.logger.info(`Chart: ${p}`));
    } else {
      this.logger.info('No PNG charts generated.');
    }
    this.logger.info(`Summary: runs=${numRuns}, agents=${numAgents}`);

    return outputPath;
  }

  /**
   * Determine metrics present in results
   */
  discoverMeasuredMetrics(results) {
    const metricSet = new Set();
    for (const entry of results) {
      for (const run of entry.runs || []) {
        Object.entries(run || {}).forEach(([k, v]) => {
          if (k === 'run_id' || k === 'error' || k.startsWith('_')) return;
          if (typeof v === 'number' || v === null || v === undefined) {
            metricSet.add(k);
          }
        });
      }
    }
    // Ensure response_time appears first if present
    const arr = Array.from(metricSet);
    arr.sort((a, b) => a.localeCompare(b));
    if (metricSet.has('response_time')) {
      const filtered = arr.filter(m => m !== 'response_time');
      return ['response_time', ...filtered];
    }
    return arr;
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

    // Validate PR-specific fields if present
    if (result.pr_info) {
      this.validatePRInfo(result.pr_info);
    }

    for (const run of result.runs) {
      this.validateRunEntry(run);
    }
  }

  /**
   * Validate PR information structure
   *
   * @param {Object} prInfo - PR information to validate
   * @throws {Error} - If PR info format is invalid
   */
  validatePRInfo(prInfo) {
    const requiredFields = ['number', 'order', 'title'];

    for (const field of requiredFields) {
      if (!(field in prInfo)) {
        throw new Error(`PR info missing required field: ${field}`);
      }
    }

    if (typeof prInfo.number !== 'number') {
      throw new Error('PR info number must be a number');
    }

    if (typeof prInfo.order !== 'number') {
      throw new Error('PR info order must be a number');
    }

    if (typeof prInfo.title !== 'string') {
      throw new Error('PR info title must be a string');
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
   * Detect if results are from PR recreation mode
   *
   * @param {Array} results - Results array
   * @returns {boolean} - Whether this is PR recreation mode
   */
  isPRRecreationMode(results) {
    return results.length > 0 && results.some(result =>
      result.pr_info || result.prompt.startsWith('pr_')
    );
  }

  /**
   * Generate summary statistics from results
   * 
   * @param {Array} results - Results array
   * @returns {Object} - Summary statistics
   */
  generateSummary(results) {
    const isPRMode = this.isPRRecreationMode(results);

    const summary = {
      mode: isPRMode ? 'pr_recreate' : 'standard',
      totalPrompts: results.length,
      totalAssistants: new Set(results.map(r => r.assistant)).size,
      totalRuns: this.calculateTotalRuns(results),
      assistants: {},
      prompts: {}
    };

    // Add PR-specific summary information
    if (isPRMode) {
      const prs = results
        .filter(r => r.pr_info)
        .map(r => r.pr_info)
        .reduce((unique, pr) => {
          if (!unique.find(p => p.number === pr.number)) {
            unique.push(pr);
          }
          return unique;
        }, [])
        .sort((a, b) => a.order - b.order);

      summary.prs = {
        total: prs.length,
        list: prs.map(pr => ({
          number: pr.number,
          order: pr.order,
          title: pr.title
        }))
      };
    }
    
    // Analyze by assistant
    for (const result of results) {
      if (!summary.assistants[result.assistant]) {
        const assistantSummary = {
          prompts: 0,
          runs: 0,
          successfulRuns: 0,
          failedRuns: 0,
          avgResponseTime: null,
          avgQuality: null,
          taskCompletionRate: 0,
          agentSuccessRate: 0,
          llmCallErrorRate: 0,
          outputFormatSuccessRate: 0
        };

        // Add PR-specific metrics if in PR mode
        if (isPRMode) {
          assistantSummary.avgASTSimilarity = null;
          assistantSummary.avgInstructionAdherence = null;
          assistantSummary.prSuccessRate = 0;
        }

        summary.assistants[result.assistant] = assistantSummary;
      }
      
      const assistantSummary = summary.assistants[result.assistant];
      assistantSummary.prompts++;
      assistantSummary.runs += result.runs.length;
      
      // Analyze runs
      const responseTimes = [];
      const qualityScores = [];
      const astSimilarityScores = [];
      const instructionAdherenceScores = [];

      const metricsConfig = (this.options && this.options.metrics_config) || {};
      const agentCfg = metricsConfig.agent_success || {};
      const mode = (agentCfg.mode || 'quality');
      const threshold = (typeof agentCfg.threshold === 'number') ? agentCfg.threshold : 7;
      let ofSuccessCount = 0;
      let evalErrCount = 0;
      let prSuccessCount = 0;

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

          // PR-specific metrics
          if (isPRMode) {
            if (run.ast_similarity !== null && typeof run.ast_similarity === 'number') {
              astSimilarityScores.push(run.ast_similarity);
            }

            if (run.instruction_adherence !== null && typeof run.instruction_adherence === 'number') {
              instructionAdherenceScores.push(run.instruction_adherence);
            }

            // Count PR success (high AST similarity and instruction adherence)
            if (run.ast_similarity >= threshold && run.instruction_adherence >= threshold) {
              prSuccessCount += 1;
            }
          }

          // output_format_success rate
          if (run.output_format_success === 1) {
            ofSuccessCount += 1;
          }

          // evaluator failure flag
          if (Array.isArray(run._evaluator_errors) && run._evaluator_errors.length > 0) {
            evalErrCount += 1;
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

      // Calculate PR-specific averages
      if (isPRMode) {
        if (astSimilarityScores.length > 0) {
          const avgAST = astSimilarityScores.reduce((sum, score) => sum + score, 0) / astSimilarityScores.length;
          assistantSummary.avgASTSimilarity = Math.round(avgAST * 100) / 100;
        }

        if (instructionAdherenceScores.length > 0) {
          const avgIA = instructionAdherenceScores.reduce((sum, score) => sum + score, 0) / instructionAdherenceScores.length;
          assistantSummary.avgInstructionAdherence = Math.round(avgIA * 100) / 100;
        }
      }

      // Summary rates
      const total = assistantSummary.runs;
      assistantSummary.taskCompletionRate = total ? (assistantSummary.successfulRuns / total) : 0;
      if (mode === 'completion') {
        assistantSummary.agentSuccessRate = assistantSummary.taskCompletionRate;
      } else {
        const successByQuality = (result.runs || []).filter(r => typeof r.output_quality === 'number' && r.output_quality >= threshold).length;
        assistantSummary.agentSuccessRate = total ? (successByQuality / total) : 0;
      }
      assistantSummary.llmCallErrorRate = total ? (evalErrCount / total) : 0;
      assistantSummary.outputFormatSuccessRate = total ? (ofSuccessCount / total) : 0;

      // PR-specific success rate
      if (isPRMode) {
        assistantSummary.prSuccessRate = total ? (prSuccessCount / total) : 0;
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
    const baseHeaders = ['prompt', 'assistant', 'run_id', 'response_time', 'output_quality', 'error'];

    // Discover extra metric columns present in any run
    const extraColsSet = new Set();
    for (const result of results) {
      for (const run of result.runs) {
        Object.keys(run).forEach(k => {
          if (!baseHeaders.includes(k) && !k.startsWith('_')) extraColsSet.add(k);
        });
      }
    }
    const headers = [...baseHeaders, ...Array.from(extraColsSet)];
    const rows = [headers.join(',')];

    for (const result of results) {
      for (const run of result.runs) {
        const row = headers.map(h => {
          if (h === 'prompt') return `"${result.prompt}"`;
          if (h === 'assistant') return `"${result.assistant}"`;
          if (h === 'error') return run.error ? `"${run.error}"` : '';
          const v = run[h];
          return v === undefined || v === null ? '' : v;
        });
        rows.push(row.join(','));
      }
    }

    return rows.join('\n');
  }
}

module.exports = { ResultsStorage };
