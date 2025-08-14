/**
 * Benchmark execution engine
 */

const { getOra } = require('../utils/oraCompat');
const chalk = require('chalk');
const { Logger } = require('../utils/Logger');
const { MetricsFactory } = require('../metrics/MetricsFactory');
const { AdapterFactory } = require('../adapters/AdapterFactory');
const { ParallelExecutor } = require('../utils/ParallelExecutor');
const { ResourceManager } = require('../utils/ResourceManager');

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
    const metrics = await this.initializeMetrics(settings.metrics, settings.metrics_config || {});
    
    // Prepare per-assistant working directories once
    const { StagingManager } = require('../utils/StagingManager');
    const staging = new StagingManager(this.options);
    const stageDir = (this.options.stageDir || settings.stage_dir || './stage');
    const repoUrlGlobal = this.options.repoUrl || settings.repo_url || '';
    const repoPathGlobal = this.options.repoPath || this.options.repository || settings.repo_path || repositoryPath || '';
    const branchGlobal = this.options.branch || settings.branch || '';
    const refGlobal = this.options.ref || settings.ref || '';

    const workingDirs = {};
    for (const assistantName of settings.assistants) {
      // Default: if neither repoUrl nor repoPath provided, use repositoryPath (interactive/local)
      let workingDir = repoPathGlobal || repositoryPath;
      if (repoUrlGlobal || repoPathGlobal) {
        try {
          workingDir = await staging.prepareForAssistant(assistantName, {
            repo_url: repoUrlGlobal || undefined,
            repo_path: repoUrlGlobal ? undefined : repoPathGlobal,
            stage_dir: stageDir,
            branch: branchGlobal || undefined,
            ref: refGlobal || undefined,
          });
          this.logger.info(`Working directory for ${assistantName}: ${workingDir}`);
        } catch (e) {
          this.logger.error(`Failed to prepare staging for ${assistantName}: ${e.message}`);
          throw e;
        }
      }
      workingDirs[assistantName] = workingDir;
    }

    // Process each prompt
    for (const promptFile of settings.prompts) {
      this.logger.info(`Processing prompt: ${promptFile}`);

      // Check if we should run agents in parallel
      const parallelAgents = settings.parallel_agents !== false; // Default to true

      if (parallelAgents && settings.assistants.length > 1) {
        // Parallel agent execution
        this.logger.info(`Running ${settings.assistants.length} agents in parallel for ${promptFile}`);

        const agentResults = await this.runAgentsInParallel(
          settings.assistants,
          promptFile,
          workingDirs,
          settings,
          metrics,
          currentRun,
          totalRuns
        );

        // Update currentRun counter
        currentRun += settings.assistants.length * settings.runs_per_prompt;

        // Add results
        results.push(...agentResults);
      } else {
        // Sequential agent execution (original behavior)
        for (const assistantName of settings.assistants) {
          this.logger.info(`Testing assistant: ${assistantName}`);

          const assistant = await this.adapterFactory.createAdapter(assistantName);
          const promptRuns = [];
          const workingDir = workingDirs[assistantName];

          // Determine if we should use parallel execution for runs
          const parallelRuns = settings.parallel_runs || 1;
          const useParallel = parallelRuns > 1 && settings.runs_per_prompt > 1;

        if (useParallel) {
          // Use the shared parallel runs method
          const runResults = await this.runParallelRuns(
            assistant,
            assistantName,
            promptFile,
            workingDir,
            settings,
            metrics,
            currentRun,
            totalRuns
          );
          promptRuns.push(...runResults);
          currentRun += settings.runs_per_prompt;
        } else {
          // Sequential execution (original behavior)
          for (let runId = 1; runId <= settings.runs_per_prompt; runId++) {
            currentRun++;
            const ora = await getOra();
            const spinner = ora(`Run ${currentRun}/${totalRuns}: ${assistantName} on ${promptFile}`).start();

            try {
              const runResult = await this.runSingleBenchmark(
                assistant,
                promptFile,
                workingDir,
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
        }

          // Add results for this prompt-assistant combination
          results.push({
            prompt: promptFile,
            assistant: assistantName,
            runs: promptRuns
          });
        }
      }
    }

    this.logger.success(`Benchmark completed: ${results.length} prompt-assistant combinations processed`);
    return results;
  }

  /**
   * Run multiple agents in parallel for a single prompt
   */
  async runAgentsInParallel(assistantNames, promptFile, workingDirs, settings, metrics, currentRunStart, totalRuns) {
    const resourceManager = new ResourceManager({
      verbose: this.options.verbose,
      quiet: this.options.quiet
    });

    // Calculate safe concurrency for agents
    const requestedConcurrency = assistantNames.length;
    const safeConcurrency = resourceManager.calculateSafeConcurrency(requestedConcurrency);

    const agentExecutor = new ParallelExecutor({
      maxConcurrent: safeConcurrency,
      verbose: this.options.verbose,
      quiet: this.options.quiet
    });

    this.logger.info(`Running ${assistantNames.length} agents with max ${safeConcurrency} concurrent`);

    // Create tasks for each agent
    const agentTasks = [];

    for (let i = 0; i < assistantNames.length; i++) {
      const assistantName = assistantNames[i];
      // Calculate the starting run number for this agent
      const agentRunStart = currentRunStart + (i * settings.runs_per_prompt);

      agentTasks.push({
        id: `agent-${assistantName}`,
        fn: async () => {
          const assistant = await this.adapterFactory.createAdapter(assistantName);
          const workingDir = workingDirs[assistantName];
          const promptRuns = [];

          // Determine if we should use parallel execution for runs
          const parallelRuns = settings.parallel_runs || 1;
          const useParallel = parallelRuns > 1 && settings.runs_per_prompt > 1;

          if (useParallel) {
            // Parallel run execution
            const runResults = await this.runParallelRuns(
              assistant,
              assistantName,
              promptFile,
              workingDir,
              settings,
              metrics,
              agentRunStart,
              totalRuns
            );
            promptRuns.push(...runResults);
          } else {
            // Sequential run execution
            let localRunCounter = agentRunStart;
            for (let runId = 1; runId <= settings.runs_per_prompt; runId++) {
              localRunCounter++;
              const ora = await getOra();
              const spinner = ora(`Run ${localRunCounter}/${totalRuns}: ${assistantName} on ${promptFile}`).start();

              try {
                const runResult = await this.runSingleBenchmark(
                  assistant,
                  promptFile,
                  workingDir,
                  metrics,
                  runId
                );

                promptRuns.push(runResult);
                spinner.succeed(`Completed run ${runId} for ${assistantName}`);
              } catch (error) {
                spinner.fail(`Failed run ${runId} for ${assistantName}: ${error.message}`);
                this.logger.error(`Run failed:`, error.message);

                promptRuns.push({
                  run_id: runId,
                  error: error.message,
                  response_time: null,
                  output_quality: null
                });
              }
            }
          }

          return {
            prompt: promptFile,
            assistant: assistantName,
            runs: promptRuns
          };
        }
      });
    }

    // Execute agent tasks in parallel
    const agentResults = await agentExecutor.execute(agentTasks);

    // Convert results to array format
    const results = [];
    for (const assistantName of assistantNames) {
      const taskId = `agent-${assistantName}`;
      const result = agentResults.get(taskId);

      if (result.success) {
        results.push(result.result);
      } else {
        this.logger.error(`Failed to process ${assistantName}: ${result.error.message}`);
        // Add empty result for failed agent
        results.push({
          prompt: promptFile,
          assistant: assistantName,
          runs: [{
            run_id: 1,
            error: result.error.message,
            response_time: null,
            output_quality: null
          }]
        });
      }
    }

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
    const evaluatorErrors = [];
    for (const [metricName, metric] of Object.entries(metrics)) {
      try {
        metricResults[metricName] = await metric.measure(output, {
          prompt: promptFile,
          assistant: assistant.name,
          repositoryPath,
          startTime,
          endTime,
          responseTime
        });
      } catch (error) {
        this.logger.warn(`Failed to measure ${metricName}: ${error.message}`);
        try {
          const { AssessableMetric } = require('../metrics/AssessableMetric');
          if (metric instanceof AssessableMetric) {
            evaluatorErrors.push(metricName);
          }
        } catch (_) { /* ignore */ }
        metricResults[metricName] = null;
      }
    }
    
    const runRecord = {
      run_id: runId,
      response_time: parseFloat(responseTime.toFixed(2)),
      ...metricResults
    };
    if (evaluatorErrors.length > 0) {
      runRecord._evaluator_errors = evaluatorErrors;
    }
    return runRecord;
  }

  /**
   * Initialize metric instances
   */
  async initializeMetrics(metricNames, metricsConfig = {}) {
    const metrics = {};
    
    for (const metricName of metricNames) {
      try {
        metrics[metricName] = await this.metricsFactory.createMetric(metricName, { metrics_config: metricsConfig });
        this.logger.debug(`Initialized metric: ${metricName}`);
      } catch (error) {
        this.logger.error(`Failed to initialize metric ${metricName}: ${error.message}`);
        throw error;
      }
    }
    
    return metrics;
  }

  /**
   * Run multiple runs in parallel for a single agent-prompt combination
   */
  async runParallelRuns(assistant, assistantName, promptFile, workingDir, settings, metrics, currentRunStart, totalRuns) {
    const actualParallelRuns = Math.min(settings.parallel_runs || 1, settings.runs_per_prompt);
    this.logger.info(`Running ${settings.runs_per_prompt} runs in parallel (max ${actualParallelRuns} concurrent) for ${assistantName}`);

    const resourceManager = new ResourceManager({
      verbose: this.options.verbose,
      quiet: this.options.quiet
    });

    const executor = resourceManager.createResourceAwareExecutor(
      ParallelExecutor,
      actualParallelRuns
    );

    // Set up progress tracking
    const ora = await getOra();
    let spinner;
    let currentRun = currentRunStart;

    executor.on('taskStart', ({ running, queued }) => {
      currentRun++;
      if (spinner) spinner.stop();
      spinner = ora(`Running ${running} concurrent, ${queued} queued: ${assistantName} on ${promptFile}`).start();
    });

    executor.on('taskComplete', ({ id, running, queued }) => {
      if (spinner) {
        spinner.text = `Running ${running} concurrent, ${queued} queued: ${assistantName} on ${promptFile}`;
      }
    });

    executor.on('taskError', ({ id, error, running, queued }) => {
      this.logger.error(`Run ${id} failed: ${error.message}`);
      if (spinner) {
        spinner.text = `Running ${running} concurrent, ${queued} queued: ${assistantName} on ${promptFile}`;
      }
    });

    // Create tasks for parallel execution
    const tasks = ParallelExecutor.createBenchmarkTasks(
      settings.runs_per_prompt,
      async (runId) => {
        return await this.runSingleBenchmark(
          assistant,
          promptFile,
          workingDir,
          metrics,
          runId
        );
      }
    );

    // Execute tasks in parallel
    const results = await executor.execute(tasks);

    if (spinner) spinner.stop();

    // Process results
    const promptRuns = [];
    for (let runId = 1; runId <= settings.runs_per_prompt; runId++) {
      const taskId = `run-${runId}`;
      const result = results.get(taskId);

      if (result.success) {
        promptRuns.push(result.result);
        this.logger.success(`Completed run ${runId} for ${assistantName}`);
      } else {
        this.logger.error(`Failed run ${runId} for ${assistantName}: ${result.error.message}`);
        promptRuns.push({
          run_id: runId,
          error: result.error.message,
          response_time: null,
          output_quality: null
        });
      }
    }

    return promptRuns;
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
