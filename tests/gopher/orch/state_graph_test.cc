// Unit tests for StateGraph (stateful workflow graphs)

#include "orch_test_fixture.h"

using namespace gopher::orch::graph;

// =============================================================================
// StateGraph Tests
// =============================================================================

TEST_F(OrchTest, StateGraphBasic) {
  // Create a simple linear graph: start -> process -> end
  StateGraph graph;
  graph
      .addNode("start",
               [](const GraphState& state) {
                 GraphState result = state;
                 result.set("step", JsonValue("started"));
                 return result;
               })
      .addNode("process",
               [](const GraphState& state) {
                 GraphState result = state;
                 result.set("step", JsonValue("processed"));
                 result.set("value",
                            JsonValue(state.get("input").getInt() * 2));
                 return result;
               })
      .addEdge("start", "process")
      .addEdge("process", StateGraph::END())
      .setEntryPoint("start");

  auto compiled = graph.compile();

  JsonValue input = JsonValue::object();
  input["input"] = JsonValue(21);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        compiled->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["step"].getString(), "processed");
  EXPECT_EQ(result["value"].getInt(), 42);
}

TEST_F(OrchTest, StateGraphConditionalEdge) {
  // Create a graph with conditional branching
  StateGraph graph;
  graph
      .addNode("check",
               [](const GraphState& state) {
                 // Just pass through - condition is evaluated on edge
                 return state;
               })
      .addNode("positive_path",
               [](const GraphState& state) {
                 GraphState result = state;
                 result.set("path", JsonValue("positive"));
                 return result;
               })
      .addNode("negative_path",
               [](const GraphState& state) {
                 GraphState result = state;
                 result.set("path", JsonValue("negative"));
                 return result;
               })
      .addConditionalEdge("check",
                          [](const GraphState& state) {
                            int value = state.get("value").getInt();
                            if (value > 0) {
                              return std::string("positive_path");
                            } else {
                              return std::string("negative_path");
                            }
                          })
      .addEdge("positive_path", StateGraph::END())
      .addEdge("negative_path", StateGraph::END())
      .setEntryPoint("check");

  auto compiled = graph.compile();

  // Test positive path
  JsonValue positiveInput = JsonValue::object();
  positiveInput["value"] = JsonValue(10);

  JsonValue result1 =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        compiled->invoke(positiveInput, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result1["path"].getString(), "positive");

  // Test negative path
  JsonValue negativeInput = JsonValue::object();
  negativeInput["value"] = JsonValue(-5);

  JsonValue result2 =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        compiled->invoke(negativeInput, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result2["path"].getString(), "negative");
}

TEST_F(OrchTest, StateGraphWithRunnable) {
  // Create a graph using JsonRunnable nodes
  auto doubler = makeJsonLambda(
      [](const JsonValue& input) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["doubled"] = JsonValue(input["value"].getInt() * 2);
        return makeSuccess(result);
      },
      "Doubler");

  StateGraph graph;
  graph.addNode("double", doubler)
      .addEdge("double", StateGraph::END())
      .setEntryPoint("double");

  auto compiled = graph.compile();

  JsonValue input = JsonValue::object();
  input["value"] = JsonValue(21);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        compiled->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["doubled"].getInt(), 42);
  EXPECT_EQ(result["value"].getInt(), 21);  // Original value preserved
}

TEST_F(OrchTest, StateGraphNoEntryPoint) {
  StateGraph graph;
  graph.addNode("node", [](const GraphState& state) { return state; });

  auto compiled = graph.compile();

  auto result = runToCompletionResult<JsonValue>([&](Dispatcher& d,
                                                     JsonCallback cb) {
    compiled->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
  });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::INVALID_ARGUMENT);
}

TEST_F(OrchTest, StateGraphNodeNotFound) {
  StateGraph graph;
  graph.setEntryPoint("nonexistent");

  auto compiled = graph.compile();

  auto result = runToCompletionResult<JsonValue>([&](Dispatcher& d,
                                                     JsonCallback cb) {
    compiled->invoke(JsonValue::object(), RunnableConfig(), d, std::move(cb));
  });

  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::INVALID_ARGUMENT);
}

TEST_F(OrchTest, GraphStateOperations) {
  GraphState state;

  // Test set/get
  state.set("key1", JsonValue("value1"));
  state.set("key2", JsonValue(42));

  EXPECT_TRUE(state.has("key1"));
  EXPECT_TRUE(state.has("key2"));
  EXPECT_FALSE(state.has("key3"));

  EXPECT_EQ(state.get("key1").getString(), "value1");
  EXPECT_EQ(state.get("key2").getInt(), 42);
  EXPECT_TRUE(state.get("key3").isNull());

  // Test version tracking
  EXPECT_EQ(state.version("key1"), 1u);
  state.set("key1", JsonValue("updated"));
  EXPECT_EQ(state.version("key1"), 2u);

  // Test JSON serialization
  JsonValue json = state.toJson();
  EXPECT_EQ(json["key1"].getString(), "updated");
  EXPECT_EQ(json["key2"].getInt(), 42);

  // Test fromJson
  GraphState restored = GraphState::fromJson(json);
  EXPECT_EQ(restored.get("key1").getString(), "updated");
  EXPECT_EQ(restored.get("key2").getInt(), 42);
}
