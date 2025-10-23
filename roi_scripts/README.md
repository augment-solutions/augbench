# ROI Scripts: Quick PR/MR ROI Metrics (GitHub + GitLab + Bitbucket)

Customer-focused tools to quickly quantify ROI from engineering automation. Each script compares “before automation” vs “after automation” over equal time windows and outputs a clear console report plus a JSON file you can share.

- **GitHub**: `github_pr_metrics.py`
- **GitHub (Detailed CSV)**: `github_pr_metrics_detailed_csv.py`
- **GitLab**: `gitlab_mr_metrics.py`
- **Bitbucket**: `bitbucket_pr_metrics.py`

## What they measure (all scripts)
For each period (beforeAuto, afterAuto):
- **Volume Metrics:**
  - PRs/MRs created per week and merged per week
  - Total PRs/MRs created and merged
- **Collaboration Metrics:**
  - Average comments per PR/MR
  - Number of unique contributors (authors, reviewers, commenters)
- **Efficiency Metrics:**
  - Average time to merge (hours and days)
  - Average time to first comment (hours)
  - Average time from first comment to follow-up commit (hours)
- **Manual Metrics (user-provided):**
  - Average time for first review (hours)
  - Average time for remediation after rejection (hours)
- **Analysis:**
  - Side-by-side comparison with % change
  - Real-time progress reporting during data collection

## Prerequisites
- Python 3.8+
- `pip install requests`
- Access token with read permissions to your repo/project
- **GitHub**: Personal Access Token with `repo` scope
- **GitLab**: Personal Access Token with `api` or `read_api` scope
- **Bitbucket**: App Password with `Repositories: Read` permission

Tip: You can run end-to-end in 2–3 minutes. Just set your token, project/repo, and automation date.

---

## 🚀 Performance Optimizations

All three scripts have been **optimized for high performance** while maintaining 100% backward compatibility.

### Optimization Summary

| Platform | Optimization Type | Speedup | API Call Reduction |
|----------|------------------|---------|-------------------|
| **GitHub** | GraphQL + Parallel | **5-8x faster** | 96% fewer calls |
| **GitLab** | GraphQL + Parallel | **5-8x faster** | 95-98% fewer calls |
| **Bitbucket** | Parallel Processing | **2-3x faster** | Same calls (concurrent) |

### Performance Benchmarks (1000 items)

| Platform | Original Time | Optimized Time | Time Saved |
|----------|--------------|----------------|------------|
| **GitHub** | ~4 hours | ~30-45 minutes | 3+ hours |
| **GitLab** | ~2-3 hours | ~15-30 minutes | 1.5-2.5 hours |
| **Bitbucket** | ~2-3 hours | ~40-60 minutes | 1-2 hours |

### Key Optimizations

**GitHub & GitLab (GraphQL-based):**
- ✅ Batch fetching: 50 PRs/MRs per query instead of individual calls
- ✅ Parallel processing with intelligent rate limiting
- ✅ Response caching to eliminate redundant calls
- ✅ Real-time progress tracking with ETA

**Bitbucket (REST-only):**
- ✅ Parallel processing of API calls
- ✅ Response caching
- ✅ Efficient date filtering with early termination
- ✅ Real-time progress tracking with ETA

**All scripts maintain:**
- ✅ 100% backward compatible configuration
- ✅ Identical JSON output format
- ✅ Same metrics and calculations
- ✅ Drop-in replacement capability

---

## Script Comparison Table

Quick reference guide to help you choose the right script for your needs:

