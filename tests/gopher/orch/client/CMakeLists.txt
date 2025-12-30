cmake_minimum_required(VERSION 3.10)

# Enable testing
enable_testing()

# Find Google Test
find_package(GTest REQUIRED)

# Get the root directory (4 levels up from current directory)
get_filename_component(GOPHER_ORCH_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../.." ABSOLUTE)

# Include directories
include_directories(
    ${GTEST_INCLUDE_DIRS}
    ${GOPHER_ORCH_ROOT}/include
)

# Define test sources
set(CLIENT_TEST_SOURCES
    tool_test.cpp
    provider_test.cpp
    oauth_manager_test.cpp
    user_context_test.cpp
    integration_platform_test.cpp
)

# Define implementation sources
set(CLIENT_IMPL_SOURCES
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/integration_platform.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/oauth_manager.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/connected_account.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/user_context.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/runnable_adapters.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/anthropic_provider.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/openai_provider.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/google_provider.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/llama_provider.cpp
)

# Create test executable
add_executable(client_tests 
    ${CLIENT_TEST_SOURCES}
    ${CLIENT_IMPL_SOURCES}
)

# Set C++ standard
set_target_properties(client_tests PROPERTIES
    CXX_STANDARD 14
    CXX_STANDARD_REQUIRED ON
)

# Link libraries
target_link_libraries(client_tests
    ${GTEST_LIBRARIES}
    ${GTEST_MAIN_LIBRARIES}
    pthread
)

# Add compile definitions for standalone mode
if(BUILD_WITHOUT_GOPHER_MCP OR STANDALONE)
    target_compile_definitions(client_tests PRIVATE BUILD_WITHOUT_GOPHER_MCP)
endif()

# Add tests to CTest
add_test(NAME ClientModuleTests COMMAND client_tests)

# Individual test registration for granular execution
add_test(NAME ClientToolTest COMMAND client_tests --gtest_filter=ToolTest.*)
add_test(NAME ClientProviderTest COMMAND client_tests --gtest_filter=ProviderTest.*)
add_test(NAME ClientOAuthManagerTest COMMAND client_tests --gtest_filter=OAuthManagerTest.*)
add_test(NAME ClientUserContextTest COMMAND client_tests --gtest_filter=UserContextTest.*:ConnectedAccountTest.*)
add_test(NAME ClientIntegrationPlatformTest COMMAND client_tests --gtest_filter=IntegrationPlatformTest.*)

# Set test properties
set_tests_properties(ClientModuleTests PROPERTIES 
    TIMEOUT 60
    LABELS "client;unit"
)

# Custom target for running only client tests
add_custom_target(run_client_tests
    COMMAND ${CMAKE_CTEST_COMMAND} -R "Client.*" --verbose
    DEPENDS client_tests
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
    COMMENT "Running client module unit tests"
)