/**
 * Cross-platform compatibility utilities
 */

const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Logger } = require('./Logger');

class Platform {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.platform = os.platform();
    this.isWindows = this.platform === 'win32';
    this.isMacOS = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
  }

  /**
   * Get platform information
   * 
   * @returns {Object} - Platform information
   */
  getPlatformInfo() {
    return {
      platform: this.platform,
      arch: os.arch(),
      release: os.release(),
      isWindows: this.isWindows,
      isMacOS: this.isMacOS,
      isLinux: this.isLinux,
      nodeVersion: process.version,
      homeDir: os.homedir(),
      tmpDir: os.tmpdir()
    };
  }

  /**
   * Normalize file path for current platform
   * 
   * @param {string} filePath - Path to normalize
   * @returns {string} - Normalized path
   */
  normalizePath(filePath) {
    if (!filePath) {
      return filePath;
    }
    
    // Convert forward slashes to platform-specific separators
    let normalized = filePath.replace(/\//g, path.sep);
    
    // Handle Windows drive letters
    if (this.isWindows) {
      // Convert Unix-style absolute paths to Windows style
      if (normalized.startsWith(path.sep)) {
        normalized = 'C:' + normalized;
      }
    }
    
    return path.normalize(normalized);
  }

  /**
   * Get executable name with platform-specific extension
   * 
   * @param {string} baseName - Base executable name
   * @returns {string} - Platform-specific executable name
   */
  getExecutableName(baseName) {
    if (this.isWindows && !baseName.endsWith('.exe')) {
      return baseName + '.exe';
    }
    return baseName;
  }

  /**
   * Get command with platform-specific shell
   * 
   * @param {string} command - Command to execute
   * @returns {Object} - Command object with cmd and args
   */
  getShellCommand(command) {
    if (this.isWindows) {
      return {
        cmd: 'cmd',
        args: ['/c', command]
      };
    } else {
      return {
        cmd: 'sh',
        args: ['-c', command]
      };
    }
  }

  /**
   * Spawn a process with platform-specific options
   * 
   * @param {string} command - Command to execute
   * @param {string[]} args - Command arguments
   * @param {Object} options - Spawn options
   * @returns {ChildProcess} - Spawned process
   */
  spawnProcess(command, args = [], options = {}) {
    const platformOptions = {
      ...options,
      shell: this.isWindows ? true : options.shell
    };
    
    // On Windows, handle command extensions
    if (this.isWindows) {
      command = this.getExecutableName(command);
    }
    
    this.logger.debug(`Spawning process: ${command} ${args.join(' ')}`);
    
    return spawn(command, args, platformOptions);
  }

  /**
   * Get environment variable with platform-specific defaults
   * 
   * @param {string} name - Environment variable name
   * @param {string} defaultValue - Default value
   * @returns {string} - Environment variable value
   */
  getEnvVar(name, defaultValue = '') {
    // Windows environment variables are case-insensitive
    if (this.isWindows) {
      const upperName = name.toUpperCase();
      return process.env[upperName] || process.env[name] || defaultValue;
    }
    
    return process.env[name] || defaultValue;
  }

  /**
   * Get platform-specific temporary directory
   * 
   * @param {string} prefix - Directory prefix
   * @returns {string} - Temporary directory path
   */
  getTempDir(prefix = 'augbench') {
    const tempBase = os.tmpdir();
    const tempDir = path.join(tempBase, `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    return this.normalizePath(tempDir);
  }

  /**
   * Get platform-specific configuration directory
   * 
   * @param {string} appName - Application name
   * @returns {string} - Configuration directory path
   */
  getConfigDir(appName = 'augbench') {
    let configDir;
    
    if (this.isWindows) {
      configDir = path.join(this.getEnvVar('APPDATA', os.homedir()), appName);
    } else if (this.isMacOS) {
      configDir = path.join(os.homedir(), 'Library', 'Application Support', appName);
    } else {
      // Linux and other Unix-like systems
      const xdgConfigHome = this.getEnvVar('XDG_CONFIG_HOME', path.join(os.homedir(), '.config'));
      configDir = path.join(xdgConfigHome, appName);
    }
    
    return this.normalizePath(configDir);
  }

  /**
   * Check if a command is available in PATH
   * 
   * @param {string} command - Command to check
   * @returns {Promise<boolean>} - Whether command is available
   */
  async isCommandAvailable(command) {
    return new Promise((resolve) => {
      const testCommand = this.isWindows ? 'where' : 'which';
      const testArgs = [command];
      
      const child = this.spawnProcess(testCommand, testArgs, {
        stdio: ['ignore', 'ignore', 'ignore']
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get platform-specific line ending
   * 
   * @returns {string} - Line ending for current platform
   */
  getLineEnding() {
    return this.isWindows ? '\r\n' : '\n';
  }

  /**
   * Convert text to platform-specific line endings
   * 
   * @param {string} text - Text to convert
   * @returns {string} - Text with platform-specific line endings
   */
  convertLineEndings(text) {
    const lineEnding = this.getLineEnding();
    
    // Normalize to \n first, then convert to platform-specific
    return text.replace(/\r\n|\r|\n/g, '\n').replace(/\n/g, lineEnding);
  }

  /**
   * Get platform-specific file permissions
   * 
   * @param {string} type - Permission type ('read', 'write', 'execute')
   * @returns {number} - File permission mode
   */
  getFilePermissions(type) {
    if (this.isWindows) {
      // Windows doesn't use Unix-style permissions
      return 0o666;
    }
    
    switch (type) {
      case 'read':
        return 0o644;
      case 'write':
        return 0o644;
      case 'execute':
        return 0o755;
      default:
        return 0o644;
    }
  }

  /**
   * Get platform-specific process termination signal
   * 
   * @returns {string} - Termination signal
   */
  getTerminationSignal() {
    return this.isWindows ? 'SIGTERM' : 'SIGTERM';
  }

  /**
   * Kill a process with platform-specific method
   * 
   * @param {number} pid - Process ID
   * @param {string} signal - Signal to send
   * @returns {Promise<boolean>} - Whether process was killed
   */
  async killProcess(pid, signal = null) {
    return new Promise((resolve) => {
      try {
        const killSignal = signal || this.getTerminationSignal();
        process.kill(pid, killSignal);
        resolve(true);
      } catch (error) {
        this.logger.warn(`Failed to kill process ${pid}: ${error.message}`);
        resolve(false);
      }
    });
  }

  /**
   * Get platform-specific maximum path length
   * 
   * @returns {number} - Maximum path length
   */
  getMaxPathLength() {
    if (this.isWindows) {
      return 260; // Windows MAX_PATH
    } else {
      return 4096; // Unix PATH_MAX
    }
  }

  /**
   * Validate path length for current platform
   * 
   * @param {string} filePath - Path to validate
   * @throws {Error} - If path is too long
   */
  validatePathLength(filePath) {
    const maxLength = this.getMaxPathLength();
    if (filePath.length > maxLength) {
      throw new Error(`Path too long for ${this.platform}: ${filePath.length} > ${maxLength}`);
    }
  }
}

module.exports = { Platform };
