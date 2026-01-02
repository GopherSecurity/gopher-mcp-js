// Unit tests for AgentRunnable

#include "gopher/orch/agent/agent_runnable.h"

#include "mock_llm_provider.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// =============================================================================
// AgentRunnable Test Fixture
// =============================================================================

class AgentRunnableTest : public OrchTest {
 protected:
  std::shared_ptr<MockLLMProvider> mock_provider_;
  ToolRegistryPtr registry_;
  ToolExecutorPtr executor_;
  AgentRunnable::Ptr agent_;

  void SetUp() override {
    OrchTest::SetUp();
    mock_provider_ = makeMockLLMProvider("test-llm");
    registry_ = makeToolRegistry();
    executor_ = makeToolExecutor(registry_);

    addTestTools();

    agent_ = AgentRunnable::create(
        mock_provider_, executor_,
        AgentConfig("gpt-4").withSystemPrompt("You are a helpful assistant."));
  }

  void addTestTools() {
    // Search tool
    registry_->addTool(
        "search", "Search the web",
        JsonValue::object(),
        [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
          std::string query = "default";
          if (args.contains("query") && args["query"].isString()) {
            query = args["query"].getString();
          }

          JsonValue result = JsonValue::object();
          result["query"] = query;
          result["answer"] = "Search result for: " + query;

          d.post([cb = std::move(cb), result = std::move(result)]() mutable {
            cb(Result<JsonValue>(std::move(result)));
          });
        });

    // Calculator tool
    registry_->addSyncTool(
        "calculator", "Perform calculations",
        JsonValue::object(),
        [](const JsonValue& args) -> Result<JsonValue> {
          if (args.contains("expression") &&
              args["expression"].isString()) {
            std::string expr = args["expression"].getString();
            if (expr == "2+2") {
              return Result<JsonValue>(JsonValue(4));
            }
          }
          return Result<JsonValue>(JsonValue(0));
        });
  }
};

// =============================================================================
// Basic Tests
// =============================================================================

TEST_F(AgentRunnableTest, Name) {
  EXPECT_EQ(agent_->name(), "AgentRunnable");
}

TEST_F(AgentRunnableTest, Accessors) {
  EXPECT_EQ(agent_->provider(), mock_provider_);
  EXPECT_EQ(agent_->executor(), executor_);
  EXPECT_EQ(agent_->registry(), registry_);
}

// =============================================================================
// Simple Query Tests
// =============================================================================

TEST_F(AgentRunnableTest, SimpleQueryNoTools) {
  mock_provider_->setDefaultResponse("Hello! How can I help you?");

  JsonValue input = "Hi there!";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.isObject());
  EXPECT_EQ(result["status"].getString(), "completed");
  EXPECT_EQ(result["response"].getString(), "Hello! How can I help you?");
  EXPECT_EQ(result["iterations"].getInt(), 1);

  // Check messages include system prompt
  auto last_msgs = mock_provider_->lastMessages();
  EXPECT_GE(last_msgs.size(), 2u);
  EXPECT_EQ(last_msgs[0].role, Role::SYSTEM);
  EXPECT_EQ(last_msgs[0].content, "You are a helpful assistant.");
}

TEST_F(AgentRunnableTest, QueryObjectInput) {
  mock_provider_->setDefaultResponse("The weather is sunny.");

  JsonValue input = JsonValue::object();
  input["query"] = "What is the weather?";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["status"].getString(), "completed");
  EXPECT_EQ(result["response"].getString(), "The weather is sunny.");
}

// =============================================================================
// Tool Usage Tests
// =============================================================================

TEST_F(AgentRunnableTest, SingleToolCall) {
  // First response: call search tool
  std::vector<ToolCall> tool_calls;
  JsonValue args = JsonValue::object();
  args["query"] = "weather in tokyo";
  tool_calls.push_back(ToolCall("call_1", "search", args));
  mock_provider_->queueToolCalls(tool_calls);

  // Second response: final answer
  mock_provider_->queueResponse("Based on the search, the weather in Tokyo is sunny.");

  JsonValue input = "What is the weather in Tokyo?";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["status"].getString(), "completed");
  EXPECT_EQ(result["response"].getString(),
            "Based on the search, the weather in Tokyo is sunny.");
  EXPECT_EQ(result["iterations"].getInt(), 2);

  // Verify tool results were added to conversation
  EXPECT_TRUE(result["messages"].isArray());
  bool found_tool_result = false;
  for (size_t i = 0; i < result["messages"].size(); ++i) {
    if (result["messages"][i]["role"].getString() == "tool") {
      found_tool_result = true;
      break;
    }
  }
  EXPECT_TRUE(found_tool_result);
}

