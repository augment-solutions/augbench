# AST Similarity Testing Guide

This guide explains how to test the AST similarity logic after running benchmarks using the provided test script.

## Overview

The AST similarity test script (`scripts/test-ast-similarity.mjs`) allows you to manually validate the Tree-sitter WASM implementation and compare code similarity between different agent outputs or file versions.

## Prerequisites

1. **Run a benchmark first** to populate the `./stage` directory with agent workspaces
2. **Grammar files** should be available in `./grammars` directory (automatically included)
3. **At least two agent workspaces** to compare (e.g., "Augment CLI" and "Claude Code")

## Quick Start

### 1. Basic File Comparison Between Agents

Compare a specific file between two agent workspaces:

```bash
node scripts/test-ast-similarity.mjs --file src/index.js --agent1 "Augment CLI" --agent2 "Claude Code"
```

### 2. Direct File Path Comparison

Compare two specific files directly:

```bash
node scripts/test-ast-similarity.mjs \
  --file1 ./stage/Augment_CLI/src/index.js \
  --file2 ./stage/Claude_Code/src/index.js
```

### 3. Scan All JavaScript Files

Automatically find and compare all JavaScript files between agents:

```bash
node scripts/test-ast-similarity.mjs --agent1 "Augment CLI" --agent2 "Claude Code" --scan-js
```

## Advanced Usage

### Verbose Output with AST Features

Get detailed information about AST structure and features:

```bash
node scripts/test-ast-similarity.mjs \
  --file src/components/Button.jsx \
  --agent1 "Augment CLI" \
  --agent2 "Claude Code" \
  --verbose
```

**Output includes:**
- Total AST nodes
- Maximum depth
- Function/class/variable counts
- Top node types distribution

### Compare AST vs Text-based Methods

See the difference between WASM AST parsing and text-based comparison:

```bash
node scripts/test-ast-similarity.mjs \
  --file src/utils/helper.js \
  --agent1 "Augment CLI" \
  --agent2 "Claude Code" \
  --compare-methods
```

### Limit File Scanning

When scanning directories, limit the number of files processed:

```bash
node scripts/test-ast-similarity.mjs \
  --agent1 "Augment CLI" \
  --agent2 "Claude Code" \
  --scan-js \
  --max-files 5
```

## Understanding the Output

### Similarity Scores

- **Scale**: 0-10 (10 = identical, 0 = completely different)
- **Method**: Shows whether AST-based or text-based comparison was used
- **Percentage**: Alternative representation (0-100%)

### Parsing Results

```
--- Parsing Results ---
File 1 parsing: AST-based
File 2 parsing: AST-based
File 1 AST root: program (3 children)
File 2 AST root: program (4 children)
```

- **AST-based**: Tree-sitter WASM successfully parsed the code
- **Text-based**: Fallback to text comparison (unsupported language or WASM failure)

### AST Features (Verbose Mode)

```
--- File 1 AST Features ---
Total nodes: 127
Max depth: 8
Functions: 3
Classes: 1
Variables: 12
Top node types: identifier(23), expression_statement(8), call_expression(6)
```

### Summary Statistics (Scan Mode)

```
📊 Summary: 8 files tested, average score: 7.45/10

Top performers:
  src/utils/constants.js: 9.80/10
  src/components/Header.jsx: 8.90/10
  src/lib/api.js: 8.75/10

Lowest scores:
  src/complex/algorithm.js: 5.20/10
  src/generated/types.ts: 4.80/10
```

## Supported File Types

The script automatically detects and supports:

- **JavaScript**: `.js`, `.mjs`
- **JSX**: `.jsx`
- **TypeScript**: `.ts`
- **TSX**: `.tsx`
- **Python**: `.py` (if grammar available)

Unsupported files automatically fall back to text-based comparison.

## Troubleshooting

### No Grammar Files Found

```
[WARN] Tree-sitter WASM not available, using text-based comparison only
```

**Solution**: Ensure grammar files exist in `./grammars/`:
- `tree-sitter-javascript.wasm`
- `tree-sitter-typescript.wasm`
- `tree-sitter-python.wasm`

### Agent Workspace Not Found

```
[ERROR] File 1 not found: ./stage/Augment_CLI/src/index.js
```

**Solution**: 
1. Run a benchmark first to create agent workspaces
2. Check agent names match exactly (case-sensitive)
3. Verify the file exists in the agent workspace

### WASM Initialization Failed

```
[ERROR] Test failed: Parser initialization failed
```

**Solution**:
1. Check Node.js version (≥22.0.0 required)
2. Verify grammar files are not corrupted
3. Try with `--compare-methods` to see text-based fallback

## Integration with Benchmarks

### Typical Workflow

1. **Run Benchmark**:
   ```bash
   node bin/augbench.js run
   ```

2. **Test AST Similarity**:
   ```bash
   # Quick scan of all files
   node scripts/test-ast-similarity.mjs --agent1 "Augment CLI" --agent2 "Claude Code" --scan-js
   
   # Detailed analysis of specific files
   node scripts/test-ast-similarity.mjs --file src/main.js --agent1 "Augment CLI" --agent2 "Claude Code" --verbose
   ```

3. **Analyze Results**: Use the similarity scores to understand how structurally similar the agent outputs are

### Use Cases

- **Validation**: Verify AST similarity metric is working correctly
- **Debugging**: Understand why certain files have low similarity scores
- **Comparison**: See differences between AST-based and text-based methods
- **Analysis**: Identify which types of code changes agents make most frequently

## Script Options Reference

| Option | Description | Example |
|--------|-------------|---------|
| `--file1 <path>` | First file to compare | `--file1 ./stage/agent1/src/app.js` |
| `--file2 <path>` | Second file to compare | `--file2 ./stage/agent2/src/app.js` |
| `--file <path>` | File relative to agent workspaces | `--file src/app.js` |
| `--agent1 <name>` | First agent name | `--agent1 "Augment CLI"` |
| `--agent2 <name>` | Second agent name | `--agent2 "Claude Code"` |
| `--scan-js` | Scan all JavaScript files | `--scan-js` |
| `--compare-methods` | Compare AST vs text methods | `--compare-methods` |
| `--verbose` | Show detailed AST features | `--verbose` |
| `--max-files <n>` | Limit files in scan mode | `--max-files 5` |
| `--help` | Show help information | `--help` |

This test script provides comprehensive validation of the AST similarity implementation and helps ensure the WASM tree-sitter integration is working correctly.
