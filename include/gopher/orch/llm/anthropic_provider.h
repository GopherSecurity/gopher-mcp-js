#pragma once

// AnthropicProvider - Anthropic API implementation of LLMProvider
//
// Supports Anthropic's Messages API including tool use.
// Compatible with Claude models (claude-3-opus, claude-3-sonnet,
// claude-3-haiku, etc.)
//
// Usage:
//   auto provider = AnthropicProvider::create("sk-ant-...");
//
//   LLMConfig config("claude-3-5-sonnet-latest");
//   provider->chat(messages, tools, config, dispatcher, callback);

#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/llm/llm_provider.h"

namespace gopher {
namespace orch {
namespace llm {

// Forward declaration
class AnthropicProvider;
using AnthropicProviderPtr = std::shared_ptr<AnthropicProvider>;

// Anthropic-specific configuration
struct AnthropicConfig {
  std::string api_key;
  std::string base_url = "https://api.anthropic.com";
  std::string api_version = "2023-06-01";

  // Beta features
  bool enable_computer_use = false;
  std::vector<std::string> betas;  // Beta feature flags

  AnthropicConfig() = default;
  explicit AnthropicConfig(const std::string& key) : api_key(key) {}

  AnthropicConfig& withBaseUrl(const std::string& url) {
    base_url = url;
    return *this;
  }

  AnthropicConfig& withApiVersion(const std::string& version) {
    api_version = version;
    return *this;
  }

  AnthropicConfig& withBeta(const std::string& beta) {
    betas.push_back(beta);
    return *this;
  }

  AnthropicConfig& withComputerUse(bool enable = true) {
    enable_computer_use = enable;
    if (enable) {
      betas.push_back("computer-use-2024-10-22");
    }
    return *this;
  }
};

// AnthropicProvider - Anthropic API implementation
//
// Supported models:
// - claude-3-5-sonnet-latest, claude-3-5-sonnet-20241022
// - claude-3-5-haiku-latest, claude-3-5-haiku-20241022
// - claude-3-opus-20240229
// - claude-3-sonnet-20240229
// - claude-3-haiku-20240307
//
// Thread Safety:
// - Thread-safe after construction
// - All callbacks invoked in dispatcher context
class AnthropicProvider : public LLMProvider {
 public:
  using Ptr = std::shared_ptr<AnthropicProvider>;

  // Factory methods
  static Ptr create(const std::string& api_key);
  static Ptr create(const std::string& api_key, const std::string& base_url);
  static Ptr create(const AnthropicConfig& config);

  ~AnthropicProvider() override;

  // LLMProvider interface
  std::string name() const override { return "anthropic"; }

  void chat(const std::vector<Message>& messages,
            const std::vector<ToolSpec>& tools,
            const LLMConfig& config,
            Dispatcher& dispatcher,
            ChatCallback callback) override;

  bool supportsStreaming() const override { return true; }

  void chatStream(const std::vector<Message>& messages,
                  const std::vector<ToolSpec>& tools,
                  const LLMConfig& config,
                  Dispatcher& dispatcher,
                  StreamCallback on_chunk,
                  ChatCallback on_complete) override;

  bool isModelSupported(const std::string& model) const override;
  std::vector<std::string> supportedModels() const override;

  std::string endpoint() const override;
  bool isConfigured() const override;

 private:
  explicit AnthropicProvider(const AnthropicConfig& config);

  // Build request JSON (Anthropic format)
  JsonValue buildRequest(const std::vector<Message>& messages,
                         const std::vector<ToolSpec>& tools,
                         const LLMConfig& config,
                         bool stream = false) const;

  // Parse response JSON
  Result<LLMResponse> parseResponse(const JsonValue& response) const;

  // Convert Message to Anthropic format
  // Note: Anthropic separates system from messages
  std::pair<std::string, JsonValue> messagesToAnthropicFormat(
      const std::vector<Message>& messages) const;

  // Convert ToolSpec to Anthropic tool format
  JsonValue toolToJson(const ToolSpec& tool) const;

  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace llm
}  // namespace orch
}  // namespace gopher
