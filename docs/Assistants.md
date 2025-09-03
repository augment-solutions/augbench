# AI Assistant Configuration

This guide covers how to configure and integrate different AI coding assistants with augbench.

## Supported Assistants

### Augment CLI
**Command**: `auggie`  
**Installation**: `npm install -g @augment/cli`

#### Configuration
```json
{
  "agent_config": {
    "Augment CLI": {
      "commandTemplate": "auggie -p --compact -if \"{prompt}\"",
      "timeout": 1200000
    }
  }
}
```

#### Command Options
- `-p, --print`: Print output to stdout
- `--compact`: Compact output format
- `-if, --input-file`: Read prompt from file
- `--timeout`: Execution timeout

#### Best Practices
- Use `-if` for file-based prompts (required for augbench)
- Set appropriate timeout for complex tasks
- Use `--compact` to reduce output verbosity

### Claude Code (Anthropic)
**Command**: `claude`  
**Installation**: Follow Anthropic's installation guide

#### Configuration
```json
{
  "agent_config": {
    "Claude Code": {
      "commandTemplate": "cat \"{prompt}\" | claude -p",
      "timeout": 1200000
    }
  }
}
```

#### Command Options
- `-p, --print`: Print response to stdout
- `--model`: Specify Claude model version
- `--max-tokens`: Maximum response tokens

#### Authentication
```bash
export ANTHROPIC_API_KEY=your_api_key
```

### Cursor CLI
**Command**: `cursor-agent`  
**Installation**: Install Cursor IDE and enable CLI

#### Configuration
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

#### Setup Requirements
1. Install Cursor IDE
2. Enable CLI access in settings
3. Ensure `cursor-agent` is in PATH

## Adding Custom Assistants

### Command Template Format
The `commandTemplate` supports placeholder substitution:

- `{prompt}`: Path to prompt file
- `{cwd}`: Current working directory
- `{runs_dir}`: Directory for execution logs

#### Example Templates
```json
{
  "Custom Assistant": {
    "commandTemplate": "my-ai-tool --input \"{prompt}\" --output-dir \"{runs_dir}\"",
    "timeout": 600000
  }
}
```

### Requirements for Custom Assistants

#### 1. Command Line Interface
- Must accept input via file or stdin
- Must output results to stdout
- Must exit with code 0 on success

#### 2. Input Format
- Should accept markdown-formatted prompts
- Should handle file paths with spaces
- Should support timeout interruption

#### 3. Output Format
- Plain text output to stdout
- Error messages to stderr
- Structured output preferred but not required

### Integration Steps

#### 1. Test Command Manually
```bash
echo "Write a hello world function" | your-assistant-cli
```

#### 2. Add to Configuration
```json
{
  "agents": ["Your Assistant"],
  "agent_config": {
    "Your Assistant": {
      "commandTemplate": "your-assistant-cli --prompt \"{prompt}\"",
      "timeout": 300000
    }
  }
}
```

#### 3. Validate Integration
```bash
node bin/augbench.js validate
```

## Configuration Options

### Timeout Settings
```json
{
  "agent_config": {
    "Slow Assistant": {
      "timeout": 1800000  // 30 minutes
    },
    "Fast Assistant": {
      "timeout": 300000   // 5 minutes
    }
  }
}
```

### Model-Specific Configuration
```json
{
  "agent_config": {
    "Claude Sonnet": {
      "commandTemplate": "claude --model claude-3-sonnet-20240229 < \"{prompt}\"",
      "timeout": 600000
    },
    "Claude Haiku": {
      "commandTemplate": "claude --model claude-3-haiku-20240307 < \"{prompt}\"",
      "timeout": 300000
    }
  }
}
```

### Environment Variables
```json
{
  "agent_config": {
    "API Assistant": {
      "commandTemplate": "API_KEY=$MY_API_KEY api-assistant \"{prompt}\"",
      "timeout": 600000,
      "env": {
        "MY_API_KEY": "your_key_here"
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

#### "Command not found"
```bash
# Check if command is in PATH
which auggie
which claude
which cursor-agent

# Add to PATH if needed
export PATH=$PATH:/path/to/assistant/bin
```

#### "Permission denied"
```bash
# Make command executable
chmod +x /path/to/assistant/bin/command

# Check file permissions
ls -la $(which assistant-command)
```

#### "Authentication failed"
```bash
# Check API keys
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Re-authenticate
claude auth login
gh auth login
```

#### "Timeout errors"
```json
{
  "agent_config": {
    "Slow Assistant": {
      "timeout": 3600000  // Increase timeout to 1 hour
    }
  }
}
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=augbench:* node bin/augbench.js benchmark

# Test specific agent
node bin/augbench.js test-agent "Augment CLI"
```

### Manual Testing
```bash
# Test command template manually
auggie -p --compact -if "test-prompt.md"

# Test with actual prompt
cat prompts/prompt1.md | claude -p
```

## Performance Optimization

### Parallel Execution
```json
{
  "parallel_agents": true,  // Run agents in parallel
  "runs_per_prompt": 1      // Reduce runs for faster execution
}
```

### Timeout Tuning
- **Simple tasks**: 300-600 seconds
- **Complex tasks**: 1200-1800 seconds
- **Very complex tasks**: 3600+ seconds

### Resource Management
```json
{
  "agent_config": {
    "Memory Intensive": {
      "commandTemplate": "memory-limit 4G assistant-cli \"{prompt}\"",
      "timeout": 1800000
    }
  }
}
```

## Best Practices

### Configuration Management
1. **Version Control**: Store configurations in version control
2. **Environment Separation**: Use different configs for dev/prod
3. **Secret Management**: Use environment variables for API keys
4. **Documentation**: Document custom assistant requirements

### Testing Strategy
1. **Incremental Testing**: Test one assistant at a time
2. **Baseline Establishment**: Run simple prompts first
3. **Performance Monitoring**: Monitor execution times
4. **Error Handling**: Test failure scenarios

### Security Considerations
1. **API Key Protection**: Never commit API keys to version control
2. **Command Injection**: Validate command templates
3. **File System Access**: Limit assistant file system access
4. **Network Access**: Monitor network usage for cloud assistants

## Example Configurations

### Development Setup
```json
{
  "agents": ["Augment CLI"],
  "agent_config": {
    "Augment CLI": {
      "commandTemplate": "auggie -p --compact -if \"{prompt}\"",
      "timeout": 600000
    }
  },
  "runs_per_prompt": 1,
  "parallel_agents": false
}
```

### Production Benchmark
```json
{
  "agents": ["Augment CLI", "Claude Code", "GitHub Copilot"],
  "agent_config": {
    "Augment CLI": {
      "commandTemplate": "auggie -p --compact -if \"{prompt}\"",
      "timeout": 1200000
    },
    "Claude Code": {
      "commandTemplate": "cat \"{prompt}\" | claude -p",
      "timeout": 1200000
    },
    "GitHub Copilot": {
      "commandTemplate": "cat \"{prompt}\" | gh copilot suggest",
      "timeout": 900000
    }
  },
  "runs_per_prompt": 3,
  "parallel_agents": true
}
```

### Research Evaluation
```json
{
  "agents": ["Assistant A", "Assistant B", "Assistant C"],
  "runs_per_prompt": 5,
  "parallel_agents": true,
  "metrics": [
    "response_time",
    "completeness",
    "technical_correctness",
    "clarity"
  ]
}
```
