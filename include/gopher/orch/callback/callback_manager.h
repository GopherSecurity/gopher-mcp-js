#pragma once

// CallbackManager - Manages callback handlers and emits events
//
// The CallbackManager is responsible for:
// 1. Maintaining a collection of callback handlers
// 2. Emitting events to all registered handlers
// 3. Managing run context (run IDs, parent relationships)
// 4. Creating child managers for nested operations
//
// Usage:
//   auto manager = std::make_shared<CallbackManager>();
//   manager->addHandler(std::make_shared<LoggingCallbackHandler>());
//
//   // Start a chain
//   auto run_info = manager->startChain("my_chain", input);
//   // ... execute chain ...
//   manager->endChain(run_info, output);

#include <algorithm>
#include <atomic>
#include <memory>
#include <mutex>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "gopher/orch/callback/callback_handler.h"
#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace callback {

// =============================================================================
// CallbackManager - Manages callback handlers
// =============================================================================

// CallbackManager is thread-safe and can be shared across multiple operations.
// It manages the lifecycle of run contexts and emits events to all handlers.
//
// Hierarchical tracing is supported through parent_run_id relationships:
// - When creating a child manager, the parent's run_id becomes the child's
//   parent_run_id
// - This allows reconstruction of the full execution tree
class CallbackManager : public std::enable_shared_from_this<CallbackManager> {
 public:
  using Ptr = std::shared_ptr<CallbackManager>;

  CallbackManager() : run_id_(generateRunId()), parent_run_id_("") {}

  // -------------------------------------------------------------------------
  // Handler Management
  // -------------------------------------------------------------------------

  // Add a handler to receive events
  void addHandler(std::shared_ptr<CallbackHandler> handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    handlers_.push_back(std::move(handler));
  }

  // Remove a handler
  void removeHandler(const std::shared_ptr<CallbackHandler>& handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    handlers_.erase(std::remove(handlers_.begin(), handlers_.end(), handler),
                    handlers_.end());
  }

  // Get the number of registered handlers
  size_t handlerCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return handlers_.size();
  }

  // Clear all handlers
  void clearHandlers() {
    std::lock_guard<std::mutex> lock(mutex_);
    handlers_.clear();
  }

  // -------------------------------------------------------------------------
  // Run Context Management
  // -------------------------------------------------------------------------

  // Get the current run ID
  const std::string& runId() const { return run_id_; }

  // Get the parent run ID (empty if this is the root)
  const std::string& parentRunId() const { return parent_run_id_; }

  // Set the parent run ID (used when creating child managers)
  void setParentRunId(const std::string& parent_id) {
    parent_run_id_ = parent_id;
  }

  // -------------------------------------------------------------------------
  // Chain Event Emission
  // -------------------------------------------------------------------------

  // Start a chain and emit CHAIN_START event
  // Returns RunInfo that should be passed to endChain/errorChain
  RunInfo startChain(
      const std::string& name,
      const core::JsonValue& input,
      const std::vector<std::string>& tags = {},
      const core::JsonValue& metadata = core::JsonValue::object()) {
    RunInfo info = createRunInfo(name, "chain", tags, metadata);
    emitChainStart(info, input);
    return info;
  }

  // End a chain successfully and emit CHAIN_END event
  void endChain(const RunInfo& info, const core::JsonValue& output) {
    emitChainEnd(info, output);
  }

  // End a chain with error and emit CHAIN_ERROR event
  void errorChain(const RunInfo& info, const core::Error& error) {
    emitChainError(info, error);
  }

  // -------------------------------------------------------------------------
  // Tool Event Emission
  // -------------------------------------------------------------------------

  // Start a tool invocation and emit TOOL_START event
  RunInfo startTool(
      const std::string& tool_name,
      const core::JsonValue& input,
      const std::vector<std::string>& tags = {},
      const core::JsonValue& metadata = core::JsonValue::object()) {
    RunInfo info = createRunInfo(tool_name, "tool", tags, metadata);
    emitToolStart(info, tool_name, input);
    return info;
  }

  // End a tool invocation successfully and emit TOOL_END event
  void endTool(const RunInfo& info,
               const std::string& tool_name,
               const core::JsonValue& output) {
    emitToolEnd(info, tool_name, output);
  }

  // End a tool invocation with error and emit TOOL_ERROR event
  void errorTool(const RunInfo& info,
                 const std::string& tool_name,
                 const core::Error& error) {
    emitToolError(info, tool_name, error);
  }

  // -------------------------------------------------------------------------
  // LLM Event Emission (for future use)
  // -------------------------------------------------------------------------

  RunInfo startLLM(
      const std::string& name,
      const core::JsonValue& input,
      const std::vector<std::string>& tags = {},
      const core::JsonValue& metadata = core::JsonValue::object()) {
    RunInfo info = createRunInfo(name, "llm", tags, metadata);
    emitLLMStart(info, input);
    return info;
  }

  void endLLM(const RunInfo& info, const core::JsonValue& output) {
    emitLLMEnd(info, output);
  }

  void errorLLM(const RunInfo& info, const core::Error& error) {
    emitLLMError(info, error);
  }

  // -------------------------------------------------------------------------
  // Direct Event Emission (lower-level API)
  // -------------------------------------------------------------------------

  void emitChainStart(const RunInfo& info, const core::JsonValue& input) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onChainStart(info, input);
    }
  }

  void emitChainEnd(const RunInfo& info, const core::JsonValue& output) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onChainEnd(info, output);
    }
  }

  void emitChainError(const RunInfo& info, const core::Error& error) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onChainError(info, error);
    }
  }

  void emitToolStart(const RunInfo& info,
                     const std::string& tool_name,
                     const core::JsonValue& input) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onToolStart(info, tool_name, input);
    }
  }

  void emitToolEnd(const RunInfo& info,
                   const std::string& tool_name,
                   const core::JsonValue& output) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onToolEnd(info, tool_name, output);
    }
  }

  void emitToolError(const RunInfo& info,
                     const std::string& tool_name,
                     const core::Error& error) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onToolError(info, tool_name, error);
    }
  }

  void emitLLMStart(const RunInfo& info, const core::JsonValue& input) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onLLMStart(info, input);
    }
  }

  void emitLLMEnd(const RunInfo& info, const core::JsonValue& output) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onLLMEnd(info, output);
    }
  }

  void emitLLMError(const RunInfo& info, const core::Error& error) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onLLMError(info, error);
    }
  }

  // Emit a custom event
  void emitCustomEvent(const std::string& event_name,
                       const core::JsonValue& data) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onCustomEvent(event_name, data);
    }
  }

  // Emit a retry event
  void emitRetry(const RunInfo& info,
                 const core::Error& error,
                 uint32_t attempt,
                 uint32_t max_attempts) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& handler : handlers_) {
      handler->onRetry(info, error, attempt, max_attempts);
    }
  }

  // -------------------------------------------------------------------------
  // Child Manager Creation
  // -------------------------------------------------------------------------

  // Create a child manager for nested operations.
  // The child inherits all handlers and sets up parent-child tracing.
  //
  // Usage:
  //   auto child = manager->child();
  //   auto info = child->startChain("nested_chain", input);
  //   // info.parent_run_id will be set to parent's run_id
  Ptr child() {
    auto child_manager = std::make_shared<CallbackManager>();
    child_manager->parent_run_id_ = run_id_;

    // Copy handlers (share the same handler instances)
    std::lock_guard<std::mutex> lock(mutex_);
    child_manager->handlers_ = handlers_;

    return child_manager;
  }

  // Create a child manager with a specific name for the child run
  Ptr childWithName(const std::string& name) {
    auto child_manager = child();
    child_manager->run_name_ = name;
    return child_manager;
  }

  // -------------------------------------------------------------------------
  // Tag and Metadata Management
  // -------------------------------------------------------------------------

  // Add inheritable tags that will be passed to child managers
  void addTags(const std::vector<std::string>& tags) {
    std::lock_guard<std::mutex> lock(mutex_);
    inheritable_tags_.insert(inheritable_tags_.end(), tags.begin(), tags.end());
  }

  // Add inheritable metadata that will be passed to child managers
  void addMetadata(const std::string& key, const core::JsonValue& value) {
    std::lock_guard<std::mutex> lock(mutex_);
    inheritable_metadata_[key] = value;
  }

  // Get current inheritable tags
  std::vector<std::string> inheritableTags() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return inheritable_tags_;
  }

  // Get current inheritable metadata
  core::JsonValue inheritableMetadata() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return inheritable_metadata_;
  }

 private:
  // Generate a unique run ID
  // Uses a simple counter + random component for uniqueness
  static std::string generateRunId() {
    static std::atomic<uint64_t> counter{0};
    uint64_t count = counter.fetch_add(1);

    // Generate random component
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<uint32_t> dis(0, 0xFFFFFFFF);
    uint32_t random_part = dis(gen);

    std::ostringstream oss;
    oss << "run-" << std::hex << count << "-" << random_part;
    return oss.str();
  }

  // Create a RunInfo with current context
  RunInfo createRunInfo(const std::string& name,
                        const std::string& run_type,
                        const std::vector<std::string>& tags,
                        const core::JsonValue& metadata) {
    RunInfo info;
    info.run_id = generateRunId();
    info.parent_run_id = parent_run_id_;
    info.name = name;
    info.run_type = run_type;

    // Combine inheritable tags with provided tags
    {
      std::lock_guard<std::mutex> lock(mutex_);
      info.tags = inheritable_tags_;
    }
    info.tags.insert(info.tags.end(), tags.begin(), tags.end());

    // Merge inheritable metadata with provided metadata
    info.metadata = inheritableMetadata();
    if (metadata.isObject()) {
      for (auto it = metadata.begin(); it != metadata.end(); ++it) {
        auto kv = *it;
        info.metadata[kv.first] = kv.second;
      }
    }

    return info;
  }

  mutable std::mutex mutex_;
  std::vector<std::shared_ptr<CallbackHandler>> handlers_;
  std::string run_id_;
  std::string parent_run_id_;
  std::string run_name_;
  std::vector<std::string> inheritable_tags_;
  core::JsonValue inheritable_metadata_{core::JsonValue::object()};
};

