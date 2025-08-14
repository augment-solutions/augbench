# Sequential vs Parallel Execution Example

## Sequential Execution (Default)

With `parallel_runs: 1` or omitted:

```json
{
  "runs_per_prompt": 10,
  "parallel_runs": 1
}
```

Execution timeline:
```
Assistant 1, Prompt 1, Run 1 ------>
Assistant 1, Prompt 1, Run 2         ------>
Assistant 1, Prompt 1, Run 3                 ------>
...
Assistant 1, Prompt 1, Run 10                                                ------>
```

Total time: Sum of all individual run times

## Parallel Execution

With `parallel_runs: 4`:

```json
{
  "runs_per_prompt": 10,
  "parallel_runs": 4
}
```

Execution timeline:
```
Assistant 1, Prompt 1, Run 1 ------>
Assistant 1, Prompt 1, Run 2 ------>
Assistant 1, Prompt 1, Run 3 ------>
Assistant 1, Prompt 1, Run 4 ------>
Assistant 1, Prompt 1, Run 5         ------>
Assistant 1, Prompt 1, Run 6         ------>
Assistant 1, Prompt 1, Run 7         ------>
Assistant 1, Prompt 1, Run 8         ------>
Assistant 1, Prompt 1, Run 9                 ------>
Assistant 1, Prompt 1, Run 10                ------>
```

Total time: Approximately (total runs / parallel_runs) × average run time

## Performance Comparison

For a benchmark with:
- 2 prompts
- 2 assistants
- 10 runs per prompt
- Average run time: 30 seconds

### Sequential (parallel_runs: 1)
- Total runs: 2 × 2 × 10 = 40 runs
- Estimated time: 40 × 30s = 1200s (20 minutes)

### Parallel (parallel_runs: 4)
- Total runs: 40 runs
- Concurrent execution: 4 at a time
- Estimated time: (40 / 4) × 30s = 300s (5 minutes)

**4x speedup!**

## Resource Considerations

The system automatically adjusts parallelism based on:
- Available CPU cores
- Available memory
- System load

If you set `parallel_runs: 8` but your system can only handle 4 concurrent runs safely, it will automatically limit to 4.
