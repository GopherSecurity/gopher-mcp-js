// Unit tests for LLM Providers (OpenAI, Anthropic)

#include "gopher/orch/llm/anthropic_provider.h"
#include "gopher/orch/llm/openai_provider.h"
#include "mock_http_client.h"
#include "mock_llm_provider.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::llm;

// =============================================================================
// MockLLMProvider Tests
// =============================================================================

class MockLLMProviderTest : public OrchTest {
 protected:
  std::shared_ptr<MockLLMProvider> provider_;

  void SetUp() override {
    OrchTest::SetUp();
    provider_ = makeMockLLMProvider("test-provider");
  }
};

TEST_F(MockLLMProviderTest, BasicConfiguration) {
  EXPECT_EQ(provider_->name(), "test-provider");
  EXPECT_EQ(provider_->endpoint(), "mock://localhost/v1/chat");
  EXPECT_TRUE(provider_->isConfigured());
  EXPECT_TRUE(provider_->isModelSupported("any-model"));
}

TEST_F(MockLLMProviderTest, DefaultResponse) {
  provider_->setDefaultResponse("Hello from mock!");

  std::vector<Message> messages = {Message::user("Hi")};
  LLMConfig config("test-model");

  auto response = runToCompletion<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, {}, config, d, std::move(cb));
      });

  EXPECT_EQ(response.message.content, "Hello from mock!");
  EXPECT_EQ(response.finish_reason, "stop");
  EXPECT_EQ(provider_->callCount(), 1u);
}

TEST_F(MockLLMProviderTest, QueuedResponses) {
  provider_->queueResponse("First response");
  provider_->queueResponse("Second response");

  std::vector<Message> messages = {Message::user("Hi")};
  LLMConfig config("test-model");

  auto response1 = runToCompletion<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, {}, config, d, std::move(cb));
      });
  EXPECT_EQ(response1.message.content, "First response");

  auto response2 = runToCompletion<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, {}, config, d, std::move(cb));
      });
  EXPECT_EQ(response2.message.content, "Second response");

  EXPECT_EQ(provider_->callCount(), 2u);
}

TEST_F(MockLLMProviderTest, ToolCallResponse) {
  std::vector<ToolCall> tool_calls;
  tool_calls.push_back(ToolCall("call_123", "search", JsonValue::object()));

  provider_->queueToolCalls(tool_calls);

  std::vector<Message> messages = {Message::user("Search for something")};
  LLMConfig config("test-model");

  auto response = runToCompletion<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, {}, config, d, std::move(cb));
      });

  EXPECT_TRUE(response.hasToolCalls());
  EXPECT_EQ(response.toolCalls().size(), 1u);
  EXPECT_EQ(response.toolCalls()[0].name, "search");
  EXPECT_EQ(response.toolCalls()[0].id, "call_123");
  EXPECT_EQ(response.finish_reason, "tool_calls");
}

TEST_F(MockLLMProviderTest, ErrorResponse) {
  provider_->queueError(LLMError::RATE_LIMITED, "Rate limit exceeded");

  std::vector<Message> messages = {Message::user("Hi")};
  LLMConfig config("test-model");

  auto result = runToCompletionResult<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, {}, config, d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, LLMError::RATE_LIMITED);
  EXPECT_EQ(mcp::get<Error>(result).message, "Rate limit exceeded");
}

TEST_F(MockLLMProviderTest, RecordsLastCall) {
  ToolSpec tool1("search", "Search the web", JsonValue::object());
  std::vector<ToolSpec> tools = {tool1};

  std::vector<Message> messages = {Message::system("You are helpful"),
                                   Message::user("Hello")};
  LLMConfig config("gpt-4");
  config.withTemperature(0.7);

  provider_->setDefaultResponse("OK");

  runToCompletion<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, tools, config, d, std::move(cb));
      });

  EXPECT_EQ(provider_->lastMessages().size(), 2u);
  EXPECT_EQ(provider_->lastMessages()[0].role, Role::SYSTEM);
  EXPECT_EQ(provider_->lastMessages()[1].content, "Hello");

  EXPECT_EQ(provider_->lastTools().size(), 1u);
  EXPECT_EQ(provider_->lastTools()[0].name, "search");

  EXPECT_EQ(provider_->lastConfig().model, "gpt-4");
  EXPECT_TRUE(provider_->lastConfig().temperature.has_value());
  EXPECT_DOUBLE_EQ(*provider_->lastConfig().temperature, 0.7);
}

TEST_F(MockLLMProviderTest, Reset) {
  provider_->queueResponse("Test");

  std::vector<Message> messages = {Message::user("Hi")};
  LLMConfig config("test-model");

  runToCompletion<LLMResponse>(
      [&](Dispatcher& d, ResultCallback<LLMResponse> cb) {
        provider_->chat(messages, {}, config, d, std::move(cb));
      });

  EXPECT_EQ(provider_->callCount(), 1u);
  EXPECT_FALSE(provider_->lastMessages().empty());

  provider_->reset();

  EXPECT_EQ(provider_->callCount(), 0u);
  EXPECT_TRUE(provider_->lastMessages().empty());
}

// =============================================================================
// LLM Type Tests
// =============================================================================

