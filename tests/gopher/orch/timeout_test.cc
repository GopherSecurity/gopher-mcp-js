// Unit tests for Timeout resilience pattern

#include "orch_test_fixture.h"

// =============================================================================
// Timeout Tests
// =============================================================================

TEST_F(OrchTest, TimeoutSuccess) {
  // Operation completes before timeout
  auto fastLambda = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["completed"] = JsonValue(true);
        return makeSuccess(JsonValue(result));
      },
      "FastLambda");

  auto timeoutLambda = withTimeout(fastLambda, 1000);  // 1 second timeout

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        timeoutLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                              std::move(cb));
      });

  EXPECT_TRUE(result["completed"].getBool());
}

TEST_F(OrchTest, TimeoutExpired) {
  // Operation takes longer than timeout
  // Use shared_ptr to keep timer alive until it fires
  struct TimerHolder {
    mcp::event::TimerPtr timer;
  };

  auto slowLambda = makeLambdaAsync<JsonValue, JsonValue>(
      [](const JsonValue&, const RunnableConfig&, Dispatcher& dispatcher,
         JsonCallback callback) {
        // Create holder to keep timer alive
        auto holder = std::make_shared<TimerHolder>();

        // Schedule completion after 500ms - but timeout is 50ms
        holder->timer = dispatcher.createTimer(
            [callback = std::move(callback), holder]() mutable {
              JsonValue result = JsonValue::object();
              result["completed"] = JsonValue(true);
              callback(makeSuccess(JsonValue(result)));
            });
        holder->timer->enableTimer(std::chrono::milliseconds(500));
      },
      "SlowLambda");

  auto timeoutLambda = withTimeout(slowLambda, 50);  // 50ms timeout

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        timeoutLambda->invoke(JsonValue::object(), RunnableConfig(), d,
                              std::move(cb));
      });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::TIMEOUT);
}
