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
  auto tools = runToCompletion<std::vector<ServerToolInfo>>(
      [&](Dispatcher& d, ServerToolListCallback cb) {
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
