// MCPServer implementation
//
// Wraps the gopher-mcp client to implement the protocol-agnostic Server interface.
// All callbacks are invoked in dispatcher thread context.

#include "gopher/orch/server/mcp_server.h"

#include <atomic>
#include <sstream>

namespace gopher {
namespace orch {
namespace server {

// Import orch core utilities
using namespace gopher::orch::core;

namespace {

// Atomic counter for generating unique IDs
std::atomic<uint64_t> g_id_counter{0};

// Helper to convert variant content to JsonValue for C++14
// Instead of std::visit (C++17), we use type checking and dispatching
template <typename T>
JsonValue contentToJsonSingle(const T& content);

template <>
JsonValue contentToJsonSingle(const mcp::TextContent& text) {
  JsonValue result = JsonValue::object();
  result["type"] = "text";
  result["text"] = text.text;
  return result;
}

template <>
JsonValue contentToJsonSingle(const mcp::ImageContent& image) {
  JsonValue result = JsonValue::object();
  result["type"] = "image";
  result["data"] = image.data;
  result["mimeType"] = image.mimeType;
  return result;
}

template <>
JsonValue contentToJsonSingle(const mcp::AudioContent& audio) {
  JsonValue result = JsonValue::object();
  result["type"] = "audio";
  result["data"] = audio.data;
  result["mimeType"] = audio.mimeType;
  return result;
}

template <>
JsonValue contentToJsonSingle(const mcp::ResourceLink& link) {
  JsonValue result = JsonValue::object();
  result["type"] = "resource_link";
  // ResourceLink inherits from Resource, so uri and name are direct members
  result["uri"] = link.uri;
  if (!link.name.empty()) {
    result["name"] = link.name;
  }
  return result;
}

template <>
JsonValue contentToJsonSingle(const mcp::EmbeddedResource& embedded) {
  JsonValue result = JsonValue::object();
  result["type"] = "embedded_resource";
  // EmbeddedResource has a nested resource member
  result["uri"] = embedded.resource.uri;
  if (!embedded.resource.name.empty()) {
    result["name"] = embedded.resource.name;
  }
  return result;
}

// Convert a single ExtendedContentBlock to JsonValue
// Uses mcp::holds_alternative and mcp::get for C++14 variant access
JsonValue extendedContentBlockToJson(const mcp::ExtendedContentBlock& block) {
  if (mcp::holds_alternative<mcp::TextContent>(block)) {
    return contentToJsonSingle(mcp::get<mcp::TextContent>(block));
  } else if (mcp::holds_alternative<mcp::ImageContent>(block)) {
    return contentToJsonSingle(mcp::get<mcp::ImageContent>(block));
  } else if (mcp::holds_alternative<mcp::AudioContent>(block)) {
    return contentToJsonSingle(mcp::get<mcp::AudioContent>(block));
  } else if (mcp::holds_alternative<mcp::ResourceLink>(block)) {
    return contentToJsonSingle(mcp::get<mcp::ResourceLink>(block));
  } else if (mcp::holds_alternative<mcp::EmbeddedResource>(block)) {
    return contentToJsonSingle(mcp::get<mcp::EmbeddedResource>(block));
  }
  return JsonValue::null();
}

}  // namespace

// Generate unique ID
std::string MCPServer::generateId() {
  std::ostringstream oss;
  oss << "mcp-server-" << ++g_id_counter;
  return oss.str();
}

// Constructor
MCPServer::MCPServer(const MCPServerConfig& config)
    : id_(generateId()), config_(config) {}

// Destructor
MCPServer::~MCPServer() {
  // Client cleanup is handled by unique_ptr
}

// Factory method
void MCPServer::create(const MCPServerConfig& config,
                       Dispatcher& dispatcher,
                       std::function<void(Result<MCPServerPtr>)> callback,
                       bool auto_connect) {
  // Create the server instance
  // We need to use a raw ptr temporarily then wrap in shared_ptr
  MCPServer* raw_server = new MCPServer(config);
  auto server = std::shared_ptr<MCPServer>(raw_server);

  if (auto_connect) {
    // Start connection process
    server->initialize(dispatcher, std::move(callback));
  } else {
    // Return immediately, user must call connect()
    MCPServerPtr server_copy = server;
    dispatcher.post([callback, server_copy]() {
      callback(makeSuccess(server_copy));
    });
  }
}

// Initialize connection
void MCPServer::initialize(
    Dispatcher& dispatcher,
    std::function<void(Result<MCPServerPtr>)> callback) {
  state_ = ConnectionState::CONNECTING;

  // Create MCP client configuration
  mcp::client::McpClientConfig client_config;
  client_config.client_name = config_.client_name;
  client_config.client_version = config_.client_version;
  client_config.request_timeout = config_.request_timeout;
  client_config.protocol_initialization_timeout = config_.connect_timeout;
  client_config.max_retries = config_.max_connect_retries;
  client_config.initial_retry_delay = config_.retry_delay;

  // Set transport type
  switch (config_.transport_type) {
    case MCPServerConfig::TransportType::STDIO:
      client_config.preferred_transport = mcp::TransportType::Stdio;
      break;
    case MCPServerConfig::TransportType::HTTP_SSE:
      client_config.preferred_transport = mcp::TransportType::HttpSse;
      break;
    case MCPServerConfig::TransportType::WEBSOCKET:
      client_config.preferred_transport = mcp::TransportType::WebSocket;
      break;
  }

  // Create the MCP client
  client_ = std::make_unique<mcp::client::McpClient>(client_config);

  // Build connection URI based on transport type
  std::string uri;
  switch (config_.transport_type) {
    case MCPServerConfig::TransportType::STDIO: {
      // For stdio, we need to construct the command URI
      // Format: stdio://<command>?arg1&arg2...
      std::ostringstream oss;
      oss << "stdio://" << config_.stdio_transport.command;
      if (!config_.stdio_transport.args.empty()) {
        oss << "?";
        for (size_t i = 0; i < config_.stdio_transport.args.size(); ++i) {
          if (i > 0) oss << "&";
          oss << config_.stdio_transport.args[i];
        }
      }
      uri = oss.str();
      break;
    }
    case MCPServerConfig::TransportType::HTTP_SSE:
      uri = config_.http_sse_transport.url;
      break;
    case MCPServerConfig::TransportType::WEBSOCKET:
      uri = config_.websocket_transport.url;
      break;
  }

  // Connect to the server
  mcp::VoidResult connect_result = client_->connect(uri);
  if (mcp::holds_alternative<mcp::Error>(connect_result)) {
    state_ = ConnectionState::FAILED;
    const mcp::Error& err = mcp::get<mcp::Error>(connect_result);
    callback(makeOrchError<MCPServerPtr>(
        OrchError::CONNECTION_FAILED,
        "Failed to connect to MCP server: " + err.message));
    return;
  }

  // Initialize protocol
  // Wrap future in shared_ptr to make lambda copyable for std::function
  // Note: MCP client returns std::future<T> not std::future<Result<T>>
  auto init_future_ptr = std::make_shared<std::future<mcp::InitializeResult>>(
      client_->initializeProtocol());

  // Capture self as shared_ptr
  // MCPServer inherits from Server which inherits from enable_shared_from_this<Server>
  MCPServer* this_ptr = this;
  auto self = std::shared_ptr<MCPServer>(
      std::static_pointer_cast<MCPServer>(this_ptr->Server::shared_from_this()));

  // We need to wait for the future in a non-blocking way
  // Post to dispatcher and handle result
  dispatcher.post([self, callback, init_future_ptr, &dispatcher]() {
    try {
      // Wait for and get the result - future throws on error
      mcp::InitializeResult init_result = init_future_ptr->get();
      self->onInitialized(dispatcher, init_result, callback);
    } catch (const std::exception& e) {
      self->state_ = ConnectionState::FAILED;
      callback(makeOrchError<MCPServerPtr>(
          OrchError::CONNECTION_FAILED,
          std::string("Failed to initialize MCP protocol: ") + e.what()));
    }
  });
}

// Handle protocol initialization complete
void MCPServer::onInitialized(
    Dispatcher& dispatcher,
    const mcp::InitializeResult& init_result,
    std::function<void(Result<MCPServerPtr>)> callback) {
  // Store server info and capabilities
  if (init_result.serverInfo) {
    server_info_ = *init_result.serverInfo;
  }
  capabilities_ = init_result.capabilities;

  // List available tools
  auto self = std::static_pointer_cast<MCPServer>(Server::shared_from_this());
  auto tools_future_ptr = std::make_shared<std::future<mcp::ListToolsResult>>(
      client_->listTools());

  dispatcher.post([self, callback, tools_future_ptr]() {
    try {
      mcp::ListToolsResult tools_result = tools_future_ptr->get();
      self->onToolsListed(tools_result);
      self->state_ = ConnectionState::CONNECTED;

      // Execute any pending callbacks
      for (auto& pending : self->pending_on_connect_) {
        pending();
      }
      self->pending_on_connect_.clear();

      callback(makeSuccess(self));
    } catch (const std::exception& e) {
      // Tools listing failed, but connection is still valid
      self->state_ = ConnectionState::CONNECTED;
      callback(makeSuccess(self));
    }
  });
}

// Handle tools listed
void MCPServer::onToolsListed(const mcp::ListToolsResult& tools_result) {
  tools_.clear();
  tools_.reserve(tools_result.tools.size());

  for (const auto& mcp_tool : tools_result.tools) {
    tools_.push_back(toToolInfo(mcp_tool));
  }
}

// Convert MCP Tool to ToolInfo
ToolInfo MCPServer::toToolInfo(const mcp::Tool& tool) {
  ToolInfo info;
  info.name = tool.name;
  if (tool.description) {
    info.description = *tool.description;
  }
  if (tool.inputSchema) {
    // Convert ToolInputSchema to JsonValue
    // The inputSchema is already JSON compatible
    info.inputSchema = JsonValue::object();
    // TODO: Proper conversion of input schema when needed
  }
  return info;
}

// Convert MCP content to JsonValue
JsonValue MCPServer::contentToJson(
    const std::vector<mcp::ExtendedContentBlock>& content) {
  if (content.empty()) {
    return JsonValue::null();
  }

  if (content.size() == 1) {
    return extendedContentBlockToJson(content[0]);
  }

  // Multiple content blocks - return as array
  JsonValue result = JsonValue::array();
  for (const auto& block : content) {
    result.push_back(extendedContentBlockToJson(block));
  }
  return result;
}

// Connect to the server
void MCPServer::connect(Dispatcher& dispatcher, ConnectionCallback callback) {
  if (state_ == ConnectionState::CONNECTED) {
    dispatcher.post(
        [callback]() { callback(makeSuccess<std::nullptr_t>(nullptr)); });
    return;
  }

  if (state_ == ConnectionState::CONNECTING) {
    // Already connecting, queue the callback
    pending_on_connect_.push_back([callback]() {
      callback(makeSuccess<std::nullptr_t>(nullptr));
    });
    return;
  }

  // Need to initialize
  auto self = std::static_pointer_cast<MCPServer>(Server::shared_from_this());
  initialize(dispatcher, [callback](Result<MCPServerPtr> result) {
    if (mcp::holds_alternative<MCPServerPtr>(result)) {
      callback(makeSuccess<std::nullptr_t>(nullptr));
    } else {
      callback(Result<std::nullptr_t>(mcp::get<Error>(result)));
    }
  });
}

// Disconnect from the server
void MCPServer::disconnect(Dispatcher& dispatcher,
                           std::function<void()> callback) {
  if (state_ == ConnectionState::DISCONNECTED) {
    if (callback) {
      dispatcher.post(callback);
    }
    return;
  }

  state_ = ConnectionState::DISCONNECTED;

  if (client_) {
    client_->disconnect();
  }

  if (callback) {
    dispatcher.post(callback);
  }
}

// List available tools
void MCPServer::listTools(Dispatcher& dispatcher, ToolListCallback callback) {
  if (!this->Server::isConnected()) {
    dispatcher.post([callback]() {
      callback(makeOrchError<std::vector<ToolInfo>>(
          OrchError::NOT_CONNECTED, "Server is not connected"));
    });
    return;
  }

  // Return cached tools if available
  if (!tools_.empty()) {
    auto tools_copy = tools_;
    dispatcher.post([callback, tools_copy]() {
      callback(makeSuccess(tools_copy));
    });
    return;
  }

  // Fetch tools from server
  auto self = std::static_pointer_cast<MCPServer>(Server::shared_from_this());
  auto tools_future_ptr = std::make_shared<std::future<mcp::ListToolsResult>>(
      client_->listTools());

  dispatcher.post([self, callback, tools_future_ptr]() {
    try {
      mcp::ListToolsResult tools_result = tools_future_ptr->get();
      self->onToolsListed(tools_result);
      callback(makeSuccess(self->tools_));
    } catch (const std::exception& e) {
      callback(makeOrchError<std::vector<ToolInfo>>(
          OrchError::INTERNAL_ERROR, e.what()));
    }
  });
}

// Get a tool by name as a Runnable
JsonRunnablePtr MCPServer::tool(const std::string& name) {
  // Check cache first
  auto it = tool_cache_.find(name);
  if (it != tool_cache_.end()) {
    return it->second;
  }

  // Find tool info
  ToolInfo info;
  bool found = false;
  for (const auto& t : tools_) {
    if (t.name == name) {
      info = t;
      found = true;
      break;
    }
  }

  if (!found) {
    // Create a placeholder tool info
    info.name = name;
  }

  // Create ServerTool wrapper
  auto tool_ptr = std::make_shared<ServerTool>(Server::shared_from_this(), info);
  tool_cache_[name] = tool_ptr;
  return tool_ptr;
}

// Call a tool directly
void MCPServer::callTool(const std::string& name,
                         const JsonValue& arguments,
                         const RunnableConfig& config,
                         Dispatcher& dispatcher,
                         JsonCallback callback) {
  (void)config;  // Config is handled internally by MCP client

  if (!this->Server::isConnected()) {
    dispatcher.post([callback]() {
      callback(makeOrchError<JsonValue>(
          OrchError::NOT_CONNECTED, "Server is not connected"));
    });
    return;
  }

  // Convert JsonValue to mcp::optional<mcp::Metadata>
  mcp::optional<mcp::Metadata> mcp_args;
  if (!arguments.isNull()) {
    // Create Metadata from JsonValue
    mcp_args = mcp::Metadata();
    // The arguments need to be copied to Metadata
    // For now, we'll pass an empty object; proper conversion needed
  }

  auto self = std::static_pointer_cast<MCPServer>(Server::shared_from_this());
  auto tool_future_ptr = std::make_shared<std::future<mcp::CallToolResult>>(
      client_->callTool(name, mcp_args));

  dispatcher.post([self, callback, tool_future_ptr]() {
    try {
      mcp::CallToolResult result = tool_future_ptr->get();
      if (result.isError) {
        // Tool returned an error
        JsonValue error_content = contentToJson(result.content);
        callback(makeOrchError<JsonValue>(
            OrchError::INTERNAL_ERROR, error_content.toString()));
      } else {
        // Success - convert content to JsonValue
        JsonValue json_result = contentToJson(result.content);
        callback(makeSuccess(json_result));
      }
    } catch (const std::exception& e) {
      callback(makeOrchError<JsonValue>(
          OrchError::INTERNAL_ERROR, e.what()));
    }
  });
}

}  // namespace server
}  // namespace orch
}  // namespace gopher
