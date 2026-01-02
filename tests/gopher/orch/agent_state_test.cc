// Unit tests for AgentState reducer and JSON serialization

#include "gopher/orch/agent/agent_types.h"

#include "gtest/gtest.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// =============================================================================
// AgentState Reducer Tests
// =============================================================================

TEST(AgentStateReducerTest, MessagesAppend) {
  AgentState current;
  current.messages.push_back(Message::user("Hello"));
  current.messages.push_back(Message::assistant("Hi there!"));

  AgentState update;
  update.messages.push_back(Message::user("How are you?"));

  auto result = AgentState::reduce(current, update);

  EXPECT_EQ(result.messages.size(), 3u);
  EXPECT_EQ(result.messages[0].content, "Hello");
  EXPECT_EQ(result.messages[1].content, "Hi there!");
  EXPECT_EQ(result.messages[2].content, "How are you?");
}

TEST(AgentStateReducerTest, StepsAppend) {
  AgentState current;
  AgentStep step1;
  step1.step_number = 1;
  step1.llm_message = Message::assistant("First response");
  current.steps.push_back(step1);

  AgentState update;
  AgentStep step2;
  step2.step_number = 2;
  step2.llm_message = Message::assistant("Second response");
  update.steps.push_back(step2);

  auto result = AgentState::reduce(current, update);

  EXPECT_EQ(result.steps.size(), 2u);
  EXPECT_EQ(result.steps[0].step_number, 1);
  EXPECT_EQ(result.steps[1].step_number, 2);
}

TEST(AgentStateReducerTest, UsageAccumulates) {
  AgentState current;
  current.total_usage.prompt_tokens = 100;
  current.total_usage.completion_tokens = 50;
  current.total_usage.total_tokens = 150;

  AgentState update;
  update.total_usage.prompt_tokens = 80;
  update.total_usage.completion_tokens = 30;
  update.total_usage.total_tokens = 110;

  auto result = AgentState::reduce(current, update);

  EXPECT_EQ(result.total_usage.prompt_tokens, 180);
  EXPECT_EQ(result.total_usage.completion_tokens, 80);
  EXPECT_EQ(result.total_usage.total_tokens, 260);
}

TEST(AgentStateReducerTest, StatusLastWriteWins) {
  AgentState current;
  current.status = AgentStatus::RUNNING;

  AgentState update;
  update.status = AgentStatus::COMPLETED;

  auto result = AgentState::reduce(current, update);

  EXPECT_EQ(result.status, AgentStatus::COMPLETED);
}

TEST(AgentStateReducerTest, IterationCountsLastWriteWins) {
  AgentState current;
  current.current_iteration = 2;
  current.remaining_steps = 8;

  AgentState update;
  update.current_iteration = 3;
  update.remaining_steps = 7;

  auto result = AgentState::reduce(current, update);

  EXPECT_EQ(result.current_iteration, 3);
  EXPECT_EQ(result.remaining_steps, 7);
}

TEST(AgentStateReducerTest, ErrorLastWriteWins) {
  AgentState current;
  current.error = Error(-1, "First error");

  AgentState update;
  update.error = Error(-2, "Second error");

  auto result = AgentState::reduce(current, update);

  EXPECT_TRUE(result.error.has_value());
  EXPECT_EQ(result.error->code, -2);
  EXPECT_EQ(result.error->message, "Second error");
}

TEST(AgentStateReducerTest, ClearError) {
  AgentState current;
  current.error = Error(-1, "Had error");

  AgentState update;
  // update.error is nullopt

  auto result = AgentState::reduce(current, update);

  EXPECT_FALSE(result.error.has_value());
}

TEST(AgentStateReducerTest, EmptyStates) {
  AgentState current;
  AgentState update;

  auto result = AgentState::reduce(current, update);

  EXPECT_TRUE(result.messages.empty());
  EXPECT_TRUE(result.steps.empty());
  EXPECT_EQ(result.status, AgentStatus::IDLE);
}

// =============================================================================
// AgentState JSON Serialization Tests
// =============================================================================

TEST(AgentStateJsonTest, ToJsonBasic) {
  AgentState state;
  state.status = AgentStatus::RUNNING;
  state.current_iteration = 2;
  state.remaining_steps = 8;
  state.messages.push_back(Message::user("Hello"));
  state.messages.push_back(Message::assistant("Hi!"));
  state.total_usage = Usage(100, 50);

  JsonValue json = state.toJson();

  EXPECT_TRUE(json.isObject());
  EXPECT_EQ(json["status"].getString(), "running");
  EXPECT_EQ(json["current_iteration"].getInt(), 2);
  EXPECT_EQ(json["remaining_steps"].getInt(), 8);
  EXPECT_TRUE(json["messages"].isArray());
  EXPECT_EQ(json["messages"].size(), 2u);
  EXPECT_EQ(json["messages"][0]["role"].getString(), "user");
  EXPECT_EQ(json["messages"][0]["content"].getString(), "Hello");
  EXPECT_EQ(json["messages"][1]["role"].getString(), "assistant");
  EXPECT_EQ(json["usage"]["prompt_tokens"].getInt(), 100);
  EXPECT_EQ(json["usage"]["completion_tokens"].getInt(), 50);
  EXPECT_EQ(json["usage"]["total_tokens"].getInt(), 150);
}

TEST(AgentStateJsonTest, ToJsonWithToolCalls) {
  AgentState state;
  state.status = AgentStatus::RUNNING;

  std::vector<ToolCall> calls;
  JsonValue args = JsonValue::object();
  args["query"] = "test";
  calls.push_back(ToolCall("call_1", "search", args));
  state.messages.push_back(Message::assistantWithToolCalls(calls));

  JsonValue json = state.toJson();

  auto& msg = json["messages"][0];
  EXPECT_TRUE(msg.contains("tool_calls"));
  EXPECT_TRUE(msg["tool_calls"].isArray());
  EXPECT_EQ(msg["tool_calls"].size(), 1u);
  EXPECT_EQ(msg["tool_calls"][0]["id"].getString(), "call_1");
  EXPECT_EQ(msg["tool_calls"][0]["name"].getString(), "search");
  EXPECT_EQ(msg["tool_calls"][0]["arguments"]["query"].getString(), "test");
}

TEST(AgentStateJsonTest, ToJsonWithToolResult) {
  AgentState state;
  state.messages.push_back(Message::toolResult("call_1", "Result data"));

  JsonValue json = state.toJson();

  auto& msg = json["messages"][0];
  EXPECT_EQ(msg["role"].getString(), "tool");
  EXPECT_EQ(msg["content"].getString(), "Result data");
  EXPECT_EQ(msg["tool_call_id"].getString(), "call_1");
}

TEST(AgentStateJsonTest, ToJsonWithError) {
  AgentState state;
  state.status = AgentStatus::FAILED;
  state.error = Error(-1, "Something went wrong");

  JsonValue json = state.toJson();

  EXPECT_TRUE(json.contains("error"));
  EXPECT_EQ(json["error"]["code"].getInt(), -1);
  EXPECT_EQ(json["error"]["message"].getString(), "Something went wrong");
}

TEST(AgentStateJsonTest, FromJsonBasic) {
  JsonValue json = JsonValue::object();
  json["status"] = "completed";
  json["current_iteration"] = 3;
  json["remaining_steps"] = 7;

  JsonValue messages = JsonValue::array();
  JsonValue msg1 = JsonValue::object();
  msg1["role"] = "user";
  msg1["content"] = "Hello";
  messages.push_back(msg1);

  JsonValue msg2 = JsonValue::object();
  msg2["role"] = "assistant";
  msg2["content"] = "Hi there!";
  messages.push_back(msg2);

  json["messages"] = messages;

  JsonValue usage = JsonValue::object();
  usage["prompt_tokens"] = 100;
  usage["completion_tokens"] = 50;
  usage["total_tokens"] = 150;
  json["usage"] = usage;

  AgentState state = AgentState::fromJson(json);

  EXPECT_EQ(state.status, AgentStatus::COMPLETED);
  EXPECT_EQ(state.current_iteration, 3);
  EXPECT_EQ(state.remaining_steps, 7);
  EXPECT_EQ(state.messages.size(), 2u);
  EXPECT_EQ(state.messages[0].role, Role::USER);
  EXPECT_EQ(state.messages[0].content, "Hello");
  EXPECT_EQ(state.messages[1].role, Role::ASSISTANT);
  EXPECT_EQ(state.total_usage.prompt_tokens, 100);
  EXPECT_EQ(state.total_usage.completion_tokens, 50);
}

TEST(AgentStateJsonTest, FromJsonWithToolCalls) {
  JsonValue json = JsonValue::object();
  json["status"] = "running";

  JsonValue messages = JsonValue::array();
  JsonValue msg = JsonValue::object();
  msg["role"] = "assistant";
  msg["content"] = "";

  JsonValue tool_calls = JsonValue::array();
  JsonValue call = JsonValue::object();
  call["id"] = "call_123";
  call["name"] = "search";
  JsonValue args = JsonValue::object();
  args["query"] = "weather";
  call["arguments"] = args;
  tool_calls.push_back(call);
  msg["tool_calls"] = tool_calls;

  messages.push_back(msg);
  json["messages"] = messages;

  AgentState state = AgentState::fromJson(json);

  EXPECT_EQ(state.messages.size(), 1u);
  EXPECT_TRUE(state.messages[0].hasToolCalls());
  EXPECT_EQ(state.messages[0].tool_calls->size(), 1u);
  EXPECT_EQ((*state.messages[0].tool_calls)[0].id, "call_123");
  EXPECT_EQ((*state.messages[0].tool_calls)[0].name, "search");
}

