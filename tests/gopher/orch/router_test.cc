// Unit tests for Router composition pattern

#include "orch_test_fixture.h"

// =============================================================================
// Router Tests
// =============================================================================

TEST_F(OrchTest, RouterBasic) {
  // Create branches for different conditions
  auto positiveHandler = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["type"] = JsonValue("positive");
        result["value"] = JsonValue(input["value"].getInt());
        return makeSuccess(JsonValue(result));
      },
      "PositiveHandler");

  auto negativeHandler = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["type"] = JsonValue("negative");
        result["value"] = JsonValue(input["value"].getInt());
        return makeSuccess(JsonValue(result));
      },
      "NegativeHandler");

  auto defaultHandler = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["type"] = JsonValue("zero");
        return makeSuccess(JsonValue(result));
      },
      "DefaultHandler");

  auto routerRunnable =
      router("NumberRouter")
          .when([](const JsonValue& input) { return input["value"].getInt() > 0; },
                positiveHandler)
          .when([](const JsonValue& input) { return input["value"].getInt() < 0; },
                negativeHandler)
          .otherwise(defaultHandler)
          .build();

  // Test positive number
  JsonValue positiveInput = JsonValue::object();
  positiveInput["value"] = JsonValue(42);

  JsonValue result1 =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        routerRunnable->invoke(positiveInput, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result1["type"].getString(), "positive");
  EXPECT_EQ(result1["value"].getInt(), 42);

  // Test negative number
  JsonValue negativeInput = JsonValue::object();
  negativeInput["value"] = JsonValue(-10);

  JsonValue result2 =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        routerRunnable->invoke(negativeInput, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result2["type"].getString(), "negative");

  // Test zero (default)
  JsonValue zeroInput = JsonValue::object();
  zeroInput["value"] = JsonValue(0);

  JsonValue result3 =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        routerRunnable->invoke(zeroInput, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result3["type"].getString(), "zero");
}

TEST_F(OrchTest, RouterNoMatchNoDefault) {
  // Router without default route should return error
  auto handler = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return makeSuccess(JsonValue::object());
      },
      "Handler");

  auto routerRunnable =
      router()
          .when([](const JsonValue& input) { return input["match"].getBool(); },
                handler)
          .build();

  JsonValue input = JsonValue::object();
  input["match"] = JsonValue(false);

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        routerRunnable->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::INVALID_ARGUMENT);
}
