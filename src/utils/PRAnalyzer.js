import simpleGit from "simple-git";
import fs from "fs-extra";

export class PRAnalyzer {
  constructor(logger) {
    this.logger = logger;
  }

  async findRecentMergedPRs(repoDir, numPRs = 5) {
    this.logger.info(`Searching for ${numPRs} recent merged PRs with ≥2 files changed (examining last 12 months)`);

    const git = simpleGit({ baseDir: repoDir });

    // Get merge commits from the last 12 months (reasonable window for finding eligible PRs)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 12);
    const sinceDate = sixMonthsAgo.toISOString().split('T')[0];

    // Find ALL commits that could be merged PRs (including squash/rebase merges)
    const logCommand = [
      'log',
      '--first-parent',
      `--since=${sinceDate}`,
      '--pretty=format:%H|%P|%s|%an|%ae|%ad',
      '--date=iso'
      // No -n limit: get ALL commits in time window to find PR-related commits
    ];

    const logResult = await git.raw(logCommand);
    const commits = this.parseCommitsForPRs(logResult);

    this.logger.info(`Found ${commits.length} total merged PRs to examine`);

    // Extract PR information for all commits and filter by file count
    const allPRs = [];
    const eligiblePRs = [];

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      try {
        const prInfo = await this.extractPRInfo(git, commit, i + 1);
        if (prInfo) {
          allPRs.push(prInfo);

          // Count unique files changed (A/M/R/C/D statuses)
          const filesChangedCount = prInfo.fileChanges.length;

          // Filter: only include PRs with ≥2 files changed
          if (filesChangedCount >= 2) {
            eligiblePRs.push({
              ...prInfo,
              filesChangedCount
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to extract PR info for commit ${commit.hash}: ${error.message}`);
      }
    }

    this.logger.info(`Found ${eligiblePRs.length} eligible PRs with ≥2 files changed`);

    // Handle edge cases
    if (eligiblePRs.length === 0) {
      this.logger.error(`No PRs found with ≥2 files changed in the last 12 months. Examined ${allPRs.length} total PRs. Consider adjusting num_prs or expanding the time window.`);
      throw new Error("No eligible PRs found with minimum file change threshold");
    }

    // If we don't have enough eligible PRs, suggest expanding the search
    if (eligiblePRs.length < numPRs) {
      this.logger.warn(`Found only ${eligiblePRs.length} eligible PRs in the last 12 months, but ${numPRs} requested. Consider reducing num_prs or the repository may have fewer substantial PRs.`);
    }

    // Sort eligible PRs by merge date descending (most recent first) for selection
    eligiblePRs.sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt));

    // Select the first N eligible PRs (most recent)
    const selectedPRs = eligiblePRs.slice(0, numPRs);

    if (selectedPRs.length < numPRs) {
      this.logger.warn(`Requested ${numPRs} PRs but only found ${selectedPRs.length} eligible PRs with ≥2 files changed`);
    }

    // Log selected PRs summary
    this.logger.info(`Selected PRs:`);
    selectedPRs.forEach(pr => {
      this.logger.info(`  PR #${pr.number}: ${pr.filesChangedCount} files changed`);
    });

    // Sort selected PRs chronologically (oldest first) for execution order
    selectedPRs.sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));

    this.logger.info(`Successfully selected ${selectedPRs.length} PRs for execution (oldest-to-newest order)`);
    return selectedPRs;
  }

  parseCommitsForPRs(logOutput) {
    if (!logOutput.trim()) return [];

    const allCommits = logOutput.trim().split('\n').map(line => {
      const [hash, parents, subject, authorName, authorEmail, date] = line.split('|');
      return {
        hash,
        parents: parents.split(' '),
        subject,
        authorName,
        authorEmail,
        date: new Date(date)
      };
    });

    // Filter for commits that look like merged PRs
    return allCommits.filter(commit => {
      const subject = commit.subject.toLowerCase();

      // Traditional merge commits (multiple parents)
      if (commit.parents.length > 1) {
        return true;
      }

      // Squash/rebase merges often have PR references in commit messages
      const prPatterns = [
        /merge pull request #\d+/i,
        /\(#\d+\)/,                    // PR number in parentheses
        /#\d+/,                       // PR number with hash
        /pull request #?\d+/i,
        /pr #?\d+/i,                  // "PR 123" or "PR #123"
        /closes? #\d+/i,              // "closes #123"
        /fixes? #\d+/i,               // "fixes #123"
        /resolves? #\d+/i             // "resolves #123"
      ];

      return prPatterns.some(pattern => pattern.test(subject));
    });
  }

  parseMergeCommits(logOutput) {
    if (!logOutput.trim()) return [];
    
    return logOutput.trim().split('\n').map(line => {
      const [hash, parents, subject, authorName, authorEmail, date] = line.split('|');
      const parentHashes = parents.split(' ');
      
      return {
        hash,
        parents: parentHashes,
        subject,
        authorName,
        authorEmail,
        date: new Date(date)
      };
    }).filter(commit => commit.parents.length >= 2); // Ensure it's a merge commit
  }

  async extractPRInfo(git, commit, order) {
    // Extract PR number from commit message
    const prNumber = this.extractPRNumber(commit.subject);

    // Get commit body for description
    const showResult = await git.show([commit.hash, '--pretty=format:%B', '--no-patch']);
    const commitBody = showResult.trim();

    // Extract description (everything after the first line)
    const lines = commitBody.split('\n');
    const description = lines.slice(1).join('\n').trim() || commit.subject;

    // Get file changes in the PR
    let fileChanges;
    let mainParent, prParent;

    if (commit.parents.length > 1) {
      // Traditional merge commit
      mainParent = commit.parents[0]; // First parent is main branch
      prParent = commit.parents[1];   // Second parent is PR branch
      fileChanges = await this.getPRFileChanges(git, mainParent, prParent);
    } else {
      // Squash/rebase merge - compare with parent commit
      mainParent = commit.parents[0];
      prParent = commit.hash;
      fileChanges = await this.getPRFileChanges(git, mainParent, commit.hash);
    }
    
    return {
      number: prNumber,
      order,
      title: this.extractPRTitle(commit.subject),
      description: this.cleanDescription(description),
      mergedAt: commit.date.toISOString(),
      author: {
        name: commit.authorName,
        email: commit.authorEmail
      },
      commits: {
        merge: commit.hash,
        main: mainParent,
        pr: prParent
      },
      fileChanges
    };
  }

  extractPRNumber(subject) {
    // Try to extract PR number from various formats
    const patterns = [
      /Merge pull request #(\d+)/,
      /\(#(\d+)\)/,
      /#(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = subject.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    // Fallback: use timestamp-based number
    return Date.now() % 100000;
  }

  extractPRTitle(subject) {
    // Remove merge commit prefixes and PR numbers
    return subject
      .replace(/^Merge pull request #\d+\s+from\s+[^\s]+\s*/, '')
      .replace(/\s*\(#\d+\)$/, '')
      .trim() || subject;
  }

  cleanDescription(description) {
    // Remove merge commit artifacts and clean up description
    return description
      .replace(/^Merge pull request #\d+\s+from\s+[^\s]+\s*\n?/, '')
      .replace(/^\s*\n+/, '')
      .trim()
      .substring(0, 500); // Limit length
  }

  async getPRFileChanges(git, mainParent, prParent) {
    try {
      // Get diff between main parent and PR parent to see what changed
      const diffResult = await git.raw(['diff', '--name-status', mainParent, prParent]);
      
      if (!diffResult.trim()) return [];
      
      return diffResult.trim().split('\n').map(line => {
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t'); // Handle paths with tabs
        
        return {
          status: this.mapGitStatus(status),
          path: path.trim()
        };
      });
    } catch (error) {
      this.logger.warn(`Failed to get file changes: ${error.message}`);
      return [];
    }
  }

  mapGitStatus(gitStatus) {
    const statusMap = {
      'A': 'added',
      'M': 'modified', 
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied'
    };
    
    return statusMap[gitStatus[0]] || 'modified';
  }

  async getPRCodeChanges(git, mainParent, prParent) {
    try {
      // Get actual code diff
      const diffResult = await git.raw(['diff', mainParent, prParent]);
      return diffResult;
    } catch (error) {
      this.logger.warn(`Failed to get code changes: ${error.message}`);
      return '';
    }
  }
}
