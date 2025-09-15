#!/usr/bin/env python3
"""
Bitbucket PR Metrics Calculator - Comparative Analysis

This script calculates various metrics for Bitbucket pull requests with comparative analysis
before and after automation was added. It generates metrics for two time periods:
- "beforeAuto": Period ending one week before AUTOMATED_DATE, spanning WEEKS_BACK duration
- "afterAuto": Period starting from AUTOMATED_DATE, spanning WEEKS_BACK duration

Metrics calculated for each period:
1. Average number of Pull Requests created per week
2. Average number of Pull Requests merged per week
3. Average number of comments across all Pull Requests in the time period
4. Average time to merge (difference between PR merged and PR created timestamps)
5. Average time to first comment
6. Average time from first comment to follow-up commit
7. Unique contributors count

Usage:
1. Replace YOUR_BITBUCKET_USERNAME and YOUR_BITBUCKET_APP_PASSWORD with your credentials
2. Replace workspace/repo-name with your target repository
3. Adjust WEEKS_BACK as needed (default: 2) - this applies to both before and after periods
4. Set AUTOMATED_DATE to specify when automation was added (format: 'YYYY-MM-DDTHH:MM:SSZ')
   - Leave empty or set to '' to use current time as automation date
5. Optionally set BRANCH to specify which Git branch to analyze
   - Leave empty or set to '' to analyze PRs for ALL branches
   - Set to specific branch name (e.g., 'main', 'develop') to analyze only that branch
6. Run: python bitbucket_pr_metrics.py

Output will contain metrics with prefixes:
- "beforeAuto" for metrics from the period before automation
- "afterAuto" for metrics from the period after automation
"""

import requests
import json
import os
import getpass
import re
from datetime import datetime, timedelta
import time
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urlparse
import base64

# Configuration - Replace these values or set via environment variables
BITBUCKET_USERNAME = os.environ.get('BITBUCKET_USERNAME', '')
BITBUCKET_APP_PASSWORD = os.environ.get('BITBUCKET_APP_PASSWORD', '')
REPO_NAME = os.environ.get('REPO_NAME', '')  # Format: 'workspace/repo-name'
WEEKS_BACK = int(os.environ.get('WEEKS_BACK', '2'))  # Number of weeks to look back
AUTOMATED_DATE = os.environ.get('AUTOMATED_DATE', '')  # Format: 'YYYY-MM-DDTHH:MM:SSZ' or leave empty to use current time
BRANCH = os.environ.get('BRANCH', '')  # Base branch for PRs (leave empty to analyze ALL branches, or specify branch name)

# Bitbucket API configuration
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://api.bitbucket.org/2.0')

# Progress reporting configuration
PROGRESS_INTERVAL = 10  # Show progress every N PRs processed

def prompt_for_manual_metrics() -> Dict[str, float]:
    """
    Prompt user for manual metrics that cannot be automatically calculated
    """
    print("\n" + "="*70)
    print("MANUAL METRICS INPUT")
    print("="*70)
    print("Please provide the following metrics based on your team's experience:")
    print()
    
    metrics = {}
    
    # Average time for first review
    while True:
        try:
            first_review_input = input("What is the average time taken in hours by a developer for doing a first review of a PR? ").strip()
            if first_review_input:
                first_review_hours = float(first_review_input)
                if first_review_hours >= 0:
                    metrics['average_first_review_time_hours'] = round(first_review_hours, 2)
                    break
                else:
                    print("ERROR: Time must be a non-negative number. Please try again.")
            else:
                print("ERROR: This field is required. Please enter a value.")
        except ValueError:
            print("ERROR: Please enter a valid number (e.g., 2.5 for 2.5 hours).")
    
    # Average time for remediation
    while True:
        try:
            remediation_input = input("What is the average time taken in hours by a developer to remediate the findings from the code review when a PR is rejected? ").strip()
            if remediation_input:
                remediation_hours = float(remediation_input)
                if remediation_hours >= 0:
                    metrics['average_remediation_time_hours'] = round(remediation_hours, 2)
                    break
                else:
                    print("ERROR: Time must be a non-negative number. Please try again.")
            else:
                print("ERROR: This field is required. Please enter a value.")
        except ValueError:
            print("ERROR: Please enter a valid number (e.g., 4.0 for 4 hours).")
    
    print("\n" + "="*70)
    print("Manual Metrics Summary:")
    print(f"Average first review time: {metrics['average_first_review_time_hours']} hours")
    print(f"Average remediation time: {metrics['average_remediation_time_hours']} hours")
    print("="*70)
    
    return metrics

