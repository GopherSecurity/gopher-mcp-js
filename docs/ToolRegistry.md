# ToolRegistry & ToolExecutor Design Document

## Overview

The tool management system is split into two components following the Single Responsibility Principle:

- **ToolRegistry** - A pure repository that stores and retrieves tool definitions
- **ToolExecutor** - Executes tools by looking them up in a registry

This separation ensures clean architecture where storage concerns are decoupled from execution logic.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Application / Agent                         │
└─────────────────────────────────────────────────────────────────────┘
                    │                           │
                    │ getToolSpecs()            │ executeToolCalls()
                    ▼                           ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│         ToolRegistry          │◀──│         ToolExecutor          │
│   (Repository / Storage)      │   │      (Execution Logic)        │
├───────────────────────────────┤   ├───────────────────────────────┤
│ • addTool()                   │   │ • executeTool()               │
│ • addServer()                 │   │ • executeToolCall()           │
│ • addSyncTool()               │   │ • executeToolCalls()          │
│ • getToolSpecs()              │   │                               │
│ • getToolEntry()              │   │ Uses registry->getToolEntry() │
│ • hasTool()                   │   │ to lookup before execution    │
│ • loadFromFile()              │   │                               │
└───────────────────────────────┘   └───────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Local Tools  │ │ MCP Server │ │ MCP Server │ │ REST Tools │
│   (Lambda)   │ │   (STDIO)  │ │   (HTTP)   │ │ (Adapter)  │
└──────────────┘ └────────────┘ └────────────┘ └────────────┘
```

## Core Components

### 1. ToolRegistry - Repository

```cpp
class ToolRegistry {
 public:
  // Registration
  void addTool(name, description, parameters, function);
  void addSyncTool(name, description, parameters, sync_function);
  void addServer(server, dispatcher);
  void addServerTool(server, tool_info, alias);

  // Retrieval
  std::vector<ToolSpec> getToolSpecs() const;
  optional<ToolSpec> getToolSpec(name) const;
  optional<ToolEntry> getToolEntry(name) const;
  bool hasTool(name) const;
  std::vector<std::string> getToolNames() const;
  size_t toolCount() const;

  // Management
  void removeTool(name);
  void clear();

  // Configuration
  void loadFromFile(path, dispatcher, callback);
  void loadFromString(json_string, dispatcher, callback);
  void setEnv(name, value);
};
```

### 2. ToolExecutor - Execution

```cpp
class ToolExecutor {
 public:
  explicit ToolExecutor(ToolRegistryPtr registry);

  // Get underlying registry
  ToolRegistryPtr registry() const;

  // Execute single tool
  void executeTool(name, arguments, dispatcher, callback);

  // Execute ToolCall from LLM
  void executeToolCall(call, dispatcher, callback);

  // Execute multiple tool calls (parallel)
  void executeToolCalls(calls, parallel, dispatcher, callback);
};
```

### 3. ToolEntry - Internal Representation

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
║  registry->addTool("name", "desc", schema, lambda)                ║
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
║  registry->addServer(server, dispatcher)                          ║
║         │                                                          ║
║         ▼                                                          ║
║  ┌────────────────────────┐                                       ║
║  │ server->listTools()    │──────▶ Async tool discovery           ║
║  └────────────────────────┘                                       ║
║         │                                                          ║
║         ▼                                                          ║
║  For each ServerToolInfo:                                               ║
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
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Agent  │────▶│ ToolExecutor │────▶│ ToolRegistry │────▶│  Result  │
└─────────┘     └──────────────┘     └──────────────┘     └──────────┘
     │                 │                     │                   │
     │ executeTool()   │                     │                   │
     │ ───────────────▶│                     │                   │
     │                 │  getToolEntry()     │                   │
     │                 │  ──────────────────▶│                   │
     │                 │                     │                   │
     │                 │◀──────────────────── │                   │
     │                 │  ToolEntry          │                   │
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
     │  ◀──────────────────────────────────────────────────────  │
     │  callback(Result<JsonValue>)                              │
```

## Parallel Tool Execution

