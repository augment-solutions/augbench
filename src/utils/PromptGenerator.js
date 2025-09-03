import fs from "fs-extra";
import path from "path";
import axios from "axios";

export class PromptGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  async summarizeRepository(repoPath) {
    this.logger.info(`Generating repository summary for: ${repoPath}`);

    try {
      const summary = await this.scanRepository(repoPath);
      const truncated = this.truncateToWordLimit(summary, 100);
      this.logger.info(`Generated ${truncated.split(' ').length} word repository summary`);
      return truncated;
    } catch (error) {
      this.logger.warn(`Failed to scan repository: ${error.message}`);
      return `Repository at ${repoPath} - unable to generate detailed summary.`;
    }
  }

  async generatePrompt(summary, topic) {
    this.logger.info(`Generating prompt for topic: ${topic}`);

    try {
      const prompt = await this.callEvaluatorLLM(summary, topic);
      this.logger.info(`Generated prompt (${prompt.length} chars)`);
      return prompt;
    } catch (error) {
      this.logger.warn(`Failed to generate prompt via LLM: ${error.message}`);
      // Fallback to simple template
      return this.createFallbackPrompt(summary, topic);
    }
  }

  async scanRepository(repoPath) {
    const summary = [];

    // Read package.json for project info
    try {
      const packagePath = path.join(repoPath, "package.json");
      if (await fs.pathExists(packagePath)) {
        const pkg = await fs.readJson(packagePath);
        summary.push(`${pkg.name || 'Project'}: ${pkg.description || 'No description'}`);
        if (pkg.main) summary.push(`Entry point: ${pkg.main}`);
        if (pkg.scripts) {
          const scripts = Object.keys(pkg.scripts).slice(0, 3).join(", ");
          summary.push(`Scripts: ${scripts}`);
        }
      }
    } catch (error) {
      this.logger.debug(`Could not read package.json: ${error.message}`);
    }

    // Read README for project overview
    try {
      const readmePaths = ["README.md", "README.txt", "readme.md"];
      for (const readme of readmePaths) {
        const readmePath = path.join(repoPath, readme);
        if (await fs.pathExists(readmePath)) {
          const content = await fs.readFile(readmePath, "utf8");
          const firstParagraph = content.split('\n\n')[0].replace(/#+\s*/g, '').trim();
          if (firstParagraph.length > 20) {
            summary.push(`Overview: ${firstParagraph.substring(0, 200)}`);
            break;
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Could not read README: ${error.message}`);
    }

    // Scan directory structure
    try {
      const structure = await this.getDirectoryStructure(repoPath);
      summary.push(`Structure: ${structure}`);
    } catch (error) {
      this.logger.debug(`Could not scan structure: ${error.message}`);
    }

    return summary.join('. ') || `Repository at ${repoPath}`;
  }

  async getDirectoryStructure(repoPath, maxDepth = 2) {
    const structure = [];

    const scan = async (dir, depth = 0) => {
      if (depth >= maxDepth) return;

      try {
        const items = await fs.readdir(dir);
        for (const item of items.slice(0, 10)) { // Limit items per directory
          if (item.startsWith('.')) continue; // Skip hidden files

          const itemPath = path.join(dir, item);
          const stat = await fs.stat(itemPath);

          if (stat.isDirectory()) {
            structure.push(item + '/');
            await scan(itemPath, depth + 1);
          } else if (depth === 0) {
            // Only include top-level files
            structure.push(item);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await scan(repoPath);
    return structure.slice(0, 20).join(', '); // Limit total items
  }

  truncateToWordLimit(text, wordLimit) {
    const words = text.split(/\s+/);
    if (words.length <= wordLimit) return text;

    return words.slice(0, wordLimit).join(' ') + '...';
  }

  async callEvaluatorLLM(systemPrompt, userPrompt) {
    const provider = process.env.LLM_PROVIDER;
    const apiKey = process.env.LLM_API_KEY;

    if (!provider || !apiKey) {
      throw new Error("LLM_PROVIDER and LLM_API_KEY environment variables required for prompt generation");
    }

    // Handle legacy calls with (summary, topic) parameters
    if (arguments.length === 2 && typeof systemPrompt === 'string' && typeof userPrompt === 'string' && !systemPrompt.includes('Guidelines:')) {
      const summary = systemPrompt;
      const topic = userPrompt;

      const legacySystemPrompt = `You are a helpful assistant that creates clear coding prompts for AI development tools.
Generate a well-structured markdown prompt that asks an AI coding assistant to perform the requested task.

Guidelines:
- Use clear markdown formatting
- Keep prompts focused and concise but not too specific
- Don't exceed 300 words`;

      const legacyUserPrompt = `Create a coding prompt for the following task: "${topic}"

Project context: ${summary}

Generate a markdown prompt that would help an AI coding assistant understand what to implement.`;

      return this.callLLMProvider(legacySystemPrompt, legacyUserPrompt, provider, apiKey);
    }

    // Handle new calls with explicit system and user prompts
    return this.callLLMProvider(systemPrompt, userPrompt, provider, apiKey);
  }

  async callLLMProvider(systemPrompt, userPrompt, provider, apiKey) {
    if (provider === "openai") {
      return this.callOpenAI(systemPrompt, userPrompt, apiKey);
    } else if (provider === "anthropic") {
      return this.callAnthropic(systemPrompt, userPrompt, apiKey);
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  async callOpenAI(systemPrompt, userPrompt, apiKey) {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: process.env.LLM_MODEL || "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
    });

    return response.data.choices[0]?.message?.content || "";
  }

  async callAnthropic(systemPrompt, userPrompt, apiKey) {
    const model = process.env.LLM_MODEL || "claude-3-5-sonnet-20241022";
    const version = process.env.LLM_ANTHROPIC_VERSION || "2023-06-01";

    const response = await axios.post("https://api.anthropic.com/v1/messages", {
      model: model,
      max_tokens: 500,
      messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }]
    }, {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": version
      }
    });

    return response.data.content[0]?.text || "";
  }

  createFallbackPrompt(summary, topic) {
    return `# ${topic}

## Project Context
${summary}

## Task
${topic}

## Requirements
Please implement the requested functionality following best practices and maintaining consistency with the existing codebase.`;
  }

  /**
   * Generate a coding prompt for a specific PR using LLM
   * @param {Object} pr - PR metadata
   * @returns {Promise<string>} - Generated prompt content
   */
  async generatePromptForPR(pr) {
    this.logger.info(`Generating LLM-based prompt for PR ${pr.number}: ${pr.title}`);

    try {
      const systemPrompt = this.createSystemPromptForPR();
      const userPrompt = this.createUserPromptForPR(pr);

      const response = await this.callEvaluatorLLM(systemPrompt, userPrompt);
      const cleanedPrompt = this.cleanAndFormatPRPrompt(response, pr);

      this.logger.info(`Generated PR prompt (${cleanedPrompt.length} chars)`);
      return cleanedPrompt;
    } catch (error) {
      this.logger.warn(`Failed to generate PR prompt via LLM: ${error.message}`);
      // Fallback to simple template
      return this.createFallbackPRPrompt(pr);
    }
  }

  /**
   * Create system prompt for PR-based prompt generation
   * @returns {string} - System prompt
   */
  createSystemPromptForPR() {
    return `You are a helpful assistant that creates clear, specific coding prompts for AI development tools based on Pull Request information.

Your task is to convert PR metadata into actionable coding prompts that help AI assistants understand what to implement.

Guidelines:
- Focus on the requirements and goals, not the specific implementation details
- Use clear markdown formatting with proper headings
- Include context about what needs to be built or fixed
- Be specific about expected functionality and behavior
- Don't reveal the exact code changes or file modifications
- Keep prompts focused and actionable (200-400 words)
- Write as if asking the AI to implement a new feature or fix based on requirements

The prompt should be written as if you're asking the AI to implement a new feature or fix based on requirements, not to recreate an existing PR.`;
  }

  /**
   * Create user prompt with PR information for LLM processing
   * @param {Object} pr - PR metadata
   * @returns {string} - User prompt
   */
  createUserPromptForPR(pr) {
    const fileChangesSummary = this.summarizeFileChanges(pr.fileChanges);

    return `Convert the following Pull Request information into a clear coding prompt:

**PR Title:** ${pr.title}

**PR Description:**
${pr.description}

**Files Modified:**
${fileChangesSummary}

**Additional Context:**
- This is part of an ongoing development effort
- The codebase already has existing functionality that should be preserved
- Focus on the specific changes and improvements described

Generate a markdown prompt that would help an AI coding assistant understand exactly what to implement.`;
  }

  /**
   * Summarize file changes for prompt context
   * @param {Array} fileChanges - Array of file change objects
   * @returns {string} - Formatted file changes summary
   */
  summarizeFileChanges(fileChanges) {
    if (!fileChanges || fileChanges.length === 0) {
      return "No specific files mentioned";
    }

    return fileChanges
      .slice(0, 10) // Limit to first 10 files
      .map(change => `- ${change.path} (${change.status})`)
      .join('\n');
  }

  /**
   * Clean and format the LLM response for PR prompts
   * @param {string} response - Raw LLM response
   * @param {Object} pr - PR metadata
   * @returns {string} - Cleaned and formatted prompt
   */
  cleanAndFormatPRPrompt(response, pr) {
    let cleaned = response.trim();

    // Remove any meta commentary or instructions
    cleaned = cleaned.replace(/^(Here's|This is|I'll create).*?\n\n/i, '');

    // Ensure it starts with a heading
    if (!cleaned.match(/^#/)) {
      // Remove leading meta commentary and whitespace
      cleaned = response
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed &&
                 !trimmed.startsWith('This is') &&
                 !trimmed.startsWith('Note:') &&
                 !trimmed.includes('meta commentary');
        })
        .join('\n')
        .trim();

      // Add title if still no heading
      if (!cleaned.match(/^#/)) {
        cleaned = `# ${pr.title}\n\n${cleaned}`;
      }
    }

    // Add metadata header
    const header = `---
pr_number: ${pr.number}
pr_order: ${pr.order}
generated_at: ${new Date().toISOString()}
---

`;

    return header + cleaned;
  }

  /**
   * Create fallback prompt when LLM generation fails
   * @param {Object} pr - PR metadata
   * @returns {string} - Fallback prompt
   */
  createFallbackPRPrompt(pr) {
    const requirements = this.extractRequirementsFromPR(pr);
    const fileChangesSummary = this.summarizeFileChanges(pr.fileChanges);

    return `---
pr_number: ${pr.number}
pr_order: ${pr.order}
generated_at: ${new Date().toISOString()}
---

# ${pr.title}

## Description
${pr.description}

## Context
This is part of an ongoing development effort. The codebase already has existing functionality that should be preserved.

## Requirements
${requirements}

## Files to Consider
${fileChangesSummary}

Please implement the requested changes following best practices and maintaining consistency with the existing codebase.`;
  }

  /**
   * Extract actionable requirements from PR description
   * @param {Object} pr - PR metadata
   * @returns {string} - Extracted requirements
   */
  extractRequirementsFromPR(pr) {
    if (!pr.description) {
      return "Implement the changes described in the title.";
    }

    // Extract actionable requirements from PR description
    const lines = pr.description.split('\n');
    const requirements = lines
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && (
          trimmed.startsWith('-') ||
          trimmed.startsWith('*') ||
          trimmed.includes('should') ||
          trimmed.includes('must') ||
          trimmed.includes('need to') ||
          trimmed.includes('implement') ||
          trimmed.includes('add') ||
          trimmed.includes('fix')
        );
      })
      .slice(0, 5) // Limit to first 5 requirements
      .join('\n');

    return requirements || "Implement the changes described in the title and description.";
  }
}