TEST_F(AgentRunnableTest, MultipleToolCalls) {
  // First response: call two tools
  std::vector<ToolCall> tool_calls;
  JsonValue args1 = JsonValue::object();
  args1["query"] = "weather";
  tool_calls.push_back(ToolCall("call_1", "search", args1));

  JsonValue args2 = JsonValue::object();
  args2["expression"] = "2+2";
  tool_calls.push_back(ToolCall("call_2", "calculator", args2));

  mock_provider_->queueToolCalls(tool_calls);

  // Second response: final answer
  mock_provider_->queueResponse("I found weather info and calculated 2+2=4.");

  JsonValue input = "Search weather and calculate 2+2";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["status"].getString(), "completed");
  EXPECT_EQ(result["iterations"].getInt(), 2);
}

// =============================================================================
// Configuration Tests
// =============================================================================

TEST_F(AgentRunnableTest, ConfigOverridesInInput) {
  mock_provider_->setDefaultResponse("OK");

  JsonValue input = JsonValue::object();
  input["query"] = "Test";

  JsonValue config = JsonValue::object();
  config["system_prompt"] = "Custom system prompt";
  config["model"] = "gpt-3.5-turbo";
  input["config"] = config;

  runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  auto last_msgs = mock_provider_->lastMessages();
  EXPECT_EQ(last_msgs[0].content, "Custom system prompt");
  EXPECT_EQ(mock_provider_->lastConfig().model, "gpt-3.5-turbo");
}

TEST_F(AgentRunnableTest, MaxIterations) {
  // Set up agent to always call tools (never complete)
  for (int i = 0; i < 15; ++i) {
    std::vector<ToolCall> calls;
    JsonValue args = JsonValue::object();
    args["query"] = "test";
    calls.push_back(ToolCall("call_" + std::to_string(i), "search", args));
    mock_provider_->queueToolCalls(calls);
  }

  // Create agent with low max iterations
  auto limited_agent = AgentRunnable::create(
      mock_provider_, executor_,
      AgentConfig("gpt-4").withMaxIterations(3));

  JsonValue input = "Test query";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        limited_agent->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["status"].getString(), "max_iterations_reached");
  EXPECT_EQ(result["iterations"].getInt(), 3);
}

// =============================================================================
// Context Tests
// =============================================================================

TEST_F(AgentRunnableTest, WithContext) {
  mock_provider_->setDefaultResponse("I remember you asked about weather.");

  JsonValue input = JsonValue::object();
  input["query"] = "What did I ask before?";

  JsonValue context = JsonValue::array();
  JsonValue msg1 = JsonValue::object();
  msg1["role"] = "user";
  msg1["content"] = "What is the weather?";
  context.push_back(msg1);

  JsonValue msg2 = JsonValue::object();
  msg2["role"] = "assistant";
  msg2["content"] = "The weather is sunny.";
  context.push_back(msg2);

  input["context"] = context;

  runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Verify context was included
  auto last_msgs = mock_provider_->lastMessages();
  EXPECT_GE(last_msgs.size(), 4u);  // system + 2 context + query
  EXPECT_EQ(last_msgs[1].content, "What is the weather?");
  EXPECT_EQ(last_msgs[2].content, "The weather is sunny.");
}

TEST_F(AgentRunnableTest, LangGraphStyleInput) {
  mock_provider_->setDefaultResponse("I understand.");

  JsonValue input = JsonValue::object();
  JsonValue messages = JsonValue::array();

  JsonValue msg = JsonValue::object();
  msg["role"] = "user";
  msg["content"] = "Hello from messages array";
  messages.push_back(msg);

  input["messages"] = messages;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["status"].getString(), "completed");

  // Verify message was used
  auto last_msgs = mock_provider_->lastMessages();
  bool found = false;
  for (const auto& m : last_msgs) {
    if (m.content == "Hello from messages array") {
      found = true;
      break;
    }
  }
  EXPECT_TRUE(found);
}

// =============================================================================
// Callback Tests
// =============================================================================

