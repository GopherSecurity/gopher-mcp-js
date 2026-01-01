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
  VoidResult loadEnvFile(const std::string& path);

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

inline HttpMethod ConfigLoader::parseHttpMethod(
    const std::string& method) const {
  if (method == "GET")
    return HttpMethod::GET;
  if (method == "POST")
    return HttpMethod::POST;
  if (method == "PUT")
    return HttpMethod::PUT;
  if (method == "PATCH")
    return HttpMethod::PATCH;
  if (method == "DELETE")
    return HttpMethod::DELETE_;
  if (method == "HEAD")
    return HttpMethod::HEAD;
  if (method == "OPTIONS")
    return HttpMethod::OPTIONS;
  return HttpMethod::GET;
}

inline MCPServerDefinition::TransportType ConfigLoader::parseTransportType(
    const std::string& transport) const {
  if (transport == "stdio")
    return MCPServerDefinition::TransportType::STDIO;
  if (transport == "http_sse" || transport == "http-sse" || transport == "sse")
    return MCPServerDefinition::TransportType::HTTP_SSE;
  if (transport == "websocket" || transport == "ws")
    return MCPServerDefinition::TransportType::WEBSOCKET;
  return MCPServerDefinition::TransportType::STDIO;
}

inline Result<AuthPreset> ConfigLoader::parseAuthPreset(const JsonValue& json) {
  AuthPreset auth;

  std::string type =
      json.contains("type") ? json["type"].getString() : "bearer";
  if (type == "bearer") {
    auth.type = AuthPreset::Type::BEARER;
  } else if (type == "api_key" || type == "apikey") {
    auth.type = AuthPreset::Type::API_KEY;
  } else if (type == "basic") {
    auth.type = AuthPreset::Type::BASIC;
  }

  auth.value = substituteEnvVars(
      json.contains("value") ? json["value"].getString() : "");
  auth.header =
      json.contains("header") ? json["header"].getString() : "Authorization";

  return Result<AuthPreset>(std::move(auth));
}

