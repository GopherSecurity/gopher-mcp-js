// Unit tests for CircuitBreaker resilience pattern

#include "orch_test_fixture.h"

// =============================================================================
// CircuitBreaker Tests
// =============================================================================

TEST_F(OrchTest, CircuitBreakerClosed) {
  // Normal operation - circuit stays closed
  auto successLambda = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["ok"] = true;
        return makeSuccess(result);
      },
      "SuccessLambda");

  auto cb = withCircuitBreaker(successLambda);

  EXPECT_EQ(cb->state(), CircuitState::CLOSED);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb_fn) {
        cb->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb_fn));
      });

  EXPECT_TRUE(result["ok"].getBool());
  EXPECT_EQ(cb->state(), CircuitState::CLOSED);
}

TEST_F(OrchTest, CircuitBreakerOpens) {
  // Circuit opens after threshold failures
  std::atomic<int> call_count{0};

  auto failingLambda = makeJsonLambda(
      [&call_count](const JsonValue&) -> Result<JsonValue> {
        call_count++;
        return Result<JsonValue>(Error(OrchError::INTERNAL_ERROR, "Failed"));
      },
      "FailingLambda");

  CircuitBreakerPolicy policy;
  policy.failure_threshold = 3;
  policy.recovery_timeout_ms = 60000;  // Long timeout for test
  auto cb = withCircuitBreaker(failingLambda, policy);

  EXPECT_EQ(cb->state(), CircuitState::CLOSED);

  // Cause failures to open circuit
  for (int i = 0; i < 3; i++) {
    auto result = runToCompletionResult<JsonValue>([&](Dispatcher& d,
                                                       JsonCallback cb_fn) {
      cb->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb_fn));
    });
    EXPECT_TRUE(result.hasError());
  }

  EXPECT_EQ(cb->state(), CircuitState::OPEN);
  EXPECT_EQ(call_count.load(), 3);

  // Next call should fail fast without calling inner
  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb_fn) {
        cb->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb_fn));
      });

  EXPECT_TRUE(result.hasError());
  EXPECT_EQ(result.error().code, OrchError::CIRCUIT_OPEN);
  EXPECT_EQ(call_count.load(), 3);  // Inner not called
}

TEST_F(OrchTest, CircuitBreakerReset) {
  // Manual reset works
  auto failingLambda = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(Error(OrchError::INTERNAL_ERROR, "Failed"));
      },
      "FailingLambda");

  CircuitBreakerPolicy policy;
  policy.failure_threshold = 1;  // Open after 1 failure
  auto cb = withCircuitBreaker(failingLambda, policy);

  // Cause failure to open circuit
  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb_fn) {
        cb->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb_fn));
      });

  EXPECT_EQ(cb->state(), CircuitState::OPEN);

  // Reset should close circuit
  cb->reset();
  EXPECT_EQ(cb->state(), CircuitState::CLOSED);
}
