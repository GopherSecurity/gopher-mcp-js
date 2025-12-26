# MCP Client Example
# Demonstrates gopher-mcp integration with gopher-orch
cmake_minimum_required(VERSION 3.10)

# Define the executable
add_executable(mcp_client_example
  mcp_client_example.cc
)

# Set target properties
set_target_properties(mcp_client_example PROPERTIES
  CXX_STANDARD 14
  CXX_STANDARD_REQUIRED ON
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Link against gopher-orch and gopher-mcp libraries
target_link_libraries(mcp_client_example PRIVATE
  gopher-orch-static
  gopher-mcp
  gopher-mcp-event
  ${CMAKE_THREAD_LIBS_INIT}
)

# Include directories
target_include_directories(mcp_client_example PRIVATE
  ${CMAKE_SOURCE_DIR}/include
  ${GOPHER_MCP_INCLUDE_DIR}
)

# Examples are not installed by default
# To install, use: cmake --install . --component examples
