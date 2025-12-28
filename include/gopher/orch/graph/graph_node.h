#pragma once

// GraphNode - A node in the state graph
//
// GraphNode wraps a processing function that transforms GraphState.
// It can be created from:
// - A synchronous lambda: (GraphState) -> GraphState
// - An async Runnable: JsonRunnablePtr
//
// All node execution is async through the dispatcher.

#include <functional>
#include <memory>
#include <string>

#include "gopher/orch/core/config.h"
#include "gopher/orch/core/types.h"
#include "gopher/orch/graph/graph_state.h"

namespace gopher {
namespace orch {
namespace graph {

using namespace gopher::orch::core;

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

  void invoke(const GraphState& state, const RunnableConfig& config,
              Dispatcher& dispatcher, GraphStateCallback callback) {
    func_(state, config, dispatcher, std::move(callback));
  }

 private:
  std::string name_;
  NodeFunc func_;
};

}  // namespace graph
}  // namespace orch
}  // namespace gopher
