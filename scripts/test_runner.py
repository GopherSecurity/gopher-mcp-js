#!/usr/bin/env python3
"""Enhanced test runner with detailed reporting for gopher-orch"""

import subprocess
import sys
import time
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple
import re
import os

class TestResult:
    def __init__(self):
        self.name = ""
        self.suite = ""
        self.status = ""
        self.time = 0.0
        self.failure_message = ""
        self.file = ""
        self.line = 0

class TestSuiteResult:
    def __init__(self):
        self.name = ""
        self.tests: List[TestResult] = []
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.time = 0.0

class TestRunner:
    def __init__(self, build_dir: str = "build"):
        self.build_dir = Path(build_dir)
        self.bin_dir = self.build_dir / "bin"
        self.results_dir = self.build_dir / "test_results"
        self.results_dir.mkdir(exist_ok=True)
        
        self.test_executables = [
            "hello_test",
            "orch_framework_test", 
            "ffi_test",
            "gopher-orch-tests"
        ]
        
        self.all_results: Dict[str, TestSuiteResult] = {}
        self.start_time = None
        self.end_time = None
        
    def run_test_executable(self, test_name: str) -> Tuple[int, str, str]:
        """Run a single test executable and capture output"""
        test_path = self.bin_dir / test_name
        if not test_path.exists():
            return 1, "", f"Test executable {test_name} not found"
        
        xml_output = self.results_dir / f"{test_name}.xml"
        env = os.environ.copy()
        env['GTEST_OUTPUT'] = f'xml:{xml_output}'
        env['GTEST_COLOR'] = 'yes'
        
        try:
            result = subprocess.run(
                [str(test_path)],
                capture_output=True,
                text=True,
                env=env,
                timeout=60
            )
            return result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return 1, "", f"Test {test_name} timed out after 60 seconds"
        except Exception as e:
            return 1, "", f"Error running {test_name}: {e}"
    
    def parse_xml_results(self, test_name: str) -> List[TestSuiteResult]:
        """Parse Google Test XML output"""
        xml_file = self.results_dir / f"{test_name}.xml"
        if not xml_file.exists():
            return []
        
        try:
            tree = ET.parse(xml_file)
            root = tree.getroot()
            
            suites = []
            for testsuite in root.findall('testsuite'):
                suite_result = TestSuiteResult()
                suite_result.name = testsuite.get('name', 'Unknown')
                suite_result.time = float(testsuite.get('time', 0))
                
                for testcase in testsuite.findall('testcase'):
                    test = TestResult()
                    test.name = testcase.get('name', 'Unknown')
                    test.suite = suite_result.name
                    test.time = float(testcase.get('time', 0))
                    test.file = testcase.get('file', '')
                    test.line = int(testcase.get('line', 0))
                    
                    failure = testcase.find('failure')
                    if failure is not None:
                        test.status = 'FAILED'
                        test.failure_message = failure.get('message', '')
                        suite_result.failed += 1
                    else:
                        test.status = 'PASSED'
                        suite_result.passed += 1
                    
                    suite_result.tests.append(test)
                
                suites.append(suite_result)
            
            return suites
        except Exception as e:
            print(f"Error parsing XML for {test_name}: {e}")
            return []
    
    def parse_console_output(self, output: str) -> Dict:
        """Parse console output for additional statistics"""
        stats = {
            'total_tests': 0,
            'total_suites': 0,
            'assertions': 0,
            'memory_leaks': False,
            'warnings': []
        }
        
        # Parse test counts
        match = re.search(r'\[==========\] Running (\d+) tests? from (\d+) test suites?', output)
        if match:
            stats['total_tests'] = int(match.group(1))
            stats['total_suites'] = int(match.group(2))
        
        # Check for memory leaks
        if 'leak' in output.lower() or 'memory error' in output.lower():
            stats['memory_leaks'] = True
        
        # Extract warnings
        warning_lines = [line for line in output.split('\n') if 'warning' in line.lower()]
        stats['warnings'] = warning_lines[:5]  # Keep first 5 warnings
        
        return stats
    
    def generate_summary(self) -> str:
        """Generate detailed test summary"""
        total_tests = 0
        total_passed = 0
        total_failed = 0
        total_time = 0.0
        failed_tests = []
        slowest_tests = []
        
        # Collect statistics
        for exec_name, suites in self.all_results.items():
            for suite in suites:
                total_tests += len(suite.tests)
                total_passed += suite.passed
                total_failed += suite.failed
                total_time += suite.time
                
                for test in suite.tests:
                    if test.status == 'FAILED':
                        failed_tests.append(f"{suite.name}.{test.name}")
                    slowest_tests.append((f"{suite.name}.{test.name}", test.time))
        
        # Sort slowest tests
        slowest_tests.sort(key=lambda x: x[1], reverse=True)
        
        # Calculate execution time
        execution_time = (self.end_time - self.start_time) if self.start_time and self.end_time else 0
        
        # Build summary
        summary = []
        summary.append("\n" + "="*80)
        summary.append("                    TEST EXECUTION SUMMARY")
        summary.append("="*80)
        
        # Overall statistics
        summary.append("\n📊 OVERALL STATISTICS:")
        summary.append(f"  Total Test Suites:    {len(self.all_results)}")
        summary.append(f"  Total Test Cases:     {total_tests}")
        summary.append(f"  ✅ Passed:            {total_passed} ({100*total_passed/total_tests:.1f}%)" if total_tests > 0 else "  ✅ Passed:            0")
        summary.append(f"  ❌ Failed:            {total_failed}")
        summary.append(f"  ⏱️  Total Time:        {execution_time:.2f}s (wall clock)")
        summary.append(f"  🔧 Test Execution:    {total_time:.3f}s (cumulative)")
        
        # Per-executable breakdown
        summary.append("\n📦 PER-EXECUTABLE BREAKDOWN:")
        for exec_name, suites in self.all_results.items():
            exec_total = sum(len(s.tests) for s in suites)
            exec_passed = sum(s.passed for s in suites)
            exec_failed = sum(s.failed for s in suites)
            exec_time = sum(s.time for s in suites)
            
            status_icon = "✅" if exec_failed == 0 else "❌"
            summary.append(f"\n  {status_icon} {exec_name}:")
            summary.append(f"     Tests: {exec_total} | Passed: {exec_passed} | Failed: {exec_failed} | Time: {exec_time:.3f}s")
            
            # Show suite breakdown
            for suite in suites:
                if len(suites) > 1:  # Only show if multiple suites
                    summary.append(f"     └─ {suite.name}: {len(suite.tests)} tests ({suite.passed} passed, {suite.failed} failed)")
        
        # Failed tests detail
        if failed_tests:
            summary.append("\n❌ FAILED TESTS:")
            for i, test in enumerate(failed_tests[:10], 1):  # Show first 10
                summary.append(f"  {i}. {test}")
            if len(failed_tests) > 10:
                summary.append(f"  ... and {len(failed_tests) - 10} more")
        
        # Performance analysis
        summary.append("\n⚡ PERFORMANCE ANALYSIS:")
        summary.append("  Top 5 Slowest Tests:")
        for i, (test, time) in enumerate(slowest_tests[:5], 1):
            summary.append(f"    {i}. {test}: {time*1000:.1f}ms")
        
        # Test categories
        summary.append("\n🏷️  TEST CATEGORIES:")
        categories = {}
        for exec_name, suites in self.all_results.items():
            for suite in suites:
                category = suite.name.split('Test')[0] if 'Test' in suite.name else suite.name
                if category not in categories:
                    categories[category] = {'total': 0, 'passed': 0}
                categories[category]['total'] += len(suite.tests)
                categories[category]['passed'] += suite.passed
        
        for category, stats in sorted(categories.items()):
            pass_rate = 100 * stats['passed'] / stats['total'] if stats['total'] > 0 else 0
            summary.append(f"  {category}: {stats['total']} tests ({pass_rate:.0f}% pass rate)")
        
        # Success rate visualization
        summary.append("\n📈 SUCCESS RATE VISUALIZATION:")
        if total_tests > 0:
            pass_rate = int(20 * total_passed / total_tests)
            bar = '█' * pass_rate + '░' * (20 - pass_rate)
            summary.append(f"  [{bar}] {100*total_passed/total_tests:.1f}%")
        
        # Final status
        summary.append("\n" + "="*80)
        if total_failed == 0:
            summary.append("🎉 ALL TESTS PASSED! 🎉")
        else:
            summary.append(f"⚠️  {total_failed} TESTS FAILED - Please review the failures above")
        summary.append("="*80)
        
        return "\n".join(summary)
    
    def run_all_tests(self) -> int:
        """Run all tests and generate report"""
        self.start_time = time.time()
        
        print("\n" + "="*80)
        print("                    RUNNING GOPHER-ORCH TESTS")
        print("="*80)
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Build directory: {self.build_dir.absolute()}")
        print("-"*80)
        
        overall_success = True
        
        for test_name in self.test_executables:
            print(f"\n▶️  Running {test_name}...")
            print("-"*40)
            
            returncode, stdout, stderr = self.run_test_executable(test_name)
            
            # Show test output (abbreviated)
            if stdout:
                lines = stdout.split('\n')
                # Show first and last few lines
                if len(lines) > 20:
                    for line in lines[:5]:
                        print(line)
                    print("    ... (output truncated) ...")
                    for line in lines[-5:]:
                        print(line)
                else:
                    print(stdout)
            
            if stderr:
                print(f"STDERR: {stderr}")
            
            # Parse results
            xml_results = self.parse_xml_results(test_name)
            if xml_results:
                self.all_results[test_name] = xml_results
            
            if returncode != 0:
                overall_success = False
                print(f"❌ {test_name} failed with code {returncode}")
            else:
                print(f"✅ {test_name} completed successfully")
        
        self.end_time = time.time()
        
        # Generate and print summary
        summary = self.generate_summary()
        print(summary)
        
        # Save summary to file
        summary_file = self.results_dir / "test_summary.txt"
        summary_file.write_text(summary)
        print(f"\n📄 Summary saved to: {summary_file}")
        
        # Generate JSON report
        self.generate_json_report()
        
        return 0 if overall_success else 1
    
    def generate_json_report(self):
        """Generate JSON report for CI/CD integration"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'execution_time': self.end_time - self.start_time if self.start_time and self.end_time else 0,
            'summary': {
                'total_tests': 0,
                'passed': 0,
                'failed': 0,
                'pass_rate': 0.0
            },
            'executables': {}
        }
        
        for exec_name, suites in self.all_results.items():
            exec_data = {
                'suites': [],
                'total_tests': 0,
                'passed': 0,
                'failed': 0
            }
            
            for suite in suites:
                suite_data = {
                    'name': suite.name,
                    'tests': len(suite.tests),
                    'passed': suite.passed,
                    'failed': suite.failed,
                    'time': suite.time
                }
                exec_data['suites'].append(suite_data)
                exec_data['total_tests'] += len(suite.tests)
                exec_data['passed'] += suite.passed
                exec_data['failed'] += suite.failed
                
                report['summary']['total_tests'] += len(suite.tests)
                report['summary']['passed'] += suite.passed
                report['summary']['failed'] += suite.failed
            
            report['executables'][exec_name] = exec_data
        
        if report['summary']['total_tests'] > 0:
            report['summary']['pass_rate'] = 100 * report['summary']['passed'] / report['summary']['total_tests']
        
        json_file = self.results_dir / "test_report.json"
        json_file.write_text(json.dumps(report, indent=2))
        print(f"📊 JSON report saved to: {json_file}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Enhanced test runner for gopher-orch")
    parser.add_argument("--build-dir", default="build", help="Build directory path")
    parser.add_argument("--filter", help="Filter tests by pattern")
    args = parser.parse_args()
    
    runner = TestRunner(args.build_dir)
    sys.exit(runner.run_all_tests())