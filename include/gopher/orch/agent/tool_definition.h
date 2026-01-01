#pragma once

// Tool Definition Types - Configuration-driven tool definitions
//
// Provides structured types for defining tools from:
// - REST API endpoints
// - MCP server references
// - Lambda functions
//
// Supports JSON configuration with environment variable substitution.

#include <chrono>
#include <functional>
#include <map>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"
#include "gopher/orch/llm/llm_types.h"
#include "gopher/orch/server/rest_server.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;
using namespace gopher::orch::llm;
using namespace gopher::orch::server;

// ═══════════════════════════════════════════════════════════════════════════
// TOOL DEFINITION - Unified tool configuration
// ═══════════════════════════════════════════════════════════════════════════

struct ToolDefinition {
  std::string name;
  std::string description;
  JsonValue input_schema;  // JSON Schema for parameters

  // ─────────────────────────────────────────────────────────────────────────
  // Option 1: REST Endpoint
  // ─────────────────────────────────────────────────────────────────────────
  struct RESTEndpointToolDef {
    HttpMethod method = HttpMethod::GET;
    std::string url;  // Full URL or path (supports ${ENV_VAR})
    std::map<std::string, std::string> headers;

    // Parameter mapping (JSONPath-like expressions: $.field)
    std::map<std::string, std::string> query_params;  // {"q": "$.query"}
    std::map<std::string, std::string> path_params;   // {"id": "$.user_id"}
    std::map<std::string, std::string> body_mapping;  // For POST body

    // Response extraction
    std::string response_path;  // JSONPath to extract from response

    RESTEndpointToolDef() = default;
  };
  optional<RESTEndpointToolDef> rest_endpoint;

  // ─────────────────────────────────────────────────────────────────────────
  // Option 2: MCP Server Reference
  // ─────────────────────────────────────────────────────────────────────────
  struct ToolDef {
    std::string server_name;  // Name of registered MCP server
    std::string tool_name;    // Tool name on that server

    ToolDef() = default;
    ToolDef(const std::string& server, const std::string& tool)
        : server_name(server), tool_name(tool) {}
  };
  optional<ToolDef> mcp_reference;

  // ─────────────────────────────────────────────────────────────────────────
  // Option 3: Lambda/Function (programmatic only)
  // ─────────────────────────────────────────────────────────────────────────
  using Handler =
      std::function<void(const JsonValue&, Dispatcher&, JsonCallback)>;
  optional<Handler> handler;

  // Metadata
  std::vector<std::string> tags;
  bool require_approval = false;  // Human-in-the-loop

  ToolDefinition() = default;

  // Builder pattern
  ToolDefinition& withName(const std::string& n) {
    name = n;
    return *this;
  }

  ToolDefinition& withDescription(const std::string& desc) {
    description = desc;
    return *this;
  }

  ToolDefinition& withInputSchema(const JsonValue& schema) {
    input_schema = schema;
    return *this;
  }

  ToolDefinition& withRESTEndpoint(const RESTEndpointToolDef& ep) {
    rest_endpoint = ep;
    return *this;
  }

  ToolDefinition& withMCPReference(const std::string& server,
                                   const std::string& tool) {
    mcp_reference = ToolDef(server, tool);
    return *this;
  }

  ToolDefinition& withHandler(Handler h) {
    handler = std::move(h);
    return *this;
  }

  ToolDefinition& withTag(const std::string& tag) {
    tags.push_back(tag);
    return *this;
  }

  ToolDefinition& withApprovalRequired(bool required = true) {
    require_approval = required;
    return *this;
  }

