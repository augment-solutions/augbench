import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import fs from "fs-extra";
import path from "path";

export class ChartGenerator {
  constructor(width = 800, height = 600) {
    this.chartJS = new ChartJSNodeCanvas({ width, height });

    // Agent colors per specification: Augment CLI (green), Claude Code (orange), Cursor CLI (blue)
    this.agentColors = {
      "Augment CLI": { bg: "#10b981", border: "#059669" }, // green
      "Claude Code": { bg: "#f59e0b", border: "#d97706" }, // orange
      "Cursor CLI": { bg: "#3b82f6", border: "#1d4ed8" }   // blue
    };
  }

  async generateResponseTimeChart(agentSummaries, outputPath) {
    const config = {
      type: "bar",
      data: {
        labels: agentSummaries.map(s => s.agent),
        datasets: [{
          label: "Average Response Time (seconds)",
          data: agentSummaries.map(s => s.avg_response_time),
          backgroundColor: agentSummaries.map(s => this.getAgentColor(s.agent, "bg")),
          borderColor: agentSummaries.map(s => this.getAgentColor(s.agent, "border")),
          borderWidth: 1
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: "Agent Response Time Comparison"
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Response Time (seconds)"
            }
          }
        }
      }
    };

    const buffer = await this.chartJS.renderToBuffer(config);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }

  async generateAllMetricCharts(resultsJson, outputDir, outputBaseName) {
    const generatedCharts = [];

    // Extract all available metrics from results
    const metrics = this.extractAvailableMetrics(resultsJson);

    for (const metric of metrics) {
      try {
        const chartPath = await this.generateMetricChart(resultsJson, metric, outputDir, outputBaseName);
        generatedCharts.push(chartPath);
      } catch (error) {
        console.warn(`Failed to generate chart for metric ${metric}: ${error.message}`);
      }
    }

    return generatedCharts;
  }

  async generateMetricChart(resultsJson, metricName, outputDir, outputBaseName) {
    const chartData = this.organizeDataByPrompts(resultsJson, metricName);

    if (chartData.prompts.length === 0) {
      throw new Error(`No data available for metric: ${metricName}`);
    }

    const config = {
      type: "bar",
      data: {
        labels: chartData.prompts,
        datasets: chartData.agents.map(agent => ({
          label: agent,
          data: chartData.data[agent],
          backgroundColor: this.getAgentColor(agent, "bg"),
          borderColor: this.getAgentColor(agent, "border"),
          borderWidth: 1
        }))
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: this.getMetricTitle(metricName)
          },
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: this.getMetricYAxisLabel(metricName)
            }
          },
          x: {
            title: {
              display: true,
              text: "Prompts"
            }
          }
        }
      }
    };

    const outputPath = path.join(outputDir, `${outputBaseName}_${metricName}.png`);
    const buffer = await this.chartJS.renderToBuffer(config);
    await fs.ensureDir(outputDir);
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }

  extractAvailableMetrics(resultsJson) {
    const metrics = new Set();

    for (const entry of resultsJson.results || []) {
      for (const run of entry.runs || []) {
        Object.keys(run).forEach(key => {
          // Include all metrics except metadata fields
          if (!['run_id', 'error'].includes(key) && run[key] !== null && run[key] !== undefined) {
            if (key === 'diff_metrics' && typeof run[key] === 'object') {
              // Add individual diff metrics
              Object.keys(run[key]).forEach(diffKey => {
                metrics.add(`diff_${diffKey}`);
              });
            } else if (typeof run[key] === 'number') {
              // Only include numeric metrics for charting
              metrics.add(key);
            }
          }
        });
      }
    }

    return Array.from(metrics).sort();
  }

  organizeDataByPrompts(resultsJson, metricName) {
    const prompts = [];
    const agents = new Set();
    const data = {};

    // Collect all prompts and agents
    for (const entry of resultsJson.results || []) {
      if (!prompts.includes(entry.prompt)) {
        prompts.push(entry.prompt);
      }
      agents.add(entry.agent);
    }

    // Initialize data structure
    for (const agent of agents) {
      data[agent] = new Array(prompts.length).fill(null);
    }

    // Fill data with averaged values per prompt-agent combination
    for (const entry of resultsJson.results || []) {
      const promptIndex = prompts.indexOf(entry.prompt);
      const agent = entry.agent;

      // Calculate average for this metric across all runs
      const values = entry.runs
        .map(run => {
          if (metricName.startsWith('diff_')) {
            // Handle diff metrics
            const diffKey = metricName.replace('diff_', '');
            return run.diff_metrics?.[diffKey];
          }
          return run[metricName];
        })
        .filter(val => val !== null && val !== undefined && !isNaN(val));

      if (values.length > 0) {
        const average = values.reduce((sum, val) => sum + Number(val), 0) / values.length;
        data[agent][promptIndex] = Number(average.toFixed(3));
      }
    }

    return {
      prompts: prompts.map(p => p.replace('.md', '')), // Clean prompt names
      agents: Array.from(agents).sort(),
      data
    };
  }

  getAgentColor(agentName, type = "bg") {
    const colors = this.agentColors[agentName];
    if (colors) {
      return colors[type];
    }
    // Fallback colors for unknown agents
    return type === "bg" ? "#6b7280" : "#374151";
  }

  getMetricTitle(metricName) {
    const titles = {
      response_time: "Response Time Comparison",
      completeness: "Completeness Score Comparison",
      technical_correctness: "Technical Correctness Score Comparison",
      functional_correctness: "Functional Correctness Score Comparison",
      logical_correctness: "Logical Correctness Score Comparison",
      clarity: "Clarity Score Comparison",
      instruction_adherence: "Instruction Adherence Score Comparison",
      diff_files_added: "Files Added Comparison",
      diff_files_modified: "Files Modified Comparison",
      diff_files_deleted: "Files Deleted Comparison",
      diff_lines_added: "Lines Added Comparison",
      diff_lines_modified: "Lines Modified Comparison",
      diff_lines_deleted: "Lines Deleted Comparison",
      ast_similarity: "AST Similarity Score Comparison"
    };

    return titles[metricName] || `${metricName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Comparison`;
  }

  getMetricYAxisLabel(metricName) {
    const labels = {
      response_time: "Time (seconds)",
      completeness: "Score (0-10)",
      technical_correctness: "Score (0-10)",
      functional_correctness: "Score (0-10)",
      logical_correctness: "Score (0-10)",
      clarity: "Score (0-10)",
      instruction_adherence: "Score (0-10)",
      diff_files_added: "Number of Files",
      diff_files_modified: "Number of Files",
      diff_files_deleted: "Number of Files",
      diff_lines_added: "Number of Lines",
      diff_lines_modified: "Number of Lines",
      diff_lines_deleted: "Number of Lines",
      ast_similarity: "Similarity Score (0-10)"
    };

    return labels[metricName] || "Value";
  }
}
