import { BaseAdapter } from "./BaseAdapter.js";
import { run } from "../utils/Process.js";

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(prompt|cwd|runs_dir)\}/g, (_, k) => vars[k] || "");
}

export class ShellCommandAdapter extends BaseAdapter {
  constructor(name, logger, commandTemplate, timeoutMs = 600000) {
    super(name, logger);
    this.template = commandTemplate;
    this.timeout = timeoutMs;
  }
  async execute(promptPath, context) {
    const cmd = renderTemplate(this.template, {
      prompt: promptPath,
      cwd: context?.cwd || process.cwd(),
      runs_dir: context?.runsDir || process.cwd()
    });

    this.logger.debug(`[${this.name}] Executing command: ${cmd}`);
    this.logger.debug(`[${this.name}] Working directory: ${context?.cwd || process.cwd()}`);
    this.logger.debug(`[${this.name}] Timeout: ${this.timeout}ms`);

    const res = await run(cmd, { cwd: context?.cwd, timeout: this.timeout });

    // Enhanced error logging with stderr tail
    if (!res.ok) {
      const errorType = res.error?.code === 'TIMEOUT' ? 'TIMEOUT' : 'NON_ZERO_EXIT';
      const exitCode = res.error?.code ?? 1;
      const stderrTail = this._truncateOutput(res.stderr || '', 500); // 500 char limit

      this.logger.error(`[${this.name}] Command failed (${errorType}): exit code ${exitCode}`);
      this.logger.error(`[${this.name}] Command: ${cmd}`);
      if (stderrTail) {
        this.logger.error(`[${this.name}] stderr (last 500 chars): ${stderrTail}`);
      }
    } else {
      this.logger.debug(`[${this.name}] Command completed successfully`);
    }

    return {
      output: res.stdout,
      error: res.ok ? null : (res.stderr || res.error?.message || ""),
      metadata: {
        exitCode: res.ok ? 0 : (res.error?.code ?? 1),
        command: cmd,
        timeout: this.timeout
      }
    };
  }

  _truncateOutput(text, maxChars) {
    if (!text || text.length <= maxChars) return text;
    return '...' + text.slice(-maxChars);
  }
}

