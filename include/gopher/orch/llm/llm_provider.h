#pragma once

// LLMProvider - Abstract interface for LLM providers
//
// Provides a unified async interface for interacting with various LLM providers
// (OpenAI, Anthropic, Ollama, etc.). Each provider implements this interface
// to handle provider-specific API details.
//
// Usage:
//   auto provider = OpenAIProvider::create(api_key);
//   LLMConfig config("gpt-4");
//   config.withTemperature(0.7);
//
//   provider->chat(messages, tools, config, dispatcher, [](Result<LLMResponse> r) {
//       if (r.isOk()) {
//           auto response = r.value();
//           // Handle response...
//       }
//   });

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"
#include "gopher/orch/llm/llm_types.h"

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::core;

// Forward declarations
class LLMProvider;
using LLMProviderPtr = std::shared_ptr<LLMProvider>;

// Callback types
using ChatCallback = std::function<void(Result<LLMResponse>)>;
using StreamCallback = std::function<void(const StreamChunk&)>;

// LLMProvider - Abstract base class for LLM providers
//
// Thread Safety:
// - All public methods must be called from dispatcher thread
// - Callbacks are invoked in dispatcher thread context
//
// Implementations:
// - OpenAIProvider: OpenAI API (GPT-4, GPT-3.5, etc.)
// - AnthropicProvider: Anthropic API (Claude models)
// - OllamaProvider: Local Ollama server
class LLMProvider {
 public:
  using Ptr = std::shared_ptr<LLMProvider>;

  virtual ~LLMProvider() = default;

  // Provider identification
  virtual std::string name() const = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════

  // Send a chat completion request
  //
  // Parameters:
  //   messages - Conversation history
  //   tools - Available tools (empty if no tools)
  //   config - Model configuration (model, temperature, etc.)
  //   dispatcher - Event dispatcher for async callback
  //   callback - Called with response or error
  //
  // The callback receives:
  //   - LLMResponse on success (may contain tool_calls if LLM wants to use tools)
  //   - Error on failure (network, auth, rate limit, etc.)
  virtual void chat(const std::vector<Message>& messages,
                    const std::vector<ToolSpec>& tools,
                    const LLMConfig& config,
                    Dispatcher& dispatcher,
                    ChatCallback callback) = 0;

  // Convenience overload without tools
  void chat(const std::vector<Message>& messages,
            const LLMConfig& config,
            Dispatcher& dispatcher,
            ChatCallback callback) {
    chat(messages, {}, config, dispatcher, std::move(callback));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING (Optional)
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if provider supports streaming
  virtual bool supportsStreaming() const { return false; }

  // Stream a chat completion request
  //
  // Parameters:
  //   messages - Conversation history
  //   tools - Available tools
  //   config - Model configuration
  //   dispatcher - Event dispatcher
  //   on_chunk - Called for each chunk received
  //   on_complete - Called when stream completes or errors
  //
  // Default implementation falls back to non-streaming chat
  virtual void chatStream(const std::vector<Message>& messages,
                          const std::vector<ToolSpec>& tools,
                          const LLMConfig& config,
                          Dispatcher& dispatcher,
                          StreamCallback on_chunk,
                          ChatCallback on_complete) {
    // Default: fall back to non-streaming
    chat(messages, tools, config, dispatcher, std::move(on_complete));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if a model is supported by this provider
  virtual bool isModelSupported(const std::string& model) const = 0;

  // Get list of supported models (may be empty if dynamic)
  virtual std::vector<std::string> supportedModels() const { return {}; }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Get current API endpoint (for debugging/logging)
  virtual std::string endpoint() const = 0;

  // Check if provider is properly configured (has API key, etc.)
  virtual bool isConfigured() const = 0;
};

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════════════════

// Provider types for factory
enum class ProviderType {
  OPENAI,
  ANTHROPIC,
  OLLAMA,
  CUSTOM
};

// Provider configuration
struct ProviderConfig {
  ProviderType type = ProviderType::OPENAI;
  std::string api_key;
  std::string base_url;  // Override default endpoint
  std::map<std::string, std::string> headers;  // Additional headers

  ProviderConfig() = default;
  explicit ProviderConfig(ProviderType t) : type(t) {}

  ProviderConfig& withApiKey(const std::string& key) {
    api_key = key;
    return *this;
  }

  ProviderConfig& withBaseUrl(const std::string& url) {
    base_url = url;
    return *this;
  }

  ProviderConfig& withHeader(const std::string& name, const std::string& value) {
    headers[name] = value;
    return *this;
  }
};

// Factory function to create providers
// Implemented in llm_factory.cpp
LLMProviderPtr createProvider(const ProviderConfig& config);

// Convenience factory functions
LLMProviderPtr createOpenAIProvider(const std::string& api_key,
                                     const std::string& base_url = "");
LLMProviderPtr createAnthropicProvider(const std::string& api_key,
                                        const std::string& base_url = "");
LLMProviderPtr createOllamaProvider(const std::string& base_url = "http://localhost:11434");

}  // namespace llm
}  // namespace orch
}  // namespace gopher