inline Result<MCPServerDefinition> ConfigLoader::parseMCPServerDefinition(
    const JsonValue& json) {
  MCPServerDefinition def;

  def.name = json.contains("name") ? json["name"].getString() : "";
  if (def.name.empty()) {
    return Result<MCPServerDefinition>(
        Error(-1, "MCP server definition missing 'name'"));
  }

  std::string transport =
      json.contains("transport") ? json["transport"].getString() : "stdio";
  def.transport = parseTransportType(transport);

  // Parse transport-specific config
  switch (def.transport) {
    case MCPServerDefinition::TransportType::STDIO: {
      if (json.contains("stdio")) {
        const auto& stdio = json["stdio"];
        MCPServerDefinition::StdioConfig cfg;
        cfg.command = substituteEnvVars(
            stdio.contains("command") ? stdio["command"].getString() : "");

        if (stdio.contains("args") && stdio["args"].isArray()) {
          const auto& args = stdio["args"];
          for (size_t i = 0; i < args.size(); ++i) {
            cfg.args.push_back(substituteEnvVars(args[i].getString()));
          }
        }

        if (stdio.contains("env") && stdio["env"].isObject()) {
          for (auto it = stdio["env"].begin(); it != stdio["env"].end(); ++it) {
            auto kv = *it;
            cfg.env[kv.first] = substituteEnvVars(kv.second.getString());
          }
        }

        cfg.working_directory = stdio.contains("working_directory")
                                    ? stdio["working_directory"].getString()
                                    : "";
        def.stdio_config = std::move(cfg);
      }
      break;
    }

    case MCPServerDefinition::TransportType::HTTP_SSE: {
      if (json.contains("http_sse")) {
        const auto& sse = json["http_sse"];
        MCPServerDefinition::HttpSseConfig cfg;
        cfg.url = substituteEnvVars(sse.contains("url") ? sse["url"].getString()
                                                        : "");
        cfg.verify_ssl =
            sse.contains("verify_ssl") ? sse["verify_ssl"].getBool() : true;

        if (sse.contains("headers") && sse["headers"].isObject()) {
          for (auto it = sse["headers"].begin(); it != sse["headers"].end();
               ++it) {
            auto kv = *it;
            cfg.headers[kv.first] = substituteEnvVars(kv.second.getString());
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
        cfg.url =
            substituteEnvVars(ws.contains("url") ? ws["url"].getString() : "");
        cfg.verify_ssl =
            ws.contains("verify_ssl") ? ws["verify_ssl"].getBool() : true;

        if (ws.contains("headers") && ws["headers"].isObject()) {
          for (auto it = ws["headers"].begin(); it != ws["headers"].end();
               ++it) {
            auto kv = *it;
            cfg.headers[kv.first] = substituteEnvVars(kv.second.getString());
          }
        }

        def.websocket_config = std::move(cfg);
      }
      break;
    }
  }

  // Parse timeouts
  if (json.contains("connect_timeout_ms")) {
    def.connect_timeout =
        std::chrono::milliseconds(json["connect_timeout_ms"].getInt());
  }
  if (json.contains("request_timeout_ms")) {
    def.request_timeout =
        std::chrono::milliseconds(json["request_timeout_ms"].getInt());
  }
  if (json.contains("max_retries")) {
    def.max_retries = static_cast<uint32_t>(json["max_retries"].getInt());
  }

  return Result<MCPServerDefinition>(std::move(def));
}

inline Result<ToolDefinition> ConfigLoader::parseToolDefinition(
    const JsonValue& json) {
  ToolDefinition def;

  def.name = json.contains("name") ? json["name"].getString() : "";
  if (def.name.empty()) {
    return Result<ToolDefinition>(Error(-1, "Tool definition missing 'name'"));
  }

  def.description =
      json.contains("description") ? json["description"].getString() : "";

  if (json.contains("input_schema")) {
    def.input_schema = json["input_schema"];
  }

  // Parse REST endpoint
  if (json.contains("rest_endpoint")) {
    const auto& ep = json["rest_endpoint"];
    ToolDefinition::RESTEndpointToolDef rest;

    rest.method = parseHttpMethod(
        ep.contains("method") ? ep["method"].getString() : "GET");
    rest.url =
        substituteEnvVars(ep.contains("url") ? ep["url"].getString() : "");

    if (ep.contains("headers") && ep["headers"].isObject()) {
      for (auto it = ep["headers"].begin(); it != ep["headers"].end(); ++it) {
        auto kv = *it;
        rest.headers[kv.first] = substituteEnvVars(kv.second.getString());
      }
    }

    if (ep.contains("query_params") && ep["query_params"].isObject()) {
      for (auto it = ep["query_params"].begin(); it != ep["query_params"].end();
           ++it) {
        auto kv = *it;
        rest.query_params[kv.first] = substituteEnvVars(kv.second.getString());
      }
    }

    if (ep.contains("path_params") && ep["path_params"].isObject()) {
      for (auto it = ep["path_params"].begin(); it != ep["path_params"].end();
           ++it) {
        auto kv = *it;
        rest.path_params[kv.first] = kv.second.getString();
      }
    }

    if (ep.contains("body_mapping") && ep["body_mapping"].isObject()) {
      for (auto it = ep["body_mapping"].begin(); it != ep["body_mapping"].end();
           ++it) {
        auto kv = *it;
        rest.body_mapping[kv.first] = kv.second.getString();
      }
    }

    rest.response_path =
        ep.contains("response_path") ? ep["response_path"].getString() : "";
    def.rest_endpoint = std::move(rest);
  }

  // Parse MCP reference
  if (json.contains("mcp_reference")) {
    const auto& ref = json["mcp_reference"];
    ToolDefinition::ToolDef mcp;
    mcp.server_name =
        ref.contains("server_name") ? ref["server_name"].getString() : "";
    mcp.tool_name =
        ref.contains("tool_name") ? ref["tool_name"].getString() : "";
    def.mcp_reference = std::move(mcp);
  }

  // Parse tags
  if (json.contains("tags") && json["tags"].isArray()) {
    const auto& tags = json["tags"];
    for (size_t i = 0; i < tags.size(); ++i) {
      def.tags.push_back(tags[i].getString());
    }
  }

  def.require_approval = json.contains("require_approval")
                             ? json["require_approval"].getBool()
                             : false;

  return Result<ToolDefinition>(std::move(def));
}

inline Result<RegistryConfig> ConfigLoader::loadFromJson(
    const JsonValue& json) {
  RegistryConfig config;

  config.name =
      json.contains("name") ? json["name"].getString() : "tool-registry";
  config.base_url = substituteEnvVars(
      json.contains("base_url") ? json["base_url"].getString() : "");

  // Parse default headers
  if (json.contains("default_headers") && json["default_headers"].isObject()) {
    for (auto it = json["default_headers"].begin();
         it != json["default_headers"].end(); ++it) {
      auto kv = *it;
      config.default_headers[kv.first] =
          substituteEnvVars(kv.second.getString());
    }
  }

  // Parse auth presets
  if (json.contains("auth_presets") && json["auth_presets"].isObject()) {
    for (auto it = json["auth_presets"].begin();
         it != json["auth_presets"].end(); ++it) {
      auto kv = *it;
      auto auth_result = parseAuthPreset(kv.second);
      if (mcp::holds_alternative<AuthPreset>(auth_result)) {
        config.auth_presets[kv.first] = mcp::get<AuthPreset>(auth_result);
      }
    }
  }

  // Parse MCP servers
  if (json.contains("mcp_servers") && json["mcp_servers"].isArray()) {
    const auto& servers = json["mcp_servers"];
    for (size_t i = 0; i < servers.size(); ++i) {
      auto server_result = parseMCPServerDefinition(servers[i]);
      if (mcp::holds_alternative<MCPServerDefinition>(server_result)) {
        config.mcp_servers.push_back(
            std::move(mcp::get<MCPServerDefinition>(server_result)));
      }
    }
  }

  // Parse tools
  if (json.contains("tools") && json["tools"].isArray()) {
    const auto& tools = json["tools"];
    for (size_t i = 0; i < tools.size(); ++i) {
      auto tool_result = parseToolDefinition(tools[i]);
      if (mcp::holds_alternative<ToolDefinition>(tool_result)) {
        config.tools.push_back(
            std::move(mcp::get<ToolDefinition>(tool_result)));
      }
    }
  }

  return Result<RegistryConfig>(std::move(config));
}

inline Result<RegistryConfig> ConfigLoader::loadFromString(
    const std::string& json_string) {
  try {
    JsonValue json = JsonValue::parse(json_string);
    return loadFromJson(json);
  } catch (const std::exception& e) {
    return Result<RegistryConfig>(
        Error(-1, std::string("JSON parse error: ") + e.what()));
  }
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
