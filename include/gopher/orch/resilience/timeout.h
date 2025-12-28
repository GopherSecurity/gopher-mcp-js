#pragma once

// Timeout - Limit execution time for a runnable
// Wraps a runnable and returns error if it doesn't complete within timeout
//
// Behavior:
// - Starts timer when invoke is called
// - Returns TIMEOUT error if timer fires before operation completes
// - Disables timer and returns result if operation completes first
// - Thread-safe handling of race between timer and completion

#include <atomic>
#include <memory>
#include <string>
#include <utility>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace resilience {

using namespace gopher::orch::core;

// Timeout - Wrap a runnable with timeout limit
template <typename Input, typename Output>
class Timeout : public Runnable<Input, Output> {
 public:
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;
  using Callback = typename Runnable<Input, Output>::Callback;

  Timeout(RunnablePtr inner, uint64_t timeout_ms)
      : inner_(std::move(inner)), timeout_ms_(timeout_ms) {}

  std::string name() const override {
    return "Timeout(" + inner_->name() + ", " + std::to_string(timeout_ms_) +
           "ms)";
  }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    // Create shared state to coordinate between timer and operation
    auto state = std::make_shared<TimeoutState>(std::move(callback));

    // Start timeout timer
    // We need to keep the timer alive, so store it in the state
    state->timer = dispatcher.createTimer(
        [state, &dispatcher]() { state->onTimeout(dispatcher); });
    state->timer->enableTimer(std::chrono::milliseconds(timeout_ms_));

    // Invoke inner runnable
    inner_->invoke(input, config.child(), dispatcher,
                   [state, &dispatcher](Result<Output> result) {
                     state->onResult(std::move(result), dispatcher);
                   });
  }

  // Factory method
  static std::shared_ptr<Timeout<Input, Output>> create(RunnablePtr inner,
                                                        uint64_t timeout_ms) {
    return std::make_shared<Timeout<Input, Output>>(std::move(inner),
                                                    timeout_ms);
  }

 private:
  // Shared state for coordinating between timeout and completion
  struct TimeoutState {
    Callback callback;
    mcp::event::TimerPtr timer;
    std::atomic<bool> completed{false};

    explicit TimeoutState(Callback cb) : callback(std::move(cb)) {}

    // Called when the operation completes (success or failure)
    void onResult(Result<Output> result, Dispatcher& dispatcher) {
      bool expected = false;
      if (completed.compare_exchange_strong(expected, true)) {
        // We won the race - disable timer and deliver result
        if (timer) {
          timer->disableTimer();
        }
        // Post to dispatcher to ensure callback runs in dispatcher context
        auto cb = std::move(callback);
        dispatcher.post(
            [cb = std::move(cb), result = std::move(result)]() mutable {
              cb(std::move(result));
            });
      }
      // else: timeout already fired, discard result
    }

    // Called when the timeout fires
    void onTimeout(Dispatcher& dispatcher) {
      bool expected = false;
      if (completed.compare_exchange_strong(expected, true)) {
        // We won the race - deliver timeout error
        auto cb = std::move(callback);
        dispatcher.post([cb = std::move(cb)]() {
          cb(makeOrchError<Output>(OrchError::TIMEOUT, "Operation timed out"));
        });
      }
      // else: operation already completed, ignore timeout
    }
  };

  RunnablePtr inner_;
  uint64_t timeout_ms_;
};

// Convenience alias for JSON timeout
using JsonTimeout = Timeout<JsonValue, JsonValue>;

// Factory function for creating timeout wrapper
template <typename I, typename O>
std::shared_ptr<Timeout<I, O>> withTimeout(
    std::shared_ptr<Runnable<I, O>> inner, uint64_t timeout_ms) {
  return Timeout<I, O>::create(std::move(inner), timeout_ms);
}

// Factory for JSON timeout
inline std::shared_ptr<JsonTimeout> withTimeout(JsonRunnablePtr inner,
                                                uint64_t timeout_ms) {
  return JsonTimeout::create(std::move(inner), timeout_ms);
}

}  // namespace resilience
}  // namespace orch
}  // namespace gopher
