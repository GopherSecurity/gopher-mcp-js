// Unit tests for ToolRunnable

#include "gopher/orch/agent/tool_runnable.h"

#include "orch_test_fixture.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// =============================================================================
// ToolRunnable Test Fixture
// =============================================================================

class ToolRunnableTest : public OrchTest {
 protected:
  ToolRegistryPtr registry_;
  ToolExecutorPtr executor_;
  ToolRunnable::Ptr tool_runnable_;

  void SetUp() override {
    OrchTest::SetUp();
    registry_ = makeToolRegistry();
    executor_ = makeToolExecutor(registry_);
    tool_runnable_ = ToolRunnable::create(executor_);

    // Add some test tools
    addTestTools();
  }

  void addTestTools() {
    // Calculator tool - synchronous
    registry_->addSyncTool(
        "calculator", "Perform calculations", makeSchema(),
        [](const JsonValue& args) -> Result<JsonValue> {
          if (args.contains("expression") && args["expression"].isString()) {
            std::string expr = args["expression"].getString();
            if (expr == "2+2") {
              return Result<JsonValue>(JsonValue(4));
            }
          }
          return Result<JsonValue>(JsonValue(0));
        });

    // Search tool - asynchronous
    registry_->addTool(
        "search", "Search the web", makeSchema(),
        [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
          std::string query = "default";
          if (args.contains("query") && args["query"].isString()) {
            query = args["query"].getString();
          }

          JsonValue result = JsonValue::object();
          result["query"] = query;
          result["results"] = JsonValue::array();

          d.post([cb = std::move(cb), result = std::move(result)]() mutable {
            cb(Result<JsonValue>(std::move(result)));
          });
        });

    // Failing tool
    registry_->addTool(
        "failing_tool", "Always fails", makeSchema(),
        [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
          d.post([cb = std::move(cb)]() {
            cb(Result<JsonValue>(Error(-1, "Tool execution failed")));
          });
        });
  }

  JsonValue makeSchema() {
    JsonValue schema = JsonValue::object();
    schema["type"] = "object";
    return schema;
  }
};

// =============================================================================
// Basic Tests
// =============================================================================

TEST_F(ToolRunnableTest, Name) {
  EXPECT_EQ(tool_runnable_->name(), "ToolRunnable");
}

TEST_F(ToolRunnableTest, Accessors) {
  EXPECT_EQ(tool_runnable_->executor(), executor_);
  EXPECT_EQ(tool_runnable_->registry(), registry_);
}

// =============================================================================
// Single Tool Call Tests
// =============================================================================

TEST_F(ToolRunnableTest, SingleToolCall) {
  JsonValue input = JsonValue::object();
  input["name"] = "calculator";
  JsonValue args = JsonValue::object();
  args["expression"] = "2+2";
  input["arguments"] = args;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.isObject());
  EXPECT_TRUE(result["success"].getBool());
  EXPECT_EQ(result["result"].getInt(), 4);
}

TEST_F(ToolRunnableTest, SingleToolCallWithId) {
  JsonValue input = JsonValue::object();
  input["id"] = "call_123";
  input["name"] = "calculator";
  JsonValue args = JsonValue::object();
  args["expression"] = "2+2";
  input["arguments"] = args;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result["success"].getBool());
  EXPECT_EQ(result["id"].getString(), "call_123");
  EXPECT_EQ(result["result"].getInt(), 4);
}

TEST_F(ToolRunnableTest, AsyncToolCall) {
  JsonValue input = JsonValue::object();
  input["name"] = "search";
  JsonValue args = JsonValue::object();
  args["query"] = "weather in tokyo";
  input["arguments"] = args;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result["success"].getBool());
  EXPECT_TRUE(result["result"].isObject());
  EXPECT_EQ(result["result"]["query"].getString(), "weather in tokyo");
}

TEST_F(ToolRunnableTest, ToolNotFound) {
  JsonValue input = JsonValue::object();
  input["name"] = "nonexistent_tool";
  input["arguments"] = JsonValue::object();

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Should return success with error in JSON, not fail the Result
  EXPECT_TRUE(result.isObject());
  EXPECT_FALSE(result["success"].getBool());
  EXPECT_TRUE(result.contains("error"));
}

TEST_F(ToolRunnableTest, ToolExecutionFails) {
  JsonValue input = JsonValue::object();
  input["id"] = "call_fail";
  input["name"] = "failing_tool";
  input["arguments"] = JsonValue::object();

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_FALSE(result["success"].getBool());
  EXPECT_EQ(result["id"].getString(), "call_fail");
  EXPECT_EQ(result["error"].getString(), "Tool execution failed");
}

TEST_F(ToolRunnableTest, MissingToolName) {
  JsonValue input = JsonValue::object();
  input["arguments"] = JsonValue::object();
  // No "name" field

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message,
            "Invalid tool call input: missing 'name' field");
}

