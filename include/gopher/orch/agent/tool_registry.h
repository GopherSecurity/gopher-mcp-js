#pragma once

// ToolRegistry - Unified tool management for agents
//
// Manages tools from multiple sources:
// - Local lambda functions
// - MCP servers (via Server interface)
// - REST endpoints (via JSON config)
// - JSON configuration files
//
// Provides tool specs for LLM and executes tool calls.
//
// Usage:
//   ToolRegistry registry;
//
//   // Option 1: Load from JSON config
//   registry.loadFromFile("tools.json", dispatcher, callback);
//
//   // Option 2: Add tools programmatically
//   registry.addTool("calculator", "Perform calculations", schema,
//       [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
//           // Implementation...
//       });
//
//   // Option 3: Add from MCP server
//   registry.addServer(mcpServer);
//
//   // Get specs for LLM
//   auto specs = registry.getToolSpecs();
//
//   // Execute tool call
//   registry.executeTool("calculator", args, dispatcher, callback);

#include <atomic>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"
#include "gopher/orch/llm/llm_types.h"
#include "gopher/orch/server/server.h"

// Forward declarations for config loading
namespace gopher {
namespace orch {
namespace agent {
struct ToolDefinition;
struct MCPServerDefinition;
struct RegistryConfig;
class ConfigLoader;
class RESTToolAdapter;
}  // namespace agent
}  // namespace orch
}  // namespace gopher

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;
using namespace gopher::orch::llm;
using namespace gopher::orch::server;

// Forward declaration
class ToolRegistry;
using ToolRegistryPtr = std::shared_ptr<ToolRegistry>;

// Tool execution function signature
using ToolFunction = std::function<void(const JsonValue& arguments,
                                        Dispatcher& dispatcher,
                                        JsonCallback callback)>;

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Convert ToolInfo (from Server) to ToolSpec (for LLM)
inline ToolSpec toToolSpec(const ToolInfo& info) {
  ToolSpec spec;
  spec.name = info.name;
  spec.description = info.description;
  spec.parameters = info.inputSchema;
  return spec;
}

// Convert ToolSpec (from LLM) to ToolInfo (for Server)
inline ToolInfo toToolInfo(const ToolSpec& spec) {
  ToolInfo info;
  info.name = spec.name;
  info.description = spec.description;
  info.inputSchema = spec.parameters;
  return info;
}

// Internal tool entry
struct ToolEntry {
  ToolSpec spec;
  ToolFunction function;
  ServerPtr server;  // nullptr for local tools
  std::string original_name;  // Original name on server (may differ from spec.name)

  bool isLocal() const { return server == nullptr; }
  bool isRemote() const { return server != nullptr; }
};

// ToolRegistry - Manages tools from multiple sources
//
// Thread Safety:
// - Configuration methods (addTool, addServer) should be called before use
// - executeTool and getToolSpecs are thread-safe after configuration
class ToolRegistry {
 public:
  using Ptr = std::shared_ptr<ToolRegistry>;

  ToolRegistry() = default;
  ~ToolRegistry() = default;

