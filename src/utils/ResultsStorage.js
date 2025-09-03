import fs from "fs-extra";
import os from "os";

export class ResultsStorage {
  constructor(resultsDir = "./results", filename = "benchmark_results") {
    this.resultsDir = resultsDir;
    this.file = `${resultsDir}/${filename}.json`;
  }

  async init(metadata) {
    await fs.ensureDir(this.resultsDir);
    const payload = { metadata, results: [] };
    await fs.writeFile(this.file, JSON.stringify(payload, null, 2));
  }

  async appendResult(result) {
    const data = await fs.readJson(this.file);
    data.results.push(result);
    await fs.writeFile(this.file, JSON.stringify(data, null, 2));
  }

  static buildMetadata(mode, version = "0.1.0", totalRuns = 0) {
    return {
      timestamp: new Date().toISOString(),
      mode,
      version,
      totalRuns,
      platform: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpus: os.cpus()?.length || 0
      }
    };
  }
}

