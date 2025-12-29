cmake_minimum_required(VERSION 3.10)
project(gopher-orch VERSION 0.1.0 LANGUAGES C CXX)

# Prevent in-source builds
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_BINARY_DIR)
    message(FATAL_ERROR "In-source builds are not allowed. Please create a build directory and run cmake from there.")
endif()

# Set C++ standard
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
message(STATUS "Using C++14")

# Default to Debug build
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "Build type" FORCE)
endif()

# Build options
option(BUILD_SHARED_LIBS "Build shared libraries" ON)
option(BUILD_STATIC_LIBS "Build static libraries" ON)
option(BUILD_TESTS "Build tests" ON)
option(BUILD_EXAMPLES "Build examples" ON)
option(ORCH_STRICT_WARNINGS "Enable strict compiler warnings" OFF)
option(USE_SUBMODULE_GOPHER_MCP "Use gopher-mcp as submodule (vs find_package)" ON)
option(BUILD_WITHOUT_GOPHER_MCP "Build without gopher-mcp dependency (for testing)" OFF)

# Convenience option for standalone build
option(STANDALONE "Quick standalone build without external dependencies (sets BUILD_WITHOUT_GOPHER_MCP=ON, USE_SUBMODULE_GOPHER_MCP=OFF)" OFF)
if(STANDALONE)
    set(BUILD_WITHOUT_GOPHER_MCP ON CACHE BOOL "Build without gopher-mcp" FORCE)
    set(USE_SUBMODULE_GOPHER_MCP OFF CACHE BOOL "Don't use submodule" FORCE)
    message(STATUS "STANDALONE mode: Building without external dependencies")
endif()

# Set output directories
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# Compiler flags
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(-g -O0)
    add_compile_definitions(_DEBUG)
elseif(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_compile_options(-O3)
    add_compile_definitions(NDEBUG)
endif()

# Platform-specific settings
if(APPLE)
    set(CMAKE_MACOSX_RPATH ON)
    set(CMAKE_INSTALL_RPATH "@loader_path/../lib")
elseif(UNIX)
    set(CMAKE_INSTALL_RPATH "$ORIGIN/../lib")
endif()

# Warning flags
if(ORCH_STRICT_WARNINGS)
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        add_compile_options(
            -Wall -Wextra -Wpedantic
            -Wno-unused-parameter
            -Wno-unused-variable
            -Wno-unused-function
            -Werror
        )
    elseif(MSVC)
        add_compile_options(/W4 /WX)
    endif()
else()
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        add_compile_options(
            -Wall
            -Wno-unused-parameter
            -Wno-unused-variable
            -Wno-unused-function
        )
    endif()
endif()

# Handle gopher-mcp dependency
if(BUILD_WITHOUT_GOPHER_MCP)
    # Build without gopher-mcp for testing
    message(STATUS "Building without gopher-mcp dependency")
    set(GOPHER_MCP_LIBRARIES "")
    set(GOPHER_MCP_INCLUDE_DIR "")
elseif(USE_SUBMODULE_GOPHER_MCP)
    # Use gopher-mcp as submodule
    if(NOT EXISTS "${CMAKE_SOURCE_DIR}/third_party/gopher-mcp/.git")
        message(STATUS "gopher-mcp submodule not found. Initializing...")
        execute_process(
            COMMAND git submodule add https://github.com/GopherSecurity/gopher-mcp.git third_party/gopher-mcp
            WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
            RESULT_VARIABLE GIT_SUBMOD_RESULT
        )
        if(NOT GIT_SUBMOD_RESULT EQUAL "0")
            # Submodule might already exist, try update
            execute_process(
                COMMAND git submodule update --init --recursive third_party/gopher-mcp
                WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
                RESULT_VARIABLE GIT_SUBMOD_UPDATE_RESULT
            )
            if(NOT GIT_SUBMOD_UPDATE_RESULT EQUAL "0")
                message(FATAL_ERROR "Failed to initialize gopher-mcp submodule")
            endif()
        endif()
    else()
        message(STATUS "Updating gopher-mcp submodule...")
        execute_process(
            COMMAND git submodule update --init --recursive third_party/gopher-mcp
            WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        )
    endif()

    # Set include directories for gopher-mcp BEFORE adding subdirectory
    set(GOPHER_MCP_INCLUDE_DIR ${CMAKE_SOURCE_DIR}/third_party/gopher-mcp/include)

    # Temporarily add gopher-mcp include directories before processing subdirectory
    # This ensures gopher-mcp can find its own headers when building as submodule
    include_directories(${GOPHER_MCP_INCLUDE_DIR})

    # Disable gopher-mcp tests and examples to speed up build
    set(BUILD_TESTS_SAVED ${BUILD_TESTS})
    set(BUILD_EXAMPLES_SAVED ${BUILD_EXAMPLES})
    set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(BUILD_BINDINGS_EXAMPLES OFF CACHE BOOL "" FORCE)

    # Disable fmt installation if gopher-mcp uses it
    set(FMT_INSTALL OFF CACHE BOOL "Disable fmt installation" FORCE)

    # Add gopher-mcp subdirectory
    add_subdirectory(third_party/gopher-mcp EXCLUDE_FROM_ALL)

    # Restore our settings
    set(BUILD_TESTS ${BUILD_TESTS_SAVED} CACHE BOOL "" FORCE)
    set(BUILD_EXAMPLES ${BUILD_EXAMPLES_SAVED} CACHE BOOL "" FORCE)

    # Make gopher-mcp libraries available
    # Use static libraries for tests to avoid duplicate initialization
    if(BUILD_TESTS AND TARGET gopher-mcp-static)
        set(GOPHER_MCP_LIBRARIES gopher-mcp-static gopher-mcp-event-static)
    else()
        set(GOPHER_MCP_LIBRARIES gopher-mcp gopher-mcp-event)
    endif()

    message(STATUS "Using gopher-mcp from submodule")
else()
    # Use system-installed gopher-mcp
    find_package(gopher-mcp REQUIRED)
    message(STATUS "Using system gopher-mcp: ${gopher-mcp_DIR}")
endif()

# Include directories
message(STATUS "GOPHER_MCP_INCLUDE_DIR: ${GOPHER_MCP_INCLUDE_DIR}")
include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${GOPHER_MCP_INCLUDE_DIR}
)

# Export compile commands for tools like clangd
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find required packages
find_package(Threads REQUIRED)

# Testing setup
if(BUILD_TESTS)
    enable_testing()
    include(CTest)

    # Fetch Google Test
    message(STATUS "Downloading GoogleTest (this may take a moment on first run)...")
    include(FetchContent)

    # Prevent Google Test from being installed
    set(INSTALL_GTEST OFF CACHE BOOL "Disable installation of googletest" FORCE)
    set(INSTALL_GMOCK OFF CACHE BOOL "Disable installation of googlemock" FORCE)
    set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

    # Use shallow clone and configure for faster download
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0
        GIT_SHALLOW TRUE
        GIT_PROGRESS TRUE
        CMAKE_ARGS -DINSTALL_GTEST=OFF -DINSTALL_GMOCK=OFF
    )

    FetchContent_MakeAvailable(googletest)
    message(STATUS "GoogleTest download complete")

    # Include Google Test and Google Mock
    include(GoogleTest)
endif()

# Add subdirectories
add_subdirectory(src)

if(BUILD_TESTS)
    add_subdirectory(tests)
endif()

if(BUILD_EXAMPLES)
    add_subdirectory(examples)
endif()

# Installation rules
install(DIRECTORY include/orch
    DESTINATION include
    COMPONENT development
    FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp"
)

# Package configuration
include(CMakePackageConfigHelpers)

configure_package_config_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/cmake/gopher-orch-config.cmake.in"
    "${CMAKE_CURRENT_BINARY_DIR}/gopher-orch-config.cmake"
    INSTALL_DESTINATION lib/cmake/gopher-orch
)

write_basic_package_version_file(
    "${CMAKE_CURRENT_BINARY_DIR}/gopher-orch-config-version.cmake"
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMajorVersion
)

install(FILES
    "${CMAKE_CURRENT_BINARY_DIR}/gopher-orch-config.cmake"
    "${CMAKE_CURRENT_BINARY_DIR}/gopher-orch-config-version.cmake"
    DESTINATION lib/cmake/gopher-orch
    COMPONENT development
)

# Add uninstall target
if(NOT TARGET uninstall)
    configure_file(
        "${CMAKE_CURRENT_SOURCE_DIR}/cmake/cmake_uninstall.cmake.in"
        "${CMAKE_CURRENT_BINARY_DIR}/cmake_uninstall.cmake"
        IMMEDIATE @ONLY
    )

    add_custom_target(uninstall
        COMMAND ${CMAKE_COMMAND} -P ${CMAKE_CURRENT_BINARY_DIR}/cmake_uninstall.cmake
    )
endif()

# Print configuration summary
message(STATUS "")
message(STATUS "=== gopher-orch Configuration Summary ===")
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "Build shared libs: ${BUILD_SHARED_LIBS}")
message(STATUS "Build static libs: ${BUILD_STATIC_LIBS}")
message(STATUS "Build tests: ${BUILD_TESTS}")
message(STATUS "Build examples: ${BUILD_EXAMPLES}")
message(STATUS "Strict warnings: ${ORCH_STRICT_WARNINGS}")
message(STATUS "Use submodule gopher-mcp: ${USE_SUBMODULE_GOPHER_MCP}")
message(STATUS "Install prefix: ${CMAKE_INSTALL_PREFIX}")
message(STATUS "==========================================")
message(STATUS "")
