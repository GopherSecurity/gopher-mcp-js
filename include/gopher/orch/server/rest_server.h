#pragma once

// RESTServer - REST API implementation of Server interface
//
// Provides a Server implementation that wraps REST API endpoints as tools.
// Each tool maps to an HTTP endpoint with configurable method, path, and
// schema.
//
// Usage:
//   RESTServerConfig config;
//   config.name = "api-server";
//   config.base_url = "https://api.example.com/v1";
//   config.addTool("get_user", "GET", "/users/{id}", "Get user by ID");
//   config.addTool("create_user", "POST", "/users", "Create a new user");
//
//   auto server = RESTServer::create(config);
//   auto getUserTool = server->tool("get_user");
//
// Path parameters are substituted from the input JSON:
//   /users/{id} with input {"id": "123"} becomes /users/123

#include <chrono>
#include <functional>
#include <map>
#include <memory>
#include <regex>
#include <string>
#include <vector>

#include "gopher/orch/server/server.h"

namespace gopher {
namespace orch {
namespace server {

// Forward declarations
class RESTServer;
using RESTServerPtr = std::shared_ptr<RESTServer>;

// HTTP method enumeration
enum class HttpMethod {
  GET,
  POST,
  PUT,
  PATCH,
  DELETE_,  // DELETE is a macro on some platforms
  HEAD,
  OPTIONS
};

// Convert HttpMethod to string
inline std::string httpMethodToString(HttpMethod method) {
  switch (method) {
    case HttpMethod::GET:
      return "GET";
    case HttpMethod::POST:
      return "POST";
    case HttpMethod::PUT:
      return "PUT";
    case HttpMethod::PATCH:
      return "PATCH";
    case HttpMethod::DELETE_:
      return "DELETE";
    case HttpMethod::HEAD:
      return "HEAD";
    case HttpMethod::OPTIONS:
      return "OPTIONS";
    default:
      return "GET";
  }
}

// Parse string to HttpMethod
inline HttpMethod parseHttpMethod(const std::string& method) {
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

// Tool endpoint configuration
struct RESTToolEndpoint {
  HttpMethod method = HttpMethod::GET;
  std::string path;     // e.g., "/users/{id}"
  ServerToolInfo info;  // Tool metadata

  // Request body handling
  bool send_body =
      true;  // Send input JSON as request body (for POST/PUT/PATCH)

  // Response handling
  std::string response_json_path;  // JSONPath to extract from response (empty =
                                   // use whole response)

  RESTToolEndpoint() = default;
  RESTToolEndpoint(HttpMethod m, const std::string& p, const ServerToolInfo& i)
      : method(m),
        path(p),
        info(i),
        send_body(m != HttpMethod::GET && m != HttpMethod::DELETE_) {}
};

// Configuration for REST server connection
struct RESTServerConfig {
  std::string name;      // Human-readable name
  std::string base_url;  // Base URL (e.g., "https://api.example.com/v1")

  // Default headers for all requests
  std::map<std::string, std::string> default_headers;

  // Authentication
  struct AuthConfig {
    enum class Type { NONE, BEARER, BASIC, API_KEY };
    Type type = Type::NONE;

    std::string bearer_token;                  // For BEARER auth
    std::string username;                      // For BASIC auth
    std::string password;                      // For BASIC auth
    std::string api_key;                       // For API_KEY auth
    std::string api_key_header = "X-API-Key";  // Header name for API key
  };
  AuthConfig auth;

  // Timeouts
  std::chrono::milliseconds connect_timeout{10000};
  std::chrono::milliseconds request_timeout{30000};

  // SSL/TLS
  bool verify_ssl = true;
  std::string ca_cert_path;  // Optional CA certificate path

  // Tool endpoint mappings
  std::map<std::string, RESTToolEndpoint> tools;

  // Fluent API for adding tools
  RESTServerConfig& addTool(const std::string& name,
                            HttpMethod method,
                            const std::string& path,
                            const std::string& description = "") {
    RESTToolEndpoint endpoint;
    endpoint.method = method;
    endpoint.path = path;
    endpoint.info.name = name;
    endpoint.info.description = description;
    tools[name] = endpoint;
    return *this;
  }

  RESTServerConfig& addTool(const std::string& name,
                            const std::string& method,
                            const std::string& path,
                            const std::string& description = "") {
    return addTool(name, parseHttpMethod(method), path, description);
  }

  RESTServerConfig& setHeader(const std::string& name,
                              const std::string& value) {
    default_headers[name] = value;
    return *this;
  }

  RESTServerConfig& setBearerAuth(const std::string& token) {
    auth.type = AuthConfig::Type::BEARER;
    auth.bearer_token = token;
    return *this;
  }

  RESTServerConfig& setBasicAuth(const std::string& username,
                                 const std::string& password) {
    auth.type = AuthConfig::Type::BASIC;
    auth.username = username;
    auth.password = password;
    return *this;
  }

  RESTServerConfig& setApiKey(const std::string& key,
                              const std::string& header = "X-API-Key") {
    auth.type = AuthConfig::Type::API_KEY;
    auth.api_key = key;
    auth.api_key_header = header;
    return *this;
  }
};

// HTTP response from REST call
struct HttpResponse {
  int status_code = 0;
  std::map<std::string, std::string> headers;
  std::string body;

  bool isSuccess() const { return status_code >= 200 && status_code < 300; }
  bool isClientError() const { return status_code >= 400 && status_code < 500; }
  bool isServerError() const { return status_code >= 500; }
};

// HTTP client interface - abstraction for making HTTP requests
// This allows different implementations (libevent, curl, etc.)
class HttpClient {
 public:
  using ResponseCallback = std::function<void(Result<HttpResponse>)>;

  virtual ~HttpClient() = default;

  // Make an HTTP request asynchronously
  virtual void request(HttpMethod method,
                       const std::string& url,
                       const std::map<std::string, std::string>& headers,
                       const std::string& body,
                       Dispatcher& dispatcher,
                       ResponseCallback callback) = 0;
};

using HttpClientPtr = std::shared_ptr<HttpClient>;

// RESTServer - REST API implementation of Server interface
//
// Thread Safety:
// - Configuration should be done before use
// - All public methods are thread-safe after configuration
// - Callbacks are invoked in dispatcher thread context
class RESTServer : public Server {
 public:
  using Ptr = std::shared_ptr<RESTServer>;

  // Factory method - creates a REST server with default HTTP client
  static Ptr create(const RESTServerConfig& config);

  // Factory method with custom HTTP client
  static Ptr create(const RESTServerConfig& config, HttpClientPtr http_client);

  ~RESTServer() override;

  // Server interface implementation
  std::string id() const override { return id_; }
  std::string name() const override { return config_.name; }
  ConnectionState connectionState() const override { return state_; }

  void connect(Dispatcher& dispatcher, ConnectionCallback callback) override;
  void disconnect(Dispatcher& dispatcher,
                  std::function<void()> callback) override;

  void listTools(Dispatcher& dispatcher,
                 ServerToolListCallback callback) override;

  JsonRunnablePtr tool(const std::string& name) override;

  void callTool(const std::string& name,
                const JsonValue& arguments,
                const RunnableConfig& config,
                Dispatcher& dispatcher,
                JsonCallback callback) override;

  // REST-specific methods

  // Get the configuration
  const RESTServerConfig& config() const { return config_; }

  // Update authentication at runtime
  void setAuth(const RESTServerConfig::AuthConfig& auth);

  // Add a header that will be sent with all requests
  void setDefaultHeader(const std::string& name, const std::string& value);

 private:
  explicit RESTServer(const RESTServerConfig& config,
                      HttpClientPtr http_client);

  // Build full URL from endpoint path and arguments
  std::string buildUrl(const std::string& path, const JsonValue& args) const;

  // Build request headers including auth
  std::map<std::string, std::string> buildHeaders() const;

  // Generate unique ID
  static std::string generateId();

  std::string id_;
  RESTServerConfig config_;
  HttpClientPtr http_client_;
  ConnectionState state_ = ConnectionState::DISCONNECTED;

  // Cached tool runnables
  std::map<std::string, JsonRunnablePtr> tool_cache_;
  mutable std::mutex mutex_;
};

// Default HTTP client implementation using gopher-mcp networking
// Note: This is a basic implementation. For production use, consider
// using a more robust HTTP client library.
class DefaultHttpClient : public HttpClient {
 public:
  DefaultHttpClient();
  ~DefaultHttpClient() override;

  void request(HttpMethod method,
               const std::string& url,
               const std::map<std::string, std::string>& headers,
               const std::string& body,
               Dispatcher& dispatcher,
               ResponseCallback callback) override;

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

// Factory function
inline RESTServerPtr makeRESTServer(const RESTServerConfig& config) {
  return RESTServer::create(config);
}

}  // namespace server
}  // namespace orch
}  // namespace gopher
