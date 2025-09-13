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
- **Manual metrics (GitHub only):**
  - Average time for first review (hours) - user-provided
  - Average time for remediation after rejection (hours) - user-provided
- Side-by-side comparison with % change

## Prerequisites
- Python 3.8+
- pip install requests
- Access token with read permissions to your repo/project

Tip: You can run end-to-end in 2–3 minutes. Just set your token, project/repo, and automation date.

---

## GitHub: github_pr_metrics.py
### 1) Configuration Options

**Option A: Edit the config block at the top of the file:**
- GITHUB_TOKEN: Your GitHub Personal Access Token
- REPO_NAME: owner/repo (e.g., myorg/myrepo)
- WEEKS_BACK: Weeks in each comparison window (default 2)
- AUTOMATED_DATE: When automation went live, ISO 8601 (e.g., 2024-06-15T00:00:00Z). Empty = now
- BRANCH: Base branch to analyze ('' = all branches)

**Option B: Use environment variables:**
```bash
export GITHUB_TOKEN="your_token_here"
export REPO_NAME="myorg/myrepo"
export WEEKS_BACK=4
export AUTOMATED_DATE="2024-06-15T00:00:00Z"
export BRANCH="main"
```

**Option C: Interactive prompts (automatic when config is missing):**
The script will automatically prompt for missing required values with secure token input.

### 2) Configuration Validation
The script validates all configuration at startup:
- **GITHUB_TOKEN**: Required, non-empty
- **REPO_NAME**: Required, must be in format "owner/repo"
- **WEEKS_BACK**: Must be positive integer (default: 2)
- **AUTOMATED_DATE**: Optional; if provided, must be ISO 8601 format ending with 'Z'
- **BRANCH**: Optional; empty means ALL branches
- **API_BASE_URL**: Must be valid HTTPS URL (default: https://api.github.com)
- **API_VERSION**: Required (default: application/vnd.github.v3+json)

### 3) Run
- pip install requests
- python github_pr_metrics.py

### 4) Manual Metrics Input
The script will prompt for manual metrics at startup:
```
======================================================================
MANUAL METRICS INPUT
======================================================================
Please provide the following metrics based on your team's experience:
(These will be included in both console output and JSON results)

What is the average time taken in hours by a developer for doing a first review of a PR? 2.5
What is the average time taken in hours by a developer to remediate the findings from the code review when a PR is rejected? 4.0

======================================================================
Manual Metrics Summary:
Average first review time: 2.5 hours
Average remediation time: 4.0 hours
======================================================================
```

### 5) Progress Output
The script now shows real-time progress:
```
Fetching PRs for beforeAuto period (2024-01-01T00:00:00Z to 2024-01-15T00:00:00Z)...
  Fetched page 1 (100 items) ... total so far: 100
  Fetched page 2 (45 items) ... total so far: 145
Found 23 PRs for beforeAuto
Processing 23 pull requests for beforeAuto period...
  Processing PRs: 10/23 (period=beforeAuto)
  Processing PRs: 20/23 (period=beforeAuto)
  Processing PRs: 23/23 (period=beforeAuto)
Completed processing 23 PRs for beforeAuto
```

### 6) Expected output
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
  "beforeAuto_average_first_review_time_hours": 2.5,
  "afterAuto_average_first_review_time_hours": 2.5,
  "beforeAuto_average_remediation_time_hours": 4.0,
  "afterAuto_average_remediation_time_hours": 4.0,
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

### 5) GitHub-specific metrics (added in latest version)
The GitHub script now includes five additional metrics for deeper ROI analysis:

**Automated Metrics (calculated from GitHub data):**

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

**Manual Metrics (user-provided at startup):**

**Average First Review Time (hours)**
- User-provided estimate of time developers spend on initial PR reviews
- Prompted at script startup: "What is the average time taken in hours by a developer for doing a first review of a PR?"
- Applied to both beforeAuto and afterAuto periods for comparison

**Average Remediation Time (hours)**
- User-provided estimate of time developers spend fixing issues after code review rejection
- Prompted at script startup: "What is the average time taken in hours by a developer to remediate the findings from the code review when a PR is rejected?"
- Applied to both beforeAuto and afterAuto periods for comparison

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

## Recent Enhancements (GitHub Script)

### Real-time Progress Reporting
The GitHub script now shows detailed progress during execution:
- **PR Fetching**: Shows pages fetched and running totals
- **PR Processing**: Shows progress every 10 PRs with completion status
- **Period Tracking**: Clear separation between beforeAuto and afterAuto periods

### Enhanced Configuration Management
- **Environment Variables**: All config can be set via environment variables
- **Interactive Prompts**: Automatic prompts for missing required values
- **Secure Token Input**: Password-style input for GitHub tokens (no echo)
- **Comprehensive Validation**: Validates all config formats at startup
- **Graceful Fallbacks**: Clear error messages with actionable guidance

### Configuration Validation Rules
- **GITHUB_TOKEN**: Required, non-empty
- **REPO_NAME**: Must be "owner/repo" format
- **WEEKS_BACK**: Must be positive integer
- **AUTOMATED_DATE**: Must be ISO 8601 format ending with 'Z' (if provided)
- **API_BASE_URL**: Must be valid HTTPS URL
- **BRANCH**: Optional (empty = all branches)

### Backward Compatibility
- All existing functionality preserved
- Same JSON output schema and file naming
- Same console report format
- Progress logs are additive (don't interfere with reports)

## Troubleshooting (both)
- “Please replace token/repo/project…”: Update the config block values
- 403/401: Check token scopes and access
- Empty results: Confirm date ranges, branch filter, and activity during the window
- Rate limit: Scripts will wait/retry automatically
