#pragma once

// OpenAIProvider - OpenAI API implementation of LLMProvider
//
// Supports OpenAI's chat completion API including function/tool calling.
// Compatible with OpenAI API and OpenAI-compatible endpoints (Azure, etc.)
//
// Usage:
//   auto provider = OpenAIProvider::create("sk-...");
//   // Or with custom endpoint:
//   auto provider = OpenAIProvider::create("sk-...",
//   "https://custom.endpoint.com/v1");
//
//   LLMConfig config("gpt-4");
//   provider->chat(messages, tools, config, dispatcher, callback);

#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/llm/llm_provider.h"

namespace gopher {
namespace orch {
namespace llm {

// Forward declaration
class OpenAIProvider;
using OpenAIProviderPtr = std::shared_ptr<OpenAIProvider>;

// OpenAI-specific configuration
struct OpenAIConfig {
  std::string api_key;
  std::string base_url = "https://api.openai.com/v1";
  std::string organization;  // Optional org ID

  // Azure OpenAI specific
  bool is_azure = false;
  std::string azure_api_version = "2024-02-15-preview";
  std::string azure_deployment;  // Deployment name for Azure

  OpenAIConfig() = default;
  explicit OpenAIConfig(const std::string& key) : api_key(key) {}

  OpenAIConfig& withBaseUrl(const std::string& url) {
    base_url = url;
    return *this;
  }

  OpenAIConfig& withOrganization(const std::string& org) {
    organization = org;
    return *this;
  }

  OpenAIConfig& forAzure(
      const std::string& deployment,
      const std::string& api_version = "2024-02-15-preview") {
    is_azure = true;
    azure_deployment = deployment;
    azure_api_version = api_version;
    return *this;
  }
};

// OpenAIProvider - OpenAI API implementation
//
// Supported models:
// - gpt-4, gpt-4-turbo, gpt-4o, gpt-4o-mini
// - gpt-3.5-turbo
// - o1, o1-mini, o1-preview (reasoning models)
//
// Thread Safety:
// - Thread-safe after construction
// - All callbacks invoked in dispatcher context
class OpenAIProvider : public LLMProvider {
 public:
  using Ptr = std::shared_ptr<OpenAIProvider>;

  // Factory methods
  static Ptr create(const std::string& api_key);
  static Ptr create(const std::string& api_key, const std::string& base_url);
  static Ptr create(const OpenAIConfig& config);

  ~OpenAIProvider() override;

  // LLMProvider interface
  std::string name() const override { return "openai"; }

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

  // OpenAI-specific methods

  // Get/set organization ID
  std::string organization() const;
  void setOrganization(const std::string& org);

 private:
  explicit OpenAIProvider(const OpenAIConfig& config);

  // Build request JSON
  JsonValue buildRequest(const std::vector<Message>& messages,
                         const std::vector<ToolSpec>& tools,
                         const LLMConfig& config,
                         bool stream = false) const;

  // Parse response JSON
  Result<LLMResponse> parseResponse(const JsonValue& response) const;

  // Parse streaming chunk
  Result<StreamChunk> parseStreamChunk(const std::string& data) const;

  // Convert Message to OpenAI format
  JsonValue messageToJson(const Message& msg) const;

  // Convert ToolSpec to OpenAI function format
  JsonValue toolToJson(const ToolSpec& tool) const;

  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace llm
}  // namespace orch
}  // namespace gopher
