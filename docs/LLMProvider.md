# LLMProvider Design Document

## Overview

LLMProvider is an abstract interface that provides a unified way to interact with various Large Language Model providers (OpenAI, Anthropic, Ollama, etc.). It handles the complexities of different API formats while exposing a consistent async interface for chat completions with tool support.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLMProvider (Abstract)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • chat(messages, tools, config, dispatcher, callback)   │   │
│  │  • chatStream(messages, tools, config, ...)              │   │
│  │  • isModelSupported(model)                               │   │
│  │  • supportedModels()                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  OpenAIProvider │  │AnthropicProvider│  │  OllamaProvider │
│                 │  │                 │  │                 │
│ • GPT-4         │  │ • Claude 3      │  │ • Llama 2       │
│ • GPT-3.5       │  │ • Claude 3.5    │  │ • Mistral       │
│ • GPT-4o        │  │ • Claude Opus   │  │ • Custom        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        HttpClient                                │
│              (Async HTTP requests via Dispatcher)                │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Message Types

```cpp
enum class Role {
  SYSTEM,     // System prompt
  USER,       // User message
  ASSISTANT,  // Assistant response
  TOOL        // Tool result
};

struct Message {
  Role role;
  std::string content;
  optional<std::string> tool_call_id;           // For TOOL role
  optional<std::vector<ToolCall>> tool_calls;   // For ASSISTANT with tools
};
```

### 2. Tool Specification

```cpp
struct ToolSpec {
  std::string name;
  std::string description;
  JsonValue parameters;  // JSON Schema
};

struct ToolCall {
  std::string id;        // Unique ID for matching results
  std::string name;      // Tool name
  JsonValue arguments;   // Arguments from LLM
};
```

### 3. LLM Configuration

```cpp
struct LLMConfig {
  std::string model;              // e.g., "gpt-4", "claude-3-opus"
  optional<double> temperature;   // 0.0 - 2.0
  optional<int> max_tokens;       // Max response tokens
  optional<double> top_p;         // Nucleus sampling
  optional<int> seed;             // For reproducibility
  std::chrono::milliseconds timeout{60000};
};
```

## Request Flow

```
┌──────────┐     ┌────────────┐     ┌──────────────┐     ┌─────────┐
│  Client  │────▶│ LLMProvider│────▶│  HttpClient  │────▶│ LLM API │
└──────────┘     └────────────┘     └──────────────┘     └─────────┘
     │                 │                   │                   │
     │  chat()         │                   │                   │
     │────────────────▶│                   │                   │
     │                 │  buildRequest()   │                   │
     │                 │──────────────────▶│                   │
     │                 │                   │  HTTP POST        │
     │                 │                   │──────────────────▶│
     │                 │                   │                   │
     │                 │                   │◀──────────────────│
     │                 │                   │  JSON Response    │
     │                 │◀──────────────────│                   │
     │                 │  parseResponse()  │                   │
     │◀────────────────│                   │                   │
     │  callback()     │                   │                   │
     │  LLMResponse    │                   │                   │
```

## Provider-Specific Message Conversion

### OpenAI Format

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "...", "tool_calls": [...]},
    {"role": "tool", "tool_call_id": "...", "content": "..."}
  ],
  "tools": [...]
}
```

### Anthropic Format

```json
{
  "model": "claude-3-opus-20240229",
  "system": "...",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": [
      {"type": "text", "text": "..."},
      {"type": "tool_use", "id": "...", "name": "...", "input": {...}}
    ]},
    {"role": "user", "content": [
      {"type": "tool_result", "tool_use_id": "...", "content": "..."}
    ]}
  ],
  "tools": [...]
}
```

## Example Usage

### Basic Chat

```cpp
#include "gopher/orch/llm/openai_provider.h"

using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// Create provider
auto provider = OpenAIProvider::create("sk-your-api-key");

// Configure request
LLMConfig config("gpt-4");
config.withTemperature(0.7).withMaxTokens(1000);

// Build messages
std::vector<Message> messages = {
    Message::system("You are a helpful assistant."),
    Message::user("What is the capital of France?")
};

