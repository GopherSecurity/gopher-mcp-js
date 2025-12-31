#pragma once

// ConfigLoader - Load tool registry configuration from JSON
//
// Supports:
// - JSON file loading
// - Environment variable substitution (${VAR_NAME})
// - Parsing of RegistryConfig, ToolDefinition, MCPServerDefinition
//
// Usage:
//   ConfigLoader loader;
//   loader.setEnv("API_KEY", "secret");
//
//   auto config = loader.loadFromFile("tools.json");
//   if (config.isOk()) {
//       registry->loadConfig(config.value(), dispatcher, callback);
//   }

#include <functional>
#include <map>
#include <regex>
#include <string>

#include "gopher/orch/agent/tool_definition.h"

namespace gopher {
namespace orch {
namespace agent {

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG LOADER
// ═══════════════════════════════════════════════════════════════════════════

class ConfigLoader {
 public:
  ConfigLoader() = default;

  // ─────────────────────────────────────────────────────────────────────────
  // Environment Variables
  // ─────────────────────────────────────────────────────────────────────────

  // Set environment variable for ${VAR} substitution
  void setEnv(const std::string& name, const std::string& value) {
    env_vars_[name] = value;
  }

  // Set multiple environment variables
  void setEnvMap(const std::map<std::string, std::string>& vars) {
    for (const auto& kv : vars) {
      env_vars_[kv.first] = kv.second;
    }
  }

  // Load environment from .env file
  Result<void> loadEnvFile(const std::string& path);

  // Substitute ${VAR_NAME} in string
  std::string substituteEnvVars(const std::string& input) const {
    std::string result = input;
    std::regex env_pattern("\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}");
    std::smatch match;

    while (std::regex_search(result, match, env_pattern)) {
      std::string var_name = match[1].str();
      std::string value;

      // Check our env vars first
      auto it = env_vars_.find(var_name);
      if (it != env_vars_.end()) {
        value = it->second;
      } else {
        // Fall back to system env
        const char* env_val = std::getenv(var_name.c_str());
        if (env_val) {
          value = env_val;
        }
      }

      result = result.replace(match.position(), match.length(), value);
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JSON Loading
  // ─────────────────────────────────────────────────────────────────────────

  // Load from file path
  Result<RegistryConfig> loadFromFile(const std::string& path);

  // Load from JSON string
  Result<RegistryConfig> loadFromString(const std::string& json_string);

  // Load from JsonValue
  Result<RegistryConfig> loadFromJson(const JsonValue& json);

  // ─────────────────────────────────────────────────────────────────────────
  // Parsing Helpers
  // ─────────────────────────────────────────────────────────────────────────

  // Parse individual definitions
  Result<ToolDefinition> parseToolDefinition(const JsonValue& json);
  Result<MCPServerDefinition> parseMCPServerDefinition(const JsonValue& json);
  Result<AuthPreset> parseAuthPreset(const JsonValue& json);

 private:
  // Parse HTTP method from string
  HttpMethod parseHttpMethod(const std::string& method) const;

  // Parse transport type from string
  MCPServerDefinition::TransportType parseTransportType(
      const std::string& transport) const;

  std::map<std::string, std::string> env_vars_;
};

// ═══════════════════════════════════════════════════════════════════════════
// INLINE IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════

inline HttpMethod ConfigLoader::parseHttpMethod(const std::string& method) const {
  if (method == "GET") return HttpMethod::GET;
  if (method == "POST") return HttpMethod::POST;
  if (method == "PUT") return HttpMethod::PUT;
  if (method == "PATCH") return HttpMethod::PATCH;
  if (method == "DELETE") return HttpMethod::DELETE_;
  if (method == "HEAD") return HttpMethod::HEAD;
  if (method == "OPTIONS") return HttpMethod::OPTIONS;
  return HttpMethod::GET;
}

inline MCPServerDefinition::TransportType ConfigLoader::parseTransportType(
    const std::string& transport) const {
  if (transport == "stdio") return MCPServerDefinition::TransportType::STDIO;
  if (transport == "http_sse" || transport == "http-sse" || transport == "sse")
    return MCPServerDefinition::TransportType::HTTP_SSE;
  if (transport == "websocket" || transport == "ws")
    return MCPServerDefinition::TransportType::WEBSOCKET;
  return MCPServerDefinition::TransportType::STDIO;
}

inline Result<AuthPreset> ConfigLoader::parseAuthPreset(const JsonValue& json) {
  AuthPreset auth;

  std::string type = json.value("type", "bearer");
  if (type == "bearer") {
    auth.type = AuthPreset::Type::BEARER;
  } else if (type == "api_key" || type == "apikey") {
    auth.type = AuthPreset::Type::API_KEY;
  } else if (type == "basic") {
    auth.type = AuthPreset::Type::BASIC;
  }

  auth.value = substituteEnvVars(json.value("value", ""));
  auth.header = json.value("header", "Authorization");

  return Result<AuthPreset>::ok(std::move(auth));
}

inline Result<MCPServerDefinition> ConfigLoader::parseMCPServerDefinition(
    const JsonValue& json) {
  MCPServerDefinition def;

  def.name = json.value("name", "");
  if (def.name.empty()) {
    return Result<MCPServerDefinition>::error(
        Error(-1, "MCP server definition missing 'name'"));
  }

  std::string transport = json.value("transport", "stdio");
  def.transport = parseTransportType(transport);

  // Parse transport-specific config
  switch (def.transport) {
    case MCPServerDefinition::TransportType::STDIO: {
      if (json.contains("stdio")) {
        const auto& stdio = json["stdio"];
        MCPServerDefinition::StdioConfig cfg;
        cfg.command = substituteEnvVars(stdio.value("command", ""));

        if (stdio.contains("args") && stdio["args"].is_array()) {
          for (const auto& arg : stdio["args"]) {
            cfg.args.push_back(substituteEnvVars(arg.get<std::string>()));
          }
        }

        if (stdio.contains("env") && stdio["env"].is_object()) {
          for (auto it = stdio["env"].begin(); it != stdio["env"].end(); ++it) {
            cfg.env[it.key()] = substituteEnvVars(it.value().get<std::string>());
          }
        }

        cfg.working_directory = stdio.value("working_directory", "");
        def.stdio_config = std::move(cfg);
      }
      break;
    }

    case MCPServerDefinition::TransportType::HTTP_SSE: {
      if (json.contains("http_sse")) {
        const auto& sse = json["http_sse"];
        MCPServerDefinition::HttpSseConfig cfg;
        cfg.url = substituteEnvVars(sse.value("url", ""));
        cfg.verify_ssl = sse.value("verify_ssl", true);

        if (sse.contains("headers") && sse["headers"].is_object()) {
          for (auto it = sse["headers"].begin(); it != sse["headers"].end(); ++it) {
            cfg.headers[it.key()] = substituteEnvVars(it.value().get<std::string>());
          }
        }

        def.http_sse_config = std::move(cfg);
      }
      break;
    }

    case MCPServerDefinition::TransportType::WEBSOCKET: {
      if (json.contains("websocket")) {
        const auto& ws = json["websocket"];
        MCPServerDefinition::WebSocketConfig cfg;
        cfg.url = substituteEnvVars(ws.value("url", ""));
        cfg.verify_ssl = ws.value("verify_ssl", true);

        if (ws.contains("headers") && ws["headers"].is_object()) {
          for (auto it = ws["headers"].begin(); it != ws["headers"].end(); ++it) {
            cfg.headers[it.key()] = substituteEnvVars(it.value().get<std::string>());
          }
        }

        def.websocket_config = std::move(cfg);
      }
      break;
    }
  }

  // Parse timeouts
  if (json.contains("connect_timeout_ms")) {
    def.connect_timeout = std::chrono::milliseconds(json["connect_timeout_ms"].get<int>());
  }
  if (json.contains("request_timeout_ms")) {
    def.request_timeout = std::chrono::milliseconds(json["request_timeout_ms"].get<int>());
  }
  if (json.contains("max_retries")) {
    def.max_retries = json["max_retries"].get<uint32_t>();
  }

  return Result<MCPServerDefinition>::ok(std::move(def));
}

inline Result<ToolDefinition> ConfigLoader::parseToolDefinition(
    const JsonValue& json) {
  ToolDefinition def;

  def.name = json.value("name", "");
  if (def.name.empty()) {
    return Result<ToolDefinition>::error(
        Error(-1, "Tool definition missing 'name'"));
  }

  def.description = json.value("description", "");

  if (json.contains("input_schema")) {
    def.input_schema = json["input_schema"];
  }

  // Parse REST endpoint
  if (json.contains("rest_endpoint")) {
    const auto& ep = json["rest_endpoint"];
    ToolDefinition::RESTEndpoint rest;

    rest.method = parseHttpMethod(ep.value("method", "GET"));
    rest.url = substituteEnvVars(ep.value("url", ""));

    if (ep.contains("headers") && ep["headers"].is_object()) {
      for (auto it = ep["headers"].begin(); it != ep["headers"].end(); ++it) {
        rest.headers[it.key()] = substituteEnvVars(it.value().get<std::string>());
      }
    }

    if (ep.contains("query_params") && ep["query_params"].is_object()) {
      for (auto it = ep["query_params"].begin(); it != ep["query_params"].end(); ++it) {
        rest.query_params[it.key()] = substituteEnvVars(it.value().get<std::string>());
      }
    }

    if (ep.contains("path_params") && ep["path_params"].is_object()) {
      for (auto it = ep["path_params"].begin(); it != ep["path_params"].end(); ++it) {
        rest.path_params[it.key()] = it.value().get<std::string>();
      }
    }

    if (ep.contains("body_mapping") && ep["body_mapping"].is_object()) {
      for (auto it = ep["body_mapping"].begin(); it != ep["body_mapping"].end(); ++it) {
        rest.body_mapping[it.key()] = it.value().get<std::string>();
      }
    }

    rest.response_path = ep.value("response_path", "");
    def.rest_endpoint = std::move(rest);
  }

  // Parse MCP reference
  if (json.contains("mcp_reference")) {
    const auto& ref = json["mcp_reference"];
    ToolDefinition::MCPReference mcp;
    mcp.server_name = ref.value("server_name", "");
    mcp.tool_name = ref.value("tool_name", "");
    def.mcp_reference = std::move(mcp);
  }

  // Parse tags
  if (json.contains("tags") && json["tags"].is_array()) {
    for (const auto& tag : json["tags"]) {
      def.tags.push_back(tag.get<std::string>());
    }
  }

  def.require_approval = json.value("require_approval", false);

  return Result<ToolDefinition>::ok(std::move(def));
}

inline Result<RegistryConfig> ConfigLoader::loadFromJson(const JsonValue& json) {
  RegistryConfig config;

  config.name = json.value("name", "tool-registry");
  config.base_url = substituteEnvVars(json.value("base_url", ""));

  // Parse default headers
  if (json.contains("default_headers") && json["default_headers"].is_object()) {
    for (auto it = json["default_headers"].begin();
         it != json["default_headers"].end(); ++it) {
      config.default_headers[it.key()] =
          substituteEnvVars(it.value().get<std::string>());
    }
  }

  // Parse auth presets
  if (json.contains("auth_presets") && json["auth_presets"].is_object()) {
    for (auto it = json["auth_presets"].begin();
         it != json["auth_presets"].end(); ++it) {
      auto auth_result = parseAuthPreset(it.value());
      if (auth_result.isOk()) {
        config.auth_presets[it.key()] = auth_result.value();
      }
    }
  }

  // Parse MCP servers
  if (json.contains("mcp_servers") && json["mcp_servers"].is_array()) {
    for (const auto& server_json : json["mcp_servers"]) {
      auto server_result = parseMCPServerDefinition(server_json);
      if (server_result.isOk()) {
        config.mcp_servers.push_back(std::move(server_result.value()));
      }
    }
  }

  // Parse tools
  if (json.contains("tools") && json["tools"].is_array()) {
    for (const auto& tool_json : json["tools"]) {
      auto tool_result = parseToolDefinition(tool_json);
      if (tool_result.isOk()) {
        config.tools.push_back(std::move(tool_result.value()));
      }
    }
  }

  return Result<RegistryConfig>::ok(std::move(config));
}

inline Result<RegistryConfig> ConfigLoader::loadFromString(
    const std::string& json_string) {
  try {
    JsonValue json = JsonValue::parse(json_string);
    return loadFromJson(json);
  } catch (const std::exception& e) {
    return Result<RegistryConfig>::error(
        Error(-1, std::string("JSON parse error: ") + e.what()));
  }
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
