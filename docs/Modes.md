# Benchmark Modes

Augbench supports two distinct benchmarking modes, each designed for different evaluation scenarios.

## LLM_Evaluator Mode

### Overview
Evaluates AI coding assistants on generated coding prompts using both quantitative and qualitative metrics.

### Use Cases
- **General capability assessment** across diverse coding tasks
- **Prompt response quality** evaluation
- **Performance benchmarking** with standardized tasks
- **Multi-agent comparison** on identical prompts

### Configuration
```json
{
  "mode": "LLM_Evaluator",
  "repo_path": "./project" | "repo_url": "https://github.com/owner/repo.git",
  "LLM_Evaluator": {
    "generate_prompts": true,
    "prompt_topics": [
      "Add comprehensive error handling",
      "Implement unit tests for core functions",
      "Optimize database queries for performance"
    ]
  }
}
```

### Workflow

#### 1. Prompt Discovery
- Checks `prompts/` directory for existing prompts
- If empty and `generate_prompts: true`, proceeds to generation

#### 2. Prompt Generation (if enabled)
- **Repository Analysis**: Summarizes project structure, README, package.json
- **LLM Generation**: Uses evaluator LLM to create coding prompts from topics
- **Prompt Storage**: Saves as `prompts/prompt1.md`, `prompt2.md`, etc.

#### 3. Agent Workspace Setup
- **Repository Staging**: Clones repo to `stage/{agent}/` for each agent
- **Isolation**: Each agent works in separate directory copy
- **Branch Setup**: Uses specified branch (default: main)

#### 4. Agent Execution
- **Sequential/Parallel**: Based on `parallel_agents` setting
- **Multiple Runs**: Supports `runs_per_prompt` for statistical significance
- **Timeout Handling**: Configurable per-agent timeouts
- **Output Capture**: Logs all agent output to `stage/runs/`

#### 5. Metrics Collection
- **Response Time**: Execution duration measurement
- **Diff Metrics**: File/line change analysis
- **LLM Assessment**: Quality evaluation via evaluator LLM
- **Error Handling**: Graceful failure with partial results

### Supported Metrics
- `response_time`: Execution time in seconds
- `diff_metrics`: Code change statistics
- `completeness`: Task completion assessment (0-10)
- `technical_correctness`: Technical accuracy (0-10)
- `functional_correctness`: Logical correctness (0-10)
- `clarity`: Code readability and organization (0-10)
- `instruction_adherence`: Prompt following accuracy (0-10)

### Output Structure
```
prompts/                  # Generated prompts (root level)
├── prompt1.md
└── prompt2.md

stage/
├── Augment_CLI/          # Agent workspace
│   ├── [project files]   # Cloned repository
│   └── ...
├── Claude_Code/          # Agent workspace
└── runs/                 # Execution logs
    ├── prompt1_Augment_CLI_run1.log
    └── prompt1_Claude_Code_run1.log
```

## PR_Recreate Mode

### Overview
Recreates real Pull Request scenarios to evaluate how well AI assistants can implement actual code changes.

### Use Cases
- **Real-world scenario testing** with historical PRs
- **Code change accuracy** assessment
- **AST similarity measurement** for structural comparison
- **Progressive complexity** evaluation across PR sequence

### Configuration
```json
{
  "mode": "PR_Recreate",
  "repo_url": "https://github.com/owner/repo.git",
  "PR_Recreate": {
    "num_prs": 5,
    "generate_prompts": true
  }
}
```

### Workflow

#### 1. Repository Analysis
- **Full Clone**: Clones repository with complete git history
- **Smart PR Detection**: Identifies merged PRs using multiple strategies (merge commits, squash merges, rebase merges)
- **Time Window**: Analyzes ALL PRs from last 12 months (no artificial limits)
- **Metadata Extraction**: Extracts title, description, file changes, author

#### 2. PR Selection & Sorting
- **Comprehensive Search**: Examines ALL merged PRs from last 12 months (no artificial limits)
- **Eligibility Filter**: Only considers PRs with ≥2 files changed (A/M/R/C/D statuses)
- **Recent Selection**: Selects `num_prs` most recent eligible merged PRs
- **Execution Order**: Sorts selected PRs oldest-first for sequential implementation
- **Edge Case Handling**: Warns if fewer eligible PRs exist than requested; errors if none eligible

#### 3. Workspace Setup
- **Base Commit**: Finds parent commit of oldest PR
- **Git Worktree**: Creates isolated workspace at base commit
- **Branch Structure**: Sets up human reference and agent branches

#### 4. Human Reference Implementation
- **Human Branch**: Creates `human` branch from base commit
- **Cherry-picking**: Applies PR commits in chronological order
- **Conflict Resolution**: Handles merge conflicts (currently warns)

#### 5. Prompt Discovery & Generation
- **Prompt Discovery**: Checks `prompts/` directory for existing prompts
- **Conditional Generation**: Only generates if no prompts exist and `generate_prompts: true`
- **LLM-based Generation**: Uses evaluator LLM to convert PR descriptions into actionable prompts
- **PR Description Focus**: Leverages actual PR descriptions and requirements, not generic topics
- **Context Preservation**: Includes file change information and project context
- **Solution Hiding**: Removes references to original implementation details
- **Prompt Storage**: Saves as `prompts/pr_1_{number}.md`, `pr_2_{number}.md`, etc.

