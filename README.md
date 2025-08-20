# Augbench

A cross-platform Node.js CLI benchmarking tool for comparing performance metrics across different AI coding assistants.

## Overview

Augbench is designed to provide objective, reproducible benchmarks for AI coding assistants like Claude Code, Augment CLI, and others. It measures various performance metrics including response time, output quality, and custom metrics across multiple test scenarios.

### Key Features

- **Cross-Platform**: Works seamlessly on macOS, Linux, and Windows
- **Dual Benchmark Modes**:
  - **Standard Mode**: Traditional prompt-based benchmarking with custom prompts
  - **PR Recreation Mode**: Recreate actual Pull Requests from repository history for real-world evaluation
- **Extensible Architecture**: Easy to add new AI assistants, metrics, and evaluators
- **Comprehensive Metrics**: Response time, output quality, instruction/context adherence, AST similarity, output format success, steps per task, and summary rates
- **Interactive CLI**: User-friendly prompts and progress indicators
- **Robust Error Handling**: Graceful failure recovery and detailed error reporting
- **Flexible Configuration**: JSON-based settings with validation
- **Parallel Execution**: Configurable concurrent runs per agent for faster benchmarking
- **Results Storage**: Structured JSON output with metadata and platform information; standardized location and naming; per-metric PNG charts

### Workflow

Augbench follows an 8-step workflow:
1. Repository selection and validation
2. Environment configuration checking
3. Settings management and validation
4. User confirmation
5. Benchmark execution with progress tracking
6. Results collection and storage
7. Completion notification
8. Error handling and recovery

## Components

### Core Architecture

- **CLI Interface** (`src/cli/`): Interactive command-line interface with progress indicators
- **Adapters** (`src/adapters/`): Pluggable adapters for different AI coding assistants
- **Metrics** (`src/metrics/`): Extensible metric system for measuring performance
- **Configuration** (`src/config/`): JSON-based configuration with validation
- **Utilities** (`src/utils/`): Cross-platform utilities and error handling

### Key Classes

- **BenchmarkCLI**: Main orchestrator for the benchmarking workflow
- **BaseAdapter**: Abstract base class for AI assistant adapters
- **BaseMetric**: Abstract base class for metrics (MeasurableMetric, AssessableMetric)
- **ErrorHandler**: Comprehensive error handling and categorization
- **Platform**: Cross-platform compatibility utilities
- **ResultsStorage**: Results management and export

### Project Structure

```
augbench/
├── bin/augbench.js          # Executable entry point
├── src/
│   ├── adapters/              # AI assistant adapters
│   │   ├── BaseAdapter.js
│   │   ├── ClaudeCodeAdapter.js
│   │   ├── AugmentCLIAdapter.js
│   │   └── AdapterFactory.js
│   ├── cli/                   # CLI interface and workflow
│   │   ├── BenchmarkCLI.js
│   │   ├── RepositorySelector.js
│   │   └── BenchmarkRunner.js
│   ├── config/                # Configuration management
│   │   ├── EnvironmentConfig.js
│   │   └── SettingsManager.js
│   ├── metrics/               # Metric implementations
│   │   ├── BaseMetric.js
│   │   ├── MeasurableMetric.js
│   │   ├── AssessableMetric.js
│   │   ├── ResponseTimeMetric.js
│   │   ├── OutputQualityMetric.js
│   │   └── MetricsFactory.js
│   └── utils/                 # Utility modules
│       ├── Logger.js
│       ├── FileSystem.js
│       ├── ErrorHandler.js
│       ├── Validator.js
│       ├── Platform.js
│       └── ResultsStorage.js
├── test/basic.test.js         # Unit tests
├── prompt1.md                 # Example prompt files
├── prompt2.md
├── prompt3.md
├── package.json
└── README.md
```

## Installation

### Prerequisites
- Node.js 16+
- npm or yarn
- AI assistants you want to benchmark (Claude Code, Augment CLI, etc.)

### Global Installation
```bash
npm install -g augbench
```

### Local Development
```bash
git clone <repository-url>
cd augbench
npm install
npm link
```

## Usage

### Quick Start

1. **Initialize configuration files:**
```bash
augbench init
```

