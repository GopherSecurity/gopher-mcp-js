// Unit tests for ToolRegistry and ToolExecutor

#include "orch_test_fixture.h"

#include "gopher/orch/agent/tool_registry.h"
#include "gopher/orch/agent/tool_executor.h"
#include "gopher/orch/agent/tool_definition.h"
#include "gopher/orch/agent/config_loader.h"
#include "gopher/orch/server/mock_server.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::server;

// =============================================================================
// ToolRegistry Test Fixture
// =============================================================================

class ToolRegistryTest : public OrchTest {
 protected:
  ToolRegistryPtr registry_;
  ToolExecutorPtr executor_;
  std::shared_ptr<MockServer> mock_server_;

  void SetUp() override {
    OrchTest::SetUp();
    registry_ = makeToolRegistry();
    executor_ = makeToolExecutor(registry_);
    mock_server_ = makeMockServer("test-server");
  }

  // Helper to build a simple JSON schema
  JsonValue makeSchema(const std::string& type = "object") {
    JsonValue schema = JsonValue::object();
    schema["type"] = type;
    return schema;
  }

  // Helper to build a schema with properties
  JsonValue makeSchemaWithProps(
      const std::map<std::string, std::string>& props) {
    JsonValue schema = JsonValue::object();
    schema["type"] = "object";

    JsonValue properties = JsonValue::object();
    for (const auto& kv : props) {
      JsonValue prop = JsonValue::object();
      prop["type"] = kv.second;
      properties[kv.first] = prop;
    }
    schema["properties"] = properties;

    return schema;
  }
};

// =============================================================================
// Basic Tool Registration Tests
// =============================================================================

TEST_F(ToolRegistryTest, CreateEmpty) {
  EXPECT_EQ(registry_->toolCount(), 0u);
  EXPECT_TRUE(registry_->getToolSpecs().empty());
  EXPECT_TRUE(registry_->getToolNames().empty());
}

TEST_F(ToolRegistryTest, AddLocalTool) {
  registry_->addTool(
      "calculator", "Perform calculations", makeSchema(),
      [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
        cb(Result<JsonValue>(JsonValue(42)));
      });

  EXPECT_EQ(registry_->toolCount(), 1u);
  EXPECT_TRUE(registry_->hasTool("calculator"));
  EXPECT_FALSE(registry_->hasTool("nonexistent"));

  auto specs = registry_->getToolSpecs();
  ASSERT_EQ(specs.size(), 1u);
  EXPECT_EQ(specs[0].name, "calculator");
  EXPECT_EQ(specs[0].description, "Perform calculations");
}

TEST_F(ToolRegistryTest, AddToolWithSpec) {
  ToolSpec spec("search", "Search the web", makeSchema());
  registry_->addTool(spec, [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
    cb(Result<JsonValue>(JsonValue("search result")));
  });

  EXPECT_TRUE(registry_->hasTool("search"));

  auto retrieved = registry_->getToolSpec("search");
  ASSERT_TRUE(retrieved.has_value());
  EXPECT_EQ(retrieved->name, "search");
  EXPECT_EQ(retrieved->description, "Search the web");
}

TEST_F(ToolRegistryTest, AddSyncTool) {
  registry_->addSyncTool(
      "sync_calc", "Synchronous calculation", makeSchema(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue(100));
      });

  EXPECT_TRUE(registry_->hasTool("sync_calc"));

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeTool("sync_calc", JsonValue::object(), d, std::move(cb));
      });

  EXPECT_EQ(result.getInt(), 100);
}

TEST_F(ToolRegistryTest, AddMultipleTools) {
  registry_->addTool("tool1", "Tool 1", makeSchema(),
                     [](const JsonValue&, Dispatcher&, JsonCallback cb) {
                       cb(Result<JsonValue>(JsonValue(1)));
                     });

  registry_->addTool("tool2", "Tool 2", makeSchema(),
                     [](const JsonValue&, Dispatcher&, JsonCallback cb) {
                       cb(Result<JsonValue>(JsonValue(2)));
                     });

  registry_->addTool("tool3", "Tool 3", makeSchema(),
                     [](const JsonValue&, Dispatcher&, JsonCallback cb) {
                       cb(Result<JsonValue>(JsonValue(3)));
                     });

  EXPECT_EQ(registry_->toolCount(), 3u);

  auto names = registry_->getToolNames();
  EXPECT_EQ(names.size(), 3u);
  EXPECT_TRUE(std::find(names.begin(), names.end(), "tool1") != names.end());
  EXPECT_TRUE(std::find(names.begin(), names.end(), "tool2") != names.end());
  EXPECT_TRUE(std::find(names.begin(), names.end(), "tool3") != names.end());
}

