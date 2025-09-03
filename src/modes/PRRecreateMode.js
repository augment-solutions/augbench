import fs from "fs-extra";
import path from "path";
import simpleGit from "simple-git";
import { FileSystem } from "../utils/FileSystem.js";
import { ResultsStorage } from "../utils/ResultsStorage.js";
import { MetricsFactory } from "../metrics/MetricsFactory.js";
import { DiffMetric } from "../metrics/DiffMetric.js";
import { PromptGenerator } from "../utils/PromptGenerator.js";

export class PRRecreateMode {
  constructor(logger, adaptersFactory) {
    this.logger = logger;
    this.adaptersFactory = adaptersFactory;
  }

  async run(settings) {
    this.logger.info("Starting benchmark in mode: PR_Recreate");
    
    const stageDir = settings.stage_dir || "./stage";
    await FileSystem.ensureDir(stageDir);

    try {
      // Step 1: Clone base repository
      const baseRepoDir = await this.cloneBaseRepository(settings, stageDir);
      
      // Step 2: Analyze git history for PRs
      const prs = await this.analyzePRHistory(baseRepoDir, settings);
      
      // Step 3: Create git worktree workspace
      const workspaceDir = await this.createWorktreeWorkspace(baseRepoDir, prs, stageDir);
      
      // Step 4: Generate prompts from PR metadata
      const promptsDir = await this.generatePRPrompts(prs, stageDir, settings);
      
      // Step 5: Setup human reference implementation
      await this.setupHumanReference(workspaceDir, prs);
      
      // Step 6: Execute agents on PRs
      await this.executeAgentsOnPRs(settings, workspaceDir, prs, promptsDir, stageDir);
      
      this.logger.info("PR_Recreate benchmark complete");
      
    } catch (error) {
      this.logger.error(`PR_Recreate mode failed: ${error.message}`);
      throw error;
    }
  }

  async cloneBaseRepository(settings, stageDir) {
    const baseRepoDir = path.join(stageDir, "base_repo");
    await fs.remove(baseRepoDir);
    await FileSystem.ensureDir(baseRepoDir);
    
    const git = simpleGit();
    const repoUrl = settings.repo_url;
    const branch = settings.branch || "main";
    
    this.logger.info(`Cloning base repository: ${repoUrl}`);
    await git.clone(repoUrl, baseRepoDir, ["--branch", branch]);
    
    this.logger.info(`Base repository cloned to: ${baseRepoDir}`);
    return baseRepoDir;
  }

  async analyzePRHistory(baseRepoDir, settings) {
    this.logger.info("Analyzing git history for merged PRs");
    
    const { PRAnalyzer } = await import("../utils/PRAnalyzer.js");
    const analyzer = new PRAnalyzer(this.logger);
    
    const numPRs = settings.PR_Recreate?.num_prs || 5;
    const prs = await analyzer.findRecentMergedPRs(baseRepoDir, numPRs);
    
    this.logger.info(`Found ${prs.length} recent merged PRs`);
    return prs;
  }

  async createWorktreeWorkspace(baseRepoDir, prs, stageDir) {
    this.logger.info("Creating git worktree workspace");

    const workspaceDir = path.join(stageDir, "workspace");
    await fs.remove(workspaceDir);

    // Find base commit (parent of oldest PR)
    const oldestPR = prs[0]; // PRs should be sorted chronologically
    const baseCommit = oldestPR.commits.main; // Parent commit of the PR

    // Create worktree at base commit using absolute path
    const git = simpleGit({ baseDir: baseRepoDir });
    const absoluteWorkspaceDir = path.resolve(workspaceDir);
    await git.raw(['worktree', 'add', absoluteWorkspaceDir, baseCommit]);

    this.logger.info(`Worktree created at: ${absoluteWorkspaceDir} (base commit: ${baseCommit})`);
    return absoluteWorkspaceDir;
  }

  async generatePRPrompts(prs, stageDir, settings) {
    this.logger.info("Checking for existing prompts or generating from PR metadata");

    // Use root prompts directory, consistent with LLM_Evaluator mode
    const promptsDir = path.join(process.cwd(), "prompts");
    await FileSystem.ensureDir(promptsDir);

    // Check for existing prompts first
    let promptFiles = (await fs.readdir(promptsDir)).filter(f => f.endsWith(".md"));

    // Only generate if no prompts exist and generation is enabled
    if (promptFiles.length === 0 && (settings.PR_Recreate?.generate_prompts ?? true)) {
      this.logger.info("No existing prompts found, generating from PR metadata");
      await fs.remove(promptsDir);
      await FileSystem.ensureDir(promptsDir);

      const generator = new PromptGenerator(this.logger);

      for (let i = 0; i < prs.length; i++) {
        const pr = prs[i];
        pr.order = i + 1; // Add order for metadata

        // Use LLM-based prompt generation that leverages PR description
        const promptContent = await generator.generatePromptForPR(pr);
        const promptFile = path.join(promptsDir, `pr_${i + 1}_${pr.number}.md`);
        await fs.writeFile(promptFile, promptContent);
        this.logger.info(`Generated prompt: ${promptFile}`);
      }

      promptFiles = (await fs.readdir(promptsDir)).filter(f => f.endsWith(".md"));
    } else if (promptFiles.length === 0) {
      this.logger.warn("No prompts found and generation is disabled. Nothing to run.");
    } else {
      this.logger.info(`Found ${promptFiles.length} existing prompts in ${promptsDir}`);
    }

    if (promptFiles.length === 0) {
      throw new Error("No prompts available for PR_Recreate mode");
    }

    return promptsDir;
  }