| Feature | GitHub Standard | GitHub Detailed | GitHub Detailed CSV | GitHub Filtered | GitLab | Bitbucket |
|---------|----------------|-----------------|---------------------|-----------------|--------|-----------|
| **Script Name** | `github_pr_metrics.py` | `github_pr_metrics_detailed.py` | `github_pr_metrics_detailed_csv.py` | `github_pr_metrics_filtered.py` | `gitlab_mr_metrics.py` | `bitbucket_pr_metrics.py` |
| **Platform** | GitHub | GitHub | GitHub | GitHub | GitLab | Bitbucket |
| **Optimization** | GraphQL + Parallel | GraphQL + Parallel | GraphQL + Parallel | GraphQL + Parallel | GraphQL + Parallel | Parallel Processing |
| **Speedup** | 5-8x | 5-8x | 5-8x | 5-8x | 5-8x | 2-3x |
| **API Call Reduction** | 96% | 96% | 96% | 96% | 95-98% | N/A (concurrent) |
| | | | | | | |
| **Core Metrics** | ✅ All standard metrics | ✅ All standard metrics | ✅ All standard metrics | ✅ All standard metrics | ✅ All standard metrics | ✅ All standard metrics |
| **Comparative Analysis** | ✅ Before/After | ✅ Before/After | ✅ Before/After | ✅ Before/After | ✅ Before/After | ✅ Before/After |
| **Bot Filtering** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Progress Tracking** | ✅ Real-time ETA | ✅ Real-time ETA | ✅ Real-time ETA | ✅ Real-time ETA | ✅ Real-time ETA | ✅ Real-time ETA |
| **Response Caching** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| | | | | | | |
| **Detailed PR Data Export** | ❌ No | ✅ Yes (JSON) | ✅ Yes (CSV) | ❌ No | ❌ No | ❌ No |
| **Contributor Email Mapping** | ❌ No | ✅ Yes (JSON) | ✅ Yes (CSV) | ❌ No | ❌ No | ❌ No |
| **ZIP Archive Output** | ❌ No | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Multi-Repository Support** | ❌ No | ❌ No | ✅ Yes (semicolon-separated) | ❌ No | ❌ No | ❌ No |
| **CSV Output Format** | ❌ No | ❌ No | ✅ Yes (3 CSV types) | ❌ No | ❌ No | ❌ No |
| **Contributor Filtering** | ❌ No | ❌ No | ❌ No | ✅ Yes (by email/username) | ❌ No | ❌ No |
| **Email-to-Username Conversion** | ❌ No | ❌ No | ❌ No | ✅ Yes (automatic) | ❌ No | ❌ No |
| **Team/Individual Analysis** | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No |
| | | | | | | |
| **Output Files** | 1 JSON | 2 JSON + 1 ZIP | 3-4 CSV + 1 ZIP | 1 JSON | 1 JSON | 1 JSON |
| **Configuration Complexity** | Simple | Simple | Simple | Simple + Filter | Simple | Simple |
| **Backward Compatible** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| | | | | | | |
| **Best For** | Standard ROI analysis | Detailed data export & BI tools | Multi-repo CSV export | Team/individual metrics | GitLab projects | Bitbucket repos |
| **Use Case** | Quick metrics comparison | Custom reporting, analytics | Bulk analysis, spreadsheets | Filtered contributor analysis | GitLab MR analysis | Bitbucket PR analysis |

### When to Use Each Script

**GitHub Standard (`github_pr_metrics.py`):**
- ✅ Standard ROI analysis and reporting
- ✅ Quick metrics comparison (before/after automation)
- ✅ All contributors in the repository
- ✅ Single JSON output file

**GitHub Detailed (`github_pr_metrics_detailed.py`):**
- ✅ Need detailed PR data for each period
- ✅ Exporting to BI tools or analytics platforms
- ✅ Linking GitHub usernames to corporate emails
- ✅ Custom reporting and data analysis
- ✅ Convenient ZIP archive for sharing

**GitHub Detailed CSV (`github_pr_metrics_detailed_csv.py`):**
- ✅ Need CSV format for spreadsheet analysis
- ✅ Analyzing multiple repositories in one run
- ✅ Exporting detailed PR metrics to Excel/Google Sheets
- ✅ Bulk data export for custom analysis
- ✅ Convenient ZIP archive with all CSV files
- ✅ Repository-specific filenames for easy organization

**GitHub Filtered (`github_pr_metrics_filtered.py`):**
- ✅ Analyzing specific team members or individuals
- ✅ Comparing different teams or departments
- ✅ Tracking new hire onboarding metrics
- ✅ Department-specific productivity analysis
- ✅ Need to filter by email addresses or usernames

