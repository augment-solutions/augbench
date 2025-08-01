/**
 * Context Adherence Metric - LLM-assessed 1-10 score for using/satisfying provided context
 */

const { AssessableMetric } = require('./AssessableMetric');
const { FileSystem } = require('../utils/FileSystem');

class ContextAdherenceMetric extends AssessableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Assesses whether the response uses/satisfies the provided prompt/repository context (1-10)',
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

    const repoNote = context.repositoryPath
      ? `The repository path is provided as context: ${context.repositoryPath}. Do not scan files; evaluate only based on how the response references or uses context.`
      : 'Repository path not provided.';

    const task = 'Assess whether the response appropriately uses the provided context and remains consistent with it.';
    const criteria = `
1. Correct usage of contextual details
2. Consistency with constraints/assumptions in the prompt
3. Relevance to the repository/task context
4. Avoids claims not supported by the given context
5. Provides references to the context when appropriate`;
    const scale = `
Rate 1-10:
1-2: Poor; ignores/misuses context
3-4: Below average; limited or inconsistent use
5-6: Adequate; some usage but with gaps
7-8: Good; uses context well with minor issues
9-10: Excellent; fully consistent and contextually grounded`;

    const promptSection = promptContent !== 'Not provided'
      ? `\n\nORIGINAL PROMPT:\n\`\`\`\n${promptContent}\n\`\`\``
      : '';

    return (
      this.createStandardPrompt(task, output, criteria, scale) +
      `\n\n${repoNote}` +
      promptSection
    );
  }

  parseAssessmentResponse(response) {
    const score = this.parseStandardResponse(response);
    if (score < this.minScore || score > this.maxScore) {
      throw new Error(`Context adherence score ${score} outside valid range ${this.minScore}-${this.maxScore}`);
    }
    return Math.round(score);
  }
}

module.exports = { ContextAdherenceMetric };