2. **Configure environment variables:**
Edit `.env` file with your LLM endpoint and API key:
```env
LLM_OPENAI_ENDPOINT=https://api.openai.com/v1
LLM_API_KEY=your-api-key-here
# LLM_PROVIDER=openai-compatible (default) or anthropic
# LLM_MODEL=your-model-id
# LLM_ANTHROPIC_VERSION=2023-06-01
```

3. **Customize settings:**
Edit `settings.json` to configure prompts, assistants, and metrics:
```json
{
  "num_prompts": 3,
  "prompts": ["prompt1.md", "prompt2.md", "prompt3.md"],
  "assistants": ["Claude Code", "Augment CLI"],
  "runs_per_prompt": 2,
  "parallel_runs": 1,
  "output_filename": "bench_local",
  "metrics": [
    "response_time",
    "output_quality",
    "output_format_success",
    "instruction_adherence",
    "context_adherence",
    "steps_per_task"
  ],
  "metrics_config": {
    "agent_success": { "threshold": 7, "mode": "quality" },
    "output_format": { "regex": "^\\{[\\s\\S]*\\}$" }
  }
}
```

4. **Run benchmarks:**
```bash
augbench benchmark
```

##### Results persistence and charts
- Results JSON is saved to `./results/<output_filename>.json` by default (override with `--output`)
- `output_filename` must be a base name (do not include `.json`); it will be appended automatically
- Per-metric PNG bar charts are generated as `./results/<output_filename>_<metric>.png` (requires optional dependency)
- Bar charts show average values per prompt, excluding null values and failed runs
- Augment CLI data is displayed in green, Claude Code data in orange
- Overwrite behavior: files are overwritten; writes are atomic where practical
- Known ranges (e.g., `output_quality` 0–10) are clamped when applicable
- Install chart dependencies to enable PNGs: `npm install chartjs-node-canvas chart.js @napi-rs/canvas`

### PR Recreation Mode

PR Recreation Mode benchmarks AI assistants by having them recreate actual Pull Requests from a repository's history. This provides a more realistic evaluation using real-world development scenarios.

#### Quick Setup

1. **Configure PR Recreation Mode:**
```json
{
  "mode": "pr_recreate",
  "target_repo_url": "https://github.com/owner/repository.git",
  "num_prs": 5,
  "assistants": ["Claude Code", "Augment CLI"],
  "runs_per_prompt": 2,
  "output_filename": "pr_recreation_results",
  "metrics": [
    "response_time",
    "ast_similarity",
    "instruction_adherence",
    "output_quality"
  ]
}
```

2. **Set up LLM for prompt generation:**
```env
LLM_ENDPOINT=http://localhost:11434/api/generate
LLM_MODEL=llama2
GH_TOKEN=your_github_token  # For private repositories
```

3. **Run PR recreation benchmark:**
```bash
augbench benchmark
```

#### How it Works

1. **Analyzes Recent PRs**: Clones the target repository and identifies recent merged Pull Requests
2. **Generates Prompts**: Uses an LLM to convert PR descriptions into coding prompts
3. **Creates Test Environment**: Sets up isolated environments with pre-PR codebase state
4. **Runs Benchmarks**: Executes assistants on generated prompts in chronological order
5. **Evaluates Results**: Compares outputs with actual PR implementations using specialized metrics
6. **Tracks Progress**: Updates each assistant's codebase incrementally as they complete PRs

#### Key Features

- **Real-world Scenarios**: Tests on actual development tasks from real repositories
- **Chronological Execution**: PRs processed in merge order for realistic progression
- **Specialized Metrics**: AST Similarity and enhanced Instruction Adherence for code comparison
- **Incremental Development**: Successful implementations become base for subsequent PRs
- **Automated Prompt Generation**: Converts PR descriptions into actionable coding prompts

For detailed documentation, see [PR Recreation Mode Guide](docs/PR_RECREATION_MODE.md).

### Commands

#### `augbench init`
Initialize configuration files (`.env` and `settings.json`) in the current directory.

**Options:**
- `--force`: Overwrite existing configuration files

#### `augbench benchmark`
Run benchmark tests on AI coding assistants. After completion, a brief summary is printed to the console (per assistant: runs, completion rate, agent success rate, average response time, average quality, output format success rate, and evaluator LLM error rate).

**Options:**
- `-r, --repository <path>`: Local path to repository for context (alias of `--repo-path`)
- `--repo-path <path>`: Local repository path for benchmarking context
- `--repo-url <url>`: Remote Git repository URL (HTTPS or SSH)
- `--branch <name>`: Branch to use when cloning a remote repository
- `--ref <ref>`: Git ref (commit SHA or tag) to checkout after clone
- `--stage-dir <dir>`: Staging directory for per-assistant working copies (default: `./stage`)
- `--settings <path>`: Path to settings file (default: ./settings.json)
- `--output <path>`: Output directory for results

Exclusivity:
- Exactly one of `--repo-url` or `--repo-path/--repository` must be provided. If neither is provided, Augbench will prompt for a local repository path.

#### `augbench validate`
Validate environment, settings, LLM connectivity, Git installation/connectivity, and CLI assistant availability (Augment CLI and Claude Code). If `--repo-url` or `--repo-path` is provided, performs remote connectivity checks or local path validation.

**Options:**
- `-r, --repository <path>`: Local path (alias of `--repo-path`)
- `--repo-path <path>`: Local repository path to validate
- `--repo-url <url>`: Remote Git repository URL to probe
- `--branch <name>`: Branch to probe on the remote
- `--ref <ref>`: Git ref to validate
- `--stage-dir <dir>`: Staging directory (default: `./stage`)
- `--settings <path>`: Path to settings file to validate

Validation behavior:
- Git installation and version: requires git >= 2.30.0
- Git connectivity: probes a public repo (chromium) and the provided `--repo-url` if set (private repos may require `GH_TOKEN`/`GIT_TOKEN` or SSH keys)
- LLM connectivity test:
  - For `LLM_PROVIDER=anthropic`: performs a minimal POST to `/v1/messages`
  - For `openai-compatible` (default): calls `GET /models`
- Repository path:
  - If provided, checks existence and directory; warns if missing `.git`
- CLI assistants:
  - Checks availability of Augment CLI and Claude Code. If either is configured in `settings.json` but unavailable, validation fails.
- Home directory:
  - If no local path options are provided, validates access to the OS home directory

### Using a remote repository

You can benchmark against a remote Git repository. Augbench creates a per-assistant staging working copy under a staging directory and runs each assistant there. The staging folder is re-used across runs and must be cleaned manually to start fresh.

Examples:

```bash
# HTTPS public repo, branch main
augbench benchmark --repo-url https://github.com/org/repo.git --branch main --stage-dir ./stage

# SSH private repo
augbench validate --repo-url git@github.com:org/repo.git
```

Behavior:
- Per-assistant working directory: `<stage-dir>/<agent_slug>` where `agent_slug` is derived from the assistant name.
- Clean-state policy: if the per-assistant folder already exists, Augbench warns and exits. Remove the folder to run again, or change `--stage-dir`.

Charts:
- If chart dependencies are installed, Augbench will generate PNG bar charts for each measured metric.
- Bar charts display average values per prompt (x-axis) for each agent, excluding null values and failed runs.
- Files are named `<base>_<metric>.png` in the same output directory.
- Use `--output` to place artifacts in a custom directory.

- Read-only discipline: source files are not modified by Augbench; agents should write artifacts under `<stage-dir>/<agent_slug>/augbench_output/<run_id>`.
- Private repositories:
  - HTTPS: set `GH_TOKEN` or `GIT_TOKEN` for non-interactive authentication. Tokens are injected via an HTTP header (not embedded in the URL).
  - SSH: ensure your SSH agent has appropriate keys loaded.

Troubleshooting:
- Connectivity failures: check network, proxy, or token/SSH setup.
- `--log-file <path>`: Append logs to this file while still logging to console

- Branch not found: verify `--branch` exists on the remote.
- Ref not found: verify `--ref` is a valid commit SHA or tag.


#### `augbench metrics`
List available metrics and their descriptions. Use `--json` to get machine-readable metadata and metrics_config help.

Options:
- `--json`: Output as JSON

#### Global Options
- `-v, --verbose`: Enable verbose logging
- `-q, --quiet`: Suppress non-essential output
- `--config <path>`: Path to configuration file
- `--output <path>`: Output directory for results
- `--log-file <path>`: Append logs to a file while still logging to console

### Configuration

#### Environment Variables (.env)

