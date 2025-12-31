# Custom test target with enhanced summary output

# Override the default test target
if(BUILD_TESTS)
    # Create a custom test command that shows detailed summary
    add_custom_target(test_with_summary
        COMMAND ${CMAKE_COMMAND} -E echo "==================================================================================="
        COMMAND ${CMAKE_COMMAND} -E echo "                          RUNNING GOPHER-ORCH TESTS"
        COMMAND ${CMAKE_COMMAND} -E echo "==================================================================================="
        COMMAND ${CMAKE_CTEST_COMMAND} --force-new-ctest-process -V --output-on-failure > ${CMAKE_BINARY_DIR}/test_output.txt 2>&1 || true
        COMMAND ${CMAKE_COMMAND} -E echo ""
        COMMAND ${CMAKE_COMMAND} -E echo "==================================================================================="
        COMMAND ${CMAKE_COMMAND} -E echo "                              TEST SUMMARY REPORT"  
        COMMAND ${CMAKE_COMMAND} -E echo "==================================================================================="
        COMMAND ${CMAKE_COMMAND} -E echo ""
        COMMAND ${CMAKE_COMMAND} -E echo "Test Results Summary:"
        COMMAND sh -c "cat ${CMAKE_BINARY_DIR}/test_output.txt"
        COMMAND sh -c "echo ''; echo 'Test Suites:'; grep -c 'Test #' ${CMAKE_BINARY_DIR}/test_output.txt | xargs echo '  Total: '"
        COMMAND sh -c "grep -c 'Passed' ${CMAKE_BINARY_DIR}/test_output.txt | xargs echo '  Passed: '"  
        COMMAND sh -c "grep -c 'Failed' ${CMAKE_BINARY_DIR}/test_output.txt | xargs echo '  Failed: '"
        COMMAND ${CMAKE_COMMAND} -E remove ${CMAKE_BINARY_DIR}/test_output.txt
        WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
        COMMENT "Running tests with enhanced summary"
        VERBATIM
    )
endif()