# AugBench

A comprehensive CLI tool for benchmarking AI coding assistants across different scenarios and metrics.

## Features

- **Two Benchmark Modes**: LLM_Evaluator and PR_Recreate
- **Multiple Metrics**: Response time, code quality, AST similarity, and LLM-assessed metrics
- **Parallel Execution**: Run multiple agents simultaneously for faster benchmarks
- **Visual Reports**: Generate charts and comprehensive analysis
- **Flexible Configuration**: Support for various AI assistants and custom setups

## Quick Start

### 1. Installation
```bash
git clone https://github.com/augment-solutions/augbench.git
cd augbench
npm install
```

### 2. Configuration
```bash
# For LLM_Evaluator mode (prompt-based evaluation)
cp settings.json.llm.example settings.json

# For PR_Recreate mode (real PR recreation)
cp settings.json.pr.example settings.json

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### 3. Validate Environment Setup
```bash
node bin/augbench.js validate
```

### 4. Run Benchmark
```bash
node bin/augbench.js benchmark
```

### 5. Generate Reports
```bash
node bin/augbench.js report --charts
```

## Commands

- **`validate`** – Check prerequisites and configuration
- **`benchmark`** – Execute benchmarking based on settings.json mode
- **`report`** – Generate console reports and charts
- **`help`** – Show usage examples

## Documentation

- **[Installation & Usage](docs/Installation_Usage.md)** - Complete setup and usage guide
- **[Benchmark Modes](docs/Modes.md)** - LLM_Evaluator and PR_Recreate mode details
- **[Metrics System](docs/Metrics.md)** - Comprehensive metrics documentation
- **[AST Similarity Testing](docs/AST_Testing.md)** - Manual testing guide for AST similarity logic
- **[AI Assistant Configuration](docs/Assistants.md)** - How to configure different AI assistants
- **[Testing Guide](docs/Testing.md)** - Testing strategy and guidelines

## Supported AI Assistants

- **Augment CLI** - `auggie` command
- **Claude Code** - Anthropic's Claude CLI
- **Cursor CLI** - Cursor IDE command line interface
- **Custom Assistants** - Easy integration for any CLI-based AI tool

## Requirements

- **Node.js** ≥22.0.0
- **Git** ≥2.30.0 (for worktree support)
- **Disk Space** >10GB for repository staging
- **AI Assistant CLIs** installed and configured



## ROI Scripts: GitHub PR Metrics

Analyze GitHub PR activity before and after an automation date. Supports analyzing all branches or a specific base branch.

- Script: roi_scripts/github_pr_metrics.py
- Configure via constants at top of the script or environment variables

Usage examples:

```bash
# Analyze ALL branches (default when BRANCH is empty)
GITHUB_TOKEN=ghp_xxx REPO_NAME=owner/repo WEEKS_BACK=2 AUTOMATED_DATE="2025-01-15" BRANCH="" \
  python3 roi_scripts/github_pr_metrics.py

# Analyze a specific branch only (e.g., main)
GITHUB_TOKEN=ghp_xxx REPO_NAME=owner/repo WEEKS_BACK=4 AUTOMATED_DATE="2025-01-15T00:00:00Z" BRANCH=main \
  python3 roi_scripts/github_pr_metrics.py
```

Tip: You can also run it via npm:

```bash
npm run pr-metrics
```
