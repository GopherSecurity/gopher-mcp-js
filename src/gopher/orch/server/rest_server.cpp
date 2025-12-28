// RESTServer implementation
//
// Provides REST API access through the Server interface.
// The DefaultHttpClient provides a basic HTTP implementation.
// For production use, inject a custom HttpClient with a robust HTTP library.

#include "gopher/orch/server/rest_server.h"

#include <atomic>
#include <iomanip>
#include <mutex>
#include <regex>
#include <sstream>

namespace gopher {
namespace orch {
namespace server {

namespace {

// Atomic counter for generating unique IDs
std::atomic<uint64_t> g_rest_id_counter{0};

// Parse URL into components
struct UrlComponents {
  std::string scheme;   // http or https
  std::string host;
  uint16_t port = 0;
  std::string path;
  std::string query;

  bool parse(const std::string& url) {
    // Simple URL parser
    // Format: scheme://host:port/path?query

    size_t scheme_end = url.find("://");
    if (scheme_end == std::string::npos) {
      return false;
    }
    scheme = url.substr(0, scheme_end);

    size_t host_start = scheme_end + 3;
    size_t path_start = url.find('/', host_start);
    size_t query_start = url.find('?', host_start);

    std::string host_port;
    if (path_start != std::string::npos) {
      host_port = url.substr(host_start, path_start - host_start);
      if (query_start != std::string::npos && query_start > path_start) {
        path = url.substr(path_start, query_start - path_start);
        query = url.substr(query_start + 1);
      } else {
        path = url.substr(path_start);
      }
    } else if (query_start != std::string::npos) {
      host_port = url.substr(host_start, query_start - host_start);
      query = url.substr(query_start + 1);
      path = "/";
    } else {
      host_port = url.substr(host_start);
      path = "/";
    }

    // Parse host:port
    size_t port_sep = host_port.find(':');
    if (port_sep != std::string::npos) {
      host = host_port.substr(0, port_sep);
      port = static_cast<uint16_t>(std::stoi(host_port.substr(port_sep + 1)));
    } else {
      host = host_port;
      port = (scheme == "https") ? 443 : 80;
    }

    return true;
  }
};

// Base64 encoding for basic auth
std::string base64Encode(const std::string& input) {
  static const char* chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  std::string result;
  result.reserve(((input.size() + 2) / 3) * 4);

  for (size_t i = 0; i < input.size(); i += 3) {
    uint32_t n = static_cast<uint8_t>(input[i]) << 16;
    if (i + 1 < input.size()) n |= static_cast<uint8_t>(input[i + 1]) << 8;
    if (i + 2 < input.size()) n |= static_cast<uint8_t>(input[i + 2]);

    result += chars[(n >> 18) & 0x3F];
    result += chars[(n >> 12) & 0x3F];
    result += (i + 1 < input.size()) ? chars[(n >> 6) & 0x3F] : '=';
    result += (i + 2 < input.size()) ? chars[n & 0x3F] : '=';
  }

  return result;
}

// URL encode a string
std::string urlEncode(const std::string& value) {
  std::ostringstream escaped;
  escaped.fill('0');
  escaped << std::hex;

  for (char c : value) {
    if (isalnum(static_cast<unsigned char>(c)) || c == '-' || c == '_' ||
        c == '.' || c == '~') {
      escaped << c;
    } else {
      escaped << '%' << std::setw(2)
              << static_cast<int>(static_cast<unsigned char>(c));
    }
  }

  return escaped.str();
}

}  // namespace

// =============================================================================
// DefaultHttpClient Implementation
// =============================================================================

// DefaultHttpClient provides a stub implementation.
// For actual HTTP requests, inject a custom HttpClient implementation
// that uses a proper HTTP library (e.g., libcurl, boost::beast).
//
// The stub returns an error indicating that no HTTP backend is configured.
// This is by design - the RESTServer is meant to be used with a custom
// HttpClient for production use, or with MockHttpClient for testing.
class DefaultHttpClient::Impl {
 public:
  Impl() = default;

  void request(HttpMethod method,
               const std::string& url,
               const std::map<std::string, std::string>& headers,
               const std::string& body,
               Dispatcher& dispatcher,
               HttpClient::ResponseCallback callback) {
    (void)method;
    (void)url;
    (void)headers;
    (void)body;

    // Return an error indicating no HTTP backend is configured
    // In production, inject a custom HttpClient implementation
    dispatcher.post([callback]() {
      callback(Result<HttpResponse>(
          Error(OrchError::INTERNAL_ERROR,
                "DefaultHttpClient: No HTTP backend configured. "
                "Please inject a custom HttpClient implementation.")));
    });
  }
};

DefaultHttpClient::DefaultHttpClient() : impl_(std::make_unique<Impl>()) {}

DefaultHttpClient::~DefaultHttpClient() = default;

void DefaultHttpClient::request(HttpMethod method,
                                const std::string& url,
                                const std::map<std::string, std::string>& headers,
                                const std::string& body,
                                Dispatcher& dispatcher,
                                ResponseCallback callback) {
  impl_->request(method, url, headers, body, dispatcher, std::move(callback));
}

// =============================================================================
// RESTServer Implementation
// =============================================================================

std::string RESTServer::generateId() {
  std::ostringstream oss;
  oss << "rest-server-" << ++g_rest_id_counter;
  return oss.str();
}

RESTServer::RESTServer(const RESTServerConfig& config, HttpClientPtr http_client)
    : id_(generateId()),
      config_(config),
      http_client_(std::move(http_client)) {}

RESTServer::~RESTServer() = default;

RESTServer::Ptr RESTServer::create(const RESTServerConfig& config) {
  auto http_client = std::make_shared<DefaultHttpClient>();
  return create(config, http_client);
}

RESTServer::Ptr RESTServer::create(const RESTServerConfig& config,
                                    HttpClientPtr http_client) {
  return std::shared_ptr<RESTServer>(new RESTServer(config, std::move(http_client)));
}

void RESTServer::connect(Dispatcher& dispatcher, ConnectionCallback callback) {
  // REST servers are stateless - no connection needed
  // Just verify the configuration is valid
  if (config_.base_url.empty()) {
    dispatcher.post([callback]() {
      callback(Result<std::nullptr_t>(
          Error(OrchError::INVALID_ARGUMENT, "base_url is required")));
    });
    return;
  }

  state_ = ConnectionState::CONNECTED;
  dispatcher.post([callback]() {
    callback(core::makeSuccess<std::nullptr_t>(nullptr));
  });
}

void RESTServer::disconnect(Dispatcher& dispatcher,
                            std::function<void()> callback) {
  state_ = ConnectionState::DISCONNECTED;
  if (callback) {
    dispatcher.post(std::move(callback));
  }
}

void RESTServer::listTools(Dispatcher& dispatcher, ToolListCallback callback) {
  std::vector<ToolInfo> tools;
  tools.reserve(config_.tools.size());

  for (const auto& entry : config_.tools) {
    tools.push_back(entry.second.info);
  }

  dispatcher.post([tools = std::move(tools), callback]() {
    callback(core::makeSuccess(std::move(tools)));
  });
}

JsonRunnablePtr RESTServer::tool(const std::string& name) {
  std::lock_guard<std::mutex> lock(mutex_);

  // Check cache
  auto it = tool_cache_.find(name);
  if (it != tool_cache_.end()) {
    return it->second;
  }

  // Find tool config
  auto tool_it = config_.tools.find(name);
  if (tool_it == config_.tools.end()) {
    return nullptr;
  }

  // Create ServerTool wrapper
  auto tool_ptr = std::make_shared<ServerTool>(shared_from_this(), tool_it->second.info);
  tool_cache_[name] = tool_ptr;
  return tool_ptr;
}

void RESTServer::callTool(const std::string& name,
                          const JsonValue& arguments,
                          const RunnableConfig& config,
                          Dispatcher& dispatcher,
                          JsonCallback callback) {
  (void)config;  // RunnableConfig not used for REST calls

  // Find tool endpoint
  auto tool_it = config_.tools.find(name);
  if (tool_it == config_.tools.end()) {
    dispatcher.post([callback, name]() {
      callback(Result<JsonValue>(
          Error(OrchError::TOOL_NOT_FOUND, "Tool not found: " + name)));
    });
    return;
  }

  const auto& endpoint = tool_it->second;

  // Build URL with path parameters
  std::string url = buildUrl(endpoint.path, arguments);

  // Build headers
  auto headers = buildHeaders();

  // Add Content-Type for body
  std::string body;
  if (endpoint.send_body && !arguments.isNull()) {
    headers["Content-Type"] = "application/json";
    body = arguments.toString();
  }

  // Make HTTP request
  http_client_->request(
      endpoint.method, url, headers, body, dispatcher,
      [callback, endpoint](Result<HttpResponse> result) {
        if (mcp::holds_alternative<Error>(result)) {
          callback(Result<JsonValue>(mcp::get<Error>(result)));
          return;
        }

        const auto& response = mcp::get<HttpResponse>(result);

        // Check for HTTP errors
        if (!response.isSuccess()) {
          std::ostringstream error_msg;
          error_msg << "HTTP " << response.status_code;
          if (!response.body.empty()) {
            error_msg << ": " << response.body.substr(0, 200);
          }
          callback(Result<JsonValue>(
              Error(OrchError::INTERNAL_ERROR, error_msg.str())));
          return;
        }

        // Parse response body as JSON
        if (response.body.empty()) {
          callback(core::makeSuccess(JsonValue::object()));
          return;
        }

        try {
          JsonValue json_result = JsonValue::parse(response.body);
          callback(core::makeSuccess(std::move(json_result)));
        } catch (const std::exception& e) {
          // Return raw body as string if not JSON
          callback(core::makeSuccess(JsonValue(response.body)));
        }
      });
}

std::string RESTServer::buildUrl(const std::string& path,
                                  const JsonValue& args) const {
  std::string url = config_.base_url;

  // Replace path parameters
  std::string result_path = path;
  std::regex param_regex("\\{([^}]+)\\}");
  std::smatch match;
  std::string::const_iterator search_start = result_path.cbegin();

  std::string final_path;
  size_t last_pos = 0;

  while (std::regex_search(search_start, result_path.cend(), match, param_regex)) {
    std::string param_name = match[1].str();
    std::string replacement;

    // Get value from arguments
    if (args.contains(param_name)) {
      const JsonValue& value = args[param_name];
      if (value.isString()) {
        replacement = urlEncode(value.getString());
      } else if (value.isInteger()) {
        replacement = std::to_string(value.getInt());
      } else if (value.isFloat()) {
        replacement = std::to_string(value.getFloat());
      } else if (value.isBoolean()) {
        replacement = value.getBool() ? "true" : "false";
      }
    }

    size_t match_start = static_cast<size_t>(match.position()) + (search_start - result_path.cbegin());
    final_path += result_path.substr(last_pos, match_start - last_pos);
    final_path += replacement;
    last_pos = match_start + match.length();

    search_start = match.suffix().first;
  }

  final_path += result_path.substr(last_pos);

  return url + final_path;
}

std::map<std::string, std::string> RESTServer::buildHeaders() const {
  std::map<std::string, std::string> headers = config_.default_headers;

  // Add authentication
  switch (config_.auth.type) {
    case RESTServerConfig::AuthConfig::Type::BEARER:
      headers["Authorization"] = "Bearer " + config_.auth.bearer_token;
      break;
    case RESTServerConfig::AuthConfig::Type::BASIC: {
      std::string credentials = config_.auth.username + ":" + config_.auth.password;
      headers["Authorization"] = "Basic " + base64Encode(credentials);
      break;
    }
    case RESTServerConfig::AuthConfig::Type::API_KEY:
      headers[config_.auth.api_key_header] = config_.auth.api_key;
      break;
    case RESTServerConfig::AuthConfig::Type::NONE:
    default:
      break;
  }

  return headers;
}

void RESTServer::setAuth(const RESTServerConfig::AuthConfig& auth) {
  std::lock_guard<std::mutex> lock(mutex_);
  config_.auth = auth;
}

void RESTServer::setDefaultHeader(const std::string& name,
                                   const std::string& value) {
  std::lock_guard<std::mutex> lock(mutex_);
  config_.default_headers[name] = value;
}

}  // namespace server
}  // namespace orch
}  // namespace gopher
