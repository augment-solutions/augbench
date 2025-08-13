/**
 * Abstract class for metrics that require LLM evaluation
 * (e.g., output quality, code correctness, etc.)
 */

const axios = require('axios');
const { BaseMetric } = require('./BaseMetric');
const { Logger } = require('../utils/Logger');

class AssessableMetric extends BaseMetric {
  constructor(name, options = {}) {
    // Call BaseMetric constructor first to initialize `this`
    super(name, options);

    // Enforce abstract class behavior without touching `this` before super
    if (new.target === AssessableMetric) {
      throw new Error('AssessableMetric is an abstract class and cannot be instantiated directly');
    }

    this.logger = new Logger(options);
    this.endpoint = process.env.LLM_OPENAI_ENDPOINT;
    this.apiKey = process.env.LLM_API_KEY;
    this.provider = (options.provider || process.env.LLM_PROVIDER || 'openai-compatible').toLowerCase();
    this.anthropicVersion = options.anthropicVersion || process.env.LLM_ANTHROPIC_VERSION || '2023-06-01';
    this.model = options.model || process.env.LLM_MODEL; // no hardcoded default; rely on env/options
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;

    // Metrics config and truncation/logging controls
    this.metricsConfig = options.metrics_config || {};
    this.evalLogMaxKB = this.metricsConfig.eval_log_max_kb ?? options.evalLogMaxKB ?? 2; // default 2KB
    this.evalLogTruncate = this.metricsConfig.eval_log_truncate ?? options.evalLogTruncate ?? 'tail'; // 'head' | 'tail'
    this.evalInputMaxKB = this.metricsConfig.eval_input_kb ?? options.evalInputMaxKB ?? null; // null => no truncation
    this.evalInputTruncate = this.metricsConfig.eval_input_truncate ?? options.evalInputTruncate ?? 'tail';
  }

  /**
   * Abstract method to create the assessment prompt
   * Must be implemented by subclasses
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context for assessment
   * @returns {string} - The prompt for LLM assessment
   */
  createAssessmentPrompt(output, context = {}) {
    throw new Error('createAssessmentPrompt() method must be implemented by subclasses');
  }

  /**
   * Abstract method to parse the LLM response
   * Must be implemented by subclasses
   * 
   * @param {string} response - The response from the LLM
   * @returns {number|string} - The parsed assessment value
   */
  parseAssessmentResponse(response) {
    throw new Error('parseAssessmentResponse() method must be implemented by subclasses');
  }

  /**
   * Measure the metric using LLM assessment
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context for assessment
   * @returns {Promise<number|string>} - The assessed value
   */
  async measure(output, context = {}) {
    if (!this.endpoint || !this.apiKey) {
      throw new Error('LLM endpoint and API key are required for assessable metrics');
    }

    // Optionally truncate the output before building the prompt
    let effectiveOutput = output;
    if (this.evalInputMaxKB != null) {
      const lim = Math.max(1, Number(this.evalInputMaxKB)) * 1024;
      effectiveOutput = this.evalInputTruncate === 'head' ? String(output).slice(0, lim) : String(output).slice(-lim);
      this.logger.debug(`[metric:${this.name}] Truncated eval input to ${lim} bytes (${this.evalInputTruncate})`);
    }

    const prompt = this.createAssessmentPrompt(effectiveOutput, context);

    const logLimit = Math.max(1, Number(this.evalLogMaxKB || 2)) * 1024;
    const slicer = (s) => this.evalLogTruncate === 'head' ? String(s).slice(0, logLimit) : String(s).slice(-logLimit);
    const logWhere = this.evalLogTruncate === 'head' ? 'first' : 'last';

    this.logger.debug(`[metric:${this.name}] LLM input prompt (${logWhere} ${logLimit}B):\n` + slicer(prompt));

    const response = await this.callLLM(prompt);
    this.logger.debug(`[metric:${this.name}] LLM raw response (${logWhere} ${logLimit}B):\n` + slicer(response));

    const assessedValue = this.parseAssessmentResponse(response);
    this.logger.debug(`[metric:${this.name}] Parsed assessment value: ${assessedValue}`);

    if (!this.validateValue(assessedValue)) {
      throw new Error(`Invalid assessment value: ${assessedValue}`);
    }

    return assessedValue;
  }

