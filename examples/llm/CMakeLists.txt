# LLM Examples CMakeLists.txt

# Simple demo - compiles without full LLM integration
add_executable(simple_llm_demo simple_demo.cpp)
set_target_properties(simple_llm_demo PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
)

# Anthropic example - standalone demonstration with real API
add_executable(anthropic_example anthropic_example.cpp)

# Find CURL library
find_package(CURL REQUIRED)

target_link_libraries(anthropic_example PRIVATE ${CURL_LIBRARIES})
target_include_directories(anthropic_example PRIVATE ${CURL_INCLUDE_DIRS})

set_target_properties(anthropic_example PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
    CXX_STANDARD 14
)

# OpenAI example - standalone demonstration
add_executable(openai_example openai_example.cpp)
set_target_properties(openai_example PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
    CXX_STANDARD 14
)

# Ollama example - standalone demonstration for local LLMs
add_executable(ollama_example ollama_example.cpp)
set_target_properties(ollama_example PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
    CXX_STANDARD 14
)

# These examples require full LLM implementation - disabled for now
# # Basic chat example
# add_executable(basic_chat_example basic_chat_example.cpp)
# target_link_libraries(basic_chat_example PRIVATE gopher-orch)
# set_target_properties(basic_chat_example PROPERTIES
#     RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
# )

# # Tool calling example
# add_executable(tool_calling_example tool_calling_example.cpp)
# target_link_libraries(tool_calling_example PRIVATE gopher-orch)
# set_target_properties(tool_calling_example PROPERTIES
#     RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
# )

# # Streaming example
# add_executable(streaming_example streaming_example.cpp)
# target_link_libraries(streaming_example PRIVATE gopher-orch)
# set_target_properties(streaming_example PROPERTIES
#     RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
# )

# MCP integration example - disabled for now due to dependencies
# if(NOT BUILD_WITHOUT_GOPHER_MCP)
#     add_executable(mcp_integration_example mcp_integration_example.cpp)
#     target_link_libraries(mcp_integration_example PRIVATE gopher-orch)
#     set_target_properties(mcp_integration_example PROPERTIES
#         RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/examples/llm"
#     )
# endif()

# Install examples
install(TARGETS 
    simple_llm_demo
    anthropic_example
    openai_example
    ollama_example
    DESTINATION bin/examples/llm
    COMPONENT examples
)

# if(NOT BUILD_WITHOUT_GOPHER_MCP)
#     install(TARGETS mcp_integration_example
#         DESTINATION bin/examples/llm
#         COMPONENT examples
#     )
# endif()

# Copy example source files for reference
install(FILES
    simple_demo.cpp
    anthropic_example.cpp
    openai_example.cpp
    ollama_example.cpp
    basic_chat_example.cpp
    tool_calling_example.cpp
    streaming_example.cpp
    mcp_integration_example.cpp
    DESTINATION share/gopher-orch/examples/llm
    COMPONENT examples
)