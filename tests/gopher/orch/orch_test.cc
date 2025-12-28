// Unit tests for gopher-orch framework
// Tests core components: Runnable, Lambda, Sequence, Parallel, MockServer

#include "gopher/orch/orch.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

#include "mcp/event/libevent_dispatcher.h"

#include "gtest/gtest.h"

using namespace gopher::orch;
using namespace gopher::orch::core;
using namespace gopher::orch::composition;
using namespace gopher::orch::server;

// Test fixture with dispatcher
class OrchTest : public ::testing::Test {
 protected:
  void SetUp() override {
    dispatcher_ = std::make_unique<mcp::event::LibeventDispatcher>("test");
  }

  void TearDown() override { dispatcher_.reset(); }

  // Run dispatcher until callback completes
  template <typename T>
  T runToCompletion(
      std::function<void(Dispatcher&, ResultCallback<T>)> operation) {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    Result<T> result = Result<T>(Error(-1, "Not completed"));

    operation(*dispatcher_, [&](Result<T> r) {
      std::lock_guard<std::mutex> lock(mutex);
      result = std::move(r);
      done = true;
      cv.notify_one();
    });

    // Run dispatcher until done
    while (true) {
      {
        std::unique_lock<std::mutex> lock(mutex);
        if (done)
          break;
      }
      dispatcher_->run(mcp::event::RunType::NonBlock);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    EXPECT_TRUE(mcp::holds_alternative<T>(result))
        << "Operation failed: " << mcp::get<Error>(result).message;
    return mcp::get<T>(result);
  }

  // Run dispatcher until callback completes (allow error)
  template <typename T>
  Result<T> runToCompletionResult(
      std::function<void(Dispatcher&, ResultCallback<T>)> operation) {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    Result<T> result = Result<T>(Error(-1, "Not completed"));

    operation(*dispatcher_, [&](Result<T> r) {
      std::lock_guard<std::mutex> lock(mutex);
      result = std::move(r);
      done = true;
      cv.notify_one();
    });

    // Run dispatcher until done
    while (true) {
      {
        std::unique_lock<std::mutex> lock(mutex);
        if (done)
          break;
      }
      dispatcher_->run(mcp::event::RunType::NonBlock);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    return result;
  }

  std::unique_ptr<mcp::event::LibeventDispatcher> dispatcher_;
};

// =============================================================================
// Lambda Tests
// =============================================================================

TEST_F(OrchTest, LambdaSyncBasic) {
  // Create a simple lambda that doubles a number
  auto doubler = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        int value = input["value"].getInt();
        JsonValue result = JsonValue::object();
        result["result"] = JsonValue(value * 2);
        return makeSuccess(JsonValue(result));
      },
      "Doubler");

  EXPECT_EQ(doubler->name(), "Doubler");

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        JsonValue input = JsonValue::object();
        input["value"] = JsonValue(21);
        doubler->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["result"].getInt(), 42);
}

TEST_F(OrchTest, LambdaWithConfig) {
  // Lambda that uses config
  auto configReader = makeJsonLambda(
      [](const JsonValue& input,
         const RunnableConfig& config) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        auto tag = config.tag("mode");
        result["mode"] =
            JsonValue(tag.has_value() ? tag.value() : std::string("default"));
        return makeSuccess(JsonValue(result));
      },
      "ConfigReader");

  RunnableConfig config;
  config.withTag("mode", "test");

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        configReader->invoke(JsonValue::object(), config, d, std::move(cb));
      });

  EXPECT_EQ(result["mode"].getString(), "test");
}

TEST_F(OrchTest, LambdaError) {
  auto errorLambda = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INVALID_ARGUMENT, "Test error"));
      },
      "ErrorLambda");

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        errorLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                            std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::INVALID_ARGUMENT);
  EXPECT_EQ(mcp::get<Error>(result).message, "Test error");
}

// =============================================================================
// Sequence Tests
// =============================================================================

TEST_F(OrchTest, SequenceBasic) {
  // Create two lambdas and chain them
  auto step1 = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["step1"] = JsonValue(true);
        result["value"] = JsonValue(input["value"].getInt() + 1);
        return makeSuccess(JsonValue(result));
      },
      "Step1");

  auto step2 = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["step2"] = JsonValue(true);
        result["value"] = JsonValue(input["value"].getInt() * 2);
        return makeSuccess(JsonValue(result));
      },
      "Step2");

  auto seq = sequence("TestSequence").add(step1).add(step2).build();

  EXPECT_EQ(seq->size(), 2u);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        JsonValue input = JsonValue::object();
        input["value"] = JsonValue(10);
        seq->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // (10 + 1) * 2 = 22
  EXPECT_EQ(result["value"].getInt(), 22);
  EXPECT_TRUE(result["step2"].getBool());
}

