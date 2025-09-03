import fs from "fs-extra";
import Joi from "joi";

const schema = Joi.object({
  agents: Joi.array().items(Joi.string()).min(1).required(),
  runs_per_prompt: Joi.number().integer().min(1).default(1),
  parallel_agents: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true","false")).default(false),
  output_filename: Joi.string().default("benchmark_results"),
  stage_dir: Joi.string().default("./stage"),
  repo_url: Joi.string().uri().optional(),
  repo_path: Joi.string().optional(),
  branch: Joi.string().default("main"),
  metrics: Joi.array().items(
    Joi.string().valid(
      "response_time",
      "diff_metrics",
      "ast_similarity",
      "completeness",
      "technical_correctness",
      "functional_correctness",
      "clarity",
      "instruction_adherence"
    )
  ).min(1).default(["response_time"]),
  mode: Joi.string().valid("LLM_Evaluator","PR_Recreate").required(),
  LLM_Evaluator: Joi.object({
    generate_prompts: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true","false")).default(true),
    prompt_topics: Joi.array().items(Joi.string()).default([])
  }).default({}),
  PR_Recreate: Joi.object({
    num_prs: Joi.number().integer().min(1).default(5),
    generate_prompts: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true","false")).default(true)
  }).default({}),
  agent_config: Joi.object().pattern(/.*/, Joi.object({
    model: Joi.string().optional(),
    timeout: Joi.number().integer().min(1000).optional(),
    commandTemplate: Joi.string().optional()
  })).default({})
}).custom((value, helpers) => {
  const mode = value.mode;
  if (mode === "LLM_Evaluator") {
    if (!value.repo_url && !value.repo_path) {
      return helpers.message("repo_url or repo_path is required for LLM_Evaluator mode");
    }
  } else if (mode === "PR_Recreate") {
    if (!value.repo_url) {
      return helpers.message("repo_url is required for PR_Recreate mode");
    }
    if (value.repo_path) {
      return helpers.message("repo_path may not be used in PR_Recreate mode");
    }
  }
  return value;
});

export class SettingsManager {
  static async loadFromFile(path = "settings.json") {
    if (!await fs.pathExists(path)) {
      throw new Error(`Missing ${path}. Please create it (see settings.json examples).`);
    }
    const raw = await fs.readFile(path, "utf8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON in ${path}: ${e.message}`);
    }
    const { value, error } = schema.validate(data, { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details?.map(d => d.message).join("; ") || error.message;
      throw new Error(`settings.json validation error: ${details}`);
    }

    // Normalize booleans provided as strings
    value.parallel_agents = value.parallel_agents === true || value.parallel_agents === "true";
    if (value.LLM_Evaluator) {
      value.LLM_Evaluator.generate_prompts = value.LLM_Evaluator.generate_prompts === true || value.LLM_Evaluator.generate_prompts === "true";
    }
    return value;
  }
}