// =============================================================================
// Tool Execution Tests (via ToolExecutor)
// =============================================================================

TEST_F(ToolRegistryTest, ExecuteLocalTool) {
  registry_->addTool(
      "echo", "Echo input", makeSchema(),
      [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
        JsonValue result = JsonValue::object();
        result["echoed"] = args;
        cb(Result<JsonValue>(std::move(result)));
      });

  JsonValue input = JsonValue::object();
  input["message"] = "hello";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeTool("echo", input, d, std::move(cb));
      });

  EXPECT_TRUE(result.contains("echoed"));
  EXPECT_EQ(result["echoed"]["message"].getString(), "hello");
}

TEST_F(ToolRegistryTest, ExecuteToolNotFound) {
  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeTool("nonexistent", JsonValue::object(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  auto error = mcp::get<Error>(result);
  EXPECT_TRUE(error.message.find("not found") != std::string::npos);
}

TEST_F(ToolRegistryTest, ExecuteToolWithError) {
  registry_->addSyncTool(
      "failing", "Always fails", makeSchema(),
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(Error(-1, "Intentional failure"));
      });

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeTool("failing", JsonValue::object(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "Intentional failure");
}

TEST_F(ToolRegistryTest, ExecuteToolCall) {
  registry_->addSyncTool(
      "greet", "Greet someone", makeSchema(),
      [](const JsonValue& args) -> Result<JsonValue> {
        std::string name = args.contains("name") ? args["name"].getString() : "World";
        JsonValue result = JsonValue::object();
        result["greeting"] = "Hello, " + name + "!";
        return Result<JsonValue>(result);
      });

  JsonValue args = JsonValue::object();
  args["name"] = "Alice";

  ToolCall call("call_123", "greet", args);

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeToolCall(call, d, std::move(cb));
      });

  EXPECT_EQ(result["greeting"].getString(), "Hello, Alice!");
}

TEST_F(ToolRegistryTest, ExecuteMultipleToolCalls) {
  registry_->addSyncTool(
      "double", "Double a number", makeSchema(),
      [](const JsonValue& args) -> Result<JsonValue> {
        int n = args.contains("n") ? args["n"].getInt() : 0;
        return Result<JsonValue>(JsonValue(n * 2));
      });

  registry_->addSyncTool(
      "triple", "Triple a number", makeSchema(),
      [](const JsonValue& args) -> Result<JsonValue> {
        int n = args.contains("n") ? args["n"].getInt() : 0;
        return Result<JsonValue>(JsonValue(n * 3));
      });

  JsonValue args1 = JsonValue::object();
  args1["n"] = 5;
  JsonValue args2 = JsonValue::object();
  args2["n"] = 10;

  std::vector<ToolCall> calls = {
      ToolCall("call_1", "double", args1),
      ToolCall("call_2", "triple", args2)};

  std::vector<Result<JsonValue>> results;

  std::mutex mutex;
  std::condition_variable cv;
  bool done = false;

  executor_->executeToolCalls(
      calls, true, *dispatcher_,
      [&](std::vector<Result<JsonValue>> r) {
        std::lock_guard<std::mutex> lock(mutex);
        results = std::move(r);
        done = true;
        cv.notify_one();
      });

  while (true) {
    {
      std::unique_lock<std::mutex> lock(mutex);
      if (done) break;
    }
    dispatcher_->run(mcp::event::RunType::NonBlock);
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }

  ASSERT_EQ(results.size(), 2u);
  EXPECT_TRUE(mcp::holds_alternative<JsonValue>(results[0]));
  EXPECT_TRUE(mcp::holds_alternative<JsonValue>(results[1]));
  EXPECT_EQ(mcp::get<JsonValue>(results[0]).getInt(), 10);   // 5 * 2
  EXPECT_EQ(mcp::get<JsonValue>(results[1]).getInt(), 30);   // 10 * 3
}

// =============================================================================
// Server Integration Tests
// =============================================================================

TEST_F(ToolRegistryTest, AddServerWithToolList) {
  // Add tools to mock server
  mock_server_->addTool("server_tool1", "Server tool 1");
  mock_server_->addTool("server_tool2", "Server tool 2");
  mock_server_->setResponse("server_tool1", JsonValue("result1"));
  mock_server_->setResponse("server_tool2", JsonValue("result2"));

  // Connect server
  mock_server_->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  // Get tool list from server
  auto tools = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        mock_server_->listTools(d, std::move(cb));
      });

  // Add server with tools
  registry_->addServer(mock_server_, tools);

  EXPECT_TRUE(registry_->hasTool("server_tool1"));
  EXPECT_TRUE(registry_->hasTool("server_tool2"));

  // Check prefixed names also work
  EXPECT_TRUE(registry_->hasTool("test-server:server_tool1"));
}

TEST_F(ToolRegistryTest, ExecuteServerTool) {
  mock_server_->addTool("remote_calc", "Remote calculation");

  JsonValue calc_result = JsonValue::object();
  calc_result["answer"] = 42;
  mock_server_->setResponse("remote_calc", calc_result);

  mock_server_->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  auto tools = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        mock_server_->listTools(d, std::move(cb));
      });

  registry_->addServer(mock_server_, tools);

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeTool("remote_calc", JsonValue::object(), d, std::move(cb));
      });

  EXPECT_EQ(result["answer"].getInt(), 42);
  EXPECT_EQ(mock_server_->callCount("remote_calc"), 1u);
}

TEST_F(ToolRegistryTest, AddServerToolWithAlias) {
  mock_server_->addTool("original_name", "Original tool");
  mock_server_->setResponse("original_name", JsonValue("ok"));

  mock_server_->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  ToolInfo info("original_name", "Original tool");
  registry_->addServerTool(mock_server_, info, "aliased_name");

  EXPECT_TRUE(registry_->hasTool("aliased_name"));
  EXPECT_FALSE(registry_->hasTool("original_name"));

  // Execute via alias
  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor_->executeTool("aliased_name", JsonValue::object(), d, std::move(cb));
      });

  EXPECT_EQ(result.getString(), "ok");
}

// =============================================================================
// Tool Management Tests
// =============================================================================

TEST_F(ToolRegistryTest, RemoveTool) {
  registry_->addSyncTool("temp_tool", "Temporary", makeSchema(),
                         [](const JsonValue&) -> Result<JsonValue> {
                           return Result<JsonValue>(JsonValue("temp"));
                         });

  EXPECT_TRUE(registry_->hasTool("temp_tool"));
  EXPECT_EQ(registry_->toolCount(), 1u);

  registry_->removeTool("temp_tool");

  EXPECT_FALSE(registry_->hasTool("temp_tool"));
  EXPECT_EQ(registry_->toolCount(), 0u);
}

TEST_F(ToolRegistryTest, Clear) {
  registry_->addTool("tool1", "Tool 1", makeSchema(),
                     [](const JsonValue&, Dispatcher&, JsonCallback cb) {
                       cb(Result<JsonValue>(JsonValue(1)));
                     });
  registry_->addTool("tool2", "Tool 2", makeSchema(),
                     [](const JsonValue&, Dispatcher&, JsonCallback cb) {
                       cb(Result<JsonValue>(JsonValue(2)));
                     });

  EXPECT_EQ(registry_->toolCount(), 2u);

  registry_->clear();

  EXPECT_EQ(registry_->toolCount(), 0u);
  EXPECT_TRUE(registry_->getToolSpecs().empty());
}

TEST_F(ToolRegistryTest, GetToolEntry) {
  registry_->addTool("local_tool", "Local", makeSchema(),
                     [](const JsonValue&, Dispatcher&, JsonCallback cb) {
                       cb(Result<JsonValue>(JsonValue("local")));
                     });

  auto entry = registry_->getToolEntry("local_tool");
  ASSERT_TRUE(entry.has_value());
  EXPECT_EQ(entry->spec.name, "local_tool");
  EXPECT_TRUE(entry->isLocal());
  EXPECT_FALSE(entry->isRemote());
  EXPECT_EQ(entry->server, nullptr);

  auto missing = registry_->getToolEntry("nonexistent");
  EXPECT_FALSE(missing.has_value());
}

