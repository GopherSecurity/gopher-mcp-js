#pragma once

#include "gopher/orch/client/provider/provider_base.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

// Google/Gemini Provider
// Implements tool transformation for Google's Gemini function calling API
// Reference: https://ai.google.dev/docs/function_calling
class GoogleProvider : public Provider {
public:
    // Transform tools to Gemini's expected format
    // Gemini expects function declarations with specific schema
    JsonValue transformTools(const std::vector<ToolPtr>& tools) override;
    
    // Handle tool calls from Gemini's response
    // Gemini returns function_call objects
    Result<JsonValue> handleToolCalls(
        const std::string& userId,
        const JsonValue& aiResponse,
        const std::unordered_map<std::string, ToolPtr>& tools
    ) override;
    
    std::string name() const override { return "google"; }
    
    std::string version() const override { return "v1beta"; }
    
    bool supportsStreaming() const override { return true; }
    
    // Gemini supports up to 64 functions per request
    size_t maxToolsPerRequest() const override { return 64; }
    
private:
    // Helper to convert tool schema to Gemini format
    JsonValue convertToGeminiSchema(const ToolSchema& schema);
};

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher