# Cursor CLI Adapter

The Cursor CLI adapter enables benchmarking of Cursor's AI assistant through its command-line interface. This adapter integrates Cursor's powerful AI capabilities into the Augbench testing framework.

## Overview

Cursor CLI is a command-line interface for Cursor's AI assistant that allows for:
- Code generation and modification
- File operations
- Shell command execution
- Interactive and non-interactive modes
- MCP (Model Context Protocol) support
- Rules system integration

## Prerequisites

### Installation

1. **Install Cursor**: Download and install Cursor from [cursor.com](https://cursor.com)

2. **Install Cursor CLI**: The CLI tool should be available after installing Cursor. Verify installation:
   ```bash
   cursor-agent --help
   ```

3. **Authentication**: Ensure you're logged into Cursor with a valid subscription that includes CLI access.

### Configuration

The Cursor CLI adapter supports several configuration options:

```json
{
  "assistants": ["Cursor CLI"],
  "adapter_config": {
    "Cursor CLI": {
      "command": "cursor-agent",
      "model": "gpt-4",
      "outputFormat": "text",
      "args": ["--additional-arg"],
      "timeout": 600000
    }
  }
}
```

#### Configuration Options

- **`command`** (string, default: `"cursor-agent"`): The command to execute Cursor CLI
- **`model`** (string, optional): Specific model to use (e.g., "gpt-4", "claude-3-sonnet")
- **`outputFormat`** (string, default: `"text"`): Output format ("text" or "json")
- **`args`** (array, optional): Additional command-line arguments
- **`timeout`** (number, default: 600000): Timeout in milliseconds

## Usage

### Basic Usage

Add Cursor CLI to your `settings.json`:

```json
{
  "mode": "standard",
  "assistants": [
    "Claude Code",
    "Augment CLI",
    "Cursor CLI"
  ],
  "prompts": [
    "prompt1.md",
    "prompt2.md"
  ],
  "runs_per_prompt": 2
}
```

### Advanced Configuration

For more control over Cursor CLI behavior:

```json
{
  "assistants": ["Cursor CLI"],
  "adapter_config": {
    "Cursor CLI": {
      "model": "gpt-4",
      "outputFormat": "json",
      "timeout": 900000,
      "args": ["--verbose"]
    }
  }
}
```

## Features

### Supported Capabilities

- ✅ **Code Generation**: Generate code based on prompts
- ✅ **Code Modification**: Modify existing code files
- ✅ **File Operations**: Create, read, update, and delete files
- ✅ **Shell Commands**: Execute shell commands when needed
- ✅ **Context Awareness**: Understands repository structure and context
- ✅ **Multiple Models**: Support for different AI models
- ✅ **Output Formats**: Text and JSON output formats

### Metrics Compatibility

The Cursor CLI adapter works with all standard Augbench metrics:

- **Response Time**: Measures execution time
- **Output Quality**: LLM-based quality assessment
- **Output Format Success**: Validates output format
- **Instruction Adherence**: Checks if instructions were followed
- **Context Adherence**: Validates use of repository context
- **Steps Per Task**: Counts discrete steps taken
- **AST Similarity**: Code structure comparison (for code generation tasks)

## Command Execution

The adapter executes Cursor CLI using the following pattern:

```bash
cursor-agent -p "prompt content" --output-format text [additional-args]
```

### Arguments

- **`-p`**: Print mode for non-interactive execution
- **`--output-format`**: Specifies output format (text/json)
- **`--model`**: Specifies AI model (if configured)
- Additional arguments from the `args` configuration

## Error Handling

The adapter handles various error conditions:

### Common Errors

1. **Command Not Found**
   ```
   Error: Failed to start Cursor CLI: spawn cursor-agent ENOENT
   ```
   **Solution**: Ensure Cursor CLI is installed and `cursor-agent` is in your PATH

2. **Authentication Error**
   ```
   Error: Cursor CLI exited with code 1: Authentication failed
   ```
   **Solution**: Log into Cursor and ensure you have CLI access

3. **Timeout Error**
   ```
   Error: Cursor CLI execution timed out after 600000ms
   ```
   **Solution**: Increase timeout in configuration or simplify the prompt

4. **Model Not Available**
   ```
   Error: Cursor CLI exited with code 1: Model 'gpt-4' not available
   ```
   **Solution**: Use a different model or check your subscription

### Debugging

Enable debug logging to troubleshoot issues:

```bash
DEBUG=true augbench benchmark --verbose
```

## Performance Considerations

### Optimization Tips

1. **Timeout Settings**: Set appropriate timeouts based on task complexity
2. **Model Selection**: Choose models based on task requirements
3. **Parallel Execution**: Cursor CLI supports parallel execution
4. **Output Format**: Use JSON format for structured data processing

### Benchmarking Best Practices

1. **Consistent Environment**: Ensure Cursor CLI version is consistent across runs
2. **Authentication**: Use service accounts for automated benchmarking
3. **Rate Limiting**: Be aware of API rate limits
4. **Resource Usage**: Monitor system resources during execution

## Troubleshooting

### Installation Issues

1. **Verify Installation**:
   ```bash
   which cursor-agent
   cursor-agent --help
   ```

2. **Check Version**:
   ```bash
   cursor-agent --version  # If available
   ```

3. **Test Basic Functionality**:
   ```bash
   cursor-agent -p "Hello, world!"
   ```

### Configuration Issues

1. **Validate JSON**: Ensure `settings.json` is valid JSON
2. **Check Permissions**: Ensure Cursor CLI has necessary permissions
3. **Test Configuration**: Use `augbench validate` to check configuration

### Runtime Issues

1. **Check Logs**: Review Augbench logs for detailed error information
2. **Simplify Prompts**: Test with simpler prompts first
3. **Verify Context**: Ensure repository context is accessible

## Examples

### Basic Code Generation

```json
{
  "mode": "standard",
  "prompts": ["generate_function.md"],
  "assistants": ["Cursor CLI"],
  "metrics": ["response_time", "output_quality"]
}
```

### Advanced Configuration

```json
{
  "mode": "standard",
  "assistants": ["Cursor CLI"],
  "adapter_config": {
    "Cursor CLI": {
      "model": "claude-3-sonnet",
      "outputFormat": "json",
      "timeout": 1200000,
      "args": ["--context-aware", "--verbose"]
    }
  },
  "metrics": [
    "response_time",
    "output_quality",
    "ast_similarity",
    "instruction_adherence"
  ]
}
```

## Integration with Other Tools

### MCP (Model Context Protocol)

Cursor CLI supports MCP for enhanced context awareness:

```json
{
  "adapter_config": {
    "Cursor CLI": {
      "args": ["--mcp-enabled", "--context-protocol=mcp"]
    }
  }
}
```

### Rules System

Integrate with Cursor's rules system:

```json
{
  "adapter_config": {
    "Cursor CLI": {
      "args": ["--rules-file=.cursor/rules.md"]
    }
  }
}
```

## Limitations

1. **CLI Availability**: Requires Cursor CLI to be installed and accessible
2. **Authentication**: Requires valid Cursor subscription with CLI access
3. **Model Availability**: Limited to models available in your Cursor subscription
4. **Platform Support**: Availability may vary by platform

## Support

For issues specific to the Cursor CLI adapter:

1. **Augbench Issues**: Report to the Augbench repository
2. **Cursor CLI Issues**: Contact Cursor support
3. **Integration Issues**: Check both Augbench and Cursor documentation

## Version Compatibility

- **Augbench**: 1.0.0+
- **Cursor CLI**: Latest version recommended
- **Node.js**: 16.0.0+

---

For more information about Cursor CLI, visit the [official documentation](https://docs.cursor.com/en/cli/overview).
