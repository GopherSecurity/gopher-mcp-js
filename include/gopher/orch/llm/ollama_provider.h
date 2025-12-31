#pragma once

#include "gopher/orch/llm/llm_provider.h"
#include "gopher/orch/api/async_api_engine.h"

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::api;

// ═══════════════════════════════════════════════════════════════════════
// OLLAMA CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

struct OllamaConfig {
    std::string base_url = "http://localhost:11434";
    std::chrono::milliseconds timeout{300000};  // Local models can be slow
    
    // Model defaults
    std::string default_model = "llama2";
    
    // Ollama-specific options
    bool keep_alive = true;  // Keep model loaded in memory
    optional<int> num_ctx;   // Context window size
    optional<int> num_gpu;   // Number of GPUs to use
    
    static OllamaConfig fromEnv() {
        OllamaConfig config;
        if (const char* url = std::getenv("OLLAMA_HOST")) {
            config.base_url = url;
        }
        if (const char* model = std::getenv("OLLAMA_MODEL")) {
            config.default_model = model;
        }
        return config;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// OLLAMA PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════

class OllamaProvider : public LLMProvider {
public:
    explicit OllamaProvider(const OllamaConfig& config = OllamaConfig());
    ~OllamaProvider() override = default;
    
    std::string name() const override { return "ollama"; }
    
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
    
    // Ollama-specific methods
    void pullModel(const std::string& model_name,
                   Dispatcher& dispatcher,
                   std::function<void(const std::string&)> on_progress,
                   std::function<void(Result<bool>)> callback);
    
    void generateEmbeddings(const std::string& text,
                            const std::string& model,
                            Dispatcher& dispatcher,
                            std::function<void(Result<std::vector<float>>)> callback);

private:
    // Convert our types to Ollama API format
    JsonValue buildRequestBody(const std::vector<Message>& messages,
                                const std::vector<ToolSpec>& tools,
                                const LLMConfig& config) const;
    
    // Parse Ollama response to our types
    Result<LLMResponse> parseResponse(const JsonValue& response) const;
    
    // Build headers for requests
    std::map<std::string, std::string> buildHeaders() const;
    
    // Error handling
    Result<LLMResponse> handleApiError(const ApiResponse& response) const;
    
    // Helper: Convert tools to Ollama format (if supported)
    JsonValue convertToolsToOllamaFormat(const std::vector<ToolSpec>& tools) const;
    
    OllamaConfig config_;
    std::shared_ptr<api::AsyncApiEngine> api_engine_;
};

// ═══════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

inline LLMProviderPtr makeOllamaProvider() {
    return std::make_shared<OllamaProvider>();
}

inline LLMProviderPtr makeOllamaProvider(const OllamaConfig& config) {
    return std::make_shared<OllamaProvider>(config);
}

inline LLMProviderPtr makeOllamaProviderFromEnv() {
    return std::make_shared<OllamaProvider>(OllamaConfig::fromEnv());
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher