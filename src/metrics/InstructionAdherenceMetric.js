/**
 * Instruction Adherence Metric - LLM-assessed 1-10 score for following instructions in the prompt
 */

const { AssessableMetric } = require('./AssessableMetric');
const { FileSystem } = require('../utils/FileSystem');

class InstructionAdherenceMetric extends AssessableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Assesses how well the response follows the instructions in the original prompt (1-10)',
      unit: 'score',
      ...options,
    });
    this.fs = new FileSystem(options);
    this.minScore = 1;
    this.maxScore = 10;
  }

  _getPromptContent(promptFile) {
    try {
      return require('fs').readFileSync(this.fs.getAbsolutePath(promptFile), 'utf8');
    } catch {
      return 'Not provided';
    }
  }

  createAssessmentPrompt(output, context = {}) {
    const promptContent = context.prompt ? this._getPromptContent(context.prompt) : 'Not provided';

    const task = 'Assess how well the AI assistant response follows the instructions in the provided prompt.';
    const criteria = `
1. Direct adherence to explicit instructions
2. Completeness of required steps
3. Avoidance of prohibited actions or scope creep
4. Faithfulness to requested formats/constraints
5. Clarity and lack of unnecessary content`;
    const scale = `
Rate 1-10:
1-2: Poor adherence; misses key instructions
3-4: Below average; multiple missed or misinterpreted instructions
5-6: Adequate; generally follows with notable gaps
7-8: Good; follows instructions with minor issues
9-10: Excellent; strictly follows and fully covers instructions`;

    const promptSection = promptContent !== 'Not provided'
      ? `\n\nORIGINAL PROMPT:\n\`\`\`\n${promptContent}\n\`\`\``
      : '';

    return this.createStandardPrompt(task, output, criteria, scale) + promptSection;
  }

  parseAssessmentResponse(response) {
    const score = this.parseStandardResponse(response);
    if (score < this.minScore || score > this.maxScore) {
      throw new Error(`Instruction adherence score ${score} outside valid range ${this.minScore}-${this.maxScore}`);
    }
    return Math.round(score);
  }
}

module.exports = { InstructionAdherenceMetric };

