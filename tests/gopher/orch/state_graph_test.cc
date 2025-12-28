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

// =============================================================================
// GraphState Channel/Reducer Tests
// =============================================================================

TEST_F(OrchTest, GraphStateWithReducerAppendArray) {
  GraphState state;

  // Configure channel with array append reducer
  state.configureChannel("messages", reducers::appendArray);

  // First message
  JsonValue msg1 = JsonValue::array();
  msg1.push_back(JsonValue("hello"));
  state.set("messages", msg1);
  EXPECT_EQ(state.get("messages").size(), 1u);
  EXPECT_EQ(state.get("messages")[0].getString(), "hello");

  // Second message should be appended
  JsonValue msg2 = JsonValue::array();
  msg2.push_back(JsonValue("world"));
  state.set("messages", msg2);
  EXPECT_EQ(state.get("messages").size(), 2u);
  EXPECT_EQ(state.get("messages")[0].getString(), "hello");
  EXPECT_EQ(state.get("messages")[1].getString(), "world");

  // Third message
  JsonValue msg3 = JsonValue::array();
  msg3.push_back(JsonValue("!"));
  state.set("messages", msg3);
  EXPECT_EQ(state.get("messages").size(), 3u);
}

TEST_F(OrchTest, GraphStateWithReducerMergeObjects) {
  GraphState state;

  // Configure channel with object merge reducer
  state.configureChannel("data", reducers::mergeObjects);

  // First object
  JsonValue obj1 = JsonValue::object();
  obj1["a"] = JsonValue(1);
  state.set("data", obj1);
  EXPECT_EQ(state.get("data")["a"].getInt(), 1);

  // Second object should be merged
  JsonValue obj2 = JsonValue::object();
  obj2["b"] = JsonValue(2);
  state.set("data", obj2);
  EXPECT_EQ(state.get("data")["a"].getInt(), 1);  // preserved
  EXPECT_EQ(state.get("data")["b"].getInt(), 2);  // added

  // Third object should overwrite existing key
  JsonValue obj3 = JsonValue::object();
  obj3["a"] = JsonValue(10);
  obj3["c"] = JsonValue(3);
  state.set("data", obj3);
  EXPECT_EQ(state.get("data")["a"].getInt(), 10);  // overwritten
  EXPECT_EQ(state.get("data")["b"].getInt(), 2);   // preserved
  EXPECT_EQ(state.get("data")["c"].getInt(), 3);   // added
}

TEST_F(OrchTest, GraphStateWithCustomReducer) {
  GraphState state;

  // Configure channel with custom max reducer
  state.configureChannel(
      "max_score", [](const JsonValue& old_val, const JsonValue& new_val) {
        int old_score = old_val.getInt();
        int new_score = new_val.getInt();
        return JsonValue(std::max(old_score, new_score));
      });

  state.set("max_score", JsonValue(10));
  EXPECT_EQ(state.get("max_score").getInt(), 10);

  state.set("max_score", JsonValue(5));  // Lower, should not change
  EXPECT_EQ(state.get("max_score").getInt(), 10);

  state.set("max_score", JsonValue(20));  // Higher, should update
  EXPECT_EQ(state.get("max_score").getInt(), 20);
}

TEST_F(OrchTest, GraphStateMergeWithReducers) {
  GraphState state1;
  state1.configureChannel("items", reducers::appendArray);

  JsonValue items1 = JsonValue::array();
  items1.push_back(JsonValue(1));
  items1.push_back(JsonValue(2));
  state1.set("items", items1);

  GraphState state2;
  JsonValue items2 = JsonValue::array();
  items2.push_back(JsonValue(3));
  state2.set("items", items2);

  // Merge should use reducer from state1
  state1.merge(state2);
  EXPECT_EQ(state1.get("items").size(), 3u);
  EXPECT_EQ(state1.get("items")[0].getInt(), 1);
  EXPECT_EQ(state1.get("items")[1].getInt(), 2);
  EXPECT_EQ(state1.get("items")[2].getInt(), 3);
}

TEST_F(OrchTest, StateChannelTemplate) {
  // Test the template version of StateChannel
  StateChannel<int> counter;
  EXPECT_FALSE(counter.hasValue());
  EXPECT_EQ(counter.version(), 0u);

  counter.update(10);
  EXPECT_TRUE(counter.hasValue());
  EXPECT_EQ(counter.value(), 10);
  EXPECT_EQ(counter.version(), 1u);

  counter.update(20);
  EXPECT_EQ(counter.value(), 20);  // Last write wins (no reducer)
  EXPECT_EQ(counter.version(), 2u);
}

TEST_F(OrchTest, StateChannelWithReducer) {
  // Test StateChannel with a custom reducer (sum)
  StateChannel<int> sum([](const int& a, const int& b) { return a + b; });

  sum.update(10);
  EXPECT_EQ(sum.value(), 10);

  sum.update(5);
  EXPECT_EQ(sum.value(), 15);  // 10 + 5

  sum.update(3);
  EXPECT_EQ(sum.value(), 18);  // 15 + 3
}

TEST_F(OrchTest, GraphStateCopy) {
  GraphState original;
  original.configureChannel("data", reducers::appendArray);

  JsonValue arr = JsonValue::array();
  arr.push_back(JsonValue(1));
  original.set("data", arr);

  // Copy should preserve reducer configuration
  GraphState copied = original.copy();

  JsonValue arr2 = JsonValue::array();
  arr2.push_back(JsonValue(2));
  copied.set("data", arr2);

  // Original should be unchanged
  EXPECT_EQ(original.get("data").size(), 1u);

  // Copied should have appended (reducer preserved)
  EXPECT_EQ(copied.get("data").size(), 2u);
}

TEST_F(OrchTest, GraphStateKeys) {
  GraphState state;
  state.set("alpha", JsonValue(1));
  state.set("beta", JsonValue(2));
  state.set("gamma", JsonValue(3));

  auto keys = state.keys();
  EXPECT_EQ(keys.size(), 3u);

  // Keys should be sorted (std::map order)
  EXPECT_EQ(keys[0], "alpha");
  EXPECT_EQ(keys[1], "beta");
  EXPECT_EQ(keys[2], "gamma");
}

TEST_F(OrchTest, StateGraphSTARTConstant) {
  // Verify START() constant exists and is different from END()
  EXPECT_EQ(StateGraph::START(), "__start__");
  EXPECT_EQ(StateGraph::END(), "__end__");
  EXPECT_NE(StateGraph::START(), StateGraph::END());

  // Also verify on CompiledStateGraph
  EXPECT_EQ(CompiledStateGraph::START(), "__start__");
  EXPECT_EQ(CompiledStateGraph::END(), "__end__");
}
