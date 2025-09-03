#!/usr/bin/env node

/**
 * AST Similarity Test Script
 * 
 * This script helps test the AST similarity logic after running benchmarks.
 * It can compare files between different agent workspaces or git branches.
 * 
 * Usage:
 *   node scripts/test-ast-similarity.mjs [options]
 * 
 * Examples:
 *   # Test AST similarity between two agent workspaces
 *   node scripts/test-ast-similarity.mjs --file src/index.js --agent1 "Augment CLI" --agent2 "Claude Code"
 * 
 *   # Test with specific file paths
 *   node scripts/test-ast-similarity.mjs --file1 ./stage/Augment_CLI/src/index.js --file2 ./stage/Claude_Code/src/index.js
 * 
 *   # Test all JavaScript files in agent workspaces
 *   node scripts/test-ast-similarity.mjs --agent1 "Augment CLI" --agent2 "Claude Code" --scan-js
 * 
 *   # Test WASM vs text-based comparison
 *   node scripts/test-ast-similarity.mjs --file src/index.js --agent1 "Augment CLI" --agent2 "Claude Code" --compare-methods
 */

import { ASTSimilarityMetric } from '../src/metrics/ASTSimilarityMetric.js';
import { Logger } from '../src/utils/Logger.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

class ASTSimilarityTester {
  constructor() {
    this.logger = new Logger();
    this.metric = new ASTSimilarityMetric();
  }

  async initialize() {
    this.logger.info('Initializing AST Similarity Tester...');
    await this.metric.initialize();
    
    if (this.metric.parser) {
      this.logger.success('Tree-sitter WASM initialized successfully');
      this.logger.info(`Supported languages: ${Array.from(this.metric.supportedLanguages.keys()).join(', ')}`);
    } else {
      this.logger.warn('Tree-sitter WASM not available, using text-based comparison only');
    }
  }

  async testFilePair(file1Path, file2Path, options = {}) {
    this.logger.info(`\n=== Testing AST Similarity ===`);
    this.logger.info(`File 1: ${file1Path}`);
    this.logger.info(`File 2: ${file2Path}`);

    try {
      // Check if files exist
      if (!await fs.pathExists(file1Path)) {
        throw new Error(`File 1 not found: ${file1Path}`);
      }
      if (!await fs.pathExists(file2Path)) {
        throw new Error(`File 2 not found: ${file2Path}`);
      }

      // Read file contents
      const content1 = await fs.readFile(file1Path, 'utf8');
      const content2 = await fs.readFile(file2Path, 'utf8');

      this.logger.info(`File 1 size: ${content1.length} characters`);
      this.logger.info(`File 2 size: ${content2.length} characters`);

      // Parse both files
      const parsed1 = await this.metric.parseCode(content1, file1Path);
      const parsed2 = await this.metric.parseCode(content2, file2Path);

      // Show parsing results
      this.logger.info(`\n--- Parsing Results ---`);
      this.logger.info(`File 1 parsing: ${parsed1.isTextBased ? 'Text-based' : 'AST-based'}`);
      this.logger.info(`File 2 parsing: ${parsed2.isTextBased ? 'Text-based' : 'AST-based'}`);

      if (!parsed1.isTextBased && parsed1.rootNode) {
        this.logger.info(`File 1 AST root: ${parsed1.rootNode.type} (${parsed1.rootNode.childCount} children)`);
      }
      if (!parsed2.isTextBased && parsed2.rootNode) {
        this.logger.info(`File 2 AST root: ${parsed2.rootNode.type} (${parsed2.rootNode.childCount} children)`);
      }

      // Calculate similarity
      let similarity;
      if (!parsed1.isTextBased && !parsed2.isTextBased && parsed1.rootNode && parsed2.rootNode) {
        this.logger.info(`\n--- AST-based Comparison ---`);
        similarity = this.metric.calculateASTSimilarity(parsed1.rootNode, parsed2.rootNode);
        
        // Show detailed AST features if requested
        if (options.verbose) {
          const features1 = this.metric.extractASTFeatures(parsed1.rootNode);
          const features2 = this.metric.extractASTFeatures(parsed2.rootNode);
          this.showASTFeatures('File 1', features1);
          this.showASTFeatures('File 2', features2);
        }
      } else {
        this.logger.info(`\n--- Text-based Comparison ---`);
        similarity = this.metric.calculateTextSimilarity(parsed1, parsed2);
      }

      const score = similarity * 10; // Scale to 0-10
      this.logger.success(`\n🎯 Similarity Score: ${score.toFixed(2)}/10 (${(similarity * 100).toFixed(1)}%)`);

      // Compare methods if requested
      if (options.compareMethods && !parsed1.isTextBased && !parsed2.isTextBased) {
        const textSimilarity = this.metric.calculateTextSimilarity(parsed1, parsed2);
        const textScore = textSimilarity * 10;
        
        this.logger.info(`\n--- Method Comparison ---`);
        this.logger.info(`AST-based score:  ${score.toFixed(2)}/10`);
        this.logger.info(`Text-based score: ${textScore.toFixed(2)}/10`);
        this.logger.info(`Difference: ${Math.abs(score - textScore).toFixed(2)} points`);
      }

      return { similarity, score, method: parsed1.isTextBased ? 'text' : 'ast' };

    } catch (error) {
      this.logger.error(`Test failed: ${error.message}`);
      return null;
    }
  }

