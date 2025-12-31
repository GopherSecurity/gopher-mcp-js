// Unit tests for ReActAgent

#include "orch_test_fixture.h"
#include "mock_llm_provider.h"

#include "gopher/orch/agent/agent.h"
#include "gopher/orch/agent/agent_types.h"
#include "gopher/orch/agent/tool_registry.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::llm;

// =============================================================================
// Agent Test Fixture
// =============================================================================

class AgentTest : public OrchTest {
 protected:
  std::shared_ptr<MockLLMProvider> provider_;
  ToolRegistryPtr registry_;

  void SetUp() override {
    OrchTest::SetUp();
    provider_ = makeMockLLMProvider("test-provider");
    registry_ = makeToolRegistry();
  }

  // Helper to run agent to completion
  AgentResult runAgent(ReActAgent::Ptr agent, const std::string& query) {
    return runToCompletion<AgentResult>(
        [&](Dispatcher& d, ResultCallback<AgentResult> cb) {
          agent->run(query, d, std::move(cb));
        });
  }

  // Helper to run agent and allow errors
  Result<AgentResult> runAgentResult(ReActAgent::Ptr agent, const std::string& query) {
    return runToCompletionResult<AgentResult>(
        [&](Dispatcher& d, ResultCallback<AgentResult> cb) {
          agent->run(query, d, std::move(cb));
        });
  }
};

// =============================================================================
// Basic Agent Tests
// =============================================================================

TEST_F(AgentTest, CreateAgent) {
  auto agent = ReActAgent::create(provider_, registry_);
  EXPECT_NE(agent, nullptr);
  EXPECT_FALSE(agent->isRunning());
  EXPECT_EQ(agent->provider(), provider_);
  EXPECT_EQ(agent->tools(), registry_);
}

TEST_F(AgentTest, CreateAgentWithConfig) {
  AgentConfig config("gpt-4");
  config.withSystemPrompt("You are a helpful assistant.")
        .withMaxIterations(5)
        .withTemperature(0.7);

  auto agent = ReActAgent::create(provider_, registry_, config);

  EXPECT_EQ(agent->config().llm_config.model, "gpt-4");
  EXPECT_EQ(agent->config().system_prompt, "You are a helpful assistant.");
  EXPECT_EQ(agent->config().max_iterations, 5);
  EXPECT_TRUE(agent->config().llm_config.temperature.has_value());
  EXPECT_DOUBLE_EQ(*agent->config().llm_config.temperature, 0.7);
}

TEST_F(AgentTest, SimpleQuery) {
  provider_->setDefaultResponse("Hello! How can I help you today?");

  AgentConfig config("test-model");
  auto agent = ReActAgent::create(provider_, registry_, config);

  auto result = runAgent(agent, "Hello");

  EXPECT_TRUE(result.isSuccess());
  EXPECT_EQ(result.status, AgentStatus::COMPLETED);
  EXPECT_EQ(result.response, "Hello! How can I help you today?");
  EXPECT_EQ(result.iterationCount(), 1);
  EXPECT_EQ(provider_->callCount(), 1u);
}

TEST_F(AgentTest, SystemPromptIncluded) {
  provider_->setDefaultResponse("I am a test assistant.");

  AgentConfig config("test-model");
  config.withSystemPrompt("You are a test assistant.");
  auto agent = ReActAgent::create(provider_, registry_, config);

  runAgent(agent, "Who are you?");

  auto messages = provider_->lastMessages();
  ASSERT_GE(messages.size(), 2u);
  EXPECT_EQ(messages[0].role, Role::SYSTEM);
  EXPECT_EQ(messages[0].content, "You are a test assistant.");
  EXPECT_EQ(messages[1].role, Role::USER);
  EXPECT_EQ(messages[1].content, "Who are you?");
}

// =============================================================================
// Tool Execution Tests
// =============================================================================

TEST_F(AgentTest, SingleToolCall) {
  // First response: call search tool
  ToolCall call1("call_1", "search", JsonValue::object());
  provider_->queueToolCalls({call1});

  // Second response: final answer
  provider_->queueResponse("The search found: example result.");

  // Add search tool to registry
  JsonValue search_result = JsonValue::object();
  search_result["result"] = "example result";

  registry_->addSyncTool(
      "search", "Search the web", JsonValue::object(),
      [search_result](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(search_result);
      });

  auto agent = ReActAgent::create(provider_, registry_);
  auto result = runAgent(agent, "Search for something");

  EXPECT_TRUE(result.isSuccess());
  EXPECT_EQ(result.status, AgentStatus::COMPLETED);
  EXPECT_EQ(result.response, "The search found: example result.");
  EXPECT_EQ(result.iterationCount(), 2);  // Tool call + final response
  EXPECT_EQ(provider_->callCount(), 2u);
}

TEST_F(AgentTest, MultipleToolCalls) {
  // First response: call two tools
  ToolCall call1("call_1", "get_weather", JsonValue::object());
  ToolCall call2("call_2", "get_time", JsonValue::object());
  provider_->queueToolCalls({call1, call2});

  // Second response: final answer
  provider_->queueResponse("It's sunny and 3pm.");

  // Add tools
  registry_->addSyncTool(
      "get_weather", "Get weather", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["weather"] = "sunny";
        return Result<JsonValue>(result);
      });

  registry_->addSyncTool(
      "get_time", "Get time", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["time"] = "3pm";
        return Result<JsonValue>(result);
      });

  auto agent = ReActAgent::create(provider_, registry_);
  auto result = runAgent(agent, "What's the weather and time?");

  EXPECT_TRUE(result.isSuccess());
  EXPECT_EQ(result.iterationCount(), 2);

  // Check that both tools were called
  EXPECT_GE(result.steps.size(), 1u);
  if (!result.steps.empty()) {
    EXPECT_EQ(result.steps[0].tool_executions.size(), 2u);
  }
}

TEST_F(AgentTest, ChainedToolCalls) {
  // First response: call tool A
  ToolCall call1("call_1", "tool_a", JsonValue::object());
  provider_->queueToolCalls({call1});

  // Second response: call tool B
  ToolCall call2("call_2", "tool_b", JsonValue::object());
  provider_->queueToolCalls({call2});

  // Third response: final answer
  provider_->queueResponse("Done with chained calls.");

  registry_->addSyncTool(
      "tool_a", "Tool A", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue("A result"));
      });

  registry_->addSyncTool(
      "tool_b", "Tool B", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue("B result"));
      });

  auto agent = ReActAgent::create(provider_, registry_);
  auto result = runAgent(agent, "Run chained tools");

  EXPECT_TRUE(result.isSuccess());
  EXPECT_EQ(result.iterationCount(), 3);
}

TEST_F(AgentTest, ToolNotFound) {
  // Call a tool that doesn't exist
  ToolCall call1("call_1", "nonexistent_tool", JsonValue::object());
  provider_->queueToolCalls({call1});
  provider_->queueResponse("Tool error handled.");

  auto agent = ReActAgent::create(provider_, registry_);
  auto result = runAgent(agent, "Call missing tool");

  // Agent should still complete (tool error is passed to LLM)
  EXPECT_TRUE(result.isSuccess());

  // Check that tool result message contains error
  bool found_error_message = false;
  for (const auto& msg : result.messages) {
    if (msg.role == Role::TOOL && msg.content.find("not found") != std::string::npos) {
      found_error_message = true;
      break;
    }
  }
  EXPECT_TRUE(found_error_message);
}

TEST_F(AgentTest, ToolExecutionError) {
  ToolCall call1("call_1", "failing_tool", JsonValue::object());
  provider_->queueToolCalls({call1});
  provider_->queueResponse("Handled the tool error.");

  registry_->addSyncTool(
      "failing_tool", "Tool that fails", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(Error(-1, "Tool execution failed"));
      });

  auto agent = ReActAgent::create(provider_, registry_);
  auto result = runAgent(agent, "Call failing tool");

  EXPECT_TRUE(result.isSuccess());

  // Check that error was recorded
  if (!result.steps.empty() && !result.steps[0].tool_executions.empty()) {
    EXPECT_FALSE(result.steps[0].tool_executions[0].success);
  }
}

