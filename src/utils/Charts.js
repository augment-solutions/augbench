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
   * Generate line charts for metrics.
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

    // Build data per metric -> agent -> series
    const agents = Array.from(new Set(results.map(r => r.assistant))).sort();

    const files = [];
    for (const metric of metrics) {
      // Per agent series
      const seriesMap = new Map();
      for (const agent of agents) {
        const agentResults = results.filter(r => r.assistant === agent);
        // Flatten runs in natural order of run_id
        const points = [];
        for (const ar of agentResults) {
          const sortedRuns = (ar.runs || []).slice().sort((a,b) => (a.run_id||0)-(b.run_id||0));
          for (const run of sortedRuns) {
            const v = run[metric];
            if (v === null || v === undefined || Number.isNaN(v)) {
              points.push(null);
            } else if (typeof v === 'number') {
              points.push(v);
            } else {
              points.push(null);
            }
          }
        }
        if (points.some(p => p !== null)) {
          seriesMap.set(agent, points);
        }
      }

      if (seriesMap.size === 0) continue; // nothing to draw

      const longest = Math.max(1, ...Array.from(seriesMap.values()).map(a => a.length));
      const labels = Array.from({ length: longest }, (_, i) => String(i + 1));

      // Colors: deterministic palette
      const palette = [
        '#3366CC','#DC3912','#FF9900','#109618','#990099','#0099C6','#DD4477','#66AA00','#B82E2E','#316395'
      ];
      const datasets = Array.from(seriesMap.entries()).map(([agent, points], idx) => ({
        label: agent,
        data: points,
        borderColor: palette[idx % palette.length],
        backgroundColor: palette[idx % palette.length] + '80',
        spanGaps: false,
        pointRadius: 3,
        fill: false,
        tension: 0
      }));

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
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: false,
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Arial, sans-serif', size: 12 } } },
            title: { display: true, text: `${metric} over runs (all agents)`, font: { family: 'Arial, sans-serif', size: 18 } }
          },
          scales: {
            x: { title: { display: true, text: 'Run', font: { family: 'Arial, sans-serif' } }, grid: { color: '#eee' }, ticks: { autoSkip: false } },
            y: {
              title: { display: true, text: `${metric}${unit}`, font: { family: 'Arial, sans-serif' } },
              grid: { color: '#eee' },
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

