#pragma once

// Parallel - Execute multiple runnables concurrently
// Distributes the same input to all branches, collects results into a map
//
// Behavior:
// - All branches receive the same input
// - Branches execute concurrently (subject to dispatcher threading)
// - Results collected into a JSON object with branch keys
// - Fails fast: first error cancels pending branches (TODO: make configurable)

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace composition {

using namespace gopher::orch::core;

// Parallel execution of JSON runnables
// Input is distributed to all branches, results collected by key
class Parallel : public JsonRunnable {
 public:
  using Callback = JsonRunnable::Callback;

  explicit Parallel(const std::string& name = "Parallel") : name_(name) {}

  // Add a named branch
  Parallel& add(const std::string& key, JsonRunnablePtr runnable) {
    branches_.emplace_back(key, std::move(runnable));
    return *this;
  }

  std::string name() const override {
    if (!name_.empty() && name_ != "Parallel") {
      return name_;
    }
    if (branches_.empty()) {
      return "Parallel(empty)";
    }
    std::string result = "Parallel(";
    for (size_t i = 0; i < branches_.size(); ++i) {
      if (i > 0) result += ", ";
      result += branches_[i].first;
    }
    result += ")";
    return result;
  }

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    if (branches_.empty()) {
      // Empty parallel returns empty object
      dispatcher.post([callback = std::move(callback)]() {
        callback(makeSuccess(JsonValue::object()));
      });
      return;
    }

    // Shared state for collecting results from all branches
    auto state = std::make_shared<ParallelState>(branches_.size(),
                                                  std::move(callback));

    // Launch all branches concurrently
    for (size_t i = 0; i < branches_.size(); ++i) {
      const auto& key = branches_[i].first;
      const auto& runnable = branches_[i].second;

      runnable->invoke(input, config.child(), dispatcher,
          [state, key, &dispatcher](Result<JsonValue> result) {
            state->onBranchComplete(key, std::move(result), dispatcher);
          });
    }
  }

  // Get number of branches
  size_t size() const { return branches_.size(); }

  // Check if empty
  bool empty() const { return branches_.empty(); }

 private:
  // State shared across all branch callbacks
  struct ParallelState {
    ParallelState(size_t total, Callback callback)
        : remaining(total),
          failed(false),
          callback_(std::move(callback)),
          results_(JsonValue::object()) {}

    void onBranchComplete(const std::string& key,
                          Result<JsonValue> result,
                          Dispatcher& dispatcher) {
      std::lock_guard<std::mutex> lock(mutex_);

      // Skip if already failed (fail-fast mode)
      if (failed) {
        return;
      }

      if (mcp::holds_alternative<Error>(result)) {
        // First error triggers callback
        failed = true;
        // Post to dispatcher to ensure callback runs in dispatcher context
        auto cb = std::move(callback_);
        auto error = mcp::get<Error>(result);
        dispatcher.post([cb = std::move(cb), error]() {
          cb(Result<JsonValue>(error));
        });
        return;
      }

      // Store successful result
      results_[key] = mcp::get<JsonValue>(result);
      remaining--;

      if (remaining == 0) {
        // All branches completed successfully
        auto cb = std::move(callback_);
        auto results = std::move(results_);
        dispatcher.post([cb = std::move(cb), results = std::move(results)]() {
          cb(makeSuccess(std::move(results)));
        });
      }
    }

    std::mutex mutex_;
    size_t remaining;
    bool failed;
    Callback callback_;
    JsonValue results_;
  };

  std::vector<std::pair<std::string, JsonRunnablePtr>> branches_;
  std::string name_;
};

// Builder for creating Parallel with fluent API
class ParallelBuilder {
 public:
  explicit ParallelBuilder(const std::string& name = "Parallel")
      : parallel_(std::make_shared<Parallel>(name)) {}

  ParallelBuilder& add(const std::string& key, JsonRunnablePtr runnable) {
    parallel_->add(key, std::move(runnable));
    return *this;
  }

  // Template version for typed runnables
  template <typename R>
  ParallelBuilder& add(const std::string& key, std::shared_ptr<R> runnable) {
    parallel_->add(key, std::static_pointer_cast<JsonRunnable>(std::move(runnable)));
    return *this;
  }

  std::shared_ptr<Parallel> build() { return std::move(parallel_); }

  // Implicit conversion to shared_ptr
  operator std::shared_ptr<Parallel>() { return build(); }

 private:
  std::shared_ptr<Parallel> parallel_;
};

// Factory for Parallel
inline ParallelBuilder parallel(const std::string& name = "Parallel") {
  return ParallelBuilder(name);
}

}  // namespace composition
}  // namespace orch
}  // namespace gopher
