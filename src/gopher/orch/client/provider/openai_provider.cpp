#include "gopher/orch/client/provider/openai_provider.h"
#include <sstream>

namespace gopher {
namespace orch {
namespace client {
namespace provider {

JsonValue OpenAIProvider::transformTools(const std::vector<ToolPtr>& tools) {
    JsonValue toolsArray = JsonValue::array();
    
    for (const auto& tool : tools) {
        JsonValue toolDef = JsonValue::object();
        toolDef["type"] = "function";
        
        JsonValue function = JsonValue::object();
        function["name"] = tool->name();
        function["description"] = tool->description();
        
        auto schema = tool->getSchema();
        function["parameters"] = schema.parameters;
        
        // Add strict mode for better reliability (GPT-4 Turbo and later)
        function["strict"] = false;
        
        toolDef["function"] = function;
        toolsArray.push_back(toolDef);
    }
    
    return toolsArray;
}

Result<JsonValue> OpenAIProvider::handleToolCalls(
    const std::string& userId,
    const JsonValue& aiResponse,
    const std::unordered_map<std::string, ToolPtr>& tools
) {
    JsonValue results = JsonValue::array();
    
    // Check for tool_calls in OpenAI response
    if (aiResponse.contains("choices")) {
        const auto& choices = aiResponse["choices"];
        if (choices.isArray() && choices.size() > 0) {
            const auto& message = choices[0]["message"];
            
            if (message.contains("tool_calls")) {
                const auto& toolCalls = message["tool_calls"];
                if (toolCalls.isArray()) {
                    for (size_t i = 0; i < toolCalls.size(); ++i) {
                        const auto& call = toolCalls[i];
                        const auto& function = call["function"];
                        const std::string& toolName = function["name"].getString();
                        
                        // Parse arguments (OpenAI sends as JSON string)
                        JsonValue params = JsonValue::object();
                        if (function.contains("arguments")) {
                            // In production, would parse JSON string properly
                            // For now, assume it's already a JsonValue
                            params = function["arguments"];
                            if (params.isString()) {
                                // If it's a string, try to parse it
                                params = parseArgumentsJson(params.getString());
                            }
                        }
                        
                        auto it = tools.find(toolName);
                        if (it != tools.end()) {
                            // Execute the tool
                            auto result = it->second->execute(userId, params);
                            if (result.hasError()) {
                                // Return error in OpenAI format
                                JsonValue errorResult = JsonValue::object();
                                errorResult["tool_call_id"] = call["id"];
                                errorResult["role"] = "tool";
                                errorResult["content"] = "Error: " + result.error().message;
                                results.push_back(errorResult);
                            } else {
                                // Success result
                                JsonValue toolResult = JsonValue::object();
                                toolResult["tool_call_id"] = call["id"];
                                toolResult["role"] = "tool";
                                toolResult["content"] = result.value();
                                results.push_back(toolResult);
                            }
                        } else {
                            // Tool not found
                            JsonValue errorResult = JsonValue::object();
                            errorResult["tool_call_id"] = call["id"];
                            errorResult["role"] = "tool";
                            errorResult["content"] = "Tool not found: " + toolName;
                            results.push_back(errorResult);
                        }
                    }
                }
            }
        }
    }
    
    return makeSuccess(results);
}

JsonValue OpenAIProvider::parseArgumentsJson(const std::string& jsonStr) {
    // Simple JSON parsing - in production, use a proper JSON parser
    // For now, return an empty object
    // This would typically use nlohmann::json or similar
    return JsonValue::object();
}

JsonValue OpenAIProvider::formatToolResults(const std::vector<JsonValue>& results) {
    JsonValue formatted = JsonValue::array();
    for (const auto& result : results) {
        formatted.push_back(result);
    }
    return formatted;
}

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher