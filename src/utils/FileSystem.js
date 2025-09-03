import fs from "fs-extra";
import { run } from "./Process.js";

export const FileSystem = {
  async pathExists(p) {
    return fs.pathExists(p);
  },
  async ensureDir(p) {
    return fs.ensureDir(p);
  },
  async checkDiskSpaceMinGB(minGB = 10) {
    // Try Unix-like using df
    if (process.platform !== "win32") {
      const res = await run("df -k .");
      if (res.ok) {
        const lines = res.stdout.split(/\r?\n/);
        const last = lines[lines.length - 1] || "";
        const parts = last.trim().split(/\s+/);
        const availKB = parseInt(parts[3] || "0", 10);
        const availGB = availKB / (1024 * 1024);
        return { ok: availGB >= minGB, availableGB: Number(availGB.toFixed(2)) };
      }
    }
    // Windows fallback via PowerShell
    const ps = await run('powershell -NoProfile -Command "(Get-PSDrive -Name C).Free/1GB"');
    if (ps.ok && ps.stdout) {
      const availGB = parseFloat(ps.stdout);
      if (!Number.isNaN(availGB)) return { ok: availGB >= minGB, availableGB: Number(availGB.toFixed(2)) };
    }
    return { ok: false, availableGB: null, error: "Unable to determine disk space" };
  }
};