```
┌─────────┐     ┌──────────────┐
│  Agent  │────▶│ ToolExecutor │
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
     │                 │  │ registry->getToolEntry(call.name)      │
     │                 │  │ execute entry.function or server call  │
     │                 │  │ on completion: results[i] = result     │
     │                 │  │                if (--pending == 0)     │
     │                 │  │                  callback(results)     │
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

## Example Usage

### Basic Setup

```cpp
#include "gopher/orch/agent/tool_registry.h"
#include "gopher/orch/agent/tool_executor.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::core;

// Create registry and executor
auto registry = makeToolRegistry();
auto executor = makeToolExecutor(registry);
```

### Adding Local Tools

```cpp
// Async tool with lambda
JsonValue calcSchema = JsonValue::object();
calcSchema["type"] = "object";
// ... schema definition ...

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
registry->addServerTool(weatherServer, "get_forecast", "forecast");

// Or provide tool list directly (sync)
std::vector<ServerToolInfo> tools = {
    ServerToolInfo{"get_weather", "Get current weather", weatherSchema},
    ServerToolInfo{"get_forecast", "Get weather forecast", forecastSchema}
};
registry->addServer(weatherServer, tools);
```

### Executing Tools

```cpp
// Execute single tool via executor
JsonValue args = JsonValue::object();
args["a"] = 10;
args["b"] = 20;

executor->executeTool("add", args, dispatcher,
    [](Result<JsonValue> result) {
        if (mcp::holds_alternative<JsonValue>(result)) {
            auto& value = mcp::get<JsonValue>(result);
            std::cout << "Result: " << value.toString() << std::endl;
        }
    });

// Execute tool call from LLM
ToolCall call("call_123", "search", JsonValue::object());
call.arguments["query"] = "weather in NYC";

executor->executeToolCall(call, dispatcher,
    [](Result<JsonValue> result) {
        // Handle result...
    });

// Execute multiple tool calls in parallel
std::vector<ToolCall> calls = {
    ToolCall("call_1", "get_weather", weatherArgs),
    ToolCall("call_2", "get_time", timeArgs)
};

executor->executeToolCalls(calls, true /* parallel */, dispatcher,
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

// Add tools to registry
registry->addSyncTool("calculator", "Perform math", mathSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        // Implementation...
    });

// Create agent with registry
// Agent internally creates its own ToolExecutor
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
    }
  ],

  "tools": [
    {
      "name": "search_web",
      "description": "Search the web for information",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"]
      },
      "rest_endpoint": {
        "method": "GET",
        "url": "${BASE_URL}/search",
        "query_params": { "q": "$.query" },
        "response_path": "$.results"
      }
    },
    {
      "name": "get_forecast",
      "description": "Get weather forecast from MCP server",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" }
        },
        "required": ["city"]
      },
      "mcp_reference": {
        "server_name": "weather",
        "tool_name": "forecast"
      }
    }
  ]
}
```

## Thread Safety

- **ToolRegistry**: Configuration methods (`addTool`, `addServer`) should be called before use. Read methods (`getToolSpecs`, `getToolEntry`) are thread-safe after configuration.
- **ToolExecutor**: All execution methods are thread-safe.
- All callbacks are invoked in the dispatcher thread context.

## Error Handling

```cpp
executor->executeTool("nonexistent", args, dispatcher,
    [](Result<JsonValue> result) {
        if (!mcp::holds_alternative<JsonValue>(result)) {
            auto& error = mcp::get<Error>(result);
            std::cerr << "Error: " << error.message << std::endl;
        }
    });
```

## Best Practices

1. **Separate concerns** - Use ToolRegistry for storage, ToolExecutor for execution
2. **Register tools before starting agent** - Tool discovery is async
3. **Use meaningful tool names** - LLMs use names to decide which tool to call
4. **Provide clear descriptions** - Help LLM understand when to use each tool
5. **Define precise schemas** - Reduce invalid argument errors
6. **Handle errors gracefully** - Tool failures are passed to LLM for recovery
7. **Use prefixed names** for MCP tools to avoid conflicts (`server:tool`)