  showASTFeatures(label, features) {
    this.logger.info(`\n--- ${label} AST Features ---`);
    this.logger.info(`Total nodes: ${features.totalNodes}`);
    this.logger.info(`Max depth: ${features.depth}`);
    this.logger.info(`Functions: ${features.functionCount}`);
    this.logger.info(`Classes: ${features.classCount}`);
    this.logger.info(`Variables: ${features.variableCount}`);
    
    const topNodeTypes = Array.from(features.nodeTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    this.logger.info(`Top node types: ${topNodeTypes.map(([type, count]) => `${type}(${count})`).join(', ')}`);
  }

  async testAgentWorkspaces(fileName, agent1, agent2, options = {}) {
    const stageDir = path.join(projectRoot, 'stage');
    const agent1Dir = path.join(stageDir, agent1.replace(/\s+/g, '_'));
    const agent2Dir = path.join(stageDir, agent2.replace(/\s+/g, '_'));

    const file1Path = path.join(agent1Dir, fileName);
    const file2Path = path.join(agent2Dir, fileName);

    this.logger.info(`\n🔍 Comparing agent workspaces:`);
    this.logger.info(`Agent 1: ${agent1} (${agent1Dir})`);
    this.logger.info(`Agent 2: ${agent2} (${agent2Dir})`);

    return await this.testFilePair(file1Path, file2Path, options);
  }

  async scanJavaScriptFiles(agent1, agent2, options = {}) {
    const stageDir = path.join(projectRoot, 'stage');
    const agent1Dir = path.join(stageDir, agent1.replace(/\s+/g, '_'));
    const agent2Dir = path.join(stageDir, agent2.replace(/\s+/g, '_'));

    this.logger.info(`\n🔍 Scanning for JavaScript files in agent workspaces...`);

    const jsFiles = await this.findJavaScriptFiles(agent1Dir);
    this.logger.info(`Found ${jsFiles.length} JavaScript files`);

    const results = [];
    for (const jsFile of jsFiles.slice(0, options.maxFiles || 10)) {
      const relativePath = path.relative(agent1Dir, jsFile);
      const file2Path = path.join(agent2Dir, relativePath);

      if (await fs.pathExists(file2Path)) {
        this.logger.info(`\n--- Testing: ${relativePath} ---`);
        const result = await this.testFilePair(jsFile, file2Path, { verbose: false });
        if (result) {
          results.push({ file: relativePath, ...result });
        }
      } else {
        this.logger.warn(`File not found in agent 2: ${relativePath}`);
      }
    }

    // Summary
    if (results.length > 0) {
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      this.logger.success(`\n📊 Summary: ${results.length} files tested, average score: ${avgScore.toFixed(2)}/10`);
      
      // Show top and bottom performers
      results.sort((a, b) => b.score - a.score);
      this.logger.info(`\nTop performers:`);
      results.slice(0, 3).forEach(r => 
        this.logger.info(`  ${r.file}: ${r.score.toFixed(2)}/10`)
      );
      
      if (results.length > 3) {
        this.logger.info(`\nLowest scores:`);
        results.slice(-3).forEach(r => 
          this.logger.info(`  ${r.file}: ${r.score.toFixed(2)}/10`)
        );
      }
    }

    return results;
  }

  async findJavaScriptFiles(dir) {
    const jsFiles = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

    const scan = async (currentDir) => {
      try {
        const items = await fs.readdir(currentDir);
        for (const item of items) {
          if (item.startsWith('.') || item === 'node_modules') continue;

          const itemPath = path.join(currentDir, item);
          const stat = await fs.stat(itemPath);

          if (stat.isDirectory()) {
            await scan(itemPath);
          } else if (extensions.some(ext => item.endsWith(ext))) {
            jsFiles.push(itemPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await scan(dir);
    return jsFiles;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  const tester = new ASTSimilarityTester();
  await tester.initialize();

  try {
    if (options.file1 && options.file2) {
      // Direct file comparison
      await tester.testFilePair(options.file1, options.file2, options);
    } else if (options.file && options.agent1 && options.agent2) {
      // Agent workspace comparison
      await tester.testAgentWorkspaces(options.file, options.agent1, options.agent2, options);
    } else if (options.scanJs && options.agent1 && options.agent2) {
      // Scan all JS files
      await tester.scanJavaScriptFiles(options.agent1, options.agent2, options);
    } else {
      console.error('Invalid arguments. Use --help for usage information.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--file1':
        options.file1 = nextArg;
        i++;
        break;
      case '--file2':
        options.file2 = nextArg;
        i++;
        break;
      case '--file':
        options.file = nextArg;
        i++;
        break;
      case '--agent1':
        options.agent1 = nextArg;
        i++;
        break;
      case '--agent2':
        options.agent2 = nextArg;
        i++;
        break;
      case '--scan-js':
        options.scanJs = true;
        break;
      case '--compare-methods':
        options.compareMethods = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--max-files':
        options.maxFiles = parseInt(nextArg);
        i++;
        break;
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
AST Similarity Test Script

Usage:
  node scripts/test-ast-similarity.mjs [options]

Options:
  --file1 <path>           First file to compare
  --file2 <path>           Second file to compare
  --file <path>            File path relative to agent workspaces
  --agent1 <name>          First agent name (e.g., "Augment CLI")
  --agent2 <name>          Second agent name (e.g., "Claude Code")
  --scan-js                Scan and compare all JavaScript files
  --compare-methods        Compare AST vs text-based methods
  --verbose, -v            Show detailed AST features
  --max-files <n>          Maximum files to scan (default: 10)
  --help, -h               Show this help

Examples:
  # Compare specific files between agents
  node scripts/test-ast-similarity.mjs --file src/index.js --agent1 "Augment CLI" --agent2 "Claude Code"

  # Compare two specific file paths
  node scripts/test-ast-similarity.mjs --file1 ./stage/Augment_CLI/src/index.js --file2 ./stage/Claude_Code/src/index.js

  # Scan all JS files between agents
  node scripts/test-ast-similarity.mjs --agent1 "Augment CLI" --agent2 "Claude Code" --scan-js

  # Verbose comparison with method comparison
  node scripts/test-ast-similarity.mjs --file src/index.js --agent1 "Augment CLI" --agent2 "Claude Code" --verbose --compare-methods

Prerequisites:
  1. Run a benchmark first to populate the ./stage directory
  2. Ensure grammar files are available in ./grammars directory
  3. Have at least two agent workspaces to compare
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ASTSimilarityTester };
