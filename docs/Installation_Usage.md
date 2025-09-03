# Installation & Usage Guide

## Prerequisites

### System Requirements
- **Node.js**: ≥22.0.0
- **Git**: ≥2.30.0 (for worktree support)
- **Disk Space**: >10GB free space for repository staging
- **Operating System**: macOS, Linux, Windows (with WSL recommended)

### AI Assistant CLIs
Install the AI coding assistants you want to benchmark:

#### Augment CLI
```bash
npm install -g @augment/cli
# Verify installation
auggie --version
```

#### Claude Code (Anthropic)
```bash
# Install via your preferred method
# Ensure 'claude' command is available in PATH
claude --version
```

#### Cursor CLI
```bash
# Install Cursor and ensure CLI is available
# Ensure 'cursor-agent' command is available in PATH
cursor-agent --version
```

## Installation

### From Source
```bash
git clone https://github.com/augment-solutions/augbench.git
cd augbench
npm install
```

### Verify Installation
```bash
node bin/augbench.js --help
```

### Tree-sitter Grammar Files (Optional)
For enhanced AST similarity analysis, grammar files are included:

```bash
# Grammar files are pre-downloaded in grammars/ directory
ls grammars/
# tree-sitter-javascript.wasm
# tree-sitter-typescript.wasm
# tree-sitter-python.wasm
```

**Note**: If grammar files are missing, AST similarity will automatically fall back to text-based comparison.

## Configuration

### 1. Create Settings File
Copy and customize the appropriate example:

**For LLM_Evaluator mode:**
```bash
cp settings.json.llm.example settings.json
```

**For PR_Recreate mode:**
```bash
cp settings.json.pr.example settings.json
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
# Edit .env with your API keys
```

Required environment variables:
```bash
# For LLM-assessed metrics
LLM_PROVIDER=anthropic
LLM_ANTHROPIC_API_KEY=your_api_key_here
LLM_MODEL=claude-3-5-sonnet-20241022
LLM_ANTHROPIC_VERSION=2023-06-01

# Optional: Git authentication for private repos
GH_TOKEN=your_github_token
GIT_TOKEN=your_git_token
```

### 3. Customize Agent Commands
Edit `settings.json` to configure agent command templates:

```json
{
  "agent_config": {
    "Augment CLI": {
      "commandTemplate": "auggie -p --compact -if \"{prompt}\"",
      "timeout": 1200000
    },
    "Claude Code": {
      "commandTemplate": "cat \"{prompt}\" | claude -p",
      "timeout": 1200000
    }
  }
}
```

## Usage

### Basic Commands

#### Validate Configuration
```bash
node bin/augbench.js validate
```

#### Run Benchmark
```bash
node bin/augbench.js benchmark
```

#### Generate Reports
```bash
node bin/augbench.js report
```

#### Generate Charts
```bash
node bin/augbench.js report --charts
```

### LLM_Evaluator Mode

This mode evaluates agents on generated coding prompts.

#### Configuration Example
```json
{
  "mode": "LLM_Evaluator",
  "agents": ["Augment CLI", "Claude Code"],
  "repo_path": "./my-project",
  "metrics": ["response_time", "completeness", "technical_correctness"],
  "LLM_Evaluator": {
    "generate_prompts": true,
    "prompt_topics": [
      "Add unit tests for the API endpoints",
      "Implement error handling for database operations"
    ]
  }
}
```

#### Workflow
1. **Prompt Discovery**: Checks `prompts/` directory
2. **Prompt Generation**: If empty, generates prompts from repo + topics
3. **Agent Execution**: Runs each agent on each prompt
4. **Metrics Collection**: Measures response time, LLM-assessed quality
5. **Results Storage**: Saves to `results/benchmark_results.json`

### PR_Recreate Mode

This mode recreates real Pull Request scenarios.

