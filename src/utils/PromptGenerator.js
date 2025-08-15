/**
 * Prompt Generator - Generates coding prompts from PR descriptions using LLM
 */

const axios = require('axios');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');

class PromptGenerator {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);

    // LLM configuration - use same environment variables as standard mode
    this.llmEndpoint = process.env.LLM_OPENAI_ENDPOINT;
    this.llmApiKey = process.env.LLM_API_KEY;
    this.llmModel = process.env.LLM_MODEL || 'gpt-3.5-turbo';
    this.llmProvider = (process.env.LLM_PROVIDER || 'openai-compatible').toLowerCase();
    this.anthropicVersion = process.env.LLM_ANTHROPIC_VERSION || '2023-06-01';
    this.timeout = parseInt(process.env.TIMEOUT || '30000');

    // Validate required configuration
    if (!this.llmEndpoint || !this.llmApiKey) {
      throw new Error('LLM configuration missing. Please set LLM_OPENAI_ENDPOINT and LLM_API_KEY environment variables.');
    }
  }

  /**
   * Generate prompts for all PRs
   * @param {Array} prs - Array of PR metadata
   * @param {Object} structure - Directory structure
   * @returns {Promise<Array>} - Array of generated prompt file paths
   */
  async generatePrompts(prs, structure) {
    this.logger.info(`Generating prompts for ${prs.length} PRs...`);
    
    const promptPaths = [];
    
    for (const pr of prs) {
      try {
        const promptContent = await this.generatePromptForPR(pr);
        const promptPath = this.getPromptPath(pr, structure);
        
        await this.fs.writeText(promptPath, promptContent);
        promptPaths.push(promptPath);
        
        this.logger.debug(`Generated prompt for PR ${pr.number}: ${promptPath}`);
      } catch (error) {
        const errorMessage = `Failed to generate prompt for PR ${pr.number}: ${error.message}`;
        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
    
    this.logger.success(`Generated ${promptPaths.length} prompts`);
    return promptPaths;
  }

  /**
   * Generate a coding prompt for a specific PR
   * @param {Object} pr - PR metadata
   * @returns {Promise<string>} - Generated prompt content
   */
  async generatePromptForPR(pr) {
    this.logger.debug(`Generating prompt for PR ${pr.number}: ${pr.title}`);
    
    const systemPrompt = this.createSystemPrompt();
    const userPrompt = this.createUserPrompt(pr);
    
    const response = await this.callLLM(systemPrompt + '\n\n' + userPrompt);
    
    // Clean up the response and format as markdown
    const cleanedPrompt = this.cleanAndFormatPrompt(response, pr);
    
    return cleanedPrompt;
  }

  /**
   * Create system prompt for the LLM
   * @returns {string} - System prompt
   */
  createSystemPrompt() {
    return `You are an expert software engineering instructor creating coding tasks for AI assistants. Your job is to convert Pull Request descriptions into clear, actionable coding prompts that an AI assistant can follow to recreate the changes.

Guidelines for creating prompts:
1. Be specific and clear about what needs to be implemented
2. Include context about the codebase and existing functionality
3. Specify the expected outcome and any constraints
4. Break down complex changes into logical steps
5. Include relevant technical details from the PR description
6. Avoid mentioning that this is from a PR or giving away the solution
7. Focus on the requirements and desired functionality
8. Use imperative language ("Implement...", "Add...", "Fix...")

The prompt should be written as if you're asking the AI to implement a new feature or fix based on requirements, not to recreate an existing PR.`;
  }

  /**
   * Create user prompt with PR information
   * @param {Object} pr - PR metadata
   * @returns {string} - User prompt
   */
  createUserPrompt(pr) {
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

Please create a coding prompt that asks an AI assistant to implement these changes. The prompt should be clear, specific, and actionable without revealing that it's based on an existing PR.`;
  }

  /**
   * Summarize file changes for context
   * @param {Array} fileChanges - Array of file change objects
   * @returns {string} - Summary of file changes
   */
  summarizeFileChanges(fileChanges) {
    if (!fileChanges || fileChanges.length === 0) {
      return 'No specific file changes listed';
    }
    
    const changesByType = {
      added: [],
      modified: [],
      deleted: [],
      renamed: []
    };
    
    fileChanges.forEach(change => {
      if (changesByType[change.status]) {
        changesByType[change.status].push(change.path);
      }
    });
    
    const summary = [];
    
    if (changesByType.added.length > 0) {
      summary.push(`Added: ${changesByType.added.join(', ')}`);
    }
    if (changesByType.modified.length > 0) {
      summary.push(`Modified: ${changesByType.modified.join(', ')}`);
    }
    if (changesByType.deleted.length > 0) {
      summary.push(`Deleted: ${changesByType.deleted.join(', ')}`);
    }
    if (changesByType.renamed.length > 0) {
      summary.push(`Renamed: ${changesByType.renamed.join(', ')}`);
    }
    
    return summary.join('\n');
  }

  /**
   * Clean and format the generated prompt
   * @param {string} response - Raw LLM response
   * @param {Object} pr - PR metadata
   * @returns {string} - Cleaned and formatted prompt
   */
  cleanAndFormatPrompt(response, pr) {
    // Remove any meta-commentary about the task
    let cleaned = response
      .replace(/^[\s\S]*?(?=# |## |### )/m, '') // Remove leading meta text before first heading
      .replace(/\n\s*Note:.*$/gm, '') // Remove notes
      .replace(/\n\s*This prompt.*$/gm, '') // Remove meta-commentary
      .trim();

    // If no heading found, remove everything before the first meaningful content
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
   * Call the LLM to generate content
   * @param {string} prompt - Prompt to send to LLM
   * @returns {Promise<string>} - LLM response
   */
  async callLLM(prompt) {
    try {
      let response;

      if (this.llmProvider === 'anthropic') {
        // Anthropic API format
        response = await axios.post(
          `${this.llmEndpoint}/messages`,
          {
            model: this.llmModel,
            max_tokens: 2000,
            temperature: 0.7,
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: prompt }]
              }
            ]
          },
          {
            headers: {
              'x-api-key': this.llmApiKey,
              'anthropic-version': this.anthropicVersion,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
        );

        if (response.data && response.data.content && response.data.content[0]) {
          return response.data.content[0].text.trim();
        } else {
          throw new Error('Invalid response format from Anthropic API');
        }
      } else {
        // OpenAI-compatible API format
        response = await axios.post(
          `${this.llmEndpoint}/chat/completions`,
          {
            model: this.llmModel,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 2000
          },
          {
            headers: {
              'Authorization': `Bearer ${this.llmApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
        );

        if (response.data && response.data.choices && response.data.choices[0]) {
          return response.data.choices[0].message.content.trim();
        } else {
          throw new Error('Invalid response format from OpenAI-compatible API');
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to LLM endpoint: ${this.llmEndpoint}. Please ensure the LLM service is running.`);
      } else if (error.response) {
        throw new Error(`LLM API error: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`);
      } else {
        throw new Error(`LLM request failed: ${error.message}`);
      }
    }
  }

  /**
   * Get prompt file path for a PR
   * @param {Object} pr - PR metadata
   * @param {Object} structure - Directory structure
   * @returns {string} - Prompt file path
   */
  getPromptPath(pr, structure) {
    return require('path').join(structure.prompts, `pr_${pr.order}_${pr.number}.md`);
  }

  /**
   * Validate LLM configuration
   * @returns {Promise<boolean>} - Whether LLM is accessible
   */
  async validateLLMAccess() {
    try {
      const testPrompt = 'Hello, this is a test. Please respond with "OK".';
      const response = await this.callLLM(testPrompt);
      
      this.logger.debug('LLM validation response:', response);
      return true;
    } catch (error) {
      this.logger.error(`LLM validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get LLM configuration info
   * @returns {Object} - LLM configuration
   */
  getLLMConfig() {
    return {
      endpoint: this.llmEndpoint,
      model: this.llmModel,
      provider: this.llmProvider,
      timeout: this.timeout,
      apiKey: this.llmApiKey ? '***' : undefined // Mask API key
    };
  }
}

module.exports = { PromptGenerator };
