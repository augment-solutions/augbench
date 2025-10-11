#!/usr/bin/env python3
"""
GitHub Commit Analysis Script

Analyzes commit activity across all accessible repositories using the GitHub API's
built-in statistics endpoint. Returns the last 52 weeks of commit activity
grouped by week for each repository.

This script uses the /stats/commit_activity endpoint which returns the last
year of commit activity grouped by week.

Usage:
    export GITHUB_TOKEN="your_token_here"
    python github_pr_commit_analysis.py

Example:
    export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
    python github_pr_commit_analysis.py
"""

import os
import json
import requests
from datetime import datetime
from typing import Dict, List, Any
import sys
import time
import getpass

# Configuration
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://api.github.com')


class GitHubCommitAnalyzer:
    """Analyze commit activity across GitHub repositories"""

    def __init__(self, token: str):
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitHub-Commit-Analyzer'
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

    def get_weekly_commit_count(self, owner: str, repo: str) -> Dict[str, Any]:
        """Get weekly commit count for a repository"""
        try:
            url = f"{API_BASE_URL}/repos/{owner}/{repo}/stats/participation"
            response = self.session.get(url, timeout=30)

            # Handle 202 (still computing) and 204 (no data)
            if response.status_code == 202:
                time.sleep(1)
                return self.get_weekly_commit_count(owner, repo)
            elif response.status_code == 204:
                return {'all': [], 'owner': []}

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"    Error fetching {owner}/{repo}: {e}")
            return {'all': [], 'owner': []}

    def calculate_commits_for_period(self, weekly_data: list, days: int) -> int:
        """Calculate total commits for a specific period (in days)"""
        if not weekly_data:
            return 0

        # Each week is 7 days, so calculate how many weeks back we need
        weeks_back = (days + 6) // 7  # Round up to nearest week

        # Get the last N weeks of data
        recent_weeks = weekly_data[-weeks_back:] if weeks_back <= len(weekly_data) else weekly_data

        return sum(recent_weeks)


def main():
    """Main function"""
    # Get GitHub token from environment or prompt user
    github_token = os.environ.get('GITHUB_TOKEN', '')

    if not github_token:
        print("\n" + "="*70)
        print("GITHUB COMMIT ANALYSIS")
        print("="*70)
        github_token = getpass.getpass("Enter your GitHub token: ")

        if not github_token:
            print("ERROR: GitHub token is required")
            sys.exit(1)

    # Prompt for owner/organization
    owner = input("Enter GitHub owner/organization (leave blank for all repos): ").strip()

    print("\n" + "="*70)
    if owner:
        print(f"GITHUB COMMIT ANALYSIS - {owner}")
    else:
        print("GITHUB COMMIT ANALYSIS - ALL REPOSITORIES")
    print("="*70)
    print(f"Analysis Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")

    analyzer = GitHubCommitAnalyzer(github_token)
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
    period_totals = {period: 0 for period in time_periods}

    for i, repo in enumerate(repos, 1):
        owner = repo['owner']['login']
        repo_name = repo['name']

        weekly_data = analyzer.get_weekly_commit_count(owner, repo_name)

        if weekly_data and weekly_data['all']:
            repo_periods = {}
            for period in time_periods:
                commits = analyzer.calculate_commits_for_period(weekly_data['all'], period)
                repo_periods[period] = commits
                period_totals[period] += commits

            results['repositories'].append({
                'name': f"{owner}/{repo_name}",
                'periods': repo_periods,
                'weekly_data': weekly_data['all']
            })
            print(f"{i:3d}. {owner}/{repo_name}: 7d={repo_periods[7]:4d}, 30d={repo_periods[30]:4d}, 90d={repo_periods[90]:4d}, 180d={repo_periods[180]:4d}")
        else:
            print(f"{i:3d}. {owner}/{repo_name}: No activity")

    # Add period totals to results
    results['period_totals'] = {f'{period}_days': period_totals[period] for period in time_periods}

    # Save results to JSON
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    output_file = f"github_commit_analysis_all_repos_{timestamp}.json"

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n{'-'*70}")
    print("Total commits across all repos:")
    for period in time_periods:
        print(f"  Last {period:3d} days: {period_totals[period]:5d} commits")
    print(f"{'-'*70}")
    print(f"Results saved to: {output_file}")
    print("="*70)


if __name__ == "__main__":
    main()