TEST(AgentStateJsonTest, FromJsonWithError) {
  JsonValue json = JsonValue::object();
  json["status"] = "failed";

  JsonValue error = JsonValue::object();
  error["code"] = -100;
  error["message"] = "Rate limited";
  json["error"] = error;

  AgentState state = AgentState::fromJson(json);

  EXPECT_EQ(state.status, AgentStatus::FAILED);
  EXPECT_TRUE(state.error.has_value());
  EXPECT_EQ(state.error->code, -100);
  EXPECT_EQ(state.error->message, "Rate limited");
}

TEST(AgentStateJsonTest, RoundTrip) {
  // Create a complex state
  AgentState original;
  original.status = AgentStatus::RUNNING;
  original.current_iteration = 2;
  original.remaining_steps = 8;
  original.total_usage = Usage(150, 75);

  original.messages.push_back(Message::system("You are helpful"));
  original.messages.push_back(Message::user("Search for weather"));

  std::vector<ToolCall> calls;
  JsonValue args = JsonValue::object();
  args["query"] = "weather tokyo";
  calls.push_back(ToolCall("call_1", "search", args));
  original.messages.push_back(Message::assistantWithToolCalls(calls));

  original.messages.push_back(Message::toolResult("call_1", "Sunny, 25C"));
  original.messages.push_back(Message::assistant("The weather is sunny."));

  // Convert to JSON and back
  JsonValue json = original.toJson();
  AgentState restored = AgentState::fromJson(json);

  // Verify
  EXPECT_EQ(restored.status, original.status);
  EXPECT_EQ(restored.current_iteration, original.current_iteration);
  EXPECT_EQ(restored.remaining_steps, original.remaining_steps);
  EXPECT_EQ(restored.total_usage.prompt_tokens, original.total_usage.prompt_tokens);
  EXPECT_EQ(restored.messages.size(), original.messages.size());

  // Check messages
  EXPECT_EQ(restored.messages[0].role, Role::SYSTEM);
  EXPECT_EQ(restored.messages[1].role, Role::USER);
  EXPECT_EQ(restored.messages[2].role, Role::ASSISTANT);
  EXPECT_TRUE(restored.messages[2].hasToolCalls());
  EXPECT_EQ(restored.messages[3].role, Role::TOOL);
  EXPECT_EQ(*restored.messages[3].tool_call_id, "call_1");
  EXPECT_EQ(restored.messages[4].content, "The weather is sunny.");
}

TEST(AgentStateJsonTest, FromJsonInvalid) {
  // Non-object input should return default state
  JsonValue json = JsonValue::array();
  AgentState state = AgentState::fromJson(json);

  EXPECT_EQ(state.status, AgentStatus::IDLE);
  EXPECT_TRUE(state.messages.empty());
}

// =============================================================================
// AgentState Helper Method Tests
// =============================================================================

TEST(AgentStateTest, IsRunning) {
  AgentState state;
  EXPECT_FALSE(state.isRunning());

  state.status = AgentStatus::RUNNING;
  EXPECT_TRUE(state.isRunning());

  state.status = AgentStatus::COMPLETED;
  EXPECT_FALSE(state.isRunning());
}

TEST(AgentStateTest, IsCompleted) {
  AgentState state;
  EXPECT_FALSE(state.isCompleted());

  state.status = AgentStatus::COMPLETED;
  EXPECT_TRUE(state.isCompleted());

  state.status = AgentStatus::FAILED;
  EXPECT_FALSE(state.isCompleted());
}

TEST(AgentStateTest, LastContent) {
  AgentState state;
  EXPECT_EQ(state.lastContent(), "");

  state.messages.push_back(Message::user("First"));
  EXPECT_EQ(state.lastContent(), "First");

  state.messages.push_back(Message::assistant("Second"));
  EXPECT_EQ(state.lastContent(), "Second");
}

// =============================================================================
// AgentStatus Tests
// =============================================================================

TEST(AgentStatusTest, ToString) {
  EXPECT_EQ(agentStatusToString(AgentStatus::IDLE), "idle");
  EXPECT_EQ(agentStatusToString(AgentStatus::RUNNING), "running");
  EXPECT_EQ(agentStatusToString(AgentStatus::COMPLETED), "completed");
  EXPECT_EQ(agentStatusToString(AgentStatus::FAILED), "failed");
  EXPECT_EQ(agentStatusToString(AgentStatus::CANCELLED), "cancelled");
  EXPECT_EQ(agentStatusToString(AgentStatus::MAX_ITERATIONS_REACHED),
            "max_iterations_reached");
}
