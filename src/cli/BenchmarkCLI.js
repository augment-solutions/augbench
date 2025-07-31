/**
 * Main CLI interface for the Backbencher tool
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
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
    this.settingsManager = new SettingsManager(options);
    this.benchmarkRunner = new BenchmarkRunner(options);
  }

  /**
   * Main benchmark workflow
   */
  async run() {
    try {
      this.logger.info(chalk.bold('🏃 Starting Backbencher - AI Assistant Benchmarking Tool'));
      
      // Step 1: Repository Selection
      this.logger.step(1, 8, 'Repository Selection');
      const repositoryPath = await this.repositorySelector.selectRepository(this.options.repository);
      
      // Step 2: Environment Configuration
      this.logger.step(2, 8, 'Environment Configuration');
      await this.environmentConfig.configure();
      
      // Step 3: Settings Management
      this.logger.step(3, 8, 'Settings Management');
      await this.settingsManager.ensureSettings();
      
      // Step 4: Settings Validation
      this.logger.step(4, 8, 'Settings Validation');
      const settings = await this.settingsManager.validateSettings();
      
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
      await this.saveResults(results, settings.output_filename);
      
      // Step 8: Completion
      this.logger.step(8, 8, 'Completion');
      this.logger.success(`Benchmark completed! Results saved to ${settings.output_filename}`);
      
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
      this.logger.info(chalk.bold('🔧 Initializing Backbencher configuration'));
      
      await this.settingsManager.createTemplateSettings(this.options.force);
      await this.environmentConfig.createTemplateEnv(this.options.force);
      
      this.logger.success('Configuration files created successfully!');
      this.logger.info('Next steps:');
      this.logger.info('1. Update .env with your LLM endpoint and API key');
      this.logger.info('2. Customize settings.json with your prompts and preferences');
      this.logger.info('3. Run: backbencher benchmark');
      
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
      this.logger.info(chalk.bold('✅ Validating Backbencher configuration'));
      
      // Validate environment
      await this.environmentConfig.validate();
      this.logger.success('Environment configuration is valid');
      
      // Validate settings
      const settings = await this.settingsManager.validateSettings();
      this.logger.success('Settings configuration is valid');
      
      this.logger.info('Configuration summary:');
      this.logger.info(`- Prompts: ${settings.num_prompts}`);
      this.logger.info(`- Assistants: ${settings.assistants.join(', ')}`);
      this.logger.info(`- Runs per prompt: ${settings.runs_per_prompt}`);
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
    this.logger.info(`Output file: ${settings.output_filename}`);
    
    const { confirmed } = await inquirer.prompt([
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
   * Save benchmark results to file
   */
  async saveResults(results, outputFilename) {
    const metadata = {
      platform: this.platform.getPlatformInfo(),
      timestamp: new Date().toISOString(),
      settings: outputFilename
    };

    await this.resultsStorage.saveResults(results, outputFilename, metadata);
  }
}

module.exports = { BenchmarkCLI };