// =============================================================================
// Max Iterations and Timeout Tests
// =============================================================================

TEST_F(AgentTest, MaxIterationsReached) {
  // Always return tool calls (will never complete naturally)
  ToolCall call("call_1", "loop_tool", JsonValue::object());
  provider_->setDefaultToolCalls({call});

  registry_->addSyncTool(
      "loop_tool", "Loop forever", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue("looping"));
      });

  AgentConfig config("test-model");
  config.withMaxIterations(3);

  auto agent = ReActAgent::create(provider_, registry_, config);
  auto result = runAgentResult(agent, "Loop forever");

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  auto error = mcp::get<Error>(result);
  EXPECT_EQ(error.code, AgentError::MAX_ITERATIONS);
}

// =============================================================================
// Callback Tests
// =============================================================================

TEST_F(AgentTest, StepCallback) {
  provider_->queueResponse("Step 1");
  provider_->queueResponse("Step 2");

  // First call returns tool, second returns final response
  ToolCall call1("call_1", "test_tool", JsonValue::object());
  provider_->reset();  // Clear queue
  provider_->queueToolCalls({call1});
  provider_->queueResponse("Final answer");

  registry_->addSyncTool(
      "test_tool", "Test", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue("result"));
      });

  std::vector<int> step_numbers;

  auto agent = ReActAgent::create(provider_, registry_);
  agent->setStepCallback([&step_numbers](const AgentStep& step) {
    step_numbers.push_back(step.step_number);
  });

  runAgent(agent, "Test with steps");

  EXPECT_GE(step_numbers.size(), 1u);
  if (!step_numbers.empty()) {
    EXPECT_EQ(step_numbers[0], 1);
  }
}

TEST_F(AgentTest, ToolApprovalCallback) {
  ToolCall call1("call_1", "approved_tool", JsonValue::object());
  ToolCall call2("call_2", "rejected_tool", JsonValue::object());
  provider_->queueToolCalls({call1, call2});

  registry_->addSyncTool(
      "approved_tool", "Approved", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue("approved"));
      });

  registry_->addSyncTool(
      "rejected_tool", "Rejected", JsonValue::object(),
      [](const JsonValue& args) -> Result<JsonValue> {
        return Result<JsonValue>(JsonValue("rejected"));
      });

  auto agent = ReActAgent::create(provider_, registry_);
  agent->setToolApprovalCallback([](const ToolCall& call) {
    // Reject the "rejected_tool"
    return call.name != "rejected_tool";
  });

  auto result = runAgentResult(agent, "Call both tools");

  // Agent should be cancelled due to rejected tool
  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  auto error = mcp::get<Error>(result);
  EXPECT_EQ(error.code, AgentError::CANCELLED);
}

// =============================================================================
// Context Tests
// =============================================================================

TEST_F(AgentTest, RunWithContext) {
  provider_->setDefaultResponse("I remember the context.");

  std::vector<Message> context = {
      Message::user("My name is Alice"),
      Message::assistant("Hello Alice!")};

  auto agent = ReActAgent::create(provider_, registry_);

  auto result = runToCompletion<AgentResult>(
      [&](Dispatcher& d, ResultCallback<AgentResult> cb) {
        agent->run("What's my name?", context, d, std::move(cb));
      });

  EXPECT_TRUE(result.isSuccess());

  // Check that context was included
  auto messages = provider_->lastMessages();
  ASSERT_GE(messages.size(), 3u);
  EXPECT_EQ(messages[0].content, "My name is Alice");
  EXPECT_EQ(messages[1].content, "Hello Alice!");
  EXPECT_EQ(messages[2].content, "What's my name?");
}

// =============================================================================
// State Tests
// =============================================================================