  /**
   * Call the LLM API for assessment
   * 
   * @param {string} prompt - The assessment prompt
   * @returns {Promise<string>} - The LLM response
   */
  async callLLM(prompt) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`LLM assessment attempt ${attempt}/${this.maxRetries}`);
        
        let response;
        if (this.provider === 'anthropic') {
          // Anthropic Messages API
          response = await axios.post(
            `${this.endpoint}/messages`,
            {
              model: this.model,
              max_tokens: 500,
              temperature: 0.1,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt }
                  ]
                }
              ]
            },
            {
              headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': this.anthropicVersion,
                'Content-Type': 'application/json'
              },
              timeout: this.timeout
            }
          );

          const contentBlocks = response.data?.content;
          if (Array.isArray(contentBlocks) && contentBlocks.length > 0) {
            const firstText = contentBlocks.find(b => b?.type === 'text');
            if (firstText?.text) {
              return firstText.text.trim();
            }
          }
          throw new Error('Invalid response format from Anthropic API');
        } else {
          // OpenAI-compatible Chat Completions API
          response = await axios.post(
            `${this.endpoint}/chat/completions`,
            {
              model: this.model,
              messages: [
                {
                  role: 'user',
                  content: prompt
                }
              ],
              max_tokens: 500,
              temperature: 0.1
            },
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: this.timeout
            }
          );

          if (response.data?.choices?.[0]?.message?.content) {
            return response.data.choices[0].message.content.trim();
          }
          throw new Error('Invalid response format from OpenAI-compatible API');
        }
        
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;
        let body = '';
        try {
          const data = error?.response?.data;
          if (typeof data === 'string') body = data;
          else if (data) body = JSON.stringify(data);
        } catch (_) {}
        const snippet = body ? ` - ${String(body).slice(0, 500)}` : '';
        const statusText = status ? ` (status ${status})` : '';
        this.logger.warn(`LLM assessment attempt ${attempt} failed: ${error.message}${statusText}${snippet}`);

        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`LLM assessment failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Create a standardized assessment prompt template
   * 
   * @param {string} task - The assessment task description
   * @param {string} output - The output to assess
   * @param {string} criteria - The assessment criteria
   * @param {string} scale - The assessment scale description
   * @returns {string} - The formatted prompt
   */
  createStandardPrompt(task, output, criteria, scale) {
    return `You are an expert evaluator tasked with assessing AI assistant output.

TASK: ${task}

OUTPUT TO ASSESS:
\`\`\`
${output}
\`\`\`

ASSESSMENT CRITERIA:
${criteria}

SCALE:
${scale}

Please provide your assessment as a single number followed by a brief explanation.
Format your response as: "Score: X - Explanation"`;
  }

  /**
   * Parse a standard assessment response format
   * 
   * @param {string} response - The LLM response
   * @returns {number} - The extracted numeric score
   */
  parseStandardResponse(response) {
    // Look for "Score: X" pattern
    const scoreMatch = response.match(/Score:\s*(\d+(?:\.\d+)?)/i);
    if (scoreMatch) {
      return parseFloat(scoreMatch[1]);
    }
    
    // Look for just a number at the beginning
    const numberMatch = response.match(/^(\d+(?:\.\d+)?)/);
    if (numberMatch) {
      return parseFloat(numberMatch[1]);
    }
    
    throw new Error(`Could not parse assessment score from response: ${response}`);
  }

  /**
   * Initialize the assessable metric
   */
  async initialize() {
    await super.initialize();
    
    // Validate LLM configuration
    if (!this.endpoint || !this.apiKey) {
      throw new Error('LLM endpoint and API key must be configured for assessable metrics');
    }
    
    this.logger.debug(`Initialized assessable metric: ${this.name}`);
  }
}

module.exports = { AssessableMetric };
