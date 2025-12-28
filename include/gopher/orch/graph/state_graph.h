#pragma once

// StateGraph - Stateful workflow graphs (LangGraph-inspired)
// Implements the Pregel model (Bulk Synchronous Parallel):
// 1. PLAN: Determine which nodes can execute
// 2. EXECUTE: Run scheduled nodes
// 3. UPDATE: Apply state changes atomically, prepare next step

#include <functional>
#include <map>
#include <memory>
#include <string>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace graph {

using namespace gopher::orch::core;

// =============================================================================
// GraphState - Container for all state channels
// =============================================================================

class GraphState {
 public:
  // Set a value by key
  void set(const std::string& key, const JsonValue& value) {
    channels_[key] = value;
    versions_[key]++;
  }

  // Get a value by key (returns null if not found)
  JsonValue get(const std::string& key) const {
    auto it = channels_.find(key);
    if (it == channels_.end()) {
      return JsonValue::null();
    }
    return it->second;
  }

  // Check if key exists
  bool has(const std::string& key) const {
    return channels_.find(key) != channels_.end();
  }

  // Get version of a key
  uint64_t version(const std::string& key) const {
    auto it = versions_.find(key);
    return it != versions_.end() ? it->second : 0;
  }

  // Serialize to JSON
  JsonValue toJson() const {
    JsonValue result = JsonValue::object();
    for (const auto& entry : channels_) {
      result[entry.first] = entry.second;
    }
    return result;
  }

  // Deserialize from JSON
  static GraphState fromJson(const JsonValue& json) {
    GraphState state;
    if (json.isObject()) {
      for (const auto& key : json.keys()) {
        state.channels_[key] = json[key];
        state.versions_[key] = 1;
      }
    }
    return state;
  }

  // Merge another state into this one
  void merge(const GraphState& other) {
    for (const auto& entry : other.channels_) {
      channels_[entry.first] = entry.second;
      versions_[entry.first]++;
    }
  }

 private:
  std::map<std::string, JsonValue> channels_;
  std::map<std::string, uint64_t> versions_;
};

// Callback type for graph node completion
using GraphStateCallback = std::function<void(Result<GraphState>)>;

// =============================================================================
// GraphNode - A node in the state graph
// =============================================================================

class GraphNode {
 public:
  using NodeFunc = std::function<void(const GraphState& state,
                                      const RunnableConfig& config,
                                      Dispatcher& dispatcher,
                                      GraphStateCallback callback)>;

  GraphNode(const std::string& name, NodeFunc func)
      : name_(name), func_(std::move(func)) {}

  const std::string& name() const { return name_; }

  void invoke(const GraphState& state,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              GraphStateCallback callback) {
    func_(state, config, dispatcher, std::move(callback));
  }

 private:
  std::string name_;
  NodeFunc func_;
};

// Forward declaration
class CompiledStateGraph;

// =============================================================================
// StateGraph - Builder for stateful workflow graphs
// =============================================================================

class StateGraph {
 public:
  // Condition function that returns the next node name
  using EdgeCondition = std::function<std::string(const GraphState&)>;

  // Special node name for termination
  // Using static method for C++14 compatibility (inline variables are C++17)
  static const std::string& END() {
    static const std::string end_node = "__end__";
    return end_node;
  }

  StateGraph() = default;

