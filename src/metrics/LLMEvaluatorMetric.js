import { BaseMetric } from "./BaseMetric.js";
import axios from "axios";
import { run } from "../utils/Process.js";

export class LLMEvaluatorMetric extends BaseMetric {
  constructor(metricName, evaluationPrompt) {
    super(metricName);
    this.evaluationPrompt = evaluationPrompt;
  }

  async measure(context) {
    const { agentOutput, originalPrompt, cwd } = context;

    // Optimize payload using diff-first policy
    const optimizedOutput = await this.optimizePayload(agentOutput, cwd);
    const evaluationRequest = this.buildEvaluationPrompt(originalPrompt, optimizedOutput);

    try {
      const score = await this.callLLMEvaluator(evaluationRequest);
      return { [this.name]: score };
    } catch (error) {
      return { [this.name]: null, error: error.message };
    }
  }

  async optimizePayload(agentOutput, cwd) {
    // Default token budget (4KB = ~1000 tokens)
    const DEFAULT_MAX_KB = 4;

    // Try diff first if we have a git working directory
    if (cwd) {
      try {
        const diff = await this.generateUnifiedDiff(cwd);
        if (diff && diff.length > 0 && diff.length < agentOutput.length * 0.7) {
          return `Agent Changes (unified diff):\n${diff}`;
        }
      } catch (error) {
        // Diff generation failed, fall back to truncation
      }
    }

    // Fallback to truncated output
    return this.truncateOutput(agentOutput, DEFAULT_MAX_KB * 1024);
  }

  async generateUnifiedDiff(cwd) {
    const result = await run("git diff --unified=3", { cwd });
    if (result.ok && result.stdout.trim()) {
      return result.stdout.trim();
    }
    return null;
  }

  truncateOutput(text, maxBytes) {
    if (!text || text.length <= maxBytes) return text;
    const truncated = text.slice(-maxBytes);
    return `...[truncated to last ${maxBytes} bytes]\n${truncated}`;
  }

  buildEvaluationPrompt(originalPrompt, agentOutput) {
    return `${this.evaluationPrompt}

Original Prompt:
${originalPrompt}

Agent Output:
${agentOutput}

Please provide a score from 1-10 and brief justification.`;
  }

  async callLLMEvaluator(prompt) {
    const provider = process.env.LLM_PROVIDER;
    const apiKey = process.env.LLM_API_KEY;
    
    if (!provider || !apiKey) {
      throw new Error("LLM_PROVIDER and LLM_API_KEY environment variables required");
    }

    if (provider === "openai") {
      return this.callOpenAI(prompt, apiKey);
    } else if (provider === "anthropic") {
      return this.callAnthropic(prompt, apiKey);
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  async callOpenAI(prompt, apiKey) {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.1
    }, {
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
    });

    const content = response.data.choices[0]?.message?.content || "";
    return this.parseScore(content);
  }

  async callAnthropic(prompt, apiKey) {
    const model = process.env.LLM_MODEL || "claude-3-5-sonnet-20241022";
    const version = process.env.LLM_ANTHROPIC_VERSION || "2023-06-01";

    const response = await axios.post("https://api.anthropic.com/v1/messages", {
      model: model,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    }, {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": version
      }
    });

    const content = response.data.content[0]?.text || "";
    return this.parseScore(content);
  }

  parseScore(content) {
    // Extract score from response (look for patterns like "Score: 8" or "8/10")
    const scoreMatch = content.match(/(?:score|rating):\s*(\d+(?:\.\d+)?)/i) || 
                     content.match(/(\d+(?:\.\d+)?)\/10/) ||
                     content.match(/^(\d+(?:\.\d+)?)/);
    
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1]);
      return Math.min(Math.max(score, 1), 10); // Clamp to 1-10
    }
    
    return null; // Could not parse score
  }
}
