# PR Recreation Mode

PR Recreation Mode is a powerful feature of Augbench that benchmarks AI coding assistants by having them recreate actual Pull Requests from a repository's history. This mode provides a more realistic evaluation of how well AI assistants can understand and implement real-world code changes.

## Overview

In PR Recreation Mode, Augbench:

1. **Analyzes Recent PRs**: Clones a target repository and identifies the most recent merged Pull Requests
2. **Generates Prompts**: Uses an LLM to convert PR descriptions into coding prompts that don't reveal the solution
3. **Creates Test Environment**: Sets up isolated environments for each AI assistant with the pre-PR codebase state
4. **Runs Benchmarks**: Executes each assistant on the generated prompts in chronological order
5. **Evaluates Results**: Compares assistant outputs with actual PR implementations using specialized metrics
6. **Tracks Progress**: Updates each assistant's codebase incrementally as they complete PRs successfully

## Key Features

- **Real-world Scenarios**: Tests assistants on actual development tasks from real repositories
- **Chronological Execution**: PRs are processed in the order they were merged, simulating realistic development progression
- **Specialized Metrics**: Includes AST Similarity and enhanced Instruction Adherence metrics designed for code comparison
- **Incremental Development**: Successful PR implementations become the base for subsequent PRs
- **Automated Prompt Generation**: Converts PR descriptions into clear, actionable coding prompts

## Configuration

### Basic Setup

Create or update your `settings.json` file:

```json
{
  "mode": "pr_recreate",
  "target_repo_url": "https://github.com/owner/repository.git",
  "num_prs": 5,
  "assistants": [
    "Claude Code",
    "Augment CLI"
  ],
  "runs_per_prompt": 2,
  "parallel_runs": 1,
  "parallel_agents": true,
  "output_filename": "pr_recreation_results",
  "metrics": [
    "response_time",
    "ast_similarity",
    "instruction_adherence",
    "output_quality"
  ],
  "metrics_config": {
    "agent_success": { "threshold": 7, "mode": "quality" }
  }
}
```

### Configuration Fields

#### Required Fields

- **`mode`**: Must be set to `"pr_recreate"`
- **`target_repo_url`**: Git repository URL to analyze (HTTPS or SSH)
- **`num_prs`**: Number of recent PRs to recreate (1-50)
- **`assistants`**: Array of AI assistant names to test
- **`runs_per_prompt`**: Number of runs per PR per assistant
- **`output_filename`**: Base name for results files

#### Optional Fields

- **`parallel_runs`**: Maximum concurrent runs per agent (default: 1)
- **`parallel_agents`**: Whether to run multiple agents in parallel (default: true)
- **`stage_dir`**: Staging directory for working files (default: "./stage")
- **`metrics`**: Array of metrics to measure (see Metrics section)
- **`metrics_config`**: Configuration for metric evaluation

## Prerequisites

### Environment Setup

1. **LLM Service**: A running LLM service for prompt generation
   ```bash
   # Example with Ollama
   ollama serve
   ollama pull llama2
   ```

2. **Environment Variables**:
   ```bash
   # LLM Configuration
   export LLM_ENDPOINT="http://localhost:11434/api/generate"
   export LLM_MODEL="llama2"
   export TIMEOUT="30000"
   
   # Git Authentication (for private repositories)
   export GH_TOKEN="your_github_token"
   # or
   export GIT_TOKEN="your_git_token"
   ```

3. **Git Access**: Ensure Git is installed and you have access to the target repository

### Repository Requirements

- Target repository must have merged Pull Requests
- Repository should be accessible (public or with proper authentication)
- PRs should contain meaningful code changes (not just documentation updates)

## Usage

### Command Line

```bash
# Initialize configuration
augbench init

# Edit settings.json to configure PR recreation mode
# (See Configuration section above)

# Validate configuration
augbench validate

# Run PR recreation benchmark
augbench benchmark
```

### Interactive Setup

When running `augbench benchmark` with PR recreation mode, you'll be prompted for:

1. **Number of PRs** (if not specified in settings)
2. **Confirmation** to proceed with LLM and repository connectivity issues
3. **Final confirmation** before starting the benchmark

## Metrics

### PR Recreation Specific Metrics

#### AST Similarity (`ast_similarity`)
- **Range**: 1-10 (10 = most similar)
- **Description**: Compares Abstract Syntax Trees between assistant output and actual PR code
- **Evaluation**: Uses LLM to assess structural similarity, architectural patterns, and code organization

#### Enhanced Instruction Adherence (`instruction_adherence`)
- **Range**: 1-10 (10 = most adherent)
- **Description**: Evaluates how well the assistant follows the generated prompt based on PR requirements
- **Context**: Enhanced with PR-specific context and requirements

