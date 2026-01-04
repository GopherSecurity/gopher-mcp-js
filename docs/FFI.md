# FFI Guide

Gopher Orch provides a stable C API (FFI layer) for integration with other programming languages. Build agents in Python, Rust, Go, or any language with C FFI support.

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Python  │ │  Rust   │ │   Go    │ │ Node.js │       │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │
│       │          │          │          │               │
│       └──────────┴──────────┴──────────┘               │
│                         │                               │
│              ┌──────────┴──────────┐                    │
│              │   Language Bindings  │                    │
│              └──────────┬──────────┘                    │
├─────────────────────────┼───────────────────────────────┤
│              ┌──────────┴──────────┐                    │
│              │   C API (FFI Layer) │                    │
│              │   libgopher_orch_c   │                    │
│              └──────────┬──────────┘                    │
├─────────────────────────┼───────────────────────────────┤
│              ┌──────────┴──────────┐                    │
│              │   Gopher Orch C++   │                    │
│              └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## C API Design

The C API uses:
- **Opaque handles** - Hide C++ implementation details
- **RAII guards** - Automatic resource cleanup
- **Error codes** - Explicit error handling
- **Callbacks** - Async operation support

### Handle Types

```c
// Opaque handle types
typedef struct gopher_orch_agent* gopher_orch_agent_t;
typedef struct gopher_orch_registry* gopher_orch_registry_t;
typedef struct gopher_orch_provider* gopher_orch_provider_t;
typedef struct gopher_orch_runnable* gopher_orch_runnable_t;
```

### Error Handling

```c
// Error structure
typedef struct {
    int code;
    const char* message;
} gopher_orch_error_t;

// Check for errors
gopher_orch_error_t err;
if (gopher_orch_agent_invoke(agent, input, &err) != 0) {
    printf("Error %d: %s\n", err.code, err.message);
    gopher_orch_error_free(&err);
}
```

## Building the C API

```bash
# Build with C API enabled (default)
cmake -B build -DBUILD_C_API=ON
make -C build

# Output: lib/libgopher_orch_c.{so,dylib,dll}
# Headers: include/gopher-orch/ffi/
```

## Python Bindings

### Installation

```bash
pip install gopher-orch
```

### Basic Usage

```python
from gopher_orch import Agent, ToolRegistry, OpenAIProvider

# Create provider
provider = OpenAIProvider(api_key="sk-...")

# Create registry with tools
registry = ToolRegistry()

@registry.tool("search", "Search the web")
def search(query: str) -> dict:
    return {"results": [...]}

@registry.tool("calculate", "Perform calculations")
def calculate(expression: str) -> float:
    return eval(expression)

# Create agent
agent = Agent(
    provider=provider,
    registry=registry,
    system_prompt="You are a helpful assistant."
)

# Run agent
result = agent.invoke("What's 2+2 and search for weather in Tokyo")
print(result.response)
```

### Async Support

```python
import asyncio
from gopher_orch import AsyncAgent

async def main():
    agent = AsyncAgent(provider, registry)

    # Async invocation
    result = await agent.invoke("Search for news")

    # Streaming
    async for chunk in agent.stream("Tell me a story"):
        print(chunk, end="", flush=True)

asyncio.run(main())
```

## Rust Bindings

### Cargo.toml

```toml
[dependencies]
gopher-orch = "0.1"
```

### Usage

```rust
use gopher_orch::{Agent, ToolRegistry, OpenAIProvider};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create provider
    let provider = OpenAIProvider::new("sk-...")?;

    // Create registry
    let mut registry = ToolRegistry::new();

    registry.add_tool("search", "Search the web", |args| {
        let query = args.get("query").as_str()?;
        Ok(json!({"results": search_web(query)}))
    })?;

    // Create agent
    let agent = Agent::builder()
        .provider(provider)
        .registry(registry)
        .system_prompt("You are helpful.")
        .build()?;

    // Run agent
    let result = agent.invoke("Search for weather")?;
    println!("{}", result.response);

    Ok(())
}
```

## Go Bindings

### Installation

```bash
go get github.com/anthropics/gopher-orch-go
```

### Usage

```go
package main

import (
    "fmt"
    orch "github.com/anthropics/gopher-orch-go"
)

func main() {
    // Create provider
    provider := orch.NewOpenAIProvider("sk-...")

    // Create registry
    registry := orch.NewToolRegistry()

    registry.AddTool("search", "Search the web", func(args orch.JSON) (orch.JSON, error) {
        query := args.GetString("query")
        return searchWeb(query), nil
    })

    // Create agent
    agent := orch.NewAgent(provider, registry, orch.AgentConfig{
        SystemPrompt: "You are helpful.",
    })

    // Run agent
    result, err := agent.Invoke("Search for news")
    if err != nil {
        panic(err)
    }
    fmt.Println(result.Response)
}
```

