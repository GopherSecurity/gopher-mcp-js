// ToolRegistry Config Loading Implementation

#include "gopher/orch/agent/tool_registry.h"
#include "gopher/orch/agent/config_loader.h"
#include "gopher/orch/agent/rest_tool_adapter.h"
#include "gopher/orch/agent/tool_definition.h"

#ifdef GOPHER_ORCH_WITH_MCP
#include "gopher/orch/server/mcp_server.h"
#endif

namespace gopher {
namespace orch {
namespace agent {

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════════════════

void ToolRegistry::loadFromFile(const std::string& path,
                                 Dispatcher& dispatcher,
                                 std::function<void(Result<void>)> callback) {
  ConfigLoader loader;

  // Copy env vars to loader
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& kv : env_vars_) {
      loader.setEnv(kv.first, kv.second);
    }
  }

  auto result = loader.loadFromFile(path);
  if (!result.isOk()) {
    dispatcher.post([callback = std::move(callback), err = result.error()]() {
      callback(Result<void>::error(err));
    });
    return;
  }

  loadConfig(result.value(), dispatcher, std::move(callback));
}

void ToolRegistry::loadFromString(const std::string& json_string,
                                   Dispatcher& dispatcher,
                                   std::function<void(Result<void>)> callback) {
  ConfigLoader loader;

  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& kv : env_vars_) {
      loader.setEnv(kv.first, kv.second);
    }
  }

  auto result = loader.loadFromString(json_string);
  if (!result.isOk()) {
    dispatcher.post([callback = std::move(callback), err = result.error()]() {
      callback(Result<void>::error(err));
    });
    return;
  }

  loadConfig(result.value(), dispatcher, std::move(callback));
}

void ToolRegistry::loadConfig(const RegistryConfig& config,
                               Dispatcher& dispatcher,
                               std::function<void(Result<void>)> callback) {
  // Track pending MCP server connections
  auto pending = std::make_shared<std::atomic<size_t>>(config.mcp_servers.size());
  auto errors = std::make_shared<std::vector<std::string>>();
  auto self = this;
  auto config_copy = std::make_shared<RegistryConfig>(config);

  auto on_all_connected = [self, config_copy, callback, errors,
                           &dispatcher]() mutable {
    // Register tools after all MCP servers connected
    for (const auto& tool_def : config_copy->tools) {
      auto result = self->registerTool(tool_def, dispatcher);
      if (!result.isOk()) {
        errors->push_back("Tool " + tool_def.name + ": " +
                          result.error().message);
      }
    }

    if (!errors->empty()) {
      std::string error_msg = "Errors during config load:";
      for (const auto& e : *errors) {
        error_msg += "\n  - " + e;
      }
      callback(Result<void>::error(Error(-1, error_msg)));
    } else {
      callback(Result<void>::ok());
    }
  };

  if (config.mcp_servers.empty()) {
    dispatcher.post([on_all_connected]() mutable { on_all_connected(); });
    return;
  }

  // Connect to MCP servers
  for (const auto& server_def : config.mcp_servers) {
    addMCPServer(
        server_def, dispatcher,
        [pending, errors, on_all_connected, name = server_def.name](
            Result<void> result) mutable {
          if (!result.isOk()) {
            errors->push_back("MCP server " + name + ": " +
                              result.error().message);
          }

          if (--(*pending) == 0) {
            on_all_connected();
          }
        });
  }
}

Result<void> ToolRegistry::registerTool(const ToolDefinition& def,
                                         Dispatcher& dispatcher) {
  // Create ToolEntry from definition
  ToolEntry entry;
  entry.spec = def.toToolSpec();

  // Handle different tool types
  if (def.handler) {
    // Lambda handler
    entry.function = *def.handler;
  } else if (def.rest_endpoint) {
    // REST endpoint - create adapter
    auto adapter = std::make_shared<RESTToolAdapter>();

    // Copy env vars
    {
      std::lock_guard<std::mutex> lock(mutex_);
      for (const auto& kv : env_vars_) {
        adapter->setEnv(kv.first, kv.second);
      }
    }

    entry.function = adapter->createToolFunction(def);
    if (!entry.function) {
      return Result<void>::error(
          Error(-1, "Failed to create REST tool: " + def.name));
    }
  } else if (def.mcp_reference) {
    // MCP reference - proxy to MCP server
    const auto& ref = *def.mcp_reference;
    ServerPtr server = getMCPServer(ref.server_name);

    if (server) {
      entry.server = server;
      entry.original_name = ref.tool_name;
    } else {
      return Result<void>::error(
          Error(-1, "MCP server not found: " + ref.server_name));
    }
  } else {
    return Result<void>::error(
        Error(-1, "Tool has no handler, REST endpoint, or MCP reference: " +
                      def.name));
  }

  // Register the tool
  {
    std::lock_guard<std::mutex> lock(mutex_);
    tools_[def.name] = std::move(entry);
  }

  return Result<void>::ok();
}

Result<void> ToolRegistry::loadEnvFile(const std::string& path) {
  ConfigLoader loader;
  auto result = loader.loadEnvFile(path);
  if (!result.isOk()) {
    return result;
  }

  // Note: The loader only loads to its internal state
  // We need to read the file directly here
  std::ifstream file(path);
  if (!file.is_open()) {
    return Result<void>::error(Error(-1, "Cannot open .env file: " + path));
  }

  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#') continue;

    auto pos = line.find('=');
    if (pos == std::string::npos) continue;

    std::string key = line.substr(0, pos);
    std::string value = line.substr(pos + 1);

    // Trim
    while (!key.empty() && std::isspace(key.back())) key.pop_back();
    while (!key.empty() && std::isspace(key.front())) key.erase(0, 1);
    while (!value.empty() && std::isspace(value.back())) value.pop_back();
    while (!value.empty() && std::isspace(value.front())) value.erase(0, 1);

    // Remove quotes
    if (value.size() >= 2) {
      if ((value.front() == '"' && value.back() == '"') ||
          (value.front() == '\'' && value.back() == '\'')) {
        value = value.substr(1, value.size() - 2);
      }
    }

    if (!key.empty()) {
      setEnv(key, value);
    }
  }

  return Result<void>::ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP SERVER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

void ToolRegistry::addMCPServer(const MCPServerDefinition& def,
                                 Dispatcher& dispatcher,
                                 std::function<void(Result<void>)> callback) {
#ifdef GOPHER_ORCH_WITH_MCP
  using namespace gopher::orch::server;

  MCPServerConfig config;
  config.name = def.name;
  config.connect_timeout = def.connect_timeout;
  config.request_timeout = def.request_timeout;
  config.max_connect_retries = def.max_retries;

  // Configure transport
  switch (def.transport) {
    case MCPServerDefinition::TransportType::STDIO: {
      if (!def.stdio_config) {
        dispatcher.post([callback = std::move(callback)]() {
          callback(Result<void>::error(Error(-1, "STDIO config missing")));
        });
        return;
      }
      config.transport_type = MCPServerConfig::TransportType::STDIO;
      config.stdio_transport.command = def.stdio_config->command;
      config.stdio_transport.args = def.stdio_config->args;
      config.stdio_transport.env = def.stdio_config->env;
      config.stdio_transport.working_directory = def.stdio_config->working_directory;
      break;
    }

    case MCPServerDefinition::TransportType::HTTP_SSE: {
      if (!def.http_sse_config) {
        dispatcher.post([callback = std::move(callback)]() {
          callback(Result<void>::error(Error(-1, "HTTP-SSE config missing")));
        });
        return;
      }
      config.transport_type = MCPServerConfig::TransportType::HTTP_SSE;
      config.http_sse_transport.url = def.http_sse_config->url;
      config.http_sse_transport.headers = def.http_sse_config->headers;
      config.http_sse_transport.verify_ssl = def.http_sse_config->verify_ssl;
      break;
    }

    case MCPServerDefinition::TransportType::WEBSOCKET: {
      if (!def.websocket_config) {
        dispatcher.post([callback = std::move(callback)]() {
          callback(Result<void>::error(Error(-1, "WebSocket config missing")));
        });
        return;
      }
      config.transport_type = MCPServerConfig::TransportType::WEBSOCKET;
      config.websocket_transport.url = def.websocket_config->url;
      config.websocket_transport.headers = def.websocket_config->headers;
      config.websocket_transport.verify_ssl = def.websocket_config->verify_ssl;
      break;
    }
  }

  // Create and connect MCP server
  MCPServer::create(
      config, dispatcher,
      [this, name = def.name, callback = std::move(callback)](
          Result<MCPServerPtr> result) {
        if (!result.isOk()) {
          callback(Result<void>::error(result.error()));
          return;
        }

        auto server = result.value();

        // Store in registry
        {
          std::lock_guard<std::mutex> lock(mutex_);
          mcp_servers_[name] = server;
          servers_.push_back(server);
        }

        callback(Result<void>::ok());
      });
#else
  // MCP not available
  dispatcher.post([callback = std::move(callback)]() {
    callback(Result<void>::error(
        Error(-1, "MCP support not compiled (GOPHER_ORCH_WITH_MCP not defined)")));
  });
#endif
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
