#pragma once

// RESTToolAdapter - Create tools from REST endpoint definitions
//
// Converts ToolDefinition with RESTEndpoint to executable tools.
// Supports:
// - Path parameter substitution (/users/{id})
// - Query parameter mapping ($.field)
// - Request body mapping
// - Response path extraction
// - Environment variable substitution

#include <functional>
#include <memory>
#include <regex>
#include <string>

#include "gopher/orch/agent/tool_definition.h"
#include "gopher/orch/server/rest_server.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::server;

// Tool execution function signature (also defined in tool_registry.h)
using ToolFunction = std::function<void(const JsonValue& arguments,
                                        Dispatcher& dispatcher,
                                        JsonCallback callback)>;

// ═══════════════════════════════════════════════════════════════════════════
// JSON PATH UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Extract value from JSON using simple path ($.field.subfield)
inline JsonValue extractJsonPath(const JsonValue& json, const std::string& path) {
  if (path.empty() || path == "$") {
    return json;
  }

  // Remove leading "$." if present
  std::string clean_path = path;
  if (clean_path.substr(0, 2) == "$.") {
    clean_path = clean_path.substr(2);
  } else if (clean_path[0] == '$') {
    clean_path = clean_path.substr(1);
  }

  // Split by dots and traverse
  JsonValue current = json;
  std::istringstream iss(clean_path);
  std::string token;

  while (std::getline(iss, token, '.')) {
    if (token.empty()) continue;

    // Check for array index [n]
    auto bracket_pos = token.find('[');
    if (bracket_pos != std::string::npos) {
      std::string field = token.substr(0, bracket_pos);
      std::string index_str = token.substr(bracket_pos + 1);
      index_str.pop_back();  // Remove ]

      if (!field.empty()) {
        if (!current.contains(field)) {
          return JsonValue();
        }
        current = current[field];
      }

      int index = std::stoi(index_str);
      if (!current.isArray() || index >= static_cast<int>(current.size())) {
        return JsonValue();
      }
      current = current[index];
    } else {
      if (!current.isObject() || !current.contains(token)) {
        return JsonValue();
      }
      current = current[token];
    }
  }

  return current;
}

// Extract value as string
inline std::string extractJsonPathString(const JsonValue& json,
                                          const std::string& path) {
  JsonValue value = extractJsonPath(json, path);
  if (value.isNull()) {
    return "";
  }
  if (value.isString()) {
    return value.getString();
  }
  return value.toString();
}

// URL encode string
inline std::string urlEncode(const std::string& str) {
  std::string encoded;
  for (char c : str) {
    if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else {
      char hex[4];
      std::snprintf(hex, sizeof(hex), "%%%02X", static_cast<unsigned char>(c));
      encoded += hex;
    }
  }
  return encoded;
}

// ═══════════════════════════════════════════════════════════════════════════
// REST TOOL ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

class RESTToolAdapter {
 public:
  explicit RESTToolAdapter(HttpClientPtr http_client = nullptr)
      : http_client_(http_client ? http_client
                                  : std::make_shared<DefaultHttpClient>()) {}

  // Set default headers for all requests
  void setDefaultHeaders(const std::map<std::string, std::string>& headers) {
    default_headers_ = headers;
  }

  // Set base URL for relative paths
  void setBaseUrl(const std::string& url) { base_url_ = url; }

  // Set environment variable for substitution
  void setEnv(const std::string& name, const std::string& value) {
    env_vars_[name] = value;
  }

  // Create a tool function from REST endpoint definition
  ToolFunction createToolFunction(const ToolDefinition& def) {
    if (!def.rest_endpoint) {
      return nullptr;
    }

    const auto& endpoint = *def.rest_endpoint;

    return [this, endpoint](const JsonValue& input, Dispatcher& dispatcher,
                            JsonCallback callback) {
      executeRESTCall(endpoint, input, dispatcher, std::move(callback));
    };
  }

  // Execute a REST call directly
  void executeRESTCall(const ToolDefinition::RESTEndpoint& endpoint,
                       const JsonValue& input,
                       Dispatcher& dispatcher,
                       JsonCallback callback) {
    // Build URL
    std::string url = substituteEnvVars(endpoint.url);

    // Add base URL if path is relative
    if (!url.empty() && url[0] == '/') {
      url = base_url_ + url;
    }

    // Substitute path parameters
    for (const auto& kv : endpoint.path_params) {
      std::string value = extractJsonPathString(input, kv.second);
      std::regex param_regex("\\{" + kv.first + "\\}");
      url = std::regex_replace(url, param_regex, urlEncode(value));
    }

    // Build query string
    if (!endpoint.query_params.empty()) {
      bool has_query = url.find('?') != std::string::npos;
      for (const auto& kv : endpoint.query_params) {
        std::string value = substituteEnvVars(extractJsonPathString(input, kv.second));
        if (!value.empty()) {
          url += (has_query ? "&" : "?");
          url += urlEncode(kv.first) + "=" + urlEncode(value);
          has_query = true;
        }
      }
    }

    // Build headers
    std::map<std::string, std::string> headers = default_headers_;
    for (const auto& kv : endpoint.headers) {
      headers[kv.first] = substituteEnvVars(kv.second);
    }
    if (headers.find("Content-Type") == headers.end()) {
      headers["Content-Type"] = "application/json";
    }

    // Build body for POST/PUT/PATCH
    std::string body;
    if (endpoint.method == HttpMethod::POST ||
        endpoint.method == HttpMethod::PUT ||
        endpoint.method == HttpMethod::PATCH) {
      if (!endpoint.body_mapping.empty()) {
        JsonValue body_json = JsonValue::object();
        for (const auto& kv : endpoint.body_mapping) {
          body_json[kv.first] = extractJsonPath(input, kv.second);
        }
        body = body_json.toString();
      } else {
        body = input.toString();
      }
    }

    // Make request
    http_client_->request(
        endpoint.method, url, headers, body, dispatcher,
        [endpoint, callback = std::move(callback)](Result<HttpResponse> result) {
          if (!mcp::holds_alternative<HttpResponse>(result)) {
            callback(Result<JsonValue>(mcp::get<Error>(result)));
            return;
          }

          auto& response = mcp::get<HttpResponse>(result);
          if (!response.isSuccess()) {
            callback(Result<JsonValue>(
                Error(-1, "HTTP " + std::to_string(response.status_code) + ": " +
                              response.body)));
            return;
          }

          // Parse response
          JsonValue json;
          try {
            if (!response.body.empty()) {
              json = JsonValue::parse(response.body);
            } else {
              json = JsonValue::object();
            }
          } catch (...) {
            // If not JSON, wrap as string
            json = response.body;
          }

          // Extract with path if specified
          if (!endpoint.response_path.empty()) {
            json = extractJsonPath(json, endpoint.response_path);
          }

          callback(Result<JsonValue>(std::move(json)));
        });
  }

 private:
  std::string substituteEnvVars(const std::string& input) const {
    std::string result = input;
    std::regex env_pattern("\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}");
    std::smatch match;

    while (std::regex_search(result, match, env_pattern)) {
      std::string var_name = match[1].str();
      std::string value;

      auto it = env_vars_.find(var_name);
      if (it != env_vars_.end()) {
        value = it->second;
      } else {
        const char* env_val = std::getenv(var_name.c_str());
        if (env_val) {
          value = env_val;
        }
      }

      result = result.replace(match.position(), match.length(), value);
    }

    return result;
  }

  HttpClientPtr http_client_;
  std::map<std::string, std::string> default_headers_;
  std::string base_url_;
  std::map<std::string, std::string> env_vars_;
};

using RESTToolAdapterPtr = std::shared_ptr<RESTToolAdapter>;

inline RESTToolAdapterPtr makeRESTToolAdapter(HttpClientPtr client = nullptr) {
  return std::make_shared<RESTToolAdapter>(client);
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
