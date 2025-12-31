# LLM Provider Examples for Gopher-Orch

This directory contains examples demonstrating how to use LLM (Large Language Model) providers with the gopher-orch framework.

## Available Examples

### 1. Simple Demo (`simple_llm_demo`)
A basic mock implementation that demonstrates the LLM provider concept without external dependencies.

```bash
./simple_llm_demo
```

**Features:**
- Mock LLM provider that echoes input
- Basic message structure (System, User, Assistant)
- Multi-turn conversation example

### 2. Anthropic Example (`anthropic_example`)
Demonstrates integration with Anthropic's Claude models.

```bash
export ANTHROPIC_API_KEY='your-api-key'  # Optional for real API
./anthropic_example
```

**Features:**
- Multiple Claude models (Opus, Sonnet, Haiku)
- System message handling
- Temperature control (creative vs deterministic)
- Token usage tracking
- Cost-optimized model selection

### 3. OpenAI Example (`openai_example`)
Shows how to use OpenAI's GPT models.

```bash
export OPENAI_API_KEY='sk-...'  # Optional for real API
export OPENAI_ORG_ID='org-...'  # Optional
./openai_example
```

**Features:**
- GPT-3.5 and GPT-4 models
- Function/tool calling capabilities
- Deterministic outputs with seed
- Extended context windows (16k, 32k)
- Token usage and cost tracking

### 4. Ollama Example (`ollama_example`)
Demonstrates local LLM execution using Ollama.

```bash
# First, install and start Ollama:
ollama serve
ollama pull llama2

# Then run the example:
./ollama_example
```

**Features:**
- Completely local execution (privacy-focused)
- Multiple model sizes (7B, 13B, 70B)
- No API costs or rate limits
- Embeddings generation
- Performance metrics (tokens/sec)
- GPU acceleration support

## Full Implementation Examples (Currently Disabled)

These examples demonstrate the complete integration but require the full API compatibility layer to be finished:

- `basic_chat_example.cpp` - Full async chat with all providers
- `tool_calling_example.cpp` - Function calling with calculator, weather, and search tools
- `streaming_example.cpp` - Real-time streaming responses
- `mcp_integration_example.cpp` - Integration with MCP servers for tool execution

## Building the Examples

### With CMake (Recommended)
```bash
cd /path/to/gopher-orch
mkdir build && cd build
cmake ..
make simple_llm_demo anthropic_example openai_example ollama_example
```

### Direct Compilation
```bash
g++ -std=c++14 -o simple_llm_demo simple_demo.cpp
g++ -std=c++14 -o anthropic_example anthropic_example.cpp
g++ -std=c++14 -o openai_example openai_example.cpp
g++ -std=c++14 -o ollama_example ollama_example.cpp
```

## Implementation Status

✅ **Completed:**
- Core types (Message, LLMConfig, LLMResponse)
- Provider interfaces for OpenAI, Anthropic, Ollama
- Tool/function calling structures
- Streaming support design
- Token usage tracking
- Multiple model configurations

🚧 **In Progress:**
- JSON API compatibility layer
- Async HTTP client integration
- Full streaming implementation
- MCP server integration

## Architecture Overview

The LLM provider system follows gopher-orch patterns:

```cpp
// Provider hierarchy
LLMProvider (base)
  ├── OpenAIProvider    (GPT models)
  ├── AnthropicProvider (Claude models)
  └── OllamaProvider    (Local models)

// Async pattern
provider->chat(messages, config, dispatcher,
    [](Result<LLMResponse> result) {
        // Handle response in dispatcher context
    });

// Composability
auto chain = makeLLMChain(provider, "You are a helpful assistant");
chain->pipe(summarizer)->pipe(translator);
```

## Quick Comparison

| Provider | Models | Strengths | Best For |
|----------|---------|-----------|----------|
| OpenAI | GPT-3.5, GPT-4 | • Function calling<br>• Large context (128k)<br>• Fast responses | General purpose, production apps |
| Anthropic | Claude 3 (Opus, Sonnet, Haiku) | • Strong reasoning<br>• Better safety<br>• 200k context | Complex analysis, research |
| Ollama | Llama2, Mistral, CodeLlama | • Complete privacy<br>• No costs<br>• Offline capable | Local development, sensitive data |

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_ORG_ID` - OpenAI organization ID (optional)
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `OLLAMA_HOST` - Ollama server URL (default: http://localhost:11434)
- `OLLAMA_MODEL` - Default Ollama model (default: llama2)

## Next Steps

1. **For Development**: Start with `ollama_example` for local testing without API costs
2. **For Production**: Use `openai_example` or `anthropic_example` with real API keys
3. **For Integration**: Review the full implementation examples to understand the complete async pattern

## License

These examples are part of the gopher-orch project and follow the same license terms.