// =============================================================================
// RAII Guard for automatic chain lifecycle management
// =============================================================================

// ChainGuard automatically ends a chain when it goes out of scope.
// This ensures that chain events are properly closed even if an exception
// is thrown or early return occurs.
//
// Usage:
//   {
//     ChainGuard guard(manager, "my_chain", input);
//     // ... do work ...
//     guard.setOutput(output);  // Mark successful completion
//   }  // Automatically calls endChain or errorChain
class ChainGuard {
 public:
  ChainGuard(CallbackManager::Ptr manager,
             const std::string& name,
             const core::JsonValue& input)
      : manager_(std::move(manager)), completed_(false) {
    run_info_ = manager_->startChain(name, input);
  }

  ~ChainGuard() {
    if (!completed_) {
      // If not explicitly completed, treat as error
      manager_->errorChain(
          run_info_,
          core::Error(core::OrchError::INTERNAL_ERROR, "Chain not completed"));
    }
  }

  // Mark the chain as successfully completed
  void setOutput(const core::JsonValue& output) {
    manager_->endChain(run_info_, output);
    completed_ = true;
  }

  // Mark the chain as failed with an error
  void setError(const core::Error& error) {
    manager_->errorChain(run_info_, error);
    completed_ = true;
  }

  // Get the run info for this chain
  const RunInfo& runInfo() const { return run_info_; }

  // Prevent copying
  ChainGuard(const ChainGuard&) = delete;
  ChainGuard& operator=(const ChainGuard&) = delete;

 private:
  CallbackManager::Ptr manager_;
  RunInfo run_info_;
  bool completed_;
};

// =============================================================================
// RAII Guard for automatic tool lifecycle management
// =============================================================================

class ToolGuard {
 public:
  ToolGuard(CallbackManager::Ptr manager,
            const std::string& tool_name,
            const core::JsonValue& input)
      : manager_(std::move(manager)), tool_name_(tool_name), completed_(false) {
    run_info_ = manager_->startTool(tool_name, input);
  }

  ~ToolGuard() {
    if (!completed_) {
      manager_->errorTool(
          run_info_, tool_name_,
          core::Error(core::OrchError::INTERNAL_ERROR, "Tool not completed"));
    }
  }

  void setOutput(const core::JsonValue& output) {
    manager_->endTool(run_info_, tool_name_, output);
    completed_ = true;
  }

  void setError(const core::Error& error) {
    manager_->errorTool(run_info_, tool_name_, error);
    completed_ = true;
  }

  const RunInfo& runInfo() const { return run_info_; }

  ToolGuard(const ToolGuard&) = delete;
  ToolGuard& operator=(const ToolGuard&) = delete;

 private:
  CallbackManager::Ptr manager_;
  std::string tool_name_;
  RunInfo run_info_;
  bool completed_;
};

}  // namespace callback
}  // namespace orch
}  // namespace gopher
