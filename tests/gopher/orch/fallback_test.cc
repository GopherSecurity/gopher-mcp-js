// Unit tests for Fallback resilience pattern

#include "orch_test_fixture.h"

// =============================================================================
// Fallback Tests
// =============================================================================

TEST_F(OrchTest, FallbackPrimarySuccess) {
  // Primary succeeds, fallback not used
  std::atomic<int> fallback_called{0};

  auto primary = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["source"] = JsonValue("primary");
        return makeSuccess(JsonValue(result));
      },
      "Primary");

  auto fallback = makeJsonLambda(
      [&fallback_called](const JsonValue&) -> Result<JsonValue> {
        fallback_called++;
        JsonValue result = JsonValue::object();
        result["source"] = JsonValue("fallback");
        return makeSuccess(JsonValue(result));
      },
      "Fallback");

  auto fallbackLambda = withFallback(primary).orElse(fallback).build();

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        fallbackLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                               std::move(cb));
      });

  EXPECT_EQ(result["source"].getString(), "primary");
  EXPECT_EQ(fallback_called.load(), 0);
}

TEST_F(OrchTest, FallbackUsed) {
  // Primary fails, fallback used
  auto primary = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INTERNAL_ERROR, "Primary failed"));
      },
      "Primary");

  auto fallback1 = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INTERNAL_ERROR, "Fallback1 failed"));
      },
      "Fallback1");

  auto fallback2 = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["source"] = JsonValue("fallback2");
        return makeSuccess(JsonValue(result));
      },
      "Fallback2");

  auto fallbackLambda =
      withFallback(primary).orElse(fallback1).orElse(fallback2).build();

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        fallbackLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                               std::move(cb));
      });

  EXPECT_EQ(result["source"].getString(), "fallback2");
}

TEST_F(OrchTest, FallbackExhausted) {
  // All fallbacks fail
  auto primary = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(Error(OrchError::INTERNAL_ERROR, "Failed"));
      },
      "Primary");

  auto fallback = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(Error(OrchError::INTERNAL_ERROR, "Failed"));
      },
      "Fallback");

  auto fallbackLambda = withFallback(primary).orElse(fallback).build();

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        fallbackLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                               std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::FALLBACK_EXHAUSTED);
}
