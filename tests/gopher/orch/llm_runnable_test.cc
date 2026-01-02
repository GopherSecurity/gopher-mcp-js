// Unit tests for LLMRunnable

#include "gopher/orch/llm/llm_runnable.h"

#include "mock_llm_provider.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// =============================================================================
// LLMRunnable Tests
// =============================================================================

class LLMRunnableTest : public OrchTest {
 protected:
  std::shared_ptr<MockLLMProvider> mock_provider_;
  LLMRunnable::Ptr llm_runnable_;

  void SetUp() override {
    OrchTest::SetUp();
    mock_provider_ = makeMockLLMProvider("test-provider");
    llm_runnable_ = LLMRunnable::create(mock_provider_, LLMConfig("gpt-4"));
  }
};

TEST_F(LLMRunnableTest, Name) {
  EXPECT_EQ(llm_runnable_->name(), "LLMRunnable(test-provider)");
}

TEST_F(LLMRunnableTest, SimpleStringInput) {
  mock_provider_->setDefaultResponse("Hello back!");

  JsonValue input = "Hello, how are you?";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Verify output structure
  EXPECT_TRUE(result.isObject());
  EXPECT_TRUE(result.contains("message"));
  EXPECT_TRUE(result.contains("finish_reason"));

  EXPECT_EQ(result["message"]["content"].getString(), "Hello back!");
  EXPECT_EQ(result["message"]["role"].getString(), "assistant");
  EXPECT_EQ(result["finish_reason"].getString(), "stop");

  // Verify the provider received correct input
  EXPECT_EQ(mock_provider_->lastMessages().size(), 1u);
  EXPECT_EQ(mock_provider_->lastMessages()[0].role, Role::USER);
  EXPECT_EQ(mock_provider_->lastMessages()[0].content, "Hello, how are you?");
}

TEST_F(LLMRunnableTest, MessagesArrayInput) {
  mock_provider_->setDefaultResponse("I can help with that.");

  JsonValue input = JsonValue::object();
  JsonValue messages = JsonValue::array();

  JsonValue system_msg = JsonValue::object();
  system_msg["role"] = "system";
  system_msg["content"] = "You are a helpful assistant.";
  messages.push_back(system_msg);

  JsonValue user_msg = JsonValue::object();
  user_msg["role"] = "user";
  user_msg["content"] = "Help me with coding.";
  messages.push_back(user_msg);

  input["messages"] = messages;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["message"]["content"].getString(), "I can help with that.");

  // Verify messages were passed correctly
  auto last_msgs = mock_provider_->lastMessages();
  EXPECT_EQ(last_msgs.size(), 2u);
  EXPECT_EQ(last_msgs[0].role, Role::SYSTEM);
  EXPECT_EQ(last_msgs[0].content, "You are a helpful assistant.");
  EXPECT_EQ(last_msgs[1].role, Role::USER);
  EXPECT_EQ(last_msgs[1].content, "Help me with coding.");
}

TEST_F(LLMRunnableTest, WithTools) {
  mock_provider_->setDefaultResponse("I'll search for that.");

  JsonValue input = JsonValue::object();
  JsonValue messages = JsonValue::array();
  JsonValue user_msg = JsonValue::object();
  user_msg["role"] = "user";
  user_msg["content"] = "Search for weather";
  messages.push_back(user_msg);
  input["messages"] = messages;

  // Add tools
  JsonValue tools = JsonValue::array();
  JsonValue tool = JsonValue::object();
  tool["name"] = "search";
  tool["description"] = "Search the web";
  JsonValue params = JsonValue::object();
  params["type"] = "object";
  tool["parameters"] = params;
  tools.push_back(tool);
  input["tools"] = tools;

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Verify tools were passed to provider
  auto last_tools = mock_provider_->lastTools();
  EXPECT_EQ(last_tools.size(), 1u);
  EXPECT_EQ(last_tools[0].name, "search");
  EXPECT_EQ(last_tools[0].description, "Search the web");
}

TEST_F(LLMRunnableTest, ToolCallResponse) {
  std::vector<ToolCall> tool_calls;
  JsonValue args = JsonValue::object();
  args["query"] = "weather in tokyo";
  tool_calls.push_back(ToolCall("call_123", "search", args));
  mock_provider_->queueToolCalls(tool_calls);

  JsonValue input = "What's the weather in Tokyo?";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["finish_reason"].getString(), "tool_calls");
  EXPECT_TRUE(result["message"].contains("tool_calls"));
  EXPECT_TRUE(result["message"]["tool_calls"].isArray());
  EXPECT_EQ(result["message"]["tool_calls"].size(), 1u);

  auto tool_call = result["message"]["tool_calls"][0];
  EXPECT_EQ(tool_call["id"].getString(), "call_123");
  EXPECT_EQ(tool_call["name"].getString(), "search");
  EXPECT_EQ(tool_call["arguments"]["query"].getString(), "weather in tokyo");
}

TEST_F(LLMRunnableTest, ConfigOverrides) {
  mock_provider_->setDefaultResponse("OK");

  JsonValue input = JsonValue::object();
  JsonValue messages = JsonValue::array();
  JsonValue user_msg = JsonValue::object();
  user_msg["role"] = "user";
  user_msg["content"] = "Hi";
  messages.push_back(user_msg);
  input["messages"] = messages;

  // Override config
  JsonValue config = JsonValue::object();
  config["model"] = "gpt-3.5-turbo";
  config["temperature"] = 0.5;
  config["max_tokens"] = 100;
  input["config"] = config;

  runToCompletion<JsonValue>([&](Dispatcher& d, ResultCallback<JsonValue> cb) {
    llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
  });

  auto last_config = mock_provider_->lastConfig();
  EXPECT_EQ(last_config.model, "gpt-3.5-turbo");
  EXPECT_TRUE(last_config.temperature.has_value());
  EXPECT_DOUBLE_EQ(*last_config.temperature, 0.5);
  EXPECT_TRUE(last_config.max_tokens.has_value());
  EXPECT_EQ(*last_config.max_tokens, 100);
}

