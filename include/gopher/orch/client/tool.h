#pragma once

#include <memory>
#include <string>
#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace client {

using namespace gopher::orch::core;

// Tool schema definition for AI function calling
struct ToolSchema {
    std::string name;
    std::string description;
    JsonValue parameters;  // JSON schema for parameters
    JsonValue response;    // Expected response schema
};

// Base class for all integration tools
class Tool {
public:
    Tool(const std::string& name, const std::string& description)
        : name_(name), description_(description) {}
    
    virtual ~Tool() = default;
    
    // Execute tool with parameters for a specific user
    virtual Result<JsonValue> execute(
        const std::string& userId,
        const JsonValue& params,
        const optional<std::string>& connectionId = nullopt
    ) = 0;
    
    // Get tool schema for AI function calling
    virtual ToolSchema getSchema() const {
        return {name_, description_, JsonValue::object(), JsonValue::object()};
    }
    
    const std::string& name() const { return name_; }
    const std::string& description() const { return description_; }
    
protected:
    std::string name_;
    std::string description_;
};

using ToolPtr = std::shared_ptr<Tool>;

}  // namespace client
}  // namespace orch
}  // namespace gopher