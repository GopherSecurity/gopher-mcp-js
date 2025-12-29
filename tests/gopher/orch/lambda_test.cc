// Unit tests for Lambda runnable

#include "orch_test_fixture.h"

// =============================================================================
// Lambda Tests
// =============================================================================

TEST_F(OrchTest, LambdaSyncBasic) {
  // Create a simple lambda that doubles a number
  auto doubler = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        int value = input["value"].getInt();
        JsonValue result = JsonValue::object();
        result["result"] = value * 2;
        return makeSuccess(result);
      },
      "Doubler");

  EXPECT_EQ(doubler->name(), "Doubler");

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        JsonValue input = JsonValue::object();
        input["value"] = 21;
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
            tag.has_value() ? tag.value() : std::string("default");
        return makeSuccess(result);
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

  EXPECT_TRUE(result.hasError());
  EXPECT_EQ(result.error().code, OrchError::INVALID_ARGUMENT);
  EXPECT_EQ(result.error().message, "Test error");
}
