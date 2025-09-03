import { BenchmarkRunner } from "./BenchmarkRunner.js";
import { Logger } from "../utils/Logger.js";

export class BenchmarkCLI {
  constructor() {
    this.logger = new Logger();
  }

  async run(args) {
    const cmd = (args[0] || "help").toLowerCase();
    switch (cmd) {
      case "benchmark":
        return this.benchmark();
      case "validate":
        return this.validate();
      case "report":
        return this.report(args.slice(1));
      case "help":
      default:
        return this.help();
    }
  }

  async benchmark() {
    const { SettingsManager } = await import("../config/SettingsManager.js");
    const settings = await SettingsManager.loadFromFile("settings.json");
    const runner = new BenchmarkRunner(this.logger);
    await runner.run(settings);
  }

  async validate() {
    try {
      const { SettingsManager } = await import("../config/SettingsManager.js");
      const settings = await SettingsManager.loadFromFile("settings.json");
      this.logger.info("settings.json loaded and basic schema validated");
      const { Validator } = await import("./Validator.js");
      const validator = new Validator(this.logger);
      const res = await validator.runAll(settings);
      if (!res.ok) process.exitCode = 1;
    } catch (e) {
      this.logger.error("Validation failed: " + (e.message || e));
      process.exitCode = 1;
    }
  }

  async report(args) {
    try {
      const { ResultsAnalyzer } = await import("../reporting/ResultsAnalyzer.js");
      const results = await ResultsAnalyzer.loadLatest();
      const summary = ResultsAnalyzer.summarizeByAgent(results);
      const analysis = ResultsAnalyzer.generateComparativeAnalysis(summary);

      console.log("\n📊 Benchmark Results Summary");
      console.log("=" .repeat(50));
      console.log(`Total runs: ${results.metadata?.totalRuns || 0}`);
      console.log(`Mode: ${results.metadata?.mode || "unknown"}`);
      console.log(`Timestamp: ${results.metadata?.timestamp || "unknown"}\n`);

      // Comparative analysis
      if (analysis) {
        console.log("🏆 Performance Analysis:");
        console.log(`  Fastest: ${analysis.fastest_agent}`);
        console.log(`  Slowest: ${analysis.slowest_agent}`);
        console.log(`  Speed difference: ${analysis.speed_difference}s\n`);

        if (Object.keys(analysis.best_performers).length > 0) {
          console.log("🥇 Best Performers by Metric:");
          for (const [metric, data] of Object.entries(analysis.best_performers)) {
            const metricName = metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            console.log(`  ${metricName}: ${data.agent} (${data.score})`);
          }
          console.log();
        }
      }

      console.log("📈 Detailed Agent Performance:");
      console.log("Agent".padEnd(15) + "Runs".padEnd(6) + "Avg Time".padEnd(10) + "Min/Max".padEnd(12) + "Std Dev".padEnd(10) + "Quality Scores");
      console.log("-".repeat(80));

      for (const s of summary) {
        let line = `${s.agent.padEnd(15)}${s.runs.toString().padEnd(6)}${s.avg_response_time}s`.padEnd(25);
        line += `${s.min_response_time}/${s.max_response_time}s`.padEnd(12);
        line += `${s.std_response_time}s`.padEnd(10);

        // Add quality scores if available
        const qualityScores = [];
        if (s.avg_completeness) qualityScores.push(`C:${s.avg_completeness}`);
        if (s.avg_technical_correctness) qualityScores.push(`T:${s.avg_technical_correctness}`);
        if (s.avg_functional_correctness) qualityScores.push(`F:${s.avg_functional_correctness}`);
        if (s.avg_clarity) qualityScores.push(`Cl:${s.avg_clarity}`);
        if (s.avg_ast_similarity) qualityScores.push(`AST:${s.avg_ast_similarity}`);

        if (qualityScores.length > 0) {
          line += qualityScores.join(" ");
        }

        console.log(line);
      }

      // Export options
      if (args.includes("--export-csv")) {
        const csvPath = "./results/benchmark_summary.csv";
        await ResultsAnalyzer.exportToCSV(summary, csvPath);
        console.log(`\n💾 Exported CSV: ${csvPath}`);
      }

      if (args.includes("--export-md")) {
        const mdPath = "./results/benchmark_report.md";
        await ResultsAnalyzer.exportToMarkdown(summary, analysis, mdPath);
        console.log(`\n📝 Exported Markdown: ${mdPath}`);
      }

      if (args.includes("--charts")) {
        const { ChartGenerator } = await import("../reporting/ChartGenerator.js");
        const chartGen = new ChartGenerator();

        // Generate all metric charts
        const outputBaseName = results.metadata?.output_filename || "benchmark_results";
        const chartPaths = await chartGen.generateAllMetricCharts(results, "./results", outputBaseName);

        if (chartPaths.length > 0) {
          console.log(`\n📈 Generated ${chartPaths.length} charts:`);
          chartPaths.forEach(path => console.log(`  ${path}`));
        } else {
          console.log(`\n📈 No charts generated (no metric data available)`);
        }
      }

      console.log(`\n💡 Tip: Use --charts, --export-csv, or --export-md for additional output formats`);
    } catch (e) {
      this.logger.error("Report failed: " + (e.message || e));
      process.exitCode = 1;
    }
  }

  help() {
    const text = `
augbench - AI Coding Assistant Benchmarking CLI

Commands:
  augbench benchmark                    Execute benchmarking based on settings.json mode
  augbench validate                     Check prerequisites and output consolidated report
  augbench report [options]             Summarize latest results with various output formats
  augbench help                         Show comprehensive examples for both modes

Report Options:
  --charts                              Generate PNG charts for all metrics
  --export-csv                          Export summary data to CSV format
  --export-md                           Export detailed report to Markdown format

Configuration:
  All configuration is via settings.json at the repository root.

Examples:
  # LLM_Evaluator mode
  - Put your repo_path or repo_url in settings.json, mode="LLM_Evaluator"
  - Optional: add prompts/*.md or enable generate_prompts
  $ augbench benchmark

  # PR_Recreate mode
  - Put your repo_url in settings.json, mode="PR_Recreate"
  $ augbench benchmark

  # Reporting with various formats
  $ augbench report                     # Basic console summary
  $ augbench report --charts           # Generate visual charts
  $ augbench report --export-csv       # Export to CSV
  $ augbench report --export-md        # Export to Markdown
  $ augbench report --charts --export-csv --export-md  # All formats

  # Validate environment
  $ augbench validate

Features:
  ✅ Two benchmark modes: LLM_Evaluator and PR_Recreate
  ✅ Multiple metrics: response time, code quality, AST similarity
  ✅ Parallel agent execution for faster benchmarks
  ✅ Visual charts with agent-specific colors
  ✅ Statistical analysis (mean, std dev, min/max)
  ✅ Comparative analysis between agents
  ✅ Multiple export formats (CSV, Markdown, PNG)
`;
    console.log(text);
  }
}

