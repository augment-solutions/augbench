#!/usr/bin/env python3
"""
GitHub Pull Request Analysis Script

Analyzes pull request activity across all accessible repositories using the GitHub API.
Returns PR statistics for different time windows (7, 30, 90, 180 days) including
total PRs, merged PRs, and open PRs for each repository.

This script uses the /repos/{owner}/{repo}/pulls endpoint to fetch PR data
and calculates statistics based on creation dates.

Usage:
    export GITHUB_TOKEN="your_token_here"
    python github_pr_analysis.py

Example:
    export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
    python github_pr_analysis.py
"""

import os
import json
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Any
import sys
import getpass

# Configuration
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://api.github.com')


class GitHubPRAnalyzer:
    """Analyze pull request activity across GitHub repositories"""

    def __init__(self, token: str):
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitHub-PR-Analyzer'
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def get_user_repos(self, owner: str = '') -> List[Dict[str, Any]]:
        """Get repositories accessible to the authenticated user, optionally filtered by owner"""
        print("Fetching repositories...")
        repos = []
        page = 1

        while True:
            if owner:
                # Fetch repos for a specific owner/organization
                url = f"{API_BASE_URL}/orgs/{owner}/repos"
                params = {
                    'per_page': 100,
                    'page': page,
                    'type': 'all'
                }
            else:
                # Fetch all repos accessible to the user
                url = f"{API_BASE_URL}/user/repos"
                params = {
                    'per_page': 100,
                    'page': page,
                    'type': 'all'
                }

            try:
                response = self.session.get(url, params=params, timeout=30)
                response.raise_for_status()

                data = response.json()
                if not data:
                    break

                repos.extend(data)
                print(f"  Fetched page {page}: {len(data)} repos")
                page += 1

            except requests.exceptions.RequestException as e:
                print(f"Error fetching repos: {e}")
                break

        print(f"Total repositories found: {len(repos)}\n")
        return repos

    def get_pull_requests(self, owner: str, repo: str, days: int) -> List[Dict[str, Any]]:
        """Get pull requests for a repository within the specified time period"""
        try:
            # Calculate the cutoff date
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            prs = []
            page = 1
            
            while True:
                url = f"{API_BASE_URL}/repos/{owner}/{repo}/pulls"
                params = {
                    'state': 'all',  # Get both open and closed PRs
                    'sort': 'created',
                    'direction': 'desc',
                    'per_page': 100,
                    'page': page
                }
                
                response = self.session.get(url, params=params, timeout=30)
                response.raise_for_status()
                
                data = response.json()
                if not data:
                    break
                
                # Filter PRs by creation date
                for pr in data:
                    created_at = datetime.strptime(pr['created_at'], '%Y-%m-%dT%H:%M:%SZ')
                    if created_at >= cutoff_date:
                        prs.append(pr)
                    else:
                        # Since PRs are sorted by creation date (desc), we can stop
                        return prs
                
                page += 1
                
                # Safety limit to avoid infinite loops
                if page > 100:
                    break
            
            return prs

        except requests.exceptions.RequestException as e:
            print(f"    Error fetching PRs for {owner}/{repo}: {e}")
            return []

    def analyze_prs_for_periods(self, owner: str, repo: str, time_periods: List[int]) -> Dict[int, Dict[str, int]]:
        """Analyze PRs for multiple time periods"""
        # Fetch PRs for the longest period (we'll filter for shorter periods)
        max_period = max(time_periods)
        all_prs = self.get_pull_requests(owner, repo, max_period)
        
        results = {}
        
        for period in time_periods:
            cutoff_date = datetime.utcnow() - timedelta(days=period)
            
            # Filter PRs for this specific period
            period_prs = [
                pr for pr in all_prs
                if datetime.strptime(pr['created_at'], '%Y-%m-%dT%H:%M:%SZ') >= cutoff_date
            ]
            
            # Count total, merged, and open PRs
            total = len(period_prs)
            merged = sum(1 for pr in period_prs if pr.get('merged_at') is not None)
            open_prs = sum(1 for pr in period_prs if pr['state'] == 'open')
            closed = total - open_prs
            
            results[period] = {
                'total': total,
                'merged': merged,
                'open': open_prs,
                'closed': closed
            }
        
        return results


