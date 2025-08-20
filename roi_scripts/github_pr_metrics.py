#!/usr/bin/env python3
"""
GitHub PR Metrics Calculator

This script calculates various metrics for GitHub pull requests over a specified time period.
Metrics calculated:
1. Average number of Pull Requests created per week
2. Average number of Pull Requests merged per week
3. Average number of comments across all Pull Requests in the time period
4. Average time to merge (difference between PR mergedAt and PR createdAt timestamps)

Usage:
1. Replace YOUR_GITHUB_TOKEN with your GitHub personal access token
2. Replace owner/repo-name with your target repository
3. Adjust WEEKS_BACK as needed (default: 2)
4. Run: python github_pr_metrics.py
"""

import requests
import json
from datetime import datetime, timedelta
import os
import time
from typing import Dict, List, Any, Optional

# Configuration - Replace these values
GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN'
REPO_NAME = 'owner/repo-name'  # Format: 'owner/repo-name'
WEEKS_BACK = 2  # Number of weeks to look back

# GitHub API configuration
API_BASE_URL = 'https://api.github.com'
API_VERSION = 'application/vnd.github.v3+json'

class GitHubMetricsCalculator:
    def __init__(self, token: str, repo: str):
        self.token = token
        self.repo = repo
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
    
    def calculate_date_range(self, weeks_back: int) -> tuple:
        """Calculate the date range for the specified period"""
        end_date = datetime.now()
        start_date = end_date - timedelta(weeks=weeks_back)
        
        # Format dates for GitHub API (ISO 8601)
        start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        return start_date_str, end_date_str
    
    def get_pull_requests(self, weeks_back: int) -> List[Dict]:
        """Get all pull requests within the specified time period"""
        start_date, end_date = self.calculate_date_range(weeks_back)
        
        url = f"{API_BASE_URL}/repos/{self.repo}/pulls"
        params = {
            'state': 'all',
            'sort': 'created',
            'direction': 'desc',
            'base': 'main'
        }
        
        all_prs = self.get_all_pages(url, params)
        
        # Filter PRs by date range
        filtered_prs = []
        start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        for pr in all_prs:
            created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
            if created_at >= start_datetime:
                filtered_prs.append(pr)
            else:
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
        print(f"Calculating metrics for {self.repo} over the last {weeks_back} week(s)...")
        
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
            'prs_created_per_week': round(prs_per_week, 2),
            'prs_merged_per_week': round(merged_prs_per_week, 2),
            'average_comments_per_pr': round(avg_comments_per_pr, 2),
            'average_time_to_merge_hours': round(avg_time_to_merge, 2),
            'average_time_to_merge_days': round(avg_time_to_merge / 24, 2)
        }

def main():
    """Main function to run the metrics calculator"""
    
    # Validate configuration
    if GITHUB_TOKEN == 'YOUR_GITHUB_TOKEN':
        print("ERROR: Please replace 'YOUR_GITHUB_TOKEN' with your actual GitHub token")
        return
    
    if REPO_NAME == 'owner/repo-name':
        print("ERROR: Please replace 'owner/repo-name' with your actual repository")
        return
    
    # Initialize calculator
    calculator = GitHubMetricsCalculator(GITHUB_TOKEN, REPO_NAME)
    
    try:
        # Calculate metrics
        metrics = calculator.calculate_metrics(WEEKS_BACK)
        
        if metrics:
            # Display results
            print("\n" + "="*50)
            print("GITHUB PR METRICS REPORT")
            print("="*50)
            print(f"Repository: {REPO_NAME}")
            print(f"Time Period: Last {WEEKS_BACK} week(s)")
            print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("-" * 50)
            print(f"Total Pull Requests Created: {metrics['total_prs']}")
            print(f"Total Pull Requests Merged: {metrics['merged_prs']}")
            print(f"Pull Requests Created per Week: {metrics['prs_created_per_week']}")
            print(f"Pull Requests Merged per Week: {metrics['prs_merged_per_week']}")
            print(f"Average Comments per PR: {metrics['average_comments_per_pr']}")
            print(f"Average Time to Merge: {metrics['average_time_to_merge_hours']} hours ({metrics['average_time_to_merge_days']} days)")
            print("="*50)
            
            # Save results to JSON file
            output_file = f"github_pr_metrics_{REPO_NAME.replace('/', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(output_file, 'w') as f:
                json.dump(metrics, f, indent=2)
            print(f"\nResults saved to: {output_file}")
            
    except Exception as e:
        print(f"Error calculating metrics: {e}")

if __name__ == "__main__":
    main()