#### 6. Agent Execution
- **Branch Isolation**: Each agent works in `agent-{name}` branch
- **Sequential PRs**: Implements PRs in chronological order
- **Commit Tracking**: Commits agent changes after each PR
- **Progressive State**: Agent branch evolves with each PR

#### 7. Comparison & Metrics
- **AST Similarity**: Compares agent vs human implementation structure
- **File-level Analysis**: Analyzes only files changed in each PR
- **Structural Comparison**: Uses simplified text-based AST similarity

### Supported Metrics
- `response_time`: Implementation time per PR
- `ast_similarity`: Code structure similarity (0-10)
- `completeness`: Implementation completeness (0-10)
- `technical_correctness`: Technical accuracy (0-10)
- `instruction_adherence`: Requirement following (0-10)

### Directory Structure
```
prompts/                  # Generated PR prompts (root level)
├── pr_1_123.md
├── pr_2_456.md
└── pr_3_789.md

stage/
├── base_repo/            # Full repository clone
└── workspace/            # Git worktree at base commit
    ├── [project files]   # Base state before PRs
    ├── .git -> base_repo/.git/worktrees/workspace
    └── branches:
        ├── human         # Reference implementation
        ├── agent-Augment_CLI
        └── agent-Claude_Code
```

### Prompt Generation Example
```markdown
---
pr_number: 123
pr_order: 1
generated_at: 2025-01-15T10:30:00.000Z
---

# Fix Authentication Token Validation Bug

## Overview
Implement a fix for the authentication system where users are experiencing login failures due to improper token validation logic.

## Problem Statement
The current token validation process is rejecting valid tokens, causing legitimate users to be unable to access the application. This affects user experience and system reliability.

## Requirements
- Implement robust token validation that properly handles edge cases
- Ensure backward compatibility with existing token formats
- Add comprehensive error handling and logging
- Include appropriate unit tests for the validation logic

## Expected Behavior
- Valid tokens should be accepted consistently
- Invalid tokens should be rejected with clear error messages
- The system should handle malformed tokens gracefully
- Performance should not be significantly impacted

## Files to Consider
- src/auth/tokenValidator.js (modified)
- tests/auth.test.js (added)

Please implement the requested changes following best practices and maintaining consistency with the existing codebase.
```

### PR Selection Example

Given these merged PRs from the last 12 months:
- **PR #95**: 1 file changed (M) ❌ **Filtered out**
- **PR #96**: 2 files changed (M, A) ✅ **Eligible**
- **PR #97**: 4 files changed (A, M, D, R) ✅ **Eligible**
- **PR #98**: 1 file changed (M) ❌ **Filtered out**
- **PR #99**: 3 files changed (A, M, D) ✅ **Eligible**
- **PR #100**: 2 files changed (M, M) ✅ **Eligible**
- **PR #101**: 5 files changed (A, M, D, R, C) ✅ **Eligible**

With `num_prs: 2`, the mode will:
1. **Examine**: ALL 7 PRs from the last 12 months (no artificial limit)
2. **Filter**: PRs #96, #97, #99, #100, and #101 meet the ≥2 files threshold
3. **Select**: Take the 2 most recent eligible PRs (#100, #101)
4. **Execute**: Run in chronological order (#100 first, then #101)

**Log Output**:
```
[INFO] Searching for 2 recent merged PRs with ≥2 files changed (examining last 12 months)
[INFO] Found 7 total merged PRs to examine
[INFO] Found 5 eligible PRs with ≥2 files changed
[INFO] Selected PRs:
[INFO]   PR #100: 2 files changed
[INFO]   PR #101: 5 files changed
[INFO] Successfully selected 2 PRs for execution (oldest-to-newest order)
```

**Key Improvements**:
- **Comprehensive Search**: Examines ALL PRs in the time window, ensuring sufficient eligible candidates
- **Smart Detection**: Detects all merge strategies (merge commits, squash merges, rebase merges) using commit message patterns

## Mode Comparison

| Aspect | LLM_Evaluator | PR_Recreate |
|--------|---------------|-------------|
| **Input** | Generated prompts | Real PR history |
| **Complexity** | Configurable topics | Historical complexity |
| **Isolation** | Per-agent repo copies | Git branches |
| **Reference** | No reference implementation | Human PR implementation |
| **Metrics** | All metrics supported | AST similarity focus |
| **Use Case** | General assessment | Real-world accuracy |
| **Setup** | Simpler | Complex git operations |

## Best Practices

### LLM_Evaluator Mode
1. **Diverse Topics**: Use varied prompt topics for comprehensive evaluation
2. **Repository Relevance**: Choose repos that match your evaluation goals
3. **Prompt Quality**: Review generated prompts for clarity and feasibility
4. **Multiple Runs**: Use `runs_per_prompt > 1` for statistical significance

### PR_Recreate Mode
1. **Repository Selection**: Choose repos with clean, well-documented PRs
2. **PR Quantity**: Start with fewer PRs (3-5) for initial testing
3. **Conflict Handling**: Monitor for cherry-pick conflicts and resolve manually
4. **Branch Cleanup**: Regularly clean up git worktrees to avoid conflicts

### General
1. **Metric Selection**: Choose metrics appropriate for your evaluation goals
2. **Timeout Configuration**: Set realistic timeouts based on task complexity
3. **Resource Management**: Monitor disk space and clean up stage directories
4. **Parallel Execution**: Use parallel mode for faster benchmarks when possible
