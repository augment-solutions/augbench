import { BaseAdapter } from "./BaseAdapter.js";
import { ShellCommandAdapter } from "./ShellCommandAdapter.js";

class NoopAdapter extends BaseAdapter {
  async execute(prompt, context) {
    this.logger.info(`[NOOP] Would execute for agent '${this.name}'`);
    return { output: "", metadata: { noop: true } };
  }
}

export class AdapterFactory {
  constructor(logger, settings) { this.logger = logger; this.settings = settings; }
  create(agentName) {
    const cfg = this.settings?.agent_config?.[agentName] || {};
    if (cfg.commandTemplate) {
      return new ShellCommandAdapter(agentName, this.logger, cfg.commandTemplate, cfg.timeout || 600000);
    }
    // No commandTemplate provided - use NoopAdapter
    return new NoopAdapter(agentName, this.logger);
  }
}

