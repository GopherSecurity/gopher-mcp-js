#pragma once

// CompiledStateGraph - Executable state graph
//
// Implements the Pregel model execution:
// 1. PLAN: Determine which nodes can execute
// 2. EXECUTE: Run scheduled nodes
// 3. UPDATE: Apply state changes atomically, prepare next step
//
// Design principles:
// - Async execution through dispatcher
// - Maximum iteration protection to prevent infinite loops
// - Clean error propagation
// - Composable with other Runnables via Runnable interface

#include <map>
#include <memory>
#include <string>

#include "gopher/orch/core/runnable.h"
#include "gopher/orch/graph/graph_node.h"
#include "gopher/orch/graph/graph_state.h"

namespace gopher {
namespace orch {
namespace graph {

// =============================================================================
// CompiledStateGraph - Executable state graph (Runnable implementation)
// =============================================================================
//
// CompiledStateGraph is created by calling StateGraph::compile().
// It implements the Runnable interface, allowing it to be composed with
// other runnables (Sequence, Parallel, Router, etc.).
//
// Execution model:
// - Takes JsonValue input, converts to GraphState
// - Executes nodes following edges until END is reached
// - Returns final GraphState as JsonValue
//
// Error handling:
// - Node errors propagate immediately, stopping execution
// - Missing entry point or nodes are validation errors
// - Maximum iterations exceeded is a runtime error

class CompiledStateGraph
    : public core::Runnable<core::JsonValue, core::JsonValue> {
 public:
  using EdgeCondition = std::function<std::string(const GraphState&)>;

  // Maximum number of node executions before aborting
  // Prevents infinite loops in cyclic graphs
  static constexpr size_t MAX_ITERATIONS = 100;

  // Special node name indicating graph termination
  // Using static method for C++14 compatibility
  static const std::string& END() {
    static const std::string end_node = "__end__";
    return end_node;
  }

  // Special node name indicating graph start (entry point marker)
  static const std::string& START() {
    static const std::string start_node = "__start__";
    return start_node;
  }

  // Construct from graph components
  // Should only be called by StateGraph::compile()
  CompiledStateGraph(
      std::map<std::string, std::shared_ptr<GraphNode>> nodes,
      std::map<std::string, std::string> edges,
      std::map<std::string, EdgeCondition> conditional_edges,
      std::string entry_point)
      : nodes_(std::move(nodes)),
        edges_(std::move(edges)),
        conditional_edges_(std::move(conditional_edges)),
        entry_point_(std::move(entry_point)) {}

  std::string name() const override { return "CompiledStateGraph"; }

  void invoke(const core::JsonValue& input, const core::RunnableConfig& config,
              core::Dispatcher& dispatcher, Callback callback) override {
    if (entry_point_.empty()) {
      dispatcher.post([callback = std::move(callback)]() {
        callback(core::makeOrchError<core::JsonValue>(
            core::OrchError::INVALID_ARGUMENT,
            "StateGraph entry point not set"));
      });
      return;
    }

    // Initialize state from input
    GraphState initial_state = GraphState::fromJson(input);

    // Start execution from entry point
    executeNode(entry_point_, initial_state, config, dispatcher, 0,
                std::move(callback));
  }

 private:
  // Execute a single node and continue to the next
  // This is the core Pregel step implementation
  void executeNode(const std::string& node_name, const GraphState& state,
                   const core::RunnableConfig& config,
                   core::Dispatcher& dispatcher, size_t iteration,
                   Callback callback) {
    // Check termination conditions
    if (node_name.empty() || node_name == END()) {
      dispatcher.post([state, callback = std::move(callback)]() {
        callback(core::makeSuccess(state.toJson()));
      });
      return;
    }

    // Guard against infinite loops
    if (iteration >= MAX_ITERATIONS) {
      dispatcher.post([callback = std::move(callback)]() {
        callback(core::makeOrchError<core::JsonValue>(
            core::OrchError::INTERNAL_ERROR, "Maximum iterations exceeded"));
      });
      return;
    }

    // Find the node to execute
    auto it = nodes_.find(node_name);
    if (it == nodes_.end()) {
      dispatcher.post([node_name, callback = std::move(callback)]() {
        callback(core::makeOrchError<core::JsonValue>(
            core::OrchError::INVALID_ARGUMENT, "Node not found: " + node_name));
      });
      return;
    }

    // Execute the node asynchronously
    // Capture self via shared_ptr to extend lifetime through callbacks
    auto self =
        std::static_pointer_cast<CompiledStateGraph>(shared_from_this());

    it->second->invoke(
        state, config.child(), dispatcher,
        [self, node_name, config, &dispatcher, iteration,
         callback = std::move(callback)](Result<GraphState> result) mutable {
          if (mcp::holds_alternative<core::Error>(result)) {
            callback(Result<core::JsonValue>(mcp::get<core::Error>(result)));
            return;
          }

          // Get updated state and determine next node
          const auto& new_state = mcp::get<GraphState>(result);
          std::string next_node = self->getNextNode(node_name, new_state);

          // Continue execution with the next node
          self->executeNode(next_node, new_state, config, dispatcher,
                            iteration + 1, std::move(callback));
        });
  }

  // Determine the next node to execute based on edges
  // Priority: conditional edges > direct edges > END
  std::string getNextNode(const std::string& from,
                          const GraphState& state) const {
    // Check conditional edges first (higher priority)
    auto cond_it = conditional_edges_.find(from);
    if (cond_it != conditional_edges_.end()) {
      return cond_it->second(state);
    }

    // Fall back to direct edges
    auto edge_it = edges_.find(from);
    if (edge_it != edges_.end()) {
      return edge_it->second;
    }

    // No outgoing edge means termination
    return END();
  }

  std::map<std::string, std::shared_ptr<GraphNode>> nodes_;
  std::map<std::string, std::string> edges_;
  std::map<std::string, EdgeCondition> conditional_edges_;
  std::string entry_point_;
};

}  // namespace graph
}  // namespace orch
}  // namespace gopher
