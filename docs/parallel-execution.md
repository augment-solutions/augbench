# Parallel Execution in Augbench

## Overview

Augbench supports two types of parallel execution to significantly speed up benchmarking:

1. **Parallel Agent Execution**: Multiple agents can be run simultaneously for the same prompt
2. **Parallel Run Execution**: Multiple runs of the same agent-prompt combination can execute concurrently

These features can be used independently or together for maximum performance.

## Configuration

Add the parallel execution parameters to your `settings.json`:

```json
{
  "num_prompts": 3,
  "prompts": ["prompt1.md", "prompt2.md", "prompt3.md"],
  "assistants": ["Claude Code", "Augment CLI"],
  "runs_per_prompt": 10,
  "parallel_runs": 4,
  "parallel_agents": true,
  "output_filename": "bench_results"
}
```

### Parameters

- **`parallel_agents`** (boolean, default: true): Whether to run multiple agents in parallel
  - Set to `true` to run all agents simultaneously for each prompt
  - Set to `false` to run agents sequentially (one at a time)

- **`parallel_runs`** (integer, default: 1): Maximum number of concurrent runs per agent
  - Set to 1 for sequential execution (default behavior)
  - Set higher to enable parallel execution of multiple runs
  - The actual concurrency will be limited by system resources

## How It Works

1. **Sequential Mode** (`parallel_runs: 1`): Runs execute one at a time, maintaining the original behavior
2. **Parallel Mode** (`parallel_runs > 1`): Multiple runs execute concurrently up to the specified limit

### Resource Management

The parallel execution system includes automatic resource management:

- **CPU Limiting**: Leaves at least 1 CPU core free for system operations
- **Memory Limiting**: Monitors available memory to prevent system overload
- **Dynamic Adjustment**: Automatically reduces concurrency if system resources are constrained

### Example Scenarios

#### Fast Benchmarking (High Parallelism)
```json
{
  "runs_per_prompt": 20,
  "parallel_runs": 8
}
```
- Executes up to 8 runs simultaneously
- Significantly reduces total benchmark time
- Best for systems with ample resources

#### Balanced Approach
```json
{
  "runs_per_prompt": 10,
  "parallel_runs": 4
}
```
- Moderate parallelism for good performance
- Suitable for most development machines

#### Conservative/Sequential
```json
{
  "runs_per_prompt": 5,
  "parallel_runs": 1
}
```
- Traditional sequential execution
- Most stable, lowest resource usage

## Best Practices

1. **Start Conservative**: Begin with `parallel_runs: 2` and increase gradually
2. **Monitor Resources**: Watch system memory and CPU usage during benchmarks
3. **Consider Agent Requirements**: Some agents may require more resources than others
4. **Adjust for Workload**: Heavy prompts may benefit from lower parallelism

## Troubleshooting

### High Resource Usage
- Reduce `parallel_runs` value
- The system will automatically limit concurrency based on available resources

### Inconsistent Results
- Some agents may not handle concurrent execution well
- Try reducing `parallel_runs` or set to 1 for sequential execution

### Performance Not Improving
- Check if the agent itself is the bottleneck (e.g., API rate limits)
- Monitor actual concurrency in logs to ensure parallel execution is active

## Technical Details

The parallel execution system uses:
- **ParallelExecutor**: Manages concurrent task execution with queuing
- **ResourceManager**: Monitors and limits resource usage
- **Event-driven Progress**: Real-time updates on execution status

The system ensures:
- Proper error handling for failed runs
- Resource cleanup after execution
- Graceful degradation under resource constraints
