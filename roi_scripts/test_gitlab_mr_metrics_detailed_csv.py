#!/usr/bin/env python3
"""
Unit tests for gitlab_mr_metrics_detailed_csv.py

Tests cover:
- Project ID parsing (single, multiple, with whitespace)
- Project ID validation
- ZIP archive creation
- CSV writing functions
- Integration tests for multi-project workflow
"""

import unittest
import tempfile
import os
import csv
import zipfile
from datetime import datetime
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from gitlab_mr_metrics_detailed_csv import (
    parse_project_ids,
    validate_project_id,
    get_mr_csv_columns,
    get_summary_csv_columns,
    get_contributor_csv_columns,
    flatten_mr_for_csv,
    write_mr_csv,
    write_summary_csv,
    write_contributor_csv,
    create_results_zip,
)

class TestParseProjectIds(unittest.TestCase):
    """Test project ID parsing"""
    
    def test_single_project(self):
        """Test parsing single project ID"""
        result = parse_project_ids("namespace/project")
        self.assertEqual(result, ["namespace/project"])
    
    def test_multiple_projects(self):
        """Test parsing multiple project IDs"""
        result = parse_project_ids("namespace/project1;namespace/project2;org/project3")
        self.assertEqual(result, ["namespace/project1", "namespace/project2", "org/project3"])
    
    def test_projects_with_whitespace(self):
        """Test parsing projects with whitespace"""
        result = parse_project_ids("namespace/project1 ; namespace/project2 ; org/project3")
        self.assertEqual(result, ["namespace/project1", "namespace/project2", "org/project3"])
    
    def test_empty_string(self):
        """Test parsing empty string"""
        result = parse_project_ids("")
        self.assertEqual(result, [])
    
    def test_none_input(self):
        """Test parsing None input"""
        result = parse_project_ids(None)
        self.assertEqual(result, [])

class TestValidateProjectId(unittest.TestCase):
    """Test project ID validation"""
    
    def test_valid_namespace_project(self):
        """Test valid namespace/project format"""
        valid, msg = validate_project_id("namespace/project")
        self.assertTrue(valid)
        self.assertEqual(msg, "")
    
    def test_valid_numeric_id(self):
        """Test valid numeric project ID"""
        valid, msg = validate_project_id("12345")
        self.assertTrue(valid)
        self.assertEqual(msg, "")
    
    def test_invalid_no_slash(self):
        """Test invalid project name without slash"""
        valid, msg = validate_project_id("invalidproject")
        self.assertFalse(valid)
        self.assertIn("must be numeric ID or in format", msg)
    
    def test_empty_project(self):
        """Test empty project ID"""
        valid, msg = validate_project_id("")
        self.assertFalse(valid)
        self.assertIn("empty", msg)

class TestCSVColumns(unittest.TestCase):
    """Test CSV column definitions"""
    
    def test_mr_csv_columns(self):
        """Test MR CSV columns are defined"""
        columns = get_mr_csv_columns()
        self.assertGreater(len(columns), 0)
        self.assertIn("project", columns)
        self.assertIn("iid", columns)
        self.assertIn("title", columns)
    
    def test_summary_csv_columns(self):
        """Test summary CSV columns are defined"""
        columns = get_summary_csv_columns()
        self.assertGreater(len(columns), 0)
        self.assertIn("period", columns)
        self.assertIn("total_mrs", columns)
    
    def test_contributor_csv_columns(self):
        """Test contributor CSV columns are defined"""
        columns = get_contributor_csv_columns()
        self.assertEqual(len(columns), 2)
        self.assertIn("gitlab_username", columns)
        self.assertIn("emails", columns)

class TestFlattenMRForCSV(unittest.TestCase):
    """Test MR flattening for CSV"""
    
    def test_flatten_basic_mr(self):
        """Test flattening basic MR data"""
        mr = {
            "iid": 123,
            "title": "Test MR",
            "author": "testuser",
            "state": "merged",
            "merged_at": "2024-01-15T10:00:00Z",
            "created_at": "2024-01-10T10:00:00Z",
            "closed_at": None,
            "notes_count": 5,
            "changes_count": 100,
            "discussions": []
        }
        
        result = flatten_mr_for_csv(mr, "namespace/project")
        
        self.assertEqual(result["project"], "namespace/project")
        self.assertEqual(result["iid"], "123")
        self.assertEqual(result["title"], "Test MR")
        self.assertEqual(result["author"], "testuser")
        self.assertEqual(result["merged"], "TRUE")

