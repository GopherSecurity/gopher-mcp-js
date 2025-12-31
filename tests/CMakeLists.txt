# gopher-orch tests

# Test utilities and helpers
set(TEST_UTIL_SOURCES
    # test_utils.cpp
)

# Orch-specific core tests
set(ORCH_CORE_TEST_SOURCES
    orch/hello_test.cpp
)

# New gopher/orch framework tests - split by component
set(ORCH_FRAMEWORK_TEST_SOURCES
    gopher/orch/lambda_test.cc
    gopher/orch/sequence_test.cc
    gopher/orch/parallel_test.cc
    gopher/orch/router_test.cc
    gopher/orch/retry_test.cc
    gopher/orch/timeout_test.cc
    gopher/orch/fallback_test.cc
    gopher/orch/circuit_breaker_test.cc
    gopher/orch/state_graph_test.cc
    gopher/orch/state_machine_test.cc
    gopher/orch/callback_manager_test.cc
    gopher/orch/human_approval_test.cc
    gopher/orch/mock_server_test.cc
    gopher/orch/server_composite_test.cc
    gopher/orch/mcp_server_test.cc
    gopher/orch/rest_server_test.cc
    gopher/orch/integration_test.cc
    gopher/orch/tool_info_test.cc
    gopher/orch/api_engine_test.cc
)

# FFI tests - organized by component
set(FFI_TEST_SOURCES
    gopher/orch/FFI/ffi_types_test.cc
    gopher/orch/FFI/ffi_error_test.cc
    gopher/orch/FFI/ffi_handle_test.cc
    gopher/orch/FFI/ffi_json_test.cc
    gopher/orch/FFI/ffi_core_test.cc
    gopher/orch/FFI/ffi_builder_test.cc
    gopher/orch/FFI/ffi_raii_test.cc
    gopher/orch/FFI/ffi_lambda_test.cc
)

# Helper function to create orch test executables
function(add_orch_test test_name test_sources)
    add_executable(${test_name} ${test_sources} ${TEST_UTIL_SOURCES})
    # Use static library for tests to avoid duplicate symbol issues
    if(TARGET gopher-orch-static)
        set(GOPHER_ORCH_TEST_LIB gopher-orch-static)
    else()
        set(GOPHER_ORCH_TEST_LIB gopher-orch)
    endif()
    target_link_libraries(${test_name}
        ${GOPHER_ORCH_TEST_LIB}
        ${GOPHER_MCP_LIBRARIES}
        gtest
        gtest_main
        gmock
        Threads::Threads
    )
    target_include_directories(${test_name} PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/src
        ${CMAKE_SOURCE_DIR}/tests
        ${CMAKE_SOURCE_DIR}/tests/gopher/orch
        ${CMAKE_SOURCE_DIR}/tests/gopher/orch/FFI
        ${GOPHER_MCP_INCLUDE_DIR}
    )

    # Add test to CTest with detailed output
    add_test(NAME ${test_name} COMMAND ${test_name}
        WORKING_DIRECTORY ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}
    )
    # Set properties to always show output
    set_tests_properties(${test_name} PROPERTIES
        ENVIRONMENT "GTEST_OUTPUT=xml:${CMAKE_BINARY_DIR}/test_results/${test_name}.xml"
        TIMEOUT 30
    )
endfunction()

# Create individual orch test executables
add_orch_test(hello_test "${ORCH_CORE_TEST_SOURCES}" "orch")

# Create orch framework test executable
add_orch_test(orch_framework_test "${ORCH_FRAMEWORK_TEST_SOURCES}" "orch-framework")

# Create FFI test executable
add_orch_test(ffi_test "${FFI_TEST_SOURCES}" "ffi")

# Create a combined orch test executable for convenience
add_executable(gopher-orch-tests
    ${ORCH_CORE_TEST_SOURCES}
    ${ORCH_FRAMEWORK_TEST_SOURCES}
    gopher/orch/tool_info_test.cc
    ${FFI_TEST_SOURCES}
    ${TEST_UTIL_SOURCES}
)

# Use static library for tests to avoid duplicate symbol issues
if(TARGET gopher-orch-static)
    set(GOPHER_ORCH_TEST_LIB gopher-orch-static)
else()
    set(GOPHER_ORCH_TEST_LIB gopher-orch)
endif()

target_link_libraries(gopher-orch-tests
    ${GOPHER_ORCH_TEST_LIB}
    ${GOPHER_MCP_LIBRARIES}
    gtest
    gtest_main
    gmock
    Threads::Threads
)

target_include_directories(gopher-orch-tests PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/tests
    ${CMAKE_SOURCE_DIR}/tests/gopher/orch
    ${CMAKE_SOURCE_DIR}/tests/gopher/orch/FFI
    ${GOPHER_MCP_INCLUDE_DIR}
)

# Add the combined test executable to CTest with detailed output
add_test(NAME gopher-orch-tests COMMAND gopher-orch-tests
    WORKING_DIRECTORY ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}
)
# Set properties to always show output
set_tests_properties(gopher-orch-tests PROPERTIES
    ENVIRONMENT "GTEST_OUTPUT=xml:${CMAKE_BINARY_DIR}/test_results/gopher-orch-tests.xml"
    TIMEOUT 30
)

# Custom test targets
add_custom_target(test-verbose
    COMMAND ${CMAKE_CTEST_COMMAND} -V
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)

# Enhanced test with summary
add_custom_target(test-summary
    COMMAND ${CMAKE_SOURCE_DIR}/scripts/test_summary.sh
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)

# Override the default test target to be verbose
add_custom_target(test-detailed
    COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure --verbose
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)

add_custom_target(test-parallel
    COMMAND ${CMAKE_CTEST_COMMAND} -j${CMAKE_BUILD_PARALLEL_LEVEL}
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
