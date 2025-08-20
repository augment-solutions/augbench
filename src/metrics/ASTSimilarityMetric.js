/**
 * AST Similarity Metric - Compares Abstract Syntax Trees between agent output and actual PR code
 * Uses actual AST parsing libraries instead of LLM assessment
 */

const { AssessableMetric } = require('./AssessableMetric');
const { FileSystem } = require('../utils/FileSystem');
const path = require('path');
const fs = require('fs-extra');

// AST parsing libraries
const { parse: babelParse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

class ASTSimilarityMetric extends AssessableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Compares Abstract Syntax Trees between agent output and actual PR code using AST analysis (1-10 scale)',
      unit: 'score',
      ...options,
    });
    this.fs = new FileSystem(options);
    this.minScore = 1;
    this.maxScore = 10;

    // AST similarity weights for different aspects
    this.weights = {
      structure: 0.3,      // Overall code structure similarity
      functions: 0.25,     // Function signatures and organization
      classes: 0.2,        // Class structure and methods
      imports: 0.1,        // Import/dependency patterns
      complexity: 0.15     // Code complexity similarity
    };
  }

  /**
   * Measure AST similarity between agent output and human reference
   * @param {string} output - Agent output (not used directly, we use context)
   * @param {Object} context - Context containing paths and PR information
   * @returns {Promise<number>} - Similarity score (1-10)
   */
  async measure(_output, context = {}) {
    try {
      // Get paths from context
      const agentPath = context.agentWorkingDir;
      const humanPath = context.humanReferenceDir;
      const prInfo = context.prInfo;

      if (!agentPath || !humanPath || !prInfo) {
        this.logger.warn('Missing required context for AST similarity measurement');
        return null;
      }

      // Extract AST structures from both directories
      const agentAST = await this.extractASTStructure(agentPath);
      const humanAST = await this.extractASTStructure(humanPath);

      // Calculate similarity using AST analysis
      const similarity = this.calculateASTSimilarity(agentAST, humanAST);

      // Convert similarity (0-1) to score (1-10)
      const score = Math.round(1 + (similarity * 9));

      this.logger.debug(`AST similarity calculated: ${similarity.toFixed(3)} -> score: ${score}`);
      return Math.max(this.minScore, Math.min(this.maxScore, score));
    } catch (error) {
      this.logger.error(`AST similarity measurement failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract AST structure from a directory
   * @param {string} dirPath - Directory path to analyze
   * @returns {Promise<Object>} - AST structure information
   */
  async extractASTStructure(dirPath) {
    const structure = {
      files: [],
      totalNodes: 0,
      languages: new Set(),
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      complexity: 0,
      nodeTypes: new Map(),
      patterns: new Set()
    };

    if (!(await this.fs.exists(dirPath))) {
      return structure;
    }

    const files = await this.getAllCodeFiles(dirPath);

    for (const filePath of files) {
      try {
        const relativePath = path.relative(dirPath, filePath);
        const content = await this.fs.readText(filePath);
        const ext = path.extname(filePath).toLowerCase();

        // Parse file using appropriate AST parser
        const fileAST = await this.parseFileAST(content, ext, relativePath);

        if (fileAST) {
          structure.files.push({
            path: relativePath,
            extension: ext,
            ast: fileAST,
            nodeCount: fileAST.nodeCount || 0,
            complexity: fileAST.complexity || 0
          });

          structure.totalNodes += fileAST.nodeCount || 0;
          structure.complexity += fileAST.complexity || 0;
          structure.languages.add(this.getLanguageFromExtension(ext));

          // Merge AST elements
          if (fileAST.functions) structure.functions.push(...fileAST.functions);
          if (fileAST.classes) structure.classes.push(...fileAST.classes);
          if (fileAST.imports) structure.imports.push(...fileAST.imports);
          if (fileAST.exports) structure.exports.push(...fileAST.exports);
          if (fileAST.patterns) fileAST.patterns.forEach(p => structure.patterns.add(p));

          // Merge node type counts
          if (fileAST.nodeTypes) {
            fileAST.nodeTypes.forEach((count, type) => {
              structure.nodeTypes.set(type, (structure.nodeTypes.get(type) || 0) + count);
            });
          }
        }

      } catch (error) {
        this.logger.warn(`Failed to parse AST for file ${filePath}: ${error.message}`);
      }
    }

    structure.languages = Array.from(structure.languages);
    structure.patterns = Array.from(structure.patterns);
    return structure;
  }

  /**
   * Parse file content into AST structure
   * @param {string} content - File content
   * @param {string} ext - File extension
   * @param {string} filePath - File path for error reporting
   * @returns {Promise<Object|null>} - Parsed AST structure
   */
  async parseFileAST(content, ext, filePath) {
    try {
      switch (ext) {
        case '.js':
        case '.jsx':
          return this.parseJavaScriptAST(content, filePath);
        case '.ts':
        case '.tsx':
          return this.parseTypeScriptAST(content, filePath);
        case '.py':
          return this.parsePythonAST(content, filePath);
        default:
          // Fallback to basic parsing for other languages
          return this.parseGenericAST(content, ext, filePath);
      }
    } catch (error) {
      this.logger.warn(`Failed to parse ${ext} file ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse JavaScript/JSX using Babel
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Object} - AST structure
   */
  parseJavaScriptAST(content, filePath) {
    const ast = babelParse(content, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        'jsx',
        'objectRestSpread',
        'functionBind',
        'exportDefaultFrom',
        'decorators-legacy',
        'classProperties',
        'asyncGenerators',
        'functionSent',
        'dynamicImport'
      ]
    });

    return this.extractASTFeatures(ast, 'javascript', filePath);
  }

  /**
   * Parse TypeScript using Babel with TS plugin
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Object} - AST structure
   */
  parseTypeScriptAST(content, filePath) {
    const ast = babelParse(content, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      plugins: [
        'typescript',
        'jsx',
        'objectRestSpread',
        'functionBind',
        'exportDefaultFrom',
        'decorators-legacy',
        'classProperties',
        'asyncGenerators',
        'functionSent',
        'dynamicImport'
      ]
    });

    return this.extractASTFeatures(ast, 'typescript', filePath);
  }

  /**
   * Get all code files in a directory
   * @param {string} dirPath - Directory path
   * @returns {Promise<Array>} - Array of file paths
   */
  async getAllCodeFiles(dirPath) {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb'];
    const files = [];

    const walk = async (dir) => {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          await walk(fullPath);
        } else if (stat.isFile() && codeExtensions.includes(path.extname(item).toLowerCase())) {
          files.push(fullPath);
        }
      }
    };

    await walk(dirPath);
    return files;
  }

  /**
   * Extract features from AST using Babel traverse
   * @param {Object} ast - Babel AST
   * @param {string} language - Programming language
   * @param {string} filePath - File path
   * @returns {Object} - Extracted features
   */
  extractASTFeatures(ast, _language, _filePath) {
    const features = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      nodeTypes: new Map(),
      patterns: new Set(),
      complexity: 0,
      nodeCount: 0
    };

    // Helper function to calculate complexity
    const calculateComplexity = (path) => {
      let complexity = 1; // Base complexity

      path.traverse({
        IfStatement() { complexity++; },
        ConditionalExpression() { complexity++; },
        SwitchCase() { complexity++; },
        WhileStatement() { complexity++; },
        ForStatement() { complexity++; },
        ForInStatement() { complexity++; },
        ForOfStatement() { complexity++; },
        CatchClause() { complexity++; },
        LogicalExpression(logicalPath) {
          if (logicalPath.node.operator === '&&' || logicalPath.node.operator === '||') {
            complexity++;
          }
        }
      });

      return complexity;
    };

    // Traverse AST and extract features
    traverse(ast, {
      enter(path) {
        features.nodeCount++;
        const nodeType = path.node.type;
        features.nodeTypes.set(nodeType, (features.nodeTypes.get(nodeType) || 0) + 1);
      },

      FunctionDeclaration(path) {
        features.functions.push({
          name: path.node.id?.name || 'anonymous',
          params: path.node.params.length,
          async: path.node.async,
          generator: path.node.generator,
          type: 'declaration'
        });
        features.complexity += calculateComplexity(path);
      },

      ArrowFunctionExpression(path) {
        features.functions.push({
          name: 'arrow',
          params: path.node.params.length,
          async: path.node.async,
          type: 'arrow'
        });
        features.complexity += calculateComplexity(path);
      },

      ClassDeclaration(path) {
        const methods = [];
        path.traverse({
          ClassMethod(methodPath) {
            methods.push({
              name: methodPath.node.key.name,
              kind: methodPath.node.kind,
              static: methodPath.node.static,
              async: methodPath.node.async
            });
          }
        });

        features.classes.push({
          name: path.node.id?.name || 'anonymous',
          methods: methods.length,
          methodDetails: methods
        });
      },

      ImportDeclaration(path) {
        features.imports.push({
          source: path.node.source.value,
          specifiers: path.node.specifiers.length,
          type: 'import'
        });
      },

      ExportNamedDeclaration(path) {
        features.exports.push({
          type: 'named',
          specifiers: path.node.specifiers?.length || 0
        });
      },

      ExportDefaultDeclaration(_path) {
        features.exports.push({
          type: 'default'
        });
      }
    });

    // Add structural patterns
    this.addStructuralPatterns(features, ast);

    return features;
  }



  /**
   * Get programming language from file extension
   * @param {string} ext - File extension
   * @returns {string} - Language name
   */
  getLanguageFromExtension(ext) {
    const langMap = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.jsx': 'React',
      '.tsx': 'React TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby'
    };

    return langMap[ext] || 'Unknown';
  }

  /**
   * Parse Python using basic AST analysis (simplified)
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Object} - AST structure
   */
  parsePythonAST(content, _filePath) {
    // For Python, we'll use regex-based parsing since we don't have a Python AST parser in Node.js
    const features = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      nodeTypes: new Map(),
      patterns: new Set(),
      complexity: 0,
      nodeCount: 0
    };

    const lines = content.split('\n');
    features.nodeCount = lines.length;

    // Extract Python functions
    const functionRegex = /^\s*def\s+(\w+)\s*\(([^)]*)\):/;
    const classRegex = /^\s*class\s+(\w+)(?:\([^)]*\))?:/;
    const importRegex = /^\s*(?:from\s+(\S+)\s+)?import\s+(.+)/;

    for (const line of lines) {
      // Functions
      const funcMatch = line.match(functionRegex);
      if (funcMatch) {
        const params = funcMatch[2] ? funcMatch[2].split(',').length : 0;
        features.functions.push({
          name: funcMatch[1],
          params,
          type: 'function'
        });
        features.complexity += 1; // Base complexity
      }

      // Classes
      const classMatch = line.match(classRegex);
      if (classMatch) {
        features.classes.push({
          name: classMatch[1],
          methods: 0 // Would need more complex parsing
        });
      }

      // Imports
      const importMatch = line.match(importRegex);
      if (importMatch) {
        features.imports.push({
          source: importMatch[1] || 'builtin',
          modules: importMatch[2].split(',').map(m => m.trim())
        });
      }

      // Add complexity for control structures
      if (line.match(/^\s*(if|elif|while|for|try|except|with)\s/)) {
        features.complexity += 1;
      }
    }

    features.nodeTypes.set('line', lines.length);
    features.patterns.add('python_structure');

    return features;
  }

  /**
   * Parse generic files using basic patterns
   * @param {string} content - File content
   * @param {string} ext - File extension
   * @param {string} filePath - File path
   * @returns {Object} - Basic structure
   */
  parseGenericAST(content, ext, _filePath) {
    const features = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      nodeTypes: new Map(),
      patterns: new Set(),
      complexity: 0,
      nodeCount: content.split('\n').length
    };

    // Basic patterns for other languages
    const patterns = {
      '.java': {
        functions: /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/g,
        classes: /(?:public\s+)?class\s+(\w+)/g,
        imports: /import\s+([^;]+);/g
      }
    };

    const langPatterns = patterns[ext];
    if (langPatterns) {
      // Extract using regex patterns
      Object.keys(langPatterns).forEach(type => {
        const regex = langPatterns[type];
        let match;
        while ((match = regex.exec(content)) !== null) {
          if (type === 'functions') {
            features.functions.push({ name: match[1], type: 'function' });
          } else if (type === 'classes') {
            features.classes.push({ name: match[1] });
          } else if (type === 'imports') {
            features.imports.push({ source: match[1] });
          }
        }
      });
    }

    features.complexity = Math.max(1, Math.floor(features.nodeCount / 10));
    features.patterns.add(`${ext.slice(1)}_structure`);

    return features;
  }

  /**
   * Add structural patterns to features
   * @param {Object} features - Features object to modify
   * @param {Object} ast - AST object
   */
  addStructuralPatterns(features, _ast) {
    // Add patterns based on AST structure
    if (features.functions.length > 0) {
      features.patterns.add('has_functions');
      if (features.functions.some(f => f.async)) {
        features.patterns.add('uses_async');
      }
      if (features.functions.some(f => f.type === 'arrow')) {
        features.patterns.add('uses_arrow_functions');
      }
    }

    if (features.classes.length > 0) {
      features.patterns.add('has_classes');
      if (features.classes.some(c => c.methods > 0)) {
        features.patterns.add('has_class_methods');
      }
    }

    if (features.imports.length > 0) {
      features.patterns.add('has_imports');
    }

    if (features.exports.length > 0) {
      features.patterns.add('has_exports');
    }
  }

  /**
   * Calculate AST similarity between two structures
   * @param {Object} agentAST - Agent AST structure
   * @param {Object} humanAST - Human reference AST structure
   * @returns {number} - Similarity score (0-1)
   */
  calculateASTSimilarity(agentAST, humanAST) {
    const similarities = {
      structure: this.calculateStructuralSimilarity(agentAST, humanAST),
      functions: this.calculateFunctionSimilarity(agentAST, humanAST),
      classes: this.calculateClassSimilarity(agentAST, humanAST),
      imports: this.calculateImportSimilarity(agentAST, humanAST),
      complexity: this.calculateComplexitySimilarity(agentAST, humanAST)
    };

    // Calculate weighted average
    let totalSimilarity = 0;
    Object.keys(this.weights).forEach(aspect => {
      totalSimilarity += similarities[aspect] * this.weights[aspect];
    });

    this.logger.debug(`AST similarity breakdown: ${JSON.stringify(similarities)}`);
    return Math.max(0, Math.min(1, totalSimilarity));
  }

  /**
   * Calculate structural similarity (file organization, patterns)
   * @param {Object} agentAST - Agent AST structure
   * @param {Object} humanAST - Human reference AST structure
   * @returns {number} - Similarity score (0-1)
   */
  calculateStructuralSimilarity(agentAST, humanAST) {
    // File count similarity
    const fileCountSim = this.calculateRatioSimilarity(
      agentAST.files.length,
      humanAST.files.length
    );

    // Language similarity
    const agentLangs = new Set(agentAST.languages);
    const humanLangs = new Set(humanAST.languages);
    const langIntersection = new Set([...agentLangs].filter(x => humanLangs.has(x)));
    const langUnion = new Set([...agentLangs, ...humanLangs]);
    const langSim = langUnion.size > 0 ? langIntersection.size / langUnion.size : 1;

    // Pattern similarity
    const agentPatterns = new Set(agentAST.patterns);
    const humanPatterns = new Set(humanAST.patterns);
    const patternIntersection = new Set([...agentPatterns].filter(x => humanPatterns.has(x)));
    const patternUnion = new Set([...agentPatterns, ...humanPatterns]);
    const patternSim = patternUnion.size > 0 ? patternIntersection.size / patternUnion.size : 1;

    return (fileCountSim + langSim + patternSim) / 3;
  }

  /**
   * Calculate function similarity
   * @param {Object} agentAST - Agent AST structure
   * @param {Object} humanAST - Human reference AST structure
   * @returns {number} - Similarity score (0-1)
   */
  calculateFunctionSimilarity(agentAST, humanAST) {
    const agentFuncs = agentAST.functions;
    const humanFuncs = humanAST.functions;

    if (agentFuncs.length === 0 && humanFuncs.length === 0) return 1;
    if (agentFuncs.length === 0 || humanFuncs.length === 0) return 0;

    // Function count similarity
    const countSim = this.calculateRatioSimilarity(agentFuncs.length, humanFuncs.length);

    // Function name similarity (using Jaccard similarity)
    const agentNames = new Set(agentFuncs.map(f => f.name).filter(n => n !== 'anonymous'));
    const humanNames = new Set(humanFuncs.map(f => f.name).filter(n => n !== 'anonymous'));
    const nameIntersection = new Set([...agentNames].filter(x => humanNames.has(x)));
    const nameUnion = new Set([...agentNames, ...humanNames]);
    const nameSim = nameUnion.size > 0 ? nameIntersection.size / nameUnion.size : 1;

    // Parameter count similarity
    const agentAvgParams = agentFuncs.reduce((sum, f) => sum + (f.params || 0), 0) / agentFuncs.length;
    const humanAvgParams = humanFuncs.reduce((sum, f) => sum + (f.params || 0), 0) / humanFuncs.length;
    const paramSim = this.calculateRatioSimilarity(agentAvgParams, humanAvgParams);

    return (countSim + nameSim + paramSim) / 3;
  }
  /**
   * Calculate class similarity
   * @param {Object} agentAST - Agent AST structure
   * @param {Object} humanAST - Human reference AST structure
   * @returns {number} - Similarity score (0-1)
   */
  calculateClassSimilarity(agentAST, humanAST) {
    const agentClasses = agentAST.classes;
    const humanClasses = humanAST.classes;

    if (agentClasses.length === 0 && humanClasses.length === 0) return 1;
    if (agentClasses.length === 0 || humanClasses.length === 0) return 0;

    // Class count similarity
    const countSim = this.calculateRatioSimilarity(agentClasses.length, humanClasses.length);

    // Class name similarity
    const agentNames = new Set(agentClasses.map(c => c.name).filter(n => n !== 'anonymous'));
    const humanNames = new Set(humanClasses.map(c => c.name).filter(n => n !== 'anonymous'));
    const nameIntersection = new Set([...agentNames].filter(x => humanNames.has(x)));
    const nameUnion = new Set([...agentNames, ...humanNames]);
    const nameSim = nameUnion.size > 0 ? nameIntersection.size / nameUnion.size : 1;

    // Method count similarity
    const agentAvgMethods = agentClasses.reduce((sum, c) => sum + (c.methods || 0), 0) / agentClasses.length;
    const humanAvgMethods = humanClasses.reduce((sum, c) => sum + (c.methods || 0), 0) / humanClasses.length;
    const methodSim = this.calculateRatioSimilarity(agentAvgMethods, humanAvgMethods);

    return (countSim + nameSim + methodSim) / 3;
  }

  /**
   * Calculate import similarity
   * @param {Object} agentAST - Agent AST structure
   * @param {Object} humanAST - Human reference AST structure
   * @returns {number} - Similarity score (0-1)
   */
  calculateImportSimilarity(agentAST, humanAST) {
    const agentImports = agentAST.imports;
    const humanImports = humanAST.imports;

    if (agentImports.length === 0 && humanImports.length === 0) return 1;
    if (agentImports.length === 0 || humanImports.length === 0) return 0.5; // Partial penalty

    // Import count similarity
    const countSim = this.calculateRatioSimilarity(agentImports.length, humanImports.length);

    // Import source similarity
    const agentSources = new Set(agentImports.map(i => i.source).filter(Boolean));
    const humanSources = new Set(humanImports.map(i => i.source).filter(Boolean));
    const sourceIntersection = new Set([...agentSources].filter(x => humanSources.has(x)));
    const sourceUnion = new Set([...agentSources, ...humanSources]);
    const sourceSim = sourceUnion.size > 0 ? sourceIntersection.size / sourceUnion.size : 1;

    return (countSim + sourceSim) / 2;
  }

  /**
   * Calculate complexity similarity
   * @param {Object} agentAST - Agent AST structure
   * @param {Object} humanAST - Human reference AST structure
   * @returns {number} - Similarity score (0-1)
   */
  calculateComplexitySimilarity(agentAST, humanAST) {
    const agentComplexity = agentAST.complexity || 0;
    const humanComplexity = humanAST.complexity || 0;

    if (agentComplexity === 0 && humanComplexity === 0) return 1;

    return this.calculateRatioSimilarity(agentComplexity, humanComplexity);
  }

  /**
   * Calculate ratio-based similarity between two numbers
   * @param {number} a - First number
   * @param {number} b - Second number
   * @returns {number} - Similarity score (0-1)
   */
  calculateRatioSimilarity(a, b) {
    if (a === 0 && b === 0) return 1;
    if (a === 0 || b === 0) return 0;

    const ratio = Math.min(a, b) / Math.max(a, b);
    return ratio;
  }
}

module.exports = { ASTSimilarityMetric };
