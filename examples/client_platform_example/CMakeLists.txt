cmake_minimum_required(VERSION 3.10)
project(client_platform_example)

# Find parent project include directories
set(GOPHER_ORCH_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../..)

# Add include directories
include_directories(
    ${GOPHER_ORCH_ROOT}/include
)

# Source files
set(SOURCES
    main.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/integration_platform.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/oauth_manager.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/connected_account.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/user_context.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/runnable_adapters.cpp
    # Provider implementations
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/anthropic_provider.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/openai_provider.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/google_provider.cpp
    ${GOPHER_ORCH_ROOT}/src/gopher/orch/client/provider/llama_provider.cpp
)

# Create executable
add_executable(client_demo ${SOURCES})

# Set C++ standard
set_target_properties(client_demo PROPERTIES
    CXX_STANDARD 14
    CXX_STANDARD_REQUIRED ON
)

# Link against pthread for threading support
find_package(Threads REQUIRED)
target_link_libraries(client_demo ${CMAKE_THREAD_LIBS_INIT})

# Add compile definitions for standalone mode if needed
if(BUILD_WITHOUT_GOPHER_MCP OR STANDALONE)
    target_compile_definitions(client_demo PRIVATE BUILD_WITHOUT_GOPHER_MCP)
endif()

# Install target
install(TARGETS client_demo DESTINATION bin)