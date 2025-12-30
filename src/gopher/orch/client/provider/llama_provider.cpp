#include "gopher/orch/client/provider/llama_provider.h"
#include <sstream>

namespace gopher {
namespace orch {
namespace client {
namespace provider {

JsonValue LlamaProvider::transformTools(const std::vector<ToolPtr>& tools) {
    // Llama models with function calling support (via llama.cpp or similar)
    // typically use a format similar to OpenAI but simpler
    JsonValue toolsArray = JsonValue::array();
    
    for (const auto& tool : tools) {
        JsonValue toolDef = JsonValue::object();
        toolDef["name"] = tool->name();
        toolDef["description"] = tool->description();
        
        auto schema = tool->getSchema();
        toolDef["parameters"] = schema.parameters;
        
        // Some Llama implementations support examples
        if (schema.response.isObject()) {
            toolDef["returns"] = schema.response;
        }
        
        toolsArray.push_back(toolDef);
    }
    
    return toolsArray;
}

Result<JsonValue> LlamaProvider::handleToolCalls(
    const std::string& userId,
    const JsonValue& aiResponse,
    const std::unordered_map<std::string, ToolPtr>& tools
) {
    JsonValue results = JsonValue::array();
    
    // Llama function calling format varies by implementation
    // Common format is to look for function calls in the response text
    // or in a structured format similar to OpenAI
    
    // Check if response contains function calls
    if (aiResponse.contains("function_call")) {
        const auto& functionCall = aiResponse["function_call"];
        const std::string& toolName = functionCall["name"].getString();
        const auto& arguments = functionCall["arguments"];
        
        auto it = tools.find(toolName);
        if (it != tools.end()) {
            // Execute the tool
            auto result = it->second->execute(userId, arguments);
            if (result.hasError()) {
                // Error result
                JsonValue errorResult = JsonValue::object();
                errorResult["name"] = toolName;
                errorResult["error"] = result.error().message;
                results.push_back(errorResult);
            } else {
                // Success result
                JsonValue toolResult = JsonValue::object();
                toolResult["name"] = toolName;
                toolResult["result"] = result.value();
                results.push_back(toolResult);
            }
        } else {
            // Tool not found
            JsonValue errorResult = JsonValue::object();
            errorResult["name"] = toolName;
            errorResult["error"] = "Function not found: " + toolName;
            results.push_back(errorResult);
        }
    }
    // Alternative: Parse function calls from text output
    else if (aiResponse.contains("content")) {
        // Some Llama implementations embed function calls in text
        // Format: <function>name(args)</function>
        // This would require text parsing - simplified here
        const std::string& content = aiResponse["content"].getString();
        
        // Look for function call patterns in the text
        // This is a simplified implementation
        // In production, you'd use regex or proper parsing
        if (content.find("<function>") != std::string::npos) {
            // Parse and execute function calls from text
            // Simplified - would need proper implementation
        }
    }
    
    return makeSuccess(results);
}

std::string LlamaProvider::formatToolsAsPrompt(const std::vector<ToolPtr>& tools) {
    // Format tools as part of the system prompt for Llama models
    // that don't have native function calling support
    std::stringstream prompt;
    
    prompt << "You have access to the following functions:\n\n";
    
    for (const auto& tool : tools) {
        prompt << "Function: " << tool->name() << "\n";
        prompt << "Description: " << tool->description() << "\n";
        
        auto schema = tool->getSchema();
        if (schema.parameters.contains("properties")) {
            prompt << "Parameters:\n";
            const auto& props = schema.parameters["properties"];
            // Would iterate through properties here
            prompt << "  (see schema for details)\n";
        }
        prompt << "\n";
    }
    
    prompt << "To call a function, use the format:\n";
    prompt << "<function>function_name({\"param1\": value1, \"param2\": value2})</function>\n";
    
    return prompt.str();
}

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher