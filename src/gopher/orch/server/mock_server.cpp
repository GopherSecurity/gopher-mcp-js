// MockServer implementation - JSON serialization and deserialization

#include "gopher/orch/server/mock_server.h"

namespace gopher {
namespace orch {
namespace server {

using namespace gopher::orch::core;

// Initialize from JSON
Result<std::shared_ptr<MockServer>> MockServer::fromJson(const JsonValue& json) {
  if (!json.isObject()) {
    return makeOrchError<std::shared_ptr<MockServer>>(
        OrchError::INVALID_ARGUMENT,
        "MockServer JSON must be an object");
  }

  // Required field: serverName
  if (!json.contains("serverName") || !json["serverName"].isString()) {
    return makeOrchError<std::shared_ptr<MockServer>>(
        OrchError::INVALID_ARGUMENT,
        "MockServer JSON must have a 'serverName' string field");
  }

  std::string serverName = json["serverName"].getString();
  
  // Optional field: id (defaults to "mock-{serverName}")
  std::string id;
  if (json.contains("id")) {
    if (!json["id"].isString()) {
      return makeOrchError<std::shared_ptr<MockServer>>(
          OrchError::INVALID_ARGUMENT,
          "MockServer 'id' field must be a string");
    }
    id = json["id"].getString();
  }

  // Create the MockServer
  auto server = std::make_shared<MockServer>(serverName, id);

  // Optional field: tools
  if (json.contains("tools")) {
    if (!json["tools"].isArray()) {
      return makeOrchError<std::shared_ptr<MockServer>>(
          OrchError::INVALID_ARGUMENT,
          "MockServer 'tools' field must be an array");
    }

    // Use the MockServer version which includes base + extensions
    server->addToolsFromJson(json["tools"]);
  }

  // Optional field: state (for restoring state from JSON)
  if (json.contains("state")) {
    if (!json["state"].isString()) {
      return makeOrchError<std::shared_ptr<MockServer>>(
          OrchError::INVALID_ARGUMENT,
          "MockServer 'state' field must be a string");
    }
    
    std::string stateStr = json["state"].getString();
    if (stateStr == "DISCONNECTED") {
      server->state_ = ConnectionState::DISCONNECTED;
    } else if (stateStr == "CONNECTING") {
      server->state_ = ConnectionState::CONNECTING;
    } else if (stateStr == "CONNECTED") {
      server->state_ = ConnectionState::CONNECTED;
    } else if (stateStr == "RECONNECTING") {
      server->state_ = ConnectionState::RECONNECTING;
    } else if (stateStr == "FAILED") {
      server->state_ = ConnectionState::FAILED;
    }
  }

  return makeSuccess(server);
}

// Serialize to JSON (includes MockServer-specific configs)
JsonValue MockServer::toJson() const {
  // Start with the base class JSON
  JsonValue result = Server::toJson();
  
  // Include state for completeness (optional)
  switch (state_) {
    case ConnectionState::DISCONNECTED:
      result["state"] = JsonValue("DISCONNECTED");
      break;
    case ConnectionState::CONNECTING:
      result["state"] = JsonValue("CONNECTING");
      break;
    case ConnectionState::CONNECTED:
      result["state"] = JsonValue("CONNECTED");
      break;
    case ConnectionState::RECONNECTING:
      result["state"] = JsonValue("RECONNECTING");
      break;
    case ConnectionState::FAILED:
      result["state"] = JsonValue("FAILED");
      break;
  }
  
  // Optional: Include tool configurations if they have been set
  // This is useful for debugging and testing
  JsonValue configsObj = JsonValue::object();
  bool hasConfigs = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& kv : configs_) {
      JsonValue configObj = JsonValue::object();
      const MockToolConfig& config = kv.second;
      
      if (config.response.has_value()) {
        configObj["response"] = config.response.value();
      }
      
      if (config.error.has_value()) {
        JsonValue errorObj = JsonValue::object();
        errorObj["code"] = JsonValue(config.error.value().code);
        errorObj["message"] = JsonValue(config.error.value().message);
        configObj["error"] = errorObj;
      }
      
      if (config.delay.count() > 0) {
        configObj["delayMs"] = JsonValue(static_cast<int>(config.delay.count()));
      }
      
      if (config.call_count > 0) {
        configObj["callCount"] = JsonValue(static_cast<int>(config.call_count));
      }
      
      if (config.last_arguments.has_value()) {
        configObj["lastArguments"] = config.last_arguments.value();
      }
      
      if (!configObj.empty()) {
        configsObj[kv.first] = configObj;
        hasConfigs = true;
      }
    }
  }
  
  if (hasConfigs) {
    result["configs"] = configsObj;
  }
  
  return result;
}

// Add tools from JSON array with MockServer-specific extensions
MockServer& MockServer::addToolsFromJson(const JsonValue& toolsJson) {
  // First use base class to add the tools
  Server::addToolsFromJson(toolsJson);
  
  // Now handle MockServer-specific extensions
  if (!toolsJson.isArray()) {
    return *this;  // Already validated in base class
  }
  
  for (size_t i = 0; i < toolsJson.size(); ++i) {
    const JsonValue& toolJson = toolsJson[i];
    
    if (!toolJson.isObject() || !toolJson.contains("name")) {
      continue;  // Skip invalid entries
    }
    
    std::string toolName = toolJson["name"].getString();
    
    // If the tool JSON has a "response" field, set it as the default response
    if (toolJson.contains("response")) {
      setResponse(toolName, toolJson["response"]);
    }
    
    // If the tool JSON has an "error" field, set it as the error response
    if (toolJson.contains("error")) {
      if (toolJson["error"].isObject() && 
          toolJson["error"].contains("code") &&
          toolJson["error"].contains("message")) {
        int code = toolJson["error"]["code"].getInt();
        std::string message = toolJson["error"]["message"].getString();
        setError(toolName, code, message);
      }
    }
    
    // If the tool JSON has a "delayMs" field, set the delay
    if (toolJson.contains("delayMs")) {
      if (toolJson["delayMs"].isInteger()) {
        int delayMs = toolJson["delayMs"].getInt();
        setDelay(toolName, std::chrono::milliseconds(delayMs));
      }
    }
  }
  
  return *this;
}

}  // namespace server
}  // namespace orch
}  // namespace gopher