/**
 * Main CLI interface for the Augbench tool
 */

const { prompt } = require('../utils/inquirerCompat');
const chalk = require('chalk');
const { getOra } = require('../utils/oraCompat');
const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');
const { ErrorHandler } = require('../utils/ErrorHandler');
const { Validator } = require('../utils/Validator');
const { Platform } = require('../utils/Platform');
const { ResultsStorage } = require('../utils/ResultsStorage');
const { RepositorySelector } = require('./RepositorySelector');
const { EnvironmentConfig } = require('../config/EnvironmentConfig');
const { SettingsManager } = require('../config/SettingsManager');
const { BenchmarkRunner } = require('./BenchmarkRunner');
const { AdapterFactory } = require('../adapters/AdapterFactory');

class BenchmarkCLI {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.errorHandler = new ErrorHandler(options);
    this.validator = new Validator(options);
    this.platform = new Platform(options);
    this.resultsStorage = new ResultsStorage(options);
    this.repositorySelector = new RepositorySelector(options);
    this.environmentConfig = new EnvironmentConfig(options);
    this.settingsManager = new SettingsManager({ ...options, settingsPath: options.settings || options.settingsPath });
    this.benchmarkRunner = new BenchmarkRunner(options);
  }

  /**
   * Main benchmark workflow
   */
  async run() {
    try {
      this.logger.info(chalk.bold('🏃 Starting Augbench - AI Assistant Benchmarking Tool'));

      // Step 1: Environment Configuration
      this.logger.step(1, 8, 'Environment Configuration');
      await this.environmentConfig.configure();

      // Step 2: Settings Management
      this.logger.step(2, 8, 'Settings Management');
      await this.settingsManager.ensureSettings();

      // Step 3: Settings Validation
      this.logger.step(3, 8, 'Settings Validation');
      const settings = await this.settingsManager.validateSettings();

      // Step 4: Repository Selection / Effective Repo Source
      this.logger.step(4, 8, 'Repository Selection');
      const repoUrl = this.options.repoUrl || settings.repo_url || '';
      const repoPathOpt = this.options.repoPath || this.options.repository || settings.repo_path || '';
      // Enforce mutual exclusivity if both are set
      if (repoUrl && repoPathOpt) {
        throw new Error('Exactly one of --repo-url or --repo-path/--repository must be provided');
      }
      // If neither is provided and no repoUrl, fall back to interactive/local selection
      let repositoryPath = repoPathOpt;
      if (!repoUrl && !repoPathOpt) {
        repositoryPath = await this.repositorySelector.selectRepository(this.options.repository);
      }

      // Assistant availability check before confirmation
      this.logger.info('Checking assistant availability...');
      const adapterFactory = new AdapterFactory(this.options);
      const availability = await adapterFactory.checkAdapterAvailability(settings.assistants);
      const unavailable = Object.entries(availability)
        .filter(([_, info]) => !info.available)
        .map(([name, info]) => `${name}${info.error ? ` (${info.error})` : ''}`);
      if (unavailable.length > 0) {
        throw new Error(`The following assistants are not available or failed to initialize: ${unavailable.join(', ')}`);
      }
      Object.entries(availability).forEach(([name, info]) => {
        const versionText = info.version ? ` (version: ${info.version})` : '';
        this.logger.success(`${name} is available${versionText}`);
      });

      // Step 5: Final Confirmation
      this.logger.step(5, 8, 'Final Confirmation');
      const confirmed = await this.confirmConfiguration(repositoryPath, settings);

      if (!confirmed) {
        this.logger.info('Benchmark cancelled by user');
        return;
      }

      // Step 6: Benchmark Execution
      this.logger.step(6, 8, 'Benchmark Execution');
      const results = await this.benchmarkRunner.runBenchmarks(repositoryPath, settings);

      // Step 7: Results Storage
      this.logger.step(7, 8, 'Results Storage');
      await this.saveResults(results, settings.output_filename, settings);

      // Step 8: Completion
      this.logger.step(8, 8, 'Completion');
      this.logger.success(`Benchmark completed! Results saved to ${settings.output_filename}`);

      // Print summary to CLI
      try {
        const summaryText = this.formatSummary(results, settings);
        if (summaryText) {
          console.log('\n' + summaryText);
        }
      } catch (e) {
        this.logger.warn('Failed to render summary:', e.message);
      }

    } catch (error) {
      this.logger.error('Benchmark failed:', error.message);
      if (this.options.verbose) {
        this.logger.error('Stack trace:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Initialize configuration files
   */
  async init() {
    try {
      this.logger.info(chalk.bold('🔧 Initializing Augbench configuration'));

      await this.settingsManager.createTemplateSettings(this.options.force);
      await this.environmentConfig.createTemplateEnv(this.options.force);

      this.logger.success('Configuration files created successfully!');
      this.logger.info('Next steps:');
      this.logger.info('1. Update .env with your LLM endpoint and API key');
      this.logger.info('2. Customize settings.json with your prompts and preferences');
      this.logger.info('3. Run: augbench benchmark');

    } catch (error) {
      this.logger.error('Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate configuration without running benchmarks
   */
  async validate() {
    try {
      this.logger.info(chalk.bold('✅ Validating Augbench configuration'));

      // Validate environment
      await this.environmentConfig.validate();
      this.logger.success('Environment configuration is valid');

      // Validate settings
      const settings = await this.settingsManager.validateSettings();
      this.logger.success('Settings configuration is valid');

      // Git installation and connectivity
      const { GitManager } = require('../utils/GitManager');
      const git = new GitManager(this.options);
      try {
        await git.ensureMinVersion('2.30.0');
        this.logger.success('Git installation OK (>= 2.30.0)');
      } catch (e) {
        this.logger.error(`Git installation/version check failed: ${e.message}`);
        throw e;
      }
      const publicProbe = 'https://github.com/chromium/chromium';
      const publicOk = await git.testConnectivity(publicProbe);
      if (publicOk) {
        this.logger.success(`Git connectivity OK to ${publicProbe}`);
      } else {
        this.logger.warn(`Git connectivity failed to ${publicProbe}`);
      }
      if (this.options.repoUrl) {
        const ok = await git.testConnectivity(this.options.repoUrl, process.env.GH_TOKEN || process.env.GIT_TOKEN);
        if (ok) this.logger.success(`Remote repository reachable: ${this.options.repoUrl}`);
        else this.logger.warn(`Cannot reach remote repository: ${this.options.repoUrl}. If private, configure GH_TOKEN/GIT_TOKEN or SSH keys.`);
      }

      // Validate repository path if provided; otherwise validate home access
      const repoPathOpt = this.options.repoPath || this.options.repository;
      if (repoPathOpt) {
        const absPath = this.repositorySelector.fs.getAbsolutePath(repoPathOpt.trim());
        await this.repositorySelector.validateRepository(absPath);
        this.logger.success('Repository path validation passed');
      } else {
        await this.validator.validateHomeAccess();
        this.logger.success('User home directory access OK');
      }

      // Validate CLI assistants (Augment CLI and Claude Code) initialization
      this.logger.info('Checking CLI assistant availability...');
      const adapterFactory = new AdapterFactory(this.options);
      const toCheck = ['Augment CLI', 'Claude Code'];
      const check = await adapterFactory.checkAdapterAvailability(toCheck);

      const requiredMissing = [];
      for (const name of toCheck) {
        const info = check[name];
        if (info && info.available) {
          const versionText = info.version ? ` (version: ${info.version})` : '';
          this.logger.success(`${name} is available${versionText}`);
        } else {
          const errText = info && info.error ? `: ${info.error}` : '';
          if (settings.assistants && settings.assistants.includes(name)) {
            requiredMissing.push(`${name}${errText}`);
          } else {
            this.logger.warn(`${name} is not available${errText}`);
          }
        }
      }

      if (requiredMissing.length > 0) {
        throw new Error(`Required assistants not available or failed to initialize: ${requiredMissing.join(', ')}`);
      }

      this.logger.info('Configuration summary:');
      this.logger.info(`- Prompts: ${settings.num_prompts}`);
      this.logger.info(`- Assistants: ${settings.assistants.join(', ')}`);
      this.logger.info(`- Runs per prompt: ${settings.runs_per_prompt}`);
      this.logger.info(`- Parallel runs: ${settings.parallel_runs || 1}`);
      this.logger.info(`- Parallel agents: ${settings.parallel_agents !== false ? 'enabled' : 'disabled'}`);
      this.logger.info(`- Output file: ${settings.output_filename}`);

    } catch (error) {
      this.logger.error('Validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Show final confirmation before running benchmarks
   */
  async confirmConfiguration(repositoryPath, settings) {
    this.logger.info('\n' + chalk.bold('📋 Configuration Summary:'));
    this.logger.info(`Repository: ${repositoryPath}`);
    this.logger.info(`Prompts: ${settings.prompts.join(', ')}`);
    this.logger.info(`Assistants: ${settings.assistants.join(', ')}`);
    this.logger.info(`Runs per prompt: ${settings.runs_per_prompt}`);
    this.logger.info(`Parallel runs: ${settings.parallel_runs || 1}`);
    this.logger.info(`Parallel agents: ${settings.parallel_agents !== false ? 'enabled' : 'disabled'}`);
    this.logger.info(`Output file: ${settings.output_filename}`);

    const { confirmed } = await prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Do you want to proceed with the benchmark?',
        default: true
      }
    ]);

    return confirmed;
  }

  /**
   * Format a short summary string for CLI output
   * opts: { color?: boolean }
   */
  formatSummary(results, settings, opts = {}) {
    const color = opts.color !== false; // default true
    const pct = (n) => `${(n * 100).toFixed(1)}%`;
    const c = (s, fn) => (color ? fn(String(s)) : String(s));
    const rateColor = (r) => (r >= 0.8 ? chalk.green(pct(r)) : r >= 0.5 ? chalk.yellow(pct(r)) : chalk.red(pct(r)));
    const rateColorInverse = (r) => (r >= 0.8 ? chalk.red(pct(r)) : r >= 0.5 ? chalk.yellow(pct(r)) : chalk.green(pct(r)));
    try {
      const summary = this.resultsStorage.withOptions
        ? this.resultsStorage.withOptions({ metrics_config: settings.metrics_config })
        : new ResultsStorage({ metrics_config: settings.metrics_config });
      const s = summary.generateSummary(results);
      const lines = [];
      lines.push(c('Summary per assistant:', chalk.bold));
      for (const [assistant, a] of Object.entries(s.assistants)) {
        const completed = color ? rateColor(a.taskCompletionRate) : pct(a.taskCompletionRate);
        const agentSuccess = color ? rateColor(a.agentSuccessRate) : pct(a.agentSuccessRate);
        const formatOk = color ? rateColor(a.outputFormatSuccessRate) : pct(a.outputFormatSuccessRate);
        const llmErr = color ? rateColorInverse(a.llmCallErrorRate) : pct(a.llmCallErrorRate);
        const parts = [
          `- ${c(assistant, chalk.cyan)}:`,
          `${c('runs', chalk.dim)}=${a.runs}`,
          `${c('completed', chalk.dim)}=${completed}`,
          `${c('agent_success', chalk.dim)}=${agentSuccess}`,
        ];
        if (a.avgResponseTime != null) parts.push(`${c('avg_time', chalk.dim)}=${c(a.avgResponseTime + 's', chalk.magenta)}`);
        if (a.avgQuality != null) parts.push(`${c('avg_quality', chalk.dim)}=${c(a.avgQuality, chalk.blue)}`);
        parts.push(`${c('format_ok', chalk.dim)}=${formatOk}`);
        parts.push(`${c('llm_err', chalk.dim)}=${llmErr}`);
        lines.push(parts.join(' '));
      }
      return lines.join('\n');
    } catch (e) {
      this.logger.warn('Unable to compute summary for CLI:', e.message);
      return '';
    }
  }
  /**
   * Save benchmark results to file
   */
  async saveResults(results, outputFilename, settings) {
    const metadata = {
      platform: this.platform.getPlatformInfo(),
      timestamp: new Date().toISOString(),
      settings // include full settings (contains metrics_config)
    };

    // Validate output_filename rules before writing
    if (typeof outputFilename !== 'string' || !outputFilename.trim()) {
      throw new Error('settings.output_filename must be a non-empty string');
    }
    if (outputFilename.toLowerCase().endsWith('.json')) {
      throw new Error('settings.output_filename must not include a .json suffix; it will be added automatically');
    }

    await this.resultsStorage.saveResults(results, outputFilename, metadata);
  }
}

module.exports = { BenchmarkCLI };
