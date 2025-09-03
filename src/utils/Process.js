import { exec as _exec } from "child_process";
import { promisify } from "util";

const exec = promisify(_exec);

export async function run(cmd, opts = {}) {
  try {
    const { stdout, stderr } = await exec(cmd, { timeout: opts.timeout || 30000, cwd: opts.cwd });
    return { ok: true, stdout: stdout?.trim() || "", stderr: stderr?.trim() || "" };
  } catch (e) {
    return { ok: false, error: e, stdout: e.stdout?.toString() || "", stderr: e.stderr?.toString() || "" };
  }
}

export async function which(cmd) {
  // cross-platform attempt
  const probe = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
  const res = await run(probe);
  return res.ok && res.stdout ? res.stdout.split(/\r?\n/)[0] : null;
}

