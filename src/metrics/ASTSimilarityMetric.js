/**
 * AST Similarity Metric - Compares Abstract Syntax Trees between agent output and actual PR code
 */

const { AssessableMetric } = require('./AssessableMetric');
const { FileSystem } = require('../utils/FileSystem');
const path = require('path');
const fs = require('fs-extra');

class ASTSimilarityMetric extends AssessableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Compares Abstract Syntax Trees between agent output and actual PR code (1-10 scale)',
      unit: 'score',
      ...options,
    });
    this.fs = new FileSystem(options);
    this.minScore = 1;
    this.maxScore = 10;
  }

  /**
   * Measure AST similarity between agent output and human reference
   * @param {string} output - Agent output (not used directly, we use context)
   * @param {Object} context - Context containing paths and PR information
   * @returns {Promise<number>} - Similarity score (1-10)
   */
  async measure(output, context = {}) {
    try {
      // Get paths from context
      const agentPath = context.agentWorkingDir;
      const humanPath = context.humanReferenceDir;
      const prInfo = context.prInfo;

      if (!agentPath || !humanPath || !prInfo) {
        this.logger.warn('Missing required context for AST similarity measurement');
        return null;
      }

      // Extract code structures from both directories
      const agentStructure = await this.extractCodeStructure(agentPath);
      const humanStructure = await this.extractCodeStructure(humanPath);

      // Use LLM to assess similarity
      const prompt = this.createAssessmentPrompt(agentStructure, humanStructure, prInfo);
      const response = await this.callLLM(prompt);
      const score = this.parseAssessmentResponse(response);

      return Math.max(this.minScore, Math.min(this.maxScore, score));
    } catch (error) {
      this.logger.error(`AST similarity measurement failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract code structure from a directory
   * @param {string} dirPath - Directory path to analyze
   * @returns {Promise<Object>} - Code structure information
   */
  async extractCodeStructure(dirPath) {
    const structure = {
      files: [],
      totalLines: 0,
      languages: new Set(),
      functions: [],
      classes: [],
      imports: [],
      exports: []
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
        
        structure.files.push({
          path: relativePath,
          extension: ext,
          lines: content.split('\n').length,
          size: content.length
        });
        
        structure.totalLines += content.split('\n').length;
        structure.languages.add(this.getLanguageFromExtension(ext));
        
        // Extract basic code elements
        const elements = this.extractCodeElements(content, ext);
        structure.functions.push(...elements.functions);
        structure.classes.push(...elements.classes);
        structure.imports.push(...elements.imports);
        structure.exports.push(...elements.exports);
        
      } catch (error) {
        this.logger.warn(`Failed to analyze file ${filePath}: ${error.message}`);
      }
    }

    structure.languages = Array.from(structure.languages);
    return structure;
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
   * Extract basic code elements from content
   * @param {string} content - File content
   * @param {string} ext - File extension
   * @returns {Object} - Extracted elements
   */
  extractCodeElements(content, ext) {
    const elements = {
      functions: [],
      classes: [],
      imports: [],
      exports: []
    };

    // Basic regex patterns for different languages
    const patterns = {
      '.js': {
        functions: /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:function|\([^)]*\)\s*=>))/g,
        classes: /class\s+(\w+)/g,
        imports: /import\s+.*?from\s+['"]([^'"]+)['"]/g,
        exports: /export\s+(?:default\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+))/g
      },
      '.py': {
        functions: /def\s+(\w+)/g,
        classes: /class\s+(\w+)/g,
        imports: /(?:from\s+(\w+)\s+)?import\s+([^#\n]+)/g
      },
      '.java': {
        functions: /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/g,
        classes: /(?:public\s+)?class\s+(\w+)/g,
        imports: /import\s+([^;]+);/g
      }
    };

    const langPatterns = patterns[ext] || patterns['.js']; // Default to JS patterns

    // Extract functions
    if (langPatterns.functions) {
      let match;
      while ((match = langPatterns.functions.exec(content)) !== null) {
        elements.functions.push(match[1] || match[2] || match[0]);
      }
    }

    // Extract classes
    if (langPatterns.classes) {
      let match;
      while ((match = langPatterns.classes.exec(content)) !== null) {
        elements.classes.push(match[1]);
      }
    }

    // Extract imports
    if (langPatterns.imports) {
      let match;
      while ((match = langPatterns.imports.exec(content)) !== null) {
        elements.imports.push(match[1] || match[2]);
      }
    }

    // Extract exports
    if (langPatterns.exports) {
      let match;
      while ((match = langPatterns.exports.exec(content)) !== null) {
        elements.exports.push(match[1] || match[2] || match[3]);
      }
    }

    return elements;
  }

  /**
   * Create assessment prompt for LLM evaluation
   * @param {Object} agentStructure - Agent code structure
   * @param {Object} humanStructure - Human reference structure
   * @param {Object} prInfo - PR information
   * @returns {string} - Assessment prompt
   */
  createAssessmentPrompt(agentStructure, humanStructure, prInfo) {
    return `You are a code review expert evaluating the structural similarity between two codebases. Compare the agent's implementation with the human reference implementation and assess how similar they are in terms of code structure, organization, and architectural decisions.

**PR Context:**
- Title: ${prInfo.title}
- Description: ${prInfo.description}

**Human Reference Structure:**
- Files: ${humanStructure.files.length} (${humanStructure.totalLines} total lines)
- Languages: ${humanStructure.languages.join(', ')}
- Functions: ${humanStructure.functions.length}
- Classes: ${humanStructure.classes.length}
- Key files: ${humanStructure.files.slice(0, 5).map(f => f.path).join(', ')}

**Agent Implementation Structure:**
- Files: ${agentStructure.files.length} (${agentStructure.totalLines} total lines)
- Languages: ${agentStructure.languages.join(', ')}
- Functions: ${agentStructure.functions.length}
- Classes: ${agentStructure.classes.length}
- Key files: ${agentStructure.files.slice(0, 5).map(f => f.path).join(', ')}

**Evaluation Criteria:**
1. **File Structure Similarity (30%)**: How well does the agent's file organization match the reference?
2. **Code Architecture (25%)**: Are the main architectural patterns and design decisions similar?
3. **Function/Class Structure (20%)**: Do the implementations have similar functional decomposition?
4. **Implementation Approach (15%)**: Are the core algorithms and logic structures comparable?
5. **Code Organization (10%)**: Are imports, exports, and module organization similar?

**Scoring Guidelines:**
- 10: Nearly identical structure and approach, minor differences only
- 8-9: Very similar with same architectural patterns, some implementation differences
- 6-7: Similar overall approach but notable structural differences
- 4-5: Different approach but achieves similar functionality
- 2-3: Significantly different structure and approach
- 1: Completely different or non-functional implementation

Please provide your assessment as a single number (1-10) followed by a brief explanation focusing on the structural similarities and differences.

Format: "Score: X - [explanation]"`;
  }

  /**
   * Parse assessment response from LLM
   * @param {string} response - LLM response
   * @returns {number} - Parsed score
   */
  parseAssessmentResponse(response) {
    return this.parseStandardResponse(response);
  }
}

module.exports = { ASTSimilarityMetric };
