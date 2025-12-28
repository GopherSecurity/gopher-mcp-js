#pragma once

// Retry - Wrap a runnable with retry logic
// Implements exponential backoff with optional jitter
//
// Behavior:
// - Retries failed operations up to max_attempts times
// - Delays between retries using exponential backoff
// - Optional jitter to prevent thundering herd
// - Optional retry condition to filter retryable errors

#include <cmath>
#include <functional>
#include <memory>
#include <random>
#include <string>
#include <utility>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace resilience {

using namespace gopher::orch::core;

// RetryPolicy - Configuration for retry behavior
struct RetryPolicy {
  uint32_t max_attempts;       // Maximum number of attempts (including first)
  uint64_t initial_delay_ms;   // Initial delay before first retry
  double backoff_multiplier;   // Multiplier for each subsequent retry
  uint64_t max_delay_ms;       // Maximum delay between retries
  bool jitter;                 // Add random jitter to delays

  // Optional: condition to check if error is retryable
  std::function<bool(const Error&)> retry_on;

  // Optional: callback on retry (for logging/observability)
  std::function<void(const Error&, uint32_t attempt)> on_retry;

  RetryPolicy()
      : max_attempts(3),
        initial_delay_ms(500),
        backoff_multiplier(2.0),
        max_delay_ms(30000),
        jitter(true),
        retry_on(nullptr),
        on_retry(nullptr) {}

  // Factory for exponential backoff policy
  static RetryPolicy exponential(uint32_t attempts = 3,
                                 uint64_t initial_delay_ms = 500) {
    RetryPolicy policy;
    policy.max_attempts = attempts;
    policy.initial_delay_ms = initial_delay_ms;
    return policy;
  }

  // Factory for fixed delay policy (no backoff)
  static RetryPolicy fixed(uint32_t attempts, uint64_t delay_ms) {
    RetryPolicy policy;
    policy.max_attempts = attempts;
    policy.initial_delay_ms = delay_ms;
    policy.backoff_multiplier = 1.0;
    policy.jitter = false;
    return policy;
  }
};

// Retry - Wrap a runnable with retry logic
template <typename Input, typename Output>
class Retry : public Runnable<Input, Output> {
 public:
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;
  using Callback = typename Runnable<Input, Output>::Callback;

  Retry(RunnablePtr inner, RetryPolicy policy)
      : inner_(std::move(inner)), policy_(std::move(policy)) {}

  std::string name() const override {
    return "Retry(" + inner_->name() + ", " +
           std::to_string(policy_.max_attempts) + ")";
  }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    // Start first attempt
    attemptInvoke(input, config, dispatcher, std::move(callback), 1);
  }

  // Factory method
  static std::shared_ptr<Retry<Input, Output>> create(RunnablePtr inner,
                                                      RetryPolicy policy) {
    return std::make_shared<Retry<Input, Output>>(std::move(inner),
                                                  std::move(policy));
  }

 private:
  // State to hold timer during retry delay
  // This ensures timer is kept alive until it fires
  struct RetryState {
    mcp::event::TimerPtr timer;
  };

  void attemptInvoke(const Input& input,
                     const RunnableConfig& config,
                     Dispatcher& dispatcher,
                     Callback callback,
                     uint32_t attempt) {
    auto self =
        std::static_pointer_cast<Retry<Input, Output>>(this->shared_from_this());
    auto input_copy = input;  // Copy for potential retry

    inner_->invoke(
        input, config.child(), dispatcher,
        [self, input_copy, config, &dispatcher, callback = std::move(callback),
         attempt](Result<Output> result) mutable {
          if (mcp::holds_alternative<Output>(result)) {
            // Success - return result
            callback(std::move(result));
            return;
          }

          // Get error for retry decision
          const auto& error = mcp::get<Error>(result);

          // Check if we should retry
          bool should_retry = attempt < self->policy_.max_attempts;

          // Check optional retry condition
          if (should_retry && self->policy_.retry_on) {
            should_retry = self->policy_.retry_on(error);
          }

          if (!should_retry) {
            // No more retries - return error
            callback(std::move(result));
            return;
          }

          // Invoke optional retry callback
          if (self->policy_.on_retry) {
            self->policy_.on_retry(error, attempt);
          }

          // Calculate delay with exponential backoff
          uint64_t delay_ms = self->calculateDelay(attempt);

          // Create state to hold timer (keeps timer alive until callback fires)
          auto state = std::make_shared<RetryState>();

          // Schedule retry after delay using timer
          state->timer = dispatcher.createTimer(
              [self, input_copy, config, &dispatcher,
               callback = std::move(callback), attempt, state]() mutable {
                // State is captured to keep timer alive until this point
                self->attemptInvoke(input_copy, config, dispatcher,
                                    std::move(callback), attempt + 1);
              });
          state->timer->enableTimer(std::chrono::milliseconds(delay_ms));
        });
  }

  uint64_t calculateDelay(uint32_t attempt) const {
    // Calculate base delay with exponential backoff
    double delay =
        policy_.initial_delay_ms * std::pow(policy_.backoff_multiplier, attempt - 1);

    // Cap at max delay
    if (delay > static_cast<double>(policy_.max_delay_ms)) {
      delay = static_cast<double>(policy_.max_delay_ms);
    }

    // Add jitter if enabled (±50%)
    if (policy_.jitter) {
      static thread_local std::mt19937 gen(std::random_device{}());
      std::uniform_real_distribution<> dis(0.5, 1.5);
      delay *= dis(gen);
    }

    return static_cast<uint64_t>(delay);
  }

  RunnablePtr inner_;
  RetryPolicy policy_;
};

// Convenience alias for JSON retry
using JsonRetry = Retry<JsonValue, JsonValue>;

// Factory function for creating retry wrapper
template <typename I, typename O>
std::shared_ptr<Retry<I, O>> withRetry(std::shared_ptr<Runnable<I, O>> inner,
                                       RetryPolicy policy = RetryPolicy()) {
  return Retry<I, O>::create(std::move(inner), std::move(policy));
}

// Factory for JSON retry
inline std::shared_ptr<JsonRetry> withRetry(JsonRunnablePtr inner,
                                            RetryPolicy policy = RetryPolicy()) {
  return JsonRetry::create(std::move(inner), std::move(policy));
}

}  // namespace resilience
}  // namespace orch
}  // namespace gopher
