# Bar Chart Visualization Example

## Overview

Augbench now generates bar charts instead of line charts for better visualization of benchmark results. Each chart displays:

- **X-axis**: Prompt file names (e.g., "prompt1.md", "prompt2.md")
- **Y-axis**: Average metric values for successful runs
- **Bars**: Grouped by agent with specific colors

## Key Features

### 1. Average Calculation
The bar charts show the **average value** for each prompt, calculated by:
- Including only successful runs (no error field)
- Excluding null or undefined values
- Excluding NaN values

### 2. Color Scheme
- **Augment CLI**: Green (#109618)
- **Claude Code**: Orange (#FF9900)
- Other agents: Automatic color assignment from palette

### 3. Example Data

Given the following benchmark results:

```json
{
  "results": [
    {
      "prompt": "prompt1.md",
      "assistant": "Augment CLI",
      "runs": [
        { "run_id": 1, "response_time": 10, "output_quality": 8 },
        { "run_id": 2, "response_time": 12, "output_quality": 9 },
        { "run_id": 3, "response_time": null, "output_quality": 7 },
        { "run_id": 4, "response_time": 11, "error": "Timeout" }
      ]
    },
    {
      "prompt": "prompt1.md",
      "assistant": "Claude Code",
      "runs": [
        { "run_id": 1, "response_time": 15, "output_quality": 7 },
        { "run_id": 2, "response_time": 14, "output_quality": 8 }
      ]
    }
  ]
}
```

The bar chart would show:
- **Augment CLI** for prompt1.md:
  - response_time: (10 + 12) / 2 = 11 seconds (run 3 excluded due to null, run 4 excluded due to error)
  - output_quality: (8 + 9 + 7) / 3 = 8 (run 4 excluded due to error)
- **Claude Code** for prompt1.md:
  - response_time: (15 + 14) / 2 = 14.5 seconds
  - output_quality: (7 + 8) / 2 = 7.5

## Chart Files

Charts are saved as PNG files:
- `<output_filename>_response_time.png`
- `<output_filename>_output_quality.png`
- `<output_filename>_<metric_name>.png`

## Benefits

1. **Clear Comparison**: Easy to compare agent performance across different prompts
2. **Statistical Accuracy**: Averages provide a more stable view than individual run values
3. **Visual Clarity**: Bar charts make it easy to spot performance differences
4. **Robust Handling**: Failed runs and invalid data don't skew the results
