# ToolRegistry Design Document

## Overview

ToolRegistry is a unified tool management system that aggregates tools from multiple sources (local functions, MCP servers, REST endpoints) into a single registry. It provides tool specifications for LLMs and handles tool execution with a consistent async interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Application / Agent                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           ToolRegistry                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  • addTool()           - Register local tools                  │  │
│  │  • addServer()         - Register MCP server tools             │  │
│  │  • loadFromFile()      - Load from JSON config                 │  │
│  │  • getToolSpecs()      - Get specs for LLM                     │  │
│  │  • executeTool()       - Execute tool by name                  │  │
│  │  • executeToolCalls()  - Execute multiple tools (parallel)     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Local Tools  │ │ MCP Server │ │ MCP Server │ │ REST Tools │
│   (Lambda)   │ │   (STDIO)  │ │   (HTTP)   │ │ (Adapter)  │
│              │ │            │ │            │ │            │
│ • calculator │ │ • weather  │ │ • search   │ │ • api_call │
│ • formatter  │ │ • geocode  │ │ • database │ │ • webhook  │
└──────────────┘ └────────────┘ └────────────┘ └────────────┘
```

## Core Components

### 1. ToolEntry - Internal Tool Representation

```cpp
struct ToolEntry {
  ToolSpec spec;              // Name, description, parameters
  ToolFunction function;       // Lambda for local tools
  ServerPtr server;           // MCP server for remote tools
  std::string original_name;  // Original name on server

  bool isLocal() const { return server == nullptr; }
  bool isRemote() const { return server != nullptr; }
};
```

### 2. ToolDefinition - Configuration-Driven Definition

```cpp
struct ToolDefinition {
  std::string name;
  std::string description;
  JsonValue input_schema;

  // Option 1: REST Endpoint
  optional<RESTEndpoint> rest_endpoint;

  // Option 2: MCP Server Reference
  optional<MCPReference> mcp_reference;

  // Option 3: Lambda Function
  optional<Handler> handler;

  // Metadata
  std::vector<std::string> tags;
  bool require_approval = false;
};
```

### 3. ToolFunction Signature

```cpp
using ToolFunction = std::function<void(
    const JsonValue& arguments,
    Dispatcher& dispatcher,
    JsonCallback callback)>;

// Synchronous version (wrapped internally)
using SyncToolFunction = std::function<Result<JsonValue>(const JsonValue&)>;
```

## Tool Registration Flow

```
┌────────────┐     ┌──────────────┐     ┌─────────────┐
│   Source   │────▶│ ToolRegistry │────▶│  ToolEntry  │
└────────────┘     └──────────────┘     └─────────────┘
      │                   │                    │
      │                   │                    │
      ▼                   ▼                    ▼

╔═══════════════════════════════════════════════════════════════════╗
║                    LOCAL TOOL REGISTRATION                         ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  addTool("name", "desc", schema, lambda)                          ║
║         │                                                          ║
║         ▼                                                          ║
║  ┌─────────────────────┐                                          ║
║  │ Create ToolEntry    │                                          ║
║  │ • spec.name = name  │                                          ║
║  │ • spec.desc = desc  │                                          ║
║  │ • function = lambda │                                          ║
║  │ • server = nullptr  │                                          ║
║  └─────────────────────┘                                          ║
║         │                                                          ║
║         ▼                                                          ║
║  tools_[name] = entry                                             ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════╗
║                   MCP SERVER REGISTRATION                          ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  addServer(server, dispatcher)                                    ║
║         │                                                          ║
║         ▼                                                          ║
║  ┌────────────────────────┐                                       ║
║  │ server->listTools()    │──────▶ Async tool discovery           ║
║  └────────────────────────┘                                       ║
║         │                                                          ║
║         ▼                                                          ║
║  For each ToolInfo:                                               ║
║  ┌─────────────────────────────┐                                  ║
║  │ Create ToolEntry            │                                  ║
║  │ • spec = toToolSpec(info)   │                                  ║
║  │ • server = server           │                                  ║
║  │ • original_name = info.name │                                  ║
║  └─────────────────────────────┘                                  ║
║         │                                                          ║
║         ▼                                                          ║
║  tools_["server:name"] = entry  (prefixed)                        ║
║  tools_["name"] = entry         (if no conflict)                  ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝
```

## Tool Execution Flow

```
┌─────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────┐
│  Agent  │────▶│ ToolRegistry │────▶│ Tool Handler  │────▶│  Result  │
└─────────┘     └──────────────┘     └───────────────┘     └──────────┘
     │                 │                     │                   │
     │ executeTool()   │                     │                   │
     │ ─────────────▶  │                     │                   │
     │                 │  Lookup tool        │                   │
     │                 │  ──────────────▶    │                   │
     │                 │                     │                   │
     │                 │  if entry.isLocal() │                   │
     │                 │  ┌─────────────────────────────────┐   │
     │                 │  │ entry.function(args, dispatcher,│   │
     │                 │  │                callback)        │   │
     │                 │  └─────────────────────────────────┘   │
     │                 │                     │                   │
     │                 │  if entry.isRemote()│                   │
     │                 │  ┌─────────────────────────────────┐   │
     │                 │  │ entry.server->callTool(         │   │
     │                 │  │   original_name, args,          │   │
     │                 │  │   config, dispatcher, callback) │   │
     │                 │  └─────────────────────────────────┘   │
     │                 │                     │                   │
     │                 │                     │  Execute tool     │
     │                 │                     │ ────────────────▶ │
     │                 │                     │                   │
     │  ◀──────────────────────────────────────────────────────  │
     │  callback(Result<JsonValue>)                              │