TEST(LLMTypesTest, MessageFactoryMethods) {
  auto system = Message::system("System prompt");
  EXPECT_EQ(system.role, Role::SYSTEM);
  EXPECT_EQ(system.content, "System prompt");

  auto user = Message::user("User input");
  EXPECT_EQ(user.role, Role::USER);
  EXPECT_EQ(user.content, "User input");

  auto assistant = Message::assistant("Response");
  EXPECT_EQ(assistant.role, Role::ASSISTANT);
  EXPECT_EQ(assistant.content, "Response");

  auto tool_result = Message::toolResult("call_123", "Tool output");
  EXPECT_EQ(tool_result.role, Role::TOOL);
  EXPECT_EQ(tool_result.content, "Tool output");
  EXPECT_TRUE(tool_result.tool_call_id.has_value());
  EXPECT_EQ(*tool_result.tool_call_id, "call_123");
}

TEST(LLMTypesTest, MessageWithToolCalls) {
  std::vector<ToolCall> calls;
  calls.push_back(ToolCall("id1", "tool1", JsonValue::object()));
  calls.push_back(ToolCall("id2", "tool2", JsonValue::object()));

  auto msg = Message::assistantWithToolCalls(calls);
  EXPECT_EQ(msg.role, Role::ASSISTANT);
  EXPECT_TRUE(msg.hasToolCalls());
  EXPECT_EQ(msg.tool_calls->size(), 2u);
  EXPECT_EQ((*msg.tool_calls)[0].name, "tool1");
  EXPECT_EQ((*msg.tool_calls)[1].name, "tool2");
}

TEST(LLMTypesTest, RoleConversion) {
  EXPECT_EQ(roleToString(Role::SYSTEM), "system");
  EXPECT_EQ(roleToString(Role::USER), "user");
  EXPECT_EQ(roleToString(Role::ASSISTANT), "assistant");
  EXPECT_EQ(roleToString(Role::TOOL), "tool");

  EXPECT_EQ(parseRole("system"), Role::SYSTEM);
  EXPECT_EQ(parseRole("user"), Role::USER);
  EXPECT_EQ(parseRole("assistant"), Role::ASSISTANT);
  EXPECT_EQ(parseRole("tool"), Role::TOOL);
  EXPECT_EQ(parseRole("unknown"), Role::USER);  // Default
}

TEST(LLMTypesTest, LLMConfigBuilder) {
  LLMConfig config("gpt-4");
  config.withTemperature(0.8)
      .withMaxTokens(2000)
      .withTopP(0.95)
      .withSeed(42)
      .withStop({"END", "STOP"})
      .withTimeout(std::chrono::milliseconds(30000));

  EXPECT_EQ(config.model, "gpt-4");
  EXPECT_TRUE(config.temperature.has_value());
  EXPECT_DOUBLE_EQ(*config.temperature, 0.8);
  EXPECT_TRUE(config.max_tokens.has_value());
  EXPECT_EQ(*config.max_tokens, 2000);
  EXPECT_TRUE(config.top_p.has_value());
  EXPECT_DOUBLE_EQ(*config.top_p, 0.95);
  EXPECT_TRUE(config.seed.has_value());
  EXPECT_EQ(*config.seed, 42);
  EXPECT_TRUE(config.stop.has_value());
  EXPECT_EQ(config.stop->size(), 2u);
  EXPECT_EQ(config.timeout, std::chrono::milliseconds(30000));
}

TEST(LLMTypesTest, LLMResponse) {
  LLMResponse response;
  response.message = Message::assistant("Hello");
  response.finish_reason = "stop";
  response.usage = Usage(100, 50);

  EXPECT_EQ(response.message.content, "Hello");
  EXPECT_FALSE(response.hasToolCalls());
  EXPECT_TRUE(response.isComplete());
  EXPECT_FALSE(response.isTruncated());

  EXPECT_TRUE(response.usage.has_value());
  EXPECT_EQ(response.usage->prompt_tokens, 100);
  EXPECT_EQ(response.usage->completion_tokens, 50);
  EXPECT_EQ(response.usage->total_tokens, 150);
}

TEST(LLMTypesTest, LLMResponseTruncated) {
  LLMResponse response;
  response.finish_reason = "length";

  EXPECT_FALSE(response.isComplete());
  EXPECT_TRUE(response.isTruncated());
}

TEST(LLMTypesTest, ToolSpec) {
  JsonValue params = JsonValue::object();
  params["type"] = "object";
  JsonValue props = JsonValue::object();
  JsonValue query_prop = JsonValue::object();
  query_prop["type"] = "string";
  props["query"] = query_prop;
  params["properties"] = props;

  ToolSpec spec("search", "Search the web", params);

  EXPECT_EQ(spec.name, "search");
  EXPECT_EQ(spec.description, "Search the web");
  EXPECT_TRUE(spec.parameters.contains("type"));
  EXPECT_EQ(spec.parameters["type"].getString(), "object");
}

// =============================================================================
// ProviderConfig Tests
// =============================================================================

TEST(ProviderConfigTest, Builder) {
  ProviderConfig config(ProviderType::OPENAI);
  config.withApiKey("sk-test")
      .withBaseUrl("https://custom.api.com")
      .withHeader("X-Custom", "value");

  EXPECT_EQ(config.type, ProviderType::OPENAI);
  EXPECT_EQ(config.api_key, "sk-test");
  EXPECT_EQ(config.base_url, "https://custom.api.com");
  EXPECT_EQ(config.headers["X-Custom"], "value");
}
