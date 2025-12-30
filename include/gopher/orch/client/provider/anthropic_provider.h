#pragma once

#include "gopher/orch/client/provider/provider_base.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

// Anthropic/Claude Provider
// Implements tool transformation for Claude's tool use API
// Reference: https://docs.anthropic.com/claude/docs/tool-use
class AnthropicProvider : public Provider {
public:
    // Transform tools to Claude's expected format
    // Claude expects: { name, description, input_schema }
    JsonValue transformTools(const std::vector<ToolPtr>& tools) override;
    
    // Handle tool calls from Claude's response
    // Claude returns tool_use blocks in the content array
    Result<JsonValue> handleToolCalls(
        const std::string& userId,
        const JsonValue& aiResponse,
        const std::unordered_map<std::string, ToolPtr>& tools
    ) override;
    
    std::string name() const override { return "anthropic"; }
    
    std::string version() const override { return "2024-02-15"; }
    
    bool supportsStreaming() const override { return true; }
    
    // Claude supports up to 64 tools per request
    size_t maxToolsPerRequest() const override { return 64; }
    
private:
    // Helper to parse Claude's tool_use content blocks
    Result<JsonValue> parseToolUseBlocks(
        const JsonValue& content,
        const std::string& userId,
        const std::unordered_map<std::string, ToolPtr>& tools
    );
};

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher