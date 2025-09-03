import { BaseMetric } from "./BaseMetric.js";

export class ResponseTimeMetric extends BaseMetric {
  constructor() { super("response_time"); }
  async measure(fn) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    return Number((ms / 1000).toFixed(3)); // seconds
  }
}

