#!/usr/bin/env python3
"""
Azure DevOps PR Metrics Calculator - Comparative Analysis with Detailed Output

This script replicates the functionality of github_pr_metrics_detailed_csv.py but for Azure DevOps.
It fetches pull request data from Azure DevOps APIs and performs the same metrics calculations
as the original GitHub script, generating identical CSV output formats.

Performance optimizations:
1. Uses Azure DevOps REST API for batch fetching PR data
2. Implements parallel processing with rate limit awareness
3. Caches API responses to avoid redundant calls
4. Uses efficient date filtering
5. Adds progress indicators with ETA

Features:
- Detailed PR data in CSV output (same 25 columns as GitHub version)
- Separate contributor mapping CSV file (username to email mapping)
- Enhanced data export for downstream analysis
- Maintains 100% compatibility with GitHub script output format

This script maintains functional equivalence with the GitHub version while only changing the data source.
"""

import requests
import json
import os
import getpass
import re
from datetime import datetime, timedelta
import time
from typing import Dict, List, Any, Optional, Tuple, Set
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Semaphore
import hashlib
from collections import defaultdict
from dataclasses import dataclass, asdict
import sys
import zipfile
import csv
import base64

# Configuration - Replace these values or set via environment variables
AZURE_DEVOPS_PAT = os.environ.get('AZURE_DEVOPS_PAT', '')
AZURE_DEVOPS_ORG = os.environ.get('AZURE_DEVOPS_ORG', '')  # Format: 'https://dev.azure.com/yourorg'
AZURE_DEVOPS_PROJECT = os.environ.get('AZURE_DEVOPS_PROJECT', '')  # Project name
REPO_NAME = os.environ.get('REPO_NAME', '')  # Repository name within the project
WEEKS_BACK = int(os.environ.get('WEEKS_BACK', '26'))  # Number of weeks to look back
AUTOMATED_DATE = os.environ.get('AUTOMATED_DATE', '')  # Format: 'YYYY-MM-DDTHH:MM:SSZ' or leave empty to use current time
BRANCH = os.environ.get('BRANCH', '')  # Target branch for PRs (leave empty to analyze ALL branches, or specify branch name)

# Azure DevOps API configuration
API_VERSION = os.environ.get('API_VERSION', '7.0')

def get_azure_api_base_url():
    """Get Azure DevOps API base URL"""
    return f"{AZURE_DEVOPS_ORG}/{AZURE_DEVOPS_PROJECT}/_apis"

# Performance configuration
MAX_PARALLEL_REQUESTS = 10  # Maximum parallel API requests
BATCH_SIZE = 100  # Number of PRs to fetch in each API call
CACHE_ENABLED = True  # Enable response caching
PROGRESS_INTERVAL = 25  # Show progress every N PRs

# Rate limiting
RATE_LIMIT_BUFFER = 100  # Keep this many requests as buffer
rate_limit_lock = Lock()
remaining_requests = 5000  # Will be updated from API responses

@dataclass
class PRData:
    """Cached PR data structure - matches GitHub version exactly"""
    number: int
    created_at: str
    merged_at: Optional[str]
    closed_at: Optional[str]
    author: str
    is_bot_author: bool
    title: str
    state: str
    comments_count: int
    review_comments_count: int
    reviews: List[Dict]
    commits: List[Dict]
    commenters: Set[str]
    reviewers: Set[str]
    additions: int
    deletions: int
    timeline_items: List[Dict]
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        data['commenters'] = list(self.commenters)
        data['reviewers'] = list(self.reviewers)
        return data
    
    def to_summary_dict(self):
        """
        Convert to summary dictionary for detailed output.
        Includes all PR data needed for CSV export.
        """
        return {
            'number': self.number,
            'created_at': self.created_at,
            'merged_at': self.merged_at,
            'closed_at': self.closed_at,
            'author': self.author,
            'is_bot_author': self.is_bot_author,
            'title': self.title,
            'state': self.state,
            'comments_count': self.comments_count,
            'review_comments_count': self.review_comments_count,
            'reviewers': sorted(list(self.reviewers)),
            'commenters': sorted(list(self.commenters)),
            'additions': self.additions,
            'deletions': self.deletions,
            'commits': self.commits,
            'timeline_items': self.timeline_items
        }

class ResponseCache:
    """Simple in-memory cache for API responses"""
    def __init__(self):
        self.cache = {}
        self.lock = Lock()
    
    def get_key(self, *args):
        """Generate cache key from arguments"""
        return hashlib.md5(str(args).encode()).hexdigest()
    
    def get(self, *args):
        """Get cached response"""
        if not CACHE_ENABLED:
            return None
        key = self.get_key(*args)
        with self.lock:
            return self.cache.get(key)
    
    def set(self, value, *args):
        """Cache a response"""
        if not CACHE_ENABLED:
            return
        key = self.get_key(*args)
        with self.lock:
            self.cache[key] = value

class ProgressTracker:
    """Track and display progress with ETA"""
    def __init__(self, total: int, description: str = "Processing"):
        self.total = total
        self.current = 0
        self.description = description
        self.start_time = time.time()
        self.last_update = 0
    
    def update(self, increment: int = 1):
        """Update progress"""
        self.current += increment
        current_time = time.time()

        # Update display every second or at completion
        if current_time - self.last_update >= 1.0 or self.current >= self.total:
            elapsed = current_time - self.start_time
            if self.current > 0 and elapsed > 0:
                rate = self.current / elapsed
                remaining = (self.total - self.current) / rate if rate > 0 else 0
                eta_str = f"ETA: {int(remaining)}s" if remaining > 0 else "Done"
            else:
                eta_str = "Calculating..."
            
            percent = (self.current / self.total * 100) if self.total > 0 else 0
            print(f"\r  {self.description}: {self.current}/{self.total} ({percent:.1f}%) - {eta_str}", end='', flush=True)
            self.last_update = current_time
            
            if self.current >= self.total:
                print()  # New line at completion

def parse_repo_names(repo_string: str) -> List[str]:
    """
    Parse repository names from semicolon-separated string.
    Supports both single repo (backward compatible) and multiple repos.

    Args:
        repo_string: Single repo 'repo-name' or multiple 'repo1;repo2;...'

    Returns:
        List of repository names
    """
    if not repo_string:
        return []

    # Split by semicolon and strip whitespace
    repos = [r.strip() for r in repo_string.split(';')]
    # Filter out empty strings
    repos = [r for r in repos if r]
    return repos