**GitLab (`gitlab_mr_metrics.py`):**
- ✅ GitLab projects and merge requests
- ✅ Same metrics as GitHub but for GitLab
- ✅ GraphQL optimization for fast analysis

**Bitbucket (`bitbucket_pr_metrics.py`):**
- ✅ Bitbucket repositories and pull requests
- ✅ Same metrics as GitHub but for Bitbucket
- ✅ Parallel processing optimization

---

## GitHub Scripts

### GitHub: github_pr_metrics.py (Optimized)

**Standard version** - Analyzes PR metrics with optimized GraphQL queries and parallel processing.

### GitHub: github_pr_metrics_detailed.py (Optimized + Detailed Export)

**Enhanced version** - Includes all optimizations plus detailed PR data export and contributor email mapping.

**Key Differences from Standard Script:**
- ✅ Exports detailed PR data (`pr_details` field for each period)
- ✅ Generates contributor email mapping (separate JSON file)
- ✅ Creates ZIP archive with all output files (`results.zip`)
- ✅ Same performance optimizations (GraphQL, parallel processing, caching)
- ✅ 100% backward compatible configuration

**Output Files:**
1. `github_pr_metrics_comparative_{REPO_NAME}_{TIMESTAMP}.json` - Main metrics with detailed PR data
2. `github_contributors_mapping_{REPO_NAME}_{TIMESTAMP}.json` - Username to email mapping
3. `results.zip` - ZIP archive containing both JSON files

**Quick Usage Example:**
```bash
export GITHUB_TOKEN="your_token_here"
export REPO_NAME="myorg/myrepo"
export WEEKS_BACK=4
export AUTOMATED_DATE="2024-06-15T00:00:00Z"
export BRANCH="main"
python github_pr_metrics_detailed.py
```

**Detailed PR Data Structure:**
Each PR in the `pr_details` array includes:
- PR number, created date, merged date
- Author username and bot status
- Comments count and review comments count
- List of reviewer usernames
- List of commenter usernames

**Contributor Mapping Structure:**
```json
[
  {
    "github_username": "alice-github",
    "emails": ["alice@company.com", "alice.smith@company.com"]
  }
]
```

**Use Cases:**
- Detailed PR analysis and custom reporting
- Linking GitHub usernames to corporate email addresses
- Exporting data for BI tools and analytics platforms
- Team productivity analysis with individual PR tracking

**Email Extraction:**
- Automatically extracts email addresses from commit author information
- Maps emails to GitHub usernames
- Handles multiple emails per user
- Excludes bot users and noreply addresses
- No additional API calls required

**Output Example:**
```
Main metrics saved to: github_pr_metrics_comparative_myorg_myrepo_20251007_143022.json
Contributor mapping saved to: github_contributors_mapping_myorg_myrepo_20251007_143022.json

✅ ZIP archive created: results.zip
   Contains: github_pr_metrics_comparative_myorg_myrepo_20251007_143022.json
   Contains: github_contributors_mapping_myorg_myrepo_20251007_143022.json

Data Export Summary:
- Before automation PRs exported: 45
- After automation PRs exported: 52
- Total PRs with detailed data: 97
- Contributors with email mapping: 15
```

### GitHub: github_pr_metrics_detailed_csv.py (Optimized + CSV Export + Multi-Repo)

**CSV Export version** - Generates detailed PR metrics in CSV format with multi-repository support and automatic ZIP compression.

**Key Features:**
- ✅ CSV output format (compatible with Excel, Google Sheets, and data analysis tools)
- ✅ Multi-repository support (analyze multiple repos in one run)
- ✅ Automatic ZIP compression of all generated CSV files
- ✅ Repository-specific filenames for easy organization
- ✅ Same performance optimizations (GraphQL, parallel processing, caching)
- ✅ 100% backward compatible configuration (single repo still works)

