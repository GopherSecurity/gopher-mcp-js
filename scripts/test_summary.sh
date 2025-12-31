#!/bin/bash

# Run tests with CTest and provide enhanced summary
echo "=================================================================================="
echo "                          RUNNING GOPHER-ORCH TESTS"
echo "=================================================================================="

# Run tests with verbose output, capture output
TEST_OUTPUT=$(ctest -V --output-on-failure 2>&1)
TEST_RESULT=$?

# Count test statistics from output
TOTAL_TESTS=$(echo "$TEST_OUTPUT" | grep -E "^\s*[0-9]+/[0-9]+ Test" | tail -1 | cut -d'/' -f2 | cut -d' ' -f1)
PASSED_TESTS=$(echo "$TEST_OUTPUT" | grep -c "Passed")
FAILED_TESTS=$(echo "$TEST_OUTPUT" | grep -c "Failed")

# Extract individual test details
HELLO_TESTS=$(echo "$TEST_OUTPUT" | grep -A1 "hello_test" | grep -oE "[0-9]+ tests" | head -1 | cut -d' ' -f1)
ORCH_TESTS=$(echo "$TEST_OUTPUT" | grep -A1 "orch_framework_test" | grep -oE "[0-9]+ tests" | head -1 | cut -d' ' -f1)
FFI_TESTS=$(echo "$TEST_OUTPUT" | grep -A1 "ffi_test" | grep -oE "[0-9]+ tests" | head -1 | cut -d' ' -f1)
COMBINED_TESTS=$(echo "$TEST_OUTPUT" | grep -A1 "gopher-orch-tests" | grep -oE "[0-9]+ tests" | head -1 | cut -d' ' -f1)

# Calculate total individual tests from Google Test output
TOTAL_INDIVIDUAL=$(echo "$TEST_OUTPUT" | grep -oE "Running [0-9]+ tests" | awk '{sum+=$2} END {print sum}')

# Show the actual test output
echo "$TEST_OUTPUT"

# Display enhanced summary
echo
echo "=================================================================================="
echo "                              TEST SUMMARY REPORT"
echo "=================================================================================="
echo
echo "📊 TEST EXECUTABLES:"
echo "  ├─ hello_test:           $(echo "$TEST_OUTPUT" | grep "hello_test.*Passed" > /dev/null && echo "✅ PASSED" || echo "❌ FAILED")"
echo "  ├─ orch_framework_test:  $(echo "$TEST_OUTPUT" | grep "orch_framework_test.*Passed" > /dev/null && echo "✅ PASSED" || echo "❌ FAILED")"
echo "  ├─ ffi_test:             $(echo "$TEST_OUTPUT" | grep "ffi_test.*Passed" > /dev/null && echo "✅ PASSED" || echo "❌ FAILED")"
echo "  └─ gopher-orch-tests:    $(echo "$TEST_OUTPUT" | grep "gopher-orch-tests.*Passed" > /dev/null && echo "✅ PASSED" || echo "❌ FAILED")"
echo
echo "📈 STATISTICS:"
echo "  Test Suites Run:         ${TOTAL_TESTS:-4}"
echo "  Test Suites Passed:      ${PASSED_TESTS}"
echo "  Test Suites Failed:      ${FAILED_TESTS}"
echo "  Individual Test Cases:   ${TOTAL_INDIVIDUAL:-"N/A"}"
echo

# Extract timing information
TOTAL_TIME=$(echo "$TEST_OUTPUT" | grep "Total Test time" | grep -oE "[0-9]+\.[0-9]+" | head -1)
if [ -n "$TOTAL_TIME" ]; then
    echo "⏱️  EXECUTION TIME: ${TOTAL_TIME}s"
    echo
fi

# Final result
echo "=================================================================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo "                        🎉 ALL TESTS PASSED! 🎉"
else
    echo "                        ⚠️  SOME TESTS FAILED ⚠️"
fi
echo "=================================================================================="

exit $TEST_RESULT