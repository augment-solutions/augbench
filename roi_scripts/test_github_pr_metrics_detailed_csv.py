#!/usr/bin/env python3
"""
Unit tests for github_pr_metrics_detailed_csv.py

Tests the core functionality of the multi-repository CSV export script.
"""

import unittest
import tempfile
import os
import sys
import csv
import zipfile
from pathlib import Path

# Add the roi_scripts directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import functions from the main script
from github_pr_metrics_detailed_csv import (
    parse_repo_names,
    validate_repo_name,
    create_results_zip,
    write_summary_csv,
    write_contributor_csv,
    write_pr_csv,
)


class TestParseRepoNames(unittest.TestCase):
    """Test repository name parsing"""

    def test_single_repo(self):
        """Test parsing a single repository"""
        result = parse_repo_names("owner/repo")
        self.assertEqual(result, ["owner/repo"])

    def test_multiple_repos(self):
        """Test parsing multiple repositories"""
        result = parse_repo_names("owner/repo1;owner/repo2;sharath/angular")
        self.assertEqual(result, ["owner/repo1", "owner/repo2", "sharath/angular"])

    def test_repos_with_whitespace(self):
        """Test parsing repositories with whitespace"""
        result = parse_repo_names("owner/repo1 ; owner/repo2 ; sharath/angular")
        self.assertEqual(result, ["owner/repo1", "owner/repo2", "sharath/angular"])

    def test_empty_string(self):
        """Test parsing empty string"""
        result = parse_repo_names("")
        self.assertEqual(result, [])

    def test_none_input(self):
        """Test parsing None input"""
        result = parse_repo_names(None)
        self.assertEqual(result, [])


class TestValidateRepoName(unittest.TestCase):
    """Test repository name validation"""

    def test_valid_repo(self):
        """Test valid repository name"""
        is_valid, error = validate_repo_name("owner/repo")
        self.assertTrue(is_valid)
        self.assertEqual(error, "")

    def test_invalid_repo_no_slash(self):
        """Test invalid repository name without slash"""
        is_valid, error = validate_repo_name("invalid_repo")
        self.assertFalse(is_valid)
        self.assertIn("must be in format", error)

    def test_empty_repo(self):
        """Test empty repository name"""
        is_valid, error = validate_repo_name("")
        self.assertFalse(is_valid)
        self.assertIn("empty", error)

    def test_repo_with_multiple_slashes(self):
        """Test repository name with multiple slashes (should be valid as it contains at least one slash)"""
        is_valid, error = validate_repo_name("owner/org/repo")
        # The validation only checks for presence of slash, so this is valid
        self.assertTrue(is_valid)


class TestCreateResultsZip(unittest.TestCase):
    """Test ZIP archive creation"""

    def test_create_zip_with_files(self):
        """Test creating ZIP archive with CSV files"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test CSV files
            test_files = []
            for i in range(3):
                filepath = os.path.join(tmpdir, f"test_{i}.csv")
                with open(filepath, 'w') as f:
                    f.write("test,data\n1,2\n")
                test_files.append(filepath)

            # Create ZIP
            zip_path = os.path.join(tmpdir, "results.zip")
            result = create_results_zip(test_files, zip_path)

            # Verify
            self.assertTrue(result)
            self.assertTrue(os.path.exists(zip_path))

            # Check ZIP contents
            with zipfile.ZipFile(zip_path, 'r') as zipf:
                names = zipf.namelist()
                self.assertEqual(len(names), 3)
                for name in names:
                    self.assertIn("test_", name)

    def test_create_zip_empty_list(self):
        """Test creating ZIP with empty file list"""
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "results.zip")
            result = create_results_zip([], zip_path)
            self.assertFalse(result)


class TestWriteCSVFunctions(unittest.TestCase):
    """Test CSV writing functions"""

    def test_write_summary_csv(self):
        """Test writing summary CSV"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "summary.csv")
            metrics = {
                'beforeAuto_total_prs': 10,
                'afterAuto_total_prs': 15,
                'beforeAuto_merged_prs': 8,
                'afterAuto_merged_prs': 12,
            }

            write_summary_csv(filepath, metrics)

            # Verify file exists and has content
            self.assertTrue(os.path.exists(filepath))
            with open(filepath, 'r') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                self.assertEqual(len(rows), 2)  # beforeAuto and afterAuto

    def test_write_contributor_csv(self):
        """Test writing contributor mapping CSV"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "contributors.csv")
            contributors = [
                {"github_username": "alice", "emails": ["alice@example.com"]},
                {"github_username": "bob", "emails": ["bob@example.com", "bob.smith@example.com"]},
            ]

            write_contributor_csv(filepath, contributors)

            # Verify file exists and has content
            self.assertTrue(os.path.exists(filepath))
            with open(filepath, 'r') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                self.assertEqual(len(rows), 2)

    def test_write_pr_csv(self):
        """Test writing PR details CSV"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "pr_details.csv")
            pr_details = [
                {
                    "number": 1,
                    "title": "Test PR",
                    "author": "alice",
                    "state": "merged",
                    "created_at": "2024-01-01T00:00:00Z",
                    "merged_at": "2024-01-02T00:00:00Z",
                },
            ]

            write_pr_csv(filepath, pr_details, "owner/repo")

            # Verify file exists and has content
            self.assertTrue(os.path.exists(filepath))
            with open(filepath, 'r') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                self.assertEqual(len(rows), 1)


class TestIntegration(unittest.TestCase):
    """Integration tests"""

    def test_multi_repo_workflow(self):
        """Test the complete multi-repository workflow"""
        # Test parsing multiple repos
        repos = parse_repo_names("owner/repo1;owner/repo2")
        self.assertEqual(len(repos), 2)

        # Validate each repo
        for repo in repos:
            is_valid, error = validate_repo_name(repo)
            self.assertTrue(is_valid, f"Repo {repo} should be valid: {error}")

    def test_backward_compatibility(self):
        """Test backward compatibility with single repository"""
        # Single repo should work exactly as before
        repos = parse_repo_names("owner/repo")
        self.assertEqual(len(repos), 1)
        self.assertEqual(repos[0], "owner/repo")

        is_valid, error = validate_repo_name(repos[0])
        self.assertTrue(is_valid)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)

