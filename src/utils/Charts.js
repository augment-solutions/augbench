/**
 * Charts utility for generating per-metric PNGs
 * Uses chartjs-node-canvas for headless-friendly PNG rendering
 */

const path = require('path');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');

class Charts {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);

    try {
      const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
      // Ensure Chart.js controllers and elements are registered
      try { require('chart.js/auto'); } catch (_) {}
      this.ChartJSNodeCanvas = ChartJSNodeCanvas;
      this.available = true;
    } catch (e) {
      this.available = false;
      this.logger.warn('chartjs-node-canvas (and chart.js) not installed. Skipping chart generation.');
    }
  }

  /**
   * Generate bar charts for metrics.
   * results: array of { prompt, assistant, runs: [{run_id, metric1, metric2, ...}] }
   * metrics: string[]
   * options: { width, height, dpi, outputDir, baseName, unitsMap }
   */
  async generateMetricCharts(results, metrics, options = {}) {
    if (!this.available) return [];

    const width = options.width || 1200;
    const height = options.height || 800;
    const dpi = options.dpi || 192; // 2x for crispness if 96 is 1x

    const { ChartJSNodeCanvas } = this;
    const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white', chartCallback: undefined });

    // Get unique prompts and agents
    const prompts = Array.from(new Set(results.map(r => r.prompt))).sort();
    const agents = Array.from(new Set(results.map(r => r.assistant))).sort();

    const files = [];
    for (const metric of metrics) {
      // Calculate average values per prompt per agent
      const dataByAgent = new Map();

      for (const agent of agents) {
        const promptAverages = [];

        for (const prompt of prompts) {
          // Get all runs for this agent and prompt
          const agentPromptResults = results.filter(r => r.assistant === agent && r.prompt === prompt);
          const values = [];

          for (const result of agentPromptResults) {
            for (const run of result.runs || []) {
              // Skip failed runs (runs with errors)
              if (run.error) continue;

              const v = run[metric];
              // Only include valid numeric values (exclude null, undefined, NaN)
              if (typeof v === 'number' && !Number.isNaN(v)) {
                values.push(v);
              }
            }
          }

          // Calculate average or null if no valid values
          const avg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
          promptAverages.push(avg);
        }

        // Only add agent if it has at least one non-null average
        if (promptAverages.some(avg => avg !== null)) {
          dataByAgent.set(agent, promptAverages);
        }
      }

      if (dataByAgent.size === 0) continue; // nothing to draw

      // Colors: green for Augment CLI (Auggie), orange for Claude Code
      const colorMap = {
        'Augment CLI': '#109618', // Green
        'Claude Code': '#FF9900'  // Orange
      };

      // Create datasets for bar chart
      const datasets = Array.from(dataByAgent.entries()).map(([agent, averages]) => {
        // Use specific colors or fall back to default palette
        let color = colorMap[agent];
        if (!color) {
          // Fallback colors for other agents
          const palette = ['#3366CC','#DC3912','#990099','#0099C6','#DD4477','#66AA00','#B82E2E','#316395'];
          const idx = agents.indexOf(agent);
          color = palette[idx % palette.length];
        }

        return {
          label: agent,
          data: averages,
          backgroundColor: color + 'CC', // Add transparency
          borderColor: color,
          borderWidth: 1
        };
      });

      // Units
      const unitsMap = options.unitsMap || { response_time: 's' };
      const unit = unitsMap[metric] ? ` (${unitsMap[metric]})` : '';

      // Optional canonical ranges
      const rangesMap = options.rangesMap || {};
      const range = rangesMap[metric];
      // Determine whether to clamp: only clamp if any data lies within the canonical range
      let clampY = false;
      if (Array.isArray(range) && range.length === 2) {
        const [minR, maxR] = range;
        const anyInRange = datasets.some(ds => (ds.data || []).some(v => typeof v === 'number' && v >= minR && v <= maxR));
        if (anyInRange) clampY = true;
      }

      const cfg = {
        type: 'bar',
        data: { labels: prompts, datasets },
        options: {
          responsive: false,
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Arial, sans-serif', size: 12 } } },
            title: { display: true, text: `Average ${metric} by Prompt`, font: { family: 'Arial, sans-serif', size: 18 } }
          },
          scales: {
            x: {
              title: { display: true, text: 'Prompt', font: { family: 'Arial, sans-serif' } },
              grid: { color: '#eee' },
              ticks: { autoSkip: false }
            },
            y: {
              title: { display: true, text: `Average ${metric}${unit}`, font: { family: 'Arial, sans-serif' } },
              grid: { color: '#eee' },
              beginAtZero: true,
              ...(clampY ? { min: range[0], max: range[1] } : {})
            }
          }
        }
      };

      const buffer = await canvas.renderToBuffer(cfg, 'image/png', { pixelRatio: dpi / 96 });
      const fileName = `${options.baseName}_${metric}.png`;
      const outPath = path.join(options.outputDir, fileName);
      await this.fs.ensureDir(options.outputDir);
      await this.fs.writeBinaryAtomic(outPath, buffer);
      files.push(outPath);
    }

    return files;
  }
}

module.exports = { Charts };