  // Factory
  static Ptr create() { return std::make_shared<ToolRegistry>(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  // Add a local tool with lambda function
  void addTool(const std::string& name,
               const std::string& description,
               const JsonValue& parameters,
               ToolFunction function) {
    std::lock_guard<std::mutex> lock(mutex_);

    ToolEntry entry;
    entry.spec.name = name;
    entry.spec.description = description;
    entry.spec.parameters = parameters;
    entry.function = std::move(function);
    entry.server = nullptr;

    tools_[name] = std::move(entry);
  }

  // Add a local tool with ToolSpec
  void addTool(const ToolSpec& spec, ToolFunction function) {
    addTool(spec.name, spec.description, spec.parameters, std::move(function));
  }

  // Add a synchronous tool (wraps in async callback)
  void addSyncTool(const std::string& name,
                   const std::string& description,
                   const JsonValue& parameters,
                   std::function<Result<JsonValue>(const JsonValue&)> function) {
    addTool(name, description, parameters,
            [func = std::move(function)](const JsonValue& args,
                                         Dispatcher& dispatcher,
                                         JsonCallback callback) {
              auto result = func(args);
              dispatcher.post([callback = std::move(callback),
                               result = std::move(result)]() {
                callback(std::move(result));
              });
            });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOTE TOOLS (MCP/REST Servers)
  // ═══════════════════════════════════════════════════════════════════════════

  // Add all tools from a server (async - fetches tool list)
  void addServer(ServerPtr server, Dispatcher& dispatcher) {
    if (!server) return;

    // Store server reference
    {
      std::lock_guard<std::mutex> lock(mutex_);
      servers_.push_back(server);
    }

    // List and register tools
    server->listTools(dispatcher, [this, server](Result<std::vector<ToolInfo>> result) {
      if (!mcp::holds_alternative<std::vector<ToolInfo>>(result)) return;

      std::lock_guard<std::mutex> lock(mutex_);
      for (const auto& info : mcp::get<std::vector<ToolInfo>>(result)) {
        ToolEntry entry;
        entry.spec = toToolSpec(info);  // Use conversion utility
        entry.server = server;
        entry.original_name = info.name;

        // Use prefixed name to avoid conflicts
        std::string prefixed_key = server->name() + ":" + info.name;
        tools_[prefixed_key] = entry;

        // Also register without prefix if no conflict
        if (tools_.find(info.name) == tools_.end()) {
          tools_[info.name] = entry;
        }
      }
    });
  }

  // Add all tools from a server (sync - provide tool list directly)
  void addServer(ServerPtr server, const std::vector<ToolInfo>& tools) {
    if (!server) return;

    std::lock_guard<std::mutex> lock(mutex_);
    servers_.push_back(server);

    for (const auto& info : tools) {
      ToolEntry entry;
      entry.spec = toToolSpec(info);
      entry.server = server;
      entry.original_name = info.name;

      std::string prefixed_key = server->name() + ":" + info.name;
      tools_[prefixed_key] = entry;

      if (tools_.find(info.name) == tools_.end()) {
        tools_[info.name] = entry;
      }
    }
  }

  // Add specific tool from a server with ToolInfo
  void addServerTool(ServerPtr server,
                     const ToolInfo& info,
                     const std::string& alias = "") {
    if (!server) return;

    std::lock_guard<std::mutex> lock(mutex_);

    ToolEntry entry;
    entry.spec = toToolSpec(info);
    if (!alias.empty()) {
      entry.spec.name = alias;  // Override name with alias
    }
    entry.server = server;
    entry.original_name = info.name;

    std::string key = alias.empty() ? info.name : alias;
    tools_[key] = std::move(entry);
  }

  // Add specific tool from a server by name (spec fetched later)
  void addServerTool(ServerPtr server,
                     const std::string& tool_name,
                     const std::string& alias = "") {
    if (!server) return;

    std::lock_guard<std::mutex> lock(mutex_);

    ToolEntry entry;
    entry.spec.name = alias.empty() ? tool_name : alias;
    entry.server = server;
    entry.original_name = tool_name;

    std::string key = alias.empty() ? tool_name : alias;
    tools_[key] = std::move(entry);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL ACCESS
  // ═══════════════════════════════════════════════════════════════════════════

  // Get tool specs for LLM
  std::vector<ToolSpec> getToolSpecs() const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<ToolSpec> specs;
    specs.reserve(tools_.size());

    for (const auto& pair : tools_) {
      specs.push_back(pair.second.spec);
    }

    return specs;
  }

  // Get a specific tool's spec
  optional<ToolSpec> getToolSpec(const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = tools_.find(name);
    if (it == tools_.end()) {
      return nullopt;
    }
    return it->second.spec;
  }

  // Get tool entry (for advanced usage)
  optional<ToolEntry> getToolEntry(const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = tools_.find(name);
    if (it == tools_.end()) {
      return nullopt;
    }
    return it->second;
  }

  // Check if tool exists
  bool hasTool(const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return tools_.find(name) != tools_.end();
  }

  // Get tool names
  std::vector<std::string> getToolNames() const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<std::string> names;
    names.reserve(tools_.size());

    for (const auto& pair : tools_) {
      names.push_back(pair.first);
    }

    return names;
  }

  // Get tool count
  size_t toolCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return tools_.size();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  // Execute a tool by name
  void executeTool(const std::string& name,
                   const JsonValue& arguments,
                   Dispatcher& dispatcher,
                   JsonCallback callback) {
    ToolEntry entry;

    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto it = tools_.find(name);
      if (it == tools_.end()) {
        dispatcher.post([callback = std::move(callback), name]() {
          callback(Result<JsonValue>(
              Error(-1, "Tool not found: " + name)));
        });
        return;
      }
      entry = it->second;
    }

    if (entry.isLocal()) {
      // Execute local function
      entry.function(arguments, dispatcher, std::move(callback));
    } else {
      // Execute on remote server using original name
      RunnableConfig config;
      std::string tool_name = entry.original_name.empty()
                                  ? entry.spec.name
                                  : entry.original_name;
      entry.server->callTool(tool_name, arguments, config, dispatcher,
                             std::move(callback));
    }
  }

  // Execute a ToolCall (convenience method)
  void executeToolCall(const ToolCall& call,
                       Dispatcher& dispatcher,
                       JsonCallback callback) {
    executeTool(call.name, call.arguments, dispatcher, std::move(callback));
  }

  // Execute multiple tool calls (optionally in parallel)
  void executeToolCalls(const std::vector<ToolCall>& calls,
                        bool parallel,
                        Dispatcher& dispatcher,
                        std::function<void(std::vector<Result<JsonValue>>)> callback) {
    if (calls.empty()) {
      dispatcher.post([callback = std::move(callback)]() {
        callback({});
      });
      return;
    }

    auto results = std::make_shared<std::vector<Result<JsonValue>>>(calls.size());
    auto pending = std::make_shared<std::atomic<int>>(calls.size());

    for (size_t i = 0; i < calls.size(); ++i) {
      executeToolCall(
          calls[i], dispatcher,
          [results, pending, i, callback](Result<JsonValue> result) {
            (*results)[i] = std::move(result);
            if (--(*pending) == 0) {
              callback(std::move(*results));
            }
          });

      // If not parallel, wait for completion before next call
      // Note: True sequential execution would require callback chaining
      // This is a simplified version that still executes in parallel
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // Remove a tool
  void removeTool(const std::string& name) {
    std::lock_guard<std::mutex> lock(mutex_);
    tools_.erase(name);
  }

  // Clear all tools
  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    tools_.clear();
    servers_.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIG LOADING (requires tool_definition.h, config_loader.h, rest_tool_adapter.h)
  // ═══════════════════════════════════════════════════════════════════════════

  // Load from JSON config file
  // Requires: #include "gopher/orch/agent/config_loader.h"
  //           #include "gopher/orch/agent/rest_tool_adapter.h"
  void loadFromFile(const std::string& path,
                    Dispatcher& dispatcher,
                    std::function<void(VoidResult)> callback);

  // Load from JSON string
  void loadFromString(const std::string& json_string,
                      Dispatcher& dispatcher,
                      std::function<void(VoidResult)> callback);

  // Load from RegistryConfig struct
  void loadConfig(const RegistryConfig& config,
                  Dispatcher& dispatcher,
                  std::function<void(VoidResult)> callback);

  // Register a tool from ToolDefinition
  VoidResult registerTool(const ToolDefinition& def,
                            Dispatcher& dispatcher);

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT VARIABLES
  // ═══════════════════════════════════════════════════════════════════════════

  // Set environment variable for ${VAR} substitution
  void setEnv(const std::string& name, const std::string& value) {
    std::lock_guard<std::mutex> lock(mutex_);
    env_vars_[name] = value;
  }

  // Load environment from .env file
  VoidResult loadEnvFile(const std::string& path);

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP SERVER MANAGEMENT (for config loading)
  // ═══════════════════════════════════════════════════════════════════════════

  // Add MCP server from definition
  void addMCPServer(const MCPServerDefinition& def,
                    Dispatcher& dispatcher,
                    std::function<void(VoidResult)> callback);

  // Get registered MCP server by name
  ServerPtr getMCPServer(const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = mcp_servers_.find(name);
    return it != mcp_servers_.end() ? it->second : nullptr;
  }

  // List registered MCP server names
  std::vector<std::string> getMCPServerNames() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> names;
    for (const auto& kv : mcp_servers_) {
      names.push_back(kv.first);
    }
    return names;
  }

 private:
  mutable std::mutex mutex_;
  std::map<std::string, ToolEntry> tools_;
  std::vector<ServerPtr> servers_;
  std::map<std::string, ServerPtr> mcp_servers_;  // Named MCP servers
  std::map<std::string, std::string> env_vars_;   // Environment variables
};

// Convenience function to create registry
inline ToolRegistryPtr makeToolRegistry() {
  return ToolRegistry::create();
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
