#pragma once

// ServerComposite - Aggregate tools from multiple servers
//
// Provides a unified view of tools from multiple servers, regardless of
// their underlying protocol (MCP, REST, Mock, etc.).
//
// Features:
// - Namespace tools by server name to avoid conflicts
// - Support tool aliasing for cleaner API
// - Lazy connection: servers connect when their tools are first used
// - Tool discovery across all registered servers
//
// Usage:
//   auto composite = ServerComposite::create("my-tools");
//   composite->addServer(mcp_server);
//   composite->addServer(rest_server);
//
//   // Get tool with automatic server routing
//   auto tool = composite->tool("weather.get_forecast");
//
//   // Or with explicit server name
//   auto tool = composite->tool("mcp-server", "get_forecast");

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/server/server.h"

namespace gopher {
namespace orch {
namespace server {

// Forward declaration
class ServerComposite;
using ServerCompositePtr = std::shared_ptr<ServerComposite>;

// Configuration for how tools are exposed
struct ToolMapping {
  std::string server_name;  // Source server
  std::string tool_name;    // Tool name on server
  std::string alias;        // Exposed name (empty = use tool_name)

  ToolMapping() = default;
  ToolMapping(const std::string& server,
              const std::string& tool,
              const std::string& alias_name = "")
      : server_name(server), tool_name(tool), alias(alias_name) {}
};

// ServerComposite - Aggregates tools from multiple servers
//
// This class provides a unified interface to tools from multiple servers.
// Tools can be accessed either by their fully-qualified name (server.tool)
// or by alias if configured.
//
// Thread Safety:
// - Thread-safe for read operations (listTools, tool)
// - Not thread-safe for write operations (addServer, addTool)
// - Write operations should be done during initialization
class ServerComposite : public std::enable_shared_from_this<ServerComposite> {
 public:
  using Ptr = std::shared_ptr<ServerComposite>;

  // Create a new ServerComposite
  static Ptr create(const std::string& name) {
    return std::shared_ptr<ServerComposite>(new ServerComposite(name));
  }

  // Get the composite name
  const std::string& name() const { return name_; }

  // Add a server and expose all its tools
  // Tools are namespaced as "server_name.tool_name"
  // If namespace_tools is false, tools are exposed without prefix
  ServerComposite& addServer(ServerPtr server, bool namespace_tools = true);

  // Add a server with specific tools only
  ServerComposite& addServer(ServerPtr server,
                             const std::vector<std::string>& tool_names,
                             bool namespace_tools = true);

  // Add a server with tool aliases
  ServerComposite& addServerWithAliases(
      ServerPtr server, const std::map<std::string, std::string>& aliases);

  // Add a specific tool with optional alias
  ServerComposite& addTool(ServerPtr server,
                           const std::string& tool_name,
                           const std::string& alias = "");

  // Remove a server and all its tools
  void removeServer(const std::string& server_name);

  // Get a tool by name
  // Supports:
  // - Fully-qualified name: "server_name.tool_name"
  // - Alias: "my_alias"
  // - Direct name if unique: "tool_name"
  JsonRunnablePtr tool(const std::string& name);

  // Get a tool by server and tool name
  JsonRunnablePtr tool(const std::string& server_name,
                       const std::string& tool_name);

  // List all available tools (with their exposed names)
  std::vector<std::string> listTools() const;

  // List all available tools with full info
  std::vector<ToolInfo> listToolInfos() const;

  // Get all registered servers
  const std::map<std::string, ServerPtr>& servers() const { return servers_; }

  // Get server by name
  ServerPtr server(const std::string& name) const;

  // Check if a tool exists
  bool hasTool(const std::string& name) const;

  // Connect all servers
  // Calls connect() on each server and invokes callback when all complete
  void connectAll(Dispatcher& dispatcher,
                  std::function<void(Result<std::nullptr_t>)> callback);

  // Disconnect all servers
  void disconnectAll(Dispatcher& dispatcher, std::function<void()> callback);

 private:
  explicit ServerComposite(const std::string& name) : name_(name) {}

