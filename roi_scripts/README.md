# ROI Scripts: Quick PR/MR ROI Metrics (GitHub + GitLab)

Customer-focused tools to quickly quantify ROI from engineering automation. Each script compares “before automation” vs “after automation” over equal time windows and outputs a clear console report plus a JSON file you can share.

- GitHub: github_pr_metrics.py
- GitLab: gitlab_mr_metrics.py

## What they measure (both scripts)
For each period (beforeAuto, afterAuto):
- PRs/MRs created per week and merged per week
- Average comments per PR/MR
- Average time to merge (hours and days)
- Average time to first comment (hours) - GitHub only
- Average time from first comment to follow-up commit (hours) - GitHub only
- Number of unique contributors including reviewers and developers - GitHub only
- Side-by-side comparison with % change

## Prerequisites
- Python 3.8+
- pip install requests
- Access token with read permissions to your repo/project

Tip: You can run end-to-end in 2–3 minutes. Just set your token, project/repo, and automation date.

---

## GitHub: github_pr_metrics.py
### 1) Quick setup
Edit the config block at the top of the file:
- GITHUB_TOKEN: Your GitHub Personal Access Token
- REPO_NAME: owner/repo (e.g., myorg/myrepo)
- WEEKS_BACK: Weeks in each comparison window (default 2)
- AUTOMATED_DATE: When automation went live, ISO 8601 (e.g., 2024-06-15T00:00:00Z). Empty = now
- BRANCH: Base branch to analyze ('' = all branches)

Example values:
- REPO_NAME='myorg/myrepo'
- AUTOMATED_DATE='2024-06-15T00:00:00Z'
- BRANCH='main'

### 2) Run
- pip install requests
- python github_pr_metrics.py

### 3) Expected output
- Console summary for both periods and % deltas
- JSON saved as github_pr_metrics_comparative_{owner_repo}_{timestamp}.json with keys like:
<augment_code_snippet mode="EXCERPT">
````json
{
  "beforeAuto_prs_created_per_week": 4.0,
  "afterAuto_prs_created_per_week": 6.0,
  "beforeAuto_average_time_to_first_comment_hours": 12.5,
  "afterAuto_average_time_to_first_comment_hours": 8.2,
  "beforeAuto_average_time_from_first_comment_to_followup_commit_hours": 24.0,
  "afterAuto_average_time_from_first_comment_to_followup_commit_hours": 18.5,
  "beforeAuto_unique_contributors_count": 15,
  "afterAuto_unique_contributors_count": 22,
  "automation_date": "2024-06-15T00:00:00Z"
}
````
</augment_code_snippet>

### 4) Key parameters
- GITHUB_TOKEN: token with repo read access
- REPO_NAME: 'owner/repo'
- WEEKS_BACK: integer weeks per period
- AUTOMATED_DATE: 'YYYY-MM-DDTHH:MM:SSZ'
- BRANCH: '' (all) or branch name (e.g., 'main')

### 5) New GitHub-specific metrics (added in latest version)
The GitHub script now includes three additional metrics for deeper ROI analysis:

**Average Time to First Comment (hours)**
- Measures elapsed time from PR creation to first reviewer feedback
- Includes reviews, review comments, and issue-style PR comments
- Excludes comments by PR author and bot accounts
- PRs with no qualifying comments are excluded from the average

**Average Time from First Comment to Follow-up Commit (hours)**
- Measures elapsed time from first reviewer comment to next commit by PR author
- Only counts commits authored by the PR author after the first comment
- PRs with no follow-up commits are excluded from the average

**Unique Contributors Count**
- Counts unique human participants across all PRs in the period
- Includes PR authors, commit authors, reviewers, and commenters
- Excludes bot accounts (login ending with "[bot]" or type "Bot")
- Provides insight into team engagement and collaboration

Notes
- Branch filter is optional; empty analyzes all branches.
- Script handles rate limits and transient network issues gracefully.
- New metrics use UTC timestamps and round to 2 decimal places.

---

## GitLab: gitlab_mr_metrics.py
### 1) Quick setup
Edit the config block at the top of the file:
- GITLAB_TOKEN: GitLab token (scope: api or read_api)
- PROJECT_ID: Numeric ID or URL-encoded path (e.g., group%2Fproject)
- WEEKS_BACK: Weeks in each comparison window (default 2)
- AUTOMATED_DATE: ISO 8601 (e.g., 2024-06-15T00:00:00Z). Empty = now
- BRANCH: Target branch filter ('' = all)
- GITLAB_BASE_URL_CONFIG: For self-managed (e.g., https://gitlab.company.com). Empty = https://gitlab.com
- Optional SSL envs for self-managed:
  - GITLAB_VERIFY_SSL=0 to skip verification (dev/test only)
  - GITLAB_CA_BUNDLE=/path/to/ca.pem

Example values:
- PROJECT_ID='group%2Fapp'
- AUTOMATED_DATE='2024-06-15T00:00:00Z'
- BRANCH='main'
- GITLAB_BASE_URL_CONFIG='https://gitlab.company.com'

### 2) Run
- pip install requests
- python gitlab_mr_metrics.py

### 3) Expected output
- Console summary for both periods and % deltas
- JSON saved as gitlab_mr_metrics_comparative_{project}_{timestamp}.json with keys like:
<augment_code_snippet mode="EXCERPT">
````json
{
  "beforeAuto_mrs_created_per_week": 5.0,
  "afterAuto_mrs_created_per_week": 7.5,
  "branch_analyzed": "main"
}
````
</augment_code_snippet>

### 4) Key parameters
- GITLAB_TOKEN: token with project read access
- PROJECT_ID: number or URL-encoded full path
- WEEKS_BACK: integer weeks per period
- AUTOMATED_DATE: 'YYYY-MM-DDTHH:MM:SSZ'
- BRANCH: '' (all) or branch name
- GITLAB_BASE_URL_CONFIG: base URL for self-managed; defaults to SaaS

Notes
- Works with GitLab SaaS and self-managed. For self-signed certs, use SSL envs above.
- The script automatically paginates and retries on transient errors.

---

## How the comparison windows work
- beforeAuto: WEEKS_BACK weeks ending 1 week before AUTOMATED_DATE
- afterAuto: WEEKS_BACK weeks starting at AUTOMATED_DATE
This leaves a 1-week buffer around your go-live for a fair comparison.

## Troubleshooting (both)
- “Please replace token/repo/project…”: Update the config block values
- 403/401: Check token scopes and access
- Empty results: Confirm date ranges, branch filter, and activity during the window
- Rate limit: Scripts will wait/retry automatically