```env
# LLM endpoint URL
# - OpenAI-compatible gateway (e.g., https://openrouter.ai/api/v1 or your LiteLLM server)
# - Anthropic native (https://api.anthropic.com/v1) when using LLM_PROVIDER=anthropic
LLM_OPENAI_ENDPOINT=

# API key for the LLM service (Gateway key or Anthropic key)
LLM_API_KEY=

# Optional: Select model id, e.g., anthropic/claude-3.5-sonnet-20241022 (provider-dependent)
LLM_MODEL=

# Optional: Provider hint (openai-compatible | anthropic). Default: openai-compatible
LLM_PROVIDER=

# Optional: Anthropic API version (only when LLM_PROVIDER=anthropic)
# Default: 2023-06-01 (update to current if needed)
LLM_ANTHROPIC_VERSION=2023-06-01

# Optional: Debug mode
DEBUG=false

# Optional: Request timeout in milliseconds
TIMEOUT=30000
```

Note on repository paths:
- Provide a local filesystem path (absolute or relative), not a remote Git URL.
- Examples:
  - macOS/Linux: `augbench benchmark --repository /Users/you/code/my-repo`
  - Windows: `augbench benchmark --repository "C:\Users\you\code\my-repo"`
  - If you want to benchmark a GitHub repo, clone it locally first and pass the cloned directory path.

#### Settings (settings.json)

```json
{
  "num_prompts": 3,
  "prompts": [
    "prompt1.md",
    "prompt2.md",
    "prompt3.md"
  ],
  "assistants": [
    "Claude Code",
    "Augment CLI"
  ],
  "runs_per_prompt": 2,
  "parallel_runs": 1,
  "output_filename": "bench_local",
  "metrics": [
    "response_time",
    "output_quality"
  ]
}
```

**Settings Parameters:**
- `num_prompts`: Number of prompts to use (must match length of prompts array)
- `prompts`: Array of prompt file paths
- `assistants`: Array of AI assistant names to benchmark
- `runs_per_prompt`: Number of times to run each prompt-assistant combination
- `parallel_runs`: Maximum concurrent runs per agent (default: 1). Set higher for faster benchmarking
- `output_filename`: Base filename for results (without .json extension)
- `metrics`: Array of metrics to measure
- `metrics_config`: Configuration for specific metrics

### Parallel Execution

Augbench supports parallel execution of benchmark runs to speed up the benchmarking process:

- Set `parallel_runs: 1` for sequential execution (default)
- Set `parallel_runs: 4` to run up to 4 concurrent benchmarks per agent
- The system automatically manages resources and prevents overload
- See [docs/parallel-execution.md](docs/parallel-execution.md) for detailed information

### Results Format

Results are saved in JSON format with the following structure:

```json
{
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "1.0.0",
    "totalRuns": 12,
    "platform": {
      "platform": "darwin",
      "arch": "arm64",
      "nodeVersion": "v18.0.0"
    }
  },
  "results": [
    {
      "prompt": "prompt1.md",
      "assistant": "Claude Code",
      "runs": [
        {
          "run_id": 1,
          "response_time": 2.45,
          "output_quality": 8.5,
          "error": null
        }
      ]
    }
  ]
}
```

## Extensions

Augbench is designed with extensibility in mind. You can easily add new evaluator LLMs, tests, agents, and metrics to enhance the benchmarking capabilities.

### Adding a New Evaluator LLM

To add a new LLM for evaluating output quality (used by AssessableMetric):

1. **Update Environment Configuration** (`src/config/EnvironmentConfig.js`):

```javascript
// Add new LLM endpoint configuration
const requiredVars = [
  'LLM_OPENAI_ENDPOINT',
  'LLM_API_KEY',
  'LLM_ANTHROPIC_ENDPOINT',  // New LLM endpoint
  'LLM_ANTHROPIC_API_KEY'    // New LLM API key
];
```

2. **Create LLM Client** (`src/utils/LLMClient.js`):

