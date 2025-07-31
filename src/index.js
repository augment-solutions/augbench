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
      .option('-r, --repository <path>', 'Git repository path for context')
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
      .description('Validate configuration and settings')
      .option('-s, --settings <path>', 'Path to settings.json file')
      .action(async (options) => {
        const cli = new BenchmarkCLI({
          verbose: program.opts().verbose,
          quiet: program.opts().quiet,
          ...options
        });
        
        await cli.validate();
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
