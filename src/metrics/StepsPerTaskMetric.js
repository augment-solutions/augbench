/**
 * Steps Per Task Metric - Counts recognizable steps in output if available; else null
 */

const { MeasurableMetric } = require('./MeasurableMetric');

class StepsPerTaskMetric extends MeasurableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Counts steps derived from assistant output/logs when available',
      unit: 'steps',
      precision: 0,
      minValue: 0,
      ...options,
    });
  }

  validateValue(value) {
    if (value === null) return true; // allow null when steps not detectable
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  async performMeasurement(output, context = {}) {
    if (!output) return null;

    // Heuristic: count lines that look like "Step N:" (case-insensitive)
    const matches = output.match(/^\s*step\s+\d+\s*[:\.\-]/gim);
    if (matches && matches.length > 0) {
      return matches.length;
    }

    // If adapters later expose structured steps via context, use that here
    if (Array.isArray(context.steps)) {
      return context.steps.length;
    }

    return null;
  }
}

module.exports = { StepsPerTaskMetric };