```javascript
class LLMClient {
  constructor(provider = 'openai') {
    this.provider = provider;
    this.setupClient();
  }

  setupClient() {
    switch (this.provider) {
      case 'openai':
        this.endpoint = process.env.LLM_OPENAI_ENDPOINT;
        this.apiKey = process.env.LLM_API_KEY;
        break;
      case 'anthropic':
        this.endpoint = process.env.LLM_ANTHROPIC_ENDPOINT;
        this.apiKey = process.env.LLM_ANTHROPIC_API_KEY;
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
    }
  }

  async evaluate(prompt, response) {
    // Implementation for different LLM providers
    const payload = this.buildPayload(prompt, response);
    return await this.makeRequest(payload);
  }
}
```

3. **Update AssessableMetric** (`src/metrics/AssessableMetric.js`):

```javascript
constructor(name, description, llmProvider = 'openai') {
  super(name, description);
  this.llmClient = new LLMClient(llmProvider);
}
```

### Adding a New Test/Prompt

To add new test scenarios:

1. **Create Prompt File**:
```bash
# Create a new prompt file
touch prompt4.md
```

2. **Write Test Content** (`prompt4.md`):
```markdown
# Database Optimization Task

You are working on a Node.js application with performance issues. The database queries are slow and need optimization.

## Context
- Using PostgreSQL database
- Express.js REST API
- High traffic application (1000+ requests/minute)

## Task
Optimize the following database query and explain your approach:

```sql
SELECT * FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2023-01-01'
ORDER BY o.created_at DESC;
```

## Requirements
- Improve query performance
- Maintain data integrity
- Explain indexing strategy
- Provide monitoring recommendations
```

3. **Update Settings** (`settings.json`):
```json
{
  "num_prompts": 4,
  "prompts": [
    "prompt1.md",
    "prompt2.md",
    "prompt3.md",
    "prompt4.md"
  ],
  "assistants": ["Claude Code", "Augment CLI"],
  "runs_per_prompt": 2,
  "output_filename": "bench_local",
  "metrics": [
    "response_time",
    "output_quality",
    "output_format_success",
    "instruction_adherence",
    "context_adherence",
    "steps_per_task"
  ],
  "metrics_config": {
    "agent_success": { "threshold": 7, "mode": "quality" },
    "output_format": { "json_schema_path": "schemas/output.schema.json" }
  }
}
```

### Adding a New AI Agent/Assistant

To add support for a new AI coding assistant:

1. **Create Adapter Class** (`src/adapters/NewAssistantAdapter.js`):

```javascript
const BaseAdapter = require('./BaseAdapter');

class NewAssistantAdapter extends BaseAdapter {
  constructor() {
    super('New Assistant', 'new-assistant');
  }

  async isAvailable() {
    try {
      // Check if the assistant command is available
      const result = await this.platform.spawnProcess('new-assistant', ['--version'], {
        timeout: 5000
      });
      return result.code === 0;
    } catch (error) {
      return false;
    }
  }

  async getVersion() {
    try {
      const result = await this.platform.spawnProcess('new-assistant', ['--version'], {
        timeout: 5000
      });
      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  async execute(promptPath, repositoryPath, options = {}) {
    const startTime = Date.now();

    try {
      // Read the prompt
      const prompt = await this.readPrompt(promptPath);

      // Validate repository
      await this.validateRepository(repositoryPath);

      // Execute the assistant with retry logic
      const result = await this.executeWithRetry(async () => {
        return await this.platform.spawnProcess('new-assistant', [
          'analyze',
          '--prompt', promptPath,
          '--repository', repositoryPath,
          '--format', 'text'
        ], {
          timeout: options.timeout || 60000,
          cwd: repositoryPath
        });
      }, options.retries || 3);

      const endTime = Date.now();
      const responseTime = (endTime - startTime) / 1000;

      return {
        success: true,
        output: result.stdout,
        responseTime,
        error: null,
        metadata: {
          version: await this.getVersion(),
          exitCode: result.code
        }
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTime = (endTime - startTime) / 1000;

      return {
        success: false,
        output: '',
        responseTime,
        error: error.message,
        metadata: {
          version: await this.getVersion(),
          errorType: error.constructor.name
        }
      };
    }
  }
}

module.exports = NewAssistantAdapter;
```

2. **Register in AdapterFactory** (`src/adapters/AdapterFactory.js`):

```javascript
const NewAssistantAdapter = require('./NewAssistantAdapter');

class AdapterFactory {
  constructor() {
    this.adapters = new Map([
      ['Claude Code', ClaudeCodeAdapter],
      ['Augment CLI', AugmentCLIAdapter],
      ['New Assistant', NewAssistantAdapter]  // Add new adapter
    ]);
  }

  // ... rest of the factory implementation
}
```

