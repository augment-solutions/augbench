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
      const cliOptions = {
        repoUrl: this.options.repoUrl,
        repoPath: this.options.repoPath || this.options.repository
      };
      const settings = await this.settingsManager.validateSettings(cliOptions);

      // Step 4: Mode-specific Setup
      this.logger.step(4, 8, 'Mode-specific Setup');
      const mode = settings.mode || 'standard';
      let repositoryPath = null;

      if (mode === 'pr_recreate') {
        // PR recreation mode - validate target repository and get user input
        await this.setupPRRecreationMode(settings);
        repositoryPath = null; // Not used in PR recreation mode
      } else {
        // Standard mode - repository selection
        const repoUrl = this.options.repoUrl || settings.repo_url || '';
        const repoPathOpt = this.options.repoPath || this.options.repository || settings.repo_path || '';
        // Enforce mutual exclusivity if both are set
        if (repoUrl && repoPathOpt) {
          throw new Error('Exactly one of --repo-url or --repo-path/--repository must be provided');
        }
        // If neither is provided and no repoUrl, fall back to interactive/local selection
        repositoryPath = repoPathOpt;
        if (!repoUrl && !repoPathOpt) {
          repositoryPath = await this.repositorySelector.selectRepository(this.options.repository);
        }
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

      // Validate settings with CLI options context
      const cliOptions = {
        repoUrl: this.options.repoUrl,
        repoPath: this.options.repoPath || this.options.repository
      };
      const settings = await this.settingsManager.validateSettings(cliOptions);
      this.logger.success('Settings configuration is valid');

      const mode = settings.mode || 'standard';
      this.logger.info(`Validation mode: ${mode}`);

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

      // Mode-specific validation
      if (mode === 'standard') {
        // Standard mode validations
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

      } else if (mode === 'pr_recreate') {
        // PR recreation mode validations
        const targetRepoUrl = cliOptions.repoUrl || settings.target_repo_url;
        if (targetRepoUrl) {
          const ok = await git.testConnectivity(targetRepoUrl, process.env.GH_TOKEN || process.env.GIT_TOKEN);
          if (ok) {
            this.logger.success(`Target repository reachable: ${targetRepoUrl}`);
          } else {
            this.logger.warn(`Cannot reach target repository: ${targetRepoUrl}. If private, configure GH_TOKEN/GIT_TOKEN or SSH keys.`);
          }
        }

        // Validate LLM access for prompt generation
        const { PromptGenerator } = require('../utils/PromptGenerator');
        const promptGenerator = new PromptGenerator(this.options);
        const llmAvailable = await promptGenerator.validateLLMAccess();

        if (llmAvailable) {
          this.logger.success('LLM access for prompt generation validated');
        } else {
          this.logger.warn('LLM not accessible - prompt generation may fail');
        }
      }

      // Validate CLI assistants (Augment CLI, Claude Code, and Cursor CLI) initialization
      this.logger.info('Checking CLI assistant availability...');
      const adapterFactory = new AdapterFactory(this.options);
      const toCheck = ['Augment CLI', 'Claude Code', 'Cursor CLI'];
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
      this.logger.info(`- Mode: ${mode}`);

      if (mode === 'standard') {
        this.logger.info(`- Prompts: ${settings.num_prompts}`);
      } else if (mode === 'pr_recreate') {
        this.logger.info(`- Target repository: ${settings.target_repo_url}`);
        this.logger.info(`- Number of PRs: ${settings.num_prs}`);
      }

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
    const mode = settings.mode || 'standard';

    this.logger.info('\n' + chalk.bold('📋 Configuration Summary:'));
    this.logger.info(`Mode: ${mode}`);

    if (mode === 'standard') {
      this.logger.info(`Repository: ${repositoryPath}`);
      this.logger.info(`Prompts: ${settings.prompts.join(', ')}`);
    } else if (mode === 'pr_recreate') {
      const targetRepoUrl = this.options.repoUrl || settings.target_repo_url;
      this.logger.info(`Target repository: ${targetRepoUrl}`);
      this.logger.info(`Number of PRs: ${settings.num_prs}`);
    }

    this.logger.info(`Assistants: ${settings.assistants.join(', ')}`);
    this.logger.info(`Runs per prompt: ${settings.runs_per_prompt}`);
    this.logger.info(`Parallel runs: ${settings.parallel_runs || 1}`);
    this.logger.info(`Parallel agents: ${settings.parallel_agents !== false ? 'enabled' : 'disabled'}`);
    this.logger.info(`Output file: ${settings.output_filename}`);

    const { confirmed } = await prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Do you want to proceed with the ${mode} benchmark?`,
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
   * Setup PR recreation mode with user interaction
   */
  async setupPRRecreationMode(settings) {
    this.logger.info('Setting up PR Recreation Mode...');

    // Get repository URL from CLI argument or settings
    const targetRepoUrl = this.options.repoUrl || settings.target_repo_url;
    if (!targetRepoUrl) {
      throw new Error('Repository URL is required for PR recreation mode. Provide either --repo-url CLI argument or target_repo_url in settings.json');
    }

    this.logger.info(`Target repository: ${targetRepoUrl}`);

    // Get number of PRs if not specified
    let numPRs = settings.num_prs;
    if (!numPRs) {
      const { num_prs } = await prompt([
        {
          type: 'input',
          name: 'num_prs',
          message: 'How many recent PRs would you like to recreate?',
          default: '5',
          validate: (input) => {
            const num = parseInt(input);
            if (isNaN(num) || num < 1 || num > 50) {
              return 'Please enter a number between 1 and 50';
            }
            return true;
          }
        }
      ]);
      numPRs = parseInt(num_prs);
      settings.num_prs = numPRs;
    }

    this.logger.info(`Will recreate ${numPRs} recent PRs`);

    // Validate LLM access for prompt generation
    const { PromptGenerator } = require('../utils/PromptGenerator');
    const promptGenerator = new PromptGenerator(this.options);

    this.logger.info('Validating LLM access for prompt generation...');
    const llmAvailable = await promptGenerator.validateLLMAccess();

    if (!llmAvailable) {
      const llmConfig = promptGenerator.getLLMConfig();
      this.logger.warn(`LLM not accessible at ${llmConfig.endpoint}`);
      this.logger.warn('Please ensure your LLM service is running and accessible');

      const { proceed } = await prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Do you want to proceed anyway? (Prompt generation will fail)',
          default: false
        }
      ]);

      if (!proceed) {
        throw new Error('PR recreation mode requires LLM access for prompt generation');
      }
    } else {
      this.logger.success('LLM access validated');
    }

    // Validate Git access
    const { GitManager } = require('../utils/GitManager');
    const git = new GitManager(this.options);

    try {
      await git.ensureMinVersion('2.30.0');
      this.logger.success('Git installation validated');
    } catch (error) {
      throw new Error(`Git validation failed: ${error.message}`);
    }

    // Test repository connectivity
    this.logger.info('Testing repository connectivity...');
    const token = process.env.GH_TOKEN || process.env.GIT_TOKEN;
    const canConnect = await git.testConnectivity(targetRepoUrl, token);

    if (!canConnect) {
      this.logger.warn('Cannot connect to target repository');
      this.logger.warn('Please check the repository URL and your authentication');

      const { proceed } = await prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Do you want to proceed anyway?',
          default: false
        }
      ]);

      if (!proceed) {
        throw new Error('Cannot proceed without repository access');
      }
    } else {
      this.logger.success('Repository connectivity validated');
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
