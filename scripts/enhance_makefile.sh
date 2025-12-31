#!/bin/bash

# This script enhances the Makefile test target with better summary output
# It should be called after CMake configuration

MAKEFILE="$1"
if [ -z "$MAKEFILE" ]; then
    MAKEFILE="Makefile"
fi

# Create a backup
cp "$MAKEFILE" "${MAKEFILE}.bak"

# Use sed to replace the test target
cat > /tmp/test_target.txt << 'EOF'
# Special rule for the target test
test:
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --cyan "==================================================================================="
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --cyan "                          RUNNING GOPHER-ORCH TESTS"
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --cyan "==================================================================================="
	@/Applications/CMake.app/Contents/bin/ctest --force-new-ctest-process -V --output-on-failure $(ARGS) | tee /tmp/test_output.txt
	@echo ""
	@echo "==================================================================================="
	@echo "                              TEST SUMMARY REPORT"
	@echo "==================================================================================="
	@echo ""
	@echo "📊 TEST EXECUTABLES:"
	@grep "hello_test.*Passed" /tmp/test_output.txt > /dev/null 2>&1 && echo "  ├─ hello_test:           ✅ PASSED" || (grep "hello_test" /tmp/test_output.txt > /dev/null 2>&1 && echo "  ├─ hello_test:           ❌ FAILED" || echo "  ├─ hello_test:           ⏭️  SKIPPED")
	@grep "orch_framework_test.*Passed" /tmp/test_output.txt > /dev/null 2>&1 && echo "  ├─ orch_framework_test:  ✅ PASSED" || (grep "orch_framework_test" /tmp/test_output.txt > /dev/null 2>&1 && echo "  ├─ orch_framework_test:  ❌ FAILED" || echo "  ├─ orch_framework_test:  ⏭️  SKIPPED")
	@grep "ffi_test.*Passed" /tmp/test_output.txt > /dev/null 2>&1 && echo "  ├─ ffi_test:             ✅ PASSED" || (grep "ffi_test" /tmp/test_output.txt > /dev/null 2>&1 && echo "  ├─ ffi_test:             ❌ FAILED" || echo "  ├─ ffi_test:             ⏭️  SKIPPED")
	@grep "gopher-orch-tests.*Passed" /tmp/test_output.txt > /dev/null 2>&1 && echo "  └─ gopher-orch-tests:    ✅ PASSED" || (grep "gopher-orch-tests" /tmp/test_output.txt > /dev/null 2>&1 && echo "  └─ gopher-orch-tests:    ❌ FAILED" || echo "  └─ gopher-orch-tests:    ⏭️  SKIPPED")
	@echo ""
	@echo "📈 STATISTICS:"
	@printf "  Test Suites Run:         " && grep -E "^[0-9]+/[0-9]+ Test" /tmp/test_output.txt | tail -1 | cut -d'/' -f2 | cut -d' ' -f1 || echo "0"
	@printf "  Test Suites Passed:      " && grep -c "Passed" /tmp/test_output.txt || echo "0"
	@printf "  Test Suites Failed:      " && grep -c "Failed" /tmp/test_output.txt || echo "0"
	@printf "  Total Test Cases:        " && grep -E "Running [0-9]+ tests" /tmp/test_output.txt | awk '{sum+=$$2} END {if(NR>0) print sum; else print "0"}'
	@echo ""
	@printf "⏱️  EXECUTION TIME:        " && (grep "Total Test time" /tmp/test_output.txt | grep -oE "[0-9]+\.[0-9]+" | head -1 | xargs printf "%ss\n" || echo "N/A")
	@echo ""
	@echo "==================================================================================="
	@grep "tests failed" /tmp/test_output.txt > /dev/null 2>&1 && echo "                        ⚠️  SOME TESTS FAILED ⚠️" || echo "                        🎉 ALL TESTS PASSED! 🎉"
	@echo "==================================================================================="
	@rm -f /tmp/test_output.txt
.PHONY : test
EOF

# Replace the test target in the Makefile
awk '
/^# Special rule for the target test$/ {
    system("cat /tmp/test_target.txt")
    skip=1
}
/^\.PHONY : test$/ && skip {
    skip=0
    next
}
!skip
' "$MAKEFILE" > "${MAKEFILE}.tmp" && mv "${MAKEFILE}.tmp" "$MAKEFILE"

rm -f /tmp/test_target.txt
echo "Makefile test target enhanced successfully!"