def validate_repo_name(repo: str) -> Tuple[bool, str]:
    """
    Validate a single repository name.

    Args:
        repo: Repository name

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not repo:
        return False, "Repository name cannot be empty"

    # Azure DevOps repo names can contain letters, numbers, hyphens, underscores, and periods
    if not re.match(r'^[a-zA-Z0-9._-]+$', repo):
        return False, f"Invalid repository name format: {repo}"

    return True, ""

def validate_config() -> Tuple[bool, List[str], List[str]]:
    """
    Validate the current configuration.

    Returns:
        Tuple of (is_valid, errors, warnings)
    """
    errors = []
    warnings = []

    # Required configuration
    if not AZURE_DEVOPS_PAT:
        errors.append("AZURE_DEVOPS_PAT is required")

    if not AZURE_DEVOPS_ORG:
        errors.append("AZURE_DEVOPS_ORG is required (format: https://dev.azure.com/yourorg)")

    if not AZURE_DEVOPS_PROJECT:
        errors.append("AZURE_DEVOPS_PROJECT is required")

    if not REPO_NAME:
        errors.append("REPO_NAME is required")

    # Validate repository names
    if REPO_NAME:
        repos = parse_repo_names(REPO_NAME)
        for repo in repos:
            is_valid, error = validate_repo_name(repo)
            if not is_valid:
                errors.append(error)

    # Validate Azure DevOps organization URL
    if AZURE_DEVOPS_ORG and not AZURE_DEVOPS_ORG.startswith('https://dev.azure.com/'):
        errors.append("AZURE_DEVOPS_ORG must start with 'https://dev.azure.com/'")

    # Validate weeks back
    if WEEKS_BACK <= 0:
        errors.append("WEEKS_BACK must be a positive integer")

    # Validate automated date if provided
    if AUTOMATED_DATE:
        try:
            datetime.fromisoformat(AUTOMATED_DATE.replace('Z', '+00:00'))
        except ValueError:
            errors.append("AUTOMATED_DATE must be in ISO format (YYYY-MM-DDTHH:MM:SSZ)")

    # Warnings
    if WEEKS_BACK > 52:
        warnings.append(f"WEEKS_BACK is {WEEKS_BACK} weeks (>1 year). This may take a long time.")

    if not AUTOMATED_DATE:
        warnings.append("AUTOMATED_DATE not set. Using current time as automation date.")

    return len(errors) == 0, errors, warnings

def prompt_for_config() -> Optional[Dict[str, str]]:
    """
    Prompt user for missing configuration interactively.

    Returns:
        Dictionary with configuration values or None if cancelled
    """
    print("\n" + "="*60)
    print("INTERACTIVE CONFIGURATION SETUP")
    print("="*60)

    config = {}

    # Azure DevOps PAT
    if not AZURE_DEVOPS_PAT:
        pat = getpass.getpass("Enter your Azure DevOps Personal Access Token: ").strip()
        if not pat:
            print("Azure DevOps PAT is required. Cancelling setup.")
            return None
        config['azure_devops_pat'] = pat
    else:
        config['azure_devops_pat'] = AZURE_DEVOPS_PAT

    # Azure DevOps Organization
    if not AZURE_DEVOPS_ORG:
        org = input("Enter your Azure DevOps organization URL (https://dev.azure.com/yourorg): ").strip()
        if not org:
            print("Azure DevOps organization is required. Cancelling setup.")
            return None
        if not org.startswith('https://dev.azure.com/'):
            org = f"https://dev.azure.com/{org}"
        config['azure_devops_org'] = org
    else:
        config['azure_devops_org'] = AZURE_DEVOPS_ORG

    # Azure DevOps Project
    if not AZURE_DEVOPS_PROJECT:
        project = input("Enter your Azure DevOps project name: ").strip()
        if not project:
            print("Azure DevOps project is required. Cancelling setup.")
            return None
        config['azure_devops_project'] = project
    else:
        config['azure_devops_project'] = AZURE_DEVOPS_PROJECT

    # Repository name
    if not REPO_NAME:
        repo = input("Enter repository name(s) (separate multiple with semicolons): ").strip()
        if not repo:
            print("Repository name is required. Cancelling setup.")
            return None
        config['repo_name'] = repo
    else:
        config['repo_name'] = REPO_NAME

    # Weeks back
    weeks_input = input(f"Enter number of weeks to analyze [{WEEKS_BACK}]: ").strip()
    if weeks_input:
        try:
            weeks = int(weeks_input)
            if weeks <= 0:
                print("Weeks must be positive. Using default.")
                weeks = WEEKS_BACK
        except ValueError:
            print("Invalid number. Using default.")
            weeks = WEEKS_BACK
    else:
        weeks = WEEKS_BACK
    config['weeks_back'] = weeks

    # Automated date
    auto_date_input = input(f"Enter automation date (YYYY-MM-DDTHH:MM:SSZ) or press Enter for current time: ").strip()
    if auto_date_input:
        try:
            datetime.fromisoformat(auto_date_input.replace('Z', '+00:00'))
            config['automated_date'] = auto_date_input
        except ValueError:
            print("Invalid date format. Using current time.")
            config['automated_date'] = datetime.now().isoformat() + 'Z'
    else:
        config['automated_date'] = datetime.now().isoformat() + 'Z'

    # Branch
    branch_input = input(f"Enter target branch name (or press Enter for all branches): ").strip()
    config['branch'] = branch_input

    # API version
    config['api_version'] = API_VERSION

    return config

def get_manual_metrics_from_user() -> Dict[str, float]:
    """
    Prompt user for manual metrics input.

    Returns:
        Dictionary with manual metrics or empty dict if skipped
    """
    print("\n" + "="*60)
    print("MANUAL METRICS INPUT (Optional)")
    print("="*60)
    print("You can provide manual metrics for comparison.")
    print("Press Enter to skip any metric.")

    manual_metrics = {}

    # Average first review time
    first_review_input = input("Average first review time (hours): ").strip()
    if first_review_input:
        try:
            manual_metrics['average_first_review_time_hours'] = float(first_review_input)
        except ValueError:
            print("Invalid number for first review time. Skipping.")

    # Average remediation time
    remediation_input = input("Average remediation time (hours): ").strip()
    if remediation_input:
        try:
            manual_metrics['average_remediation_time_hours'] = float(remediation_input)
        except ValueError:
            print("Invalid number for remediation time. Skipping.")

    return manual_metrics

class OptimizedAzureDevOpsMetricsCalculator:
    """
    Optimized metrics calculator using Azure DevOps REST API and parallel processing.

    This version includes enhanced data collection for detailed PR output
    and contributor email mapping, maintaining compatibility with GitHub script output.
    """

    def __init__(self, azure_org: str, project: str, repo: str, pat: str, branch: str = '',
                 automated_date: str = '', api_version: str = '7.0'):
        """
        Initialize the Azure DevOps metrics calculator.

        Args:
            azure_org: Azure DevOps organization URL
            project: Project name
            repo: Repository name
            pat: Personal Access Token
            branch: Target branch (empty for all branches)
            automated_date: Automation date in ISO format
            api_version: Azure DevOps API version
        """
        self.azure_org = azure_org.rstrip('/')
        self.project = project
        self.repo = repo
        self.pat = pat
        self.branch = branch
        self.automated_date = automated_date
        self.api_version = api_version

        # Setup session with authentication
        self.session = requests.Session()
        credentials = f":{pat}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        self.session.headers.update({
            'Authorization': f'Basic {encoded_credentials}',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })

        # Initialize cache and contributor tracking
        self.cache = ResponseCache()
        self.contributor_emails = defaultdict(set)

        # Rate limiting
        self.rate_limit_semaphore = Semaphore(MAX_PARALLEL_REQUESTS)

        print(f"Initialized Azure DevOps calculator for {azure_org}/{project}/{repo}")
        if branch:
            print(f"Target branch: {branch}")
        else:
            print("Analyzing all branches")

    def _get_api_url(self, endpoint: str) -> str:
        """Get full API URL for an endpoint"""
        return f"{self.azure_org}/{self.project}/_apis/{endpoint}?api-version={self.api_version}"

    def _parse_automation_date(self) -> datetime:
        """Parse the automation date or use current time"""
        if self.automated_date:
            return datetime.fromisoformat(self.automated_date.replace('Z', '+00:00'))
        return datetime.now()

    def _format_datetime(self, dt: datetime) -> str:
        """Format datetime for API calls"""
        return dt.isoformat().replace('+00:00', 'Z')

    def check_rate_limit(self):
        """Check and handle rate limiting"""
        global remaining_requests
        with rate_limit_lock:
            if remaining_requests < RATE_LIMIT_BUFFER:
                print(f"Rate limit buffer reached. Waiting 60 seconds...")
                time.sleep(60)
                remaining_requests = 5000  # Reset estimate

    def update_rate_limit(self, response: requests.Response):
        """Update rate limit tracking from response headers"""
        global remaining_requests
        # Azure DevOps doesn't provide rate limit headers like GitHub
        # We'll use a simple estimation approach
        with rate_limit_lock:
            remaining_requests -= 1

    def api_request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Make an authenticated API request with rate limit handling"""
        cached = self.cache.get('api', endpoint, params)
        if cached:
            return cached

        self.check_rate_limit()

        try:
            url = self._get_api_url(endpoint)
            response = self.session.get(url, params=params or {}, timeout=30)
            self.update_rate_limit(response)

            if response.status_code == 200:
                result = response.json()
                self.cache.set(result, 'api', endpoint, params)
                return result
            elif response.status_code == 429:
                print(f"Rate limit hit. Waiting...")
                time.sleep(60)
                return self.api_request(endpoint, params)
            else:
                print(f"API request failed: {response.status_code} - {endpoint}")
                print(f"Response: {response.text[:200]}...")
                return None
        except Exception as e:
            print(f"API error: {e}")
            return None

    def collect_contributor_emails(self, pr_data: Dict):
        """Collect contributor email addresses from PR data"""
        # Collect author email
        author = pr_data.get('createdBy', {})
        if author and not self._is_bot_user(author):
            username = author.get('uniqueName', author.get('displayName', ''))
            email = author.get('uniqueName', '')  # uniqueName is usually email in Azure DevOps
            if username and email and '@' in email:
                self.contributor_emails[username].add(email)

        # Also track reviewers and commenters (they might have commits too)
        # We'll collect their emails when we process their PRs as authors

    def _is_bot_user(self, user: Dict) -> bool:
        """Check if a user is a bot based on Azure DevOps user data"""
        if not user:
            return True

        display_name = user.get('displayName', '').lower()
        unique_name = user.get('uniqueName', '').lower()

        # Common bot patterns in Azure DevOps
        bot_patterns = [
            'build service', 'azure devops', 'system', 'service account',
            'automation', 'bot', 'ci/cd', 'pipeline'
        ]

        for pattern in bot_patterns:
            if pattern in display_name or pattern in unique_name:
                return True

        return False

    def fetch_prs_batch(self, start_date: str, end_date: str, skip: int = 0) -> Dict:
        """Fetch a batch of PRs with all their data using Azure DevOps REST API"""

        # Azure DevOps API date filtering is unreliable, so fetch all PRs and filter client-side
        params = {
            '$top': BATCH_SIZE,
            '$skip': skip,
            'searchCriteria.status': 'all'
        }

        if self.branch:
            params['searchCriteria.targetRefName'] = f"refs/heads/{self.branch}"

        endpoint = f"git/repositories/{self.repo}/pullrequests"

        # Add date range to params for cache key uniqueness
        params['_date_range'] = f"{start_date}_to_{end_date}"

        result = self.api_request(endpoint, params)

        # Client-side date filtering
        if result and 'value' in result:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

            filtered_prs = []
            for pr in result['value']:
                created_at = pr.get('creationDate', '')
                if created_at:
                    try:
                        created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        if start_dt <= created_dt <= end_dt:
                            filtered_prs.append(pr)
                    except:
                        continue

            # Return filtered result
            print(f"    Filtered {len(filtered_prs)} PRs from {len(result['value'])} total PRs")
            result['value'] = filtered_prs

        return result

    def fetch_pr_details(self, pr_id: int) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """Fetch detailed PR data: commits, comments, and reviews"""

        # Fetch commits
        commits_endpoint = f"git/repositories/{self.repo}/pullrequests/{pr_id}/commits"
        commits_response = self.api_request(commits_endpoint)
        commits = commits_response.get('value', []) if commits_response else []

        # Fetch threads (comments and reviews)
        threads_endpoint = f"git/repositories/{self.repo}/pullrequests/{pr_id}/threads"
        threads_response = self.api_request(threads_endpoint)
        threads = threads_response.get('value', []) if threads_response else []

        # Separate comments and reviews from threads
        comments = []
        reviews = []

        for thread in threads:
            thread_comments = thread.get('comments', [])
            for comment in thread_comments:
                comment_data = {
                    'id': comment.get('id'),
                    'content': comment.get('content'),
                    'author': comment.get('author'),
                    'publishedDate': comment.get('publishedDate'),
                    'commentType': comment.get('commentType', 'text')
                }

                # Determine if this is a review or regular comment
                if comment.get('commentType') == 'system' or thread.get('isDeleted'):
                    continue
                elif comment.get('commentType') in ['codeChange', 'text']:
                    comments.append(comment_data)
                else:
                    reviews.append(comment_data)

        # Fetch reviewers
        reviewers_endpoint = f"git/repositories/{self.repo}/pullrequests/{pr_id}/reviewers"
        reviewers_response = self.api_request(reviewers_endpoint)
        reviewers = reviewers_response.get('value', []) if reviewers_response else []

        return commits, comments, reviewers

    def process_pr_data(self, pr_raw: Dict) -> Optional[PRData]:
        """Process raw Azure DevOps PR data into standardized PRData format"""
        try:
            pr_id = pr_raw.get('pullRequestId')
            if not pr_id:
                return None

            # Fetch detailed data
            commits, comments, reviewers = self.fetch_pr_details(pr_id)

            # Extract basic PR info
            author_info = pr_raw.get('createdBy', {})
            author = author_info.get('uniqueName', author_info.get('displayName', 'Unknown'))
            is_bot_author = self._is_bot_user(author_info)

            # Map Azure DevOps status to GitHub-like states
            status = pr_raw.get('status', 'active').lower()
            if status == 'completed':
                state = 'merged' if pr_raw.get('mergeStatus') == 'succeeded' else 'closed'
            elif status == 'abandoned':
                state = 'closed'
            else:
                state = 'open'

            # Extract dates
            created_at = pr_raw.get('creationDate', '')
            closed_at = pr_raw.get('closedDate', '') if status in ['completed', 'abandoned'] else None
            merged_at = closed_at if state == 'merged' else None

            # Process comments and reviews
            commenters = set()
            review_comments_count = 0
            issue_comments_count = len(comments)

            for comment in comments:
                comment_author = comment.get('author', {})
                if comment_author and not self._is_bot_user(comment_author):
                    author_name = comment_author.get('uniqueName', comment_author.get('displayName', ''))
                    if author_name:
                        commenters.add(author_name)

            # Process reviewers
            reviewer_set = set()
            for reviewer in reviewers:
                if reviewer and not self._is_bot_user(reviewer):
                    reviewer_name = reviewer.get('uniqueName', reviewer.get('displayName', ''))
                    if reviewer_name:
                        reviewer_set.add(reviewer_name)

            # Count review comments (from reviewers)
            review_comments_count = len([c for c in comments if
                                       c.get('author', {}).get('uniqueName', '') in reviewer_set])

            # Calculate additions/deletions (not directly available in Azure DevOps PR API)
            # We'll estimate from commit data or set to 0
            additions = 0
            deletions = 0

            # Process timeline items (combine comments and reviews)
            timeline_items = []
            for comment in comments:
                timeline_items.append({
                    'type': 'IssueComment',
                    'author': comment.get('author', {}).get('uniqueName', ''),
                    'created_at': comment.get('publishedDate', ''),
                    'content': comment.get('content', '')
                })

            # Collect contributor emails
            self.collect_contributor_emails(pr_raw)

            return PRData(
                number=pr_id,
                created_at=created_at,
                merged_at=merged_at,
                closed_at=closed_at,
                author=author,
                is_bot_author=is_bot_author,
                title=pr_raw.get('title', ''),
                state=state,
                comments_count=issue_comments_count,
                review_comments_count=review_comments_count,
                reviews=[{'user': {'login': r.get('uniqueName', '')}, 'created_at': r.get('createdDate', '')}
                        for r in reviewers],
                commits=[{'commit': {'author': {'name': c.get('author', {}).get('name', ''),
                                              'email': c.get('author', {}).get('email', ''),
                                              'date': c.get('author', {}).get('date', '')},
                                   'committer': {'date': c.get('committer', {}).get('date', '')}}}
                        for c in commits],
                commenters=commenters,
                reviewers=reviewer_set,
                additions=additions,
                deletions=deletions,
                timeline_items=timeline_items
            )

        except Exception as e:
            print(f"Error processing PR {pr_raw.get('pullRequestId', 'unknown')}: {e}")
            return None

    def get_pull_requests_optimized(self, weeks_back: int, start_date: str, end_date: str,
                                   period_name: str) -> Tuple[List[PRData], int]:
        """
        Fetch all PRs for the specified time period using optimized approach.

        Returns:
            Tuple of (list of PRData objects, failed_pr_count)
        """
        print(f"\nFetching {period_name} PRs from Azure DevOps...")
        print(f"Date range: {start_date} to {end_date}")

        all_prs = []
        failed_pr_count = 0
        skip = 0
        has_more = True
        batch_count = 0

        while has_more:
            batch_count += 1
            print(f"  Fetching batch {batch_count}...")

            try:
                result = self.fetch_prs_batch(start_date, end_date, skip)
                if not result or 'value' not in result:
                    print(f"  Warning: Batch {batch_count} returned no data. Stopping...")
                    break

                pr_batch = result['value']
                if not pr_batch:
                    print(f"  No more PRs found. Stopping...")
                    break

                print(f"  Processing {len(pr_batch)} PRs from batch {batch_count}...")

                # Process PRs in parallel
                with ThreadPoolExecutor(max_workers=MAX_PARALLEL_REQUESTS) as executor:
                    future_to_pr = {
                        executor.submit(self.process_pr_data, pr_raw): pr_raw
                        for pr_raw in pr_batch
                    }

                    for future in as_completed(future_to_pr):
                        pr_raw = future_to_pr[future]
                        try:
                            pr_data = future.result()
                            if pr_data:
                                all_prs.append(pr_data)
                            else:
                                failed_pr_count += 1
                        except Exception as e:
                            print(f"  Error processing PR {pr_raw.get('pullRequestId', 'unknown')}: {e}")
                            failed_pr_count += 1

                # Check if we have more data
                skip += len(pr_batch)
                has_more = len(pr_batch) == BATCH_SIZE

                print(f"  Batch {batch_count} complete. Total PRs so far: {len(all_prs)}")

            except Exception as e:
                print(f"  Error fetching batch {batch_count}: {e}")
                break

        print(f"\nCompleted fetching {period_name} PRs:")
        print(f"  Total PRs found: {len(all_prs)}")
        print(f"  Failed to process: {failed_pr_count}")

        return all_prs, failed_pr_count

    def calculate_date_range(self, weeks_back: int, end_date_override: datetime = None) -> tuple:
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

    def get_time_to_first_comment(self, pr: PRData) -> Optional[float]:
        """Calculate time to first comment for a PR in hours"""
        pr_created_at = datetime.fromisoformat(pr.created_at.replace('Z', '+00:00'))
        earliest_time = None

        # Check reviews for earliest comment
        for review in pr.reviews:
            if review.get('created_at'):
                review_time = datetime.fromisoformat(review['created_at'].replace('Z', '+00:00'))
                if review['user']['login'] != pr.author:
                    if earliest_time is None or review_time < earliest_time:
                        earliest_time = review_time

        if earliest_time is None:
            return None

        time_diff = (earliest_time - pr_created_at).total_seconds() / 3600
        return round(time_diff, 2)

    def get_time_from_first_comment_to_followup_commit(self, pr: PRData) -> Optional[float]:
        """Calculate time from first comment to follow-up commit by PR author in hours"""
        # Get first comment time
        first_comment_time = None
        for review in pr.reviews:
            if review.get('created_at') and review['user']['login'] != pr.author:
                review_time = datetime.fromisoformat(review['created_at'].replace('Z', '+00:00'))
                if first_comment_time is None or review_time < first_comment_time:
                    first_comment_time = review_time

        if first_comment_time is None:
            return None

        # Find first commit after first comment
        earliest_followup = None
        for commit in pr.commits:
            commit_date_str = commit.get('commit', {}).get('committer', {}).get('date', '')
            if commit_date_str:
                commit_date = datetime.fromisoformat(commit_date_str.replace('Z', '+00:00'))
                if commit_date > first_comment_time:
                    # Check if commit author matches PR author
                    commit_author_name = commit.get('commit', {}).get('author', {}).get('name', '')
                    if commit_author_name and commit_author_name == pr.author:
                        if earliest_followup is None or commit_date < earliest_followup:
                            earliest_followup = commit_date

        if earliest_followup is None:
            return None

        time_diff = (earliest_followup - first_comment_time).total_seconds() / 3600
        return round(time_diff, 2)

    def calculate_metrics_for_period_optimized(self, weeks_back: int, start_date: str, end_date: str,
                                              period_name: str, manual_metrics: Dict[str, float] = None) -> Dict[str, Any]:
        """
        Calculate metrics for a specific time period using optimized approach.

        NEW: Returns enhanced metrics including detailed PR data for export and failure tracking.
        """
        print(f"\nCalculating {period_name} metrics for {self.azure_org}/{self.project}/{self.repo} over {weeks_back} week(s)...")
        print(f"Date range: {start_date} to {end_date}")

        # Fetch PRs using optimized approach
        prs, failed_pr_count = self.get_pull_requests_optimized(weeks_back, start_date, end_date, period_name)

        if not prs:
            print(f"No pull requests found in the {period_name} time period.")
            return {
                'failed_prs': failed_pr_count,
                'successfully_processed_prs': 0
            }

        total_prs = len(prs)
        merged_prs = 0
        total_comments = 0
        total_time_to_merge = 0
        merge_count = 0

        # Metrics tracking
        time_to_first_comment_values = []
        time_from_first_comment_to_followup_values = []
        unique_contributors = set()

        # NEW: Collect PR details for export
        pr_details = []

        # Process PRs with progress tracking
        progress = ProgressTracker(total_prs, f"Processing {period_name} PRs")

        for pr in prs:
            # Count comments
            total_comments += pr.comments_count + pr.review_comments_count

            # Add contributors
            if not pr.is_bot_author:
                unique_contributors.add(pr.author)
            unique_contributors.update(pr.reviewers)
            unique_contributors.update(pr.commenters)

            # Check if merged
            if pr.merged_at:
                merged_prs += 1
                created_at = datetime.fromisoformat(pr.created_at.replace('Z', '+00:00'))
                merged_at = datetime.fromisoformat(pr.merged_at.replace('Z', '+00:00'))
                time_to_merge = (merged_at - created_at).total_seconds() / 3600
                total_time_to_merge += time_to_merge
                merge_count += 1

            # Calculate time metrics
            time_to_first = self.get_time_to_first_comment(pr)
            if time_to_first is not None:
                time_to_first_comment_values.append(time_to_first)

            time_to_followup = self.get_time_from_first_comment_to_followup_commit(pr)
            if time_to_followup is not None:
                time_from_first_comment_to_followup_values.append(time_to_followup)

            # NEW: Add PR summary to details list
            pr_details.append(pr.to_summary_dict())

            progress.update()

        # Calculate averages
        prs_per_week = total_prs / weeks_back
        merged_prs_per_week = merged_prs / weeks_back
        avg_comments_per_pr = total_comments / total_prs if total_prs > 0 else 0
        avg_time_to_merge = total_time_to_merge / merge_count if merge_count > 0 else 0

        avg_time_to_first_comment = (
            sum(time_to_first_comment_values) / len(time_to_first_comment_values)
            if time_to_first_comment_values else 0
        )
        avg_time_from_first_comment_to_followup = (
            sum(time_from_first_comment_to_followup_values) / len(time_from_first_comment_to_followup_values)
            if time_from_first_comment_to_followup_values else 0
        )

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
            'average_time_to_first_comment_hours': round(avg_time_to_first_comment, 2),
            'average_time_from_first_comment_to_followup_commit_hours': round(avg_time_from_first_comment_to_followup, 2),
            'unique_contributors_count': len(unique_contributors),
            'pr_details': pr_details,  # NEW: Include detailed PR data
            'failed_prs': failed_pr_count,  # NEW: Track failed PRs
            'successfully_processed_prs': total_prs  # NEW: Track successfully processed PRs
        }

        if manual_metrics:
            result.update(manual_metrics)

        return result

    def calculate_comparative_metrics(self, weeks_back: int, manual_metrics: Dict[str, float] = None) -> Dict[str, Any]:
        """Calculate comparative metrics for before and after automation periods"""
        print(f"\n{'='*70}")
        print(f"Starting OPTIMIZED comparative analysis for {self.azure_org}/{self.project}/{self.repo}...")
        print(f"Using Azure DevOps REST API for batch fetching and parallel processing")
        print(f"With detailed PR data export and contributor mapping")
        print(f"{'='*70}")

        branch_info = self.branch if self.branch else "ALL branches"
        print(f"Branch: {branch_info}")
        print(f"Weeks back for each period: {weeks_back}")

        # Calculate date ranges
        before_start, before_end = self.calculate_before_auto_date_range(weeks_back)
        after_start, after_end = self.calculate_after_auto_date_range(weeks_back)

        print(f"Before automation period: {before_start} to {before_end}")
        print(f"After automation period: {after_start} to {after_end}")

        # Calculate metrics for both periods
        before_metrics = self.calculate_metrics_for_period_optimized(
            weeks_back, before_start, before_end, "beforeAuto", manual_metrics
        )
        after_metrics = self.calculate_metrics_for_period_optimized(
            weeks_back, after_start, after_end, "afterAuto", manual_metrics
        )

        return {
            'beforeAuto': before_metrics,
            'afterAuto': after_metrics,
            'contributor_emails': dict(self.contributor_emails)  # NEW: Include contributor mapping
        }

