#!/usr/bin/env python3
"""
GitHub PR Metrics Calculator - Comparative Analysis

This script calculates various metrics for GitHub pull requests with comparative analysis
before and after automation was added. It generates metrics for two time periods:
- "beforeAuto": Period ending one week before AUTOMATED_DATE, spanning WEEKS_BACK duration
- "afterAuto": Period starting from AUTOMATED_DATE, spanning WEEKS_BACK duration

Metrics calculated for each period:
1. Average number of Pull Requests created per week
2. Average number of Pull Requests merged per week
3. Average number of comments across all Pull Requests in the time period
4. Average time to merge (difference between PR mergedAt and PR createdAt timestamps)

Usage:
1. Replace YOUR_GITHUB_TOKEN with your GitHub personal access token
2. Replace owner/repo-name with your target repository
3. Adjust WEEKS_BACK as needed (default: 2) - this applies to both before and after periods
4. Set AUTOMATED_DATE to specify when automation was added (format: 'YYYY-MM-DDTHH:MM:SSZ')
   - Leave empty or set to '' to use current time as automation date
5. Optionally set BRANCH to specify which Git branch to analyze
   - Leave empty or set to '' to analyze PRs for ALL branches
   - Set to specific branch name (e.g., 'main', 'develop') to analyze only that branch
6. Run: python github_pr_metrics.py

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

# Configuration - Replace these values or set via environment variables
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO_NAME = os.environ.get('REPO_NAME', '')  # Format: 'owner/repo-name'
WEEKS_BACK = int(os.environ.get('WEEKS_BACK', '2'))  # Number of weeks to look back
AUTOMATED_DATE = os.environ.get('AUTOMATED_DATE', '')  # Format: 'YYYY-MM-DDTHH:MM:SSZ' or leave empty to use current time
BRANCH = os.environ.get('BRANCH', '')  # Base branch for PRs (leave empty to analyze ALL branches, or specify branch name)

# GitHub API configuration
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://api.github.com')
API_VERSION = os.environ.get('API_VERSION', 'application/vnd.github.v3+json')

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
        'github_token': GITHUB_TOKEN,
        'repo_name': REPO_NAME,
        'weeks_back': WEEKS_BACK,
        'automated_date': AUTOMATED_DATE,
        'branch': BRANCH,
        'api_base_url': API_BASE_URL,
        'api_version': API_VERSION
    }

    # Validate GitHub token
    if not config['github_token'] or config['github_token'] in ['YOUR_GITHUB_TOKEN', '']:
        errors.append("GitHub token is required")

    # Validate repository name format
    if not config['repo_name'] or config['repo_name'] in ['owner/repo-name', '']:
        errors.append("Repository name is required")
    elif '/' not in config['repo_name'] or config['repo_name'].count('/') != 1:
        errors.append("Repository name must be in format 'owner/repo'")

    # Validate weeks back
    try:
        weeks = int(config['weeks_back'])
        if weeks <= 0:
            errors.append("Weeks back must be a positive integer")
        config['weeks_back'] = weeks
    except (ValueError, TypeError):
        errors.append("Weeks back must be a positive integer")

    # Validate automated date (optional)
    if config['automated_date']:
        try:
            # Check ISO 8601 format with Z suffix
            if not config['automated_date'].endswith('Z'):
                errors.append("Automated date must end with 'Z' (e.g., '2024-01-15T10:30:00Z')")
            else:
                datetime.fromisoformat(config['automated_date'].replace('Z', '+00:00'))
        except ValueError:
            errors.append("Automated date must be in ISO 8601 format 'YYYY-MM-DDTHH:MM:SSZ'")

    # Validate API base URL
    if not config['api_base_url']:
        errors.append("API base URL is required")
    else:
        try:
            parsed = urlparse(config['api_base_url'])
            if parsed.scheme != 'https':
                errors.append("API base URL must use HTTPS")
        except Exception:
            errors.append("API base URL is not a valid URL")

    # Validate API version
    if not config['api_version']:
        errors.append("API version is required")

    return len(errors) == 0, errors, config

def prompt_for_config() -> Dict[str, Any]:
    """
    Interactively prompt user for missing/invalid configuration values
    """
    print("\n" + "="*60)
    print("CONFIGURATION SETUP")
    print("="*60)
    print("Some required configuration values are missing or invalid.")
    print("Please provide the following information:\n")

    config = {}

    # GitHub Token (secure input)
    while True:
        token = getpass.getpass("GitHub Personal Access Token: ").strip()
        if token:
            config['github_token'] = token
            break
        print("ERROR: GitHub token is required. Please try again.")

    # Repository Name
    while True:
        repo = input("Repository name (owner/repo): ").strip()
        if repo and '/' in repo and repo.count('/') == 1:
            config['repo_name'] = repo
            break
        print("ERROR: Repository name must be in format 'owner/repo'. Please try again.")

    # Weeks Back
    while True:
        weeks_input = input(f"Number of weeks to analyze for each period [default: 2]: ").strip()
        if not weeks_input:
            config['weeks_back'] = 2
            break
        try:
            weeks = int(weeks_input)
            if weeks > 0:
                config['weeks_back'] = weeks
                break
            else:
                print("ERROR: Weeks must be a positive integer. Please try again.")
        except ValueError:
            print("ERROR: Please enter a valid number.")

    # Automated Date
    while True:
        date_input = input("Automation date (YYYY-MM-DDTHH:MM:SSZ) or press Enter for current time: ").strip()
        if not date_input:
            config['automated_date'] = ''
            break

        if not date_input.endswith('Z'):
            print("ERROR: Date must end with 'Z' (e.g., '2024-01-15T10:30:00Z'). Please try again.")
            continue

        try:
            datetime.fromisoformat(date_input.replace('Z', '+00:00'))
            config['automated_date'] = date_input
            break
        except ValueError:
            print("ERROR: Invalid date format. Use 'YYYY-MM-DDTHH:MM:SSZ'. Please try again.")

    # Branch (optional)
    branch = input("Branch name to analyze (or press Enter for ALL branches): ").strip()
    config['branch'] = branch

    # API Base URL
    while True:
        url_input = input(f"GitHub API base URL [default: https://api.github.com]: ").strip()
        if not url_input:
            config['api_base_url'] = 'https://api.github.com'
            break

        try:
            parsed = urlparse(url_input)
            if parsed.scheme == 'https':
                config['api_base_url'] = url_input
                break
            else:
                print("ERROR: API base URL must use HTTPS. Please try again.")
        except Exception:
            print("ERROR: Invalid URL format. Please try again.")

    # API Version
    version_input = input(f"GitHub API version [default: application/vnd.github.v3+json]: ").strip()
    config['api_version'] = version_input if version_input else 'application/vnd.github.v3+json'

    print("\n" + "="*60)
    print("Configuration Summary:")
    print(f"Repository: {config['repo_name']}")
    print(f"Weeks to analyze: {config['weeks_back']}")
    print(f"Automation date: {config['automated_date'] if config['automated_date'] else 'Current time'}")
    print(f"Branch: {config['branch'] if config['branch'] else 'ALL branches'}")
    print(f"API base URL: {config['api_base_url']}")
    print(f"API version: {config['api_version']}")
    print("="*60)

    confirm = input("Proceed with this configuration? (y/N): ").strip().lower()
    if confirm not in ['y', 'yes']:
        print("Configuration cancelled.")
        return None

    return config

class GitHubMetricsCalculator:
    def __init__(self, token: str, repo: str, branch: str = ''):
        self.token = token
        self.repo = repo
        self.branch = branch.strip() if branch else ''  # Empty means all branches
        self.headers = {
            'Authorization': f'token {token}',
            'Accept': API_VERSION,
            'User-Agent': 'PR-Metrics-Calculator'
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        self.progress_interval = PROGRESS_INTERVAL

    def is_bot_user(self, user: Dict) -> bool:
        """Check if a user is a bot based on login or type"""
        if not user:
            return True

        login = user.get('login', '')
        user_type = user.get('type', '')

        # Check if login ends with [bot] or type is Bot
        return login.endswith('[bot]') or user_type == 'Bot'

    def _parse_automation_date(self) -> datetime:
        """Parse AUTOMATED_DATE with fallback to current time"""
        if not AUTOMATED_DATE or not AUTOMATED_DATE.strip():
            return datetime.now()
        try:
            return datetime.fromisoformat(AUTOMATED_DATE.replace('Z', '+00:00'))
        except ValueError:
            print(f"Warning: Invalid AUTOMATED_DATE format '{AUTOMATED_DATE}'. Using current time instead.")
            print("Expected format: 'YYYY-MM-DDTHH:MM:SSZ' (e.g., '2025-08-19T17:44:15Z')")
            return datetime.now()

    def _format_datetime(self, dt: datetime) -> str:
        """Format datetime for GitHub API"""
        if dt.tzinfo is None:
            return dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        else:
            return dt.astimezone().strftime('%Y-%m-%dT%H:%M:%SZ')
    
    def handle_rate_limit(self, response):
        """Handle GitHub API rate limiting"""
        if response.status_code == 403 and 'X-RateLimit-Remaining' in response.headers:
            remaining = int(response.headers.get('X-RateLimit-Remaining', 0))
            if remaining == 0:
                reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
                wait_time = max(reset_time - int(time.time()), 0) + 1
                print(f"Rate limit exceeded. Waiting {wait_time} seconds...")
                time.sleep(wait_time)
                return True
        return False
    
    def make_request(self, url: str, params: Dict = None) -> Optional[Dict]:
        """Make a request to GitHub API with error handling and rate limit management"""
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                response = self.session.get(url, params=params or {})
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 403:
                    if self.handle_rate_limit(response):
                        continue
                    else:
                        print(f"Access forbidden: {response.status_code}")
                        return None
                elif response.status_code == 404:
                    print(f"Repository not found: {self.repo}")
                    return None
                else:
                    print(f"API request failed: {response.status_code}")
                    return None
                    
            except requests.exceptions.RequestException as e:
                print(f"Request error: {e}")
                retry_count += 1
                if retry_count < max_retries:
                    time.sleep(2 ** retry_count)
                    continue
        
        return None
    
    def get_all_pages(self, url: str, params: Dict = None, show_progress: bool = False, context: str = "") -> List[Dict]:
        """Get all pages of results from GitHub API with optional progress reporting"""
        params = params or {}
        params['per_page'] = 100  # Maximum items per page

        all_items = []
        page = 1

        while True:
            params['page'] = page
            data = self.make_request(url, params)

            if data is None:
                break

            if isinstance(data, list):
                all_items.extend(data)

                # Show progress if requested
                if show_progress:
                    print(f"  Fetched page {page} ({len(data)} items) ... total so far: {len(all_items)}")

                if len(data) < 100:  # Last page
                    break
            else:
                break

            page += 1

        return all_items
    
    def calculate_date_range(self, weeks_back: int, end_date_override: Optional[datetime] = None) -> tuple:
        """Calculate the date range for the specified period"""
        end_date = end_date_override if end_date_override else self._parse_automation_date()
        start_date = end_date - timedelta(weeks=weeks_back)
        return self._format_datetime(start_date), self._format_datetime(end_date)

    def calculate_before_auto_date_range(self, weeks_back: int) -> tuple:
        """Calculate the date range for the period before automation (beforeAuto)"""
        automation_date = self._parse_automation_date()
        end_date = automation_date - timedelta(weeks=1)
        return self.calculate_date_range(weeks_back, end_date)

    def calculate_after_auto_date_range(self, weeks_back: int) -> tuple:
        """Calculate the date range for the period after automation (afterAuto)"""
        automation_date = self._parse_automation_date()
        start_date = automation_date
        end_date = automation_date + timedelta(weeks=weeks_back)
        return self._format_datetime(start_date), self._format_datetime(end_date)
    
    def get_pull_requests(self, weeks_back: int, start_date: str = None, end_date: str = None,
                         period_name: str = "") -> List[Dict]:
        """Get all pull requests within the specified time period with progress reporting"""
        if start_date is None or end_date is None:
            start_date, end_date = self.calculate_date_range(weeks_back)

        # Progress: Start message
        if period_name:
            print(f"Fetching PRs for {period_name} period ({start_date} to {end_date})...")

        url = f"{API_BASE_URL}/repos/{self.repo}/pulls"
        params = {
            'state': 'all',
            'sort': 'created',
            'direction': 'desc'
        }

        # Only add base branch filter if a specific branch is specified
        if self.branch:
            params['base'] = self.branch

        all_prs = self.get_all_pages(url, params, show_progress=bool(period_name), context=period_name)

        # Filter PRs by date range
        filtered_prs = []
        start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

        for pr in all_prs:
            created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
            # Check if PR was created within our time window
            if start_datetime <= created_at <= end_datetime:
                filtered_prs.append(pr)
            elif created_at < start_datetime:
                # Since PRs are sorted by creation date (desc), we can break early
                break

        # Progress: Final count
        if period_name:
            print(f"Found {len(filtered_prs)} PRs for {period_name}")

        return filtered_prs
    
    def _get_pr_data(self, pr_number: int, endpoint_type: str) -> List[Dict]:
        """Generic method to get PR-related data"""
        endpoints = {
            'comments': f"/repos/{self.repo}/issues/{pr_number}/comments",
            'review_comments': f"/repos/{self.repo}/pulls/{pr_number}/comments",
            'reviews': f"/repos/{self.repo}/pulls/{pr_number}/reviews",
            'commits': f"/repos/{self.repo}/pulls/{pr_number}/commits"
        }
        url = f"{API_BASE_URL}{endpoints[endpoint_type]}"
        return self.get_all_pages(url, show_progress=False)  # Don't show progress for individual PR data

    def get_pr_comments(self, pr_number: int) -> List[Dict]:
        """Get all comments for a specific pull request"""
        return self._get_pr_data(pr_number, 'comments')

    def get_pr_review_comments(self, pr_number: int) -> List[Dict]:
        """Get all review comments for a specific pull request"""
        return self._get_pr_data(pr_number, 'review_comments')

    def get_pr_reviews(self, pr_number: int) -> List[Dict]:
        """Get all reviews for a specific pull request"""
        return self._get_pr_data(pr_number, 'reviews')

    def get_pr_commits(self, pr_number: int) -> List[Dict]:
        """Get all commits for a specific pull request"""
        return self._get_pr_data(pr_number, 'commits')

    def _get_earliest_comment_time(self, pr_number: int, pr_author: str) -> Optional[datetime]:
        """Get earliest qualifying comment time for a PR"""
        earliest_time = None

        # Get all comment types
        all_comments = [
            *self.get_pr_reviews(pr_number),
            *self.get_pr_review_comments(pr_number),
            *self.get_pr_comments(pr_number)
        ]

        for comment in all_comments:
            if (comment.get('user') and
                not self.is_bot_user(comment['user']) and
                comment['user']['login'] != pr_author and
                comment.get('created_at')):

                comment_time = datetime.fromisoformat(comment['created_at'].replace('Z', '+00:00'))
                if earliest_time is None or comment_time < earliest_time:
                    earliest_time = comment_time

        return earliest_time

    def get_time_to_first_comment(self, pr: Dict) -> Optional[float]:
        """Calculate time to first comment for a PR in hours"""
        pr_number = pr['number']
        pr_author = pr['user']['login']
        pr_created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))

        earliest_comment_time = self._get_earliest_comment_time(pr_number, pr_author)

        if earliest_comment_time is None:
            return None  # No qualifying comments found

        # Calculate time difference in hours
        time_diff = (earliest_comment_time - pr_created_at).total_seconds() / 3600
        return round(time_diff, 2)

    def get_time_from_first_comment_to_followup_commit(self, pr: Dict) -> Optional[float]:
        """Calculate time from first comment to follow-up commit by PR author in hours"""
        pr_number = pr['number']
        pr_author = pr['user']['login']

        first_comment_time = self._get_earliest_comment_time(pr_number, pr_author)
        if first_comment_time is None:
            return None  # No qualifying first comment found

        # Now find the first commit by PR author after the first comment
        commits = self.get_pr_commits(pr_number)
        earliest_followup_commit = None

        for commit in commits:
            # Use GitHub user login if available, otherwise fall back to commit author name
            commit_author_login = None
            if commit.get('author') and not self.is_bot_user(commit['author']):
                commit_author_login = commit['author']['login']

            commit_date_str = commit.get('commit', {}).get('committer', {}).get('date', '')

            if not commit_date_str:
                continue

            commit_date = datetime.fromisoformat(commit_date_str.replace('Z', '+00:00'))

            # Check if this commit is by the PR author and after the first comment
            if (commit_author_login == pr_author and commit_date > first_comment_time):
                if earliest_followup_commit is None or commit_date < earliest_followup_commit:
                    earliest_followup_commit = commit_date

        if earliest_followup_commit is None:
            return None  # No follow-up commit found

        # Calculate time difference in hours
        time_diff = (earliest_followup_commit - first_comment_time).total_seconds() / 3600
        return round(time_diff, 2)

    def get_unique_contributors_for_prs(self, prs: List[Dict]) -> int:
        """Count unique human contributors across all PRs in the list"""
        unique_contributors = set()

        for pr in prs:
            pr_number = pr['number']

            # Add PR author
            if pr.get('user') and not self.is_bot_user(pr['user']):
                unique_contributors.add(pr['user']['login'])

            # Add commit authors
            commits = self.get_pr_commits(pr_number)
            for commit in commits:
                commit_author = commit.get('commit', {}).get('author', {})
                if commit_author and commit_author.get('name'):
                    # Note: commit author might not have a GitHub user, so we use name
                    # We'll also check if there's a GitHub user associated
                    if commit.get('author') and not self.is_bot_user(commit['author']):
                        unique_contributors.add(commit['author']['login'])
                    elif commit_author.get('name') and not commit_author['name'].endswith('[bot]'):
                        # For commits without GitHub user, use name but filter obvious bots
                        unique_contributors.add(commit_author['name'])

            # Add reviewers
            reviews = self.get_pr_reviews(pr_number)
            for review in reviews:
                if review.get('user') and not self.is_bot_user(review['user']):
                    unique_contributors.add(review['user']['login'])

            # Add review commenters
            review_comments = self.get_pr_review_comments(pr_number)
            for comment in review_comments:
                if comment.get('user') and not self.is_bot_user(comment['user']):
                    unique_contributors.add(comment['user']['login'])

            # Add issue commenters
            issue_comments = self.get_pr_comments(pr_number)
            for comment in issue_comments:
                if comment.get('user') and not self.is_bot_user(comment['user']):
                    unique_contributors.add(comment['user']['login'])

        return len(unique_contributors)
    


    def calculate_metrics_for_period(self, weeks_back: int, start_date: str, end_date: str, period_name: str, manual_metrics: Dict[str, float] = None) -> Dict[str, Any]:
        """Calculate metrics for a specific time period"""
        print(f"Calculating {period_name} metrics for {self.repo} over {weeks_back} week(s)...")
        print(f"Date range: {start_date} to {end_date}")

        prs = self.get_pull_requests(weeks_back, start_date, end_date, period_name)

        if not prs:
            print(f"No pull requests found in the {period_name} time period.")
            return {}

        total_prs = len(prs)
        merged_prs = 0
        total_comments = 0
        total_time_to_merge = 0
        merge_count = 0

        # New metrics tracking
        time_to_first_comment_values = []
        time_from_first_comment_to_followup_values = []

        print(f"Processing {total_prs} pull requests for {period_name} period...")

        for i, pr in enumerate(prs, 1):
            pr_number = pr['number']

            # Show progress every N PRs
            if i % self.progress_interval == 0 or i == total_prs:
                print(f"  Processing PRs: {i}/{total_prs} (period={period_name})")

            # Get all comments for this PR (existing logic)
            comments = self.get_pr_comments(pr_number)
            review_comments = self.get_pr_review_comments(pr_number)
            total_comments += len(comments) + len(review_comments)

            # Check if PR was merged (existing logic)
            if pr['merged_at'] is not None:
                merged_prs += 1

                # Calculate time to merge (existing logic)
                created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
                merged_at = datetime.fromisoformat(pr['merged_at'].replace('Z', '+00:00'))
                time_to_merge = (merged_at - created_at).total_seconds() / 3600  # Hours
                total_time_to_merge += time_to_merge
                merge_count += 1

            # New metrics calculation
            time_to_first_comment = self.get_time_to_first_comment(pr)
            if time_to_first_comment is not None:
                time_to_first_comment_values.append(time_to_first_comment)

            time_from_first_comment_to_followup = self.get_time_from_first_comment_to_followup_commit(pr)
            if time_from_first_comment_to_followup is not None:
                time_from_first_comment_to_followup_values.append(time_from_first_comment_to_followup)

        # Progress: Completion message
        print(f"Completed processing {total_prs} PRs for {period_name}")

        # Calculate existing averages
        prs_per_week = total_prs / weeks_back
        merged_prs_per_week = merged_prs / weeks_back
        avg_comments_per_pr = total_comments / total_prs if total_prs > 0 else 0
        avg_time_to_merge = total_time_to_merge / merge_count if merge_count > 0 else 0

        # Calculate new metric averages
        avg_time_to_first_comment = (
            sum(time_to_first_comment_values) / len(time_to_first_comment_values)
            if time_to_first_comment_values else 0
        )
        avg_time_from_first_comment_to_followup = (
            sum(time_from_first_comment_to_followup_values) / len(time_from_first_comment_to_followup_values)
            if time_from_first_comment_to_followup_values else 0
        )

        # Calculate unique contributors
        unique_contributors_count = self.get_unique_contributors_for_prs(prs)

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

        # Calculate metrics for both periods (manual metrics apply to both periods)
        before_metrics = self.calculate_metrics_for_period(weeks_back, before_start, before_end, "beforeAuto", manual_metrics)
        after_metrics = self.calculate_metrics_for_period(weeks_back, after_start, after_end, "afterAuto", manual_metrics)

        # Combine metrics with appropriate prefixes
        combined_metrics = {}

        # Add before automation metrics with prefix
        for key, value in before_metrics.items():
            combined_metrics[f'beforeAuto_{key}'] = value

        # Add after automation metrics with prefix
        for key, value in after_metrics.items():
            combined_metrics[f'afterAuto_{key}'] = value

        # Add metadata
        combined_metrics['automation_date'] = AUTOMATED_DATE if AUTOMATED_DATE and AUTOMATED_DATE.strip() else datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        combined_metrics['branch_analyzed'] = self.branch if self.branch else "ALL branches"
        combined_metrics['analysis_type'] = 'comparative'

        return combined_metrics

def _display_period_metrics(metrics: Dict, period: str) -> None:
    """Display metrics for a specific period"""
    prefix = f"{period}_"
    period_name = period.replace('Auto', ' automation').upper()

    print(f"\n{period_name} METRICS:")
    print("-" * 40)

    if f'{prefix}analysis_start_date' not in metrics:
        print(f"No data available for {period.replace('Auto', ' automation')} period")
        return

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
        val1 = metrics.get(f'{prefix}{key1}', 0)
        val2 = metrics.get(f'{prefix}{key2}', 0) if key2 else None
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
            config = prompt_for_config()
            if config is None:
                print("Configuration cancelled. Exiting.")
                return

            # Re-validate after interactive input
            # Update global variables with new config
            global GITHUB_TOKEN, REPO_NAME, WEEKS_BACK, AUTOMATED_DATE, BRANCH, API_BASE_URL, API_VERSION
            GITHUB_TOKEN = config['github_token']
            REPO_NAME = config['repo_name']
            WEEKS_BACK = config['weeks_back']
            AUTOMATED_DATE = config['automated_date']
            BRANCH = config['branch']
            API_BASE_URL = config['api_base_url']
            API_VERSION = config['api_version']

            # Validate again
            is_valid, errors, _ = validate_config()
            if not is_valid:
                print("Configuration is still invalid after interactive setup:")
                for error in errors:
                    print(f"  ERROR: {error}")
                return
        else:
            print("Exiting. Please fix the configuration and try again.")
            return

    # Initialize calculator with validated configuration
    calculator = GitHubMetricsCalculator(GITHUB_TOKEN, REPO_NAME, BRANCH)

    # Prompt for manual metrics
    manual_metrics = prompt_for_manual_metrics()

    try:
        # Calculate comparative metrics with manual metrics
        metrics = calculator.calculate_comparative_metrics(WEEKS_BACK, manual_metrics)

        if metrics:
            # Display results (unchanged format)
            print("\n" + "="*70)
            print("GITHUB PR METRICS COMPARATIVE ANALYSIS REPORT")
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
            output_file = f"github_pr_metrics_comparative_{REPO_NAME.replace('/', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(output_file, 'w') as f:
                json.dump(metrics, f, indent=2)
            print(f"\nResults saved to: {output_file}")

    except Exception as e:
        print(f"Error calculating metrics: {e}")

if __name__ == "__main__":
    main()
