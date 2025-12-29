#pragma once

#ifndef BUILD_WITHOUT_GOPHER_MCP

// MCPServer - MCP protocol implementation of Server interface
//
// Wraps the gopher-mcp client to provide a protocol-agnostic Server interface.
// Supports stdio, HTTP+SSE, and WebSocket transports.
//
// Usage:
//   MCPServerConfig config;
//   config.name = "my-mcp-server";
//   config.transport = MCPServerConfig::StdioTransport{"npx", {"-y",
//   "server"}};
//
//   MCPServer::create(config, dispatcher, [](Result<MCPServerPtr> result) {
//       if (result.isOk()) {
//           auto server = result.value();
//           // Use server->tool("tool_name") to get a Runnable
//       }
//   });

#include <chrono>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "mcp/client/mcp_client.h"
#include "mcp/event/event_loop.h"
#include "mcp/types.h"

#include "gopher/orch/server/server.h"

namespace gopher {
namespace orch {
namespace server {

// Forward declaration
class MCPServer;
using MCPServerPtr = std::shared_ptr<MCPServer>;

// Configuration for MCP server connection
struct MCPServerConfig {
  std::string name;  // Human-readable name for this server

  // Stdio transport configuration
  // Used for subprocess-based MCP servers (most common)
  struct StdioTransport {
    std::string command;                     // Command to run
    std::vector<std::string> args;           // Command arguments
    std::map<std::string, std::string> env;  // Environment variables
    std::string working_directory;           // Working directory (optional)
  };

  // HTTP+SSE transport configuration
  // Used for network-based MCP servers
  struct HttpSseTransport {
    std::string url;  // Server URL (e.g., "http://localhost:8080")
    std::map<std::string, std::string> headers;  // HTTP headers
    bool verify_ssl = true;                      // Verify SSL certificates
  };

  // WebSocket transport configuration (future)
  struct WebSocketTransport {
    std::string url;                             // WebSocket URL
    std::map<std::string, std::string> headers;  // HTTP headers for upgrade
    bool verify_ssl = true;                      // Verify SSL certificates
  };

  // Transport configuration - one of the above
  // Use std::variant when C++17 is available, otherwise use tagged union
  // pattern
  enum class TransportType { STDIO, HTTP_SSE, WEBSOCKET };
  TransportType transport_type = TransportType::STDIO;
  StdioTransport stdio_transport;
  HttpSseTransport http_sse_transport;
  WebSocketTransport websocket_transport;

  // Connection timeouts
  std::chrono::milliseconds connect_timeout{30000};
  std::chrono::milliseconds request_timeout{60000};

  // Retry configuration for initial connection
  uint32_t max_connect_retries = 3;
  std::chrono::milliseconds retry_delay{1000};

  // Client info for MCP initialization
  std::string client_name = "gopher-orch";
  std::string client_version = "1.0.0";
};

// MCPServer - MCP protocol implementation of Server interface
//
// Thread Safety:
// - All public methods must be called from dispatcher thread
// - Callbacks are invoked in dispatcher thread context
// - connect() initiates async connection, callback when complete
//
// Lifecycle:
// - Create with MCPServer::create() factory method
// - connect() starts connection and protocol initialization
// - Once connected, use tool() to get Runnables for tools
// - disconnect() gracefully shuts down
class MCPServer : public Server {
 public:
  // Factory method - creates and optionally auto-connects
  //
  // If auto_connect is true (default), the server will start connecting
  // immediately and the callback is invoked when ready or on error.
  //
  // If auto_connect is false, the callback is invoked immediately with
  // the created server, and you must call connect() explicitly.
  static void create(const MCPServerConfig& config,
                     Dispatcher& dispatcher,
                     std::function<void(Result<MCPServerPtr>)> callback,
                     bool auto_connect = true);

  ~MCPServer() override;

  // Server interface implementation
  std::string id() const override { return id_; }
  std::string name() const override { return config_.name; }
  ConnectionState connectionState() const override { return state_; }

  void connect(Dispatcher& dispatcher, ConnectionCallback callback) override;
  void disconnect(Dispatcher& dispatcher,
                  std::function<void()> callback) override;

  void listTools(Dispatcher& dispatcher, ToolListCallback callback) override;

  JsonRunnablePtr tool(const std::string& name) override;

  void callTool(const std::string& name,
                const JsonValue& arguments,
                const RunnableConfig& config,
                Dispatcher& dispatcher,
                JsonCallback callback) override;

  // MCP-specific accessors

  // Server information from initialization response
  const mcp::Implementation& serverInfo() const { return server_info_; }

  // Server capabilities from initialization response
  const mcp::ServerCapabilities& capabilities() const { return capabilities_; }

  // Get the underlying MCP client (for advanced usage)
  mcp::client::McpClient* client() const { return client_.get(); }

 private:
  // Private constructor - use create() factory
  explicit MCPServer(const MCPServerConfig& config);

  // Initialize the MCP connection
  // Called after create() if auto_connect is true
  void initialize(Dispatcher& dispatcher,
                  std::function<void(Result<MCPServerPtr>)> callback);

  // Handle connection established
  void onConnected(Dispatcher& dispatcher,
                   std::function<void(Result<MCPServerPtr>)> callback);

  // Handle protocol initialization complete
  void onInitialized(Dispatcher& dispatcher,
                     const mcp::InitializeResult& init_result,
                     std::function<void(Result<MCPServerPtr>)> callback);

  // Handle tools listed
  void onToolsListed(const mcp::ListToolsResult& tools_result);

  // Convert MCP Tool to ToolInfo
  static ToolInfo toToolInfo(const mcp::Tool& tool);

  // Convert MCP content to JsonValue
  static JsonValue contentToJson(
      const std::vector<mcp::ExtendedContentBlock>& content);

  // Generate unique ID
  static std::string generateId();

  std::string id_;
  MCPServerConfig config_;
  ConnectionState state_ = ConnectionState::DISCONNECTED;

  std::unique_ptr<mcp::client::McpClient> client_;
  mcp::Implementation server_info_;
  mcp::ServerCapabilities capabilities_;

  // Cached tool information
  std::vector<ToolInfo> tools_;
  std::map<std::string, JsonRunnablePtr> tool_cache_;

  // Pending callbacks during connection
  std::vector<std::function<void()>> pending_on_connect_;
};

}  // namespace server
}  // namespace orch
}  // namespace gopher

#endif // BUILD_WITHOUT_GOPHER_MCP
