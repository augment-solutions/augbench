#!/usr/bin/env python3
"""
Bitbucket Build Metrics Calculator - Comparative Analysis with CSV Output

Fetches Bitbucket Pipelines data via the REST API and computes build failure
metrics for before/after automation comparison periods.

Follows the same patterns as github_pr_metrics_detailed_csv.py for:
- Config validation, interactive prompts, manual metrics
- Progress tracking, CSV output, ZIP compression
- Console reporting with before/after comparison

Authentication (two options — API Token recommended):
  Option A — API Token (recommended, replaces deprecated app passwords):
    Set BITBUCKET_API_TOKEN and BITBUCKET_EMAIL environment variables.
    Bitbucket app passwords are deprecated and will stop working June 9, 2026.

  Option B — App Password (legacy, deprecated):
    Set BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables.
    Will show a deprecation warning.

Usage:
  Option A (recommended):
    export BITBUCKET_API_TOKEN=<your-api-token>
    export BITBUCKET_EMAIL=<your-email@example.com>
    export REPO_NAME='workspace/repo-slug'
    python3 roi_scripts/bitbucket_build_metrics.py

  Option B (legacy):
    export BITBUCKET_USERNAME=<your-username>
    export BITBUCKET_APP_PASSWORD=<your-app-password>
    export REPO_NAME='workspace/repo-slug'
    python3 roi_scripts/bitbucket_build_metrics.py

  Optionally set WEEKS_BACK, AUTOMATED_DATE, BRANCH, BITBUCKET_HOST for both options.
  REPO_NAME supports multi-repo: 'ws/r1;ws/r2'

  For self-hosted Bitbucket Server instances, set BITBUCKET_HOST:
    export BITBUCKET_HOST=https://bitbucket.example.com
  API_BASE_URL priority: API_BASE_URL env var > BITBUCKET_HOST > Cloud default (https://api.bitbucket.org/2.0)

Key metrics computed:
- Build volume (total, failed, successful, per week)
- Build failure rate and success rate
- Mean time to recovery (MTTR): time from failed build to next green on same branch
- Average and median MTTR
- Average build duration
- Max consecutive failures, unique failure branches/committers
"""

import requests
import json
import os
import getpass
import base64
import csv
import zipfile
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Semaphore
import time
import hashlib

# ============================================================================
# CONFIGURATION
# ============================================================================

BITBUCKET_USERNAME = os.environ.get('BITBUCKET_USERNAME', '')
BITBUCKET_APP_PASSWORD = os.environ.get('BITBUCKET_APP_PASSWORD', '')
# New API token auth (recommended — app passwords deprecated June 9, 2026)
BITBUCKET_API_TOKEN = os.environ.get('BITBUCKET_API_TOKEN', '')
BITBUCKET_EMAIL = os.environ.get('BITBUCKET_EMAIL', '')
REPO_NAME = os.environ.get('REPO_NAME', '')  # 'workspace/repo-slug' or semicolon-separated
WEEKS_BACK = int(os.environ.get('WEEKS_BACK', '4'))
AUTOMATED_DATE = os.environ.get('AUTOMATED_DATE', '')  # ISO 8601 e.g. '2024-01-15T00:00:00Z'
BRANCH = os.environ.get('BRANCH', '')   # Empty = all branches
BITBUCKET_HOST = os.environ.get('BITBUCKET_HOST', '')
_api_base_url_override = os.environ.get('API_BASE_URL', '')


def resolve_bitbucket_urls(host: str) -> Tuple[str, str]:
    """
    Return (api_base_url, web_base_url) based on the provided host.

    - Empty host  → Cloud defaults:
        api_base_url = 'https://api.bitbucket.org/2.0'
        web_base_url = 'https://bitbucket.org'
    - Non-empty   → Bitbucket Server/Data Center:
        Normalizes host (adds https:// if no scheme, strips trailing slash)
        api_base_url = '{host}/rest/api/1.0'
        web_base_url = '{host}'
    """
    if not host:
        return ('https://api.bitbucket.org/2.0', 'https://bitbucket.org')
    if '://' not in host:
        host = 'https://' + host
    host = host.rstrip('/')
    return (f'{host}/rest/api/1.0', host)


# Resolve API and web base URLs
# Priority: API_BASE_URL env var > BITBUCKET_HOST > Cloud default
_resolved_api_url, _resolved_web_url = resolve_bitbucket_urls(BITBUCKET_HOST)
API_BASE_URL = _api_base_url_override if _api_base_url_override else _resolved_api_url
WEB_BASE_URL = _resolved_web_url

# Performance configuration
MAX_PARALLEL_REQUESTS = 5  # Maximum parallel API requests (conservative for Bitbucket)

# Rate limiting
RATE_LIMIT_BUFFER = 50


# ============================================================================
# HELPER CLASSES
# ============================================================================

class ResponseCache:
    """Simple in-memory cache for API responses"""

    def __init__(self):
        self.cache: Dict[str, Any] = {}
        self.lock = Lock()

    def generate_key(self, *args) -> str:
        key_str = '|'.join(str(a) for a in args)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            return self.cache.get(key)

    def set(self, key: str, value: Any):
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
        self.current += increment
        current_time = time.time()

        if current_time - self.last_update >= 1.0 or self.current >= self.total:
            elapsed = current_time - self.start_time
            if self.current > 0:
                rate = self.current / elapsed
                remaining = (self.total - self.current) / rate if rate > 0 else 0
                eta_str = f"ETA: {int(remaining)}s" if remaining > 0 else "Done"
            else:
                eta_str = "Calculating..."

            percent = (self.current / self.total * 100) if self.total > 0 else 0
            print(
                f"\r  {self.description}: {self.current}/{self.total} ({percent:.1f}%) - {eta_str}",
                end='', flush=True
            )
            self.last_update = current_time

            if self.current >= self.total:
                print()  # New line at completion


# ============================================================================
# CONFIG FUNCTIONS
# ============================================================================

def parse_repo_names(repo_string: str) -> List[str]:
    """Parse semicolon-separated repository names"""
    if not repo_string:
        return []
    repos = [r.strip() for r in repo_string.split(';')]
    return [r for r in repos if r]


def validate_repo_name(repo: str) -> Tuple[bool, str]:
    """Validate a single repo name (must be 'workspace/repo-slug')"""
    if not repo:
        return False, "Repository name is empty"
    if '/' not in repo:
        return False, f"Repository '{repo}' must be in format 'workspace/repo-slug'"
    return True, ""


def resolve_credentials() -> Tuple[str, str, str]:
    """
    Resolve Bitbucket credentials with API token taking priority over app password.

    Returns:
        (auth_user, auth_pass, method_label)
        - auth_user: email (API token) or username (app password)
        - auth_pass: API token or app password
        - method_label: human-readable description of the auth method used
    """
    if BITBUCKET_API_TOKEN:
        return (BITBUCKET_EMAIL, BITBUCKET_API_TOKEN, f"API Token ({BITBUCKET_EMAIL})")
    return (BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD, f"App Password ({BITBUCKET_USERNAME}) [DEPRECATED]")


def validate_config() -> Tuple[bool, List[str], List[str]]:
    """Validate configuration and return (is_valid, errors, warnings)"""
    errors = []
    warnings = []

    if BITBUCKET_API_TOKEN:
        # API Token auth path
        if not BITBUCKET_EMAIL:
            errors.append("BITBUCKET_EMAIL is required when BITBUCKET_API_TOKEN is set")
        if BITBUCKET_APP_PASSWORD:
            warnings.append(
                "Both BITBUCKET_API_TOKEN and BITBUCKET_APP_PASSWORD are set. "
                "API Token will be used (app password ignored)."
            )
    elif BITBUCKET_APP_PASSWORD:
        # Legacy app password path
        if not BITBUCKET_USERNAME:
            errors.append("BITBUCKET_USERNAME is required when using BITBUCKET_APP_PASSWORD")
        warnings.append(
            "Using BITBUCKET_APP_PASSWORD which is deprecated and will stop working June 9, 2026. "
            "Switch to BITBUCKET_API_TOKEN + BITBUCKET_EMAIL."
        )
    else:
        errors.append(
            "No Bitbucket credentials found. Set BITBUCKET_API_TOKEN + BITBUCKET_EMAIL "
            "(recommended) or BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD (deprecated)."
        )

    if not REPO_NAME:
        errors.append("REPO_NAME is required (format: 'workspace/repo-slug' or 'ws/r1;ws/r2')")
    else:
        repos = parse_repo_names(REPO_NAME)
        if not repos:
            errors.append("REPO_NAME must contain at least one valid repository")
        else:
            for repo in repos:
                is_valid, error_msg = validate_repo_name(repo)
                if not is_valid:
                    errors.append(error_msg)

    if WEEKS_BACK <= 0:
        errors.append("WEEKS_BACK must be a positive integer")

    if AUTOMATED_DATE and AUTOMATED_DATE.strip():
        try:
            datetime.fromisoformat(AUTOMATED_DATE.replace('Z', '+00:00'))
        except ValueError:
            errors.append(
                f"AUTOMATED_DATE has invalid format: '{AUTOMATED_DATE}'. "
                "Expected: 'YYYY-MM-DDTHH:MM:SSZ'"
            )
    else:
        warnings.append("AUTOMATED_DATE not set. Using current time as automation date.")

    if not BRANCH or not BRANCH.strip():
        warnings.append("BRANCH not set. Will analyze builds for ALL branches.")

    if BITBUCKET_HOST and os.environ.get('API_BASE_URL', ''):
        warnings.append(
            "Both BITBUCKET_HOST and API_BASE_URL are set. "
            "API_BASE_URL takes priority over BITBUCKET_HOST."
        )

    return (len(errors) == 0, errors, warnings)


def prompt_for_config() -> Optional[Dict[str, Any]]:
    """Interactively prompt for configuration"""
    print("\n" + "="*70)
    print("INTERACTIVE CONFIGURATION")
    print("="*70)
    print("Please provide the following configuration values:")
    print("(Press Enter to use default values where applicable)\n")

    config = {}

    # Auth method selection
    print("Authentication method:")
    print("  1. API Token (recommended — app passwords deprecated June 9, 2026)")
    print("  2. App Password (legacy/deprecated)")
    auth_choice = input("Enter 1 or 2 [default: 1]: ").strip()

    if auth_choice == '2':
        # Legacy app password
        username = input("Bitbucket Username: ").strip()
        if not username:
            print("ERROR: Bitbucket username is required")
            return None
        config['bitbucket_username'] = username
        config['bitbucket_email'] = ''

        app_password = getpass.getpass("Bitbucket App Password: ").strip()
        if not app_password:
            print("ERROR: Bitbucket app password is required")
            return None
        config['bitbucket_app_password'] = app_password
        config['bitbucket_api_token'] = ''
    else:
        # API Token (default)
        email = input("Bitbucket Email: ").strip()
        if not email:
            print("ERROR: Bitbucket email is required for API token auth")
            return None
        config['bitbucket_email'] = email
        config['bitbucket_username'] = ''

        api_token = getpass.getpass("Bitbucket API Token: ").strip()
        if not api_token:
            print("ERROR: Bitbucket API token is required")
            return None
        config['bitbucket_api_token'] = api_token
        config['bitbucket_app_password'] = ''

    repo = input("Repository (format: workspace/repo-slug): ").strip()
    if not repo or '/' not in repo:
        print("ERROR: Valid repository name is required")
        return None
    config['repo_name'] = repo

    weeks = input(f"Weeks to analyze [default: {WEEKS_BACK}]: ").strip()
    config['weeks_back'] = int(weeks) if weeks else WEEKS_BACK

    auto_date = input("Automation date (YYYY-MM-DDTHH:MM:SSZ) [default: current time]: ").strip()
    config['automated_date'] = auto_date

    branch = input("Branch to analyze [default: ALL branches]: ").strip()
    config['branch'] = branch

    bitbucket_host = input(
        "Bitbucket Host (optional, for self-hosted instances, "
        "e.g. bitbucket.example.com or https://bitbucket.example.com): "
    ).strip()
    config['bitbucket_host'] = bitbucket_host

    resolved_api, _ = resolve_bitbucket_urls(bitbucket_host)
    api_url = input(f"API Base URL [default: {resolved_api}]: ").strip()
    config['api_base_url'] = api_url if api_url else resolved_api

    return config


def prompt_for_manual_metrics() -> Dict[str, float]:
    """Prompt user for manual metrics input"""
    print("\n" + "="*70)
    print("MANUAL METRICS INPUT")
    print("="*70)
    print("Please provide the following metrics based on your team's experience:\n")

    manual_metrics = {}

    try:
        diagnosis = input(
            "What is the average time in hours it takes a developer to diagnose "
            "a build failure (root cause analysis)? "
        )
        manual_metrics['avg_diagnosis_time_hours'] = float(diagnosis.strip())

        fix_time = input(
            "What is the average time in hours it takes a developer to fix and "
            "get a green build after diagnosing the failure? "
        )
        manual_metrics['avg_fix_time_hours'] = float(fix_time.strip())
    except ValueError:
        print("Invalid input. Manual metrics will not be included.")
        return {}

    return manual_metrics


# ============================================================================
# MAIN CALCULATOR CLASS
# ============================================================================

class BitbucketBuildMetricsCalculator:
    """
    Calculator for Bitbucket Pipelines build metrics.

    Fetches pipeline runs via Bitbucket REST API and computes:
    - Build failure rate, success rate, volume metrics
    - Mean time to recovery (MTTR): time from failed build to next success on same branch
    - Average and median build duration
    - Consecutive failure streaks, unique failure branches/committers
    """

    def __init__(self, username: str, app_password: str, repo: str,
                 branch: str = '', api_base_url: str = ''):
        self.username = username
        self.app_password = app_password
        self.repo = repo
        self.branch = branch.strip() if branch else ''
        self.api_base_url = api_base_url.rstrip('/') if api_base_url else API_BASE_URL

        # Build Basic Auth header
        credentials = f"{username}:{app_password}"
        encoded = base64.b64encode(credentials.encode()).decode()

        self.headers = {
            'Authorization': f'Basic {encoded}',
            'Accept': 'application/json',
            'User-Agent': 'Bitbucket-Build-Metrics-Calculator/1.0',
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        self.cache = ResponseCache()
        self.semaphore = Semaphore(MAX_PARALLEL_REQUESTS)
        self.rate_limit_remaining = 1000
        self.rate_limit_lock = Lock()

    def _parse_iso_or_now(self, iso: str) -> datetime:
        """Parse ISO date string or return current time"""
        if iso and iso.strip():
            try:
                return datetime.fromisoformat(iso.replace('Z', '+00:00'))
            except ValueError:
                print(f"Warning: Invalid AUTOMATED_DATE '{iso}', using now.")
        return datetime.now()

    def _format_dt(self, dt: datetime) -> str:
        """Format datetime to ISO string"""
        if dt.tzinfo is None:
            return dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        return dt.astimezone().strftime('%Y-%m-%dT%H:%M:%SZ')

    def calculate_before_auto_date_range(self, weeks_back: int) -> Tuple[str, str]:
        """Calculate date range for the period before automation"""
        auto_dt = self._parse_iso_or_now(AUTOMATED_DATE)
        end_dt = auto_dt - timedelta(weeks=1)
        start_dt = end_dt - timedelta(weeks=weeks_back)
        return self._format_dt(start_dt), self._format_dt(end_dt)

    def calculate_after_auto_date_range(self, weeks_back: int) -> Tuple[str, str]:
        """Calculate date range for the period after automation"""
        auto_dt = self._parse_iso_or_now(AUTOMATED_DATE)
        start_dt = auto_dt
        end_dt = auto_dt + timedelta(weeks=weeks_back)
        return self._format_dt(start_dt), self._format_dt(end_dt)

    def _check_rate_limit(self, response: requests.Response):
        """Update rate limit tracking from response headers"""
        with self.rate_limit_lock:
            remaining = response.headers.get('X-RateLimit-Remaining')
            if remaining:
                self.rate_limit_remaining = int(remaining)
                if self.rate_limit_remaining < RATE_LIMIT_BUFFER:
                    reset_time = response.headers.get('X-RateLimit-Reset')
                    if reset_time:
                        wait_time = int(reset_time) - int(time.time())
                        if wait_time > 0:
                            print(f"\nApproaching rate limit. Waiting {wait_time}s...")
                            time.sleep(wait_time)

    def _get(self, url: str, params: Dict = None) -> Optional[requests.Response]:
        """Make GET request with retry logic, caching, and semaphore-guarded concurrency"""
        cache_key = self.cache.generate_key(url, json.dumps(params or {}, sort_keys=True))
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        params = params or {}
        max_retries = 3

        with self.semaphore:
            for attempt in range(max_retries):
                try:
                    response = self.session.get(url, params=params, timeout=30)

                    if response.status_code == 200:
                        self._check_rate_limit(response)
                        self.cache.set(cache_key, response)
                        return response
                    elif response.status_code == 429:
                        retry_after = int(response.headers.get('Retry-After', '60'))
                        wait_time = max(retry_after, 60)
                        print(f"\nRate limited. Waiting {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    elif response.status_code in [500, 502, 503, 504]:
                        backoff = 2 ** attempt
                        print(f"\nTransient error {response.status_code}. Retrying in {backoff}s...")
                        time.sleep(backoff)
                        continue
                    else:
                        print(f"\nAPI request failed: {response.status_code} - {response.text[:200]}")
                        return None
                except requests.exceptions.RequestException as e:
                    backoff = 2 ** attempt
                    print(f"\nRequest error: {e}. Retrying in {backoff}s...")
                    time.sleep(backoff)

        return None

    def _fetch_urls_parallel(self, url_param_pairs: List[Tuple[str, Dict]]) -> List[Any]:
        """
        Fetch multiple URLs in parallel using ThreadPoolExecutor.

        Respects the semaphore concurrency limit set by MAX_PARALLEL_REQUESTS.
        Each call to _get already acquires the semaphore, so this method simply
        fans out requests concurrently and collects results in completion order.

        Args:
            url_param_pairs: List of (url, params) tuples to fetch in parallel

        Returns:
            List of response objects (None entries for failed requests)
        """
        results: List[Any] = [None] * len(url_param_pairs)
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_REQUESTS) as executor:
            future_to_index = {
                executor.submit(self._get, url, params): idx
                for idx, (url, params) in enumerate(url_param_pairs)
            }
            for future in as_completed(future_to_index):
                idx = future_to_index[future]
                try:
                    results[idx] = future.result()
                except Exception as e:
                    print(f"\nParallel fetch error for index {idx}: {e}")
                    results[idx] = None
        return results

    def _get_all_pages(self, url: str, params: Dict = None,
                       stop_before_date: Optional[datetime] = None) -> List[Dict]:
        """
        Get all pages from a paginated Bitbucket API endpoint.

        Args:
            url: API endpoint URL
            params: Query parameters
            stop_before_date: Stop when created_on < this date (early termination for
                              descending-sorted responses)

        Returns:
            List of all items from all pages
        """
        params = params.copy() if params else {}
        params['pagelen'] = 100
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

            # Early stopping: pipelines are sorted -created_on (newest first),
            # so once we see an item older than start_date, we can stop
            if stop_before_date is not None:
                filtered_items = []
                should_stop = False
                for item in items:
                    created_on = item.get('created_on', '')
                    if created_on:
                        try:
                            item_dt = datetime.fromisoformat(created_on.replace('Z', '+00:00'))
                            if item_dt < stop_before_date:
                                should_stop = True
                                break
                        except ValueError:
                            pass
                    filtered_items.append(item)
                all_items.extend(filtered_items)
                if should_stop:
                    break
            else:
                all_items.extend(items)

            print(f"  Fetched page {page} ({len(items)} items, total: {len(all_items)})")

            if 'next' not in data:
                break
            page += 1

        return all_items

    def is_bot_user(self, creator: Optional[Dict]) -> bool:
        """Check if a creator is likely a bot"""
        if not creator:
            return False
        display_name = creator.get('display_name', '')
        nickname = creator.get('nickname', '') or creator.get('username', '')
        bot_indicators = ['[bot]', 'bot', 'jenkins', 'bamboo', 'dependabot', 'renovate',
                          'automation']
        for indicator in bot_indicators:
            if (indicator.lower() in display_name.lower()
                    or indicator.lower() in nickname.lower()):
                return True
        return False

    def get_pipelines(self, start_date: str, end_date: str,
                      period_name: str = "") -> Tuple[List[Dict], int]:
        """
        Fetch all pipeline runs for the specified date range.

        Returns:
            Tuple of (list of pipeline dicts, error_count)
        """
        workspace, repo_slug = self.repo.split('/', 1)
        url = f"{self.api_base_url}/repositories/{workspace}/{repo_slug}/pipelines/"
        params = {'sort': '-created_on'}

        if period_name:
            print(f"\nFetching pipelines for {period_name} period ({start_date} to {end_date})...")

        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

        try:
            all_pipelines = self._get_all_pages(url, params, stop_before_date=start_dt)
        except Exception as e:
            print(f"\nError fetching pipelines: {e}")
            return [], 0

        filtered = []
        error_count = 0

        for pipeline in all_pipelines:
            try:
                created_on_str = pipeline.get('created_on', '')
                if not created_on_str:
                    continue

                created_dt = datetime.fromisoformat(created_on_str.replace('Z', '+00:00'))

                # Date range check
                if not (start_dt <= created_dt <= end_dt):
                    continue

                # Branch filter
                if self.branch:
                    p_branch = pipeline.get('target', {}).get('ref_name', '')
                    if p_branch != self.branch:
                        continue

                filtered.append(pipeline)
            except Exception as e:
                build_num = pipeline.get('build_number', 'unknown') if pipeline else 'unknown'
                print(f"\nWarning: Failed to process pipeline #{build_num}: {e}")
                error_count += 1
                continue

        if period_name:
            print(f"Found {len(filtered)} pipelines for {period_name}")
            if error_count > 0:
                print(f"Failed to process {error_count} pipelines due to errors")

        return filtered, error_count

    def _is_failed(self, pipeline: Dict) -> bool:
        """Check if a pipeline resulted in failure"""
        state_name = pipeline.get('state', {}).get('name', '')
        result_name = pipeline.get('state', {}).get('result', {}).get('name', '')
        return state_name == 'COMPLETED' and result_name == 'FAILED'

    def _is_successful(self, pipeline: Dict) -> bool:
        """Check if a pipeline completed successfully"""
        state_name = pipeline.get('state', {}).get('name', '')
        result_name = pipeline.get('state', {}).get('result', {}).get('name', '')
        return state_name == 'COMPLETED' and result_name == 'SUCCESSFUL'

    def _get_branch(self, pipeline: Dict) -> str:
        """Extract branch name from a pipeline"""
        return pipeline.get('target', {}).get('ref_name', '') or 'unknown'

    def _parse_dt(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse ISO datetime string, returning None on failure"""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except ValueError:
            return None

    def calculate_mttr(self, pipelines: List[Dict]) -> Tuple[List[float], Dict[int, float]]:
        """
        Calculate Mean Time to Recovery (MTTR) for each failed build.

        Groups builds by branch, sorts by created_on ascending, and for each FAILED
        build finds the next SUCCESSFUL build on the SAME branch.
        MTTR = time from failed build's created_on to recovery build's completed_on.

        Returns:
            Tuple of:
            - List of MTTR values in hours (one per recovered failure)
            - Dict mapping build_number -> time_to_recovery_hours
        """
        # Group builds by branch
        branch_builds: Dict[str, List[Dict]] = {}
        for pipeline in pipelines:
            branch = self._get_branch(pipeline)
            if branch not in branch_builds:
                branch_builds[branch] = []
            branch_builds[branch].append(pipeline)

        # Sort each branch's builds chronologically (ascending)
        for branch in branch_builds:
            branch_builds[branch].sort(key=lambda p: p.get('created_on', ''))

        mttr_values: List[float] = []
        build_recovery_times: Dict[int, float] = {}

        for branch, builds in branch_builds.items():
            n = len(builds)
            for i, build in enumerate(builds):
                if not self._is_failed(build):
                    continue

                failed_created = self._parse_dt(build.get('created_on'))
                if not failed_created:
                    continue

                # Find the next successful build on the same branch
                for j in range(i + 1, n):
                    next_build = builds[j]
                    if self._is_successful(next_build):
                        recovery_completed = self._parse_dt(next_build.get('completed_on'))
                        if recovery_completed is None:
                            break

                        mttr_hours = (
                            (recovery_completed - failed_created).total_seconds() / 3600.0
                        )
                        mttr_values.append(mttr_hours)

                        build_num = build.get('build_number')
                        if build_num is not None:
                            build_recovery_times[build_num] = round(mttr_hours, 4)
                        break

        return mttr_values, build_recovery_times

    def _max_consecutive_failures(self, pipelines: List[Dict]) -> int:
        """Calculate the longest streak of consecutive failures across all branches"""
        sorted_builds = sorted(
            [p for p in pipelines if p.get('state', {}).get('name') == 'COMPLETED'],
            key=lambda p: p.get('created_on', ''),
        )

        max_streak = 0
        current_streak = 0

        for build in sorted_builds:
            if self._is_failed(build):
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            elif self._is_successful(build):
                current_streak = 0

        return max_streak

    def calculate_metrics_for_period(
        self, weeks_back: int, start_date: str, end_date: str,
        period_name: str, manual_metrics: Dict[str, float] = None
    ) -> Dict[str, Any]:
        """Calculate build metrics for a specific time period."""
        print(f"\nCalculating {period_name} metrics for {self.repo} over {weeks_back} week(s)...")
        print(f"Date range: {start_date} to {end_date}")

        pipelines, error_count = self.get_pipelines(start_date, end_date, period_name)

        empty_result: Dict[str, Any] = {
            'total_builds': 0, 'successful_builds': 0, 'failed_builds': 0,
            'build_failure_rate_pct': 0.0, 'build_success_rate_pct': 0.0,
            'builds_per_week': 0.0, 'failed_builds_per_week': 0.0,
            'weeks_analyzed': weeks_back,
            'analysis_start_date': start_date, 'analysis_end_date': end_date,
            'avg_build_duration_seconds': 0.0, 'avg_build_duration_minutes': 0.0,
            'avg_failed_build_duration_seconds': 0.0,
            'avg_time_to_recovery_hours': 0.0, 'avg_time_to_recovery_minutes': 0.0,
            'median_time_to_recovery_hours': 0.0,
            'max_consecutive_failures': 0,
            'unique_failure_branches': 0, 'unique_failure_committers': 0,
            'build_details': [],
        }

        if not pipelines:
            print(f"No pipelines found in the {period_name} time period.")
            return empty_result

        total_builds = len(pipelines)
        successful_builds = sum(1 for p in pipelines if self._is_successful(p))
        failed_builds = sum(1 for p in pipelines if self._is_failed(p))

        # Duration metrics
        all_durations = []
        failed_durations = []
        for p in pipelines:
            duration = p.get('duration_in_seconds')
            if duration is not None and duration > 0:
                all_durations.append(duration)
                if self._is_failed(p):
                    failed_durations.append(duration)

        avg_duration_seconds = sum(all_durations) / len(all_durations) if all_durations else 0.0
        avg_failed_duration_seconds = (
            sum(failed_durations) / len(failed_durations) if failed_durations else 0.0
        )

        # MTTR calculation
        print(f"  Calculating MTTR for {failed_builds} failed builds...")
        mttr_values, build_recovery_times = self.calculate_mttr(pipelines)

        avg_mttr = sum(mttr_values) / len(mttr_values) if mttr_values else 0.0
        median_mttr = statistics.median(mttr_values) if mttr_values else 0.0

        # Consecutive failures streak
        max_consecutive = self._max_consecutive_failures(pipelines)

        # Unique failure branches and committers
        failure_branches: set = set()
        failure_committers: set = set()
        for p in pipelines:
            if self._is_failed(p):
                branch = self._get_branch(p)
                if branch:
                    failure_branches.add(branch)
                creator = p.get('creator', {})
                if creator and not self.is_bot_user(creator):
                    name = (creator.get('display_name', '')
                            or creator.get('nickname', ''))
                    if name:
                        failure_committers.add(name)

        # Build detail records for CSV export
        progress = ProgressTracker(total_builds, f"Processing {period_name} builds")
        build_details = []

        for p in pipelines:
            state_name = p.get('state', {}).get('name', '')
            result_name = p.get('state', {}).get('result', {}).get('name', '')
            build_num = p.get('build_number')
            duration_s = p.get('duration_in_seconds') or 0
            is_failure = self._is_failed(p)

            recovery_hours = build_recovery_times.get(build_num)
            recovery_minutes = (
                round(recovery_hours * 60, 2) if recovery_hours is not None else None
            )

            creator = p.get('creator', {}) or {}
            creator_name = (creator.get('display_name', '')
                            or creator.get('nickname', '') or '')

            build_details.append({
                'build_number': build_num,
                'branch': self._get_branch(p),
                'commit_hash': (
                    (p.get('target', {}).get('commit', {}) or {}).get('hash', '')
                ),
                'trigger': (p.get('trigger', {}) or {}).get('name', ''),
                'creator': creator_name,
                'state': state_name,
                'result': result_name,
                'created_on': p.get('created_on', ''),
                'completed_on': p.get('completed_on', ''),
                'duration_seconds': duration_s,
                'duration_minutes': round(duration_s / 60.0, 2) if duration_s else 0,
                'is_failure': is_failure,
                'time_to_recovery_hours': (
                    round(recovery_hours, 4) if recovery_hours is not None else ''
                ),
                'time_to_recovery_minutes': (
                    round(recovery_minutes, 2) if recovery_minutes is not None else ''
                ),
            })
            progress.update()

        # Rates and per-week metrics
        build_failure_rate = (
            (failed_builds / total_builds * 100) if total_builds > 0 else 0.0
        )
        build_success_rate = (
            (successful_builds / total_builds * 100) if total_builds > 0 else 0.0
        )
        builds_per_week = total_builds / weeks_back
        failed_per_week = failed_builds / weeks_back

        result: Dict[str, Any] = {
            'total_builds': total_builds,
            'successful_builds': successful_builds,
            'failed_builds': failed_builds,
            'build_failure_rate_pct': round(build_failure_rate, 2),
            'build_success_rate_pct': round(build_success_rate, 2),
            'builds_per_week': round(builds_per_week, 2),
            'failed_builds_per_week': round(failed_per_week, 2),
            'weeks_analyzed': weeks_back,
            'analysis_start_date': start_date,
            'analysis_end_date': end_date,
            'avg_build_duration_seconds': round(avg_duration_seconds, 2),
            'avg_build_duration_minutes': round(avg_duration_seconds / 60.0, 2),
            'avg_failed_build_duration_seconds': round(avg_failed_duration_seconds, 2),
            'avg_time_to_recovery_hours': round(avg_mttr, 4),
            'avg_time_to_recovery_minutes': round(avg_mttr * 60, 2),
            'median_time_to_recovery_hours': round(median_mttr, 4),
            'max_consecutive_failures': max_consecutive,
            'unique_failure_branches': len(failure_branches),
            'unique_failure_committers': len(failure_committers),
            'build_details': build_details,
        }

        if manual_metrics:
            result.update(manual_metrics)

        return result

    def calculate_comparative_metrics(
        self, weeks_back: int, manual_metrics: Dict[str, float] = None
    ) -> Dict[str, Any]:
        """Calculate comparative metrics for before and after automation periods"""
        print(f"\n{'='*70}")
        print(f"Starting comparative build metrics analysis for {self.repo}...")
        print(f"{'='*70}")

        branch_info = self.branch if self.branch else "ALL branches"
        print(f"Branch: {branch_info}")
        print(f"Weeks back for each period: {weeks_back}")

        before_start, before_end = self.calculate_before_auto_date_range(weeks_back)
        after_start, after_end = self.calculate_after_auto_date_range(weeks_back)

        print(f"Before automation period: {before_start} to {before_end}")
        print(f"After automation period:  {after_start} to {after_end}")

        # Fetch both periods in parallel — they are independent date windows
        period_args = {
            'beforeAuto': (weeks_back, before_start, before_end, 'beforeAuto', manual_metrics),
            'afterAuto':  (weeks_back, after_start,  after_end,  'afterAuto',  manual_metrics),
        }
        period_results: Dict[str, Any] = {}
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_to_period = {
                executor.submit(self.calculate_metrics_for_period, *args): period
                for period, args in period_args.items()
            }
            for future in as_completed(future_to_period):
                period = future_to_period[future]
                try:
                    period_results[period] = future.result()
                except Exception as e:
                    print(f"\nError fetching {period} period: {e}")
                    period_results[period] = {}

        before_metrics = period_results.get('beforeAuto', {})
        after_metrics  = period_results.get('afterAuto', {})

        combined: Dict[str, Any] = {}
        for key, value in before_metrics.items():
            combined[f'beforeAuto_{key}'] = value
        for key, value in after_metrics.items():
            combined[f'afterAuto_{key}'] = value

        combined['automation_date'] = (
            AUTOMATED_DATE if AUTOMATED_DATE and AUTOMATED_DATE.strip()
            else datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        )
        combined['branch_analyzed'] = branch_info
        combined['analysis_type'] = 'comparative'

        return combined


# ============================================================================
# DISPLAY FUNCTIONS
# ============================================================================

def _display_period_metrics(metrics: Dict, period: str) -> None:
    """Display metrics for a specific period"""
    prefix = f"{period}_"
    period_label = "BEFORE AUTOMATION" if period == "beforeAuto" else "AFTER AUTOMATION"

    print(f"\n{period_label} METRICS:")
    print("-" * 40)

    if f'{prefix}total_builds' not in metrics:
        print(f"No data available for {period_label.lower()} period")
        return

    start = metrics.get(f'{prefix}analysis_start_date', '')
    end = metrics.get(f'{prefix}analysis_end_date', '')
    print(f"Date Range: {start} to {end}")
    print(f"Total Builds: {metrics.get(f'{prefix}total_builds', 0)}")
    print(f"Successful Builds: {metrics.get(f'{prefix}successful_builds', 0)}")
    print(f"Failed Builds: {metrics.get(f'{prefix}failed_builds', 0)}")
    print(f"Build Failure Rate: {metrics.get(f'{prefix}build_failure_rate_pct', 0):.1f}%")
    print(f"Build Success Rate: {metrics.get(f'{prefix}build_success_rate_pct', 0):.1f}%")
    print(f"Builds per Week: {metrics.get(f'{prefix}builds_per_week', 0)}")
    print(f"Failed Builds per Week: {metrics.get(f'{prefix}failed_builds_per_week', 0)}")
    avg_s = metrics.get(f'{prefix}avg_build_duration_seconds', 0)
    avg_m = metrics.get(f'{prefix}avg_build_duration_minutes', 0)
    print(f"Avg Build Duration: {avg_s:.0f}s ({avg_m:.1f}m)")
    print(
        f"Avg Failed Build Duration: "
        f"{metrics.get(f'{prefix}avg_failed_build_duration_seconds', 0):.0f}s"
    )
    mttr_h = metrics.get(f'{prefix}avg_time_to_recovery_hours', 0)
    mttr_m = metrics.get(f'{prefix}avg_time_to_recovery_minutes', 0)
    print(f"Avg MTTR (Red→Green): {mttr_h:.2f} hours ({mttr_m:.1f} minutes)")
    print(
        f"Median MTTR: {metrics.get(f'{prefix}median_time_to_recovery_hours', 0):.2f} hours"
    )
    print(f"Max Consecutive Failures: {metrics.get(f'{prefix}max_consecutive_failures', 0)}")
    print(f"Unique Failure Branches: {metrics.get(f'{prefix}unique_failure_branches', 0)}")
    print(f"Unique Failure Committers: {metrics.get(f'{prefix}unique_failure_committers', 0)}")

    if f'{prefix}avg_diagnosis_time_hours' in metrics:
        print(
            f"Avg Diagnosis Time (Manual): "
            f"{metrics.get(f'{prefix}avg_diagnosis_time_hours', 0)} hours"
        )
    if f'{prefix}avg_fix_time_hours' in metrics:
        print(
            f"Avg Fix Time (Manual): "
            f"{metrics.get(f'{prefix}avg_fix_time_hours', 0)} hours"
        )


def _calculate_and_display_changes(metrics: Dict) -> None:
    """Calculate and display percentage changes between before and after periods"""
    print("\nCOMPARISON SUMMARY (% Change: Before → After):")
    print("-" * 40)

    changes = [
        ('build_failure_rate_pct', 'Build Failure Rate (%)'),
        ('build_success_rate_pct', 'Build Success Rate (%)'),
        ('builds_per_week', 'Builds per Week'),
        ('failed_builds_per_week', 'Failed Builds per Week'),
        ('avg_build_duration_minutes', 'Avg Build Duration (minutes)'),
        ('avg_time_to_recovery_hours', 'Avg MTTR (hours)'),
        ('median_time_to_recovery_hours', 'Median MTTR (hours)'),
        ('max_consecutive_failures', 'Max Consecutive Failures'),
    ]

    for metric_key, label in changes:
        before_val = metrics.get(f'beforeAuto_{metric_key}', 0) or 0
        after_val = metrics.get(f'afterAuto_{metric_key}', 0) or 0

        if before_val > 0:
            change = ((after_val - before_val) / before_val) * 100
            direction = "↓" if change < 0 else "↑"
            print(f"{label}: {before_val} → {after_val} ({change:+.1f}% {direction})")
        else:
            print(f"{label}: {before_val} → {after_val} (N/A - no baseline)")


# ============================================================================
# CSV OUTPUT FUNCTIONS
# ============================================================================

def get_build_csv_columns() -> List[str]:
    """Get the ordered list of CSV column names for build detail output."""
    return [
        'repo', 'build_number', 'branch', 'commit_hash', 'trigger', 'creator',
        'state', 'result', 'created_on', 'completed_on',
        'duration_seconds', 'duration_minutes', 'is_failure',
        'time_to_recovery_hours', 'time_to_recovery_minutes',
    ]


def get_summary_csv_columns() -> List[str]:
    """Get the ordered list of CSV column names for summary metrics."""
    return [
        'period', 'total_builds', 'successful_builds', 'failed_builds',
        'build_failure_rate_pct', 'build_success_rate_pct',
        'builds_per_week', 'failed_builds_per_week', 'weeks_analyzed',
        'analysis_start_date', 'analysis_end_date',
        'avg_build_duration_seconds', 'avg_build_duration_minutes',
        'avg_failed_build_duration_seconds',
        'avg_time_to_recovery_hours', 'avg_time_to_recovery_minutes',
        'median_time_to_recovery_hours',
        'max_consecutive_failures', 'unique_failure_branches', 'unique_failure_committers',
    ]


def write_build_csv(file_path: str, build_details: List[Dict[str, Any]],
                    repo_name: str) -> None:
    """Write build details to CSV file."""
    columns = get_build_csv_columns()
    rows = []

    for detail in build_details:
        row = {col: '' for col in columns}
        row['repo'] = repo_name
        row['build_number'] = str(detail.get('build_number', ''))
        row['branch'] = detail.get('branch', '')
        row['commit_hash'] = detail.get('commit_hash', '')
        row['trigger'] = detail.get('trigger', '')
        row['creator'] = detail.get('creator', '')
        row['state'] = detail.get('state', '')
        row['result'] = detail.get('result', '')
        row['created_on'] = detail.get('created_on', '')
        row['completed_on'] = detail.get('completed_on', '')
        row['duration_seconds'] = str(detail.get('duration_seconds', ''))
        row['duration_minutes'] = str(detail.get('duration_minutes', ''))
        row['is_failure'] = 'TRUE' if detail.get('is_failure') else 'FALSE'
        row['time_to_recovery_hours'] = str(detail.get('time_to_recovery_hours', ''))
        row['time_to_recovery_minutes'] = str(detail.get('time_to_recovery_minutes', ''))
        rows.append(row)

    try:
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(rows)
        print(f"✓ Build CSV written: {file_path} ({len(rows)} records)")
    except IOError as e:
        print(f"✗ Error writing build CSV: {e}")


def write_summary_csv(file_path: str, metrics: Dict[str, Any]) -> None:
    """Write summary metrics to CSV file."""
    columns = get_summary_csv_columns()
    rows = []

    for period in ['beforeAuto', 'afterAuto']:
        row = {'period': period}
        for col in columns[1:]:
            row[col] = str(metrics.get(f'{period}_{col}', ''))
        rows.append(row)

    try:
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(rows)
        print(f"✓ Summary CSV written: {file_path} (2 records)")
    except IOError as e:
        print(f"✗ Error writing summary CSV: {e}")


def create_results_zip(csv_files: List[str], zip_filename: str = "results.zip") -> bool:
    """Create a ZIP archive containing all generated CSV files."""
    if not csv_files:
        print("No CSV files to compress")
        return False

    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for csv_file in csv_files:
                if os.path.exists(csv_file):
                    arcname = os.path.basename(csv_file)
                    zipf.write(csv_file, arcname=arcname)
                    print(f"  Added to ZIP: {arcname}")
                else:
                    print(f"  Warning: File not found: {csv_file}")

        print(f"\n✓ ZIP archive created: {zip_filename}")
        print(f"  Contains {len([f for f in csv_files if os.path.exists(f)])} CSV files")
        return True
    except Exception as e:
        print(f"✗ Error creating ZIP archive: {e}")
        return False


# ============================================================================
# REPOSITORY PROCESSING
# ============================================================================

def process_single_repository(
    repo_name: str, username: str, app_password: str,
    weeks_back: int, automated_date: str, branch: str,
    api_base_url: str, manual_metrics: Dict[str, float]
) -> List[str]:
    """
    Process a single repository and generate CSV files.

    Returns:
        List of generated CSV file paths
    """
    print(f"\n{'='*70}")
    print(f"Processing repository: {repo_name}")
    print(f"{'='*70}")

    generated_files: List[str] = []

    try:
        calculator = BitbucketBuildMetricsCalculator(
            username, app_password, repo_name, branch, api_base_url
        )

        metrics = calculator.calculate_comparative_metrics(weeks_back, manual_metrics)

        if metrics:
            # Display console report
            print("\n" + "="*70)
            print("BITBUCKET BUILD METRICS COMPARATIVE ANALYSIS REPORT")
            print("="*70)
            print(f"Repository: {repo_name}")
            print(f"Branch: {metrics.get('branch_analyzed', 'ALL branches')}")
            print(f"Automation Date: {metrics.get('automation_date', 'Not specified')}")
            print(f"Analysis Period: {weeks_back} week(s) for each comparison period")
            print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*70)

            _display_period_metrics(metrics, 'beforeAuto')
            _display_period_metrics(metrics, 'afterAuto')
            _calculate_and_display_changes(metrics)

            print("="*70)

            # Generate CSV output files
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            repo_safe = repo_name.replace('/', '_')

            # Write summary CSV
            summary_file = f"bitbucket_build_metrics_summary_{repo_safe}_{timestamp}.csv"
            write_summary_csv(summary_file, metrics)
            generated_files.append(summary_file)

            # Write build detail CSVs
            before_builds = metrics.get('beforeAuto_build_details', [])
            after_builds = metrics.get('afterAuto_build_details', [])

            before_file = None
            after_file = None

            if before_builds:
                before_file = f"bitbucket_build_details_beforeAuto_{repo_safe}_{timestamp}.csv"
                write_build_csv(before_file, before_builds, repo_name)
                generated_files.append(before_file)

            if after_builds:
                after_file = f"bitbucket_build_details_afterAuto_{repo_safe}_{timestamp}.csv"
                write_build_csv(after_file, after_builds, repo_name)
                generated_files.append(after_file)

            # Display CSV summary
            print(f"\n{'='*70}")
            print("CSV OUTPUT SUMMARY")
            print("="*70)
            print(f"✓ Summary metrics CSV: {summary_file}")
            if before_file:
                print(f"✓ Before automation build details CSV: {before_file}")
            if after_file:
                print(f"✓ After automation build details CSV: {after_file}")
            print(f"\nData Summary:")
            print(f"- Before automation builds exported: {len(before_builds)}")
            print(f"- After automation builds exported: {len(after_builds)}")
            print(f"- Total builds with detailed data: {len(before_builds) + len(after_builds)}")
            print("="*70)
        else:
            print(f"No metrics generated for {repo_name}")

    except Exception as e:
        print(f"\n✗ Error processing repository {repo_name}: {e}")
        import traceback
        traceback.print_exc()

    return generated_files


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main function to run the Bitbucket build metrics calculator with CSV output"""
    global BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD, REPO_NAME, WEEKS_BACK
    global AUTOMATED_DATE, BRANCH, API_BASE_URL, WEB_BASE_URL, BITBUCKET_HOST
    global BITBUCKET_API_TOKEN, BITBUCKET_EMAIL

    print("\n" + "="*70)
    print("BITBUCKET BUILD METRICS CALCULATOR - CSV OUTPUT VERSION")
    print("="*70)
    print("This script generates CSV output files for:")
    print("- Summary build metrics (beforeAuto and afterAuto periods)")
    print("- Detailed build data with MTTR per build")
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

            BITBUCKET_API_TOKEN = config.get('bitbucket_api_token', '')
            BITBUCKET_EMAIL = config.get('bitbucket_email', '')
            BITBUCKET_USERNAME = config['bitbucket_username']
            BITBUCKET_APP_PASSWORD = config['bitbucket_app_password']
            REPO_NAME = config['repo_name']
            WEEKS_BACK = config['weeks_back']
            AUTOMATED_DATE = config['automated_date']
            BRANCH = config['branch']
            BITBUCKET_HOST = config.get('bitbucket_host', '')
            API_BASE_URL = config['api_base_url']
            _, WEB_BASE_URL = resolve_bitbucket_urls(BITBUCKET_HOST)

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

    # Resolve and display authentication method
    auth_user, auth_pass, auth_label = resolve_credentials()
    print(f"\nAuthentication: {auth_label}")
    print(f"API Base URL: {API_BASE_URL}")

    # Parse repository names
    repos = parse_repo_names(REPO_NAME)
    print(f"\nRepositories to process: {len(repos)}")
    for i, repo in enumerate(repos, 1):
        print(f"  {i}. {repo}")

    # Prompt for manual metrics once (shared across all repos)
    manual_metrics = prompt_for_manual_metrics()

    # Track execution time
    start_time = time.time()

    # Process each repository and collect generated files
    all_generated_files: List[str] = []

    for repo in repos:
        generated_files = process_single_repository(
            repo, auth_user, auth_pass,
            WEEKS_BACK, AUTOMATED_DATE, BRANCH, API_BASE_URL, manual_metrics
        )
        all_generated_files.extend(generated_files)

    # Create ZIP archive if we have generated files
    zip_filename = "results.zip"
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
    print(f"Total execution time: {elapsed_time / 60:.1f} minutes")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()