3. **Update Settings Validation** (`src/config/SettingsManager.js`):

```javascript
const validAssistants = [
  'Claude Code',
  'Augment CLI',
  'New Assistant'  // Add to valid assistants list
];
```

4. **Add to Configuration** (`settings.json`):
```json
{
  "assistants": ["Claude Code", "Augment CLI", "New Assistant"]
}
```

### Metrics Reference

Per-run metrics (recorded per run):
- response_time (Measurable): seconds
- output_quality (Assessable): 1–10 score
- output_format_success (Measurable): 1 or 0; configured via metrics_config.output_format.regex or .json_schema_path
- instruction_adherence (Assessable): 1–10 score
- context_adherence (Assessable): 1–10 score
- steps_per_task (Measurable): number of steps if detectable; otherwise null

Summary metrics (computed in results summary):
- task_completion_rate
- agent_success_rate (configurable; defaults to output_quality >= threshold 7)
- llm_call_error_rate (evaluator LLM failures on assessable metrics)
- output_format_success_rate

Configuration keys (settings.json):
- metrics: ["response_time", "output_quality", "output_format_success", "instruction_adherence", "context_adherence", "steps_per_task"]
- metrics_config.agent_success: { threshold: 7, mode: "quality" | "completion" }
- metrics_config.output_format: { regex?: string, json_schema_path?: string }

Evaluator LLM env (for Assessable metrics): LLM_PROVIDER (anthropic | openai-compatible), LLM_OPENAI_ENDPOINT, LLM_API_KEY, LLM_MODEL, LLM_ANTHROPIC_VERSION.

### Adding a New Metric

Augbench supports two types of metrics: **MeasurableMetric** (directly measured) and **AssessableMetric** (LLM-evaluated).

#### Adding a MeasurableMetric

For metrics that can be directly measured (e.g., memory usage, token count):

1. **Create Metric Class** (`src/metrics/MemoryUsageMetric.js`):

```javascript
const MeasurableMetric = require('./MeasurableMetric');

class MemoryUsageMetric extends MeasurableMetric {
  constructor() {
    super('memory_usage', 'Peak memory usage during execution (MB)');
  }

  async measure(result, prompt, assistant) {
    // Extract memory usage from result metadata or system monitoring
    if (result.metadata && result.metadata.memoryUsage) {
      return {
        value: result.metadata.memoryUsage,
        unit: 'MB',
        timestamp: new Date().toISOString()
      };
    }

    // Fallback: estimate based on output size or other factors
    const estimatedMemory = this.estimateMemoryUsage(result.output);
    return {
      value: estimatedMemory,
      unit: 'MB',
      timestamp: new Date().toISOString(),
      estimated: true
    };
  }

  estimateMemoryUsage(output) {
    // Simple estimation based on output length
    const baseMemory = 50; // Base memory usage in MB
    const outputSizeMemory = (output.length / 1000) * 0.1; // ~0.1MB per 1000 chars
    return Math.round((baseMemory + outputSizeMemory) * 100) / 100;
  }
}

module.exports = MemoryUsageMetric;
```

#### Adding an AssessableMetric

For metrics that require LLM evaluation (e.g., code quality, security):

1. **Create Metric Class** (`src/metrics/CodeSecurityMetric.js`):

```javascript
const AssessableMetric = require('./AssessableMetric');

class CodeSecurityMetric extends AssessableMetric {
  constructor() {
    super('code_security', 'Security assessment of generated code (1-10 scale)');
  }

  buildAssessmentPrompt(originalPrompt, assistantResponse) {
    return `
You are a cybersecurity expert reviewing code for security vulnerabilities.

Original Task:
${originalPrompt}

Assistant's Response:
${assistantResponse}

Please evaluate the security of the code/solution provided by the assistant on a scale of 1-10:

1-3: Critical security issues (SQL injection, XSS, hardcoded secrets, etc.)
4-6: Moderate security concerns (insufficient validation, weak encryption, etc.)
7-8: Good security practices with minor improvements needed
9-10: Excellent security implementation following best practices

