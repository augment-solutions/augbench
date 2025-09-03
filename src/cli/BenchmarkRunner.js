import { Logger } from "../utils/Logger.js";

export class BenchmarkRunner {
  constructor(logger = new Logger()) {
    this.logger = logger;
  }

  async run(settings) {
    const mode = (settings.mode || "LLM_Evaluator").toString();
    this.logger.info(`Starting benchmark in mode: ${mode}`);
    if (mode === "LLM_Evaluator") {
      const { AdapterFactory } = await import("../adapters/AdapterFactory.js");
      const { LLMEvaluatorMode } = await import("../modes/LLMEvaluatorMode.js");
      const factory = new AdapterFactory(this.logger, settings);
      const impl = new LLMEvaluatorMode(this.logger, factory);
      await impl.run(settings);
    } else if (mode === "PR_Recreate") {
      const { AdapterFactory } = await import("../adapters/AdapterFactory.js");
      const { PRRecreateMode } = await import("../modes/PRRecreateMode.js");
      const factory = new AdapterFactory(this.logger, settings);
      const impl = new PRRecreateMode(this.logger, factory);
      await impl.run(settings);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }
    this.logger.success("Benchmark execution completed successfully.");
  }
}

