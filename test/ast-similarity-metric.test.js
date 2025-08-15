/**
 * Tests for ASTSimilarityMetric class
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const fs = require('fs-extra');
const path = require('path');
const { ASTSimilarityMetric } = require('../src/metrics/ASTSimilarityMetric');

describe('ASTSimilarityMetric', function() {
  this.timeout(10000);
  
  let metric;
  let testDir;
  let agentDir;
  let humanDir;
  
  beforeEach(async function() {
    testDir = path.join(__dirname, 'temp-ast-metric');
    agentDir = path.join(testDir, 'agent');
    humanDir = path.join(testDir, 'human');
    
    await fs.ensureDir(agentDir);
    await fs.ensureDir(humanDir);
    
    metric = new ASTSimilarityMetric('ast_similarity', {
      verbose: false,
      quiet: true
    });
  });
  
  afterEach(async function() {
    await fs.remove(testDir);
  });
  
  describe('constructor', function() {
    it('should create ASTSimilarityMetric instance', function() {
      expect(metric).to.be.instanceOf(ASTSimilarityMetric);
      expect(metric.name).to.equal('ast_similarity');
      expect(metric.description).to.include('Abstract Syntax Trees');
      expect(metric.unit).to.equal('score');
      expect(metric.minScore).to.equal(1);
      expect(metric.maxScore).to.equal(10);
    });
  });
  
  describe('getLanguageFromExtension', function() {
    it('should map file extensions to languages correctly', function() {
      const testCases = [
        { ext: '.js', expected: 'JavaScript' },
        { ext: '.ts', expected: 'TypeScript' },
        { ext: '.jsx', expected: 'React' },
        { ext: '.tsx', expected: 'React TypeScript' },
        { ext: '.py', expected: 'Python' },
        { ext: '.java', expected: 'Java' },
        { ext: '.cpp', expected: 'C++' },
        { ext: '.c', expected: 'C' },
        { ext: '.cs', expected: 'C#' },
        { ext: '.go', expected: 'Go' },
        { ext: '.rs', expected: 'Rust' },
        { ext: '.php', expected: 'PHP' },
        { ext: '.rb', expected: 'Ruby' },
        { ext: '.unknown', expected: 'Unknown' }
      ];
      
      testCases.forEach(({ ext, expected }) => {
        const result = metric.getLanguageFromExtension(ext);
        expect(result).to.equal(expected);
      });
    });
  });
  
  describe('extractCodeElements', function() {
    it('should extract JavaScript functions and classes', function() {
      const jsCode = `
        function testFunction() {
          return 'test';
        }
        
        const arrowFunc = () => {
          console.log('arrow');
        };
        
        class TestClass {
          constructor() {
            this.value = 42;
          }
        }
        
        export default TestClass;
        import React from 'react';
      `;
      
      const elements = metric.extractCodeElements(jsCode, '.js');
      
      expect(elements.functions).to.include('testFunction');
      expect(elements.functions).to.include('arrowFunc');
      expect(elements.classes).to.include('TestClass');
      expect(elements.exports).to.include('TestClass');
      expect(elements.imports).to.include('react');
    });
    
    it('should extract Python functions and classes', function() {
      const pythonCode = `
        def test_function():
            return "test"
        
        class TestClass:
            def __init__(self):
                self.value = 42
        
        import os
        from datetime import datetime
      `;
      
      const elements = metric.extractCodeElements(pythonCode, '.py');
      
      expect(elements.functions).to.include('test_function');
      expect(elements.classes).to.include('TestClass');
      expect(elements.imports).to.include('datetime');
    });
    
    it('should handle empty code', function() {
      const elements = metric.extractCodeElements('', '.js');
      
      expect(elements.functions).to.be.an('array').that.is.empty;
      expect(elements.classes).to.be.an('array').that.is.empty;
      expect(elements.imports).to.be.an('array').that.is.empty;
      expect(elements.exports).to.be.an('array').that.is.empty;
    });
  });
  
  describe('getAllCodeFiles', function() {
    it('should find code files in directory', async function() {
      // Create test files
      await fs.writeFile(path.join(agentDir, 'test.js'), 'console.log("test");');
      await fs.writeFile(path.join(agentDir, 'test.py'), 'print("test")');
      await fs.writeFile(path.join(agentDir, 'README.md'), '# Test');
      await fs.writeFile(path.join(agentDir, 'package.json'), '{}');
      
      // Create subdirectory with code file
      const subDir = path.join(agentDir, 'src');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, 'index.js'), 'module.exports = {};');
      
      const files = await metric.getAllCodeFiles(agentDir);
      
      expect(files).to.be.an('array');
      expect(files).to.have.length(3);
      expect(files.some(f => f.endsWith('test.js'))).to.be.true;
      expect(files.some(f => f.endsWith('test.py'))).to.be.true;
      expect(files.some(f => f.endsWith('index.js'))).to.be.true;
      expect(files.some(f => f.endsWith('README.md'))).to.be.false;
    });
    
    it('should handle non-existent directory', async function() {
      const files = await metric.getAllCodeFiles('/nonexistent');
      expect(files).to.be.an('array').that.is.empty;
    });
  });
  
  describe('extractCodeStructure', function() {
    it('should extract structure from directory with code files', async function() {
      // Create test JavaScript file
      const jsContent = `
        import React from 'react';
        
        class Component extends React.Component {
          render() {
            return <div>Hello</div>;
          }
        }
        
        function helper() {
          return 'help';
        }
        
        export default Component;
      `;
      
      await fs.writeFile(path.join(agentDir, 'component.js'), jsContent);
      
      const structure = await metric.extractCodeStructure(agentDir);
      
      expect(structure.files).to.have.length(1);
      expect(structure.files[0].path).to.equal('component.js');
      expect(structure.files[0].extension).to.equal('.js');
      expect(structure.totalLines).to.be.greaterThan(0);
      expect(structure.languages).to.include('JavaScript');
      expect(structure.functions).to.include('helper');
      expect(structure.classes).to.include('Component');
      expect(structure.imports).to.include('react');
      expect(structure.exports).to.include('Component');
    });
    
    it('should handle empty directory', async function() {
      const structure = await metric.extractCodeStructure(agentDir);
      
      expect(structure.files).to.be.an('array').that.is.empty;
      expect(structure.totalLines).to.equal(0);
      expect(structure.languages).to.be.an('array').that.is.empty;
      expect(structure.functions).to.be.an('array').that.is.empty;
      expect(structure.classes).to.be.an('array').that.is.empty;
    });
  });
  
  describe('createAssessmentPrompt', function() {
    it('should create comprehensive assessment prompt', function() {
      const agentStructure = {
        files: [{ path: 'test.js', extension: '.js', lines: 50, size: 1000 }],
        totalLines: 50,
        languages: ['JavaScript'],
        functions: ['testFunc'],
        classes: ['TestClass'],
        imports: ['react'],
        exports: ['TestClass']
      };
      
      const humanStructure = {
        files: [{ path: 'test.js', extension: '.js', lines: 45, size: 900 }],
        totalLines: 45,
        languages: ['JavaScript'],
        functions: ['testFunction'],
        classes: ['TestClass'],
        imports: ['react'],
        exports: ['TestClass']
      };
      
      const prInfo = {
        title: 'Add React component',
        description: 'Implement a new React component for user interface'
      };
      
      const prompt = metric.createAssessmentPrompt(agentStructure, humanStructure, prInfo);
      
      expect(prompt).to.be.a('string');
      expect(prompt).to.include('code review expert');
      expect(prompt).to.include('Add React component');
      expect(prompt).to.include('File Structure Similarity');
      expect(prompt).to.include('Code Architecture');
      expect(prompt).to.include('Score: X - [explanation]');
      expect(prompt).to.include('JavaScript');
      expect(prompt).to.include('TestClass');
    });
  });
  
  describe('parseAssessmentResponse', function() {
    it('should parse standard response format', function() {
      const testCases = [
        { response: 'Score: 8 - Very similar structure', expected: 8 },
        { response: 'Score: 7.5 - Good similarity with minor differences', expected: 7.5 },
        { response: '9 - Excellent match', expected: 9 },
        { response: 'The score is 6 out of 10', expected: 6 }
      ];
      
      testCases.forEach(({ response, expected }) => {
        const result = metric.parseAssessmentResponse(response);
        expect(result).to.equal(expected);
      });
    });
    
    it('should throw error for unparseable response', function() {
      expect(() => {
        metric.parseAssessmentResponse('No score found in this response');
      }).to.throw('Could not parse assessment score');
    });
  });
  
  describe('measure', function() {
    it('should return null when required context is missing', async function() {
      const result = await metric.measure('test output', {});
      expect(result).to.be.null;
    });
    
    it('should return null when directories do not exist', async function() {
      const context = {
        agentWorkingDir: '/nonexistent/agent',
        humanReferenceDir: '/nonexistent/human',
        prInfo: { title: 'Test', description: 'Test PR' }
      };
      
      const result = await metric.measure('test output', context);
      expect(result).to.be.null;
    });
    
    it('should handle LLM call failure gracefully', async function() {
      // Create minimal test files
      await fs.writeFile(path.join(agentDir, 'test.js'), 'console.log("agent");');
      await fs.writeFile(path.join(humanDir, 'test.js'), 'console.log("human");');
      
      const context = {
        agentWorkingDir: agentDir,
        humanReferenceDir: humanDir,
        prInfo: { title: 'Test', description: 'Test PR' }
      };
      
      const result = await metric.measure('test output', context);
      expect(result).to.be.null;
    });
    
    it('should clamp scores to valid range', async function() {
      // Mock callLLM to return extreme values
      const originalCallLLM = metric.callLLM;
      
      // Test upper bound
      metric.callLLM = async () => 'Score: 15 - Extremely high score';
      
      await fs.writeFile(path.join(agentDir, 'test.js'), 'console.log("agent");');
      await fs.writeFile(path.join(humanDir, 'test.js'), 'console.log("human");');
      
      const context = {
        agentWorkingDir: agentDir,
        humanReferenceDir: humanDir,
        prInfo: { title: 'Test', description: 'Test PR' }
      };
      
      let result = await metric.measure('test output', context);
      expect(result).to.equal(10);
      
      // Test lower bound
      metric.callLLM = async () => 'Score: -5 - Extremely low score';
      result = await metric.measure('test output', context);
      expect(result).to.equal(1);
      
      metric.callLLM = originalCallLLM;
    });
  });
  
  describe('integration test', function() {
    it('should complete full workflow with mocked LLM', async function() {
      // Create test files with different structures
      const agentCode = `
        class UserService {
          constructor() {
            this.users = [];
          }
          
          addUser(user) {
            this.users.push(user);
          }
        }
        
        export default UserService;
      `;
      
      const humanCode = `
        class UserService {
          constructor() {
            this.users = new Map();
          }
          
          addUser(user) {
            this.users.set(user.id, user);
          }
          
          getUser(id) {
            return this.users.get(id);
          }
        }
        
        export default UserService;
      `;
      
      await fs.writeFile(path.join(agentDir, 'UserService.js'), agentCode);
      await fs.writeFile(path.join(humanDir, 'UserService.js'), humanCode);
      
      // Mock LLM response
      const originalCallLLM = metric.callLLM;
      metric.callLLM = async (prompt) => {
        expect(prompt).to.include('code review expert');
        expect(prompt).to.include('UserService');
        return 'Score: 7 - Similar class structure but different implementation details';
      };
      
      const context = {
        agentWorkingDir: agentDir,
        humanReferenceDir: humanDir,
        prInfo: {
          title: 'Add UserService class',
          description: 'Implement user management service'
        }
      };
      
      try {
        const result = await metric.measure('test output', context);
        expect(result).to.equal(7);
      } finally {
        metric.callLLM = originalCallLLM;
      }
    });
  });
});
