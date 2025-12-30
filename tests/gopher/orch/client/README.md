# Client Module Unit Tests

## Overview

This directory (`/tests/gopher/orch/client`) contains comprehensive unit tests for the gopher-orch client module, which implements an integration platform for AI providers and external tools.

## Test Coverage

### 1. Tool Tests (`tool_test.cpp`)
- Basic tool functionality (name, description)
- Tool execution with valid parameters
- Tool execution with connection IDs
- Error handling for missing required parameters
- Schema generation and validation

### 2. Provider Tests (`provider_test.cpp`)
- **AnthropicProvider**: Tool transformation to Claude format, tool call handling
- **OpenAIProvider**: Tool transformation to GPT format, function call handling
- **GoogleProvider**: Tool transformation to Gemini format
- **LlamaProvider**: Tool transformation to Llama format
- Provider factory pattern testing
- Provider version and feature testing (streaming support, max tools)

### 3. OAuth Manager Tests (`oauth_manager_test.cpp`)
- OAuth URL generation with proper encoding
- Authorization code exchange
- Token refresh flow
- State validation for security
- Multiple connector registration
- Token expiration handling

### 4. User Context Tests (`user_context_test.cpp`)
- User ID management
- Connected account management
- Account retrieval by connector ID
- Account replacement for same connector
- User isolation verification
- **ConnectedAccount Tests**:
  - Token validity checks
  - Access token retrieval
  - Automatic token refresh on expiry

### 5. Integration Platform Tests (`integration_platform_test.cpp`)
- Tool registration and retrieval
- Tool execution with and without connections
- OAuth flow integration
- AI request processing with tool calls
- Multi-user isolation
- Provider registration and management
- Token refresh handling
- Tool override functionality

## Building and Running Tests

### Prerequisites
- C++14 compatible compiler
- GoogleTest framework
- CMake 3.10+

### Build Instructions

1. **Standalone build** (without main gopher-orch dependencies):
```bash
mkdir build
cd build
cmake .. -DSTANDALONE=ON -DBUILD_TESTING=ON
make
```

2. **Integration with main project**:
The tests are already integrated in `/tests/CMakeLists.txt` as part of the main test suite.

3. **Run tests**:
```bash
# Build the project with tests
cd /Users/james/Desktop/dev/gopher-orch
mkdir -p build && cd build
cmake .. -DSTANDALONE=ON -DBUILD_TESTING=ON
make

# Run all client tests
./tests/client_test

# Run specific test suite
./tests/client_test --gtest_filter=ToolTest.*
./tests/client_test --gtest_filter=ProviderTest.*
./tests/client_test --gtest_filter=OAuthManagerTest.*
./tests/client_test --gtest_filter=UserContextTest.*
./tests/client_test --gtest_filter=IntegrationPlatformTest.*
```

### Using the Test Runner Script
```bash
cd /Users/james/Desktop/dev/gopher-orch
./run_client_tests.sh
```

## Test Structure

All tests follow GoogleTest conventions:
- Test fixtures for shared setup
- `TEST_F` for fixture-based tests
- `EXPECT_*` and `ASSERT_*` macros for assertions
- Mock implementations for testing interfaces

## Mock Implementations

- **MockTool**: Simulates tool execution with tracking
- **PlatformTestTool**: Extended mock for integration tests
- **TestTool**: Basic tool implementation for compilation checks

## Coverage Statistics

- **Files covered**: 10+ header files, 8+ implementation files
- **Test cases**: 60+ individual test cases
- **Assertions**: 200+ individual assertions
- **Code paths**: Major success and error paths covered

## Integration Points

The tests verify integration with:
- gopher-orch core types (Result, Error, JsonValue, optional)
- Provider pattern for multiple AI frameworks
- OAuth 2.0 authentication flow
- User isolation and multi-tenancy
- Tool abstraction and execution

## Future Enhancements

Potential areas for additional testing:
1. Concurrent user access tests
2. Performance benchmarks
3. Memory leak detection with valgrind
4. Integration tests with real OAuth providers
5. Stress testing with many tools/providers
6. Edge cases in token expiration