TEST_F(ToolRunnableTest, DefaultArguments) {
  // Arguments should default to empty object if not provided
  JsonValue input = JsonValue::object();
  input["name"] = "search";
  // No "arguments" field

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result["success"].getBool());
  EXPECT_EQ(result["result"]["query"].getString(), "default");
}

// =============================================================================
// Multiple Tool Calls Tests
// =============================================================================

TEST_F(ToolRunnableTest, MultipleToolCalls) {
  JsonValue input = JsonValue::object();
  JsonValue calls = JsonValue::array();

  // First call
  JsonValue call1 = JsonValue::object();
  call1["id"] = "call_1";
  call1["name"] = "calculator";
  JsonValue args1 = JsonValue::object();
  args1["expression"] = "2+2";
  call1["arguments"] = args1;
  calls.push_back(call1);

  // Second call
  JsonValue call2 = JsonValue::object();
  call2["id"] = "call_2";
  call2["name"] = "search";
  JsonValue args2 = JsonValue::object();
  args2["query"] = "test query";
  call2["arguments"] = args2;
  calls.push_back(call2);

  input["tool_calls"] = calls;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.contains("results"));
  EXPECT_TRUE(result["results"].isArray());
  EXPECT_EQ(result["results"].size(), 2u);

  // First result
  auto& result1 = result["results"][0];
  EXPECT_EQ(result1["id"].getString(), "call_1");
  EXPECT_TRUE(result1["success"].getBool());
  EXPECT_EQ(result1["result"].getInt(), 4);

  // Second result
  auto& result2 = result["results"][1];
  EXPECT_EQ(result2["id"].getString(), "call_2");
  EXPECT_TRUE(result2["success"].getBool());
  EXPECT_EQ(result2["result"]["query"].getString(), "test query");
}

TEST_F(ToolRunnableTest, MultipleToolCallsWithFailure) {
  JsonValue input = JsonValue::object();
  JsonValue calls = JsonValue::array();

  // Successful call
  JsonValue call1 = JsonValue::object();
  call1["id"] = "call_1";
  call1["name"] = "calculator";
  JsonValue args1 = JsonValue::object();
  args1["expression"] = "2+2";
  call1["arguments"] = args1;
  calls.push_back(call1);

  // Failing call
  JsonValue call2 = JsonValue::object();
  call2["id"] = "call_2";
  call2["name"] = "failing_tool";
  call2["arguments"] = JsonValue::object();
  calls.push_back(call2);

  input["tool_calls"] = calls;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["results"].size(), 2u);

  // First should succeed
  EXPECT_TRUE(result["results"][0]["success"].getBool());

  // Second should fail
  EXPECT_FALSE(result["results"][1]["success"].getBool());
  EXPECT_EQ(result["results"][1]["error"].getString(), "Tool execution failed");
}

TEST_F(ToolRunnableTest, MultipleToolCallsAutoGenerateIds) {
  JsonValue input = JsonValue::object();
  JsonValue calls = JsonValue::array();

  // Call without id
  JsonValue call1 = JsonValue::object();
  call1["name"] = "calculator";
  JsonValue args1 = JsonValue::object();
  args1["expression"] = "2+2";
  call1["arguments"] = args1;
  calls.push_back(call1);

  // Another call without id
  JsonValue call2 = JsonValue::object();
  call2["name"] = "search";
  JsonValue args2 = JsonValue::object();
  args2["query"] = "test";
  call2["arguments"] = args2;
  calls.push_back(call2);

  input["tool_calls"] = calls;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // IDs should be auto-generated as "call_0", "call_1"
  EXPECT_EQ(result["results"][0]["id"].getString(), "call_0");
  EXPECT_EQ(result["results"][1]["id"].getString(), "call_1");
}

TEST_F(ToolRunnableTest, EmptyToolCallsArray) {
  JsonValue input = JsonValue::object();
  input["tool_calls"] = JsonValue::array();

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "Empty tool_calls array");
}

// =============================================================================
// Error Cases
// =============================================================================

TEST_F(ToolRunnableTest, NoExecutorError) {
  auto runnable_no_executor = ToolRunnable::create(nullptr);

  JsonValue input = JsonValue::object();
  input["name"] = "test";
  input["arguments"] = JsonValue::object();

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        runnable_no_executor->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "No tool executor configured");
}

TEST_F(ToolRunnableTest, InvalidInputType) {
  // Non-object input
  JsonValue input = JsonValue::array();

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        tool_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

// =============================================================================
// Factory Function Tests
// =============================================================================

TEST_F(ToolRunnableTest, MakeToolRunnableFromExecutor) {
  auto runnable = makeToolRunnable(executor_);
  EXPECT_NE(runnable, nullptr);
  EXPECT_EQ(runnable->executor(), executor_);
}

TEST_F(ToolRunnableTest, MakeToolRunnableFromRegistry) {
  auto runnable = makeToolRunnable(registry_);
  EXPECT_NE(runnable, nullptr);
  EXPECT_EQ(runnable->registry(), registry_);
}
