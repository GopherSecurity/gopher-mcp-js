// Unit tests for RESTServer
//
// Tests REST server configuration, URL building, and integration with
// ServerComposite. Uses a mock HTTP client for isolated testing.

#include "gopher/orch/server/rest_server.h"

#include "orch_test_fixture.h"

using namespace gopher::orch::server;

// =============================================================================
// Mock HTTP Client for Testing
// =============================================================================

class MockHttpClient : public HttpClient {
 public:
  struct RecordedRequest {
    HttpMethod method;
    std::string url;
    std::map<std::string, std::string> headers;
    std::string body;
  };

  void request(HttpMethod method,
               const std::string& url,
               const std::map<std::string, std::string>& headers,
               const std::string& body,
               Dispatcher& dispatcher,
               ResponseCallback callback) override {
    RecordedRequest req{method, url, headers, body};
    requests_.push_back(req);

    // Find matching response
    HttpResponse response;
    auto it = responses_.find(url);
    if (it != responses_.end()) {
      response = it->second;
    } else if (default_response_.status_code != 0) {
      response = default_response_;
    } else {
      response.status_code = 200;
      response.body = "{}";
    }

    dispatcher.post(
        [callback, response]() { callback(Result<HttpResponse>(response)); });
  }

  // Set response for a specific URL
  void setResponse(const std::string& url, const HttpResponse& response) {
    responses_[url] = response;
  }

  // Set default response for any URL
  void setDefaultResponse(const HttpResponse& response) {
    default_response_ = response;
  }

  // Set error response
  void setError(const std::string& url, const Error& error) {
    error_ = error;
    error_url_ = url;
  }

  // Get recorded requests
  const std::vector<RecordedRequest>& requests() const { return requests_; }

  // Clear recorded requests
  void clearRequests() { requests_.clear(); }

 private:
  std::vector<RecordedRequest> requests_;
  std::map<std::string, HttpResponse> responses_;
  HttpResponse default_response_;
  Error error_;
  std::string error_url_;
};

// =============================================================================
// RESTServer Configuration Tests
// =============================================================================

TEST_F(OrchTest, RESTServerConfigDefaults) {
  RESTServerConfig config;
  config.name = "test-api";
  config.base_url = "https://api.example.com/v1";

  EXPECT_EQ(config.name, "test-api");
  EXPECT_EQ(config.base_url, "https://api.example.com/v1");
  EXPECT_EQ(config.auth.type, RESTServerConfig::AuthConfig::Type::NONE);
  EXPECT_EQ(config.connect_timeout.count(), 10000);
  EXPECT_EQ(config.request_timeout.count(), 30000);
  EXPECT_TRUE(config.verify_ssl);
}

TEST_F(OrchTest, RESTServerConfigFluentAPI) {
  RESTServerConfig config;
  config.name = "fluent-api";
  ;
  config.base_url = "https://api.example.com";

  config.addTool("get_users", "GET", "/users", "Get all users")
      .addTool("create_user", "POST", "/users", "Create a user")
      .addTool("get_user", "GET", "/users/{id}", "Get user by ID")
      .setHeader("X-Custom", "value")
      .setBearerAuth("token123");

  EXPECT_EQ(config.tools.size(), 3u);
  EXPECT_TRUE(config.tools.count("get_users") > 0);
  EXPECT_TRUE(config.tools.count("create_user") > 0);
  EXPECT_TRUE(config.tools.count("get_user") > 0);

  EXPECT_EQ(config.tools["get_users"].method, HttpMethod::GET);
  EXPECT_EQ(config.tools["create_user"].method, HttpMethod::POST);
  EXPECT_EQ(config.tools["get_user"].path, "/users/{id}");

  EXPECT_EQ(config.default_headers["X-Custom"], "value");
  EXPECT_EQ(config.auth.type, RESTServerConfig::AuthConfig::Type::BEARER);
  EXPECT_EQ(config.auth.bearer_token, "token123");
}

TEST_F(OrchTest, RESTServerConfigAuthTypes) {
  RESTServerConfig config;
  config.name = "auth-test";
  config.base_url = "https://api.example.com";

  // Bearer auth
  config.setBearerAuth("my-token");
  EXPECT_EQ(config.auth.type, RESTServerConfig::AuthConfig::Type::BEARER);
  EXPECT_EQ(config.auth.bearer_token, "my-token");

  // Basic auth
  config.setBasicAuth("user", "pass");
  EXPECT_EQ(config.auth.type, RESTServerConfig::AuthConfig::Type::BASIC);
  EXPECT_EQ(config.auth.username, "user");
  EXPECT_EQ(config.auth.password, "pass");

  // API key auth
  config.setApiKey("api-key-123", "X-API-Key");
  EXPECT_EQ(config.auth.type, RESTServerConfig::AuthConfig::Type::API_KEY);
  EXPECT_EQ(config.auth.api_key, "api-key-123");
  EXPECT_EQ(config.auth.api_key_header, "X-API-Key");
}

// =============================================================================
// RESTServer Creation Tests
// =============================================================================

TEST_F(OrchTest, RESTServerCreate) {
  RESTServerConfig config;
  config.name = "test-server";
  config.base_url = "https://api.example.com";
  config.addTool("test_tool", "GET", "/test");

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  EXPECT_NE(server, nullptr);
  EXPECT_EQ(server->name(), "test-server");
  EXPECT_EQ(server->connectionState(), ConnectionState::DISCONNECTED);
}

TEST_F(OrchTest, RESTServerConnect) {
  RESTServerConfig config;
  config.name = "connect-test";
  config.base_url = "https://api.example.com";

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  EXPECT_EQ(server->connectionState(), ConnectionState::CONNECTED);
}

TEST_F(OrchTest, RESTServerConnectFailsWithoutBaseUrl) {
  RESTServerConfig config;
  config.name = "no-base-url";
  // base_url not set

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  auto result = runToCompletionResult<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

TEST_F(OrchTest, RESTServerListTools) {
  RESTServerConfig config;
  config.name = "list-tools-test";
  config.base_url = "https://api.example.com";
  config.addTool("tool1", "GET", "/t1", "Tool 1")
      .addTool("tool2", "POST", "/t2", "Tool 2");

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  // Connect first
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  auto tools = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        server->listTools(d, std::move(cb));
      });

  EXPECT_EQ(tools.size(), 2u);
}

TEST_F(OrchTest, RESTServerGetTool) {
  RESTServerConfig config;
  config.name = "get-tool-test";
  config.base_url = "https://api.example.com";
  config.addTool("my_tool", "GET", "/my-endpoint");

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  auto tool = server->tool("my_tool");
  EXPECT_NE(tool, nullptr);
  EXPECT_EQ(tool->name(), "my_tool");

  // Non-existent tool
  auto missing = server->tool("nonexistent");
  EXPECT_EQ(missing, nullptr);
}

TEST_F(OrchTest, RESTServerToolCaching) {
  RESTServerConfig config;
  config.name = "cache-test";
  config.base_url = "https://api.example.com";
  config.addTool("cached_tool", "GET", "/cached");

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  auto tool1 = server->tool("cached_tool");
  auto tool2 = server->tool("cached_tool");

  // Should return same cached instance
  EXPECT_EQ(tool1.get(), tool2.get());
}

// =============================================================================
// RESTServer Tool Invocation Tests
// =============================================================================

TEST_F(OrchTest, RESTServerCallToolGet) {
  RESTServerConfig config;
  config.name = "call-test";
  config.base_url = "http://localhost:8080";
  config.addTool("get_data", "GET", "/data");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 200;
  mockResponse.body = R"({"result": "success"})";
  mockClient->setDefaultResponse(mockResponse);

  auto server = RESTServer::create(config, mockClient);

  // Connect
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  // Call tool
  JsonValue input = JsonValue::object();
  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        server->callTool("get_data", input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["result"].getString(), "success");

  // Verify request was made
  EXPECT_EQ(mockClient->requests().size(), 1u);
  EXPECT_EQ(mockClient->requests()[0].method, HttpMethod::GET);
  EXPECT_EQ(mockClient->requests()[0].url, "http://localhost:8080/data");
}

TEST_F(OrchTest, RESTServerCallToolPost) {
  RESTServerConfig config;
  config.name = "post-test";
  config.base_url = "http://localhost:8080";
  config.addTool("create_item", "POST", "/items");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 201;
  mockResponse.body = R"({"id": 123})";
  mockClient->setDefaultResponse(mockResponse);

  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  JsonValue input = JsonValue::object();
  input["name"] = JsonValue("test item");

  JsonValue result = runToCompletion<JsonValue>([&](Dispatcher& d,
                                                    JsonCallback cb) {
    server->callTool("create_item", input, RunnableConfig(), d, std::move(cb));
  });

  EXPECT_EQ(result["id"].getInt(), 123);

  // Verify request
  EXPECT_EQ(mockClient->requests()[0].method, HttpMethod::POST);
  EXPECT_EQ(mockClient->requests()[0].headers.at("Content-Type"),
            "application/json");
  EXPECT_FALSE(mockClient->requests()[0].body.empty());
}

TEST_F(OrchTest, RESTServerCallToolWithPathParams) {
  RESTServerConfig config;
  config.name = "path-params-test";
  config.base_url = "http://localhost:8080";
  config.addTool("get_user", "GET", "/users/{user_id}/posts/{post_id}");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 200;
  mockResponse.body = R"({"title": "Hello"})";
  mockClient->setDefaultResponse(mockResponse);

  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  JsonValue input = JsonValue::object();
  input["user_id"] = JsonValue("42");
  input["post_id"] = JsonValue(123);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        server->callTool("get_user", input, RunnableConfig(), d, std::move(cb));
      });

  // Verify URL with substituted path parameters
  EXPECT_EQ(mockClient->requests()[0].url,
            "http://localhost:8080/users/42/posts/123");
}

TEST_F(OrchTest, RESTServerCallToolNotFound) {
  RESTServerConfig config;
  config.name = "not-found-test";
  config.base_url = "http://localhost:8080";
  config.addTool("existing_tool", "GET", "/exists");

  auto mockClient = std::make_shared<MockHttpClient>();
  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        server->callTool("nonexistent_tool", JsonValue::object(),
                         RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

TEST_F(OrchTest, RESTServerCallToolHttpError) {
  RESTServerConfig config;
  config.name = "http-error-test";
  config.base_url = "http://localhost:8080";
  config.addTool("error_tool", "GET", "/error");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 500;
  mockResponse.body = "Internal Server Error";
  mockClient->setDefaultResponse(mockResponse);

  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        server->callTool("error_tool", JsonValue::object(), RunnableConfig(), d,
                         std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

// =============================================================================
// RESTServer Authentication Tests
// =============================================================================

TEST_F(OrchTest, RESTServerBearerAuth) {
  RESTServerConfig config;
  config.name = "bearer-auth-test";
  config.base_url = "http://localhost:8080";
  config.setBearerAuth("my-secret-token");
  config.addTool("auth_tool", "GET", "/protected");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 200;
  mockResponse.body = "{}";
  mockClient->setDefaultResponse(mockResponse);

  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
    server->callTool("auth_tool", JsonValue::object(), RunnableConfig(), d,
                     std::move(cb));
  });

  // Verify Authorization header
  EXPECT_EQ(mockClient->requests()[0].headers.at("Authorization"),
            "Bearer my-secret-token");
}

TEST_F(OrchTest, RESTServerApiKeyAuth) {
  RESTServerConfig config;
  config.name = "api-key-test";
  config.base_url = "http://localhost:8080";
  config.setApiKey("secret-api-key", "X-API-Key");
  config.addTool("api_tool", "GET", "/api");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 200;
  mockResponse.body = "{}";
  mockClient->setDefaultResponse(mockResponse);

  auto server = RESTServer::create(config, mockClient);

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
    server->callTool("api_tool", JsonValue::object(), RunnableConfig(), d,
                     std::move(cb));
  });

  // Verify API key header
  EXPECT_EQ(mockClient->requests()[0].headers.at("X-API-Key"),
            "secret-api-key");
}

// =============================================================================
// RESTServer with ServerComposite Tests
// =============================================================================

TEST_F(OrchTest, RESTServerWithComposite) {
  RESTServerConfig config;
  config.name = "rest-api";
  config.base_url = "http://localhost:8080";
  config.addTool("get_items", "GET", "/items");

  auto mockClient = std::make_shared<MockHttpClient>();
  HttpResponse mockResponse;
  mockResponse.status_code = 200;
  mockResponse.body = R"({"items": [1, 2, 3]})";
  mockClient->setDefaultResponse(mockResponse);

  auto restServer = RESTServer::create(config, mockClient);

  // Create composite with REST server
  auto composite = ServerComposite::create("multi-server");
  std::vector<std::string> tools = {"get_items"};
  composite->addServer(restServer, tools, true);

  // Connect all
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        composite->connectAll(d, std::move(cb));
      });

  // Get tool through composite
  auto tool = composite->tool("rest-api.get_items");
  EXPECT_NE(tool, nullptr);

  // Invoke through composite
  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        tool->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.contains("items"));
}
