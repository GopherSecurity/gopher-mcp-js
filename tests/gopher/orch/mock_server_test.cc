// Unit tests for MockServer

#include "orch_test_fixture.h"

// =============================================================================
// MockServer Tests
// =============================================================================

TEST_F(OrchTest, MockServerBasic) {
  auto server = makeMockServer("test-server");

  JsonValue response = JsonValue::object();
  response["message"] = JsonValue("Hello!");

  server->addTool("greet", "Greets a person").setResponse("greet", response);

  EXPECT_EQ(server->name(), "test-server");
  EXPECT_EQ(server->connectionState(), ConnectionState::DISCONNECTED);

  // Connect
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });

  EXPECT_TRUE(server->isConnected());

  // List tools
  auto tools = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        server->listTools(d, std::move(cb));
      });

  EXPECT_EQ(tools.size(), 1u);
  EXPECT_EQ(tools[0].name, "greet");

  // Get tool
  auto greet = server->tool("greet");
  EXPECT_NE(greet, nullptr);
  EXPECT_EQ(greet->name(), "greet");

  // Call tool
  JsonValue toolResult =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        greet->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(toolResult["message"].getString(), "Hello!");
  EXPECT_EQ(server->callCount("greet"), 1u);
}

TEST_F(OrchTest, MockServerCustomHandler) {
  auto server = makeMockServer("handler-server");

  server->addTool("echo").setHandler(
      "echo", [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["echoed"] = args;
        return makeSuccess(JsonValue(result));
      });

  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  auto echo = server->tool("echo");

  JsonValue input = JsonValue::object();
  input["data"] = JsonValue("test");

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        echo->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["echoed"]["data"].getString(), "test");
}

TEST_F(OrchTest, MockServerToolNotFound) {
  auto server = makeMockServer("empty-server");
  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  EXPECT_EQ(server->tool("nonexistent"), nullptr);
}

TEST_F(OrchTest, MockServerError) {
  auto server = makeMockServer("error-server");

  server->addTool("fail").setError("fail", OrchError::INTERNAL_ERROR,
                                   "Simulated failure");

  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  auto fail = server->tool("fail");

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        fail->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::INTERNAL_ERROR);
  EXPECT_EQ(mcp::get<Error>(result).message, "Simulated failure");
}

// =============================================================================
// JSON Serialization/Deserialization Tests
// =============================================================================

TEST_F(OrchTest, MockServerFromJsonBasic) {
  JsonValue json = JsonValue::object();
  json["serverName"] = JsonValue("server1");
  
  JsonValue tools = JsonValue::array();
  JsonValue tool1 = JsonValue::object();
  tool1["name"] = JsonValue("tool11");
  tool1["description"] = JsonValue("description11");
  tools.push_back(tool1);
  
  JsonValue tool2 = JsonValue::object();
  tool2["name"] = JsonValue("tool12");
  tool2["description"] = JsonValue("description12");
  tools.push_back(tool2);
  
  json["tools"] = tools;
  
  auto result = MockServer::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<std::shared_ptr<MockServer>>(result));
  
  auto server = mcp::get<std::shared_ptr<MockServer>>(result);
  EXPECT_EQ(server->name(), "server1");
  EXPECT_EQ(server->id(), "mock-server1");  // Default id
  
  // Connect and list tools
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });
  
  auto toolsList = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        server->listTools(d, std::move(cb));
      });
  
  ASSERT_EQ(toolsList.size(), 2u);
  EXPECT_EQ(toolsList[0].name, "tool11");
  EXPECT_EQ(toolsList[0].description, "description11");
  EXPECT_EQ(toolsList[1].name, "tool12");
  EXPECT_EQ(toolsList[1].description, "description12");
}

TEST_F(OrchTest, MockServerFromJsonWithId) {
  JsonValue json = JsonValue::object();
  json["serverName"] = JsonValue("test-server");
  json["id"] = JsonValue("custom-id");
  
  auto result = MockServer::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<std::shared_ptr<MockServer>>(result));
  
  auto server = mcp::get<std::shared_ptr<MockServer>>(result);
  EXPECT_EQ(server->name(), "test-server");
  EXPECT_EQ(server->id(), "custom-id");
}

