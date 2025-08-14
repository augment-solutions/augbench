/**
 * Basic tests for Augbench CLI tool
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

describe('Augbench CLI', function() {
  this.timeout(10000);
  
  const testDir = path.join(__dirname, 'temp');
  const originalCwd = process.cwd();
  
  beforeEach(async function() {
    // Create temporary test directory
    await fs.ensureDir(testDir);
    process.chdir(testDir);
  });
  
  afterEach(async function() {
    // Clean up
    process.chdir(originalCwd);
    await fs.remove(testDir);
  });
  
  describe('init command', function() {
    it('should create configuration files', function(done) {
      const child = spawn('node', [path.join(__dirname, '../src/index.js'), 'init'], {
        stdio: 'pipe'
      });
      
      child.on('close', async (code) => {
        try {
          expect(code).to.equal(0);
          
          // Check if files were created
          const settingsExists = await fs.pathExists('settings.json');
          const envExists = await fs.pathExists('.env');
          
          expect(settingsExists).to.be.true;
          expect(envExists).to.be.true;
          
          // Check settings.json content
          const settings = await fs.readJSON('settings.json');
          expect(settings).to.have.property('num_prompts');
          expect(settings).to.have.property('prompts');
          expect(settings).to.have.property('assistants');
          expect(settings).to.have.property('runs_per_prompt');
          expect(settings).to.have.property('output_filename');
          expect(settings).to.have.property('metrics');
          
          done();
        } catch (error) {
          done(error);
        }
      });
      
      child.on('error', done);
    });
  });
  
  describe('validate command', function() {
    it('should validate configuration files', function(done) {
      // First create config files
      const initChild = spawn('node', [path.join(__dirname, '../src/index.js'), 'init'], {
        stdio: 'pipe'
      });
      
      initChild.on('close', (code) => {
        if (code !== 0) {
          return done(new Error('Init command failed'));
        }
        
        // Then validate
        const validateChild = spawn('node', [path.join(__dirname, '../src/index.js'), 'validate'], {
          stdio: 'pipe'
        });
        
        validateChild.on('close', (validateCode) => {
          // Should fail because environment variables are not set
          expect(validateCode).to.equal(1);
          done();
        });
        
        validateChild.on('error', done);
      });
      
      initChild.on('error', done);
    });
  });
  
  describe('help command', function() {
    it('should display help information', function(done) {
      const child = spawn('node', [path.join(__dirname, '../src/index.js'), '--help'], {
        stdio: 'pipe'
      });
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        expect(code).to.equal(0);
        expect(output).to.include('Cross-platform CLI benchmarking tool');
        expect(output).to.include('benchmark');
        expect(output).to.include('init');
        expect(output).to.include('validate');
        expect(output).to.include('metrics');
        done();
      });
      
      child.on('error', done);
    });
  });
});

describe('Utility Classes', function() {
  const { Logger } = require('../src/utils/Logger');
  const { FileSystem } = require('../src/utils/FileSystem');
  const { Platform } = require('../src/utils/Platform');
  const { ErrorHandler } = require('../src/utils/ErrorHandler');
  const { Validator } = require('../src/utils/Validator');
  
  describe('Logger', function() {
    it('should create logger instance', function() {
      const logger = new Logger();
      expect(logger).to.be.instanceOf(Logger);
      expect(logger).to.have.property('info');
      expect(logger).to.have.property('error');
      expect(logger).to.have.property('warn');
      expect(logger).to.have.property('debug');
      expect(logger).to.have.property('success');
    });
  });
  
  describe('FileSystem', function() {
    it('should create filesystem instance', function() {
      const fs = new FileSystem();
      expect(fs).to.be.instanceOf(FileSystem);
      expect(fs).to.have.property('exists');
      expect(fs).to.have.property('readJSON');
      expect(fs).to.have.property('writeJSON');
      expect(fs).to.have.property('readText');
      expect(fs).to.have.property('writeText');
    });
  });
  
  describe('Platform', function() {
    it('should create platform instance', function() {
      const platform = new Platform();
      expect(platform).to.be.instanceOf(Platform);
      expect(platform).to.have.property('getPlatformInfo');
      expect(platform).to.have.property('normalizePath');
      expect(platform).to.have.property('getExecutableName');
    });
    
    it('should return platform information', function() {
      const platform = new Platform();
      const info = platform.getPlatformInfo();
      expect(info).to.have.property('platform');
      expect(info).to.have.property('arch');
      expect(info).to.have.property('isWindows');
      expect(info).to.have.property('isMacOS');
      expect(info).to.have.property('isLinux');
    });
  });
  
  describe('ErrorHandler', function() {
    it('should create error handler instance', function() {
      const errorHandler = new ErrorHandler();
      expect(errorHandler).to.be.instanceOf(ErrorHandler);
      expect(errorHandler).to.have.property('handleError');
      expect(errorHandler).to.have.property('categorizeError');
      expect(errorHandler).to.have.property('isRecoverable');
    });
    
    it('should categorize errors correctly', function() {
      const errorHandler = new ErrorHandler();
      
      const fileError = new Error('ENOENT: no such file or directory');
      fileError.code = 'ENOENT';
      const fileErrorInfo = errorHandler.categorizeError(fileError, 'test');
      expect(fileErrorInfo.category).to.equal('file_not_found');
      expect(fileErrorInfo.severity).to.equal('high');
      
      const timeoutError = new Error('Request timeout');
      const timeoutErrorInfo = errorHandler.categorizeError(timeoutError, 'test');
      expect(timeoutErrorInfo.category).to.equal('timeout');
      expect(timeoutErrorInfo.severity).to.equal('medium');
    });
  });
  
  describe('Validator', function() {
    it('should create validator instance', function() {
      const validator = new Validator();
      expect(validator).to.be.instanceOf(Validator);
      expect(validator).to.have.property('validateUrl');
      expect(validator).to.have.property('validateApiKey');
      expect(validator).to.have.property('validateSettings');
    });
    
    it('should validate URLs correctly', function() {
      const validator = new Validator();
      
      expect(() => validator.validateUrl('https://api.openai.com/v1')).to.not.throw();
      expect(() => validator.validateUrl('http://localhost:3000')).to.not.throw();
      expect(() => validator.validateUrl('invalid-url')).to.throw();
      expect(() => validator.validateUrl('ftp://example.com')).to.throw();
    });
    
    it('should validate API keys correctly', function() {
      const validator = new Validator();
      
      expect(() => validator.validateApiKey('sk-1234567890abcdef')).to.not.throw();
      expect(() => validator.validateApiKey('short')).to.throw();
      expect(() => validator.validateApiKey('key with spaces')).to.throw();
      expect(() => validator.validateApiKey('your-api-key-here')).to.throw();
    });
  });
});
