import { BaseMetric } from "./BaseMetric.js";
import { run } from "../utils/Process.js";

export class DiffMetric extends BaseMetric {
  constructor() { super("diff_metrics"); }
  async measure(context) {
    const cwd = context?.cwd;
    if (!cwd) return this._zero();
    // Use git if available
    const status = await run("git rev-parse --is-inside-work-tree", { cwd });
    if (!status.ok || !/true/.test(status.stdout)) return this._zero();

    // Get tracked changes
    const nameStatus = await run("git diff --name-status", { cwd });
    const numstat = await run("git diff --numstat", { cwd });

    // Get untracked files
    const untrackedFiles = await run("git ls-files --others --exclude-standard", { cwd });

    const counts = { files_added: 0, files_modified: 0, files_deleted: 0 };

    // Process tracked changes
    if (nameStatus.ok) {
      const lines = nameStatus.stdout.split(/\r?\n/).filter(Boolean);
      for (const l of lines) {
        const code = l.trim().split(/\s+/)[0];
        if (code.startsWith("A")) counts.files_added++;
        else if (code.startsWith("M")) counts.files_modified++;
        else if (code.startsWith("D")) counts.files_deleted++;
      }
    }

    // Add untracked files as "added" files
    if (untrackedFiles.ok) {
      const untrackedLines = untrackedFiles.stdout.split(/\r?\n/).filter(Boolean);
      counts.files_added += untrackedLines.length;
    }

    let lines_added = 0, lines_deleted = 0;
    if (numstat.ok) {
      const lines = numstat.stdout.split(/\r?\n/).filter(Boolean);
      for (const l of lines) {
        const [a, d] = l.trim().split(/\s+/);
        // Skip binary files (git shows "-" for binary files)
        if (a === "-" || d === "-") continue;
        const ai = parseInt(a, 10); const di = parseInt(d, 10);
        if (!Number.isNaN(ai)) lines_added += ai;
        if (!Number.isNaN(di)) lines_deleted += di;
      }
    }

    return { ...counts, lines_added, lines_modified: 0, lines_deleted };
  }
  _zero(){ return { files_added:0, files_modified:0, files_deleted:0, lines_added:0, lines_modified:0, lines_deleted:0 }; }
}

