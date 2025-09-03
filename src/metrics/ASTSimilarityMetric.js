import { BaseMetric } from "./BaseMetric.js";
import Parser from "web-tree-sitter";
import fs from "fs-extra";
import path from "path";
import { GitManager } from "../utils/GitManager.js";

export class ASTSimilarityMetric extends BaseMetric {
  constructor() {
    super("ast_similarity");
    this.parser = null;
    this.supportedLanguages = new Map();
  }

  async initialize() {
    if (this.parser) return;

    try {
      await Parser.init();
      this.parser = new Parser();

      // Load language grammars
      await this.loadLanguageGrammars();

      console.log('AST similarity initialized with tree-sitter WASM support');
    } catch (error) {
      console.warn('Failed to initialize tree-sitter WASM, falling back to text-based comparison:', error.message);
      this.parser = null;
    }
  }

  async loadLanguageGrammars() {
    const grammarDir = path.join(process.cwd(), 'grammars');

    // Language mappings
    const languages = [
      { name: 'javascript', file: 'tree-sitter-javascript.wasm', extensions: ['.js', '.jsx', '.mjs'] },
      { name: 'typescript', file: 'tree-sitter-typescript.wasm', extensions: ['.ts', '.tsx'] },
      { name: 'python', file: 'tree-sitter-python.wasm', extensions: ['.py', '.pyx'] }
    ];

    for (const lang of languages) {
      try {
        const grammarPath = path.join(grammarDir, lang.file);
        if (await fs.pathExists(grammarPath)) {
          const Language = await Parser.Language.load(grammarPath);
          this.supportedLanguages.set(lang.name, {
            language: Language,
            extensions: lang.extensions
          });
          console.log(`Loaded ${lang.name} grammar`);
        } else {
          console.warn(`Grammar file not found: ${grammarPath}`);
        }
      } catch (error) {
        console.warn(`Failed to load ${lang.name} grammar:`, error.message);
      }
    }
  }

  async measure(context) {
    const { cwd, pr, humanBranch = 'human', agentBranch } = context;
    
    if (!pr || !humanBranch || !agentBranch) {
      return { [this.name]: null, error: "Missing required context for AST similarity" };
    }

    try {
      await this.initialize();
      
      // Get the files that were changed in the PR
      const changedFiles = pr.fileChanges || [];
      
      if (changedFiles.length === 0) {
        return { [this.name]: 10 }; // Perfect similarity if no files changed
      }

      // Compare AST similarity for each changed file
      const similarities = [];
      
      for (const fileChange of changedFiles) {
        if (this.isCodeFile(fileChange.path)) {
          const similarity = await this.compareFileAST(cwd, fileChange.path, humanBranch, agentBranch);
          if (similarity !== null) {
            similarities.push(similarity);
          }
        }
      }
      
      if (similarities.length === 0) {
        return { [this.name]: null, error: "No supported code files to compare" };
      }
      
      // Calculate average similarity across all files
      const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
      
      return { [this.name]: Number((avgSimilarity * 10).toFixed(1)) }; // Scale to 0-10
      
    } catch (error) {
      return { [this.name]: null, error: error.message };
    }
  }

  async compareFileAST(repoPath, filePath, humanBranch, agentBranch) {
    try {
      // Get file content from both branches
      const humanContent = await this.getFileFromBranch(repoPath, filePath, humanBranch);
      const agentContent = await this.getFileFromBranch(repoPath, filePath, agentBranch);
      
      if (!humanContent || !agentContent) {
        return null; // File doesn't exist in one of the branches
      }
      
      // Parse both files into ASTs
      const humanAST = await this.parseCode(humanContent, filePath);
      const agentAST = await this.parseCode(agentContent, filePath);
      
      if (!humanAST || !agentAST) {
        return null; // Failed to parse
      }
      
      // Compare code structures - use AST if available, otherwise text-based
      let similarity;
      if (!humanAST.isTextBased && !agentAST.isTextBased && humanAST.rootNode && agentAST.rootNode) {
        similarity = this.calculateASTSimilarity(humanAST.rootNode, agentAST.rootNode);
      } else {
        similarity = this.calculateTextSimilarity(humanAST, agentAST);
      }

      return similarity;
      
    } catch (error) {
      console.warn(`Failed to compare AST for ${filePath}: ${error.message}`);
      return null;
    }
  }

  async getFileFromBranch(repoPath, filePath, branch) {
    try {
      const git = await import("simple-git");
      const gitInstance = git.default({ baseDir: repoPath });
      const content = await gitInstance.show([`${branch}:${filePath}`]);
      return content;
    } catch (error) {
      return null; // File doesn't exist or can't be read
    }
  }

  async parseCode(content, filePath) {
    if (!this.parser) {
      // Fallback to text-based comparison
      return { content, lines: content.split('\n'), isTextBased: true };
    }

    // Determine language from file extension
    const language = this.getLanguageForFile(filePath);
    if (!language) {
      // Unsupported language, use text-based comparison
      return { content, lines: content.split('\n'), isTextBased: true };
    }

    try {
      this.parser.setLanguage(language.language);
      const tree = this.parser.parse(content);

      return {
        tree,
        rootNode: tree.rootNode,
        content,
        isTextBased: false,
        language: language
      };
    } catch (error) {
      console.warn(`Failed to parse ${filePath} with tree-sitter:`, error.message);
      // Fallback to text-based comparison
      return { content, lines: content.split('\n'), isTextBased: true };
    }
  }

  getLanguageForFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    for (const [name, langInfo] of this.supportedLanguages) {
      if (langInfo.extensions.includes(ext)) {
        return langInfo;
      }
    }

    return null;
  }

  getLanguageForFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    for (const [, langInfo] of this.supportedLanguages) {
      if (langInfo.extensions.includes(ext)) {
        return langInfo;
      }
    }

    return null;
  }

  isCodeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase().substring(1);
    const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'php'];
    return codeExtensions.includes(ext);
  }

  calculateTextSimilarity(parsed1, parsed2) {
    // Simple text-based similarity using line comparison
    if (!parsed1 || !parsed2) return 0;

    const lines1 = parsed1.lines.filter(line => line.trim().length > 0);
    const lines2 = parsed2.lines.filter(line => line.trim().length > 0);

    if (lines1.length === 0 && lines2.length === 0) return 1;
    if (lines1.length === 0 || lines2.length === 0) return 0;

    // Calculate Jaccard similarity of lines
    const set1 = new Set(lines1.map(line => line.trim()));
    const set2 = new Set(lines2.map(line => line.trim()));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  calculateASTSimilarity(node1, node2) {
    if (!node1 || !node2) return 0;

    // Extract structural features from AST nodes
    const features1 = this.extractASTFeatures(node1);
    const features2 = this.extractASTFeatures(node2);

    // Calculate similarity based on structural features
    return this.compareASTFeatures(features1, features2);
  }

  extractASTFeatures(node) {
    const features = {
      nodeTypes: new Map(),
      depth: 0,
      totalNodes: 0,
      functionCount: 0,
      classCount: 0,
      variableCount: 0
    };

    this.traverseAST(node, features, 0);
    return features;
  }

  traverseAST(node, features, depth) {
    if (!node) return;

    features.totalNodes++;
    features.depth = Math.max(features.depth, depth);

    // Count node types
    const nodeType = node.type;
    features.nodeTypes.set(nodeType, (features.nodeTypes.get(nodeType) || 0) + 1);

    // Count specific constructs
    if (nodeType.includes('function') || nodeType === 'method_definition') {
      features.functionCount++;
    }
    if (nodeType.includes('class') || nodeType === 'class_declaration') {
      features.classCount++;
    }
    if (nodeType.includes('variable') || nodeType === 'variable_declarator') {
      features.variableCount++;
    }

    // Recursively traverse children
    for (let i = 0; i < node.childCount; i++) {
      this.traverseAST(node.child(i), features, depth + 1);
    }
  }

  compareASTFeatures(features1, features2) {
    // Weighted similarity calculation
    let totalWeight = 0;
    let similaritySum = 0;

    // Compare node type distributions (40% weight)
    const nodeTypeSimilarity = this.compareNodeTypes(features1.nodeTypes, features2.nodeTypes);
    similaritySum += nodeTypeSimilarity * 0.4;
    totalWeight += 0.4;

    // Compare structural metrics (30% weight)
    const structuralSimilarity = this.compareStructuralMetrics(features1, features2);
    similaritySum += structuralSimilarity * 0.3;
    totalWeight += 0.3;

    // Compare construct counts (30% weight)
    const constructSimilarity = this.compareConstructCounts(features1, features2);
    similaritySum += constructSimilarity * 0.3;
    totalWeight += 0.3;

    return totalWeight > 0 ? similaritySum / totalWeight : 0;
  }

  compareNodeTypes(types1, types2) {
    const allTypes = new Set([...types1.keys(), ...types2.keys()]);
    if (allTypes.size === 0) return 1;

    let similarity = 0;
    for (const type of allTypes) {
      const count1 = types1.get(type) || 0;
      const count2 = types2.get(type) || 0;
      const maxCount = Math.max(count1, count2);
      const minCount = Math.min(count1, count2);
      similarity += maxCount > 0 ? minCount / maxCount : 0;
    }

    return similarity / allTypes.size;
  }

  compareStructuralMetrics(features1, features2) {
    const depthSim = this.normalizedSimilarity(features1.depth, features2.depth);
    const nodeSim = this.normalizedSimilarity(features1.totalNodes, features2.totalNodes);
    return (depthSim + nodeSim) / 2;
  }

  compareConstructCounts(features1, features2) {
    const funcSim = this.normalizedSimilarity(features1.functionCount, features2.functionCount);
    const classSim = this.normalizedSimilarity(features1.classCount, features2.classCount);
    const varSim = this.normalizedSimilarity(features1.variableCount, features2.variableCount);
    return (funcSim + classSim + varSim) / 3;
  }

  normalizedSimilarity(val1, val2) {
    if (val1 === 0 && val2 === 0) return 1;
    const max = Math.max(val1, val2);
    const min = Math.min(val1, val2);
    return max > 0 ? min / max : 0;
  }
}