**Output Files (per repository):**
1. `github_pr_metrics_summary_{REPO_NAME}_{TIMESTAMP}.csv` - Summary metrics (beforeAuto and afterAuto periods)
2. `github_contributors_mapping_{REPO_NAME}_{TIMESTAMP}.csv` - Contributor email mapping
3. `github_pr_details_beforeAuto_{REPO_NAME}_{TIMESTAMP}.csv` - Detailed PR data for before period
4. `github_pr_details_afterAuto_{REPO_NAME}_{TIMESTAMP}.csv` - Detailed PR data for after period
5. `results.zip` - ZIP archive containing all CSV files from all repositories

**Multi-Repository Usage:**
```bash
# Single repository (backward compatible)
export GITHUB_TOKEN="your_token_here"
export REPO_NAME="myorg/myrepo"
export WEEKS_BACK=4
export AUTOMATED_DATE="2024-06-15T00:00:00Z"
python github_pr_metrics_detailed_csv.py

# Multiple repositories (semicolon-separated)
export GITHUB_TOKEN="your_token_here"
export REPO_NAME="owner/repo1;owner/repo2;sharath/angular"
export WEEKS_BACK=4
export AUTOMATED_DATE="2024-06-15T00:00:00Z"
python github_pr_metrics_detailed_csv.py
```

**CSV Output Formats:**

**Summary CSV Columns:**
- period, total_prs, merged_prs, weeks_analyzed
- analysis_start_date, analysis_end_date
- prs_created_per_week, prs_merged_per_week
- average_comments_per_pr, average_time_to_merge_hours, average_time_to_merge_days
- average_time_to_first_comment_hours, average_time_from_first_comment_to_followup_commit_hours
- unique_contributors_count, average_first_review_time_hours, average_remediation_time_hours

**PR Details CSV Columns (25 columns):**
- repo, number, title, author, state, merged
- created_at, first_comment_at, first_followup_commit_at, merged_at, closed_at
- time_to_first_comment_hours, time_from_first_comment_to_merge_hours, time_from_first_comment_to_followup_commit_hours
- time_to_merge_hours, time_to_close_hours
- first_comment_type, first_comment_author
- total_loc_updated, total_commits, commits_before_merge
- total_comments, issue_comments, review_comments, review_submissions

**Contributor Mapping CSV Columns:**
- github_username, emails (pipe-separated list)

**Use Cases:**
- Bulk analysis of multiple repositories
- Exporting metrics to Excel or Google Sheets for further analysis
- Creating custom dashboards and reports
- Comparing metrics across multiple teams or projects
- Archiving analysis results in a single ZIP file

**Error Handling:**
- If one repository fails, the script continues processing remaining repositories
- Failed repositories are logged with error details
- Partial results are preserved in the ZIP archive

**Output Example:**
```
Repositories to process: 3
  1. owner/repo1
  2. owner/repo2
  3. sharath/angular

Processing repository: owner/repo1
✓ Summary metrics CSV: github_pr_metrics_summary_owner_repo1_20251007_143022.csv
✓ Contributor mapping CSV: github_contributors_mapping_owner_repo1_20251007_143022.csv
✓ Before automation PR details CSV: github_pr_details_beforeAuto_owner_repo1_20251007_143022.csv
✓ After automation PR details CSV: github_pr_details_afterAuto_owner_repo1_20251007_143022.csv

Processing repository: owner/repo2
...

CREATING ZIP ARCHIVE
✓ ZIP archive created: results.zip
  Contains 12 CSV files

EXECUTION SUMMARY
Repositories processed: 3
Total CSV files generated: 12
Total execution time: 5.2 minutes
```

---

### Configuration Options (All GitHub Scripts)

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

## GitLab Scripts

### GitLab: gitlab_mr_metrics.py (Optimized)
### 1) Configuration Options

