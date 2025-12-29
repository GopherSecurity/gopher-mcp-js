// Unit tests for Retry resilience pattern

#include "orch_test_fixture.h"

// =============================================================================
// Retry Tests
// =============================================================================

TEST_F(OrchTest, RetrySuccess) {
  // Test that successful operation returns immediately
  auto successLambda = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["success"] = true;
        return makeSuccess(result);
      },
      "SuccessLambda");

  auto retryLambda = withRetry(successLambda, RetryPolicy::exponential(3));

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        retryLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                            std::move(cb));
      });

  EXPECT_TRUE(result["success"].getBool());
}

TEST_F(OrchTest, RetryEventualSuccess) {
  // Test that retry succeeds after failures
  std::atomic<int> attempt_count{0};

  auto eventualSuccess = makeJsonLambda(
      [&attempt_count](const JsonValue&) -> Result<JsonValue> {
        int attempt = ++attempt_count;
        if (attempt < 3) {
          return Result<JsonValue>(
              Error(OrchError::INTERNAL_ERROR, "Temporary failure"));
        }
        JsonValue result = JsonValue::object();
        result["attempt"] = attempt;
        return makeSuccess(result);
      },
      "EventualSuccess");

  // Use fixed delay policy for faster test
  auto policy = RetryPolicy::fixed(5, 10);  // 5 attempts, 10ms delay
  auto retryLambda = withRetry(eventualSuccess, policy);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        retryLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                            std::move(cb));
      });

  EXPECT_EQ(result["attempt"].getInt(), 3);
  EXPECT_EQ(attempt_count.load(), 3);
}

TEST_F(OrchTest, RetryExhausted) {
  // Test that retry fails after max attempts
  std::atomic<int> attempt_count{0};

  auto alwaysFails = makeJsonLambda(
      [&attempt_count](const JsonValue&) -> Result<JsonValue> {
        attempt_count++;
        return Result<JsonValue>(
            Error(OrchError::INTERNAL_ERROR, "Persistent failure"));
      },
      "AlwaysFails");

  auto policy = RetryPolicy::fixed(3, 10);  // 3 attempts, 10ms delay
  auto retryLambda = withRetry(alwaysFails, policy);

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        retryLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                            std::move(cb));
      });

  EXPECT_TRUE(result.hasError());
  EXPECT_EQ(result.error().message, "Persistent failure");
  EXPECT_EQ(attempt_count.load(), 3);
}
