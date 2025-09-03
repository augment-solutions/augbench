#!/usr/bin/env python3
"""
GitLab MR Metrics Calculator - Comparative Analysis

This script calculates metrics for GitLab Merge Requests (MRs) similar to
roi_scripts/github_pr_metrics.py for GitHub. It computes metrics for two periods:
- "beforeAuto": Period ending one week before AUTOMATED_DATE, spanning WEEKS_BACK weeks
- "afterAuto": Period starting at AUTOMATED_DATE, spanning WEEKS_BACK weeks

Metrics per period:
1. Total MRs created
2. Total MRs merged
3. Average MRs created per week
4. Average MRs merged per week
5. Average comments per MR (notes + diff discussions)
6. Average time to merge (hours and days)

Usage:
1. Replace YOUR_GITLAB_TOKEN with your GitLab token (scope: api or read_api)
2. Set PROJECT_ID to the numeric ID or URL-encoded path (e.g., namespace%2Fproject)
3. Optionally set BRANCH to filter by target branch ('' = all branches)
4. Set AUTOMATED_DATE to 'YYYY-MM-DDTHH:MM:SSZ' or '' to use current time
5. Run: python gitlab_mr_metrics.py

SaaS base URL is https://gitlab.com by default. For self-managed, change GITLAB_BASE_URL.
"""

import requests
import json
import os
from datetime import datetime, timedelta
import time
from typing import Dict, List, Any, Optional, Tuple

import urllib3

# -------------------- Configuration --------------------
GITLAB_TOKEN = ''
# Either numeric ID (e.g., 123456) or URL-encoded full path (e.g., 'group%2Fproject')
PROJECT_ID = ''
WEEKS_BACK = 2
AUTOMATED_DATE = ''  # 'YYYY-MM-DDTHH:MM:SSZ' or '' to use now
BRANCH = ''  # Target branch filter; '' = all branches

# GitLab API configuration
# You can set GITLAB_BASE_URL here. If left blank, the script will try the environment
# variable GITLAB_BASE_URL, and if that is also blank, it will default to SaaS (https://gitlab.com).
GITLAB_BASE_URL_CONFIG = 'https://localhost:4040'  # e.g., 'https://gitlab.yourcompany.com' or '' for SaaS fallback
GITLAB_BASE_URL = (
    GITLAB_BASE_URL_CONFIG.strip()
    or os.environ.get('GITLAB_BASE_URL', '').strip()
    or 'https://gitlab.com'
)
API_BASE_URL = f"{GITLAB_BASE_URL.rstrip('/')}/api/v4"
DEFAULT_PER_PAGE = 100

# SSL verification configuration (for self-signed/local GitLab instances)
# - GITLAB_VERIFY_SSL: set to '0'/'false' to disable verification
# - GITLAB_CA_BUNDLE: path to a custom CA bundle file
GITLAB_VERIFY_SSL_ENV = os.environ.get('GITLAB_VERIFY_SSL', 'true').strip().lower()
GITLAB_VERIFY_SSL = GITLAB_VERIFY_SSL_ENV in ('1', 'true', 'yes', 'y')
GITLAB_CA_BUNDLE = os.environ.get('GITLAB_CA_BUNDLE', '').strip()

class GitLabMetricsCalculator:
    def __init__(self, token: str, project_id: str, branch: str = ''):
        self.token = token
        self.project_id = project_id
        self.branch = branch.strip() if branch else ''
        self.headers = {
            'PRIVATE-TOKEN': token,
            'User-Agent': 'MR-Metrics-Calculator'
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        # Configure SSL verification for the session
        if GITLAB_CA_BUNDLE:
            # Use custom CA bundle
            self.session.verify = GITLAB_CA_BUNDLE
        else:
            self.session.verify = GITLAB_VERIFY_SSL
        # Optionally silence insecure request warnings when verification is disabled
        if self.session.verify is False:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    # ---------- Helpers ----------
    def _sleep_for_rate_limit(self, response) -> bool:
        # GitLab responds 429 for rate limit; optionally checks Retry-After
        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', '3'))
            wait_time = max(retry_after, 3)
            print(f"Rate limited. Waiting {wait_time}s...")
            time.sleep(wait_time)
            return True
        return False

    def _get(self, url: str, params: Dict = None) -> Optional[requests.Response]:
        params = params or {}
        max_retries = 3
        for attempt in range(max_retries):
            try:
                resp = self.session.get(url, params=params, timeout=30)
                if resp.status_code == 200:
                    return resp
                if resp.status_code in (401, 403):
                    print(f"Access forbidden/unauthorized: {resp.status_code}")
                    return None
                if resp.status_code in (404,):
                    print("Not found (check PROJECT_ID or permissions)")
                    return None
                if resp.status_code in (429, 500, 502, 503, 504):
                    if self._sleep_for_rate_limit(resp):
                        continue
                    backoff = 2 ** attempt
                    print(f"Transient error {resp.status_code}. Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
                print(f"API request failed: {resp.status_code} - {resp.text[:200]}")
                return None
            except requests.exceptions.RequestException as e:
                backoff = 2 ** attempt
                print(f"Request error: {e}. Retrying in {backoff}s...")
                time.sleep(backoff)
        return None

    def _get_all_pages(self, url: str, params: Dict = None) -> List[Dict]:
        params = params.copy() if params else {}
        params['per_page'] = DEFAULT_PER_PAGE
        all_items: List[Dict] = []
        page = 1
        while True:
            params['page'] = page
            resp = self._get(url, params)
            if not resp:
                break
            items = resp.json()
            if not isinstance(items, list):
                break
            all_items.extend(items)
            # Stop when fewer than per_page returned
            if len(items) < params['per_page']:
                break
            page += 1
        return all_items

    # ---------- Dates ----------
    def _parse_iso_or_now(self, iso: str) -> datetime:
        if iso and iso.strip():
            try:
                return datetime.fromisoformat(iso.replace('Z', '+00:00'))
            except ValueError:
                print(f"Warning: Invalid AUTOMATED_DATE '{iso}', using now.")
        return datetime.now()

    def calculate_date_range(self, weeks_back: int, end_date_override: Optional[datetime] = None) -> Tuple[str, str]:
        end_dt = end_date_override or self._parse_iso_or_now(AUTOMATED_DATE)
        start_dt = end_dt - timedelta(weeks=weeks_back)
        start_str = start_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        return start_str, end_str

    def calculate_before_auto_date_range(self, weeks_back: int) -> Tuple[str, str]:
        auto_dt = self._parse_iso_or_now(AUTOMATED_DATE)
        end_dt = auto_dt - timedelta(weeks=1)
        return self.calculate_date_range(weeks_back, end_dt)

    def calculate_after_auto_date_range(self, weeks_back: int) -> Tuple[str, str]:
        auto_dt = self._parse_iso_or_now(AUTOMATED_DATE)
        start_dt = auto_dt
        end_dt = auto_dt + timedelta(weeks=weeks_back)
        return (
            start_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
            end_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
        )

    # ---------- Data fetch ----------
    def get_merge_requests(self, start_date: str, end_date: str) -> List[Dict]:
        url = f"{API_BASE_URL}/projects/{self.project_id}/merge_requests"
        params = {
            'state': 'all',
            # 'scope' is not supported on project-level MR list; remove to avoid empty results
            'order_by': 'created_at',
            'sort': 'desc',
            'created_after': start_date,
            'created_before': end_date,
        }
        if self.branch:
            params['target_branch'] = self.branch
        return self._get_all_pages(url, params)

    def get_mr_notes(self, mr_iid: int) -> List[Dict]:
        url = f"{API_BASE_URL}/projects/{self.project_id}/merge_requests/{mr_iid}/notes"
        return self._get_all_pages(url)

    def get_mr_discussions(self, mr_iid: int) -> List[Dict]:
        url = f"{API_BASE_URL}/projects/{self.project_id}/merge_requests/{mr_iid}/discussions"
        return self._get_all_pages(url)

    # ---------- Metrics ----------
    def calculate_metrics_for_period(self, weeks_back: int, start_date: str, end_date: str, period_name: str) -> Dict[str, Any]:
        print(f"Calculating {period_name} metrics for project {self.project_id}...")
        print(f"Date range: {start_date} to {end_date}")

        mrs = self.get_merge_requests(start_date, end_date)
        if not mrs:
            print(f"No merge requests found in {period_name} period.")
            return {}

        total_mrs = len(mrs)
        merged_mrs = 0
        total_comments = 0
        total_time_to_merge_hours = 0.0
        merge_count = 0

        print(f"Processing {total_mrs} merge requests for {period_name}...")
        for mr in mrs:
            iid = mr.get('iid')
            created_at = datetime.fromisoformat(mr['created_at'].replace('Z', '+00:00'))
            merged_at_str = mr.get('merged_at')

            # Comments: general notes + diff discussions notes
            try:
                notes = self.get_mr_notes(iid)
            except Exception:
                notes = []
            try:
                discussions = self.get_mr_discussions(iid)
            except Exception:
                discussions = []
            diff_notes_count = 0
            for d in discussions:
                for n in d.get('notes', []):
                    # Count only user notes (exclude system)
                    if not n.get('system', False):
                        diff_notes_count += 1
            gen_notes_count = sum(1 for n in notes if not n.get('system', False))
            total_comments += gen_notes_count + diff_notes_count

            # Merge time
            if merged_at_str:
                merged_mrs += 1
                merged_at = datetime.fromisoformat(merged_at_str.replace('Z', '+00:00'))
                hours = (merged_at - created_at).total_seconds() / 3600.0
                total_time_to_merge_hours += hours
                merge_count += 1

        mrs_per_week = total_mrs / weeks_back
        merged_mrs_per_week = merged_mrs / weeks_back
        avg_comments_per_mr = total_comments / total_mrs if total_mrs > 0 else 0.0
        avg_time_to_merge_hours = (total_time_to_merge_hours / merge_count) if merge_count > 0 else 0.0

        return {
            'total_mrs': total_mrs,
            'merged_mrs': merged_mrs,
            'weeks_analyzed': weeks_back,
            'analysis_start_date': start_date,
            'analysis_end_date': end_date,
            'mrs_created_per_week': round(mrs_per_week, 2),
            'mrs_merged_per_week': round(merged_mrs_per_week, 2),
            'average_comments_per_mr': round(avg_comments_per_mr, 2),
            'average_time_to_merge_hours': round(avg_time_to_merge_hours, 2),
            'average_time_to_merge_days': round(avg_time_to_merge_hours / 24.0, 2),
        }

    def calculate_comparative_metrics(self, weeks_back: int) -> Dict[str, Any]:
        print(f"Starting comparative analysis for project {self.project_id}...")
        branch_info = self.branch if self.branch else 'ALL branches'
        print(f"Branch: {branch_info}")
        print(f"Weeks back per period: {weeks_back}")

        before_start, before_end = self.calculate_before_auto_date_range(weeks_back)
        after_start, after_end = self.calculate_after_auto_date_range(weeks_back)

        print(f"Before automation: {before_start} to {before_end}")
        print(f"After automation:  {after_start} to {after_end}")

        before_metrics = self.calculate_metrics_for_period(weeks_back, before_start, before_end, 'beforeAuto')
        after_metrics = self.calculate_metrics_for_period(weeks_back, after_start, after_end, 'afterAuto')

        combined: Dict[str, Any] = {}
        for k, v in before_metrics.items():
            combined[f'beforeAuto_{k}'] = v
        for k, v in after_metrics.items():
            combined[f'afterAuto_{k}'] = v

        combined['automation_date'] = (
            AUTOMATED_DATE.strip() if AUTOMATED_DATE and AUTOMATED_DATE.strip() else datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        )
        combined['branch_analyzed'] = branch_info
        combined['analysis_type'] = 'comparative'
        return combined


def main():
    # Basic config validation
    if GITLAB_TOKEN == 'YOUR_GITLAB_TOKEN':
        print("ERROR: Replace 'YOUR_GITLAB_TOKEN' with your actual GitLab token")
        return
    if PROJECT_ID == 'namespace%2Fproject':
        print("ERROR: Replace PROJECT_ID with the numeric ID or URL-encoded project path (e.g., 'group%2Fproject')")
        return

    calc = GitLabMetricsCalculator(GITLAB_TOKEN, PROJECT_ID, BRANCH)
    try:
        metrics = calc.calculate_comparative_metrics(WEEKS_BACK)
        if metrics:
            print("\n" + "=" * 70)
            print("GITLAB MR METRICS COMPARATIVE ANALYSIS REPORT")
            print("=" * 70)
            print(f"Project: {PROJECT_ID}")
            print(f"Branch: {metrics.get('branch_analyzed', 'ALL branches')}")
            print(f"Automation Date: {metrics.get('automation_date', 'Not specified')}")
            print(f"Analysis Period: {WEEKS_BACK} week(s) for each comparison period")
            print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("=" * 70)

            # Before
            print("\nBEFORE AUTOMATION METRICS:")
            print("-" * 40)
            if 'beforeAuto_analysis_start_date' in metrics:
                print(f"Date Range: {metrics['beforeAuto_analysis_start_date']} to {metrics['beforeAuto_analysis_end_date']}")
                print(f"Total MRs Created: {metrics.get('beforeAuto_total_mrs', 0)}")
                print(f"Total MRs Merged: {metrics.get('beforeAuto_merged_mrs', 0)}")
                print(f"MRs Created per Week: {metrics.get('beforeAuto_mrs_created_per_week', 0)}")
                print(f"MRs Merged per Week: {metrics.get('beforeAuto_mrs_merged_per_week', 0)}")
                print(f"Average Comments per MR: {metrics.get('beforeAuto_average_comments_per_mr', 0)}")
                print(f"Average Time to Merge: {metrics.get('beforeAuto_average_time_to_merge_hours', 0)} hours ({metrics.get('beforeAuto_average_time_to_merge_days', 0)} days)")
            else:
                print("No data available for before automation period")

            # After
            print("\nAFTER AUTOMATION METRICS:")
            print("-" * 40)
            if 'afterAuto_analysis_start_date' in metrics:
                print(f"Date Range: {metrics['afterAuto_analysis_start_date']} to {metrics['afterAuto_analysis_end_date']}")
                print(f"Total MRs Created: {metrics.get('afterAuto_total_mrs', 0)}")
                print(f"Total MRs Merged: {metrics.get('afterAuto_merged_mrs', 0)}")
                print(f"MRs Created per Week: {metrics.get('afterAuto_mrs_created_per_week', 0)}")
                print(f"MRs Merged per Week: {metrics.get('afterAuto_mrs_merged_per_week', 0)}")
                print(f"Average Comments per MR: {metrics.get('afterAuto_average_comments_per_mr', 0)}")
                print(f"Average Time to Merge: {metrics.get('afterAuto_average_time_to_merge_hours', 0)} hours ({metrics.get('afterAuto_average_time_to_merge_days', 0)} days)")
            else:
                print("No data available for after automation period")

            # Comparison summary
            print("\nCOMPARISON SUMMARY:")
            print("-" * 40)
            bpw = metrics.get('beforeAuto_mrs_created_per_week', 0)
            apw = metrics.get('afterAuto_mrs_created_per_week', 0)
            bmt = metrics.get('beforeAuto_average_time_to_merge_hours', 0)
            amt = metrics.get('afterAuto_average_time_to_merge_hours', 0)
            bac = metrics.get('beforeAuto_average_comments_per_mr', 0)
            aac = metrics.get('afterAuto_average_comments_per_mr', 0)
            if bpw:
                print(f"MRs Created per Week Change: {((apw - bpw) / bpw) * 100:+.1f}%")
            if bmt:
                print(f"Average Merge Time Change: {((amt - bmt) / bmt) * 100:+.1f}%")
            if bac:
                print(f"Average Comments per MR Change: {((aac - bac) / bac) * 100:+.1f}%")
            print("=" * 70)

            # Save JSON
            safe_proj = str(PROJECT_ID).replace('/', '_')
            output_file = f"gitlab_mr_metrics_comparative_{safe_proj}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(output_file, 'w') as f:
                json.dump(metrics, f, indent=2)
            print(f"\nResults saved to: {output_file}")
    except Exception as e:
        print(f"Error calculating metrics: {e}")


if __name__ == '__main__':
    main()