// Make async request
provider->chat(messages, {}, config, dispatcher,
    [](Result<LLMResponse> result) {
        if (mcp::holds_alternative<LLMResponse>(result)) {
            auto& response = mcp::get<LLMResponse>(result);
            std::cout << "Response: " << response.message.content << std::endl;
            std::cout << "Tokens used: " << response.usage->total_tokens << std::endl;
        } else {
            auto& error = mcp::get<Error>(result);
            std::cerr << "Error: " << error.message << std::endl;
        }
    });
```

### Chat with Tools

```cpp
// Define tools
std::vector<ToolSpec> tools;

JsonValue weatherParams = JsonValue::object();
weatherParams["type"] = "object";
JsonValue props = JsonValue::object();
JsonValue locationProp = JsonValue::object();
locationProp["type"] = "string";
locationProp["description"] = "City name";
props["location"] = locationProp;
weatherParams["properties"] = props;
weatherParams["required"] = JsonValue::array();
weatherParams["required"].push_back("location");

tools.push_back(ToolSpec("get_weather", "Get current weather", weatherParams));

// Chat with tools
provider->chat(messages, tools, config, dispatcher,
    [](Result<LLMResponse> result) {
        if (mcp::holds_alternative<LLMResponse>(result)) {
            auto& response = mcp::get<LLMResponse>(result);

            if (response.hasToolCalls()) {
                // LLM wants to call tools
                for (const auto& call : response.toolCalls()) {
                    std::cout << "Tool call: " << call.name << std::endl;
                    std::cout << "Arguments: " << call.arguments.toString() << std::endl;
                }
            } else {
                // Final response
                std::cout << "Response: " << response.message.content << std::endl;
            }
        }
    });
```

### Using Anthropic Provider

```cpp
#include "gopher/orch/llm/anthropic_provider.h"

// Create with custom configuration
AnthropicConfig config("your-api-key");
config.withBaseUrl("https://api.anthropic.com")
      .withApiVersion("2023-06-01")
      .withBeta("tools-2024-04-04");

auto provider = AnthropicProvider::create(config);

// Use same interface as OpenAI
LLMConfig llmConfig("claude-3-5-sonnet-latest");
provider->chat(messages, tools, llmConfig, dispatcher, callback);
```

### Using Factory

```cpp
#include "gopher/orch/llm/llm_provider.h"

// Create via factory
ProviderConfig config(ProviderType::OPENAI);
config.withApiKey("sk-...")
      .withBaseUrl("https://custom-endpoint.com");

auto provider = createProvider(config);

// Or use convenience functions
auto openai = createOpenAIProvider("sk-...");
auto anthropic = createAnthropicProvider("ant-...");
auto ollama = createOllamaProvider("http://localhost:11434");
```

## Error Handling

```cpp
namespace LLMError {
  enum : int {
    OK = 0,
    INVALID_API_KEY = -100,
    RATE_LIMITED = -101,
    CONTEXT_LENGTH_EXCEEDED = -102,
    INVALID_MODEL = -103,
    CONTENT_FILTERED = -104,
    SERVICE_UNAVAILABLE = -105,
    NETWORK_ERROR = -106,
    PARSE_ERROR = -107,
    UNKNOWN = -199
  };
}

// Handle errors
provider->chat(messages, tools, config, dispatcher,
    [](Result<LLMResponse> result) {
        if (!mcp::holds_alternative<LLMResponse>(result)) {
            auto& error = mcp::get<Error>(result);
            switch (error.code) {
                case LLMError::RATE_LIMITED:
                    // Implement retry with backoff
                    break;
                case LLMError::INVALID_API_KEY:
                    // Check API key configuration
                    break;
                case LLMError::CONTEXT_LENGTH_EXCEEDED:
                    // Reduce message history
                    break;
            }
        }
    });
```

## Thread Safety

- All public methods must be called from the dispatcher thread
- Callbacks are invoked in the dispatcher thread context
- Provider instances can be shared across multiple calls
- Configuration should be done before making requests

## Extensibility

To add a new provider:

1. Create header `include/gopher/orch/llm/new_provider.h`
2. Implement `LLMProvider` interface
3. Handle provider-specific message/tool format conversion
4. Add factory function to `llm_provider.h`

```cpp
class NewProvider : public LLMProvider {
 public:
  std::string name() const override { return "new-provider"; }

  void chat(const std::vector<Message>& messages,
            const std::vector<ToolSpec>& tools,
            const LLMConfig& config,
            Dispatcher& dispatcher,
            ChatCallback callback) override {
    // Implementation
  }

  // ... other methods
};
```