```

## Parallel Tool Execution

```
┌─────────┐     ┌──────────────┐
│  Agent  │────▶│ ToolRegistry │
└─────────┘     └──────────────┘
     │                 │
     │ executeToolCalls(calls, parallel=true)
     │ ─────────────────────────────────────▶
     │                 │
     │                 │  ┌─────────────────────────────────────────┐
     │                 │  │ Create shared state:                    │
     │                 │  │ • results = vector<Result>(calls.size())│
     │                 │  │ • pending = atomic<int>(calls.size())   │
     │                 │  └─────────────────────────────────────────┘
     │                 │
     │                 │  For each call (parallel):
     │                 │  ┌────────────────────────────────────────┐
     │                 │  │ executeTool(call.name, call.args, ..., │
     │                 │  │   [i, results, pending, callback](...) │
     │                 │  │   {                                    │
     │                 │  │     results[i] = result;               │
     │                 │  │     if (--pending == 0) {              │
     │                 │  │       callback(results);               │
     │                 │  │     }                                  │
     │                 │  │   }                                    │
     │                 │  │ )                                      │
     │                 │  └────────────────────────────────────────┘
     │                 │
     │                 │  ┌─────────┐  ┌─────────┐  ┌─────────┐
     │                 │  │ Tool 1  │  │ Tool 2  │  │ Tool 3  │
     │                 │  │ ───────▶│  │ ───────▶│  │ ───────▶│
     │                 │  └─────────┘  └─────────┘  └─────────┘
     │                 │       │            │            │
     │                 │       └────────────┴────────────┘
     │                 │                 │
     │                 │  All complete: pending == 0
     │                 │                 │
     │  ◀────────────────────────────────┘
     │  callback(vector<Result<JsonValue>>)
```

## Configuration Loading Flow

```
┌────────────┐     ┌──────────────┐     ┌──────────────┐
│ tools.json │────▶│ ConfigLoader │────▶│ ToolRegistry │
└────────────┘     └──────────────┘     └──────────────┘
      │                   │                    │
      │                   │                    │
      ▼                   ▼                    ▼