def main():
    """Main function"""
    # Get GitHub token from environment or prompt user
    github_token = os.environ.get('GITHUB_TOKEN', '')

    if not github_token:
        print("\n" + "="*70)
        print("GITHUB PULL REQUEST ANALYSIS")
        print("="*70)
        github_token = getpass.getpass("Enter your GitHub token: ")

        if not github_token:
            print("ERROR: GitHub token is required")
            sys.exit(1)

    # Prompt for owner/organization
    owner = input("Enter GitHub owner/organization (leave blank for all repos): ").strip()

    print("\n" + "="*70)
    if owner:
        print(f"GITHUB PULL REQUEST ANALYSIS - {owner}")
    else:
        print("GITHUB PULL REQUEST ANALYSIS - ALL REPOSITORIES")
    print("="*70)
    print(f"Analysis Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")

    analyzer = GitHubPRAnalyzer(github_token)
    repos = analyzer.get_user_repos(owner)

    if not repos:
        print("No repositories found.")
        sys.exit(1)

    results = {
        'analysis_date': datetime.utcnow().isoformat() + 'Z',
        'total_repos': len(repos),
        'repositories': []
    }

    print(f"{'-'*70}")
    print("Analyzing repositories...")
    print(f"{'-'*70}\n")

    # Time periods to analyze (in days)
    time_periods = [7, 30, 90, 180]

    # Initialize totals for each period
    period_totals = {
        period: {'total': 0, 'merged': 0, 'open': 0, 'closed': 0}
        for period in time_periods
    }

    for i, repo in enumerate(repos, 1):
        owner = repo['owner']['login']
        repo_name = repo['name']

        pr_stats = analyzer.analyze_prs_for_periods(owner, repo_name, time_periods)

        if any(pr_stats[period]['total'] > 0 for period in time_periods):
            results['repositories'].append({
                'name': f"{owner}/{repo_name}",
                'periods': pr_stats
            })
            
            # Update totals
            for period in time_periods:
                period_totals[period]['total'] += pr_stats[period]['total']
                period_totals[period]['merged'] += pr_stats[period]['merged']
                period_totals[period]['open'] += pr_stats[period]['open']
                period_totals[period]['closed'] += pr_stats[period]['closed']
            
            print(f"{i:3d}. {owner}/{repo_name}:")
            print(f"     7d: {pr_stats[7]['total']:3d} total ({pr_stats[7]['merged']:3d} merged, {pr_stats[7]['open']:3d} open)")
            print(f"    30d: {pr_stats[30]['total']:3d} total ({pr_stats[30]['merged']:3d} merged, {pr_stats[30]['open']:3d} open)")
            print(f"    90d: {pr_stats[90]['total']:3d} total ({pr_stats[90]['merged']:3d} merged, {pr_stats[90]['open']:3d} open)")
            print(f"   180d: {pr_stats[180]['total']:3d} total ({pr_stats[180]['merged']:3d} merged, {pr_stats[180]['open']:3d} open)")
        else:
            print(f"{i:3d}. {owner}/{repo_name}: No PR activity")

    # Add period totals to results
    results['period_totals'] = {f'{period}_days': period_totals[period] for period in time_periods}

    # Save results to JSON
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    output_file = f"github_pr_analysis_all_repos_{timestamp}.json"

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n{'-'*70}")
    print("Total PRs across all repos:")
    for period in time_periods:
        stats = period_totals[period]
        print(f"  Last {period:3d} days: {stats['total']:5d} total ({stats['merged']:5d} merged, {stats['open']:5d} open, {stats['closed']:5d} closed)")
    print(f"{'-'*70}")
    print(f"Results saved to: {output_file}")
    print("="*70)


if __name__ == "__main__":
    main()

