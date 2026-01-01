#pragma once

// ToolExecutor - Executes tools from a ToolRegistry
//
// Separates execution concerns from the registry:
// - ToolRegistry: stores and retrieves tool definitions
// - ToolExecutor: looks up and executes tools
//
// Usage:
//   auto registry = makeToolRegistry();
//   registry->addTool("calculator", "Perform calculations", schema, handler);
//
//   auto executor = makeToolExecutor(registry);
//   executor->executeTool("calculator", args, dispatcher, callback);

#include <atomic>
#include <functional>
#include <memory>
#include <vector>

#include "gopher/orch/agent/tool_registry.h"
#include "gopher/orch/core/types.h"
#include "gopher/orch/llm/llm_types.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;
using namespace gopher::orch::llm;

// Forward declaration
class ToolExecutor;
using ToolExecutorPtr = std::shared_ptr<ToolExecutor>;

// ToolExecutor - Executes tools by looking them up in a registry
//
// Thread Safety:
// - All execution methods are thread-safe
// - Callbacks are invoked in the dispatcher thread context
class ToolExecutor {
 public:
  using Ptr = std::shared_ptr<ToolExecutor>;

  explicit ToolExecutor(ToolRegistryPtr registry) : registry_(std::move(registry)) {}
  ~ToolExecutor() = default;

  // Factory
  static Ptr create(ToolRegistryPtr registry) {
    return std::make_shared<ToolExecutor>(std::move(registry));
  }

  // Get the underlying registry
  ToolRegistryPtr registry() const { return registry_; }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  // Execute a tool by name
  void executeTool(const std::string& name,
                   const JsonValue& arguments,
                   Dispatcher& dispatcher,
                   JsonCallback callback) {
    if (!registry_) {
      dispatcher.post([callback = std::move(callback)]() {
        callback(Result<JsonValue>(Error(-1, "No registry configured")));
      });
      return;
    }

    auto entry_opt = registry_->getToolEntry(name);
    if (!entry_opt.has_value()) {
      dispatcher.post([callback = std::move(callback), name]() {
        callback(Result<JsonValue>(Error(-1, "Tool not found: " + name)));
      });
      return;
    }

    const auto& entry = entry_opt.value();

    if (entry.isLocal()) {
      // Execute local function
      entry.function(arguments, dispatcher, std::move(callback));
    } else {
      // Execute on remote server using original name
      RunnableConfig config;
      std::string tool_name = entry.original_name.empty()
                                  ? entry.spec.name
                                  : entry.original_name;
      entry.server->callTool(tool_name, arguments, config, dispatcher,
                             std::move(callback));
    }
  }

  // Execute a ToolCall (convenience method)
  void executeToolCall(const ToolCall& call,
                       Dispatcher& dispatcher,
                       JsonCallback callback) {
    executeTool(call.name, call.arguments, dispatcher, std::move(callback));
  }

  // Execute multiple tool calls (optionally in parallel)
  void executeToolCalls(const std::vector<ToolCall>& calls,
                        bool parallel,
                        Dispatcher& dispatcher,
                        std::function<void(std::vector<Result<JsonValue>>)> callback) {
    if (calls.empty()) {
      dispatcher.post([callback = std::move(callback)]() {
        callback({});
      });
      return;
    }

    auto results = std::make_shared<std::vector<Result<JsonValue>>>(calls.size());
    auto pending = std::make_shared<std::atomic<int>>(calls.size());

    for (size_t i = 0; i < calls.size(); ++i) {
      executeToolCall(
          calls[i], dispatcher,
          [results, pending, i, callback](Result<JsonValue> result) {
            (*results)[i] = std::move(result);
            if (--(*pending) == 0) {
              callback(std::move(*results));
            }
          });

      // Note: True sequential execution would require callback chaining
      // This implementation executes all calls and collects results
    }
  }

 private:
  ToolRegistryPtr registry_;
};

// Convenience function to create executor
inline ToolExecutorPtr makeToolExecutor(ToolRegistryPtr registry) {
  return ToolExecutor::create(std::move(registry));
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
