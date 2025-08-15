/**
 * Settings management for benchmark configuration
 */

const { prompt } = require('../utils/inquirerCompat');
const path = require('path');
const Joi = require('joi');
const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');

class SettingsManager {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.settingsPath = options.settingsPath || path.join(process.cwd(), 'settings.json');
    this.schema = this.createValidationSchema();
  }

  /**
   * Ensure settings.json exists and is configured
   */
  async ensureSettings() {
    this.logger.info('Checking settings configuration...');
    
    if (!(await this.fs.exists(this.settingsPath))) {
      this.logger.warn('settings.json not found');
      await this.createSettingsInteractively();
    } else {
      this.logger.info('settings.json found');
      await this.confirmSettingsUpdate();
    }
  }

  /**
   * Create settings.json interactively
   */
  async createSettingsInteractively() {
    const { createNow } = await prompt([
      {
        type: 'confirm',
        name: 'createNow',
        message: 'Would you like to create a settings.json file now?',
        default: true
      }
    ]);

    if (createNow) {
      await this.createTemplateSettings();
      this.logger.info('Please edit settings.json with your specific configuration');
      
      const { proceed } = await prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Have you updated the settings.json file?',
          default: false
        }
      ]);

      if (!proceed) {
        throw new Error('Settings configuration incomplete. Please update settings.json and try again.');
      }
    } else {
      throw new Error('settings.json is required to run benchmarks');
    }
  }

  /**
   * Ask user to confirm if settings have been updated
   */
  async confirmSettingsUpdate() {
    const { updated } = await prompt([
      {
        type: 'confirm',
        name: 'updated',
        message: 'Have you updated the benchmark settings in settings.json?',
        default: true
      }
    ]);

    if (!updated) {
      this.logger.info('Please review and update settings.json before proceeding');
    }
  }

  /**
   * Validate settings.json against schema
   */
  async validateSettings(cliOptions = {}) {
    this.logger.info('Validating settings configuration...');

    if (!(await this.fs.exists(this.settingsPath))) {
      throw new Error('settings.json file not found');
    }

    // Read and parse settings
    const settings = await this.fs.readJSON(this.settingsPath);

    // Create schema with CLI options context
    const schema = this.createValidationSchema(cliOptions);

    // Validate against schema
    const { error, value } = schema.validate(settings);
    if (error) {
      throw new Error(`Settings validation failed: ${error.details[0].message}`);
    }

    const mode = value.mode || 'standard';
    this.logger.info(`Detected benchmark mode: ${mode}`);

    // Mode-specific validations
    if (mode === 'standard') {
      await this.validateStandardMode(value);
    } else if (mode === 'pr_recreate') {
      await this.validatePRRecreateMode(value, cliOptions);
    }

    // Common validations
    await this.validateAssistants(value.assistants);

    // Metrics config warnings
    const mc = value.metrics_config || {};
    if (value.metrics.includes('output_format_success')) {
      const oc = mc.output_format || {};
      if (!oc.regex && !oc.json_schema_path) {
        this.logger.warn('Metric output_format_success is enabled but no regex or json_schema_path is configured under metrics_config.output_format');
      } else if (oc.json_schema_path) {
        const abs = this.fs.getAbsolutePath(oc.json_schema_path);
        if (!(await this.fs.exists(abs))) {
          this.logger.warn(`metrics_config.output_format.json_schema_path does not exist: ${oc.json_schema_path}`);
        }
      }
    }

    const as = mc.agent_success || {};
    if ((as.mode || 'quality') === 'quality' && !value.metrics.includes('output_quality')) {
      this.logger.warn('metrics_config.agent_success.mode is "quality" but output_quality metric is not enabled; agent_success_rate will be 0');
    }

    this.logger.success('Settings validation passed');
    return value;
  }

  /**
   * Validate standard mode specific settings
   */
  async validateStandardMode(settings) {
    this.logger.debug('Validating standard mode settings...');

    // Validate prompt files exist
    if (settings.prompts && settings.prompts.length > 0) {
      await this.validatePromptFiles(settings.prompts);
    }
  }

  /**
   * Validate PR recreation mode specific settings
   */
  async validatePRRecreateMode(settings, cliOptions = {}) {
    this.logger.debug('Validating PR recreation mode settings...');

    // Check if repository URL is provided via CLI or settings
    const repoUrl = cliOptions.repoUrl || settings.target_repo_url;
    if (!repoUrl) {
      throw new Error('Repository URL is required for PR recreation mode. Provide either --repo-url CLI argument or target_repo_url in settings.json');
    }

    // Validate repository URL format
    const gitUrlPattern = /^(https?:\/\/|git@)[\w\.-]+[\/:][\w\.-]+\/[\w\.-]+(\.git)?$/;
    if (!gitUrlPattern.test(repoUrl)) {
      throw new Error(`Invalid Git repository URL: ${repoUrl}`);
    }

    // Validate num_prs is reasonable
    if (settings.num_prs && settings.num_prs > 50) {
      this.logger.warn(`num_prs is set to ${settings.num_prs}. Processing many PRs may take significant time.`);
    }

    // Ensure PR recreation specific metrics are available
    const prMetrics = ['ast_similarity', 'instruction_adherence'];
    const missingMetrics = prMetrics.filter(metric => !settings.metrics.includes(metric));
    if (missingMetrics.length > 0) {
      this.logger.warn(`Recommended metrics for PR recreation mode are missing: ${missingMetrics.join(', ')}`);
    }
  }

  /**
   * Validate that prompt files exist and are readable
   */
  async validatePromptFiles(prompts) {
    for (const promptFile of prompts) {
      const promptPath = this.fs.getAbsolutePath(promptFile);
      
      if (!(await this.fs.exists(promptPath))) {
        throw new Error(`Prompt file not found: ${promptFile}`);
      }

      const stats = await this.fs.getStats(promptPath);
      if (!stats.isFile()) {
        throw new Error(`Prompt path is not a file: ${promptFile}`);
      }

      // Try to read the file to ensure it's readable
      try {
        await this.fs.readText(promptPath);
      } catch (error) {
        throw new Error(`Cannot read prompt file ${promptFile}: ${error.message}`);
      }
    }

    this.logger.debug(`Validated ${prompts.length} prompt files`);
  }

  /**
   * Validate that assistants are supported
   */
  async validateAssistants(assistants) {
    const supportedAssistants = ['Claude Code', 'Augment CLI', 'Cursor CLI']; // This will be expanded
    
    for (const assistant of assistants) {
      if (!supportedAssistants.includes(assistant)) {
        throw new Error(`Unsupported assistant: ${assistant}. Supported: ${supportedAssistants.join(', ')}`);
      }
    }

    this.logger.debug(`Validated ${assistants.length} assistants`);
  }

  /**
   * Create template settings.json file
   */
  async createTemplateSettings(force = false) {
    if (!force && await this.fs.exists(this.settingsPath)) {
      this.logger.info('settings.json already exists');
      return;
    }

    const template = {
      mode: "standard",
      num_prompts: 3,
      prompts: [
        "prompt1.md",
        "prompt2.md",
        "prompt3.md"
      ],
      assistants: [
        "Claude Code",
        "Augment CLI",
        "Cursor CLI"
      ],
      runs_per_prompt: 2,
      parallel_runs: 1,
      parallel_agents: true,
      output_filename: "bench_local",
      // Repository source (optional here; can be provided via CLI)
      // Exactly one of repo_url or repo_path should be set when using settings-only runs.
      repo_url: "",
      repo_path: "",
      stage_dir: "./stage",
      branch: "",
      ref: "",
      metrics: [
        "response_time",
        "output_quality",
        "output_format_success",
        "instruction_adherence",
        "context_adherence",
        "steps_per_task"
      ],
      metrics_config: {
        agent_success: { threshold: 7, mode: "quality" },
        output_format: { regex: "^.{1,}$" }
      }
    };

    await this.fs.writeJSON(this.settingsPath, template);
    this.logger.success(`Created template settings.json: ${this.settingsPath}`);
  }

  /**
   * Create Joi validation schema for settings
   */
  createValidationSchema(cliOptions = {}) {
    return Joi.object({
      // Mode selection field
      mode: Joi.string().valid('standard', 'pr_recreate').default('standard')
        .description('Benchmark mode: "standard" for traditional prompts, "pr_recreate" for PR recreation'),

      // Standard mode fields (conditionally required)
      num_prompts: Joi.when('mode', {
        is: 'standard',
        then: Joi.number().integer().min(1).required(),
        otherwise: Joi.number().integer().min(1).optional()
      }).description('Number of prompts to use'),

      prompts: Joi.when('mode', {
        is: 'standard',
        then: Joi.array().items(Joi.string().min(1)).min(1).required(),
        otherwise: Joi.array().items(Joi.string().min(1)).optional()
      }).description('Array of prompt file paths'),

      // PR recreation mode fields (conditionally required)
      num_prs: Joi.when('mode', {
        is: 'pr_recreate',
        then: Joi.number().integer().min(1).required(),
        otherwise: Joi.number().integer().min(1).optional()
      }).description('Number of recent PRs to recreate (PR recreation mode only)'),

      // target_repo_url is optional if --repo-url CLI argument is provided
      target_repo_url: Joi.string().optional()
        .description('Target repository URL for PR analysis (PR recreation mode only)'),

      // Common fields (always required)
      assistants: Joi.array().items(Joi.string().min(1)).min(1).required()
        .description('Array of assistant names'),

      runs_per_prompt: Joi.number().integer().min(1).required()
        .description('Number of runs per prompt-assistant combination'),

      parallel_runs: Joi.number().integer().min(1).default(1)
        .description('Maximum number of concurrent runs per agent (default: 1)'),

      parallel_agents: Joi.boolean().default(true)
        .description('Whether to run multiple agents in parallel for the same prompt (default: true)'),

      output_filename: Joi.string().min(1).required()
        .description('Output filename for results'),

      // Repository fields (for standard mode)
      repo_url: Joi.string().allow(''),
      repo_path: Joi.string().allow(''),
      stage_dir: Joi.string().default('./stage'),
      branch: Joi.string().allow(''),
      ref: Joi.string().allow(''),

      metrics: Joi.array().items(Joi.string().min(1)).min(1).required()
        .description('Array of metric names to measure'),

      metrics_config: Joi.object({
        agent_success: Joi.object({
          threshold: Joi.number().min(0).max(10).default(7),
          mode: Joi.string().valid('quality', 'completion').default('quality')
        }).default({}),
        output_format: Joi.object({
          regex: Joi.string(),
          json_schema_path: Joi.string()
        }).default({})
      }).default({})
    }).custom((value, helpers) => {
      const mode = value.mode || 'standard';

      // Standard mode validations
      if (mode === 'standard') {
        // Validate that num_prompts matches prompts array length
        if (value.num_prompts && value.prompts && value.num_prompts !== value.prompts.length) {
          return helpers.error('custom.promptsLength');
        }
        // If repo fields provided, enforce xor
        const hasUrl = value.repo_url && value.repo_url.trim() !== '';
        const hasPath = value.repo_path && value.repo_path.trim() !== '';
        if (hasUrl && hasPath) {
          return helpers.error('custom.repoXor');
        }
      }

      // PR recreation mode validations
      if (mode === 'pr_recreate') {
        // Check if repository URL is provided via CLI or settings
        const hasCliRepoUrl = cliOptions && cliOptions.repoUrl;
        const hasSettingsRepoUrl = value.target_repo_url;

        if (!hasCliRepoUrl && !hasSettingsRepoUrl) {
          return helpers.error('custom.repoUrlRequired');
        }

        // Validate repository URL format if provided in settings
        if (hasSettingsRepoUrl) {
          const gitUrlPattern = /^(https?:\/\/|git@)[\w\.-]+[\/:][\w\.-]+\/[\w\.-]+(\.git)?$/;
          if (!gitUrlPattern.test(value.target_repo_url)) {
            return helpers.error('custom.invalidGitUrl');
          }
        }
      }

      return value;
    }).messages({
      'custom.promptsLength': 'num_prompts must match the length of prompts array',
      'custom.repoXor': 'Exactly one of repo_url or repo_path may be set in settings.json',
      'custom.invalidGitUrl': 'target_repo_url must be a valid Git repository URL',
      'custom.repoUrlRequired': 'Repository URL is required for PR recreation mode. Provide either --repo-url CLI argument or target_repo_url in settings.json'
    });
  }

  /**
   * Display current settings
   */
  async displaySettings() {
    if (!(await this.fs.exists(this.settingsPath))) {
      this.logger.warn('settings.json not found');
      return;
    }

    const settings = await this.fs.readJSON(this.settingsPath);
    const mode = settings.mode || 'standard';

    this.logger.info('Current settings:');
    this.logger.info(`- Mode: ${mode}`);

    if (mode === 'standard') {
      this.logger.info(`- Prompts: ${settings.prompts?.join(', ') || 'None'}`);
    } else if (mode === 'pr_recreate') {
      this.logger.info(`- Target repository: ${settings.target_repo_url || 'Not set'}`);
      this.logger.info(`- Number of PRs: ${settings.num_prs || 'Not set'}`);
    }

    this.logger.info(`- Assistants: ${settings.assistants?.join(', ') || 'None'}`);
    this.logger.info(`- Runs per prompt: ${settings.runs_per_prompt || 'Not set'}`);
    this.logger.info(`- Output file: ${settings.output_filename || 'Not set'}`);
    this.logger.info(`- Metrics: ${settings.metrics?.join(', ') || 'None'}`);
  }
}

module.exports = { SettingsManager };