// =============================================================================
// Conversion Utility Tests
// =============================================================================

TEST(ToolConversionTest, ToolInfoToToolSpec) {
  ToolInfo info;
  info.name = "test_tool";
  info.description = "Test description";
  info.inputSchema = JsonValue::object();
  info.inputSchema["type"] = "object";

  ToolSpec spec = toToolSpec(info);

  EXPECT_EQ(spec.name, "test_tool");
  EXPECT_EQ(spec.description, "Test description");
  EXPECT_TRUE(spec.parameters.contains("type"));
}

TEST(ToolConversionTest, ToolSpecToToolInfo) {
  ToolSpec spec;
  spec.name = "another_tool";
  spec.description = "Another description";
  spec.parameters = JsonValue::object();
  spec.parameters["type"] = "object";

  ToolInfo info = toToolInfo(spec);

  EXPECT_EQ(info.name, "another_tool");
  EXPECT_EQ(info.description, "Another description");
  EXPECT_TRUE(info.inputSchema.contains("type"));
}

// =============================================================================
// Environment Variable Tests
// =============================================================================

TEST_F(ToolRegistryTest, SetEnvVariable) {
  registry_->setEnv("API_KEY", "secret123");
  registry_->setEnv("BASE_URL", "https://api.example.com");

  // Env vars are used during config loading
  // This test just verifies they can be set without errors
  SUCCEED();
}

// =============================================================================
// ConfigLoader Tests
// =============================================================================

class ConfigLoaderTest : public OrchTest {
 protected:
  ConfigLoader loader_;

  void SetUp() override {
    OrchTest::SetUp();
    loader_.setEnv("API_KEY", "test-key-123");
    loader_.setEnv("BASE_URL", "https://api.test.com");
  }
};

TEST_F(ConfigLoaderTest, SubstituteEnvVars) {
  std::string input = "Key: ${API_KEY}, URL: ${BASE_URL}";
  std::string result = loader_.substituteEnvVars(input);

  EXPECT_EQ(result, "Key: test-key-123, URL: https://api.test.com");
}

TEST_F(ConfigLoaderTest, SubstituteUnknownVar) {
  std::string input = "Unknown: ${UNKNOWN_VAR}";
  std::string result = loader_.substituteEnvVars(input);

  // Unknown variables are replaced with empty string
  EXPECT_EQ(result, "Unknown: ");
}

TEST_F(ConfigLoaderTest, ParseHttpMethod) {
  // Access private method via public API
  // We test this indirectly through tool definition parsing
  std::string json = R"({
    "name": "test_tool",
    "description": "Test",
    "rest_endpoint": {
      "method": "POST",
      "url": "https://api.test.com/endpoint"
    }
  })";

  auto result = loader_.loadFromString("{\"tools\": [" + json + "]}");
  EXPECT_TRUE(mcp::holds_alternative<RegistryConfig>(result));

  auto config = mcp::get<RegistryConfig>(result);
  ASSERT_EQ(config.tools.size(), 1u);
  ASSERT_TRUE(config.tools[0].rest_endpoint.has_value());
  EXPECT_EQ(config.tools[0].rest_endpoint->method, HttpMethod::POST);
}

TEST_F(ConfigLoaderTest, ParseToolDefinition) {
  std::string json = R"({
    "name": "search",
    "description": "Search the web",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": {"type": "string"}
      }
    },
    "tags": ["search", "web"],
    "require_approval": true
  })";

  auto result = loader_.parseToolDefinition(JsonValue::parse(json));
  EXPECT_TRUE(mcp::holds_alternative<ToolDefinition>(result));

  auto def = mcp::get<ToolDefinition>(result);
  EXPECT_EQ(def.name, "search");
  EXPECT_EQ(def.description, "Search the web");
  EXPECT_EQ(def.tags.size(), 2u);
  EXPECT_TRUE(def.require_approval);
  EXPECT_TRUE(def.input_schema.contains("properties"));
}

TEST_F(ConfigLoaderTest, ParseToolDefinitionMissingName) {
  std::string json = R"({
    "description": "No name provided"
  })";

  auto result = loader_.parseToolDefinition(JsonValue::parse(json));
  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

TEST_F(ConfigLoaderTest, ParseMCPServerDefinition) {
  std::string json = R"({
    "name": "mcp-server",
    "transport": "stdio",
    "stdio": {
      "command": "node",
      "args": ["server.js"],
      "working_directory": "/app"
    },
    "connect_timeout_ms": 5000,
    "request_timeout_ms": 30000,
    "max_retries": 3
  })";

  auto result = loader_.parseMCPServerDefinition(JsonValue::parse(json));
  EXPECT_TRUE(mcp::holds_alternative<MCPServerDefinition>(result));

  auto def = mcp::get<MCPServerDefinition>(result);
  EXPECT_EQ(def.name, "mcp-server");
  EXPECT_EQ(def.transport, MCPServerDefinition::TransportType::STDIO);
  ASSERT_TRUE(def.stdio_config.has_value());
  EXPECT_EQ(def.stdio_config->command, "node");
  EXPECT_EQ(def.stdio_config->args.size(), 1u);
  EXPECT_EQ(def.stdio_config->args[0], "server.js");
  EXPECT_EQ(def.connect_timeout, std::chrono::milliseconds(5000));
  EXPECT_EQ(def.request_timeout, std::chrono::milliseconds(30000));
  EXPECT_EQ(def.max_retries, 3u);
}

TEST_F(ConfigLoaderTest, ParseHTTPSSEServer) {
  std::string json = R"({
    "name": "sse-server",
    "transport": "http_sse",
    "http_sse": {
      "url": "${BASE_URL}/sse",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      },
      "verify_ssl": false
    }
  })";

  auto result = loader_.parseMCPServerDefinition(JsonValue::parse(json));
  EXPECT_TRUE(mcp::holds_alternative<MCPServerDefinition>(result));

  auto def = mcp::get<MCPServerDefinition>(result);
  EXPECT_EQ(def.transport, MCPServerDefinition::TransportType::HTTP_SSE);
  ASSERT_TRUE(def.http_sse_config.has_value());
  EXPECT_EQ(def.http_sse_config->url, "https://api.test.com/sse");
  EXPECT_EQ(def.http_sse_config->headers["Authorization"], "Bearer test-key-123");
  EXPECT_FALSE(def.http_sse_config->verify_ssl);
}

TEST_F(ConfigLoaderTest, ParseAuthPreset) {
  std::string json = R"({
    "type": "bearer",
    "value": "${API_KEY}",
    "header": "X-Custom-Auth"
  })";

  auto result = loader_.parseAuthPreset(JsonValue::parse(json));
  EXPECT_TRUE(mcp::holds_alternative<AuthPreset>(result));

  auto auth = mcp::get<AuthPreset>(result);
  EXPECT_EQ(auth.type, AuthPreset::Type::BEARER);
  EXPECT_EQ(auth.value, "test-key-123");
  EXPECT_EQ(auth.header, "X-Custom-Auth");
}

TEST_F(ConfigLoaderTest, LoadFromString) {
  std::string json = R"({
    "name": "test-registry",
    "base_url": "${BASE_URL}",
    "default_headers": {
      "X-API-Key": "${API_KEY}"
    },
    "tools": [
      {
        "name": "tool1",
        "description": "First tool"
      },
      {
        "name": "tool2",
        "description": "Second tool"
      }
    ],
    "mcp_servers": [
      {
        "name": "server1",
        "transport": "stdio",
        "stdio": {
          "command": "node",
          "args": ["server.js"]
        }
      }
    ]
  })";

  auto result = loader_.loadFromString(json);
  EXPECT_TRUE(mcp::holds_alternative<RegistryConfig>(result));

  auto config = mcp::get<RegistryConfig>(result);
  EXPECT_EQ(config.name, "test-registry");
  EXPECT_EQ(config.base_url, "https://api.test.com");
  EXPECT_EQ(config.default_headers["X-API-Key"], "test-key-123");
  EXPECT_EQ(config.tools.size(), 2u);
  EXPECT_EQ(config.mcp_servers.size(), 1u);
}

TEST_F(ConfigLoaderTest, LoadFromStringInvalidJson) {
  std::string invalid_json = "{ invalid json }";

  auto result = loader_.loadFromString(invalid_json);
  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

// =============================================================================
// ToolDefinition Tests
// =============================================================================

TEST(ToolDefinitionTest, ToToolSpec) {
  ToolDefinition def;
  def.name = "test_tool";
  def.description = "Test description";
  def.input_schema = JsonValue::object();
  def.input_schema["type"] = "object";

  ToolSpec spec = def.toToolSpec();

  EXPECT_EQ(spec.name, "test_tool");
  EXPECT_EQ(spec.description, "Test description");
  EXPECT_TRUE(spec.parameters.contains("type"));
}

TEST(ToolDefinitionTest, RESTEndpoint) {
  ToolDefinition::RESTEndpoint rest;
  rest.method = HttpMethod::POST;
  rest.url = "https://api.example.com/search";
  rest.headers["Content-Type"] = "application/json";
  rest.body_mapping["query"] = "$.input.query";

  EXPECT_EQ(rest.method, HttpMethod::POST);
  EXPECT_EQ(rest.url, "https://api.example.com/search");
  EXPECT_EQ(rest.headers["Content-Type"], "application/json");
}

TEST(ToolDefinitionTest, MCPReference) {
  ToolDefinition::MCPReference ref;
  ref.server_name = "mcp-server";
  ref.tool_name = "remote_tool";

  EXPECT_EQ(ref.server_name, "mcp-server");
  EXPECT_EQ(ref.tool_name, "remote_tool");
}

TEST(MCPServerDefinitionTest, TransportTypes) {
  MCPServerDefinition stdio_server;
  stdio_server.transport = MCPServerDefinition::TransportType::STDIO;
  EXPECT_EQ(stdio_server.transport, MCPServerDefinition::TransportType::STDIO);

  MCPServerDefinition sse_server;
  sse_server.transport = MCPServerDefinition::TransportType::HTTP_SSE;
  EXPECT_EQ(sse_server.transport, MCPServerDefinition::TransportType::HTTP_SSE);

  MCPServerDefinition ws_server;
  ws_server.transport = MCPServerDefinition::TransportType::WEBSOCKET;
  EXPECT_EQ(ws_server.transport, MCPServerDefinition::TransportType::WEBSOCKET);
}

TEST(AuthPresetTest, Types) {
  AuthPreset bearer;
  bearer.type = AuthPreset::Type::BEARER;
  bearer.value = "token123";
  EXPECT_EQ(bearer.type, AuthPreset::Type::BEARER);

  AuthPreset api_key;
  api_key.type = AuthPreset::Type::API_KEY;
  api_key.value = "key123";
  api_key.header = "X-API-Key";
  EXPECT_EQ(api_key.type, AuthPreset::Type::API_KEY);

  AuthPreset basic;
  basic.type = AuthPreset::Type::BASIC;
  basic.value = "user:pass";
  EXPECT_EQ(basic.type, AuthPreset::Type::BASIC);
}

// =============================================================================
// ToolExecutor Tests
// =============================================================================

class ToolExecutorTest : public OrchTest {
 protected:
  ToolRegistryPtr registry_;
  ToolExecutorPtr executor_;

  void SetUp() override {
    OrchTest::SetUp();
    registry_ = makeToolRegistry();
    executor_ = makeToolExecutor(registry_);
  }
};

TEST_F(ToolExecutorTest, CreateExecutor) {
  EXPECT_NE(executor_, nullptr);
  EXPECT_EQ(executor_->registry(), registry_);
}

TEST_F(ToolExecutorTest, ExecuteWithNoRegistry) {
  auto executor = makeToolExecutor(nullptr);

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, JsonCallback cb) {
        executor->executeTool("any_tool", JsonValue::object(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  auto error = mcp::get<Error>(result);
  EXPECT_TRUE(error.message.find("No registry") != std::string::npos);
}

TEST_F(ToolExecutorTest, ExecuteEmptyToolCalls) {
  std::vector<ToolCall> empty_calls;
  std::vector<Result<JsonValue>> results;
  bool done = false;

  executor_->executeToolCalls(empty_calls, true, *dispatcher_,
      [&](std::vector<Result<JsonValue>> r) {
        results = std::move(r);
        done = true;
      });

  while (!done) {
    dispatcher_->run(mcp::event::RunType::NonBlock);
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }

  EXPECT_TRUE(results.empty());
}
