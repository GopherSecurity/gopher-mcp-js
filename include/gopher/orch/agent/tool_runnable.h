#pragma once

// ToolRunnable - Wraps ToolExecutor as a composable Runnable
//
// Enables tool execution to be composed with other Runnables in pipelines,
// sequences, and graphs. Supports both single tool calls and parallel
// execution of multiple tool calls.
//
// Usage:
//   auto registry = makeToolRegistry();
//   registry->addTool("search", "Search the web", schema, handler);
//   auto executor = makeToolExecutor(registry);
//   auto tool_runnable = ToolRunnable::create(executor);
//
//   JsonValue input = JsonValue::object();
//   input["name"] = "search";
//   input["arguments"] = args;
//
//   tool_runnable->invoke(input, config, dispatcher, callback);

#include <memory>
#include <string>

#include "gopher/orch/agent/tool_executor.h"
#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;

// ToolRunnable - Adapter that makes ToolExecutor a Runnable<JsonValue,
// JsonValue>
//
// Input Schema (single tool call):
// {
//   "id": "call_123",        // optional, used for result mapping
//   "name": "search",
//   "arguments": {...}
// }
//
// Input Schema (multiple tool calls - parallel execution):
// {
//   "tool_calls": [
//     {"id": "call_1", "name": "search", "arguments": {...}},
//     {"id": "call_2", "name": "calculator", "arguments": {...}}
//   ]
// }
//
// Output Schema (single):
// {
//   "id": "call_123",
//   "result": {...},
//   "success": true
// }
//
// Output Schema (multiple):
// {
//   "results": [
//     {"id": "call_1", "result": {...}, "success": true},
//     {"id": "call_2", "result": 4, "success": true}
//   ]
// }
class ToolRunnable : public Runnable<JsonValue, JsonValue> {
 public:
  using Ptr = std::shared_ptr<ToolRunnable>;

  // Factory method
  static Ptr create(ToolExecutorPtr executor);

  // Runnable interface
  std::string name() const override;

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override;

  // Accessors
  ToolExecutorPtr executor() const { return executor_; }
  ToolRegistryPtr registry() const {
    return executor_ ? executor_->registry() : nullptr;
  }

 private:
  explicit ToolRunnable(ToolExecutorPtr executor);

  // Execute a single tool call
  void executeSingle(const std::string& id,
                     const std::string& name,
                     const JsonValue& arguments,
                     Dispatcher& dispatcher,
                     Callback callback);

  // Execute multiple tool calls in parallel
  void executeMultiple(const std::vector<ToolCall>& calls,
                       Dispatcher& dispatcher,
                       Callback callback);

  // Parse single tool call from input
  struct SingleCall {
    std::string id;
    std::string name;
    JsonValue arguments;
    bool valid = false;
  };
  static SingleCall parseSingleCall(const JsonValue& input);

  // Parse multiple tool calls from input
  static std::vector<ToolCall> parseMultipleCalls(const JsonValue& input);

  ToolExecutorPtr executor_;
};

// Convenience factory function
inline ToolRunnable::Ptr makeToolRunnable(ToolExecutorPtr executor) {
  return ToolRunnable::create(std::move(executor));
}

// Create ToolRunnable directly from registry
inline ToolRunnable::Ptr makeToolRunnable(ToolRegistryPtr registry) {
  return ToolRunnable::create(makeToolExecutor(std::move(registry)));
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
