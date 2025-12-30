#include "gopher/orch/client/provider/google_provider.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

JsonValue GoogleProvider::transformTools(const std::vector<ToolPtr>& tools) {
    JsonValue functionsArray = JsonValue::array();
    
    for (const auto& tool : tools) {
        JsonValue functionDef = JsonValue::object();
        functionDef["name"] = tool->name();
        functionDef["description"] = tool->description();
        
        auto schema = tool->getSchema();
        // Convert to Gemini's expected format
        functionDef["parameters"] = convertToGeminiSchema(schema);
        
        functionsArray.push_back(functionDef);
    }
    
    // Gemini expects functions wrapped in a declaration
    JsonValue declaration = JsonValue::object();
    declaration["function_declarations"] = functionsArray;
    
    return declaration;
}

Result<JsonValue> GoogleProvider::handleToolCalls(
    const std::string& userId,
    const JsonValue& aiResponse,
    const std::unordered_map<std::string, ToolPtr>& tools
) {
    JsonValue results = JsonValue::array();
    
    // Check for function_call in Gemini response
    if (aiResponse.contains("candidates")) {
        const auto& candidates = aiResponse["candidates"];
        if (candidates.isArray() && candidates.size() > 0) {
            const auto& content = candidates[0]["content"];
            
            if (content.contains("parts")) {
                const auto& parts = content["parts"];
                if (parts.isArray()) {
                    for (size_t i = 0; i < parts.size(); ++i) {
                        const auto& part = parts[i];
                        
                        if (part.contains("functionCall")) {
                            const auto& functionCall = part["functionCall"];
                            const std::string& toolName = functionCall["name"].getString();
                            const auto& args = functionCall["args"];
                            
                            auto it = tools.find(toolName);
                            if (it != tools.end()) {
                                // Execute the tool
                                auto result = it->second->execute(userId, args);
                                if (result.hasError()) {
                                    // Error response for Gemini
                                    JsonValue errorResponse = JsonValue::object();
                                    errorResponse["functionResponse"] = JsonValue::object();
                                    errorResponse["functionResponse"]["name"] = toolName;
                                    errorResponse["functionResponse"]["response"] = JsonValue::object();
                                    errorResponse["functionResponse"]["response"]["error"] = result.error().message;
                                    results.push_back(errorResponse);
                                } else {
                                    // Success response for Gemini
                                    JsonValue functionResponse = JsonValue::object();
                                    functionResponse["functionResponse"] = JsonValue::object();
                                    functionResponse["functionResponse"]["name"] = toolName;
                                    functionResponse["functionResponse"]["response"] = result.value();
                                    results.push_back(functionResponse);
                                }
                            } else {
                                // Tool not found
                                JsonValue errorResponse = JsonValue::object();
                                errorResponse["functionResponse"] = JsonValue::object();
                                errorResponse["functionResponse"]["name"] = toolName;
                                errorResponse["functionResponse"]["response"] = JsonValue::object();
                                errorResponse["functionResponse"]["response"]["error"] = "Function not found: " + toolName;
                                results.push_back(errorResponse);
                            }
                        }
                    }
                }
            }
        }
    }
    
    return makeSuccess(results);
}

JsonValue GoogleProvider::convertToGeminiSchema(const ToolSchema& schema) {
    // Gemini expects a specific schema format
    // This would convert from our generic schema to Gemini's format
    JsonValue geminiSchema = JsonValue::object();
    
    if (schema.parameters.contains("type")) {
        geminiSchema["type"] = schema.parameters["type"];
    }
    
    if (schema.parameters.contains("properties")) {
        geminiSchema["properties"] = schema.parameters["properties"];
    }
    
    if (schema.parameters.contains("required")) {
        geminiSchema["required"] = schema.parameters["required"];
    }
    
    return geminiSchema;
}

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher