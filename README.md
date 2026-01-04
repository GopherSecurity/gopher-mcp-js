# Gopher Orch - AI Agent Orchestration Framework for C++

[![C++14](https://img.shields.io/badge/C%2B%2B-14%2F17%2F20-blue.svg)](https://isocpp.org/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-green.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

**Gopher Orch / C++ AI Agent Framework** - A production-ready, protocol-agnostic orchestration framework for building AI agents and agentic workflows in modern C++. LangChain-style composability with explicit, non-magical design.

## What is Gopher Orch?

Gopher Orch is a **C++ AI agent orchestration framework** that provides composable building blocks for creating intelligent AI agents. Built on top of [gopher-mcp](https://github.com/anthropics/gopher-mcp), it enables developers to build ReAct agents, stateful workflows, and multi-step reasoning systems with enterprise-grade reliability.

### Key Benefits

- **LangChain-Style Composability**: Chain operations with `|` operator, build complex workflows from simple components
- **Protocol-Agnostic**: Works with MCP, REST, gRPC, or custom protocols interchangeably
- **Testable-by-Design**: MockServer support for unit testing without network dependencies
- **Production-Ready**: Circuit breaker, retry, timeout, and fallback patterns built-in
- **Cross-Language**: C API (FFI) for Python, Rust, Go, Node.js, Java, and more

## Why Choose Gopher Orch?

| Feature | Gopher Orch | LangChain | LlamaIndex |
|---------|-------------|-----------|------------|
| Language | C++ (with FFI bindings) | Python | Python |
| Performance | Native speed, zero-copy | Interpreted | Interpreted |
| Type Safety | Compile-time checked | Runtime | Runtime |
| Composability | Explicit `Runnable<I,O>` | Magic methods | Index abstractions |
| Protocol Support | MCP, REST, Mock | Various | Various |
| Memory Control | RAII, deterministic | GC-managed | GC-managed |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Application Layer                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │      AI Agents │ Workflows │ State Graphs │ Chatbots           │ │
│  └────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                    FFI Layer (Cross-Language)                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │    Python │ Rust │ Go │ Node.js │ Java │ C# │ Ruby │ Swift    │ │
│  └────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                    Orchestration Layer                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │   Runnable   │ │  StateGraph  │ │  Resilience  │ │   Agent    │ │
│  │  Composition │ │   (Pregel)   │ │   Patterns   │ │   (ReAct)  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                  Server Abstraction Layer                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │     Protocol-Agnostic Server Interface │ Tool Registry         │ │
│  └────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                  Protocol Implementations                            │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐          │
│  │   MCP Server   │ │  REST Server   │ │  Mock Server   │          │
│  └────────────────┘ └────────────────┘ └────────────────┘          │
├─────────────────────────────────────────────────────────────────────┤
│                  Foundation (gopher-mcp)                             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │   Dispatcher │ JsonValue │ Result<T> │ Event Loop │ Transports │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### Runnable Interface - Universal Building Block

The `Runnable<Input, Output>` interface is the foundation of all composable operations:

```cpp
#include "gopher/orch/orch.h"

using namespace gopher::orch;

// Create a simple lambda runnable
auto greet = makeLambda<std::string, std::string>(
    [](const std::string& name, Dispatcher& d, ResultCallback<std::string> cb) {
        cb(Result<std::string>("Hello, " + name + "!"));
    });

// Invoke asynchronously
greet->invoke("World", config, dispatcher, [](Result<std::string> result) {
    std::cout << mcp::get<std::string>(result) << std::endl;
});
```

### Composition Patterns

Build complex workflows from simple components:

```cpp
// Sequence: A | B | C (pipe pattern)
auto pipeline = makeSequence(step1, step2, step3);

// Parallel: Run operations concurrently
auto parallel = makeParallel({taskA, taskB, taskC});

// Router: Conditional branching
auto router = makeRouter<JsonValue>()
    .addRoute("search", searchHandler)
    .addRoute("calculate", calculateHandler)
    .withDefault(defaultHandler)
    .build();
```

### ReAct Agent - Reasoning + Acting

Build AI agents that reason about tasks and use tools:

```cpp
#include "gopher/orch/agent/agent_runnable.h"

// Create LLM provider
auto provider = makeOpenAIProvider(api_key, "gpt-4");

// Create tool registry
auto registry = makeToolRegistry();
registry->addSyncTool("search", "Search the web", schema,
    [](const JsonValue& args) -> Result<JsonValue> {
        // Tool implementation
        return Result<JsonValue>(searchResults);
    });

// Create ReAct agent
auto agent = makeAgentRunnable(provider, registry,
    AgentConfig("gpt-4")
        .withSystemPrompt("You are a helpful assistant.")
        .withMaxIterations(10));

// Run agent
JsonValue input = "What's the weather in Tokyo?";
agent->invoke(input, config, dispatcher, [](Result<JsonValue> result) {
    auto output = mcp::get<JsonValue>(result);
    std::cout << output["response"].getString() << std::endl;
});
```

### StateGraph - LangGraph-Style Workflows

Build stateful workflows with conditional transitions:

```cpp
#include "gopher/orch/graph/state_graph.h"

// Define state with reducer
struct AgentState {
    std::vector<Message> messages;  // APPEND reducer
    int step_count = 0;             // LAST_WRITE_WINS

    static AgentState reduce(const AgentState& a, const AgentState& b);
};

// Build graph
auto graph = StateGraphBuilder<AgentState>()
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addEdge(START, "agent")
    .addConditionalEdge("agent", shouldContinue, {
        {"continue", "tools"},
        {"end", END}
    })
    .addEdge("tools", "agent")
    .compile();

// Execute
graph->invoke(initialState, config, dispatcher, callback);
```

### Resilience Patterns

Add production-grade reliability to any runnable:

```cpp
// Retry with exponential backoff
auto reliable = makeRetry(unreliableOp, RetryConfig()
    .withMaxAttempts(3)
    .withBackoff(std::chrono::milliseconds(100)));

// Timeout protection
auto bounded = makeTimeout(slowOp, std::chrono::seconds(30));

// Fallback on failure
auto safe = makeFallback(primaryOp, fallbackOp);

// Circuit breaker for failure isolation
auto protected = makeCircuitBreaker(externalService, CircuitBreakerConfig()
    .withFailureThreshold(5)
    .withResetTimeout(std::chrono::seconds(60)));
```

### LLM Providers

Built-in support for major LLM providers:

```cpp
// OpenAI / GPT-4
auto openai = makeOpenAIProvider(api_key, "gpt-4");

// Anthropic / Claude
auto anthropic = makeAnthropicProvider(api_key, "claude-3-opus-20240229");

// Use with LLMRunnable for composable LLM operations
auto llm = makeLLMRunnable(provider, LLMConfig()
    .withModel("gpt-4")
    .withTemperature(0.7));
```

### Protocol-Agnostic Server

Register tools once, expose via any protocol:

```cpp
// Create server with tool registry
auto server = makeServer(registry, ServerConfig()
    .withName("my-agent-server"));

// Expose via MCP protocol
auto mcpServer = makeMCPServer(server, mcpConfig);
mcpServer->listen("tcp://0.0.0.0:8080");

// Or expose via REST API
auto restServer = makeRESTServer(server, restConfig);
restServer->listen("http://0.0.0.0:3000");

// Or use MockServer for testing
auto mockServer = makeMockServer(server);
mockServer->setToolResponse("search", mockResponse);
```

## Installation

### Prerequisites

- C++14 or later compiler (GCC 8+, Clang 10+, MSVC 2019+)
- CMake 3.10+
- [gopher-mcp](https://github.com/anthropics/gopher-mcp) (auto-fetched as submodule)

### Build from Source

```bash
# Clone with submodules
git clone --recursive https://github.com/anthropics/gopher-orch.git
cd gopher-orch

# Build
make

# Run tests
make test

# Install (auto-prompts for sudo if needed)
make install
```

### CMake Integration

```cmake
# Option 1: FetchContent
include(FetchContent)
FetchContent_Declare(
    gopher-orch
    GIT_REPOSITORY https://github.com/anthropics/gopher-orch.git
    GIT_TAG main
)
FetchContent_MakeAvailable(gopher-orch)

target_link_libraries(your_target gopher-orch)

# Option 2: Submodule
add_subdirectory(third_party/gopher-orch)
target_link_libraries(your_target gopher-orch)
```

## Use Cases

### 1. AI Chatbots and Assistants
Build conversational AI agents with tool-calling capabilities, memory, and multi-turn reasoning.

### 2. Autonomous Agents
Create agents that can break down complex tasks, use tools, and iterate until completion.

### 3. Workflow Automation
Orchestrate multi-step business processes with conditional branching and error handling.

### 4. RAG Pipelines
Build retrieval-augmented generation systems with composable retrieval and synthesis steps.

### 5. Multi-Agent Systems
Coordinate multiple specialized agents working together on complex problems.

### 6. API Orchestration
Compose multiple API calls with resilience patterns and parallel execution.

## Cross-Language Support (FFI)

Gopher Orch provides a stable C API for integration with other languages:

```python
# Python example
from gopher_orch import Agent, ToolRegistry

registry = ToolRegistry()
registry.add_tool("search", search_function)

agent = Agent(provider, registry, config)
result = agent.invoke("What's the weather?")
```

Supported languages:
- **Python**: ctypes/cffi with async support
- **Rust**: Safe FFI wrappers
- **Go**: CGO integration
- **Node.js**: N-API bindings
- **Java**: JNI bindings
- **C#/.NET**: P/Invoke

## Documentation

- [Runnable Interface](docs/Runnable.md) - Core composable interface
- [Composition Patterns](docs/Composition.md) - Sequence, Parallel, Router
- [Agent Framework](docs/Agent.md) - ReAct agents and tool execution
- [StateGraph Guide](docs/StateGraph.md) - LangGraph-style stateful workflows
- [Resilience Patterns](docs/Resilience.md) - Retry, Timeout, Fallback, Circuit Breaker
- [Server Abstraction](docs/Server.md) - Protocol-agnostic server interface
- [FFI Guide](docs/FFI.md) - Cross-language integration

## Examples

See the [examples/](examples/) directory for complete working examples:

- `examples/simple_agent/` - Basic ReAct agent with tools
- `examples/chatbot/` - Multi-turn conversational agent
- `examples/workflow/` - StateGraph-based workflow
- `examples/resilient_api/` - API client with resilience patterns
- `examples/multi_agent/` - Multi-agent coordination

## Comparison with Other Frameworks

### vs LangChain (Python)
- **Performance**: Native C++ vs interpreted Python
- **Type Safety**: Compile-time vs runtime errors
- **Memory**: Deterministic RAII vs garbage collection
- **Design**: Explicit interfaces vs magic methods

### vs LlamaIndex (Python)
- **Focus**: General orchestration vs RAG-specific
- **Flexibility**: Protocol-agnostic vs LLM-focused
- **Composability**: Universal Runnable vs Index abstractions

### vs Semantic Kernel (C#/.NET)
- **Language**: C++ with FFI vs .NET ecosystem
- **Portability**: Cross-platform native vs .NET runtime
- **Protocol**: MCP-native vs custom plugins

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting pull requests.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## Related Projects

- [gopher-mcp](https://github.com/anthropics/gopher-mcp) - C++ MCP SDK (foundation layer)
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [LangChain](https://github.com/langchain-ai/langchain) - Python AI orchestration
- [LlamaIndex](https://github.com/run-llama/llama_index) - Python RAG framework

## Keywords & Search Terms

`C++ AI Agent`, `C++ LLM Framework`, `AI Agent Orchestration C++`, `ReAct Agent C++`, `LangChain C++`, `LangGraph C++`, `C++ AI Framework`, `MCP Agent`, `Model Context Protocol Agent`, `C++ Chatbot Framework`, `AI Workflow C++`, `Tool Calling Agent C++`, `Agentic AI C++`, `C++ LLM Integration`, `Production AI Agent`, `Enterprise AI Framework C++`
