// Server base class implementation - JSON serialization

#include "gopher/orch/server/server.h"

namespace gopher {
namespace orch {
namespace server {

using namespace gopher::orch::core;

// Serialize to JSON
JsonValue Server::toJson() const {
  JsonValue result = JsonValue::object();
  
  // Always include serverName
  result["serverName"] = JsonValue(name_);
  
  // Include id if it's not the default
  std::string defaultId = "server-" + name_;
  if (id_ != defaultId) {
    result["id"] = JsonValue(id_);
  }
  
  // Include tools array
  JsonValue toolsArray = JsonValue::array();
  for (const auto& kv : tools_) {
    toolsArray.push_back(kv.second.toJson());
  }
  
  if (!toolsArray.empty()) {
    result["tools"] = toolsArray;
  }
  
  return result;
}

// Add tools from JSON array
void Server::addToolsFromJson(const JsonValue& toolsJson) {
  if (!toolsJson.isArray()) {
    throw std::invalid_argument("tools must be an array");
  }
  
  for (size_t i = 0; i < toolsJson.size(); ++i) {
    const JsonValue& toolJson = toolsJson[i];
    
    if (!toolJson.isObject()) {
      throw std::invalid_argument(
          "Tool at index " + std::to_string(i) + " must be an object");
    }
    
    // Parse as ToolInfo
    auto toolResult = ToolInfo::fromJson(toolJson);
    if (mcp::holds_alternative<Error>(toolResult)) {
      throw std::runtime_error(
          "Error parsing tool at index " + std::to_string(i) + ": " + 
          mcp::get<Error>(toolResult).message);
    }
    
    const ToolInfo& toolInfo = mcp::get<ToolInfo>(toolResult);
    addTool(toolInfo);
  }
}

}  // namespace server
}  // namespace orch
}  // namespace gopher