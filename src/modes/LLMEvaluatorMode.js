import { FileSystem } from "../utils/FileSystem.js";
import { ResultsStorage } from "../utils/ResultsStorage.js";
import { PromptGenerator } from "../utils/PromptGenerator.js";
import { MetricsFactory } from "../metrics/MetricsFactory.js";
import { DiffMetric } from "../metrics/DiffMetric.js";
import path from "path";
import fs from "fs-extra";
import simpleGit from "simple-git";

export class LLMEvaluatorMode {
  constructor(logger, adaptersFactory) {
    this.logger = logger;
    this.adaptersFactory = adaptersFactory;
  }

  async run(settings) {
    const stageDir = settings.stage_dir || "./stage";
    await FileSystem.ensureDir(stageDir);

    // Prepare per-agent workspaces (clone or copy repo)
    const agentWorkspaces = new Map();
    for (const agent of settings.agents) {
      const agentDir = path.join(stageDir, agent.replace(/\s+/g, "_"));
      // reset dir
      await fs.remove(agentDir);
      await FileSystem.ensureDir(agentDir);
      const git = simpleGit();
      if (settings.repo_path) {
        await git.clone(settings.repo_path, agentDir, ["--branch", settings.branch || "main", "--local"]);
        this.logger.info(`Cloned local repo_path to stage for ${agent}: ${agentDir}`);
      } else if (settings.repo_url) {
        await git.clone(settings.repo_url, agentDir, ["--branch", settings.branch || "main"]);
        this.logger.info(`Cloned repo_url to stage for ${agent}: ${agentDir}`);
      }
      agentWorkspaces.set(agent, agentDir);
    }

    // Prompts: discover or generate
    const promptsDir = path.join(process.cwd(), "prompts");
    await FileSystem.ensureDir(promptsDir);
    let promptFiles = (await fs.readdir(promptsDir)).filter(f => f.endsWith(".md"));
    if (promptFiles.length === 0 && (settings.LLM_Evaluator?.generate_prompts ?? true)) {
      const gen = new PromptGenerator(this.logger);

      // Use the first agent's workspace (cloned repo) for repository summary
      // This ensures we analyze the target repo, not the augbench project
      const firstAgent = settings.agents[0];
      const firstAgentDir = agentWorkspaces.get(firstAgent);
      const repoPathForSummary = firstAgentDir || settings.repo_path || ".";

      const summary = await gen.summarizeRepository(repoPathForSummary);
      const topics = settings.LLM_Evaluator?.prompt_topics || [];
      let idx = 1;
      for (const t of topics) {
        const content = await gen.generatePrompt(summary, t);
        const file = path.join(promptsDir, `prompt${idx++}.md`);
        await fs.writeFile(file, content);
        this.logger.info(`Generated prompt: ${file}`);
      }
      promptFiles = (await fs.readdir(promptsDir)).filter(f => f.endsWith(".md"));
    }

    if (promptFiles.length === 0) {
      this.logger.warn("No prompts found. Nothing to run.");
      return;
    }

    // Results storage init
    const results = new ResultsStorage("./results", settings.output_filename || "benchmark_results");
    const totalRuns = promptFiles.length * settings.agents.length * (settings.runs_per_prompt || 1);
    await results.init(ResultsStorage.buildMetadata("LLM_Evaluator", "0.1.0", totalRuns));

    const metrics = MetricsFactory.create(settings.metrics || []);
    const diffMetric = metrics.find(m => m.name === "diff_metrics") ? new DiffMetric() : null;
    const llmMetrics = metrics.filter(m => m.name !== "response_time" && m.name !== "diff_metrics");

    // Run loop
    const runsDir = path.join(stageDir, "runs");
    await FileSystem.ensureDir(runsDir);

    for (const prompt of promptFiles) {
      const promptPath = path.join(promptsDir, prompt);

      if (settings.parallel_agents === "true" || settings.parallel_agents === true) {
        // Parallel execution per prompt
        const agentTasks = settings.agents.map(async (agent) => {
          const agentDir = agentWorkspaces.get(agent);
          const runTasks = [];

          for (let runId = 1; runId <= (settings.runs_per_prompt || 1); runId++) {
            runTasks.push(this.executeRun(prompt, promptPath, agent, agentDir, runId, runsDir, diffMetric, results, llmMetrics));
          }

          return Promise.all(runTasks);
        });

        await Promise.all(agentTasks);
      } else {
        // Sequential execution
        for (const agent of settings.agents) {
          const agentDir = agentWorkspaces.get(agent);
          for (let runId = 1; runId <= (settings.runs_per_prompt || 1); runId++) {
            await this.executeRun(prompt, promptPath, agent, agentDir, runId, runsDir, diffMetric, results, llmMetrics);
          }
        }
      }
    }
  }

  async executeRun(prompt, promptPath, agent, agentDir, runId, runsDir, diffMetric, results, llmMetrics = []) {
    const adapter = this.adaptersFactory.create(agent);

    // Time and execute
    const t0 = process.hrtime.bigint();
    const execResult = await adapter.execute(promptPath, { cwd: agentDir, stageDir: path.dirname(runsDir), agent, runsDir });
    const t1 = process.hrtime.bigint();
    const seconds = Number(t1 - t0) / 1e9;

    // Diff metrics (working tree vs HEAD)
    let diff = undefined;
    if (diffMetric) {
      diff = await diffMetric.measure({ cwd: agentDir });
    }

    // LLM-assessed metrics
    const llmScores = {};
    if (llmMetrics.length > 0 && execResult?.output) {
      const originalPrompt = await fs.readFile(promptPath, "utf8");
      for (const metric of llmMetrics) {
        try {
          const score = await metric.measure({
            prompt,
            agentOutput: execResult.output,
            originalPrompt,
            cwd: agentDir  // Add working directory for diff generation
          });
          Object.assign(llmScores, score);
        } catch (error) {
          this.logger.warn(`LLM metric ${metric.name} failed: ${error.message}`);
          llmScores[metric.name] = null;
        }
      }
    }

    // Write run log
    const logPath = path.join(runsDir, `${path.basename(promptPath, ".md")}_${agent.replace(/\s+/g, "_")}_run${runId}.log`);
    await fs.writeFile(logPath, `${execResult?.output || ""}\n${execResult?.error || ""}`);

    // Save result
    const result = { prompt, agent, runs: [] };
    const runEntry = {
      run_id: runId,
      response_time: Number(seconds.toFixed(3)),
      diff_metrics: diff || undefined,
      ...llmScores,
      error: null
    };
    result.runs.push(runEntry);
    await results.appendResult(result);
    this.logger.info(`Completed: ${prompt} / ${agent} / run ${runId}`);
  }
}