  // Add a node with a JsonRunnable
  StateGraph& addNode(const std::string& name, JsonRunnablePtr runnable) {
    auto node_func = [runnable](
                         const GraphState& state, const RunnableConfig& config,
                         Dispatcher& dispatcher, GraphStateCallback callback) {
      runnable->invoke(
          state.toJson(), config, dispatcher,
          [state, callback = std::move(callback)](Result<JsonValue> result) {
            if (mcp::holds_alternative<Error>(result)) {
              callback(Result<GraphState>(mcp::get<Error>(result)));
              return;
            }

            // Merge result into state
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

  // Add a node with a sync lambda function
  StateGraph& addNode(const std::string& name,
                      std::function<GraphState(const GraphState&)> func) {
    auto node_func = [func](const GraphState& state, const RunnableConfig&,
                            Dispatcher& dispatcher,
                            GraphStateCallback callback) {
      // Post to dispatcher to maintain async semantics
      dispatcher.post([func, state, callback = std::move(callback)]() {
        try {
          GraphState result = func(state);
          callback(makeSuccess(std::move(result)));
        } catch (const std::exception& e) {
          callback(makeOrchError<GraphState>(
              OrchError::INTERNAL_ERROR,
              std::string("Node error: ") + e.what()));
        }
      });
    };

    nodes_[name] = std::make_shared<GraphNode>(name, std::move(node_func));
    return *this;
  }

  // Add a direct edge (always transitions)
  StateGraph& addEdge(const std::string& from, const std::string& to) {
    edges_[from] = to;
    return *this;
  }

  // Add a conditional edge (transitions based on state)
  StateGraph& addConditionalEdge(const std::string& from,
                                 EdgeCondition condition) {
    conditional_edges_[from] = std::move(condition);
    return *this;
  }

  // Set the entry point
  StateGraph& setEntryPoint(const std::string& node) {
    entry_point_ = node;
    return *this;
  }

  // Compile into executable graph
  std::shared_ptr<CompiledStateGraph> compile();

 private:
  std::map<std::string, std::shared_ptr<GraphNode>> nodes_;
  std::map<std::string, std::string> edges_;
  std::map<std::string, EdgeCondition> conditional_edges_;
  std::string entry_point_;

  friend class CompiledStateGraph;
};

// =============================================================================
// CompiledStateGraph - Executable state graph
// =============================================================================

class CompiledStateGraph : public Runnable<JsonValue, JsonValue> {
 public:
  static constexpr size_t MAX_ITERATIONS = 100;

  explicit CompiledStateGraph(const StateGraph& graph)
      : nodes_(graph.nodes_),
        edges_(graph.edges_),
        conditional_edges_(graph.conditional_edges_),
        entry_point_(graph.entry_point_) {}

  std::string name() const override { return "CompiledStateGraph"; }

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    if (entry_point_.empty()) {
      dispatcher.post([callback = std::move(callback)]() {
        callback(makeOrchError<JsonValue>(OrchError::INVALID_ARGUMENT,
                                          "StateGraph entry point not set"));
      });
      return;
    }

    // Initialize state from input
    GraphState initial_state = GraphState::fromJson(input);

    // Start execution
    executeNode(entry_point_, initial_state, config, dispatcher, 0,
                std::move(callback));
  }

 private:
  void executeNode(const std::string& node_name,
                   const GraphState& state,
                   const RunnableConfig& config,
                   Dispatcher& dispatcher,
                   size_t iteration,
                   Callback callback) {
    // Check termination conditions
    if (node_name.empty() || node_name == StateGraph::END()) {
      dispatcher.post([state, callback = std::move(callback)]() {
        callback(makeSuccess(state.toJson()));
      });
      return;
    }

    if (iteration >= MAX_ITERATIONS) {
      dispatcher.post([callback = std::move(callback)]() {
        callback(makeOrchError<JsonValue>(OrchError::INTERNAL_ERROR,
                                          "Maximum iterations exceeded"));
      });
      return;
    }

    // Find the node
    auto it = nodes_.find(node_name);
    if (it == nodes_.end()) {
      dispatcher.post([node_name, callback = std::move(callback)]() {
        callback(makeOrchError<JsonValue>(OrchError::INVALID_ARGUMENT,
                                          "Node not found: " + node_name));
      });
      return;
    }

    // Execute the node
    // Use static_pointer_cast since Runnable's shared_from_this returns the
    // base type
    auto self =
        std::static_pointer_cast<CompiledStateGraph>(shared_from_this());
    it->second->invoke(
        state, config.child(), dispatcher,
        [self, node_name, config, &dispatcher, iteration,
         callback = std::move(callback)](Result<GraphState> result) mutable {
          if (mcp::holds_alternative<Error>(result)) {
            callback(Result<JsonValue>(mcp::get<Error>(result)));
            return;
          }

          // Determine next node
          const auto& new_state = mcp::get<GraphState>(result);
          std::string next_node = self->getNextNode(node_name, new_state);

          // Continue execution
          self->executeNode(next_node, new_state, config, dispatcher,
                            iteration + 1, std::move(callback));
        });
  }

  std::string getNextNode(const std::string& from,
                          const GraphState& state) const {
    // Check conditional edges first
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
    return StateGraph::END();
  }

  std::map<std::string, std::shared_ptr<GraphNode>> nodes_;
  std::map<std::string, std::string> edges_;
  std::map<std::string, StateGraph::EdgeCondition> conditional_edges_;
  std::string entry_point_;
};

inline std::shared_ptr<CompiledStateGraph> StateGraph::compile() {
  return std::make_shared<CompiledStateGraph>(*this);
}

}  // namespace graph
}  // namespace orch
}  // namespace gopher
