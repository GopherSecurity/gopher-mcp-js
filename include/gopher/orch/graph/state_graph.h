#pragma once

// StateGraph - Stateful workflow graphs (LangGraph-inspired)
//
// Implements the Pregel model (Bulk Synchronous Parallel):
// 1. PLAN: Determine which nodes can execute
// 2. EXECUTE: Run scheduled nodes
// 3. UPDATE: Apply state changes atomically, prepare next step
//
// Usage:
//   StateGraph graph;
//   graph.addNode("start", [](const GraphState& s) { ... })
//        .addNode("process", processRunnable)
//        .addEdge("start", "process")
//        .addEdge("process", StateGraph::END())
//        .setEntryPoint("start");
//   auto compiled = graph.compile();
//   compiled->invoke(input, config, dispatcher, callback);

#include <functional>
#include <map>
#include <memory>
#include <string>

#include "gopher/orch/core/runnable.h"
#include "gopher/orch/graph/compiled_graph.h"
#include "gopher/orch/graph/graph_node.h"
#include "gopher/orch/graph/graph_state.h"

namespace gopher {
namespace orch {
namespace graph {

using namespace gopher::orch::core;

// =============================================================================
// StateGraph - Builder for stateful workflow graphs
// =============================================================================
//
// StateGraph provides a fluent API for building workflow graphs:
// - addNode(): Add processing nodes
// - addEdge(): Add direct transitions between nodes
// - addConditionalEdge(): Add conditional transitions based on state
// - setEntryPoint(): Define the starting node
// - compile(): Create an executable CompiledStateGraph
//
// The compiled graph implements Runnable<JsonValue, JsonValue>, so it can
// be composed with Sequence, Parallel, Router, and resilience wrappers.

class StateGraph {
 public:
  // Condition function that evaluates state and returns next node name
  using EdgeCondition = std::function<std::string(const GraphState&)>;

  // Special node name for graph termination
  // Using static method for C++14 compatibility (inline variables are C++17)
  static const std::string& END() {
    static const std::string end_node = "__end__";
    return end_node;
  }

  // Special node name for graph start (can be used in edges from START)
  static const std::string& START() {
    static const std::string start_node = "__start__";
    return start_node;
  }

  StateGraph() = default;

  // -------------------------------------------------------------------------
  // Node Addition
  // -------------------------------------------------------------------------

  // Add a node with a JsonRunnable
  // The runnable receives the full state as JSON and returns updates
  StateGraph& addNode(const std::string& name, JsonRunnablePtr runnable) {
    auto node_func = [runnable](const GraphState& state,
                                const RunnableConfig& config,
                                Dispatcher& dispatcher,
                                GraphStateCallback callback) {
      runnable->invoke(
          state.toJson(), config, dispatcher,
          [state, callback = std::move(callback)](Result<JsonValue> result) {
            if (mcp::holds_alternative<Error>(result)) {
              callback(Result<GraphState>(mcp::get<Error>(result)));
              return;
            }

            // Merge runnable output into state
            // Output keys overwrite existing state keys
            GraphState new_state = state;
            const auto& output = mcp::get<JsonValue>(result);
            if (output.isObject()) {
              for (const auto& key : output.keys()) {
                new_state.set(key, output[key]);
              }
            }
            callback(makeSuccess(std::move(new_state)));
          });
    };

    nodes_[name] = std::make_shared<GraphNode>(name, std::move(node_func));
    return *this;
  }

  // Add a node with a synchronous lambda function
  // The lambda receives current state and returns updated state
  StateGraph& addNode(const std::string& name,
                      std::function<GraphState(const GraphState&)> func) {
    auto node_func = [func](const GraphState& state, const RunnableConfig&,
                            Dispatcher& dispatcher,
                            GraphStateCallback callback) {
      // Post to dispatcher to maintain async semantics
      // This ensures callbacks are always invoked in dispatcher context
      dispatcher.post([func, state, callback = std::move(callback)]() {
        try {
          GraphState result = func(state);
          callback(makeSuccess(std::move(result)));
        } catch (const std::exception& e) {
          callback(makeOrchError<GraphState>(
              OrchError::INTERNAL_ERROR,
              std::string("Node execution error: ") + e.what()));
        }
      });
    };

    nodes_[name] = std::make_shared<GraphNode>(name, std::move(node_func));
    return *this;
  }

  // Add a node with an async lambda function
  // The lambda receives state and callback, must invoke callback exactly once
  StateGraph& addNodeAsync(const std::string& name,
                           GraphNode::NodeFunc func) {
    nodes_[name] = std::make_shared<GraphNode>(name, std::move(func));
    return *this;
  }

  // -------------------------------------------------------------------------
  // Edge Addition
  // -------------------------------------------------------------------------

  // Add a direct edge (always transitions from -> to)
  StateGraph& addEdge(const std::string& from, const std::string& to) {
    edges_[from] = to;
    return *this;
  }

  // Add a conditional edge (transitions based on state evaluation)
  // The condition function returns the name of the next node
  StateGraph& addConditionalEdge(const std::string& from,
                                 EdgeCondition condition) {
    conditional_edges_[from] = std::move(condition);
    return *this;
  }

  // -------------------------------------------------------------------------
  // Graph Configuration
  // -------------------------------------------------------------------------

  // Set the entry point node (first node to execute)
  StateGraph& setEntryPoint(const std::string& node) {
    entry_point_ = node;
    return *this;
  }

  // -------------------------------------------------------------------------
  // Compilation
  // -------------------------------------------------------------------------

  // Compile the graph into an executable form
  // Returns a CompiledStateGraph that implements Runnable<JsonValue, JsonValue>
  std::shared_ptr<CompiledStateGraph> compile() {
    return std::make_shared<CompiledStateGraph>(
        nodes_, edges_, conditional_edges_, entry_point_);
  }

 private:
  std::map<std::string, std::shared_ptr<GraphNode>> nodes_;
  std::map<std::string, std::string> edges_;
  std::map<std::string, EdgeCondition> conditional_edges_;
  std::string entry_point_;

  friend class CompiledStateGraph;
};

}  // namespace graph
}  // namespace orch
}  // namespace gopher
