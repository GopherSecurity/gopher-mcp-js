#pragma once

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include "gopher/orch/core/types.h"
#include "gopher/orch/client/tool.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

using namespace gopher::orch::core;

// Base class for AI framework providers
// Each AI provider (Anthropic, OpenAI, Google, etc.) implements this interface
// to adapt tools to their specific function calling format
class Provider {
public:
    virtual ~Provider() = default;
    
    // Convert tools to framework-specific format
    // Each AI has its own schema for function/tool definitions
    virtual JsonValue transformTools(const std::vector<ToolPtr>& tools) = 0;
    
    // Handle tool calls from AI response
    // Parse the AI's response and execute the requested tools
    virtual Result<JsonValue> handleToolCalls(
        const std::string& userId,
        const JsonValue& aiResponse,
        const std::unordered_map<std::string, ToolPtr>& tools
    ) = 0;
    
    // Get provider name for identification
    virtual std::string name() const = 0;
    
    // Get provider version
    virtual std::string version() const { return "1.0.0"; }
    
    // Check if provider supports streaming responses
    virtual bool supportsStreaming() const { return false; }
    
    // Get maximum number of tools this provider supports in one request
    virtual size_t maxToolsPerRequest() const { return 100; }
};

using ProviderPtr = std::shared_ptr<Provider>;

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher