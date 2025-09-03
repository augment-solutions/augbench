import { ResponseTimeMetric } from "./ResponseTimeMetric.js";
import { DiffMetric } from "./DiffMetric.js";
import { LLMEvaluatorMetric } from "./LLMEvaluatorMetric.js";
import { ASTSimilarityMetric } from "./ASTSimilarityMetric.js";
import { METRIC_PROMPTS } from "./promptTemplates.js";

export class MetricsFactory {
  static create(names) {
    const out = [];
    for (const n of names) {
      if (n === "response_time") out.push(new ResponseTimeMetric());
      else if (n === "diff_metrics") out.push(new DiffMetric());
      else if (n === "completeness") out.push(new LLMEvaluatorMetric("completeness", METRIC_PROMPTS.completeness));
      else if (n === "technical_correctness") out.push(new LLMEvaluatorMetric("technical_correctness", METRIC_PROMPTS.technical_correctness));
      else if (n === "functional_correctness" || n === "logical_correctness") {
        // Support both names for the same metric (spec inconsistency)
        out.push(new LLMEvaluatorMetric("functional_correctness", METRIC_PROMPTS.functional_correctness));
      }
      else if (n === "clarity") out.push(new LLMEvaluatorMetric("clarity", METRIC_PROMPTS.clarity));
      else if (n === "instruction_adherence") out.push(new LLMEvaluatorMetric("instruction_adherence", METRIC_PROMPTS.instruction_adherence));
      else if (n === "ast_similarity") out.push(new ASTSimilarityMetric());
      else console.warn(`Unknown metric: ${n}`);
    }
    return out;
  }
}

