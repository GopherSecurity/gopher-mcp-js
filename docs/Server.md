# Server Abstraction

Gopher Orch provides a protocol-agnostic server abstraction. Register tools once, expose via MCP, REST, or Mock protocols interchangeably.

## Overview

```
┌─────────────────────────────────────────┐
│           Tool Registry                  │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │Tool1│ │Tool2│ │Tool3│ │Tool4│       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
└───────────────────┬─────────────────────┘
                    │
          ┌─────────┴─────────┐
          │  Server Interface │
          └─────────┬─────────┘
                    │
     ┌──────────────┼──────────────┐
     │              │              │
     ▼              ▼              ▼
┌─────────┐  ┌───────────┐  ┌───────────┐
│   MCP   │  │   REST    │  │   Mock    │
│ Server  │  │  Server   │  │  Server   │
└─────────┘  └───────────┘  └───────────┘
```

## Tool Registry

Register tools that can be exposed via any protocol:

```cpp
#include "gopher/orch/agent/tool_registry.h"

using namespace gopher::orch::agent;

auto registry = makeToolRegistry();

// Synchronous tool
registry->addSyncTool(
    "calculator",
    "Perform mathematical calculations",
    JsonValue::object({{"expression", "string"}}),
    [](const JsonValue& args) -> Result<JsonValue> {
        auto expr = args["expression"].getString();
        double result = evaluate(expr);
        return makeSuccess(JsonValue(result));
    });

// Async tool
registry->addTool(
    "search",
    "Search the web",
    JsonValue::object({{"query", "string"}}),
    [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
        auto query = args["query"].getString();
        searchWeb(query, d, [cb = std::move(cb)](Result<JsonValue> result) {
            cb(std::move(result));
        });
    });
```

## MCP Server

Expose tools via Model Context Protocol:

```cpp
#include "gopher/orch/server/mcp_server.h"

using namespace gopher::orch::server;

// Create MCP server with registry
MCPServerConfig config;
config.name = "my-agent-server";
config.version = "1.0.0";

auto mcpServer = makeMCPServer(registry, config);

// Listen on TCP
mcpServer->listen("tcp://0.0.0.0:8080");

// Or stdio for CLI tools
mcpServer->listen("stdio://");

// Run event loop
mcpServer->run();
```

### MCP Server Configuration

```cpp
struct MCPServerConfig {
    std::string name;           // Server name
    std::string version;        // Server version
    std::string description;    // Human-readable description

    // Capabilities
    bool supports_sampling = false;
    bool supports_resources = true;
    bool supports_prompts = true;

    // Timeouts
    uint64_t request_timeout_ms = 30000;
    uint64_t session_timeout_ms = 300000;

    // Worker threads
    int worker_threads = 4;
};
```

## REST Server

Expose tools via REST API:

```cpp
#include "gopher/orch/server/rest_server.h"

using namespace gopher::orch::server;

RESTServerConfig config;
config.port = 3000;
config.host = "0.0.0.0";

auto restServer = makeRESTServer(registry, config);

// Tools are exposed as POST endpoints:
// POST /tools/calculator
// POST /tools/search

restServer->listen();
restServer->run();
```

### REST API Format

**Request:**
```http
POST /tools/calculator
Content-Type: application/json

{
  "expression": "2 + 2"
}
```

**Response:**
```json
{
  "success": true,
  "result": 4
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": -1,
    "message": "Invalid expression"
  }
}
```

## Mock Server

For unit testing without network:

```cpp
#include "gopher/orch/server/mock_server.h"

using namespace gopher::orch::server;

auto mockServer = makeMockServer(registry);

// Set mock responses
mockServer->setToolResponse("search", JsonValue::object({
    {"results", JsonValue::array({...})}
}));

// Or set errors
mockServer->setToolError("calculator", -1, "Mock error");

// Use in tests
auto agent = makeAgent(mockServer);
```

### Testing with MockServer

```cpp
TEST(AgentTest, UsesSearchTool) {
    auto registry = makeToolRegistry();
    // ... register tools ...

    auto mockServer = makeMockServer(registry);
    mockServer->setToolResponse("search", mockResults);

    auto agent = makeAgent(mockServer);

    auto result = runToCompletion([&](Dispatcher& d, Callback cb) {
        agent->invoke("Search for weather", config, d, std::move(cb));
    });

    EXPECT_TRUE(result["success"].getBool());
    EXPECT_EQ(mockServer->callCount("search"), 1);
}
```

## Server Interface

All servers implement a common interface:

```cpp
class Server {
public:
    virtual ~Server() = default;

    // Get tool specifications
    virtual std::vector<ToolSpec> getTools() const = 0;

    // Execute a tool
    virtual void callTool(const std::string& name,
                          const JsonValue& args,
                          Dispatcher& dispatcher,
                          JsonCallback callback) = 0;

    // List available tools
    virtual JsonValue listTools() const = 0;
};
```

## Composite Server

Combine multiple tool sources:

```cpp
#include "gopher/orch/server/composite_server.h"

auto composite = makeCompositeServer();

// Add local tools
composite->addRegistry(localRegistry);

// Add remote MCP servers
composite->addMCPClient("tcp://tools-server:8080");
composite->addMCPClient("tcp://ai-server:8080");

// All tools are unified
auto tools = composite->listTools();
// Returns tools from all sources
```

## Tool Approval

Add human-in-the-loop for sensitive tools:

```cpp
#include "gopher/orch/human/human_approval.h"

auto approver = makeHumanApproval();

// Require approval for specific tools
approver->requireApproval("delete_file");
approver->requireApproval("send_email");

// Set approval handler
approver->setHandler([](const ToolCall& call) -> bool {
    std::cout << "Approve " << call.name << "? (y/n): ";
    char response;
    std::cin >> response;
    return response == 'y';
});

// Wrap server with approval
auto protected = withApproval(server, approver);
```

## Best Practices

1. **Use MockServer for tests** - No network dependencies in unit tests
2. **Define schemas** - Validate tool arguments
3. **Handle errors gracefully** - Return meaningful error messages
4. **Set timeouts** - Prevent hanging tool calls
5. **Log tool usage** - For debugging and auditing
6. **Version your API** - Include version in server config

## Protocol Comparison

| Feature | MCP | REST | Mock |
|---------|-----|------|------|
| Streaming | Yes (SSE) | No | N/A |
| Bi-directional | Yes | No | N/A |
| Discovery | Built-in | Custom | N/A |
| Authentication | Protocol-level | HTTP-based | N/A |
| Best for | AI agents | Web services | Testing |

## See Also

- [Tool Registry](ToolRegistry.md) - Detailed tool registration guide
- [Agent Framework](Agent.md) - Using servers with agents
- [FFI Guide](FFI.md) - Cross-language server integration
