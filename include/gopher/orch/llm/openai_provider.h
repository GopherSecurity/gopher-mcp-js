#pragma once

#include "gopher/orch/llm/llm_provider.h"
#include "gopher/orch/api/async_api_engine.h"
#include <map>

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::api;

// ═══════════════════════════════════════════════════════════════════════
// OPENAI CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

struct OpenAIConfig {
    std::string api_key;
    std::string base_url = "https://api.openai.com/v1";
    std::string organization;  // Optional
    std::chrono::milliseconds timeout{60000};
    int max_retries = 3;
    
    // Model defaults
    std::string default_model = "gpt-4";
    
    // Rate limiting
    optional<int> requests_per_minute;
    optional<int> tokens_per_minute;
    
    static OpenAIConfig fromEnv() {
        OpenAIConfig config;
        if (const char* key = std::getenv("OPENAI_API_KEY")) {
            config.api_key = key;
        }
        if (const char* org = std::getenv("OPENAI_ORG_ID")) {
            config.organization = org;
        }
        if (const char* url = std::getenv("OPENAI_BASE_URL")) {
            config.base_url = url;
        }
        return config;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// OPENAI PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════

class OpenAIProvider : public LLMProvider {
public:
    explicit OpenAIProvider(const OpenAIConfig& config);
    explicit OpenAIProvider(const std::string& api_key);  // Convenience
    ~OpenAIProvider() override = default;
    
    std::string name() const override { return "openai"; }
    
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
    // Convert our types to OpenAI API format
    JsonValue buildRequestBody(const std::vector<Message>& messages,
                                const std::vector<ToolSpec>& tools,
                                const LLMConfig& config) const;
    
    // Parse OpenAI response to our types
    Result<LLMResponse> parseResponse(const JsonValue& response) const;
    Result<StreamChunk> parseStreamChunk(const std::string& data) const;
    
    // Build headers for requests
    std::map<std::string, std::string> buildHeaders() const;
    
    // Error handling
    Result<LLMResponse> handleApiError(const ApiResponse& response) const;
    
    OpenAIConfig config_;
    std::shared_ptr<api::AsyncApiEngine> api_engine_;
    
    // SSE parsing state for streaming
    mutable std::string stream_buffer_;
    mutable LLMResponse accumulated_response_;
};

// ═══════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

inline LLMProviderPtr makeOpenAIProvider(const std::string& api_key) {
    return std::make_shared<OpenAIProvider>(api_key);
}

inline LLMProviderPtr makeOpenAIProvider(const OpenAIConfig& config) {
    return std::make_shared<OpenAIProvider>(config);
}

inline LLMProviderPtr makeOpenAIProviderFromEnv() {
    return std::make_shared<OpenAIProvider>(OpenAIConfig::fromEnv());
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher