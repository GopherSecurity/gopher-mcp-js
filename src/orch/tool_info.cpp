// ToolInfo implementation - JSON serialization and deserialization

#include "gopher/orch/server/server.h"

namespace gopher {
namespace orch {
namespace server {

using namespace gopher::orch::core;

// Initialize from JSON
Result<ToolInfo> ToolInfo::fromJson(const JsonValue& json) {
  if (!json.isObject()) {
    return makeOrchError<ToolInfo>(
        OrchError::INVALID_ARGUMENT,
        "ToolInfo JSON must be an object");
  }
  
  ToolInfo info;
  
  // Required fields
  if (!json.contains("name") || !json["name"].isString()) {
    return makeOrchError<ToolInfo>(
        OrchError::INVALID_ARGUMENT,
        "ToolInfo JSON must have a 'name' string field");
  }
  info.name = json["name"].getString();
  
  // Optional fields with defaults
  if (json.contains("description")) {
    if (!json["description"].isString()) {
      return makeOrchError<ToolInfo>(
          OrchError::INVALID_ARGUMENT,
          "ToolInfo 'description' field must be a string");
    }
    info.description = json["description"].getString();
  }
  
  // Input schema - defaults to empty object if not provided
  if (json.contains("inputSchema")) {
    info.inputSchema = json["inputSchema"];
  } else {
    info.inputSchema = JsonValue::object();
  }
  
  // Optional metadata
  if (json.contains("metadata")) {
    if (!json["metadata"].isObject()) {
      return makeOrchError<ToolInfo>(
          OrchError::INVALID_ARGUMENT,
          "ToolInfo 'metadata' field must be an object");
    }
    
    std::map<std::string, JsonValue> metadata_map;
    const auto& metadata_obj = json["metadata"];
    for (const auto& key : metadata_obj.keys()) {
      metadata_map[key] = metadata_obj[key];
    }
    info.metadata = make_optional(std::move(metadata_map));
  }
  
  return makeSuccess(std::move(info));
}

// Serialize to JSON
JsonValue ToolInfo::toJson() const {
  JsonValue result = JsonValue::object();
  
  // Required fields
  result["name"] = JsonValue(name);
  result["description"] = JsonValue(description);
  
  // Input schema - only include if not empty
  if (!inputSchema.isNull() && 
      !(inputSchema.isObject() && inputSchema.empty())) {
    result["inputSchema"] = inputSchema;
  }
  
  // Optional metadata
  if (metadata.has_value()) {
    JsonValue metadata_obj = JsonValue::object();
    for (const auto& kv : metadata.value()) {
      metadata_obj[kv.first] = kv.second;
    }
    result["metadata"] = metadata_obj;
  }
  
  return result;
}

// Equality operator for testing
bool ToolInfo::operator==(const ToolInfo& other) const {
  // Compare basic fields
  if (name != other.name || description != other.description) {
    return false;
  }
  
  // Compare input schemas as JSON strings for deep equality
  if (inputSchema.toString() != other.inputSchema.toString()) {
    return false;
  }
  
  // Compare optional metadata
  if (metadata.has_value() != other.metadata.has_value()) {
    return false;
  }
  
  if (metadata.has_value()) {
    const auto& this_meta = metadata.value();
    const auto& other_meta = other.metadata.value();
    
    if (this_meta.size() != other_meta.size()) {
      return false;
    }
    
    for (const auto& kv : this_meta) {
      auto it = other_meta.find(kv.first);
      if (it == other_meta.end()) {
        return false;
      }
      if (kv.second.toString() != it->second.toString()) {
        return false;
      }
    }
  }
  
  return true;
}

}  // namespace server
}  // namespace orch
}  // namespace gopher