# CSV Output Functions - Identical to GitHub script for compatibility

def format_metric_value(value, secondary_value=None, formatter=None):
    """Format a metric value for display"""
    if formatter:
        return formatter(value, secondary_value)

    if isinstance(value, (int, float)):
        if value == int(value):
            return str(int(value))
        else:
            return f"{value:.2f}"

    return str(value) if value is not None else ""

def format_comparison_table(before_metrics: Dict[str, Any], after_metrics: Dict[str, Any]) -> str:
    """Format metrics comparison as a readable table"""

    # Define metrics to display with their formatting
    metric_data = [
        ('analysis_start_date', 'analysis_end_date', 'Date Range', lambda s, e: f"{s} to {e}"),
        ('total_prs', None, 'Total Pull Requests Created', lambda v, _: str(v)),
        ('merged_prs', None, 'Total Pull Requests Merged', lambda v, _: str(v)),
        ('successfully_processed_prs', None, 'Successfully Processed PRs', lambda v, _: str(v)),
        ('failed_prs', None, 'Failed to Process PRs', lambda v, _: str(v)),
        ('prs_created_per_week', None, 'Pull Requests Created per Week', lambda v, _: str(v)),
        ('prs_merged_per_week', None, 'Pull Requests Merged per Week', lambda v, _: str(v)),
        ('average_comments_per_pr', None, 'Average Comments per PR', lambda v, _: str(v)),
        ('average_time_to_merge_hours', 'average_time_to_merge_days', 'Average Time to Merge',
         lambda h, d: f"{h} hours ({d} days)"),
        ('average_time_to_first_comment_hours', None, 'Average Time to First Comment (hours)', lambda v, _: str(v)),
        ('average_time_from_first_comment_to_followup_commit_hours', None,
         'Average Time from First Comment to Follow-up Commit (hours)', lambda v, _: str(v)),
        ('unique_contributors_count', None, 'Unique Contributors', lambda v, _: str(v)),
        ('average_first_review_time_hours', None, 'Average First Review Time (hours)', lambda v, _: str(v) if v else "N/A"),
        ('average_remediation_time_hours', None, 'Average Remediation Time (hours)', lambda v, _: str(v) if v else "N/A"),
    ]

    # Build table
    table_lines = []
    table_lines.append("=" * 100)
    table_lines.append(f"{'Metric':<60} {'Before Auto':<18} {'After Auto':<18}")
    table_lines.append("=" * 100)

    for metric_info in metric_data:
        primary_key = metric_info[0]
        secondary_key = metric_info[1]
        display_name = metric_info[2]
        formatter = metric_info[3] if len(metric_info) > 3 else None

        # Get values
        before_primary = before_metrics.get(primary_key, 0)
        before_secondary = before_metrics.get(secondary_key, 0) if secondary_key else None
        after_primary = after_metrics.get(primary_key, 0)
        after_secondary = after_metrics.get(secondary_key, 0) if secondary_key else None

        # Format values
        before_str = format_metric_value(before_primary, before_secondary, formatter)
        after_str = format_metric_value(after_primary, after_secondary, formatter)

        table_lines.append(f"{display_name:<60} {before_str:<18} {after_str:<18}")

    table_lines.append("=" * 100)

    return "\n".join(table_lines)

