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



## ROI Scripts: PR/MR Metrics Analysis

Analyze pull request/merge request activity before and after an automation date across multiple platforms. All scripts support analyzing all branches or specific base branches and generate detailed CSV outputs for comprehensive analysis.

### GitHub PR Metrics
- Script: `roi_scripts/github_pr_metrics_detailed_csv.py`
- Generates detailed CSV reports with 25+ metrics per PR
- Supports multi-repository analysis
- Configure via environment variables or interactive prompts

### Azure DevOps PR Metrics
- Script: `roi_scripts/azure_devops_pr_metrics_detailed_csv.py`
- **Purpose**: Analyze Azure DevOps pull request metrics with detailed CSV output
- **Functionality**: Replicates GitHub script functionality for Azure DevOps, providing identical metrics and output formats
- **Features**:
  - Detailed PR data in CSV format (25 columns matching GitHub version)
  - Contributor email mapping for username-to-email correlation
  - Multi-repository support with semicolon-separated repo names
  - Performance optimizations with parallel processing and caching
  - Real-time progress tracking with ETA
  - Automatic ZIP archive creation for easy sharing

### GitLab MR Metrics
- Script: `roi_scripts/gitlab_mr_metrics_detailed_csv.py`
- Analyze GitLab merge request metrics with CSV export
- Multi-project support and detailed reporting

### Prerequisites
- Python 3.8+
- `pip install requests`
- Platform-specific access tokens:
  - **GitHub**: Personal Access Token with `repo` scope
  - **Azure DevOps**: Personal Access Token with Code (read) permissions
  - **GitLab**: Personal Access Token with `api` or `read_api` scope

### Usage Examples

**GitHub:**
```bash
GITHUB_TOKEN=ghp_xxx REPO_NAME=owner/repo WEEKS_BACK=4 AUTOMATED_DATE="2025-01-15T00:00:00Z" \
  python3 roi_scripts/github_pr_metrics_detailed_csv.py
```

**Azure DevOps:**
```bash
AZURE_DEVOPS_PAT=xxx AZURE_DEVOPS_ORG=https://dev.azure.com/yourorg \
AZURE_DEVOPS_PROJECT=projectname REPO_NAME=reponame WEEKS_BACK=4 \
AUTOMATED_DATE="2025-01-15T00:00:00Z" BRANCH=main \
  python3 roi_scripts/azure_devops_pr_metrics_detailed_csv.py
```

**GitLab:**
```bash
GITLAB_TOKEN=glpat-xxx PROJECT_ID=namespace/project WEEKS_BACK=4 \
AUTOMATED_DATE="2025-01-15T00:00:00Z" \
  python3 roi_scripts/gitlab_mr_metrics_detailed_csv.py
```

### Output Files
Each script generates:
- **Summary metrics CSV**: Comparative analysis (before/after automation)
- **Detailed PR/MR CSV**: Individual PR/MR data with 25+ metrics
- **Contributor mapping CSV**: Username-to-email correlation
- **ZIP archive**: All CSV files compressed for easy sharing

Tip: You can also run GitHub metrics via npm:
```bash
npm run pr-metrics
```