#### Configuration Example
```json
{
  "mode": "PR_Recreate",
  "agents": ["Augment CLI", "Claude Code"],
  "repo_url": "https://github.com/owner/repo.git",
  "metrics": ["response_time", "ast_similarity"],
  "PR_Recreate": {
    "num_prs": 5
  }
}
```

#### Workflow
1. **Repository Analysis**: Clones repo and analyzes git history
2. **PR Extraction**: Finds recent merged PRs from last 2 years
3. **Workspace Setup**: Creates git worktree at base commit
4. **Human Reference**: Cherry-picks PRs to create reference implementation
5. **Agent Execution**: Runs agents on PR prompts in isolated branches
6. **Comparison**: Measures AST similarity against human implementation

### Output Structure

#### Results Directory
```
results/
├── benchmark_results.json          # Raw benchmark data
├── benchmark_results_response_time.png
├── benchmark_results_completeness.png
└── ...                            # One chart per metric
```

#### Stage Directory
```
stage/
├── base_repo/                     # Cloned repository (PR_Recreate)
├── workspace/                     # Git worktree workspace
├── prompts/                       # Generated prompts
├── runs/                          # Agent execution logs
├── Augment_CLI/                   # Agent workspace (LLM_Evaluator)
└── Claude_Code/                   # Agent workspace (LLM_Evaluator)
```

## Troubleshooting

### Common Issues

#### "git not found" or version too old
```bash
# Update git to ≥2.30.0
brew install git  # macOS
sudo apt update && sudo apt install git  # Ubuntu
```

#### "Agent CLI not found"
```bash
# Ensure agent CLIs are in PATH
which auggie
which claude
which cursor-agent
```

#### "Permission denied" for repository
```bash
# Set up git authentication
export GH_TOKEN=your_token
# Or configure SSH keys
```

#### "Disk space insufficient"
```bash
# Clean up stage directory
rm -rf stage/
# Ensure >10GB free space
df -h
```

### Debug Mode
```bash
# Enable verbose logging
DEBUG=augbench:* node bin/augbench.js benchmark
```

### Validation
```bash
# Check system requirements
node bin/augbench.js validate

# Test agent commands
node bin/augbench.js test-agents
```

## Troubleshooting

### Cursor CLI Issues

If Cursor CLI execution fails, check the following:

#### 1. CLI Availability
```bash
# Verify cursor-agent is in PATH
which cursor-agent
cursor-agent --help
```

#### 2. Authentication
```bash
# Ensure you're logged into Cursor with valid subscription
# Check Cursor app settings for CLI access
```

#### 3. Command Template
Verify your `settings.json` has correct commandTemplate:
```json
{
  "agent_config": {
    "Cursor CLI": {
      "commandTemplate": "cat \"{prompt}\" | cursor-agent -p",
      "timeout": 1200000
    }
  }
}
```

#### 4. Common Issues
- **Exit code 1**: Check authentication or CLI installation
- **Timeout errors**: Increase timeout in agent_config
- **Command not found**: Ensure cursor-agent is in PATH
- **Permission denied**: Check file permissions for prompt files

#### 5. Debug Logging
Enable debug logging to see full command execution:
```bash
DEBUG=true node bin/augbench.js benchmark
```

This will show:
- Full command being executed
- Working directory
- Timeout settings
- stderr output (last 500 characters)

## Performance Tips

1. **Parallel Execution**: Set `"parallel_agents": true` for faster benchmarks
2. **Selective Metrics**: Only include needed metrics to reduce execution time
3. **Prompt Limits**: Use fewer prompts/PRs for quick testing
4. **Timeout Tuning**: Adjust agent timeouts based on complexity
5. **Disk Cleanup**: Regularly clean `stage/` directory

## Next Steps

- See [Modes.md](./Modes.md) for detailed mode documentation
- See [Metrics.md](./Metrics.md) for metric descriptions
- See [Testing.md](./Testing.md) for testing guidelines