TEST_F(AgentRunnableTest, StepCallback) {
  // First call: tool call
  std::vector<ToolCall> calls;
  JsonValue args = JsonValue::object();
  args["query"] = "test";
  calls.push_back(ToolCall("call_1", "search", args));
  mock_provider_->queueToolCalls(calls);

  // Second call: final response
  mock_provider_->queueResponse("Done!");

  std::vector<AgentStep> recorded_steps;
  agent_->setStepCallback([&recorded_steps](const AgentStep& step) {
    recorded_steps.push_back(step);
  });

  JsonValue input = "Test";

  runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(recorded_steps.size(), 2u);
  EXPECT_EQ(recorded_steps[0].step_number, 1);
  EXPECT_EQ(recorded_steps[1].step_number, 2);
}

TEST_F(AgentRunnableTest, ToolApprovalCallback) {
  std::vector<ToolCall> calls;
  JsonValue args = JsonValue::object();
  args["query"] = "test";
  calls.push_back(ToolCall("call_1", "search", args));
  mock_provider_->queueToolCalls(calls);

  // Reject all tool calls
  agent_->setToolApprovalCallback([](const ToolCall& call) {
    return false;  // Reject
  });

  JsonValue input = "Test";

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, AgentError::CANCELLED);
}

// =============================================================================
// Error Tests
// =============================================================================

TEST_F(AgentRunnableTest, NoProviderError) {
  auto agent_no_provider = AgentRunnable::create(nullptr, AgentConfig("gpt-4"));

  JsonValue input = "Test";

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_no_provider->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, AgentError::NO_PROVIDER);
}

TEST_F(AgentRunnableTest, EmptyInput) {
  JsonValue input = JsonValue::object();
  // No query or messages

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
}

TEST_F(AgentRunnableTest, LLMError) {
  mock_provider_->queueError(LLMError::RATE_LIMITED, "Rate limit exceeded");

  JsonValue input = "Test";

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, LLMError::RATE_LIMITED);
}

TEST_F(AgentRunnableTest, AgentWithoutTools) {
  // Create agent without tools
  auto agent_no_tools = AgentRunnable::create(
      mock_provider_,
      AgentConfig("gpt-4").withSystemPrompt("You are helpful."));

  // LLM tries to call a tool anyway
  std::vector<ToolCall> calls;
  JsonValue args = JsonValue::object();
  calls.push_back(ToolCall("call_1", "search", args));
  mock_provider_->queueToolCalls(calls);

  // LLM handles the error gracefully
  mock_provider_->queueResponse("I cannot search, but I can help otherwise.");

  JsonValue input = "Search for something";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_no_tools->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["status"].getString(), "completed");
}

// =============================================================================
// Output Structure Tests
// =============================================================================

TEST_F(AgentRunnableTest, OutputContainsUsage) {
  LLMResponse response;
  response.message = Message::assistant("Test response");
  response.finish_reason = "stop";
  response.usage = Usage(100, 50);
  mock_provider_->queueFullResponse(response);

  JsonValue input = "Test";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.contains("usage"));
  EXPECT_EQ(result["usage"]["prompt_tokens"].getInt(), 100);
  EXPECT_EQ(result["usage"]["completion_tokens"].getInt(), 50);
  EXPECT_EQ(result["usage"]["total_tokens"].getInt(), 150);
}

TEST_F(AgentRunnableTest, OutputContainsDuration) {
  mock_provider_->setDefaultResponse("Quick response");

  JsonValue input = "Test";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        agent_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.contains("duration_ms"));
  EXPECT_GE(result["duration_ms"].getInt(), 0);
}

// =============================================================================
// Factory Function Tests
// =============================================================================

TEST_F(AgentRunnableTest, MakeAgentRunnableWithRegistry) {
  auto agent = makeAgentRunnable(mock_provider_, registry_, AgentConfig("gpt-4"));
  EXPECT_NE(agent, nullptr);
  EXPECT_EQ(agent->provider(), mock_provider_);
  EXPECT_EQ(agent->registry(), registry_);
}

TEST_F(AgentRunnableTest, MakeAgentRunnableWithoutTools) {
  auto agent = makeAgentRunnable(mock_provider_, AgentConfig("gpt-4"));
  EXPECT_NE(agent, nullptr);
  EXPECT_EQ(agent->provider(), mock_provider_);
  EXPECT_EQ(agent->registry(), nullptr);
}