TEST_F(OrchTest, SequenceShortCircuit) {
  std::atomic<int> step2_called{0};

  auto step1 = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INVALID_ARGUMENT, "Step1 failed"));
      },
      "FailingStep");

  auto step2 = makeJsonLambda(
      [&step2_called](const JsonValue& input) -> Result<JsonValue> {
        step2_called++;
        return makeSuccess(JsonValue(input));
      },
      "Step2");

  auto seq = sequence().add(step1).add(step2).build();

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        seq->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "Step1 failed");
  EXPECT_EQ(step2_called.load(), 0);  // Step2 should not be called
}

TEST_F(OrchTest, SequenceEmpty) {
  auto seq = sequence().build();

  JsonValue input = JsonValue::object();
  input["pass_through"] = JsonValue(true);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        seq->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Empty sequence passes through input
  EXPECT_TRUE(result["pass_through"].getBool());
}

// =============================================================================
// Parallel Tests
// =============================================================================

TEST_F(OrchTest, ParallelBasic) {
  auto branchA = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["a_result"] = JsonValue(input["value"].getInt() + 1);
        return makeSuccess(JsonValue(result));
      },
      "BranchA");

  auto branchB = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["b_result"] = JsonValue(input["value"].getInt() * 2);
        return makeSuccess(JsonValue(result));
      },
      "BranchB");

  auto par =
      parallel("TestParallel").add("a", branchA).add("b", branchB).build();

  EXPECT_EQ(par->size(), 2u);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        JsonValue input = JsonValue::object();
        input["value"] = JsonValue(10);
        par->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Check both branches executed
  EXPECT_EQ(result["a"]["a_result"].getInt(), 11);  // 10 + 1
  EXPECT_EQ(result["b"]["b_result"].getInt(), 20);  // 10 * 2
}

TEST_F(OrchTest, ParallelFailFast) {
  std::atomic<int> branchB_completed{0};

  auto branchA = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INTERNAL_ERROR, "Branch A failed"));
      },
      "FailingBranch");

  auto branchB = makeJsonLambda(
      [&branchB_completed](const JsonValue&) -> Result<JsonValue> {
        branchB_completed++;
        JsonValue result = JsonValue::object();
        result["ok"] = JsonValue(true);
        return makeSuccess(JsonValue(result));
      },
      "BranchB");

  auto par = parallel().add("a", branchA).add("b", branchB).build();

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        par->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "Branch A failed");
  // Note: branchB may or may not complete depending on timing
}

TEST_F(OrchTest, ParallelEmpty) {
  auto par = parallel().build();

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        par->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  // Empty parallel returns empty object
  EXPECT_TRUE(result.isObject());
}

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
// Integration Tests
// =============================================================================

TEST_F(OrchTest, SequenceWithServer) {
  // Create a workflow that uses server tools
  auto server = makeMockServer("workflow-server");

  server->addTool("fetch", "Fetch data")
      .setHandler("fetch", [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["data"] = JsonValue("fetched-" + args["id"].getString());
        return makeSuccess(JsonValue(result));
      });

  server->addTool("process", "Process data")
      .setHandler("process", [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["processed"] =
            JsonValue(args["data"].getString() + "-processed");
        return makeSuccess(JsonValue(result));
      });

  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

  // Build workflow: fetch -> process
  auto workflow = sequence("FetchAndProcess")
                      .add(server->tool("fetch"))
                      .add(server->tool("process"))
                      .build();

  JsonValue input = JsonValue::object();
  input["id"] = JsonValue("123");

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
        result["from"] = JsonValue("tool_a");
        return makeSuccess(JsonValue(result));
      });

  server->addTool("tool_b").setHandler(
      "tool_b", [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["from"] = JsonValue("tool_b");
        return makeSuccess(JsonValue(result));
      });

  server->connect(*dispatcher_, [](Result<std::nullptr_t>) {});
  dispatcher_->run(mcp::event::RunType::NonBlock);

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

// Main
int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
