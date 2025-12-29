// Unit tests for Parallel composition pattern

#include "orch_test_fixture.h"

// =============================================================================
// Parallel Tests
// =============================================================================

TEST_F(OrchTest, ParallelBasic) {
  auto branchA = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["a_result"] = input["value"].getInt() + 1;
        return makeSuccess(result);
      },
      "BranchA");

  auto branchB = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["b_result"] = input["value"].getInt() * 2;
        return makeSuccess(result);
      },
      "BranchB");

  auto par =
      parallel("TestParallel").add("a", branchA).add("b", branchB).build();

  EXPECT_EQ(par->size(), 2u);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        JsonValue input = JsonValue::object();
        input["value"] = 10;
        par->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  // Check both branches executed
  EXPECT_EQ(result["a"]["a_result"].getInt(), 11);  // 10 + 1
  EXPECT_EQ(result["b"]["b_result"].getInt(), 20);  // 10 * 2
}

TEST_F(OrchTest, ParallelFailFast) {
  std::atomic<int> branchB_completed{0};

  auto branchA = makeJsonLambda(
      [](const JsonValue&) -> Result<JsonValue> {
        return Result<JsonValue>(
            Error(OrchError::INTERNAL_ERROR, "Branch A failed"));
      },
      "FailingBranch");

  auto branchB = makeJsonLambda(
      [&branchB_completed](const JsonValue&) -> Result<JsonValue> {
        branchB_completed++;
        JsonValue result = JsonValue::object();
        result["ok"] = true;
        return makeSuccess(result);
      },
      "BranchB");

  auto par = parallel().add("a", branchA).add("b", branchB).build();

  auto result =
      runToCompletionResult<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        par->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  EXPECT_TRUE(result.hasError());
  EXPECT_EQ(result.error().message, "Branch A failed");
  // Note: branchB may or may not complete depending on timing
}

TEST_F(OrchTest, ParallelEmpty) {
  auto par = parallel().build();

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        par->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
      });

  // Empty parallel returns empty object
  EXPECT_TRUE(result.isObject());
}
