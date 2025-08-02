/**
 * Backbencher - Main Entry Point
 * Cross-platform Node.js CLI benchmarking tool for AI coding assistants
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { BenchmarkCLI } = require('./cli/BenchmarkCLI');
const { Logger } = require('./utils/Logger');

const program = new Command();
const logger = new Logger();

function metricsConfigHelp() {
  return {
    agent_success: {
      threshold: 'Number 0-10 (default 7). When mode=quality, success means output_quality >= threshold',
      mode: "'quality' or 'completion' (default 'quality'). When 'completion', success means run had no error"
    },
    output_format: {
      regex: 'Optional string regex to validate assistant output (pass=1, fail=0)',
      json_schema_path: 'Optional path to a JSON Schema file; output must be valid JSON matching schema'
    }
  };
}

/**
 * Main CLI function
 */
async function main() {
  try {
    // Configure the CLI program
    program
      .name('backbencher')
      .description('Cross-platform CLI benchmarking tool for AI coding assistants')
      .version('1.0.0')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('-q, --quiet', 'Suppress non-essential output')
      .option('--config <path>', 'Path to configuration file')
      .option('--output <path>', 'Output directory for results');

    // Add benchmark command
    program
      .command('benchmark')
      .description('Run benchmark tests on AI coding assistants')
      // Backward-compat alias for local path
      .option('-r, --repository <path>', 'Local repository path for context (alias of --repo-path)')
      // New repository sourcing options
      .option('--repo-path <path>', 'Local repository path for benchmarking context')
      .option('--repo-url <url>', 'Remote Git repository URL (HTTPS or SSH)')
      .option('--branch <name>', 'Branch to use when cloning a remote repository')
      .option('--ref <ref>', 'Git ref (commit SHA or tag) to checkout after clone')
      .option('--stage-dir <dir>', 'Staging directory for per-assistant working copies (default: ./stage)')
      .option('-s, --settings <path>', 'Path to settings.json file')
      .option('--dry-run', 'Validate configuration without running benchmarks')
      .action(async (options) => {
        const cli = new BenchmarkCLI({
          verbose: program.opts().verbose,
          quiet: program.opts().quiet,
          config: program.opts().config,
          output: program.opts().output,
          ...options
        });

        await cli.run();
      });

    // Add init command for creating template files
    program
      .command('init')
      .description('Initialize backbencher configuration files')
      .option('-f, --force', 'Overwrite existing files')
      .action(async (options) => {
        const cli = new BenchmarkCLI({
          verbose: program.opts().verbose,
          quiet: program.opts().quiet,
          ...options
        });

        await cli.init();
      });

    // Add validate command
    program
      .command('validate')
      .description('Validate env, settings, LLM connectivity, Git installation/connectivity, and optional repository access.')
      .option('-s, --settings <path>', 'Path to settings.json file')
      // Backward-compat alias for local path
      .option('-r, --repository <path>', 'Local repository path for context (alias of --repo-path)')
      // New repository sourcing options
      .option('--repo-path <path>', 'Local repository path for benchmarking context')
      .option('--repo-url <url>', 'Remote Git repository URL (HTTPS or SSH)')
      .option('--branch <name>', 'Branch to use when validating a remote repository')
      .option('--ref <ref>', 'Git ref (commit SHA or tag) to validate')
      .option('--stage-dir <dir>', 'Staging directory (default: ./stage)')
      .action(async (options) => {
        const cli = new BenchmarkCLI({
          verbose: program.opts().verbose,
          quiet: program.opts().quiet,
          ...options
        });

        await cli.validate();
      });

    // Add metrics command to list available metrics and config options
    program
      .command('metrics')
      .description('List available metrics and configuration options')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        const { MetricsFactory } = require('./metrics/MetricsFactory');
        const factory = new MetricsFactory({ verbose: program.opts().verbose, quiet: program.opts().quiet });
        const metricsInfo = factory.getAllMetricsInfo();
        if (options.json) {
          console.log(JSON.stringify({ metrics: metricsInfo, metrics_config: metricsConfigHelp() }, null, 2));
          return;
        }
        console.log(chalk.bold('\nAvailable metrics:'));
        for (const info of metricsInfo) {
          console.log(`- ${info.name}: ${info.description} [type=${info.type}]${info.unit ? `, unit=${info.unit}` : ''}`);
        }
        console.log('\nmetrics_config options:');
        const config = metricsConfigHelp();
        for (const [section, details] of Object.entries(config)) {
          console.log(`- ${section}:`);
          for (const [key, val] of Object.entries(details)) {
            console.log(`   ${key}: ${val}`);
          }
        }
      });

    // Parse command line arguments
    await program.parseAsync(process.argv);

    // If no command provided, show help
    if (!process.argv.slice(2).length) {
      program.outputHelp();
    }

  } catch (error) {
    logger.error('Application error:', error.message);
    if (program.opts().verbose) {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Export for testing and bin script
module.exports = { main };

// Run if called directly
if (require.main === module) {
  main();
}