┌─────────────────────────────────────────────────────────────────┐
│                         tools.json                               │
├─────────────────────────────────────────────────────────────────┤
│  {                                                               │
│    "name": "my-tools",                                          │
│    "base_url": "https://api.example.com",                       │
│    "auth_presets": {                                            │
│      "main": { "type": "bearer", "value": "${API_KEY}" }        │
│    },                                                            │
│    "mcp_servers": [                                             │
│      { "name": "weather", "transport": "stdio",                 │
│        "command": "weather-server" }                            │
│    ],                                                            │
│    "tools": [                                                    │
│      { "name": "search", "rest_endpoint": {...} },              │
│      { "name": "calc", "mcp_reference": {...} }                 │
│    ]                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Loading Process                              │
├─────────────────────────────────────────────────────────────────┤
│  1. Parse JSON ─────▶ RegistryConfig                            │
│                                                                  │
│  2. Substitute environment variables (${VAR})                   │
│                                                                  │
│  3. Connect MCP servers (async)                                 │
│     For each server definition:                                 │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ createServer(def) ─▶ server->connect() ─▶ addServer() │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                  │
│  4. Register tools                                              │
│     For each tool definition:                                   │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ if (rest_endpoint)    ─▶ RESTToolAdapter.createTool() │   │
│     │ if (mcp_reference)    ─▶ lookup server, add reference │   │
│     │ if (handler)          ─▶ addTool() with handler       │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                  │
│  5. Call completion callback                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Example Usage

### Adding Local Tools

```cpp
#include "gopher/orch/agent/tool_registry.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::core;

auto registry = makeToolRegistry();

// Async tool with lambda
JsonValue calcSchema = JsonValue::object();
calcSchema["type"] = "object";
JsonValue props = JsonValue::object();
JsonValue aParam = JsonValue::object();
aParam["type"] = "number";
JsonValue bParam = JsonValue::object();
bParam["type"] = "number";
props["a"] = aParam;
props["b"] = bParam;
calcSchema["properties"] = props;
calcSchema["required"] = JsonValue::array({"a", "b"});

registry->addTool("add", "Add two numbers", calcSchema,
    [](const JsonValue& args, Dispatcher& dispatcher, JsonCallback callback) {
        double a = args["a"].getDouble();
        double b = args["b"].getDouble();

        JsonValue result = JsonValue::object();
        result["sum"] = a + b;

        dispatcher.post([callback = std::move(callback), result]() {
            callback(Result<JsonValue>(result));
        });
    });

// Sync tool (wrapper created automatically)
registry->addSyncTool("multiply", "Multiply two numbers", calcSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        double a = args["a"].getDouble();
        double b = args["b"].getDouble();

        JsonValue result = JsonValue::object();
        result["product"] = a * b;
        return Result<JsonValue>(result);
    });
```

### Adding MCP Server Tools

```cpp
#include "gopher/orch/server/mcp_server.h"

// Create MCP server
auto weatherServer = createMCPServer("weather", "weather-service", {"--port", "8080"});

// Connect and add all tools (async discovery)
registry->addServer(weatherServer, dispatcher);

// Or add specific tools by name
registry->addServerTool(weatherServer, "get_forecast", "forecast");  // Aliased as "forecast"

// Or provide tool list directly (sync)
std::vector<ToolInfo> tools = {
    ToolInfo{"get_weather", "Get current weather", weatherSchema},
    ToolInfo{"get_forecast", "Get weather forecast", forecastSchema}
};
registry->addServer(weatherServer, tools);
```

### Loading from JSON Configuration

```cpp
// Load from file
registry->loadFromFile("tools.json", dispatcher,
    [](VoidResult result) {
        if (mcp::holds_alternative<std::nullptr_t>(result)) {
            std::cout << "Tools loaded successfully!" << std::endl;
        } else {
            auto& error = mcp::get<Error>(result);
            std::cerr << "Failed to load: " << error.message << std::endl;
        }
    });

// Or from JSON string
std::string config = R"({
  "name": "my-registry",
  "tools": [
    {
      "name": "search",
      "description": "Search the web",
      "rest_endpoint": {
        "method": "GET",
        "url": "https://api.search.com/v1/search",
        "query_params": { "q": "$.query", "limit": "$.limit" },
        "response_path": "$.results"
      },
      "input_schema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "limit": { "type": "integer" }
        },
        "required": ["query"]
      }
    }
  ]
})";

registry->loadFromString(config, dispatcher, callback);
```

### Executing Tools

```cpp
// Execute single tool
JsonValue args = JsonValue::object();
args["a"] = 10;
args["b"] = 20;

registry->executeTool("add", args, dispatcher,
    [](Result<JsonValue> result) {
        if (mcp::holds_alternative<JsonValue>(result)) {
            auto& value = mcp::get<JsonValue>(result);
            std::cout << "Result: " << value.toString() << std::endl;
        }
    });

// Execute tool call from LLM
ToolCall call("call_123", "search", JsonValue::object());
call.arguments["query"] = "weather in NYC";

registry->executeToolCall(call, dispatcher,
    [](Result<JsonValue> result) {
        // Handle result...
    });

// Execute multiple tool calls in parallel
std::vector<ToolCall> calls = {
    ToolCall("call_1", "get_weather", weatherArgs),
    ToolCall("call_2", "get_time", timeArgs)
};

registry->executeToolCalls(calls, true /* parallel */, dispatcher,
    [](std::vector<Result<JsonValue>> results) {
        for (size_t i = 0; i < results.size(); ++i) {
            if (mcp::holds_alternative<JsonValue>(results[i])) {
                std::cout << "Tool " << i << " result: "
                          << mcp::get<JsonValue>(results[i]).toString() << std::endl;
            }
        }
    });
```

### Using with Agent

```cpp
#include "gopher/orch/agent/agent.h"
#include "gopher/orch/llm/openai_provider.h"

// Create components
auto provider = OpenAIProvider::create("sk-...");
auto registry = makeToolRegistry();

// Add tools
registry->addSyncTool("calculator", "Perform math", mathSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        // Implementation...
    });

// Create agent with registry
auto agent = ReActAgent::create(provider, registry);

// Run query - agent will use tools automatically
agent->run("What is 25 * 4?", dispatcher,
    [](Result<AgentResult> result) {
        if (mcp::holds_alternative<AgentResult>(result)) {
            auto& agentResult = mcp::get<AgentResult>(result);
            std::cout << "Answer: " << agentResult.response << std::endl;
        }
    });
```

## JSON Configuration Schema

```json
{
  "name": "registry-name",
  "base_url": "https://api.example.com",
  "default_headers": {
    "User-Agent": "MyApp/1.0"
  },

  "auth_presets": {
    "main_api": {
      "type": "bearer",
      "value": "${API_TOKEN}"
    },
    "secondary": {
      "type": "api_key",
      "value": "${SECONDARY_KEY}",
      "header": "X-API-Key"
    }
  },

  "mcp_servers": [
    {
      "name": "weather",
      "transport": "stdio",
      "command": "/usr/local/bin/weather-server",
      "args": ["--format", "json"],
      "env": {
        "API_KEY": "${WEATHER_API_KEY}"
      }
    },
    {
      "name": "database",
      "transport": "http_sse",
      "url": "https://mcp.example.com/database",
      "headers": {
        "Authorization": "Bearer ${DB_TOKEN}"
      }
    }
  ],

  "tools": [
    {
      "name": "search_web",
      "description": "Search the web for information",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Search query" },
          "limit": { "type": "integer", "default": 10 }
        },
        "required": ["query"]
      },
      "rest_endpoint": {
        "method": "GET",
        "url": "${BASE_URL}/search",
        "query_params": {
          "q": "$.query",
          "max_results": "$.limit"
        },
        "headers": {
          "Authorization": "Bearer ${SEARCH_API_KEY}"
        },
        "response_path": "$.results"
      },
      "tags": ["search", "web"],
      "require_approval": false
    },
    {
      "name": "get_weather",
      "description": "Get weather from MCP server",
      "mcp_reference": {
        "server_name": "weather",
        "tool_name": "current_weather"
      }
    }
  ]
}
```

## Environment Variable Substitution

```cpp
// Set environment variables programmatically
registry->setEnv("API_KEY", "sk-secret-key");
registry->setEnv("BASE_URL", "https://api.example.com");

// Load from .env file
registry->loadEnvFile(".env");

// Variables are substituted during config loading
// ${API_KEY} in config becomes "sk-secret-key"
```

## Thread Safety

- Configuration methods (`addTool`, `addServer`) should be called before use
- `executeTool` and `getToolSpecs` are thread-safe after configuration
- All callbacks are invoked in the dispatcher thread context
- Internal state is protected by mutex

## Error Handling

```cpp
registry->executeTool("nonexistent", args, dispatcher,
    [](Result<JsonValue> result) {
        if (!mcp::holds_alternative<JsonValue>(result)) {
            auto& error = mcp::get<Error>(result);

            // Error codes:
            // -1: Tool not found
            // -2: Invalid arguments
            // -3: Execution failed
            // -4: Timeout

            std::cerr << "Error " << error.code << ": "
                      << error.message << std::endl;
        }
    });
```

## REST Tool Adapter

For REST endpoint tools, the RESTToolAdapter handles:

```
┌────────────────────────────────────────────────────────────────────┐
│                      RESTToolAdapter                                │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Input: Tool arguments (JsonValue)                                 │
│                                                                     │
│  1. URL Construction                                               │
│     • Substitute environment variables: ${API_KEY}                 │
│     • Replace path parameters: /users/{id} -> /users/123           │
│     • Build query string: ?q=search&limit=10                       │
│                                                                     │
│  2. Header Assembly                                                │
│     • Default headers + endpoint-specific headers                  │
│     • Authentication header injection                              │
│                                                                     │
│  3. Body Mapping (POST/PUT/PATCH)                                  │
│     • Map input fields to request body via JSONPath                │
│     • body_mapping: {"title": "$.title", "content": "$.body"}     │
│                                                                     │
│  4. Response Processing                                            │
│     • Parse JSON response                                          │
│     • Extract via response_path: $.data.results                   │
│     • Return extracted value or full response                      │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Register tools before starting agent** - Tool discovery is async
2. **Use meaningful tool names** - LLMs use names to decide which tool to call
3. **Provide clear descriptions** - Help LLM understand when to use each tool
4. **Define precise schemas** - Reduce invalid argument errors
5. **Handle errors gracefully** - Tool failures are passed to LLM for recovery
6. **Use prefixed names** for MCP tools to avoid conflicts (`server:tool`)
7. **Set appropriate timeouts** for REST endpoints