TEST_F(OrchTest, MockServerFromJsonWithToolSchema) {
  JsonValue json = JsonValue::object();
  json["serverName"] = JsonValue("schema-server");
  
  JsonValue tools = JsonValue::array();
  JsonValue tool = JsonValue::object();
  tool["name"] = JsonValue("calculator");
  tool["description"] = JsonValue("Performs calculations");
  
  // Add input schema
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("object");
  JsonValue properties = JsonValue::object();
  properties["operation"] = JsonValue::object();
  properties["operation"]["type"] = JsonValue("string");
  schema["properties"] = properties;
  tool["inputSchema"] = schema;
  
  tools.push_back(tool);
  json["tools"] = tools;
  
  auto result = MockServer::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<std::shared_ptr<MockServer>>(result));
  
  auto server = mcp::get<std::shared_ptr<MockServer>>(result);
  
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });
  
  auto toolsList = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        server->listTools(d, std::move(cb));
      });
  
  ASSERT_EQ(toolsList.size(), 1u);
  EXPECT_EQ(toolsList[0].name, "calculator");
  EXPECT_TRUE(toolsList[0].inputSchema.isObject());
  EXPECT_EQ(toolsList[0].inputSchema["type"].getString(), "object");
}

TEST_F(OrchTest, MockServerFromJsonWithResponse) {
  JsonValue json = JsonValue::object();
  json["serverName"] = JsonValue("response-server");
  
  JsonValue tools = JsonValue::array();
  JsonValue tool = JsonValue::object();
  tool["name"] = JsonValue("greet");
  tool["description"] = JsonValue("Greeting tool");
  
  // Add default response
  JsonValue response = JsonValue::object();
  response["message"] = JsonValue("Hello from JSON!");
  tool["response"] = response;
  
  tools.push_back(tool);
  json["tools"] = tools;
  
  auto result = MockServer::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<std::shared_ptr<MockServer>>(result));
  
  auto server = mcp::get<std::shared_ptr<MockServer>>(result);
  
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });
  
  auto greet = server->tool("greet");
  ASSERT_NE(greet, nullptr);
  
  JsonValue toolResult =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        greet->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });
  
  EXPECT_EQ(toolResult["message"].getString(), "Hello from JSON!");
}

TEST_F(OrchTest, MockServerFromJsonInvalid) {
  // Test: Not an object
  {
    JsonValue json = JsonValue::array();
    auto result = MockServer::fromJson(json);
    EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  }
  
  // Test: Missing serverName
  {
    JsonValue json = JsonValue::object();
    json["tools"] = JsonValue::array();
    auto result = MockServer::fromJson(json);
    EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  }
  
  // Test: Invalid serverName type
  {
    JsonValue json = JsonValue::object();
    json["serverName"] = JsonValue(123);
    auto result = MockServer::fromJson(json);
    EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  }
  
  // Test: Invalid tools type
  {
    JsonValue json = JsonValue::object();
    json["serverName"] = JsonValue("server");
    json["tools"] = JsonValue("not_an_array");
    auto result = MockServer::fromJson(json);
    EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  }
}

TEST_F(OrchTest, MockServerToJson) {
  auto server = makeMockServer("json-server", "custom-id");
  
  // Add tools
  server->addTool("tool1", "First tool");
  
  ToolInfo tool2("tool2", "Second tool");
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("string");
  tool2.inputSchema = schema;
  server->addTool(tool2);
  
  // Set some responses
  JsonValue response = JsonValue::object();
  response["data"] = JsonValue("test");
  server->setResponse("tool1", response);
  
  // Convert to JSON
  JsonValue json = server->toJson();
  
  EXPECT_TRUE(json.isObject());
  EXPECT_EQ(json["serverName"].getString(), "json-server");
  EXPECT_EQ(json["id"].getString(), "custom-id");
  
  EXPECT_TRUE(json.contains("tools"));
  EXPECT_TRUE(json["tools"].isArray());
  EXPECT_EQ(json["tools"].size(), 2u);
  
  EXPECT_EQ(json["tools"][0]["name"].getString(), "tool1");
  EXPECT_EQ(json["tools"][0]["description"].getString(), "First tool");
  
  EXPECT_EQ(json["tools"][1]["name"].getString(), "tool2");
  EXPECT_EQ(json["tools"][1]["description"].getString(), "Second tool");
  EXPECT_TRUE(json["tools"][1].contains("inputSchema"));
  
  // Should include configs since we set a response
  EXPECT_TRUE(json.contains("configs"));
  EXPECT_TRUE(json["configs"]["tool1"].contains("response"));
}

TEST_F(OrchTest, MockServerRoundTrip) {
  // Create original server
  auto original = makeMockServer("roundtrip-server");
  
  ToolInfo tool1("fetch", "Fetch data");
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("object");
  tool1.inputSchema = schema;
  original->addTool(tool1);
  
  original->addTool("process", "Process data");
  
  JsonValue response = JsonValue::object();
  response["status"] = JsonValue("success");
  original->setResponse("fetch", response);
  
  // Convert to JSON
  JsonValue json = original->toJson();
  
  // Create new server from JSON
  auto result = MockServer::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<std::shared_ptr<MockServer>>(result));
  auto restored = mcp::get<std::shared_ptr<MockServer>>(result);
  
  // Verify they match
  EXPECT_EQ(original->name(), restored->name());
  EXPECT_EQ(original->id(), restored->id());
  
  // Connect both servers
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        original->connect(d, std::move(cb));
      });
  
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        restored->connect(d, std::move(cb));
      });
  
  // Compare tools
  auto originalTools = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        original->listTools(d, std::move(cb));
      });
  
  auto restoredTools = runToCompletion<std::vector<ToolInfo>>(
      [&](Dispatcher& d, ToolListCallback cb) {
        restored->listTools(d, std::move(cb));
      });
  
  ASSERT_EQ(originalTools.size(), restoredTools.size());
  for (size_t i = 0; i < originalTools.size(); ++i) {
    EXPECT_EQ(originalTools[i], restoredTools[i]);
  }
}

TEST_F(OrchTest, MockServerComplexJsonExample) {
  // Test the exact JSON format specified in requirements
  std::string jsonStr = R"({
    "serverName": "server1",
    "tools": [
      {"name": "tool11", "description": "description11"},
      {"name": "tool12", "description": "description12"}
    ]
  })";
  
  // Parse JSON string using JsonValue's parse method
  // Note: parse() throws an exception on error, doesn't return Result
  JsonValue json;
  ASSERT_NO_THROW(json = JsonValue::parse(jsonStr));
  
  // Verify the parsed JSON has the expected structure
  ASSERT_TRUE(json.isObject());
  ASSERT_TRUE(json.contains("serverName"));
  ASSERT_TRUE(json.contains("tools"));
  EXPECT_EQ(json["serverName"].getString(), "server1");
  ASSERT_TRUE(json["tools"].isArray());
  EXPECT_EQ(json["tools"].size(), 2u);
  
  // Create server from JSON
  auto result = MockServer::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<std::shared_ptr<MockServer>>(result));
  
  auto server = mcp::get<std::shared_ptr<MockServer>>(result);
  EXPECT_EQ(server->name(), "server1");
  
  // Verify tools were created correctly
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        server->connect(d, std::move(cb));
      });
  
  auto tool11_ptr = server->tool("tool11");
  auto tool12_ptr = server->tool("tool12");
  
  EXPECT_NE(tool11_ptr, nullptr);
  EXPECT_NE(tool12_ptr, nullptr);
  EXPECT_EQ(tool11_ptr->name(), "tool11");
  EXPECT_EQ(tool12_ptr->name(), "tool12");
}
