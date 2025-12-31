#!/bin/bash

# Run all test executables with detailed Google Test output

echo "==============================================="
echo "Running gopher-orch tests with detailed output"
echo "==============================================="
echo

TEST_DIR="build/bin"
TESTS=("hello_test" "orch_framework_test" "ffi_test" "gopher-orch-tests")

TOTAL_PASSED=0
TOTAL_FAILED=0

for test in "${TESTS[@]}"; do
    echo "-----------------------------------------------"
    echo "Running: $test"
    echo "-----------------------------------------------"
    
    if [ -f "$TEST_DIR/$test" ]; then
        "$TEST_DIR/$test"
        if [ $? -eq 0 ]; then
            ((TOTAL_PASSED++))
        else
            ((TOTAL_FAILED++))
        fi
    else
        echo "Warning: $test not found in $TEST_DIR"
        ((TOTAL_FAILED++))
    fi
    echo
done

echo "==============================================="
echo "Test Summary:"
echo "  Passed: $TOTAL_PASSED"
echo "  Failed: $TOTAL_FAILED"
echo "==============================================="

if [ $TOTAL_FAILED -gt 0 ]; then
    exit 1
fi