TEST_F(AgentTest, StateTracking) {
  provider_->setDefaultResponse("Done");

  auto agent = ReActAgent::create(provider_, registry_);

  EXPECT_EQ(agent->state().status, AgentStatus::IDLE);
  EXPECT_FALSE(agent->isRunning());

  runAgent(agent, "Test");

  // After completion
  EXPECT_EQ(agent->state().status, AgentStatus::COMPLETED);
  EXPECT_FALSE(agent->isRunning());
  EXPECT_GE(agent->state().current_iteration, 1);
}

TEST_F(AgentTest, UsageTracking) {
  LLMResponse response;
  response.message = Message::assistant("Response with usage");
  response.finish_reason = "stop";
  response.usage = Usage(100, 50);

  provider_->queueFullResponse(response);

  auto agent = ReActAgent::create(provider_, registry_);
  auto result = runAgent(agent, "Test");

  EXPECT_EQ(result.total_usage.prompt_tokens, 100);
  EXPECT_EQ(result.total_usage.completion_tokens, 50);
  EXPECT_EQ(result.total_usage.total_tokens, 150);
}

// =============================================================================
// Agent Types Tests
// =============================================================================

TEST(AgentTypesTest, AgentStatusToString) {
  EXPECT_EQ(agentStatusToString(AgentStatus::IDLE), "idle");
  EXPECT_EQ(agentStatusToString(AgentStatus::RUNNING), "running");
  EXPECT_EQ(agentStatusToString(AgentStatus::COMPLETED), "completed");
  EXPECT_EQ(agentStatusToString(AgentStatus::FAILED), "failed");
  EXPECT_EQ(agentStatusToString(AgentStatus::CANCELLED), "cancelled");
  EXPECT_EQ(agentStatusToString(AgentStatus::MAX_ITERATIONS_REACHED),
            "max_iterations_reached");
}

TEST(AgentTypesTest, AgentConfigBuilder) {
  AgentConfig config("gpt-4");
  config.withSystemPrompt("System prompt")
        .withMaxIterations(20)
        .withTemperature(0.5)
        .withMaxTokens(4000)
        .withTimeout(std::chrono::milliseconds(60000))
        .withParallelToolCalls(false);

  EXPECT_EQ(config.llm_config.model, "gpt-4");
  EXPECT_EQ(config.system_prompt, "System prompt");
  EXPECT_EQ(config.max_iterations, 20);
  EXPECT_TRUE(config.llm_config.temperature.has_value());
  EXPECT_DOUBLE_EQ(*config.llm_config.temperature, 0.5);
  EXPECT_TRUE(config.llm_config.max_tokens.has_value());
  EXPECT_EQ(*config.llm_config.max_tokens, 4000);
  EXPECT_EQ(config.timeout, std::chrono::milliseconds(60000));
  EXPECT_FALSE(config.parallel_tool_calls);
}

TEST(AgentTypesTest, AgentState) {
  AgentState state;
  state.status = AgentStatus::RUNNING;
  state.messages.push_back(Message::user("Hello"));
  state.messages.push_back(Message::assistant("Hi!"));

  EXPECT_TRUE(state.isRunning());
  EXPECT_FALSE(state.isCompleted());
  EXPECT_EQ(state.lastContent(), "Hi!");

  state.status = AgentStatus::COMPLETED;
  EXPECT_FALSE(state.isRunning());
  EXPECT_TRUE(state.isCompleted());
}

TEST(AgentTypesTest, AgentResult) {
  AgentResult result;
  result.status = AgentStatus::COMPLETED;
  result.response = "Final answer";
  result.steps.push_back(AgentStep());
  result.steps.push_back(AgentStep());
  result.total_usage = Usage(500, 200);
  result.duration = std::chrono::milliseconds(1500);

  EXPECT_TRUE(result.isSuccess());
  EXPECT_EQ(result.iterationCount(), 2);
  EXPECT_EQ(result.total_usage.total_tokens, 700);
  EXPECT_EQ(result.duration.count(), 1500);
}
