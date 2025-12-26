# gopher-orch source files

# Core library sources (orch-specific extensions)
set(ORCH_CORE_SOURCES
    orch/hello.cpp
)

# Combine all sources
set(GOPHER_ORCH_SOURCES
    ${ORCH_CORE_SOURCES}
)

# Build static library
if(BUILD_STATIC_LIBS)
    add_library(gopher-orch-static STATIC ${GOPHER_ORCH_SOURCES})
    target_include_directories(gopher-orch-static PUBLIC
        $<BUILD_INTERFACE:${CMAKE_SOURCE_DIR}/include>
        $<BUILD_INTERFACE:${GOPHER_MCP_INCLUDE_DIR}>
        $<INSTALL_INTERFACE:include>
    )

    # Link dependencies
    if(NOT BUILD_WITHOUT_GOPHER_MCP)
        target_link_libraries(gopher-orch-static PUBLIC
            ${GOPHER_MCP_LIBRARIES}
            Threads::Threads
        )
    else()
        target_link_libraries(gopher-orch-static PUBLIC
            Threads::Threads
        )
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

    # Link dependencies
    if(NOT BUILD_WITHOUT_GOPHER_MCP)
        target_link_libraries(gopher-orch-shared PUBLIC
            ${GOPHER_MCP_LIBRARIES}
            Threads::Threads
        )
    else()
        target_link_libraries(gopher-orch-shared PUBLIC
            Threads::Threads
        )
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
