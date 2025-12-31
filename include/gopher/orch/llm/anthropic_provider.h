#pragma once

#include "gopher/orch/llm/llm_provider.h"
#include "gopher/orch/api/async_api_engine.h"

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::api;

// ═══════════════════════════════════════════════════════════════════════
// ANTHROPIC CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

struct AnthropicConfig {
    std::string api_key;
    std::string base_url = "https://api.anthropic.com/v1";
    std::string anthropic_version = "2023-06-01";
    std::chrono::milliseconds timeout{120000};  // Claude can be slower
    int max_retries = 3;
    
    // Model defaults
    std::string default_model = "claude-3-opus-20240229";
    
    static AnthropicConfig fromEnv() {
        AnthropicConfig config;
        if (const char* key = std::getenv("ANTHROPIC_API_KEY")) {
            config.api_key = key;
        }
        if (const char* url = std::getenv("ANTHROPIC_BASE_URL")) {
            config.base_url = url;
        }
        return config;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// ANTHROPIC PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════

class AnthropicProvider : public LLMProvider {
public:
    explicit AnthropicProvider(const AnthropicConfig& config);
    explicit AnthropicProvider(const std::string& api_key);
    ~AnthropicProvider() override = default;
    
    std::string name() const override { return "anthropic"; }
    
    void listModels(
        Dispatcher& dispatcher,
        std::function<void(Result<std::vector<std::string>>)> callback) override;
    
    void chat(const std::vector<Message>& messages,
              const std::vector<ToolSpec>& tools,
              const LLMConfig& config,
              Dispatcher& dispatcher,
              std::function<void(Result<LLMResponse>)> callback) override;
    
    bool supportsStreaming() const override { return true; }
    
    void chatStream(const std::vector<Message>& messages,
                    const std::vector<ToolSpec>& tools,
                    const LLMConfig& config,
                    Dispatcher& dispatcher,
                    std::function<void(const StreamChunk&)> on_chunk,
                    std::function<void(Result<LLMResponse>)> on_complete) override;
    
    void healthCheck(Dispatcher& dispatcher,
                     std::function<void(Result<bool>)> callback) override;

private:
    // Convert our types to Anthropic API format
    JsonValue buildRequestBody(const std::vector<Message>& messages,
                                const std::vector<ToolSpec>& tools,
                                const LLMConfig& config) const;
    
    // Parse Anthropic response to our types
    Result<LLMResponse> parseResponse(const JsonValue& response) const;
    
    // Build headers for requests
    std::map<std::string, std::string> buildHeaders() const;
    
    // Error handling
    Result<LLMResponse> handleApiError(const ApiResponse& response) const;
    
    // Helper: Extract system message and format messages for Anthropic
    std::pair<std::string, std::vector<Message>> prepareMessages(
        const std::vector<Message>& messages) const;
    
    AnthropicConfig config_;
    std::shared_ptr<api::AsyncApiEngine> api_engine_;
};

// ═══════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

inline LLMProviderPtr makeAnthropicProvider(const std::string& api_key) {
    return std::make_shared<AnthropicProvider>(api_key);
}

inline LLMProviderPtr makeAnthropicProvider(const AnthropicConfig& config) {
    return std::make_shared<AnthropicProvider>(config);
}

inline LLMProviderPtr makeAnthropicProviderFromEnv() {
    return std::make_shared<AnthropicProvider>(AnthropicConfig::fromEnv());
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher