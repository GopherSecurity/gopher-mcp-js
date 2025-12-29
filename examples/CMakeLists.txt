# gopher-orch examples

# Hello World example (basic orch functionality)
add_subdirectory(hello_world)

# MCP Client example (demonstrates gopher-mcp integration)
# Only build if we have gopher-mcp dependency
if(NOT BUILD_WITHOUT_GOPHER_MCP)
    add_subdirectory(mcp_client)
endif()