def get_pr_csv_columns() -> List[str]:
    """Get the ordered list of CSV column names for PR output (25 columns)."""
    return [
        "repo", "number", "title", "author", "state", "merged",
        "created_at", "first_comment_at", "first_followup_commit_at",
        "merged_at", "closed_at", "time_to_first_comment_hours",
        "time_from_first_comment_to_merge_hours",
        "time_from_first_comment_to_followup_commit_hours",
        "time_to_merge_hours", "time_to_close_hours",
        "first_comment_type", "first_comment_author",
        "total_loc_updated", "total_commits", "commits_before_merge",
        "total_comments", "issue_comments", "review_comments",
        "review_submissions",
    ]

def get_summary_csv_columns() -> List[str]:
    """Get the ordered list of CSV column names for summary metrics."""
    return [
        "period", "total_prs", "merged_prs", "successfully_processed_prs", "failed_prs",
        "weeks_analyzed", "analysis_start_date", "analysis_end_date",
        "prs_created_per_week", "prs_merged_per_week",
        "average_comments_per_pr", "average_time_to_merge_hours",
        "average_time_to_merge_days", "average_time_to_first_comment_hours",
        "average_time_from_first_comment_to_followup_commit_hours",
        "unique_contributors_count", "average_first_review_time_hours",
        "average_remediation_time_hours",
    ]

def get_contributor_csv_columns() -> List[str]:
    """Get the ordered list of CSV column names for contributor mapping."""
    return ["azure_devops_username", "emails"]

def flatten_pr_for_csv(pr: Dict[str, Any], repo_name: str) -> Dict[str, str]:
    """Flatten PR record for CSV output with all metrics calculated."""
    columns = get_pr_csv_columns()
    flattened = {col: "" for col in columns}

    # Basic PR info
    flattened["repo"] = repo_name
    flattened["number"] = str(pr.get("number", ""))
    flattened["title"] = pr.get("title", "")
    flattened["author"] = pr.get("author", "")
    flattened["state"] = pr.get("state", "")
    flattened["merged"] = "TRUE" if pr.get("merged_at") else "FALSE"
    flattened["created_at"] = pr.get("created_at", "")
    flattened["merged_at"] = pr.get("merged_at", "")
    flattened["closed_at"] = pr.get("closed_at", "")

    # Calculate first comment info
    first_comment_at = None
    first_comment_type = ""
    first_comment_author = ""

    timeline_items = pr.get("timeline_items", [])
    if timeline_items:
        # Sort by created_at to find the first comment
        sorted_items = sorted(timeline_items, key=lambda x: x.get("created_at", ""))
        if sorted_items:
            first_item = sorted_items[0]
            first_comment_at = first_item.get("created_at")
            first_comment_type = first_item.get("type", "")
            first_comment_author = first_item.get("author", "")

    flattened["first_comment_at"] = first_comment_at if first_comment_at else ""
    flattened["first_comment_type"] = first_comment_type
    flattened["first_comment_author"] = first_comment_author

    # Calculate time metrics
    created_at = pr.get("created_at", "")
    if created_at and first_comment_at:
        try:
            created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            first_comment_dt = datetime.fromisoformat(first_comment_at.replace('Z', '+00:00'))
            time_to_first_comment = (first_comment_dt - created_dt).total_seconds() / 3600
            flattened["time_to_first_comment_hours"] = str(round(time_to_first_comment, 2))
        except:
            pass

    # Calculate time to merge
    merged_at = pr.get("merged_at", "")
    if created_at and merged_at:
        try:
            created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            merged_dt = datetime.fromisoformat(merged_at.replace('Z', '+00:00'))
            time_to_merge = (merged_dt - created_dt).total_seconds() / 3600
            flattened["time_to_merge_hours"] = str(round(time_to_merge, 2))

            # Calculate time from first comment to merge
            if first_comment_at:
                first_comment_dt = datetime.fromisoformat(first_comment_at.replace('Z', '+00:00'))
                time_from_comment_to_merge = (merged_dt - first_comment_dt).total_seconds() / 3600
                flattened["time_from_first_comment_to_merge_hours"] = str(round(time_from_comment_to_merge, 2))
        except:
            pass

    # Calculate time to close
    closed_at = pr.get("closed_at", "")
    if created_at and closed_at:
        try:
            created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            closed_dt = datetime.fromisoformat(closed_at.replace('Z', '+00:00'))
            time_to_close = (closed_dt - created_dt).total_seconds() / 3600
            flattened["time_to_close_hours"] = str(round(time_to_close, 2))
        except:
            pass

    # Calculate first followup commit time
    commits = pr.get("commits", [])
    if commits and first_comment_at:
        try:
            first_comment_dt = datetime.fromisoformat(first_comment_at.replace('Z', '+00:00'))
            earliest_followup = None

            for commit in commits:
                commit_date_str = commit.get('commit', {}).get('committer', {}).get('date', '')
                if commit_date_str:
                    commit_date = datetime.fromisoformat(commit_date_str.replace('Z', '+00:00'))
                    if commit_date > first_comment_dt:
                        if earliest_followup is None or commit_date < earliest_followup:
                            earliest_followup = commit_date

            if earliest_followup:
                flattened["first_followup_commit_at"] = earliest_followup.isoformat() + 'Z'
                time_to_followup = (earliest_followup - first_comment_dt).total_seconds() / 3600
                flattened["time_from_first_comment_to_followup_commit_hours"] = str(round(time_to_followup, 2))
        except:
            pass

    # Calculate commit and LOC metrics
    total_commits = len(commits)
    flattened["total_commits"] = str(total_commits)

    # Count commits before merge
    commits_before_merge = total_commits
    if merged_at:
        try:
            merged_dt = datetime.fromisoformat(merged_at.replace('Z', '+00:00'))
            commits_before_merge = 0
            for commit in commits:
                commit_date_str = commit.get('commit', {}).get('committer', {}).get('date', '')
                if commit_date_str:
                    commit_date = datetime.fromisoformat(commit_date_str.replace('Z', '+00:00'))
                    if commit_date <= merged_dt:
                        commits_before_merge += 1
        except:
            pass

    flattened["commits_before_merge"] = str(commits_before_merge)

    # LOC metrics (additions + deletions)
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    flattened["total_loc_updated"] = str(additions + deletions)

    # Comment metrics
    issue_comments = pr.get("comments_count", 0)
    review_comments = pr.get("review_comments_count", 0)
    total_comments = issue_comments + review_comments

    flattened["total_comments"] = str(total_comments)
    flattened["issue_comments"] = str(issue_comments)
    flattened["review_comments"] = str(review_comments)

    # Review submissions (count of unique reviewers)
    reviewers = pr.get("reviewers", [])
    flattened["review_submissions"] = str(len(reviewers))

    return flattened

def write_summary_csv(file_path: str, before_metrics: Dict[str, Any], after_metrics: Dict[str, Any]) -> None:
    """Write summary metrics to CSV file."""
    columns = get_summary_csv_columns()

    # Prepare rows
    rows = []
    for period_name, metrics in [("beforeAuto", before_metrics), ("afterAuto", after_metrics)]:
        row = {"period": period_name}
        for col in columns[1:]:  # Skip 'period' column
            row[col] = str(metrics.get(col, ""))
        rows.append(row)

    try:
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(rows)
        print(f"✓ Summary CSV written: {file_path}")
    except IOError as e:
        print(f"✗ Error writing summary CSV: {e}")

def write_pr_csv(file_path: str, pr_details: List[Dict[str, Any]], repo_name: str) -> None:
    """Write PR details to CSV file."""
    columns = get_pr_csv_columns()
    flattened_prs = [flatten_pr_for_csv(pr, repo_name) for pr in pr_details]

    try:
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(flattened_prs)
        print(f"✓ PR CSV written: {file_path} ({len(flattened_prs)} records)")
    except IOError as e:
        print(f"✗ Error writing PR CSV: {e}")

def write_contributor_csv(file_path: str, contributor_emails: Dict[str, Set[str]]) -> None:
    """Write contributor email mapping to CSV file."""
    columns = get_contributor_csv_columns()

    rows = []
    for username, emails in contributor_emails.items():
        rows.append({
            "azure_devops_username": username,
            "emails": "; ".join(sorted(emails))
        })

    # Sort by username
    rows.sort(key=lambda x: x["azure_devops_username"])

    try:
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(rows)
        print(f"✓ Contributor CSV written: {file_path} ({len(rows)} contributors)")
    except IOError as e:
        print(f"✗ Error writing contributor CSV: {e}")

def create_results_zip(file_paths: List[str], zip_filename: str) -> None:
    """Create a ZIP archive containing all generated files."""
    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_path in file_paths:
                if os.path.exists(file_path):
                    # Use just the filename in the ZIP (no directory structure)
                    arcname = os.path.basename(file_path)
                    zipf.write(file_path, arcname)
                    print(f"  Added to ZIP: {arcname}")
                else:
                    print(f"  Warning: File not found: {file_path}")

        print(f"✓ ZIP archive created: {zip_filename}")

        # Show ZIP contents
        with zipfile.ZipFile(zip_filename, 'r') as zipf:
            file_list = zipf.namelist()
            total_size = sum(zipf.getinfo(name).file_size for name in file_list)
            print(f"  Contains {len(file_list)} files, total size: {total_size:,} bytes")

    except Exception as e:
        print(f"✗ Error creating ZIP archive: {e}")

def process_single_repository(repo_name: str, azure_org: str, project: str, pat: str, weeks_back: int,
                             automated_date: str, branch: str, api_version: str) -> List[str]:
    """
    Process a single repository and generate CSV files.

    Args:
        repo_name: Repository name
        azure_org: Azure DevOps organization URL
        project: Project name
        pat: Personal Access Token
        weeks_back: Number of weeks to analyze
        automated_date: Automation date in ISO format
        branch: Branch to analyze (empty for all)
        api_version: Azure DevOps API version

    Returns:
        List of generated CSV file paths
    """
    print(f"\n{'='*70}")
    print(f"Processing repository: {azure_org}/{project}/{repo_name}")
    print(f"{'='*70}")

    generated_files = []

    try:
        # Initialize calculator
        calculator = OptimizedAzureDevOpsMetricsCalculator(
            azure_org=azure_org,
            project=project,
            repo=repo_name,
            pat=pat,
            branch=branch,
            automated_date=automated_date,
            api_version=api_version
        )

        # Get manual metrics if needed
        manual_metrics = get_manual_metrics_from_user() if not automated_date else {}

        # Calculate comparative metrics
        results = calculator.calculate_comparative_metrics(weeks_back, manual_metrics)

        before_metrics = results['beforeAuto']
        after_metrics = results['afterAuto']
        contributor_emails = results['contributor_emails']

        # Display results table
        print(f"\n{'='*70}")
        print("METRICS COMPARISON RESULTS")
        print(f"{'='*70}")
        comparison_table = format_comparison_table(before_metrics, after_metrics)
        print(comparison_table)

        # Generate file names with timestamp and repo name
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_repo_name = re.sub(r'[^\w\-_.]', '_', repo_name)

        # Generate CSV files
        summary_file = f"azure_devops_summary_metrics_{safe_repo_name}_{timestamp}.csv"
        pr_file = f"azure_devops_pr_details_{safe_repo_name}_{timestamp}.csv"
        contributor_file = f"azure_devops_contributors_{safe_repo_name}_{timestamp}.csv"

        print(f"\n{'='*70}")
        print("GENERATING CSV FILES")
        print(f"{'='*70}")

        # Write summary metrics CSV
        write_summary_csv(summary_file, before_metrics, after_metrics)
        generated_files.append(summary_file)

        # Write detailed PR data CSV (combine both periods)
        all_pr_details = []
        if 'pr_details' in before_metrics:
            all_pr_details.extend(before_metrics['pr_details'])
        if 'pr_details' in after_metrics:
            all_pr_details.extend(after_metrics['pr_details'])

        if all_pr_details:
            write_pr_csv(pr_file, all_pr_details, repo_name)
            generated_files.append(pr_file)

        # Write contributor mapping CSV
        if contributor_emails:
            write_contributor_csv(contributor_file, contributor_emails)
            generated_files.append(contributor_file)

        # Display processing summary
        before_failed = before_metrics.get('failed_prs', 0)
        after_failed = after_metrics.get('failed_prs', 0)
        before_success = before_metrics.get('successfully_processed_prs', 0)
        after_success = after_metrics.get('successfully_processed_prs', 0)

        print(f"\n{'='*70}")
        print("CSV OUTPUT SUMMARY")
        print(f"{'='*70}")
        print(f"✓ Summary metrics CSV: {summary_file}")
        if all_pr_details:
            print(f"✓ PR details CSV: {pr_file}")
        if contributor_emails:
            print(f"✓ Contributor mapping CSV: {contributor_file}")
        print(f"\nData Summary:")
        print(f"- Before automation PRs:")
        print(f"  - Successfully processed: {before_success}")
        print(f"  - Failed to process: {before_failed}")
        print(f"- After automation PRs:")
        print(f"  - Successfully processed: {after_success}")
        print(f"  - Failed to process: {after_failed}")
        print(f"- Total PRs with detailed data: {len(all_pr_details)}")
        print(f"- Total failed PRs: {before_failed + after_failed}")
        print(f"- Contributors with email mapping: {len(contributor_emails) if contributor_emails else 0}")
        print(f"{'='*70}")

        print(f"\n✓ Repository processing complete: {len(generated_files)} files generated")

    except Exception as e:
        print(f"\n✗ Error processing repository {repo_name}: {e}")
        import traceback
        traceback.print_exc()

    return generated_files

