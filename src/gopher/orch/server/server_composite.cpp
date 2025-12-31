// ServerComposite implementation - JSON serialization and deserialization

#include "gopher/orch/server/server_composite.h"
#include <set>

namespace gopher {
namespace orch {
namespace server {

using namespace gopher::orch::core;

// Initialize from JSON
Result<ServerComposite::Ptr> ServerComposite::fromJson(const JsonValue& json) {
  if (!json.isObject()) {
    return makeOrchError<ServerComposite::Ptr>(
        OrchError::INVALID_ARGUMENT,
        "ServerComposite JSON must be an object");
  }

  // Required field: compositeName
  if (!json.contains("compositeName") || !json["compositeName"].isString()) {
    return makeOrchError<ServerComposite::Ptr>(
        OrchError::INVALID_ARGUMENT,
        "ServerComposite JSON must have a 'compositeName' string field");
  }

  std::string compositeName = json["compositeName"].getString();
  
  // Create the ServerComposite
  auto composite = ServerComposite::create(compositeName);

  // Optional field: servers
  if (json.contains("servers")) {
    if (!json["servers"].isArray()) {
      return makeOrchError<ServerComposite::Ptr>(
          OrchError::INVALID_ARGUMENT,
          "ServerComposite 'servers' field must be an array");
    }

    const JsonValue& serversArray = json["servers"];
    
    for (size_t i = 0; i < serversArray.size(); ++i) {
      const JsonValue& serverJson = serversArray[i];
      
      if (!serverJson.isObject()) {
        return makeOrchError<ServerComposite::Ptr>(
            OrchError::INVALID_ARGUMENT,
            "Server at index " + std::to_string(i) + " must be an object");
      }
      
      // Each server in the array should have serverName and optionally tools
      if (!serverJson.contains("serverName") || !serverJson["serverName"].isString()) {
        return makeOrchError<ServerComposite::Ptr>(
            OrchError::INVALID_ARGUMENT,
            "Server at index " + std::to_string(i) + " must have a 'serverName' string field");
      }
      
      // Create a MockServer from the JSON
      auto serverResult = MockServer::fromJson(serverJson);
      if (mcp::holds_alternative<Error>(serverResult)) {
        return makeOrchError<ServerComposite::Ptr>(
            mcp::get<Error>(serverResult).code,
            "Error creating server at index " + std::to_string(i) + ": " + 
            mcp::get<Error>(serverResult).message);
      }
      
      auto mockServer = mcp::get<std::shared_ptr<MockServer>>(serverResult);
      
      // Add the server to the composite
      // By default, namespace the tools
      composite->addServer(mockServer, true);
      
      // If there are specific tool names listed, register them explicitly
      if (serverJson.contains("tools") && serverJson["tools"].isArray()) {
        const JsonValue& toolsArray = serverJson["tools"];
        std::vector<std::string> toolNames;
        
        for (size_t j = 0; j < toolsArray.size(); ++j) {
          if (toolsArray[j].isObject() && toolsArray[j].contains("name")) {
            toolNames.push_back(toolsArray[j]["name"].getString());
          }
        }
        
        if (!toolNames.empty()) {
          // Re-add with specific tool names for explicit mapping
          composite->addServer(mockServer, toolNames, true);
        }
      }
    }
  }

  return makeSuccess(composite);
}

// Serialize to JSON
JsonValue ServerComposite::toJson() const {
  JsonValue result = JsonValue::object();
  
  // Always include compositeName
  result["compositeName"] = JsonValue(name_);
  
  // Include servers array
  JsonValue serversArray = JsonValue::array();
  
  // Group tools by server
  std::map<std::string, std::vector<std::pair<std::string, std::string>>> serverTools;
  
  // Collect tools for each server from the mappings
  for (const auto& mapping : tool_mappings_) {
    const std::string& exposedName = mapping.first;
    const std::string& serverName = mapping.second.first;
    const std::string& toolName = mapping.second.second;
    
    // Extract the original tool name (remove server prefix if present)
    std::string originalToolName = toolName;
    if (exposedName.find(serverName + ".") == 0) {
      // This is a namespaced tool, the actual tool name is after the dot
      originalToolName = toolName;
    }
    
    serverTools[serverName].push_back({originalToolName, exposedName});
  }
  
  // Create server objects
  for (const auto& serverEntry : servers_) {
    const std::string& serverName = serverEntry.first;
    ServerPtr server = serverEntry.second;
    
    JsonValue serverJson = JsonValue::object();
    serverJson["serverName"] = JsonValue(serverName);
    
    // If the server is a MockServer, we can get more detailed info
    if (auto mockServer = std::dynamic_pointer_cast<MockServer>(server)) {
      // Use MockServer's toJson but extract only what we need
      JsonValue mockJson = mockServer->toJson();
      
      // Extract tools if available
      if (mockJson.contains("tools")) {
        serverJson["tools"] = mockJson["tools"];
      }
    } else {
      // For non-mock servers, create tool entries from our mappings
      JsonValue toolsArray = JsonValue::array();
      
      auto it = serverTools.find(serverName);
      if (it != serverTools.end()) {
        // Create unique tool entries
        std::set<std::string> addedTools;
        
        for (const auto& toolPair : it->second) {
          const std::string& toolName = toolPair.first;
          
          if (addedTools.find(toolName) == addedTools.end()) {
            JsonValue toolJson = JsonValue::object();
            toolJson["name"] = JsonValue(toolName);
            // We don't have description for non-mock servers in the composite
            toolJson["description"] = JsonValue("");
            toolsArray.push_back(toolJson);
            addedTools.insert(toolName);
          }
        }
      }
      
      if (!toolsArray.empty()) {
        serverJson["tools"] = toolsArray;
      }
    }
    
    serversArray.push_back(serverJson);
  }
  
  if (!serversArray.empty()) {
    result["servers"] = serversArray;
  }
  
  return result;
}

}  // namespace server
}  // namespace orch
}  // namespace gopher