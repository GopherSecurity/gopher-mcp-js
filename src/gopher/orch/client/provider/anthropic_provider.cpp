#include "gopher/orch/client/provider/anthropic_provider.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

JsonValue AnthropicProvider::transformTools(const std::vector<ToolPtr>& tools) {
    JsonValue toolsArray = JsonValue::array();
    
    for (const auto& tool : tools) {
        JsonValue toolDef = JsonValue::object();
        toolDef["name"] = tool->name();
        toolDef["description"] = tool->description();
        
        auto schema = tool->getSchema();
        // Claude expects input_schema with the parameters
        toolDef["input_schema"] = schema.parameters;
        
        toolsArray.push_back(toolDef);
    }
    
    return toolsArray;
}

Result<JsonValue> AnthropicProvider::handleToolCalls(
    const std::string& userId,
    const JsonValue& aiResponse,
    const std::unordered_map<std::string, ToolPtr>& tools
) {
    // Check for tool_calls in Claude response
    if (aiResponse.contains("content")) {
        return parseToolUseBlocks(aiResponse["content"], userId, tools);
    }
    
    return makeSuccess(JsonValue::array());
}

Result<JsonValue> AnthropicProvider::parseToolUseBlocks(
    const JsonValue& content,
    const std::string& userId,
    const std::unordered_map<std::string, ToolPtr>& tools
) {
    JsonValue results = JsonValue::array();
    
    if (content.isArray()) {
        for (size_t i = 0; i < content.size(); ++i) {
            const auto& item = content[i];
            
            // Look for tool_use blocks
            if (item.contains("type") && item["type"].getString() == "tool_use") {
                const std::string& toolName = item["name"].getString();
                const auto& params = item["input"];
                
                auto it = tools.find(toolName);
                if (it != tools.end()) {
                    // Execute the tool
                    auto result = it->second->execute(userId, params);
                    if (result.hasError()) {
                        return Result<JsonValue>(result.error());
                    }
                    
                    // Format result for Claude
                    JsonValue toolResult = JsonValue::object();
                    toolResult["tool_use_id"] = item["id"];
                    toolResult["content"] = result.value();
                    toolResult["is_error"] = false;
                    results.push_back(toolResult);
                } else {
                    // Tool not found
                    JsonValue errorResult = JsonValue::object();
                    errorResult["tool_use_id"] = item["id"];
                    errorResult["content"] = "Tool not found: " + toolName;
                    errorResult["is_error"] = true;
                    results.push_back(errorResult);
                }
            }
        }
    }
    
    return makeSuccess(results);
}

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher