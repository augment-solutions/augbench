import { Logger } from "../utils/Logger.js";
import { GitManager } from "../utils/GitManager.js";
import { FileSystem } from "../utils/FileSystem.js";
import { which } from "../utils/Process.js";

export class Validator {
  constructor(logger = new Logger()) { this.logger = logger; }

  async runAll(settings) {
    const results = [];

    results.push(await this.checkNodeVersion(">=22.0.0"));
    results.push(await this.checkGitVersion(">=2.30.0"));
    results.push(await this.checkDiskSpace(10));
    results.push(...await this.checkAgents(settings.agents || []));
    results.push(...await this.checkRepo(settings));
    results.push(...await this.checkLLMConnectivity(settings));
    results.push(await this.checkTreeSitterGrammars());

    const failed = results.filter(r => r.ok === false);
    failed.forEach(f => this.logger.error(f.message));
    const warnings = results.filter(r => r.ok && falsy(r.warn) === false && r.warn === true);
    warnings.forEach(w => this.logger.warn(w.message));

    if (failed.length === 0) this.logger.info("All validation checks passed");
    return { ok: failed.length === 0, results };
  }

  async checkNodeVersion(range) {
    const v = process.versions.node;
    const ok = this._semverSatisfies(v, range);
    this.logger.info(`Node.js version: ${v} (require ${range})`);
    return ok ? { ok: true } : { ok: false, message: `Node.js ${range} required, found ${v}` };
  }

  async checkGitVersion(range) {
    const res = await GitManager.versionOk(range.replace(">=", ""));
    this.logger.info(`Git version: ${res.version || "unknown"} (require ${range})`);
    return res.ok ? { ok: true } : { ok: false, message: `Git ${range} required` };
  }

  async checkDiskSpace(minGB) {
    const res = await FileSystem.checkDiskSpaceMinGB(minGB);
    if (res.ok) {
      this.logger.info(`Disk space available: ${res.availableGB} GB`);
      return { ok: true };
    }
    return { ok: false, message: `Unable to verify disk space >= ${minGB} GB` };
  }

  async checkAgents(agents) {
    const map = {
      "Augment CLI": "auggie",
      "Claude Code": "claude",
      "Cursor CLI": "cursor-agent"
    };
    const checks = await Promise.all(agents.map(async a => {
      const bin = map[a];
      if (!bin) return { ok: true };
      const p = await which(bin);
      if (p) { this.logger.info(`Agent '${a}' found: ${p}`); return { ok: true }; }
      return { ok: false, message: `Agent '${a}' executable not found in PATH (expected '${bin}')` };
    }));
    return checks;
  }

  async checkRepo(settings) {
    const res = [];
    if (settings.mode === "LLM_Evaluator" && settings.repo_path) {
      const exists = await FileSystem.pathExists(settings.repo_path);
      res.push(exists ? { ok: true } : { ok: false, message: `repo_path '${settings.repo_path}' not found` });
    }
    if (settings.repo_url) {
      // Quick permission/URL check
      const ls = await GitManager.remoteBranchExists(settings.repo_url, settings.branch || "main");
      if (!ls) {
        res.push({ ok: false, message: `Cannot verify branch '${settings.branch}' at repo_url. Ensure access and that the branch exists.` });
      } else {
        this.logger.info(`Verified branch '${settings.branch}' exists at remote.`);
        res.push({ ok: true });
      }
    }
    // Mode/metrics sanity
    if (settings.mode === "LLM_Evaluator" && (settings.metrics || []).includes("ast_similarity")) {
      res.push({ ok: false, message: "ast_similarity metric only applies to PR_Recreate mode" });
    }
    return res;
  }

  async checkLLMConnectivity(settings) {
    const needsLLM = (settings.metrics || []).some(m => [
      "completeness","technical_correctness","functional_correctness","clarity","instruction_adherence"
    ].includes(m));
    if (!needsLLM) return [];
    const provider = process.env.LLM_PROVIDER;
    const key = process.env.LLM_API_KEY;
    if (!provider || !key) {
      return [{ ok: false, message: "LLM_PROVIDER and LLM_API_KEY env vars are required for LLM-assessed metrics" }];
    }
    this.logger.info(`LLM provider configured: ${provider}`);
    return [{ ok: true }];
  }

  _semverSatisfies(v, range) {
    // supports only ">=x.y.z"
    const m = range.match(/>=\s*(\d+\.\d+\.\d+)/);
    if (!m) return true;
    const req = m[1];
    const a = v.split(".").map(n => parseInt(n, 10));
    const b = req.split(".").map(n => parseInt(n, 10));
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return true;
  }

  async checkTreeSitterGrammars() {
    const grammarDir = "grammars";
    const requiredGrammars = [
      'tree-sitter-javascript.wasm',
      'tree-sitter-typescript.wasm',
      'tree-sitter-python.wasm'
    ];

    try {
      const exists = await FileSystem.pathExists(grammarDir);
      if (!exists) {
        return {
          ok: true,
          warn: true,
          message: "Tree-sitter grammar directory not found. AST similarity will use text-based comparison."
        };
      }

      const missingGrammars = [];
      for (const grammar of requiredGrammars) {
        const grammarPath = `${grammarDir}/${grammar}`;
        const grammarExists = await FileSystem.pathExists(grammarPath);
        if (!grammarExists) {
          missingGrammars.push(grammar);
        }
      }

      if (missingGrammars.length > 0) {
        return {
          ok: true,
          warn: true,
          message: `Missing tree-sitter grammars: ${missingGrammars.join(', ')}. AST similarity will use text-based comparison for these languages.`
        };
      }

      return {
        ok: true,
        message: "Tree-sitter grammars available for JavaScript, TypeScript, and Python"
      };
    } catch (error) {
      return {
        ok: true,
        warn: true,
        message: `Failed to check tree-sitter grammars: ${error.message}`
      };
    }
  }
}

function falsy(v){ return v === undefined || v === null || v === false; }