Consider:
- Input validation and sanitization
- Authentication and authorization
- Data encryption and protection
- Error handling and information disclosure
- Dependency security
- Code injection vulnerabilities

Respond with only a number from 1 to 10, followed by a brief explanation.

Example: "7 - Good security practices but missing input validation on user data."
`;
  }

  parseAssessmentResponse(response) {
    // Extract numeric score from LLM response
    const match = response.match(/^(\d+(?:\.\d+)?)/);
    if (match) {
      const score = parseFloat(match[1]);
      return Math.min(Math.max(score, 1), 10); // Clamp between 1-10
    }

    // Fallback: try to find number in response
    const numbers = response.match(/\b(\d+(?:\.\d+)?)\b/g);
    if (numbers && numbers.length > 0) {
      const score = parseFloat(numbers[0]);
      return Math.min(Math.max(score, 1), 10);
    }

    throw new Error(`Could not parse assessment score from response: ${response}`);
  }
}

module.exports = CodeSecurityMetric;
```

2. **Register in MetricsFactory** (`src/metrics/MetricsFactory.js`):

```javascript
const MemoryUsageMetric = require('./MemoryUsageMetric');
const CodeSecurityMetric = require('./CodeSecurityMetric');

class MetricsFactory {
  constructor() {
    this.metrics = new Map([
      ['response_time', ResponseTimeMetric],
      ['output_quality', OutputQualityMetric],
      ['memory_usage', MemoryUsageMetric],      // Add new measurable metric
      ['code_security', CodeSecurityMetric]     // Add new assessable metric
    ]);
  }

  // ... rest of the factory implementation
}
```

3. **Update Settings Validation** (`src/config/SettingsManager.js`):

```javascript
const validMetrics = [
  'response_time',
  'output_quality',
  'memory_usage',
  'code_security'
];
```

4. **Add to Configuration** (`settings.json`):
```json
{
  "metrics": [
    "response_time",
    "output_quality",
    "memory_usage",
    "code_security"
  ]
}
```

### Best Practices for Extensions

1. **Error Handling**: Always implement comprehensive error handling in your extensions
2. **Validation**: Validate inputs and configurations thoroughly
3. **Documentation**: Document your extensions with clear examples
4. **Testing**: Write unit tests for new components
5. **Logging**: Use the built-in Logger for consistent output
6. **Platform Compatibility**: Ensure cross-platform compatibility using Platform utilities

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Linting

```bash
# Check code style
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Debugging

Enable debug mode for detailed logging:

```bash
# Set debug environment variable
DEBUG=true augbench benchmark --verbose

# Or in .env file
DEBUG=true
```

## Troubleshooting

### Common Issues

1. **"Command not found" errors**
   - Ensure AI assistants are installed and in PATH
   - Check adapter configuration and command names
   - Verify executable permissions

2. **API key errors**
   - Verify LLM_API_KEY is set correctly in .env
   - Check API key permissions and quotas
   - Ensure endpoint URL is correct

3. **File permission errors**
   - Ensure write permissions for output directory
   - Check file paths are accessible
   - Verify prompt files exist and are readable

4. **Network timeouts**
   - Increase timeout values in configuration
   - Check network connectivity
   - Verify LLM endpoint accessibility

5. **Memory issues**
   - Reduce number of concurrent runs
   - Increase system memory limits
   - Monitor system resources during benchmarks

### Debug Mode

Enable verbose logging for detailed troubleshooting:

```bash
augbench benchmark --verbose
```

### Getting Help

- Check the [Issues](https://github.com/your-repo/augbench/issues) page
- Review the [Documentation](https://github.com/your-repo/augbench/wiki)
- Join our [Discord Community](https://discord.gg/augbench)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/augbench.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature`
5. Make your changes and add tests
6. Run tests: `npm test`
7. Submit a pull request

### Code Style

- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Write comprehensive tests for new features

## Project Support

Please note that all projects released under [Augment-Solutions](https://github.com/augment-solutions) are provided for your exploration only, and are not formally supported by Augment Code with Service Level Agreements (SLAs). They are provided AS-IS and we do not make any guarantees of any kind. Please do not submit a support ticket relating to any issues arising from the use of these projects.

Any issues discovered through the use of this project should be filed as issues on the Github Repo.
They will be reviewed as time permits, but there are no formal SLAs for support.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