def main():
    """Main function to run the optimized Azure DevOps metrics calculator with CSV output"""

    print("\n" + "="*70)
    print("AZURE DEVOPS PR METRICS CALCULATOR - CSV OUTPUT VERSION")
    print("="*70)
    print("This script generates CSV output files for:")
    print("- Summary metrics (beforeAuto and afterAuto periods)")
    print("- Contributor email mapping")
    print("- Detailed PR data with all metrics")
    print("- Multi-repository support with ZIP compression")
    print("="*70)

    # Validate configuration
    is_valid, errors, warnings = validate_config()

    if not is_valid:
        print("\nConfiguration validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")

        print("\nWould you like to provide the missing configuration interactively?")
        response = input("Enter 'y' to continue or any other key to exit: ").strip().lower()

        if response in ['y', 'yes']:
            config = prompt_for_config()
            if config is None:
                print("Configuration cancelled. Exiting.")
                return

            # Update global variables
            global AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, REPO_NAME
            global WEEKS_BACK, AUTOMATED_DATE, BRANCH, API_VERSION
            AZURE_DEVOPS_PAT = config['azure_devops_pat']
            AZURE_DEVOPS_ORG = config['azure_devops_org']
            AZURE_DEVOPS_PROJECT = config['azure_devops_project']
            REPO_NAME = config['repo_name']
            WEEKS_BACK = config['weeks_back']
            AUTOMATED_DATE = config['automated_date']
            BRANCH = config['branch']
            API_VERSION = config['api_version']

            # Validate again
            is_valid, errors, warnings = validate_config()
            if not is_valid:
                print("Configuration is still invalid after interactive setup:")
                for error in errors:
                    print(f"  ERROR: {error}")
                return
        else:
            print("Exiting. Please fix the configuration and try again.")
            return

    # Display warnings
    if warnings:
        print("\nConfiguration warnings:")
        for warning in warnings:
            print(f"  WARNING: {warning}")

    # Parse repository names
    repos = parse_repo_names(REPO_NAME)
    print(f"\nRepositories to process: {len(repos)}")
    for i, repo in enumerate(repos, 1):
        print(f"  {i}. {repo}")

    # Track execution time
    start_time = time.time()

    # Process each repository and collect generated files
    all_generated_files = []

    for repo in repos:
        generated_files = process_single_repository(
            repo, AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT,
            WEEKS_BACK, AUTOMATED_DATE, BRANCH, API_VERSION
        )
        all_generated_files.extend(generated_files)

    # Create ZIP archive if we have generated files
    zip_filename = "azure_devops_results.zip"
    if all_generated_files:
        print(f"\n{'='*70}")
        print("CREATING ZIP ARCHIVE")
        print(f"{'='*70}")
        create_results_zip(all_generated_files, zip_filename)

    # Display final summary
    elapsed_time = time.time() - start_time
    print(f"\n{'='*70}")
    print("EXECUTION SUMMARY")
    print(f"{'='*70}")
    print(f"Repositories processed: {len(repos)}")
    print(f"Total CSV files generated: {len(all_generated_files)}")
    print(f"Total execution time: {elapsed_time/60:.1f} minutes")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