def validate_config() -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Validate configuration and return (is_valid, errors, config_dict)
    """
    errors = []
    config = {
        'bitbucket_username': BITBUCKET_USERNAME,
        'bitbucket_app_password': BITBUCKET_APP_PASSWORD,
        'repo_name': REPO_NAME,
        'weeks_back': WEEKS_BACK,
        'automated_date': AUTOMATED_DATE,
        'branch': BRANCH,
        'api_base_url': API_BASE_URL
    }

    # Validate Bitbucket credentials
    if not config['bitbucket_username'] or config['bitbucket_username'] in ['YOUR_BITBUCKET_USERNAME', '']:
        errors.append("Bitbucket username is required")
    
    if not config['bitbucket_app_password'] or config['bitbucket_app_password'] in ['YOUR_BITBUCKET_APP_PASSWORD', '']:
        errors.append("Bitbucket app password is required")

    # Validate repository name format
    if not config['repo_name'] or config['repo_name'] in ['workspace/repo-name', '']:
        errors.append("Repository name is required in format 'workspace/repo-name'")
    elif '/' not in config['repo_name']:
        errors.append("Repository name must be in format 'workspace/repo-name'")

    # Validate weeks back
    try:
        weeks = int(config['weeks_back'])
        if weeks <= 0:
            errors.append("Weeks back must be a positive integer")
    except (ValueError, TypeError):
        errors.append("Weeks back must be a positive integer")

    # Validate automated date format (if provided)
    if config['automated_date']:
        if not config['automated_date'].endswith('Z'):
            errors.append("Automated date must end with 'Z' (e.g., '2024-01-15T10:30:00Z')")
        else:
            try:
                datetime.fromisoformat(config['automated_date'].replace('Z', '+00:00'))
            except ValueError:
                errors.append("Automated date must be in ISO 8601 format: 'YYYY-MM-DDTHH:MM:SSZ'")

    # Validate API base URL
    if not config['api_base_url']:
        errors.append("API base URL is required")
    else:
        parsed = urlparse(config['api_base_url'])
        if parsed.scheme != 'https':
            errors.append("API base URL must use HTTPS")

    return len(errors) == 0, errors, config

def prompt_for_config() -> Optional[Dict[str, Any]]:
    """
    Prompt user for configuration values interactively
    """
    print("\n" + "="*70)
    print("INTERACTIVE CONFIGURATION")
    print("="*70)
    
    # Bitbucket username
    while True:
        username = input("Bitbucket Username: ").strip()
        if username:
            break
        print("ERROR: Bitbucket username is required.")
    
    # Bitbucket app password (secure input)
    app_password = getpass.getpass("Bitbucket App Password: ").strip()
    while not app_password:
        print("ERROR: Bitbucket app password is required.")
        app_password = getpass.getpass("Bitbucket App Password: ").strip()
    
    # Repository name
    while True:
        repo_name = input("Repository name (workspace/repo-name): ").strip()
        if repo_name and '/' in repo_name:
            break
        print("ERROR: Repository name is required in format 'workspace/repo-name'.")
    
    # Weeks back
    while True:
        try:
            weeks_input = input(f"Weeks back for each period (default: {WEEKS_BACK}): ").strip()
            if not weeks_input:
                weeks_back = WEEKS_BACK
            else:
                weeks_back = int(weeks_input)
                if weeks_back <= 0:
                    print("ERROR: Weeks back must be a positive integer.")
                    continue
            break
        except ValueError:
            print("ERROR: Please enter a valid integer.")
    
    # Automated date
    while True:
        automated_date = input("Automation date (YYYY-MM-DDTHH:MM:SSZ, or empty for current time): ").strip()
        if not automated_date:
            break
        if not automated_date.endswith('Z'):
            print("ERROR: Date must end with 'Z'. Example: '2024-01-15T10:30:00Z'")
            continue
        try:
            datetime.fromisoformat(automated_date.replace('Z', '+00:00'))
            break
        except ValueError:
            print("ERROR: Invalid date format. Use 'YYYY-MM-DDTHH:MM:SSZ'")
    
    # Branch
    branch = input("Target branch (empty for all branches): ").strip()
    
    # API base URL
    api_url = input(f"API base URL (default: {API_BASE_URL}): ").strip()
    if not api_url:
        api_url = API_BASE_URL
    
    # Confirmation
    print("\n" + "="*70)
    print("Configuration Summary:")
    print(f"Username: {username}")
    print(f"Repository: {repo_name}")
    print(f"Weeks back: {weeks_back}")
    print(f"Automated date: {automated_date or 'Current time'}")
    print(f"Branch: {branch or 'All branches'}")
    print(f"API URL: {api_url}")
    print("="*70)
    
    confirm = input("Proceed with this configuration? (y/N): ").strip().lower()
    if confirm not in ['y', 'yes']:
        print("Configuration cancelled.")
        return None
    
    return {
        'bitbucket_username': username,
        'bitbucket_app_password': app_password,
        'repo_name': repo_name,
        'weeks_back': weeks_back,
        'automated_date': automated_date,
        'branch': branch,
        'api_base_url': api_url
    }

class BitbucketMetricsCalculator:
    def __init__(self, username: str, app_password: str, repo: str, branch: str = ''):
        self.username = username
        self.app_password = app_password
        self.repo = repo
        self.branch = branch.strip() if branch else ''  # Empty means all branches

        # Create basic auth header
        credentials = f"{username}:{app_password}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        self.headers = {
            'Authorization': f'Basic {encoded_credentials}',
            'Accept': 'application/json',
            'User-Agent': 'PR-Metrics-Calculator'
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        self.progress_interval = PROGRESS_INTERVAL

    def is_bot_user(self, user: Dict) -> bool:
        """Check if a user is a bot based on username or display name"""
        if not user:
            return True

        username = user.get('username', '')
        display_name = user.get('display_name', '')

        # Check if username or display name indicates a bot
        bot_indicators = ['[bot]', 'bot', 'bitbucket-pipelines', 'dependabot', 'renovate']
        for indicator in bot_indicators:
            if indicator.lower() in username.lower() or indicator.lower() in display_name.lower():
                return True

        return False

    def _sleep_for_rate_limit(self, response) -> bool:
        """Handle rate limiting with exponential backoff"""
        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', '60'))
            wait_time = max(retry_after, 60)
            print(f"Rate limited. Waiting {wait_time}s...")
            time.sleep(wait_time)
            return True
        return False

    def _get(self, url: str, params: Dict = None) -> Optional[requests.Response]:
        """Make GET request with retry logic"""
        params = params or {}
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, params=params, timeout=30)
                if response.status_code == 200:
                    return response
                elif response.status_code in [500, 502, 503, 504]:
                    if self._sleep_for_rate_limit(response):
                        continue
                    backoff = 2 ** attempt
                    print(f"Transient error {response.status_code}. Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
                print(f"API request failed: {response.status_code} - {response.text[:200]}")
                return None
            except requests.exceptions.RequestException as e:
                backoff = 2 ** attempt
                print(f"Request error: {e}. Retrying in {backoff}s...")
                time.sleep(backoff)
        return None

    def _get_all_pages(self, url: str, params: Dict = None, show_progress: bool = False, context: str = "") -> List[Dict]:
        """Get all pages from a paginated API endpoint"""
        params = params.copy() if params else {}
        params['pagelen'] = 100  # Bitbucket uses 'pagelen' instead of 'per_page'
        all_items: List[Dict] = []
        page = 1

        while True:
            params['page'] = page
            resp = self._get(url, params)
            if not resp:
                break

            data = resp.json()
            items = data.get('values', [])
            if not items:
                break

            all_items.extend(items)

            # Show progress if requested
            if show_progress:
                print(f"  Fetched page {page} ({len(items)} items) ... total so far: {len(all_items)}")

            # Check if there's a next page
            if 'next' not in data:
                break
            page += 1

        return all_items

    # Date calculation methods
    def _parse_iso_or_now(self, iso: str) -> datetime:
        """Parse ISO date string or return current time"""
        if iso and iso.strip():
            try:
                return datetime.fromisoformat(iso.replace('Z', '+00:00'))
            except ValueError:
                print(f"Warning: Invalid AUTOMATED_DATE '{iso}', using now.")
        return datetime.now()

    def calculate_before_auto_date_range(self, weeks_back: int) -> Tuple[str, str]:
        """Calculate date range for before automation period"""
        auto_dt = self._parse_iso_or_now(AUTOMATED_DATE)
        end_dt = auto_dt - timedelta(weeks=1)  # End 1 week before automation
        start_dt = end_dt - timedelta(weeks=weeks_back)
        return (
            start_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
            end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        )

    def calculate_after_auto_date_range(self, weeks_back: int) -> Tuple[str, str]:
        """Calculate date range for after automation period"""
        auto_dt = self._parse_iso_or_now(AUTOMATED_DATE)
        start_dt = auto_dt
        end_dt = auto_dt + timedelta(weeks=weeks_back)
        return (
            start_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
            end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        )

    # Data fetching methods
    def get_pull_requests(self, start_date: str, end_date: str, period_name: str = "") -> List[Dict]:
        """Get pull requests for the specified date range"""
        url = f"{API_BASE_URL}/repositories/{self.repo}/pullrequests"
        params = {
            'state': 'MERGED,DECLINED,OPEN',  # All states
            'sort': '-created_on',  # Sort by creation date descending
        }

        if period_name:
            print(f"Fetching PRs for {period_name} period ({start_date} to {end_date})...")

        all_prs = self._get_all_pages(url, params, show_progress=bool(period_name), context=period_name)

        # Filter by date range and branch (Bitbucket API doesn't support date filtering directly)
        filtered_prs = []
        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

        for pr in all_prs:
            created_at = datetime.fromisoformat(pr['created_on'].replace('Z', '+00:00'))

            # Check date range
            if not (start_dt <= created_at <= end_dt):
                continue

            # Check branch filter if specified
            if self.branch:
                destination_branch = pr.get('destination', {}).get('branch', {}).get('name', '')
                if destination_branch != self.branch:
                    continue

            filtered_prs.append(pr)

        if period_name:
            print(f"Found {len(filtered_prs)} PRs for {period_name}")

        return filtered_prs

    def get_pr_comments(self, pr_id: int) -> List[Dict]:
        """Get comments for a specific pull request"""
        url = f"{API_BASE_URL}/repositories/{self.repo}/pullrequests/{pr_id}/comments"
        return self._get_all_pages(url)

    def get_pr_activity(self, pr_id: int) -> List[Dict]:
        """Get activity for a specific pull request"""
        url = f"{API_BASE_URL}/repositories/{self.repo}/pullrequests/{pr_id}/activity"
        return self._get_all_pages(url)

    def calculate_metrics_for_period(self, weeks_back: int, start_date: str, end_date: str, period_name: str, manual_metrics: Dict[str, float] = None) -> Dict[str, Any]:
        """Calculate metrics for a specific time period"""
        print(f"Calculating {period_name} metrics for {self.repo} over {weeks_back} week(s)...")
        print(f"Date range: {start_date} to {end_date}")

        prs = self.get_pull_requests(start_date, end_date, period_name)

        if not prs:
            print(f"No pull requests found in the {period_name} time period.")
            return {}

        total_prs = len(prs)
        merged_prs = 0
        total_comments = 0
        total_time_to_merge = 0.0
        merge_count = 0

        # Additional metrics tracking
        total_time_to_first_comment = 0.0
        first_comment_count = 0
        total_time_from_first_comment_to_followup = 0.0
        followup_count = 0
        unique_contributors = set()

        print(f"Processing {total_prs} pull requests for {period_name}...")

        for i, pr in enumerate(prs, 1):
            # Progress reporting
            if i % self.progress_interval == 0 or i == total_prs:
                print(f"  Processing PRs: {i}/{total_prs} (period={period_name})")

            pr_id = pr['id']
            created_at = datetime.fromisoformat(pr['created_on'].replace('Z', '+00:00'))

            # Track unique contributors
            author = pr.get('author', {})
            if author and not self.is_bot_user(author):
                unique_contributors.add(author.get('uuid'))

            # Get all comments for this PR
            comments = self.get_pr_comments(pr_id)

            # Filter out bot comments and system comments
            user_comments = []
            for comment in comments:
                comment_author = comment.get('user', {})
                if not self.is_bot_user(comment_author):
                    user_comments.append({
                        'created_on': comment.get('created_on'),
                        'author': comment_author
                    })

            total_comments += len(user_comments)

            # Calculate time to first comment
            if user_comments:
                # Sort comments by creation time
                user_comments.sort(key=lambda x: x['created_on'])
                first_comment_time = datetime.fromisoformat(user_comments[0]['created_on'].replace('Z', '+00:00'))
                time_to_first_comment = (first_comment_time - created_at).total_seconds() / 3600  # Hours
                total_time_to_first_comment += time_to_first_comment
                first_comment_count += 1

            # Check if PR was merged and calculate time to merge
            if pr['state'] == 'MERGED' and pr.get('updated_on'):
                merged_prs += 1
                merged_at = datetime.fromisoformat(pr['updated_on'].replace('Z', '+00:00'))
                time_to_merge = (merged_at - created_at).total_seconds() / 3600  # Hours
                total_time_to_merge += time_to_merge
                merge_count += 1

        print(f"  Completed processing {total_prs} PRs for {period_name}")

        # Calculate averages
        prs_per_week = total_prs / weeks_back
        merged_prs_per_week = merged_prs / weeks_back
        avg_comments_per_pr = total_comments / total_prs if total_prs > 0 else 0.0
        avg_time_to_merge = (total_time_to_merge / merge_count) if merge_count > 0 else 0.0
        avg_time_to_first_comment = (total_time_to_first_comment / first_comment_count) if first_comment_count > 0 else 0.0
        avg_time_from_first_comment_to_followup = (total_time_from_first_comment_to_followup / followup_count) if followup_count > 0 else 0.0
        unique_contributors_count = len(unique_contributors)

        # Prepare result dictionary
        result = {
            'total_prs': total_prs,
            'merged_prs': merged_prs,
            'weeks_analyzed': weeks_back,
            'analysis_start_date': start_date,
            'analysis_end_date': end_date,
            'prs_created_per_week': round(prs_per_week, 2),
            'prs_merged_per_week': round(merged_prs_per_week, 2),
            'average_comments_per_pr': round(avg_comments_per_pr, 2),
            'average_time_to_merge_hours': round(avg_time_to_merge, 2),
            'average_time_to_merge_days': round(avg_time_to_merge / 24, 2),
            # New metrics
            'average_time_to_first_comment_hours': round(avg_time_to_first_comment, 2),
            'average_time_from_first_comment_to_followup_commit_hours': round(avg_time_from_first_comment_to_followup, 2),
            'unique_contributors_count': unique_contributors_count
        }

        # Add manual metrics if provided
        if manual_metrics:
            result.update(manual_metrics)

        return result

    def calculate_comparative_metrics(self, weeks_back: int, manual_metrics: Dict[str, float] = None) -> Dict[str, Any]:
        """Calculate comparative metrics for before and after automation periods"""
        print(f"Starting comparative analysis for {self.repo}...")
        branch_info = self.branch if self.branch else "ALL branches"
        print(f"Branch: {branch_info}")
        print(f"Weeks back for each period: {weeks_back}")

        # Calculate date ranges for both periods
        before_start, before_end = self.calculate_before_auto_date_range(weeks_back)
        after_start, after_end = self.calculate_after_auto_date_range(weeks_back)

        print(f"Before automation period: {before_start} to {before_end}")
        print(f"After automation period: {after_start} to {after_end}")

        # Calculate metrics for both periods
        before_metrics = self.calculate_metrics_for_period(weeks_back, before_start, before_end, 'beforeAuto', manual_metrics)
        after_metrics = self.calculate_metrics_for_period(weeks_back, after_start, after_end, 'afterAuto', manual_metrics)

        # Combine results with prefixes
        combined = {}
        for key, value in before_metrics.items():
            combined[f'beforeAuto_{key}'] = value
        for key, value in after_metrics.items():
            combined[f'afterAuto_{key}'] = value

        # Add metadata
        combined['automation_date'] = (
            AUTOMATED_DATE.strip() if AUTOMATED_DATE and AUTOMATED_DATE.strip() else datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        )
        combined['branch_analyzed'] = branch_info
        combined['analysis_type'] = 'comparative'
        return combined

def _display_period_metrics(metrics: Dict, prefix: str) -> None:
    """Display metrics for a specific period (beforeAuto or afterAuto)"""
    period_name = "BEFORE AUTOMATION" if prefix == "beforeAuto" else "AFTER AUTOMATION"
    print(f"\n{period_name} METRICS:")
    print("-" * 40)

    if f'{prefix}_analysis_start_date' not in metrics:
        print(f"No data available for {period_name.lower()} period")
        return

    # Use the same metric display format as GitHub script
    metric_data = [
        ('analysis_start_date', 'analysis_end_date', 'Date Range', lambda s, e: f"{s} to {e}"),
        ('total_prs', None, 'Total Pull Requests Created', lambda v, _: str(v)),
        ('merged_prs', None, 'Total Pull Requests Merged', lambda v, _: str(v)),
        ('prs_created_per_week', None, 'Pull Requests Created per Week', lambda v, _: str(v)),
        ('prs_merged_per_week', None, 'Pull Requests Merged per Week', lambda v, _: str(v)),
        ('average_comments_per_pr', None, 'Average Comments per PR', lambda v, _: str(v)),
        ('average_time_to_merge_hours', 'average_time_to_merge_days', 'Average Time to Merge',
         lambda h, d: f"{h} hours ({d} days)"),
        ('average_time_to_first_comment_hours', None, 'Average Time to First Comment',
         lambda v, _: f"{v} hours"),
        ('average_time_from_first_comment_to_followup_commit_hours', None,
         'Average Time from First Comment to Follow-up Commit', lambda v, _: f"{v} hours"),
        ('unique_contributors_count', None, 'Unique Contributors', lambda v, _: str(v)),
        ('average_first_review_time_hours', None, 'Average First Review Time (Manual)', lambda v, _: f"{v} hours"),
        ('average_remediation_time_hours', None, 'Average Remediation Time (Manual)', lambda v, _: f"{v} hours")
    ]

    for key1, key2, label, formatter in metric_data:
        val1 = metrics.get(f'{prefix}_{key1}', 0)
        val2 = metrics.get(f'{prefix}_{key2}', 0) if key2 else None
        print(f"{label}: {formatter(val1, val2)}")

def _calculate_and_display_changes(metrics: Dict) -> None:
    """Calculate and display percentage changes between before and after periods"""
    print("\nCOMPARISON SUMMARY:")
    print("-" * 40)

    changes = [
        ('prs_created_per_week', 'PRs Created per Week Change'),
        ('average_time_to_merge_hours', 'Average Merge Time Change'),
        ('average_comments_per_pr', 'Average Comments per PR Change'),
        ('average_time_to_first_comment_hours', 'Average Time to First Comment Change'),
        ('average_time_from_first_comment_to_followup_commit_hours',
         'Average Time from First Comment to Follow-up Commit Change'),
        ('unique_contributors_count', 'Unique Contributors Change')
    ]

    for metric_key, label in changes:
        before_val = metrics.get(f'beforeAuto_{metric_key}', 0)
        after_val = metrics.get(f'afterAuto_{metric_key}', 0)

        if before_val > 0:
            change = ((after_val - before_val) / before_val) * 100
            print(f"{label}: {change:+.1f}%")

def main():
    """Main function to run the metrics calculator"""
    global BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD, REPO_NAME, WEEKS_BACK, AUTOMATED_DATE, BRANCH, API_BASE_URL

    # Validate configuration
    is_valid, errors, config = validate_config()

    if not is_valid:
        print("Configuration validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")

        # Try interactive configuration
        print("\nWould you like to provide the missing configuration interactively?")
        response = input("Enter 'y' to continue or any other key to exit: ").strip().lower()

        if response in ['y', 'yes']:
            new_config = prompt_for_config()
            if not new_config:
                return

            # Update global configuration
            BITBUCKET_USERNAME = new_config['bitbucket_username']
            BITBUCKET_APP_PASSWORD = new_config['bitbucket_app_password']
            REPO_NAME = new_config['repo_name']
            WEEKS_BACK = new_config['weeks_back']
            AUTOMATED_DATE = new_config['automated_date']
            BRANCH = new_config['branch']
            API_BASE_URL = new_config['api_base_url']

            # Re-validate
            is_valid, errors, config = validate_config()
            if not is_valid:
                print("Configuration is still invalid after interactive setup:")
                for error in errors:
                    print(f"  ERROR: {error}")
                return
        else:
            return

    # Initialize calculator with validated configuration
    calculator = BitbucketMetricsCalculator(BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD, REPO_NAME, BRANCH)

    # Prompt for manual metrics
    manual_metrics = prompt_for_manual_metrics()

    try:
        # Calculate comparative metrics with manual metrics
        metrics = calculator.calculate_comparative_metrics(WEEKS_BACK, manual_metrics)

        if metrics:
            # Display results (same format as GitHub script)
            print("\n" + "="*70)
            print("BITBUCKET PR METRICS COMPARATIVE ANALYSIS REPORT")
            print("="*70)
            print(f"Repository: {REPO_NAME}")
            print(f"Branch: {metrics.get('branch_analyzed', 'ALL branches')}")
            print(f"Automation Date: {metrics.get('automation_date', 'Not specified')}")
            print(f"Analysis Period: {WEEKS_BACK} week(s) for each comparison period")
            print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*70)

            # Display period metrics using helper function
            _display_period_metrics(metrics, 'beforeAuto')
            _display_period_metrics(metrics, 'afterAuto')

            # Display comparison summary using helper function
            _calculate_and_display_changes(metrics)

            print("="*70)

            # Save results to JSON file
            output_file = f"bitbucket_pr_metrics_comparative_{REPO_NAME.replace('/', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(output_file, 'w') as f:
                json.dump(metrics, f, indent=2)
            print(f"\nResults saved to: {output_file}")

    except Exception as e:
        print(f"Error calculating metrics: {e}")

if __name__ == "__main__":
    main()