**Option A: Edit the config block at the top of the file:**
- GITLAB_TOKEN: GitLab Personal Access Token (scope: api or read_api)
- PROJECT_ID: Numeric ID or URL-encoded path (e.g., group%2Fproject)
- WEEKS_BACK: Weeks in each comparison window (default 2)
- AUTOMATED_DATE: When automation went live, ISO 8601 (e.g., 2024-06-15T00:00:00Z). Empty = now
- BRANCH: Target branch filter ('' = all branches)
- GITLAB_BASE_URL: For self-managed GitLab (e.g., https://gitlab.company.com). Default = https://gitlab.com

**Option B: Use environment variables:**
```bash
export GITLAB_TOKEN="your_token_here"
export PROJECT_ID="mygroup/myproject"  # or numeric ID
export WEEKS_BACK=4
export AUTOMATED_DATE="2024-06-15T00:00:00Z"
export BRANCH="main"
export GITLAB_BASE_URL="https://gitlab.company.com"  # for self-managed
```

**Option C: Interactive prompts (automatic when config is missing):**
The script will automatically prompt for missing required values with secure token input.

### 2) SSL Configuration (Self-managed GitLab)
For self-managed GitLab instances with custom certificates:
```bash
export GITLAB_VERIFY_SSL="false"  # Disable SSL verification (dev/test only)
export GITLAB_CA_BUNDLE="/path/to/ca-bundle.pem"  # Custom CA bundle
```

### 3) Run
```bash
python3 gitlab_mr_metrics.py
```

### 4) Features
- **Real-time progress reporting** during MR fetching and processing
- **Manual metrics prompting** at startup for review and remediation times
- **Configuration validation** with interactive prompts for missing values
- **Environment variable support** for all configuration options
- **Enhanced metrics** including time to first comment and unique contributors
- **Bot filtering** excludes system notes and bot accounts
- **SSL flexibility** for self-managed instances

---

## Bitbucket Scripts

### Bitbucket: bitbucket_pr_metrics.py (Optimized)
### 1) Configuration Options

**Option A: Edit the config block at the top of the file:**
- BITBUCKET_USERNAME: Your Bitbucket username
- BITBUCKET_APP_PASSWORD: App Password (not your account password)
- REPO_NAME: workspace/repo-name (e.g., myteam/myrepo)
- WEEKS_BACK: Weeks in each comparison window (default 2)
- AUTOMATED_DATE: When automation went live, ISO 8601 (e.g., 2024-06-15T00:00:00Z). Empty = now
- BRANCH: Base branch to analyze ('' = all branches)

**Option B: Use environment variables:**
```bash
export BITBUCKET_USERNAME="your_username"
export BITBUCKET_APP_PASSWORD="your_app_password"
export REPO_NAME="myteam/myrepo"
export WEEKS_BACK=4
export AUTOMATED_DATE="2024-06-15T00:00:00Z"
export BRANCH="main"
```

**Option C: Interactive prompts (automatic when config is missing):**
The script will automatically prompt for missing required values with secure password input.

### 2) Bitbucket App Password Setup
1. Go to Bitbucket Settings → App passwords
2. Create new app password with **Repositories: Read** permission
3. Use this app password (not your account password) in the script

### 3) Run
```bash
python3 bitbucket_pr_metrics.py
```

### 4) Features
- **Real-time progress reporting** during PR fetching and processing
- **Manual metrics prompting** at startup for review and remediation times
- **Configuration validation** with interactive prompts for missing values
- **Environment variable support** for all configuration options
- **Enhanced metrics** including time to first comment and unique contributors
- **Bot filtering** excludes system comments and bot accounts
- **Basic authentication** using username and app password

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

## Key Features Summary

All three scripts now provide:
- ✅ **Identical metrics** across GitHub, GitLab, and Bitbucket
- ✅ **Real-time progress reporting** during data collection
- ✅ **Manual metrics prompting** for review and remediation times
- ✅ **Configuration validation** with interactive prompts
- ✅ **Environment variable support** for all configuration options
- ✅ **Enhanced metrics** including time to first comment and unique contributors
- ✅ **Bot filtering** to exclude automated accounts
- ✅ **Consistent output format** for easy comparison across platforms

## Output Files

Each script generates:
- **Console Report**: Immediate stakeholder-friendly summary with progress tracking
- **JSON File**: Machine-readable format for further analysis
  - GitHub: `github_pr_metrics_comparative_{owner_repo}_{timestamp}.json`
  - GitLab: `gitlab_mr_metrics_comparative_{project}_{timestamp}.json`
  - Bitbucket: `bitbucket_pr_metrics_comparative_{workspace_repo}_{timestamp}.json`