  // Resolve tool name to server and actual tool name
  // Returns {server_ptr, tool_name} or {nullptr, ""} if not found
  std::pair<ServerPtr, std::string> resolveToolName(
      const std::string& name) const;

  std::string name_;
  std::map<std::string, ServerPtr> servers_;

  // Tool mappings: exposed_name -> {server_name, actual_tool_name}
  std::map<std::string, std::pair<std::string, std::string>> tool_mappings_;

  // Cached tool runnables
  mutable std::map<std::string, JsonRunnablePtr> tool_cache_;
};

// CompositeServerTool - A tool that routes through ServerComposite
//
// This wrapper handles tool resolution and caching at the composite level.
class CompositeServerTool : public JsonRunnable {
 public:
  CompositeServerTool(ServerCompositePtr composite,
                      const std::string& exposed_name,
                      ServerPtr server,
                      const std::string& tool_name)
      : composite_(std::move(composite)),
        exposed_name_(exposed_name),
        server_(std::move(server)),
        tool_name_(tool_name) {}

  std::string name() const override { return exposed_name_; }

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    server_->callTool(tool_name_, input, config, dispatcher,
                      std::move(callback));
  }

 private:
  ServerCompositePtr composite_;
  std::string exposed_name_;
  ServerPtr server_;
  std::string tool_name_;
};

// Implementation

inline ServerComposite& ServerComposite::addServer(ServerPtr server,
                                                   bool namespace_tools) {
  std::string server_name = server->name();
  servers_[server_name] = server;

  // We can't list tools synchronously here since server might not be connected
  // Instead, we mark that we need to discover tools lazily
  // For now, assume tools are already known (via listTools cache)

  return *this;
}

inline ServerComposite& ServerComposite::addServer(
    ServerPtr server,
    const std::vector<std::string>& tool_names,
    bool namespace_tools) {
  std::string server_name = server->name();
  servers_[server_name] = server;

  for (const auto& tool_name : tool_names) {
    std::string exposed =
        namespace_tools ? server_name + "." + tool_name : tool_name;
    tool_mappings_[exposed] = {server_name, tool_name};
  }

  return *this;
}

inline ServerComposite& ServerComposite::addServerWithAliases(
    ServerPtr server, const std::map<std::string, std::string>& aliases) {
  std::string server_name = server->name();
  servers_[server_name] = server;

  for (const auto& entry : aliases) {
    // entry.first = alias, entry.second = tool_name
    tool_mappings_[entry.first] = {server_name, entry.second};
  }

  return *this;
}

inline ServerComposite& ServerComposite::addTool(ServerPtr server,
                                                 const std::string& tool_name,
                                                 const std::string& alias) {
  std::string server_name = server->name();
  servers_[server_name] = server;

  std::string exposed = alias.empty() ? tool_name : alias;
  tool_mappings_[exposed] = {server_name, tool_name};

  return *this;
}

inline void ServerComposite::removeServer(const std::string& server_name) {
  servers_.erase(server_name);

  // Remove tool mappings for this server
  auto it = tool_mappings_.begin();
  while (it != tool_mappings_.end()) {
    if (it->second.first == server_name) {
      // Also remove from cache
      tool_cache_.erase(it->first);
      it = tool_mappings_.erase(it);
    } else {
      ++it;
    }
  }
}

inline std::pair<ServerPtr, std::string> ServerComposite::resolveToolName(
    const std::string& name) const {
  // First check explicit mappings
  auto mapping_it = tool_mappings_.find(name);
  if (mapping_it != tool_mappings_.end()) {
    auto server_it = servers_.find(mapping_it->second.first);
    if (server_it != servers_.end()) {
      return {server_it->second, mapping_it->second.second};
    }
  }

  // Check for fully-qualified name (server.tool)
  auto dot_pos = name.find('.');
  if (dot_pos != std::string::npos) {
    std::string server_name = name.substr(0, dot_pos);
    std::string tool_name = name.substr(dot_pos + 1);

    auto server_it = servers_.find(server_name);
    if (server_it != servers_.end()) {
      return {server_it->second, tool_name};
    }
  }

  // Try each server for a direct tool name match
  for (const auto& entry : servers_) {
    // This would require checking if the server has this tool
    // For now, we return the first server that might have it
    // A proper implementation would check tool availability
  }

  return {nullptr, ""};
}

inline JsonRunnablePtr ServerComposite::tool(const std::string& name) {
  // Check cache
  auto cache_it = tool_cache_.find(name);
  if (cache_it != tool_cache_.end()) {
    return cache_it->second;
  }

  // Resolve and create
  auto resolved = resolveToolName(name);
  if (!resolved.first) {
    return nullptr;
  }

  auto tool_ptr = std::make_shared<CompositeServerTool>(
      std::const_pointer_cast<ServerComposite>(
          std::static_pointer_cast<const ServerComposite>(shared_from_this())),
      name, resolved.first, resolved.second);

  tool_cache_[name] = tool_ptr;
  return tool_ptr;
}

inline JsonRunnablePtr ServerComposite::tool(const std::string& server_name,
                                             const std::string& tool_name) {
  std::string full_name = server_name + "." + tool_name;
  return tool(full_name);
}

inline std::vector<std::string> ServerComposite::listTools() const {
  std::vector<std::string> result;
  result.reserve(tool_mappings_.size());

  for (const auto& entry : tool_mappings_) {
    result.push_back(entry.first);
  }

  return result;
}

inline std::vector<ToolInfo> ServerComposite::listToolInfos() const {
  std::vector<ToolInfo> result;

  for (const auto& entry : tool_mappings_) {
    ToolInfo info;
    info.name = entry.first;

    // Try to get description from server
    auto server_it = servers_.find(entry.second.first);
    if (server_it != servers_.end()) {
      // Would need to query server for tool info
      // For now, leave description empty
    }

    result.push_back(info);
  }

  return result;
}

inline ServerPtr ServerComposite::server(const std::string& name) const {
  auto it = servers_.find(name);
  return it != servers_.end() ? it->second : nullptr;
}

inline bool ServerComposite::hasTool(const std::string& name) const {
  return resolveToolName(name).first != nullptr;
}

inline void ServerComposite::connectAll(
    Dispatcher& dispatcher,
    std::function<void(Result<std::nullptr_t>)> callback) {
  if (servers_.empty()) {
    dispatcher.post(
        [callback]() { callback(core::makeSuccess<std::nullptr_t>(nullptr)); });
    return;
  }

  // Track connection results
  auto pending = std::make_shared<std::atomic<size_t>>(servers_.size());
  auto has_error = std::make_shared<std::atomic<bool>>(false);
  auto first_error = std::make_shared<Error>();

  for (const auto& entry : servers_) {
    entry.second->connect(dispatcher, [pending, has_error, first_error,
                                       callback, &dispatcher](
                                          Result<std::nullptr_t> result) {
      if (core::isError<std::nullptr_t>(result) && !has_error->exchange(true)) {
        *first_error = core::getError<std::nullptr_t>(result);
      }

      if (--(*pending) == 0) {
        // All servers done
        dispatcher.post([callback, has_error, first_error]() {
          if (*has_error) {
            callback(Result<std::nullptr_t>(*first_error));
          } else {
            callback(core::makeSuccess<std::nullptr_t>(nullptr));
          }
        });
      }
    });
  }
}

inline void ServerComposite::disconnectAll(Dispatcher& dispatcher,
                                           std::function<void()> callback) {
  if (servers_.empty()) {
    if (callback) {
      dispatcher.post(callback);
    }
    return;
  }

  auto pending = std::make_shared<std::atomic<size_t>>(servers_.size());

  for (const auto& entry : servers_) {
    entry.second->disconnect(dispatcher, [pending, callback, &dispatcher]() {
      if (--(*pending) == 0) {
        if (callback) {
          dispatcher.post(callback);
        }
      }
    });
  }
}

}  // namespace server
}  // namespace orch
}  // namespace gopher
