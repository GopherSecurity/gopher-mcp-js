add_executable(hello_world_example main.cpp)

target_link_libraries(hello_world_example
    gopher-orch
    ${GOPHER_MCP_LIBRARIES}
    Threads::Threads
)

target_include_directories(hello_world_example PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${GOPHER_MCP_INCLUDE_DIR}
)

# Examples are not installed by default
# To install, use: cmake --install . --component examples
