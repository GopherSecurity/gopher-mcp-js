// Unit tests for Sequence composition pattern

#include "orch_test_fixture.h"

// =============================================================================
// Sequence Tests
// =============================================================================

TEST_F(OrchTest, SequenceBasic) {
  // Create two lambdas and chain them
  auto step1 = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["step1"] = true;
        result["value"] = input["value"].getInt() + 1;
        return makeSuccess(result);
      },
      "Step1");

  auto step2 = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["step2"] = true;
        result["value"] = input["value"].getInt() * 2;
        return makeSuccess(result);
      },
      "Step2");

  auto seq = sequence("TestSequence").add(step1).add(step2).build();

  EXPECT_EQ(seq->size(), 2u);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        JsonValue input = JsonValue::object();
        input["value"] = 10;
        seq->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // (10 + 1) * 2 = 22
  EXPECT_EQ(result["value"].getInt(), 22);
  EXPECT_TRUE(result["step2"].getBool());
}

TEST_F(OrchTest, SequenceShortCircuit) {
  std::atomic<int> step2_called{0};

  auto step1 = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INVALID_ARGUMENT, "Step1 failed"));
      },
      "FailingStep");

  auto step2 = makeJsonLambda(
      [&step2_called](const JsonValue& input) -> Result<JsonValue> {
        step2_called++;
        return makeSuccess(input);
      },
      "Step2");

  auto seq = sequence().add(step1).add(step2).build();

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        seq->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.hasError());
  EXPECT_EQ(result.error().message, "Step1 failed");
  EXPECT_EQ(step2_called.load(), 0);  // Step2 should not be called
}

TEST_F(OrchTest, SequenceEmpty) {
  auto seq = sequence().build();

  JsonValue input = JsonValue::object();
  input["pass_through"] = true;

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        seq->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Empty sequence passes through input
  EXPECT_TRUE(result["pass_through"].getBool());
}
