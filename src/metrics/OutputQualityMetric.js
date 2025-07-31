/**
 * Output Quality Metric - Assesses the quality of AI assistant output using LLM evaluation
 */

const { AssessableMetric } = require('./AssessableMetric');
const { FileSystem } = require('../utils/FileSystem');

class OutputQualityMetric extends AssessableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Assesses the quality of AI assistant output on a scale of 1-10',
      unit: 'score',
      model: options.model || 'gpt-3.5-turbo',
      ...options
    });
    
    this.fs = new FileSystem(options);
    this.minScore = 1;
    this.maxScore = 10;
  }

  /**
   * Create assessment prompt for output quality
   * 
   * @param {string} output - The output from the AI assistant
   * @param {Object} context - Additional context for assessment
   * @returns {string} - The assessment prompt
   */
  createAssessmentPrompt(output, context = {}) {
    const promptContent = context.prompt ? this.getPromptContent(context.prompt) : 'Not provided';
    
    const task = 'Assess the quality of an AI coding assistant\'s response';
    
    const criteria = `
1. Correctness: Is the response technically accurate and correct?
2. Completeness: Does the response fully address the prompt requirements?
3. Clarity: Is the response clear, well-structured, and easy to understand?
4. Code Quality: If code is provided, is it well-written, efficient, and follows best practices?
5. Relevance: Is the response relevant to the specific context and requirements?
6. Helpfulness: Would this response be helpful to a developer working on the task?`;

    const scale = `
Rate on a scale of 1-10 where:
- 1-2: Poor quality (incorrect, incomplete, or unhelpful)
- 3-4: Below average (some issues with correctness or completeness)
- 5-6: Average (adequate but could be improved)
- 7-8: Good quality (well-executed with minor issues)
- 9-10: Excellent quality (comprehensive, correct, and highly helpful)`;

    const promptSection = promptContent !== 'Not provided' 
      ? `\n\nORIGINAL PROMPT:\n\`\`\`\n${promptContent}\n\`\`\``
      : '';

    return this.createStandardPrompt(task, output, criteria, scale) + promptSection;
  }

  /**
   * Parse the assessment response to extract quality score
   * 
   * @param {string} response - The LLM response
   * @returns {number} - The quality score (1-10)
   */
  parseAssessmentResponse(response) {
    const score = this.parseStandardResponse(response);
    
    // Ensure score is within valid range
    if (score < this.minScore || score > this.maxScore) {
      throw new Error(`Quality score ${score} is outside valid range ${this.minScore}-${this.maxScore}`);
    }
    
    return Math.round(score); // Round to nearest integer
  }

  /**
   * Validate quality score value
   * 
   * @param {number} value - The quality score
   * @returns {boolean} - Whether the value is valid
   */
  validateValue(value) {
    if (!super.validateValue(value)) {
      return false;
    }
    
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }
    
    return value >= this.minScore && value <= this.maxScore;
  }

  /**
   * Get quality category based on score
   * 
   * @param {number} score - The quality score
   * @returns {string} - Quality category
   */
  getQualityCategory(score) {
    if (score >= 9) {
      return 'Excellent';
    } else if (score >= 7) {
      return 'Good';
    } else if (score >= 5) {
      return 'Average';
    } else if (score >= 3) {
      return 'Below Average';
    } else {
      return 'Poor';
    }
  }

  /**
   * Format quality score with category
   * 
   * @param {number} value - The quality score
   * @returns {string} - Formatted value with category
   */
  formatValue(value) {
    const category = this.getQualityCategory(value);
    return `${value}/10 (${category})`;
  }

  /**
   * Get detailed statistics for quality scores
   * 
   * @param {number[]} values - Array of quality scores
   * @returns {Object} - Detailed statistics
   */
  getDetailedStatistics(values) {
    if (values.length === 0) {
      return {
        count: 0,
        distribution: {},
        categories: {}
      };
    }
    
    // Calculate score distribution
    const distribution = {};
    for (let i = this.minScore; i <= this.maxScore; i++) {
      distribution[i] = 0;
    }
    
    values.forEach(score => {
      distribution[score] = (distribution[score] || 0) + 1;
    });
    
    // Calculate category distribution
    const categories = values.reduce((acc, score) => {
      const category = this.getQualityCategory(score);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    // Calculate basic statistics
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const sortedValues = [...values].sort((a, b) => a - b);
    const median = values.length % 2 === 0
      ? (sortedValues[values.length / 2 - 1] + sortedValues[values.length / 2]) / 2
      : sortedValues[Math.floor(values.length / 2)];
    
    return {
      count: values.length,
      mean: Math.round(mean * 100) / 100,
      median: median,
      min: Math.min(...values),
      max: Math.max(...values),
      distribution: distribution,
      categories: categories
    };
  }

  /**
   * Get prompt content from file
   * 
   * @param {string} promptFile - Path to prompt file
   * @returns {string} - Prompt content or error message
   */
  getPromptContent(promptFile) {
    try {
      // This is a synchronous operation for simplicity in prompt generation
      // In a real implementation, you might want to cache prompt contents
      return require('fs').readFileSync(this.fs.getAbsolutePath(promptFile), 'utf8');
    } catch (error) {
      this.logger.warn(`Could not read prompt file ${promptFile}: ${error.message}`);
      return 'Could not read prompt file';
    }
  }
}

module.exports = { OutputQualityMetric };
