#pragma once

// Server - Protocol-agnostic server abstraction
//
// Defines a common interface for interacting with tool-providing servers
// regardless of the underlying protocol (MCP, REST, gRPC, mock, etc.)
//
// Key abstractions:
// - Server: Connection to a tool provider
// - ServerTool: A tool exposed by the server (implements Runnable)
// - ToolInfo: Metadata about a tool

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace server {

using namespace gopher::orch::core;

// Forward declarations
class Server;
class ServerTool;

using ServerPtr = std::shared_ptr<Server>;
using ServerToolPtr = std::shared_ptr<ServerTool>;

// Information about a tool exposed by a server
struct ToolInfo {
  std::string name;
  std::string description;
  JsonValue inputSchema;  // JSON Schema for tool arguments
  
  // Optional metadata for extended tool information
  optional<std::map<std::string, JsonValue>> metadata;

  ToolInfo() : inputSchema(JsonValue::object()) {}
  ToolInfo(const std::string& n, const std::string& desc = "")
      : name(n), description(desc), inputSchema(JsonValue::object()) {}
  
  // Initialize from JSON
  static Result<ToolInfo> fromJson(const JsonValue& json);
  
  // Serialize to JSON
  JsonValue toJson() const;
  
  // Equality operators for testing
  bool operator==(const ToolInfo& other) const;
  bool operator!=(const ToolInfo& other) const { return !(*this == other); }
};

// Connection state for server
enum class ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  RECONNECTING,
  FAILED
};

// Callback types
using ConnectionCallback = std::function<void(Result<std::nullptr_t>)>;
using ToolListCallback = std::function<void(Result<std::vector<ToolInfo>>)>;

// Server - Abstract interface for protocol-agnostic server access
//
// Implementations:
// - MockServer: For testing without network
// - MCPServer: For MCP protocol (stdio, SSE, WebSocket)
// - RESTServer: For REST API endpoints
class Server : public std::enable_shared_from_this<Server> {
 public:
  virtual ~Server() = default;

  // Unique identifier for this server instance
  virtual std::string id() const { return id_; }

  // Human-readable name
  virtual std::string name() const { return name_; }

  // Current connection state
  virtual ConnectionState connectionState() const = 0;

  // Check if connected
  bool isConnected() const {
    return connectionState() == ConnectionState::CONNECTED;
  }

  // Connect to the server (async)
  // Callback invoked in dispatcher context when connection completes or fails
  virtual void connect(Dispatcher& dispatcher, ConnectionCallback callback) = 0;

  // Disconnect from the server (async)
  virtual void disconnect(Dispatcher& dispatcher,
                          std::function<void()> callback = nullptr) = 0;

  // List available tools (async)
  // May return cached list if already connected
  virtual void listTools(Dispatcher& dispatcher, ToolListCallback callback) = 0;

  // Get a tool by name as a Runnable
  // Returns nullptr if tool not found
  virtual JsonRunnablePtr tool(const std::string& name) = 0;

  // Call a tool directly (convenience method)
  // Equivalent to tool(name)->invoke(...)
  virtual void callTool(const std::string& name,
                        const JsonValue& arguments,
                        const RunnableConfig& config,
                        Dispatcher& dispatcher,
                        JsonCallback callback) = 0;

  // Get shared pointer to this server
  ServerPtr shared() { return shared_from_this(); }

  // =========================================================================
  // JSON Serialization/Deserialization
  // =========================================================================

  // Serialize to JSON
  virtual JsonValue toJson() const;

  // Add tools from JSON array
  void addToolsFromJson(const JsonValue& toolsJson);

  // Get tools map (for subclasses that need direct access)
  const std::map<std::string, ToolInfo>& getTools() const { return tools_; }

 protected:
  Server() = default;
  Server(const std::string& name, const std::string& id = "")
      : name_(name), id_(id.empty() ? "server-" + name : id) {}

  // Common fields shared by all server implementations
  std::string name_;
  std::string id_;
  std::map<std::string, ToolInfo> tools_;

  // Add a tool to the server (for subclasses)
  void addTool(const ToolInfo& info) {
    tools_[info.name] = info;
  }
};

// ServerTool - A tool exposed by a server, implements Runnable
//
// Wraps a tool call through the server's protocol
class ServerTool : public JsonRunnable {
 public:
  ServerTool(ServerPtr server, const ToolInfo& info)
      : server_(std::move(server)), info_(info) {}

  std::string name() const override { return info_.name; }

  const ToolInfo& info() const { return info_; }

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    server_->callTool(info_.name, input, config, dispatcher,
                      std::move(callback));
  }

 private:
  ServerPtr server_;
  ToolInfo info_;
};

}  // namespace server
}  // namespace orch
}  // namespace gopher