TEST_F(LLMRunnableTest, DefaultConfigUsed) {
  LLMConfig default_config("claude-3");
  default_config.withTemperature(0.8);
  llm_runnable_->setDefaultConfig(default_config);

  mock_provider_->setDefaultResponse("OK");

  JsonValue input = "Hello";

  runToCompletion<JsonValue>([&](Dispatcher& d, ResultCallback<JsonValue> cb) {
    llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
  });

  auto last_config = mock_provider_->lastConfig();
  EXPECT_EQ(last_config.model, "claude-3");
  EXPECT_TRUE(last_config.temperature.has_value());
  EXPECT_DOUBLE_EQ(*last_config.temperature, 0.8);
}

TEST_F(LLMRunnableTest, UsageIncluded) {
  LLMResponse response;
  response.message = Message::assistant("Test response");
  response.finish_reason = "stop";
  response.usage = Usage(100, 50);
  mock_provider_->queueFullResponse(response);

  JsonValue input = "Test";

  auto result = runToCompletion<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.contains("usage"));
  EXPECT_EQ(result["usage"]["prompt_tokens"].getInt(), 100);
  EXPECT_EQ(result["usage"]["completion_tokens"].getInt(), 50);
  EXPECT_EQ(result["usage"]["total_tokens"].getInt(), 150);
}

TEST_F(LLMRunnableTest, ErrorPropagation) {
  mock_provider_->queueError(LLMError::RATE_LIMITED, "Rate limit exceeded");

  JsonValue input = "Test";

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, LLMError::RATE_LIMITED);
  EXPECT_EQ(mcp::get<Error>(result).message, "Rate limit exceeded");
}

TEST_F(LLMRunnableTest, NoProviderError) {
  auto llm_no_provider = LLMRunnable::create(nullptr, LLMConfig("gpt-4"));

  JsonValue input = "Test";

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_no_provider->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "No LLM provider configured");
}

TEST_F(LLMRunnableTest, EmptyMessagesError) {
  mock_provider_->setDefaultResponse("OK");

  // Empty object input with no messages
  JsonValue input = JsonValue::object();

  auto result = runToCompletionResult<JsonValue>(
      [&](Dispatcher& d, ResultCallback<JsonValue> cb) {
        llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).message, "No messages provided");
}

TEST_F(LLMRunnableTest, ToolResultMessageParsing) {
  mock_provider_->setDefaultResponse("Based on the search results...");

  JsonValue input = JsonValue::object();
  JsonValue messages = JsonValue::array();

  // User message
  JsonValue user_msg = JsonValue::object();
  user_msg["role"] = "user";
  user_msg["content"] = "Search for weather";
  messages.push_back(user_msg);

  // Assistant message with tool calls
  JsonValue assistant_msg = JsonValue::object();
  assistant_msg["role"] = "assistant";
  assistant_msg["content"] = "";
  JsonValue tool_calls = JsonValue::array();
  JsonValue call = JsonValue::object();
  call["id"] = "call_123";
  call["name"] = "search";
  JsonValue args = JsonValue::object();
  args["query"] = "weather";
  call["arguments"] = args;
  tool_calls.push_back(call);
  assistant_msg["tool_calls"] = tool_calls;
  messages.push_back(assistant_msg);

  // Tool result message
  JsonValue tool_msg = JsonValue::object();
  tool_msg["role"] = "tool";
  tool_msg["content"] = "Sunny, 25C";
  tool_msg["tool_call_id"] = "call_123";
  messages.push_back(tool_msg);

  input["messages"] = messages;

  runToCompletion<JsonValue>([&](Dispatcher& d, ResultCallback<JsonValue> cb) {
    llm_runnable_->invoke(input, RunnableConfig(), d, std::move(cb));
  });

  auto last_msgs = mock_provider_->lastMessages();
  EXPECT_EQ(last_msgs.size(), 3u);

  // Verify tool result message
  EXPECT_EQ(last_msgs[2].role, Role::TOOL);
  EXPECT_EQ(last_msgs[2].content, "Sunny, 25C");
  EXPECT_TRUE(last_msgs[2].tool_call_id.has_value());
  EXPECT_EQ(*last_msgs[2].tool_call_id, "call_123");

  // Verify assistant message with tool calls
  EXPECT_EQ(last_msgs[1].role, Role::ASSISTANT);
  EXPECT_TRUE(last_msgs[1].hasToolCalls());
  EXPECT_EQ(last_msgs[1].tool_calls->size(), 1u);
  EXPECT_EQ((*last_msgs[1].tool_calls)[0].name, "search");
}

TEST_F(LLMRunnableTest, Accessors) {
  EXPECT_EQ(llm_runnable_->provider(), mock_provider_);
  EXPECT_EQ(llm_runnable_->defaultConfig().model, "gpt-4");
}

// =============================================================================
// Factory Function Test
// =============================================================================

TEST_F(LLMRunnableTest, MakeLLMRunnable) {
  auto llm = makeLLMRunnable(mock_provider_, LLMConfig("test-model"));
  EXPECT_NE(llm, nullptr);
  EXPECT_EQ(llm->provider(), mock_provider_);
  EXPECT_EQ(llm->defaultConfig().model, "test-model");
}
