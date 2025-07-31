/**
 * Benchmark execution engine
 */

const ora = require('ora');
const chalk = require('chalk');
const { Logger } = require('../utils/Logger');
const { MetricsFactory } = require('../metrics/MetricsFactory');
const { AdapterFactory } = require('../adapters/AdapterFactory');

class BenchmarkRunner {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.metricsFactory = new MetricsFactory(options);
    this.adapterFactory = new AdapterFactory(options);
  }

  /**
   * Run all benchmarks according to settings
   */
  async runBenchmarks(repositoryPath, settings) {
    const results = [];
    const totalRuns = settings.num_prompts * settings.assistants.length * settings.runs_per_prompt;
    let currentRun = 0;

    this.logger.info(`Starting benchmark with ${totalRuns} total runs`);

    // Initialize metrics
    const metrics = await this.initializeMetrics(settings.metrics);
    
    // Process each prompt
    for (const promptFile of settings.prompts) {
      this.logger.info(`Processing prompt: ${promptFile}`);
      
      // Process each assistant
      for (const assistantName of settings.assistants) {
        this.logger.info(`Testing assistant: ${assistantName}`);
        
        const assistant = await this.adapterFactory.createAdapter(assistantName);
        const promptRuns = [];
        
        // Run multiple times for this prompt-assistant combination
        for (let runId = 1; runId <= settings.runs_per_prompt; runId++) {
          currentRun++;
          const spinner = ora(`Run ${currentRun}/${totalRuns}: ${assistantName} on ${promptFile}`).start();
          
          try {
            const runResult = await this.runSingleBenchmark(
              assistant,
              promptFile,
              repositoryPath,
              metrics,
              runId
            );
            
            promptRuns.push(runResult);
            spinner.succeed(`Completed run ${runId} for ${assistantName}`);
            
          } catch (error) {
            spinner.fail(`Failed run ${runId} for ${assistantName}: ${error.message}`);
            this.logger.error(`Run failed:`, error.message);
            
            // Add failed run with error info
            promptRuns.push({
              run_id: runId,
              error: error.message,
              response_time: null,
              output_quality: null
            });
          }
        }
        
        // Add results for this prompt-assistant combination
        results.push({
          prompt: promptFile,
          assistant: assistantName,
          runs: promptRuns
        });
      }
    }

    this.logger.success(`Benchmark completed: ${results.length} prompt-assistant combinations processed`);
    return results;
  }

  /**
   * Run a single benchmark iteration
   */
  async runSingleBenchmark(assistant, promptFile, repositoryPath, metrics, runId) {
    const startTime = Date.now();
    
    // Execute the assistant
    const output = await assistant.execute(promptFile, repositoryPath);
    
    const endTime = Date.now();
    const responseTime = (endTime - startTime) / 1000; // Convert to seconds
    
    // Measure all metrics
    const metricResults = {};
    for (const [metricName, metric] of Object.entries(metrics)) {
      try {
        metricResults[metricName] = await metric.measure(output, {
          prompt: promptFile,
          assistant: assistant.name,
          repositoryPath
        });
      } catch (error) {
        this.logger.warn(`Failed to measure ${metricName}: ${error.message}`);
        metricResults[metricName] = null;
      }
    }
    
    return {
      run_id: runId,
      response_time: parseFloat(responseTime.toFixed(2)),
      ...metricResults
    };
  }

  /**
   * Initialize metric instances
   */
  async initializeMetrics(metricNames) {
    const metrics = {};
    
    for (const metricName of metricNames) {
      try {
        metrics[metricName] = await this.metricsFactory.createMetric(metricName);
        this.logger.debug(`Initialized metric: ${metricName}`);
      } catch (error) {
        this.logger.error(`Failed to initialize metric ${metricName}: ${error.message}`);
        throw error;
      }
    }
    
    return metrics;
  }

  /**
   * Get benchmark progress information
   */
  getBenchmarkProgress(currentRun, totalRuns) {
    const percentage = Math.round((currentRun / totalRuns) * 100);
    return {
      current: currentRun,
      total: totalRuns,
      percentage,
      remaining: totalRuns - currentRun
    };
  }
}

module.exports = { BenchmarkRunner };