  // Convert to ToolSpec for LLM
  ToolSpec toToolSpec() const {
    ToolSpec spec;
    spec.name = name;
    spec.description = description;
    spec.parameters = input_schema;
    return spec;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MCP SERVER DEFINITION - Remote MCP server configuration
// ═══════════════════════════════════════════════════════════════════════════

struct MCPServerDefinition {
  std::string name;

  enum class TransportType { STDIO, HTTP_SSE, WEBSOCKET };
  TransportType transport = TransportType::STDIO;

  // STDIO transport
  struct StdioConfig {
    std::string command;
    std::vector<std::string> args;
    std::map<std::string, std::string> env;
    std::string working_directory;

    StdioConfig() = default;
    StdioConfig(const std::string& cmd,
                const std::vector<std::string>& arguments = {})
        : command(cmd), args(arguments) {}
  };
  optional<StdioConfig> stdio_config;

  // HTTP-SSE transport
  struct HttpSseConfig {
    std::string url;
    std::map<std::string, std::string> headers;
    bool verify_ssl = true;

    HttpSseConfig() = default;
    explicit HttpSseConfig(const std::string& u) : url(u) {}
  };
  optional<HttpSseConfig> http_sse_config;

  // WebSocket transport
  struct WebSocketConfig {
    std::string url;
    std::map<std::string, std::string> headers;
    bool verify_ssl = true;

    WebSocketConfig() = default;
    explicit WebSocketConfig(const std::string& u) : url(u) {}
  };
  optional<WebSocketConfig> websocket_config;

  // Connection settings
  std::chrono::milliseconds connect_timeout{30000};
  std::chrono::milliseconds request_timeout{60000};
  uint32_t max_retries = 3;

  MCPServerDefinition() = default;
  explicit MCPServerDefinition(const std::string& n) : name(n) {}

  // Builder pattern for STDIO
  static MCPServerDefinition stdio(const std::string& name,
                                   const std::string& command,
                                   const std::vector<std::string>& args = {}) {
    MCPServerDefinition def(name);
    def.transport = TransportType::STDIO;
    def.stdio_config = StdioConfig(command, args);
    return def;
  }

  // Builder pattern for HTTP-SSE
  static MCPServerDefinition httpSse(const std::string& name,
                                     const std::string& url) {
    MCPServerDefinition def(name);
    def.transport = TransportType::HTTP_SSE;
    def.http_sse_config = HttpSseConfig(url);
    return def;
  }

  // Builder pattern for WebSocket
  static MCPServerDefinition websocket(const std::string& name,
                                       const std::string& url) {
    MCPServerDefinition def(name);
    def.transport = TransportType::WEBSOCKET;
    def.websocket_config = WebSocketConfig(url);
    return def;
  }

  MCPServerDefinition& withEnv(const std::string& key,
                               const std::string& value) {
    if (stdio_config) {
      stdio_config->env[key] = value;
    }
    return *this;
  }

  MCPServerDefinition& withHeader(const std::string& key,
                                  const std::string& value) {
    if (http_sse_config) {
      http_sse_config->headers[key] = value;
    } else if (websocket_config) {
      websocket_config->headers[key] = value;
    }
    return *this;
  }

  MCPServerDefinition& withTimeout(std::chrono::milliseconds timeout) {
    connect_timeout = timeout;
    request_timeout = timeout;
    return *this;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTH PRESET - Reusable authentication configuration
// ═══════════════════════════════════════════════════════════════════════════

struct AuthPreset {
  enum class Type { BEARER, API_KEY, BASIC };
  Type type = Type::BEARER;

  std::string value;                     // Token/key (supports ${ENV_VAR})
  std::string header = "Authorization";  // Header name for API_KEY

  AuthPreset() = default;

  static AuthPreset bearer(const std::string& token) {
    AuthPreset auth;
    auth.type = Type::BEARER;
    auth.value = token;
    return auth;
  }

  static AuthPreset apiKey(const std::string& key,
                           const std::string& header_name = "X-API-Key") {
    AuthPreset auth;
    auth.type = Type::API_KEY;
    auth.value = key;
    auth.header = header_name;
    return auth;
  }

  static AuthPreset basic(const std::string& credentials) {
    AuthPreset auth;
    auth.type = Type::BASIC;
    auth.value = credentials;
    return auth;
  }

  // Build header value
  std::string headerValue() const {
    switch (type) {
      case Type::BEARER:
        return "Bearer " + value;
      case Type::BASIC:
        return "Basic " + value;
      case Type::API_KEY:
        return value;
      default:
        return value;
    }
  }

  // Get header name
  std::string headerName() const {
    if (type == Type::API_KEY) {
      return header;
    }
    return "Authorization";
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY CONFIG - Complete configuration file structure
// ═══════════════════════════════════════════════════════════════════════════

struct RegistryConfig {
  std::string name = "tool-registry";
  std::string base_url;  // Default base URL for REST tools
  std::map<std::string, std::string> default_headers;

  // Authentication presets (reusable)
  std::map<std::string, AuthPreset> auth_presets;

  // MCP servers to connect
  std::vector<MCPServerDefinition> mcp_servers;

  // Tool definitions
  std::vector<ToolDefinition> tools;

  RegistryConfig() = default;
  explicit RegistryConfig(const std::string& n) : name(n) {}

  // Builder pattern
  RegistryConfig& withBaseUrl(const std::string& url) {
    base_url = url;
    return *this;
  }

  RegistryConfig& withHeader(const std::string& key, const std::string& value) {
    default_headers[key] = value;
    return *this;
  }

  RegistryConfig& withAuthPreset(const std::string& name,
                                 const AuthPreset& auth) {
    auth_presets[name] = auth;
    return *this;
  }

  RegistryConfig& withMCPServer(const MCPServerDefinition& server) {
    mcp_servers.push_back(server);
    return *this;
  }

  RegistryConfig& withTool(const ToolDefinition& tool) {
    tools.push_back(tool);
    return *this;
  }
};

}  // namespace agent
}  // namespace orch
}  // namespace gopher
