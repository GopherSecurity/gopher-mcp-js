// Integration tests for gopher-orch framework
// Tests combining multiple components together

#include "orch_test_fixture.h"

// =============================================================================
// Integration Tests
// =============================================================================

TEST_F(OrchTest, SequenceWithServer) {
  // Create a workflow that uses server tools
  auto server = makeMockServer("workflow-server");

  server->addTool("fetch", "Fetch data")
      .setHandler("fetch", [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["data"] = "fetched-" + args["id"].getString();
        return makeSuccess(result);
      });

  server->addTool("process", "Process data")
      .setHandler("process", [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["processed"] = args["data"].getString() + "-processed";
        return makeSuccess(result);
      });

  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(core::Dispatcher::RunMode::NonBlock);

  // Build workflow: fetch -> process
  auto workflow = sequence("FetchAndProcess")
                      .add(server->tool("fetch"))
                      .add(server->tool("process"))
                      .build();

  JsonValue input = JsonValue::object();
  input["id"] = "123";

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        workflow->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["processed"].getString(), "fetched-123-processed");
}

TEST_F(OrchTest, ParallelWithServerTools) {
  auto server = makeMockServer("parallel-server");

  server->addTool("tool_a").setHandler(
      "tool_a", [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["from"] = "tool_a";
        return makeSuccess(result);
      });

  server->addTool("tool_b").setHandler(
      "tool_b", [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["from"] = "tool_b";
        return makeSuccess(result);
      });

  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(core::Dispatcher::RunMode::NonBlock);

  auto workflow = parallel("ParallelTools")
                      .add("a", server->tool("tool_a"))
                      .add("b", server->tool("tool_b"))
                      .build();

  JsonValue result = runToCompletion<JsonValue>([&](Dispatcher& d,
                                                    JsonCallback cb) {
    workflow->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
  });

  EXPECT_EQ(result["a"]["from"].getString(), "tool_a");
  EXPECT_EQ(result["b"]["from"].getString(), "tool_b");
}
