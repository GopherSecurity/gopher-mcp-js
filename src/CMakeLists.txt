# gopher-orch source files

# Core library sources (orch-specific extensions)
set(ORCH_CORE_SOURCES
    orch/hello.cpp
)

# Client sources
set(ORCH_CLIENT_SOURCES
    gopher/orch/client/integration_platform.cpp
    gopher/orch/client/oauth_manager.cpp
    gopher/orch/client/connected_account.cpp
    gopher/orch/client/user_context.cpp
    gopher/orch/client/runnable_adapters.cpp
    # Provider implementations
    gopher/orch/client/provider/anthropic_provider.cpp
    gopher/orch/client/provider/openai_provider.cpp
    gopher/orch/client/provider/google_provider.cpp
    gopher/orch/client/provider/llama_provider.cpp
)

# MCP Server sources (requires gopher-mcp)
# Only include when gopher-mcp is available
set(ORCH_MCP_SOURCES "")
if(NOT BUILD_WITHOUT_GOPHER_MCP)
    set(ORCH_MCP_SOURCES
        gopher/orch/server/mcp_server.cpp
        gopher/orch/server/rest_server.cpp
    )
endif()

# Combine all sources
set(GOPHER_ORCH_SOURCES
    ${ORCH_CORE_SOURCES}
    ${ORCH_CLIENT_SOURCES}
    ${ORCH_MCP_SOURCES}
)

# Build static library
if(BUILD_STATIC_LIBS)
    add_library(gopher-orch-static STATIC ${GOPHER_ORCH_SOURCES})
    target_include_directories(gopher-orch-static PUBLIC
        $<BUILD_INTERFACE:${CMAKE_SOURCE_DIR}/include>
        $<BUILD_INTERFACE:${GOPHER_MCP_INCLUDE_DIR}>
        $<INSTALL_INTERFACE:include>
    )

    # Add include directories for gopher-mcp's dependencies (fmt, nlohmann_json, etc.)
    # These are needed when including gopher-mcp headers that use these libraries
    if(NOT BUILD_WITHOUT_GOPHER_MCP)
        # These paths are set by gopher-mcp's FetchContent
        if(TARGET fmt)
            get_target_property(FMT_INCLUDE_DIR fmt INTERFACE_INCLUDE_DIRECTORIES)
            if(FMT_INCLUDE_DIR)
                target_include_directories(gopher-orch-static PUBLIC ${FMT_INCLUDE_DIR})
            endif()
        endif()
        if(TARGET nlohmann_json)
            get_target_property(NLOHMANN_JSON_INCLUDE_DIR nlohmann_json INTERFACE_INCLUDE_DIRECTORIES)
            if(NLOHMANN_JSON_INCLUDE_DIR)
                target_include_directories(gopher-orch-static PUBLIC ${NLOHMANN_JSON_INCLUDE_DIR})
            endif()
        endif()
    endif()

    # Link dependencies
    if(NOT BUILD_WITHOUT_GOPHER_MCP)
        target_link_libraries(gopher-orch-static PUBLIC
            ${GOPHER_MCP_LIBRARIES}
            Threads::Threads
        )
        # Define GOPHER_ORCH_WITH_MCP to enable MCP-specific code
        target_compile_definitions(gopher-orch-static PUBLIC GOPHER_ORCH_WITH_MCP)
    else()
        target_link_libraries(gopher-orch-static PUBLIC
            Threads::Threads
        )
        # Define BUILD_WITHOUT_GOPHER_MCP for standalone builds
        target_compile_definitions(gopher-orch-static PUBLIC BUILD_WITHOUT_GOPHER_MCP)
    endif()

    set_target_properties(gopher-orch-static PROPERTIES
        OUTPUT_NAME gopher-orch
        POSITION_INDEPENDENT_CODE ON
    )

    # Set the main library alias
    add_library(gopher-orch ALIAS gopher-orch-static)

    # Installation
    install(TARGETS gopher-orch-static
        EXPORT gopher-orch-targets
        LIBRARY DESTINATION lib
        ARCHIVE DESTINATION lib
        RUNTIME DESTINATION bin
        COMPONENT libraries
    )
endif()

# Build shared library
if(BUILD_SHARED_LIBS)
    add_library(gopher-orch-shared SHARED ${GOPHER_ORCH_SOURCES})
    target_include_directories(gopher-orch-shared PUBLIC
        $<BUILD_INTERFACE:${CMAKE_SOURCE_DIR}/include>
        $<BUILD_INTERFACE:${GOPHER_MCP_INCLUDE_DIR}>
        $<INSTALL_INTERFACE:include>
    )

    # Add include directories for gopher-mcp's dependencies (fmt, nlohmann_json, etc.)
    if(NOT BUILD_WITHOUT_GOPHER_MCP)
        if(TARGET fmt)
            get_target_property(FMT_INCLUDE_DIR fmt INTERFACE_INCLUDE_DIRECTORIES)
            if(FMT_INCLUDE_DIR)
                target_include_directories(gopher-orch-shared PUBLIC ${FMT_INCLUDE_DIR})
            endif()
        endif()
        if(TARGET nlohmann_json)
            get_target_property(NLOHMANN_JSON_INCLUDE_DIR nlohmann_json INTERFACE_INCLUDE_DIRECTORIES)
            if(NLOHMANN_JSON_INCLUDE_DIR)
                target_include_directories(gopher-orch-shared PUBLIC ${NLOHMANN_JSON_INCLUDE_DIR})
            endif()
        endif()
    endif()

    # Link dependencies
    if(NOT BUILD_WITHOUT_GOPHER_MCP)
        target_link_libraries(gopher-orch-shared PUBLIC
            ${GOPHER_MCP_LIBRARIES}
            Threads::Threads
        )
        # Define GOPHER_ORCH_WITH_MCP to enable MCP-specific code
        target_compile_definitions(gopher-orch-shared PUBLIC GOPHER_ORCH_WITH_MCP)
    else()
        target_link_libraries(gopher-orch-shared PUBLIC
            Threads::Threads
        )
        # Define BUILD_WITHOUT_GOPHER_MCP for standalone builds
        target_compile_definitions(gopher-orch-shared PUBLIC BUILD_WITHOUT_GOPHER_MCP)
    endif()

    set_target_properties(gopher-orch-shared PROPERTIES
        OUTPUT_NAME gopher-orch
        VERSION ${PROJECT_VERSION}
        SOVERSION ${PROJECT_VERSION_MAJOR}
    )

    # If only building shared, set it as the main library
    if(NOT BUILD_STATIC_LIBS)
        add_library(gopher-orch ALIAS gopher-orch-shared)
    endif()

    # Installation
    install(TARGETS gopher-orch-shared
        EXPORT gopher-orch-targets
        LIBRARY DESTINATION lib
        ARCHIVE DESTINATION lib
        RUNTIME DESTINATION bin
        COMPONENT libraries
    )
endif()

# Export targets only when not using submodule
# (When using submodule, gopher-mcp targets aren't installable)
if(NOT USE_SUBMODULE_GOPHER_MCP)
    install(EXPORT gopher-orch-targets
        FILE gopher-orch-targets.cmake
        NAMESPACE gopher-orch::
        DESTINATION lib/cmake/gopher-orch
        COMPONENT development
    )
endif()
