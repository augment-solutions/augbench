/**
 * Logger utility for consistent logging across the application
 */

const chalk = require('chalk');
const fs = require('fs');

class Logger {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.quiet = options.quiet || false;
    this.prefix = options.prefix || 'backbencher';
    this.logFile = options.logFile || options['log-file'];
    this.stream = this.logFile ? fs.createWriteStream(this.logFile, { flags: 'a' }) : null;
  }

  /**
   * Log an info message
   */
  writeToFile(level, message, args) {
    if (!this.stream) return;
    try {
      const ts = new Date().toISOString();
      const line = `[${ts}] [${this.prefix}] [${level}] ` + [message, ...args].map(a => String(a)).join(' ') + '\n';
      this.stream.write(line);
    } catch (_) { /* ignore file write errors */ }
  }

  info(message, ...args) {
    if (!this.quiet) {
      console.log(chalk.blue(`[${this.prefix}]`), message, ...args);
    }
    this.writeToFile('INFO', message, args);
  }

  /**
   * Log a success message
   */
  success(message, ...args) {
    if (!this.quiet) {
      console.log(chalk.green(`[${this.prefix}]`), chalk.green('✓'), message, ...args);
    }
    this.writeToFile('SUCCESS', message, args);
  }

  /**
   * Log a warning message
   */
  warn(message, ...args) {
    console.warn(chalk.yellow(`[${this.prefix}]`), chalk.yellow('⚠'), message, ...args);
    this.writeToFile('WARN', message, args);
  }

  /**
   * Log an error message
   */
  error(message, ...args) {
    console.error(chalk.red(`[${this.prefix}]`), chalk.red('✗'), message, ...args);
    this.writeToFile('ERROR', message, args);
  }

  /**
   * Log a debug message (only in verbose mode)
   */
  debug(message, ...args) {
    if (this.verbose) {
      console.log(chalk.gray(`[${this.prefix}:debug]`), message, ...args);
    }
    this.writeToFile('DEBUG', message, args);
  }

  /**
   * Log a step in a process
   */
  step(step, total, message) {
    if (!this.quiet) {
      const progress = chalk.cyan(`[${step}/${total}]`);
      console.log(chalk.blue(`[${this.prefix}]`), progress, message);
    }
  }

  /**
   * Create a new logger with updated options
   */
  withOptions(options) {
    return new Logger({
      verbose: this.verbose,
      quiet: this.quiet,
      prefix: this.prefix,
      ...options
    });
  }
}

module.exports = { Logger };
