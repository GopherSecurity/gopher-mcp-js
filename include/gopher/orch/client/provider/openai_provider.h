#pragma once

#include "gopher/orch/client/provider/provider_base.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

// OpenAI/GPT Provider
// Implements tool transformation for OpenAI's function calling API
// Reference: https://platform.openai.com/docs/guides/function-calling
class OpenAIProvider : public Provider {
public:
    // Transform tools to OpenAI's expected format
    // OpenAI expects: { type: "function", function: { name, description, parameters } }
    JsonValue transformTools(const std::vector<ToolPtr>& tools) override;
    
    // Handle tool calls from OpenAI's response
    // OpenAI returns tool_calls in the message object
    Result<JsonValue> handleToolCalls(
        const std::string& userId,
        const JsonValue& aiResponse,
        const std::unordered_map<std::string, ToolPtr>& tools
    ) override;
    
    std::string name() const override { return "openai"; }
    
    std::string version() const override { return "v1"; }
    
    bool supportsStreaming() const override { return true; }
    
    // OpenAI supports up to 128 functions per request
    size_t maxToolsPerRequest() const override { return 128; }
    
private:
    // Helper to parse function arguments from JSON string
    JsonValue parseArgumentsJson(const std::string& jsonStr);
    
    // Helper to format tool results for OpenAI
    JsonValue formatToolResults(const std::vector<JsonValue>& results);
};

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher