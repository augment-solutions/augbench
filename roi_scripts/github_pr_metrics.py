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
from datetime import datetime, timedelta
import time
from typing import Dict, List, Any, Optional

# Configuration - Replace these values
GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN'
REPO_NAME = 'owner/repo-name'  # Format: 'owner/repo-name'
WEEKS_BACK = 2  # Number of weeks to look back
AUTOMATED_DATE = ''  # Format: 'YYYY-MM-DDTHH:MM:SSZ' or leave empty to use current time
BRANCH = ''  # Base branch for PRs (leave empty to analyze ALL branches, or specify branch name)

# GitHub API configuration
API_BASE_URL = 'https://api.github.com'
API_VERSION = 'application/vnd.github.v3+json'

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
    
    def get_all_pages(self, url: str, params: Dict = None) -> List[Dict]:
        """Get all pages of results from GitHub API"""
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
                if len(data) < 100:  # Last page
                    break
            else:
                break
            
            page += 1
        
        return all_items
    
    def calculate_date_range(self, weeks_back: int, end_date_override: Optional[datetime] = None) -> tuple:
        """Calculate the date range for the specified period"""
        if end_date_override:
            end_date = end_date_override
        else:
            # Check if AUTOMATED_DATE is provided and not empty
            if AUTOMATED_DATE and AUTOMATED_DATE.strip():
                try:
                    # Parse the provided automated date
                    end_date = datetime.fromisoformat(AUTOMATED_DATE.replace('Z', '+00:00'))
                except ValueError:
                    print(f"Warning: Invalid AUTOMATED_DATE format '{AUTOMATED_DATE}'. Using current time instead.")
                    print("Expected format: 'YYYY-MM-DDTHH:MM:SSZ' (e.g., '2025-08-19T17:44:15Z')")
                    end_date = datetime.now()
            else:
                # Default to current time if AUTOMATED_DATE is empty or not provided
                end_date = datetime.now()

        start_date = end_date - timedelta(weeks=weeks_back)

        # Format dates for GitHub API (ISO 8601)
        # Convert to UTC if the datetime is naive (no timezone info)
        if end_date.tzinfo is None:
            end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        else:
            end_date_str = end_date.astimezone().strftime('%Y-%m-%dT%H:%M:%SZ')

        if start_date.tzinfo is None:
            start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        else:
            start_date_str = start_date.astimezone().strftime('%Y-%m-%dT%H:%M:%SZ')

        return start_date_str, end_date_str

    def calculate_before_auto_date_range(self, weeks_back: int) -> tuple:
        """Calculate the date range for the period before automation (beforeAuto)"""
        # Get the automation date
        if AUTOMATED_DATE and AUTOMATED_DATE.strip():
            try:
                automation_date = datetime.fromisoformat(AUTOMATED_DATE.replace('Z', '+00:00'))
            except ValueError:
                print(f"Warning: Invalid AUTOMATED_DATE format '{AUTOMATED_DATE}'. Using current time instead.")
                automation_date = datetime.now()
        else:
            automation_date = datetime.now()

        # End date is one week before automation date
        end_date = automation_date - timedelta(weeks=1)

        # Calculate the date range ending at this point
        return self.calculate_date_range(weeks_back, end_date)

    def calculate_after_auto_date_range(self, weeks_back: int) -> tuple:
        """Calculate the date range for the period after automation (afterAuto)"""
        # Get the automation date
        if AUTOMATED_DATE and AUTOMATED_DATE.strip():
            try:
                automation_date = datetime.fromisoformat(AUTOMATED_DATE.replace('Z', '+00:00'))
            except ValueError:
                print(f"Warning: Invalid AUTOMATED_DATE format '{AUTOMATED_DATE}'. Using current time instead.")
                automation_date = datetime.now()
        else:
            automation_date = datetime.now()

        # Start date is the automation date, end date is weeks_back later
        start_date = automation_date
        end_date = automation_date + timedelta(weeks=weeks_back)

        # Format dates for GitHub API (ISO 8601)
        if start_date.tzinfo is None:
            start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        else:
            start_date_str = start_date.astimezone().strftime('%Y-%m-%dT%H:%M:%SZ')

        if end_date.tzinfo is None:
            end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        else:
            end_date_str = end_date.astimezone().strftime('%Y-%m-%dT%H:%M:%SZ')

        return start_date_str, end_date_str
    
    def get_pull_requests(self, weeks_back: int, start_date: str = None, end_date: str = None) -> List[Dict]:
        """Get all pull requests within the specified time period"""
        if start_date is None or end_date is None:
            start_date, end_date = self.calculate_date_range(weeks_back)

        url = f"{API_BASE_URL}/repos/{self.repo}/pulls"
        params = {
            'state': 'all',
            'sort': 'created',
            'direction': 'desc'
        }

        # Only add base branch filter if a specific branch is specified
        if self.branch:
            params['base'] = self.branch
        
        all_prs = self.get_all_pages(url, params)
        
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
        
        return filtered_prs
    
    def get_pr_comments(self, pr_number: int) -> List[Dict]:
        """Get all comments for a specific pull request"""
        url = f"{API_BASE_URL}/repos/{self.repo}/issues/{pr_number}/comments"
        return self.get_all_pages(url)
    
    def get_pr_review_comments(self, pr_number: int) -> List[Dict]:
        """Get all review comments for a specific pull request"""
        url = f"{API_BASE_URL}/repos/{self.repo}/pulls/{pr_number}/comments"
        return self.get_all_pages(url)
    
    def calculate_metrics(self, weeks_back: int) -> Dict[str, Any]:
        """Calculate all metrics for the specified time period"""
        start_date, end_date = self.calculate_date_range(weeks_back)
        print(f"Calculating metrics for {self.repo} over {weeks_back} week(s)...")
        print(f"Date range: {start_date} to {end_date}")

        prs = self.get_pull_requests(weeks_back)
        
        if not prs:
            print("No pull requests found in the specified time period.")
            return {}
        
        total_prs = len(prs)
        merged_prs = 0
        total_comments = 0
        total_time_to_merge = 0
        merge_count = 0
        
        print(f"Processing {total_prs} pull requests...")
        
        for pr in prs:
            pr_number = pr['number']
            
            # Get all comments for this PR
            comments = self.get_pr_comments(pr_number)
            review_comments = self.get_pr_review_comments(pr_number)
            total_comments += len(comments) + len(review_comments)
            
            # Check if PR was merged
            if pr['merged_at'] is not None:
                merged_prs += 1
                
                # Calculate time to merge
                created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
                merged_at = datetime.fromisoformat(pr['merged_at'].replace('Z', '+00:00'))
                time_to_merge = (merged_at - created_at).total_seconds() / 3600  # Hours
                total_time_to_merge += time_to_merge
                merge_count += 1
        
        # Calculate averages
        prs_per_week = total_prs / weeks_back
        merged_prs_per_week = merged_prs / weeks_back
        avg_comments_per_pr = total_comments / total_prs if total_prs > 0 else 0
        avg_time_to_merge = total_time_to_merge / merge_count if merge_count > 0 else 0
        
        return {
            'total_prs': total_prs,
            'merged_prs': merged_prs,
            'weeks_analyzed': weeks_back,
            'analysis_start_date': start_date,
            'analysis_end_date': end_date,
            'prs_created_per_week': round(prs_per_week, 2),
            'prs_merged_per_week': round(merged_prs_per_week, 2),
            'average_comments_per_pr': round(avg_comments_per_pr, 2),
            'average_time_to_merge_hours': round(avg_time_to_merge, 2),
            'average_time_to_merge_days': round(avg_time_to_merge / 24, 2)
        }

    def calculate_metrics_for_period(self, weeks_back: int, start_date: str, end_date: str, period_name: str) -> Dict[str, Any]:
        """Calculate metrics for a specific time period"""
        print(f"Calculating {period_name} metrics for {self.repo} over {weeks_back} week(s)...")
        print(f"Date range: {start_date} to {end_date}")

        prs = self.get_pull_requests(weeks_back, start_date, end_date)

        if not prs:
            print(f"No pull requests found in the {period_name} time period.")
            return {}

        total_prs = len(prs)
        merged_prs = 0
        total_comments = 0
        total_time_to_merge = 0
        merge_count = 0

        print(f"Processing {total_prs} pull requests for {period_name} period...")

        for pr in prs:
            pr_number = pr['number']

            # Get all comments for this PR
            comments = self.get_pr_comments(pr_number)
            review_comments = self.get_pr_review_comments(pr_number)
            total_comments += len(comments) + len(review_comments)

            # Check if PR was merged
            if pr['merged_at'] is not None:
                merged_prs += 1

                # Calculate time to merge
                created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
                merged_at = datetime.fromisoformat(pr['merged_at'].replace('Z', '+00:00'))
                time_to_merge = (merged_at - created_at).total_seconds() / 3600  # Hours
                total_time_to_merge += time_to_merge
                merge_count += 1

        # Calculate averages
        prs_per_week = total_prs / weeks_back
        merged_prs_per_week = merged_prs / weeks_back
        avg_comments_per_pr = total_comments / total_prs if total_prs > 0 else 0
        avg_time_to_merge = total_time_to_merge / merge_count if merge_count > 0 else 0

        return {
            'total_prs': total_prs,
            'merged_prs': merged_prs,
            'weeks_analyzed': weeks_back,
            'analysis_start_date': start_date,
            'analysis_end_date': end_date,
            'prs_created_per_week': round(prs_per_week, 2),
            'prs_merged_per_week': round(merged_prs_per_week, 2),
            'average_comments_per_pr': round(avg_comments_per_pr, 2),
            'average_time_to_merge_hours': round(avg_time_to_merge, 2),
            'average_time_to_merge_days': round(avg_time_to_merge / 24, 2)
        }

    def calculate_comparative_metrics(self, weeks_back: int) -> Dict[str, Any]:
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
        before_metrics = self.calculate_metrics_for_period(weeks_back, before_start, before_end, "beforeAuto")
        after_metrics = self.calculate_metrics_for_period(weeks_back, after_start, after_end, "afterAuto")

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

def main():
    """Main function to run the metrics calculator"""
    
    # Validate configuration
    if GITHUB_TOKEN == 'YOUR_GITHUB_TOKEN':
        print("ERROR: Please replace 'YOUR_GITHUB_TOKEN' with your actual GitHub token")
        return
    
    if REPO_NAME == 'owner/repo-name':
        print("ERROR: Please replace 'owner/repo-name' with your actual repository")
        return
    
    # Initialize calculator with branch parameter
    calculator = GitHubMetricsCalculator(GITHUB_TOKEN, REPO_NAME, BRANCH)

    try:
        # Calculate comparative metrics
        metrics = calculator.calculate_comparative_metrics(WEEKS_BACK)

        if metrics:
            # Display results
            print("\n" + "="*70)
            print("GITHUB PR METRICS COMPARATIVE ANALYSIS REPORT")
            print("="*70)
            print(f"Repository: {REPO_NAME}")
            print(f"Branch: {metrics.get('branch_analyzed', 'ALL branches')}")
            print(f"Automation Date: {metrics.get('automation_date', 'Not specified')}")
            print(f"Analysis Period: {WEEKS_BACK} week(s) for each comparison period")
            print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*70)

            # Before Automation Metrics
            print("\nBEFORE AUTOMATION METRICS:")
            print("-" * 40)
            if 'beforeAuto_analysis_start_date' in metrics:
                print(f"Date Range: {metrics['beforeAuto_analysis_start_date']} to {metrics['beforeAuto_analysis_end_date']}")
                print(f"Total Pull Requests Created: {metrics.get('beforeAuto_total_prs', 0)}")
                print(f"Total Pull Requests Merged: {metrics.get('beforeAuto_merged_prs', 0)}")
                print(f"Pull Requests Created per Week: {metrics.get('beforeAuto_prs_created_per_week', 0)}")
                print(f"Pull Requests Merged per Week: {metrics.get('beforeAuto_prs_merged_per_week', 0)}")
                print(f"Average Comments per PR: {metrics.get('beforeAuto_average_comments_per_pr', 0)}")
                print(f"Average Time to Merge: {metrics.get('beforeAuto_average_time_to_merge_hours', 0)} hours ({metrics.get('beforeAuto_average_time_to_merge_days', 0)} days)")
            else:
                print("No data available for before automation period")

            # After Automation Metrics
            print("\nAFTER AUTOMATION METRICS:")
            print("-" * 40)
            if 'afterAuto_analysis_start_date' in metrics:
                print(f"Date Range: {metrics['afterAuto_analysis_start_date']} to {metrics['afterAuto_analysis_end_date']}")
                print(f"Total Pull Requests Created: {metrics.get('afterAuto_total_prs', 0)}")
                print(f"Total Pull Requests Merged: {metrics.get('afterAuto_merged_prs', 0)}")
                print(f"Pull Requests Created per Week: {metrics.get('afterAuto_prs_created_per_week', 0)}")
                print(f"Pull Requests Merged per Week: {metrics.get('afterAuto_prs_merged_per_week', 0)}")
                print(f"Average Comments per PR: {metrics.get('afterAuto_average_comments_per_pr', 0)}")
                print(f"Average Time to Merge: {metrics.get('afterAuto_average_time_to_merge_hours', 0)} hours ({metrics.get('afterAuto_average_time_to_merge_days', 0)} days)")
            else:
                print("No data available for after automation period")

            # Comparison Summary
            print("\nCOMPARISON SUMMARY:")
            print("-" * 40)
            before_prs_per_week = metrics.get('beforeAuto_prs_created_per_week', 0)
            after_prs_per_week = metrics.get('afterAuto_prs_created_per_week', 0)
            before_merge_time = metrics.get('beforeAuto_average_time_to_merge_hours', 0)
            after_merge_time = metrics.get('afterAuto_average_time_to_merge_hours', 0)
            before_comments = metrics.get('beforeAuto_average_comments_per_pr', 0)
            after_comments = metrics.get('afterAuto_average_comments_per_pr', 0)

            if before_prs_per_week > 0:
                prs_change = ((after_prs_per_week - before_prs_per_week) / before_prs_per_week) * 100
                print(f"PRs Created per Week Change: {prs_change:+.1f}%")

            if before_merge_time > 0:
                merge_time_change = ((after_merge_time - before_merge_time) / before_merge_time) * 100
                print(f"Average Merge Time Change: {merge_time_change:+.1f}%")

            if before_comments > 0:
                comments_change = ((after_comments - before_comments) / before_comments) * 100
                print(f"Average Comments per PR Change: {comments_change:+.1f}%")

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
