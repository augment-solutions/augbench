import fs from "fs-extra";

export class ResultsAnalyzer {
  static loadLatest(resultsDir = "./results") {
    // naive: pick benchmark_results.json
    const path = `${resultsDir}/benchmark_results.json`;
    return fs.readJson(path);
  }

  static summarizeByAgent(resultsJson) {
    const perAgent = new Map();
    const llmMetrics = ["completeness", "technical_correctness", "functional_correctness", "clarity", "instruction_adherence"];
    const diffMetrics = ["diff_files_added", "diff_files_modified", "diff_files_deleted", "diff_lines_added", "diff_lines_modified", "diff_lines_deleted"];
    const otherMetrics = ["ast_similarity"];

    for (const entry of resultsJson.results || []) {
      for (const run of entry.runs || []) {
        const key = entry.agent;
        const stats = perAgent.get(key) || {
          count: 0,
          sumTime: 0,
          times: [],
          llmScores: {},
          diffScores: {},
          otherScores: {}
        };

        stats.count += 1;
        stats.sumTime += Number(run.response_time || 0);
        stats.times.push(Number(run.response_time || 0));

        // Collect LLM metric scores
        for (const metric of llmMetrics) {
          if (run[metric] !== null && run[metric] !== undefined) {
            if (!stats.llmScores[metric]) stats.llmScores[metric] = [];
            stats.llmScores[metric].push(Number(run[metric]));
          }
        }

        // Collect diff metric scores
        for (const metric of diffMetrics) {
          if (run[metric] !== null && run[metric] !== undefined) {
            if (!stats.diffScores[metric]) stats.diffScores[metric] = [];
            stats.diffScores[metric].push(Number(run[metric]));
          }
        }

        // Collect other metric scores
        for (const metric of otherMetrics) {
          if (run[metric] !== null && run[metric] !== undefined) {
            if (!stats.otherScores[metric]) stats.otherScores[metric] = [];
            stats.otherScores[metric].push(Number(run[metric]));
          }
        }

        perAgent.set(key, stats);
      }
    }

    const out = [];
    for (const [agent, s] of perAgent.entries()) {
      const avgTime = s.count ? s.sumTime / s.count : 0;
      const minTime = Math.min(...s.times);
      const maxTime = Math.max(...s.times);
      const stdTime = this.calculateStandardDeviation(s.times);

      const summary = {
        agent,
        runs: s.count,
        avg_response_time: Number(avgTime.toFixed(3)),
        min_response_time: Number(minTime.toFixed(3)),
        max_response_time: Number(maxTime.toFixed(3)),
        std_response_time: Number(stdTime.toFixed(3))
      };

      // Add average LLM scores
      for (const metric of llmMetrics) {
        if (s.llmScores[metric] && s.llmScores[metric].length > 0) {
          const avg = s.llmScores[metric].reduce((a,b) => a+b, 0) / s.llmScores[metric].length;
          const std = this.calculateStandardDeviation(s.llmScores[metric]);
          summary[`avg_${metric}`] = Number(avg.toFixed(1));
          summary[`std_${metric}`] = Number(std.toFixed(1));
        }
      }

      // Add average diff scores
      for (const metric of diffMetrics) {
        if (s.diffScores[metric] && s.diffScores[metric].length > 0) {
          const avg = s.diffScores[metric].reduce((a,b) => a+b, 0) / s.diffScores[metric].length;
          summary[`avg_${metric}`] = Number(avg.toFixed(1));
        }
      }

      // Add average other scores
      for (const metric of otherMetrics) {
        if (s.otherScores[metric] && s.otherScores[metric].length > 0) {
          const avg = s.otherScores[metric].reduce((a,b) => a+b, 0) / s.otherScores[metric].length;
          summary[`avg_${metric}`] = Number(avg.toFixed(1));
        }
      }

      out.push(summary);
    }
    return out.sort((a,b)=>a.avg_response_time-b.avg_response_time);
  }

  static calculateStandardDeviation(values) {
    if (values.length <= 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  static generateComparativeAnalysis(summary) {
    if (summary.length < 2) return null;

    const analysis = {
      fastest_agent: summary[0].agent,
      slowest_agent: summary[summary.length - 1].agent,
      speed_difference: Number((summary[summary.length - 1].avg_response_time - summary[0].avg_response_time).toFixed(3)),
      total_agents: summary.length
    };

    // Find best performing agent for each LLM metric
    const llmMetrics = ["completeness", "technical_correctness", "functional_correctness", "clarity", "instruction_adherence"];
    analysis.best_performers = {};

    for (const metric of llmMetrics) {
      const metricKey = `avg_${metric}`;
      const agentsWithMetric = summary.filter(s => s[metricKey] !== undefined);
      if (agentsWithMetric.length > 0) {
        const best = agentsWithMetric.reduce((a, b) => a[metricKey] > b[metricKey] ? a : b);
        analysis.best_performers[metric] = {
          agent: best.agent,
          score: best[metricKey]
        };
      }
    }

    return analysis;
  }

  static exportToCSV(summary, outputPath) {
    const headers = Object.keys(summary[0] || {});
    const csvContent = [
      headers.join(','),
      ...summary.map(row => headers.map(h => row[h] || '').join(','))
    ].join('\n');

    return fs.writeFile(outputPath, csvContent);
  }

  static exportToMarkdown(summary, analysis, outputPath) {
    let content = '# Benchmark Results Report\n\n';

    if (analysis) {
      content += '## Summary\n\n';
      content += `- **Fastest Agent**: ${analysis.fastest_agent}\n`;
      content += `- **Slowest Agent**: ${analysis.slowest_agent}\n`;
      content += `- **Speed Difference**: ${analysis.speed_difference}s\n`;
      content += `- **Total Agents**: ${analysis.total_agents}\n\n`;

      if (Object.keys(analysis.best_performers).length > 0) {
        content += '## Best Performers by Metric\n\n';
        for (const [metric, data] of Object.entries(analysis.best_performers)) {
          content += `- **${metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}**: ${data.agent} (${data.score})\n`;
        }
        content += '\n';
      }
    }

    content += '## Detailed Results\n\n';
    content += '| Agent | Runs | Avg Time (s) | Min Time (s) | Max Time (s) | Std Dev (s) |\n';
    content += '|-------|------|--------------|--------------|--------------|-------------|\n';

    for (const row of summary) {
      content += `| ${row.agent} | ${row.runs} | ${row.avg_response_time} | ${row.min_response_time} | ${row.max_response_time} | ${row.std_response_time} |\n`;
    }

    return fs.writeFile(outputPath, content);
  }
}