  async setupHumanReference(workspaceDir, prs) {
    this.logger.info("Setting up human reference implementation");

    // Check if workspace directory exists
    if (!await fs.pathExists(workspaceDir)) {
      throw new Error(`Workspace directory does not exist: ${workspaceDir}`);
    }

    const git = simpleGit({ baseDir: workspaceDir });

    // Create human branch
    await git.checkoutLocalBranch('human');

    // Cherry-pick each PR commit in order
    for (const pr of prs) {
      try {
        // Use -m 1 to specify the first parent for merge commits
        await git.raw(['cherry-pick', '-m', '1', pr.commits.merge]);
        this.logger.info(`Cherry-picked PR ${pr.number} to human branch`);
      } catch (error) {
        this.logger.warn(`Failed to cherry-pick PR ${pr.number}: ${error.message}`);
        // TODO: Handle conflicts manually
      }
    }
  }

  async executeAgentsOnPRs(settings, workspaceDir, prs, promptsDir, stageDir) {
    this.logger.info("Executing agents on PR prompts");
    
    // Initialize results storage
    const results = new ResultsStorage("./results", settings.output_filename || "pr_recreate_results");
    const totalRuns = prs.length * settings.agents.length;
    await results.init(ResultsStorage.buildMetadata("PR_Recreate", "0.1.0", totalRuns));
    
    const metrics = MetricsFactory.create(settings.metrics || []);
    const runsDir = path.join(stageDir, "runs");
    await FileSystem.ensureDir(runsDir);
    
    // Create agent branches and execute
    for (const agent of settings.agents) {
      await this.executeAgentOnAllPRs(agent, workspaceDir, prs, promptsDir, runsDir, results, metrics);
    }
  }

  async executeAgentOnAllPRs(agent, workspaceDir, prs, promptsDir, runsDir, results, metrics) {
    const git = simpleGit({ baseDir: workspaceDir });
    const agentBranch = `agent-${agent.replace(/\s+/g, "_")}`;
    
    // Create agent branch from base commit
    const baseCommit = prs[0].commits.main;
    await git.checkout(baseCommit);
    await git.checkoutLocalBranch(agentBranch);
    
    this.logger.info(`Created agent branch: ${agentBranch}`);
    
    // Execute agent on each PR in order
    for (let i = 0; i < prs.length; i++) {
      const pr = prs[i];
      const promptFile = path.join(promptsDir, `pr_${i + 1}_${pr.number}.md`);
      
      await this.executeAgentOnPR(agent, agentBranch, workspaceDir, pr, promptFile, runsDir, results, metrics);
    }
  }

  async executeAgentOnPR(agent, agentBranch, workspaceDir, pr, promptFile, runsDir, results, metrics) {
    const git = simpleGit({ baseDir: workspaceDir });
    await git.checkout(agentBranch);
    
    const adapter = this.adaptersFactory.create(agent);
    
    // Time and execute
    const t0 = process.hrtime.bigint();
    const execResult = await adapter.execute(promptFile, { cwd: workspaceDir, agent, runsDir });
    const t1 = process.hrtime.bigint();
    const seconds = Number(t1 - t0) / 1e9;
    
    // Commit agent changes
    await git.add('.');
    await git.commit(`Agent implementation of PR ${pr.number}`);
    
    // Measure metrics
    const metricResults = { response_time: Number(seconds.toFixed(3)) };
    for (const metric of metrics) {
      try {
        // Skip response_time metric as we already measured it
        if (metric.name === 'response_time') continue;

        const result = await metric.measure({
          cwd: workspaceDir,
          pr,
          agentOutput: execResult?.output,
          humanBranch: 'human',
          agentBranch
        });
        Object.assign(metricResults, result);
      } catch (error) {
        this.logger.warn(`Metric ${metric.name} failed: ${error.message}`);
        metricResults[metric.name] = null;
      }
    }
    
    // Write run log
    const logPath = path.join(runsDir, `PR${pr.number}_${agent.replace(/\s+/g, "_")}.log`);
    await fs.writeFile(logPath, `${execResult?.output || ""}\n${execResult?.error || ""}`);
    
    // Save result
    const result = {
      prompt: `pr_${pr.order}_${pr.number}`,
      agent,
      runs: [{
        run_id: 1,
        ...metricResults,
        error: null
      }]
    };
    
    await results.appendResult(result);
    this.logger.info(`Completed: PR ${pr.number} / ${agent}`);
  }
}