### Standard Metrics

All standard Augbench metrics are also available:
- `response_time`: Time taken to complete the task
- `output_quality`: Overall quality of the generated code
- `context_adherence`: How well the assistant uses provided context
- `steps_per_task`: Number of steps taken to complete the task

## Directory Structure

PR Recreation Mode creates the following directory structure:

```
staging/
├── human/                          # Actual PR implementations
│   ├── pr_1_123/                  # PR order 1, number 123
│   │   ├── [repository files]     # Code state after PR
│   │   └── pr_metadata.json       # PR information
│   └── pr_2_456/
├── agents/                         # Assistant working directories
│   ├── claude-code/               # Assistant-specific folders
│   │   ├── base/                  # Current incremental state
│   │   ├── pr_1_123/             # PR-specific working directory
│   │   └── pr_2_456/
│   └── augment-cli/
├── prompts/                        # Generated prompts
│   ├── pr_1_123.md               # Prompt for PR 123
│   └── pr_2_456.md
└── base_repo/                      # Initial repository state
```

## Workflow Details

### 1. Repository Analysis
- Clones target repository with full history
- Identifies merge commits representing PRs
- Extracts PR metadata (title, description, file changes, author)
- Sorts PRs chronologically (oldest first)

### 2. Prompt Generation
- Uses LLM to convert PR descriptions into coding prompts
- Removes references to the original PR to avoid giving away solutions
- Includes context about file changes and requirements
- Stores prompts as Markdown files with metadata

### 3. Environment Preparation
- Creates isolated working directories for each assistant
- Prepares base repository state (before all PRs)
- Sets up human reference implementations for comparison

### 4. Benchmark Execution
- Processes PRs in chronological order
- Runs each assistant on generated prompts
- Measures performance using specialized metrics
- Updates successful implementations to assistant's incremental codebase

### 5. Results Analysis
- Compares assistant outputs with actual PR implementations
- Generates comprehensive metrics and visualizations
- Creates PR-specific charts and summaries

## Best Practices

### Repository Selection
- Choose repositories with meaningful, well-documented PRs
- Avoid repositories with mostly documentation or configuration changes
- Select repositories with clear, atomic PRs rather than large, complex ones

### Configuration Tuning
- Start with fewer PRs (3-5) for initial testing
- Adjust `runs_per_prompt` based on consistency needs
- Use appropriate metrics for your evaluation goals

### LLM Configuration
- Ensure your LLM service is stable and responsive
- Use models capable of understanding code and generating clear prompts
- Monitor LLM performance and adjust timeout settings as needed

## Troubleshooting

### Common Issues

#### LLM Connection Failed
```
Error: Cannot connect to LLM endpoint: http://localhost:11434/api/generate
```
**Solution**: Ensure your LLM service is running and accessible

#### Repository Access Denied
```
Error: Cannot reach target repository
```
**Solution**: Check repository URL and authentication (GH_TOKEN/GIT_TOKEN)

#### No PRs Found
```
Error: No PRs found for analysis
```
**Solution**: Verify the repository has merged PRs and check Git connectivity

#### Prompt Generation Failed
```
Error: LLM request failed
```
**Solution**: Check LLM service status and increase timeout if needed

### Performance Optimization

- Use `parallel_agents: true` for faster execution
- Adjust `parallel_runs` based on system resources
- Consider using a local LLM service for better performance
- Monitor disk space usage in staging directories

## Examples

### Small Open Source Project
```json
{
  "mode": "pr_recreate",
  "target_repo_url": "https://github.com/user/small-project.git",
  "num_prs": 3,
  "assistants": ["Claude Code"],
  "runs_per_prompt": 1,
  "output_filename": "small_project_test",
  "metrics": ["ast_similarity", "instruction_adherence"]
}
```

### Comprehensive Evaluation
```json
{
  "mode": "pr_recreate",
  "target_repo_url": "https://github.com/org/large-project.git",
  "num_prs": 10,
  "assistants": ["Claude Code", "Augment CLI"],
  "runs_per_prompt": 3,
  "parallel_runs": 2,
  "output_filename": "comprehensive_pr_evaluation",
  "metrics": [
    "response_time",
    "ast_similarity", 
    "instruction_adherence",
    "output_quality",
    "context_adherence"
  ]
}
```

## Limitations

- Requires access to repository history and merged PRs
- Dependent on LLM service for prompt generation
- May not work well with very large or complex PRs
- Limited to repositories with clear, atomic changes
- Requires significant disk space for multiple repository copies

## Future Enhancements

- Support for filtering PRs by type, size, or author
- Integration with GitHub API for richer PR metadata
- Support for custom prompt templates
- Advanced metrics for code quality and maintainability
- Integration with CI/CD systems for automated evaluation