## Node.js Bindings

### Installation

```bash
npm install gopher-orch
```

### Usage

```javascript
const { Agent, ToolRegistry, OpenAIProvider } = require('gopher-orch');

async function main() {
    // Create provider
    const provider = new OpenAIProvider({ apiKey: 'sk-...' });

    // Create registry
    const registry = new ToolRegistry();

    registry.addTool('search', 'Search the web', async (args) => {
        const results = await searchWeb(args.query);
        return { results };
    });

    // Create agent
    const agent = new Agent({
        provider,
        registry,
        systemPrompt: 'You are helpful.'
    });

    // Run agent
    const result = await agent.invoke('Search for weather');
    console.log(result.response);
}

main();
```

## C API Reference

### Agent Functions

```c
// Create agent
gopher_orch_agent_t gopher_orch_agent_create(
    gopher_orch_provider_t provider,
    gopher_orch_registry_t registry,
    const char* config_json
);

// Invoke agent (blocking)
int gopher_orch_agent_invoke(
    gopher_orch_agent_t agent,
    const char* input_json,
    char** output_json,
    gopher_orch_error_t* error
);

// Invoke agent (async)
int gopher_orch_agent_invoke_async(
    gopher_orch_agent_t agent,
    const char* input_json,
    gopher_orch_callback_t callback,
    void* user_data
);

// Destroy agent
void gopher_orch_agent_destroy(gopher_orch_agent_t agent);
```

### Registry Functions

```c
// Create registry
gopher_orch_registry_t gopher_orch_registry_create(void);

// Add tool
int gopher_orch_registry_add_tool(
    gopher_orch_registry_t registry,
    const char* name,
    const char* description,
    const char* schema_json,
    gopher_orch_tool_fn callback,
    void* user_data
);

// Destroy registry
void gopher_orch_registry_destroy(gopher_orch_registry_t registry);
```

### Provider Functions

```c
// Create OpenAI provider
gopher_orch_provider_t gopher_orch_openai_create(
    const char* api_key,
    const char* model
);

// Create Anthropic provider
gopher_orch_provider_t gopher_orch_anthropic_create(
    const char* api_key,
    const char* model
);

// Destroy provider
void gopher_orch_provider_destroy(gopher_orch_provider_t provider);
```

## Memory Management

### RAII Guards

The C API provides RAII-style guards for automatic cleanup:

```c
// C++ style RAII (if available)
#include <gopher_orch_ffi.h>

void example() {
    GOPHER_ORCH_GUARD(agent, gopher_orch_agent_create(...));
    // agent automatically destroyed when scope exits
}
```

### Manual Cleanup

```c
gopher_orch_agent_t agent = gopher_orch_agent_create(...);
// ... use agent ...
gopher_orch_agent_destroy(agent);
```

## Thread Safety

- All FFI functions are thread-safe
- Callbacks may be invoked from different threads
- Use the dispatcher model for coordination

```c
// Thread-safe invocation
gopher_orch_agent_invoke_async(agent, input,
    on_complete_callback, user_data);

// Callback may be called from any thread
void on_complete_callback(const char* result, void* user_data) {
    // Handle result thread-safely
}
```

## Error Codes

```c
#define GOPHER_ORCH_OK              0
#define GOPHER_ORCH_ERR_NULL_PTR   -1
#define GOPHER_ORCH_ERR_INVALID   -2
#define GOPHER_ORCH_ERR_TIMEOUT   -3
#define GOPHER_ORCH_ERR_INTERNAL  -4
```

## Best Practices

1. **Always check errors** - Every FFI call can fail
2. **Free resources** - Call destroy functions or use guards
3. **Copy strings** - FFI strings may be freed after call returns
4. **Use async APIs** - Avoid blocking the main thread
5. **Handle callbacks safely** - They may come from any thread

## Building Custom Bindings

For unsupported languages, use the C API directly:

```c
// 1. Load library
void* lib = dlopen("libgopher_orch_c.so", RTLD_NOW);

// 2. Get function pointers
typedef gopher_orch_agent_t (*create_fn)(/* ... */);
create_fn create = dlsym(lib, "gopher_orch_agent_create");

// 3. Call functions
gopher_orch_agent_t agent = create(/* ... */);

// 4. Cleanup
gopher_orch_agent_destroy(agent);
dlclose(lib);
```

## See Also

- [Runnable Interface](Runnable.md) - Core C++ interface
- [Agent Framework](Agent.md) - Agent implementation details
- [Server Abstraction](Server.md) - Protocol support