class TestWriteCSVFunctions(unittest.TestCase):
    """Test CSV writing functions"""
    
    def setUp(self):
        """Create temporary directory for test files"""
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Clean up temporary files"""
        for file in os.listdir(self.temp_dir):
            os.remove(os.path.join(self.temp_dir, file))
        os.rmdir(self.temp_dir)
    
    def test_write_mr_csv(self):
        """Test writing MR CSV"""
        mr_details = [
            {
                "iid": 1,
                "title": "MR 1",
                "author": "user1",
                "state": "merged",
                "merged_at": "2024-01-15T10:00:00Z",
                "created_at": "2024-01-10T10:00:00Z",
                "closed_at": None,
                "notes_count": 3,
                "changes_count": 50,
                "discussions": []
            }
        ]
        
        file_path = os.path.join(self.temp_dir, "test_mrs.csv")
        write_mr_csv(file_path, mr_details, "namespace/project")
        
        self.assertTrue(os.path.exists(file_path))
        with open(file_path, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["iid"], "1")
    
    def test_write_summary_csv(self):
        """Test writing summary CSV"""
        metrics = {
            "beforeAuto_total_mrs": 10,
            "beforeAuto_merged_mrs": 8,
            "afterAuto_total_mrs": 15,
            "afterAuto_merged_mrs": 12,
        }
        
        file_path = os.path.join(self.temp_dir, "test_summary.csv")
        write_summary_csv(file_path, metrics)
        
        self.assertTrue(os.path.exists(file_path))
        with open(file_path, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["period"], "beforeAuto")
            self.assertEqual(rows[1]["period"], "afterAuto")
    
    def test_write_contributor_csv(self):
        """Test writing contributor CSV"""
        contributors = [
            {"gitlab_username": "user1", "emails": ["user1@example.com"]},
            {"gitlab_username": "user2", "emails": ["user2@example.com", "user2.alt@example.com"]}
        ]
        
        file_path = os.path.join(self.temp_dir, "test_contributors.csv")
        write_contributor_csv(file_path, contributors)
        
        self.assertTrue(os.path.exists(file_path))
        with open(file_path, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["gitlab_username"], "user1")

class TestCreateResultsZip(unittest.TestCase):
    """Test ZIP archive creation"""
    
    def setUp(self):
        """Create temporary directory and test files"""
        self.temp_dir = tempfile.mkdtemp()
        self.test_files = []
        
        # Create test CSV files
        for i in range(3):
            file_path = os.path.join(self.temp_dir, f"test_{i}.csv")
            with open(file_path, 'w') as f:
                f.write(f"test,data,{i}\n")
            self.test_files.append(file_path)
    
    def tearDown(self):
        """Clean up temporary files"""
        for file in os.listdir(self.temp_dir):
            os.remove(os.path.join(self.temp_dir, file))
        os.rmdir(self.temp_dir)
    
    def test_create_zip_with_files(self):
        """Test creating ZIP with multiple files"""
        zip_path = os.path.join(self.temp_dir, "results.zip")
        result = create_results_zip(self.test_files, zip_path)
        
        self.assertTrue(result)
        self.assertTrue(os.path.exists(zip_path))
        
        # Verify ZIP contents
        with zipfile.ZipFile(zip_path, 'r') as zipf:
            names = zipf.namelist()
            self.assertEqual(len(names), 3)
    
    def test_create_zip_empty_list(self):
        """Test creating ZIP with empty file list"""
        zip_path = os.path.join(self.temp_dir, "results.zip")
        result = create_results_zip([], zip_path)
        
        self.assertFalse(result)
        self.assertFalse(os.path.exists(zip_path))

class TestIntegration(unittest.TestCase):
    """Integration tests"""
    
    def test_multi_project_workflow(self):
        """Test multi-project parsing and validation"""
        projects = parse_project_ids("namespace/project1;namespace/project2;12345")
        
        self.assertEqual(len(projects), 3)
        
        for project in projects:
            valid, msg = validate_project_id(project)
            self.assertTrue(valid, f"Project {project} should be valid: {msg}")
    
    def test_backward_compatibility(self):
        """Test backward compatibility with single project"""
        projects = parse_project_ids("namespace/project")
        
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0], "namespace/project")
        
        valid, msg = validate_project_id(projects[0])
        self.assertTrue(valid)

if __name__ == '__main__':
    unittest.main()

