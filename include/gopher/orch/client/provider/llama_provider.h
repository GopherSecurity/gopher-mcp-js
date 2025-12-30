#pragma once

#include "gopher/orch/client/provider/provider_base.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

// Llama/Meta Provider
// Implements tool transformation for Llama models with function calling
// Compatible with llama.cpp and other Llama implementations
class LlamaProvider : public Provider {
public:
    // Transform tools to Llama's expected format
    // Format depends on the specific implementation (llama.cpp, Ollama, etc.)
    JsonValue transformTools(const std::vector<ToolPtr>& tools) override;
    
    // Handle tool calls from Llama's response
    Result<JsonValue> handleToolCalls(
        const std::string& userId,
        const JsonValue& aiResponse,
        const std::unordered_map<std::string, ToolPtr>& tools
    ) override;
    
    std::string name() const override { return "llama"; }
    
    std::string version() const override { return "3.0"; }
    
    // Most Llama implementations don't support streaming with function calling
    bool supportsStreaming() const override { return false; }
    
    // Llama models typically support fewer functions due to context limits
    size_t maxToolsPerRequest() const override { return 32; }
    
private:
    // Helper to format tools in Llama's expected prompt format
    std::string formatToolsAsPrompt(const std::vector<ToolPtr>& tools);
};

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher