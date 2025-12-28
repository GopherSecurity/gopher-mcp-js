#pragma once

// CircuitBreaker - Prevent cascade failures
// Implements the circuit breaker pattern to stop calling failing services
//
// States:
// - CLOSED: Normal operation, requests pass through
// - OPEN: Failures exceeded threshold, requests immediately rejected
// - HALF_OPEN: Testing if service recovered, limited requests allowed
//
// Behavior:
// - Tracks failures and opens circuit when threshold reached
// - Rejects requests immediately when open (fail-fast)
// - Tries limited requests after recovery timeout (half-open)
// - Closes circuit when half-open requests succeed

#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <string>
#include <utility>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace resilience {

using namespace gopher::orch::core;

// CircuitBreaker states
enum class CircuitState { CLOSED, OPEN, HALF_OPEN };

// CircuitBreakerPolicy - Configuration for circuit breaker behavior
struct CircuitBreakerPolicy {
  uint32_t failure_threshold;    // Number of failures before opening
  uint64_t recovery_timeout_ms;  // Time to wait before trying half-open
  uint32_t half_open_max_calls;  // Number of successful calls to close

  // Optional: callback for state changes (for logging/observability)
  std::function<void(CircuitState from, CircuitState to)> on_state_change;

  CircuitBreakerPolicy()
      : failure_threshold(5),
        recovery_timeout_ms(30000),
        half_open_max_calls(3),
        on_state_change(nullptr) {}

  // Factory for common configurations
  static CircuitBreakerPolicy standard() { return CircuitBreakerPolicy(); }

  static CircuitBreakerPolicy aggressive(uint32_t failure_threshold = 3,
                                         uint64_t recovery_timeout_ms = 10000) {
    CircuitBreakerPolicy policy;
    policy.failure_threshold = failure_threshold;
    policy.recovery_timeout_ms = recovery_timeout_ms;
    return policy;
  }

  static CircuitBreakerPolicy lenient(uint32_t failure_threshold = 10,
                                      uint64_t recovery_timeout_ms = 60000) {
    CircuitBreakerPolicy policy;
    policy.failure_threshold = failure_threshold;
    policy.recovery_timeout_ms = recovery_timeout_ms;
    return policy;
  }
};

// CircuitBreaker - Prevent cascade failures
template <typename Input, typename Output>
class CircuitBreaker : public Runnable<Input, Output> {
 public:
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;
  using Callback = typename Runnable<Input, Output>::Callback;

  CircuitBreaker(RunnablePtr inner, CircuitBreakerPolicy policy)
      : inner_(std::move(inner)),
        policy_(std::move(policy)),
        state_(CircuitState::CLOSED),
        failure_count_(0),
        half_open_successes_(0),
        last_failure_time_(0) {}

  std::string name() const override {
    return "CircuitBreaker(" + inner_->name() + ")";
  }

  // Get current circuit state
  CircuitState state() const { return state_.load(); }

  // Get failure count
  uint32_t failureCount() const { return failure_count_.load(); }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    // Check and potentially transition state
    CircuitState current_state = checkAndTransitionState();

    if (current_state == CircuitState::OPEN) {
      // Circuit is open - fail fast
      dispatcher.post([callback = std::move(callback)]() {
        callback(
            makeOrchError<Output>(OrchError::CIRCUIT_OPEN, "Circuit is open"));
      });
      return;
    }

    // Circuit is closed or half-open - try the operation
    auto self = std::static_pointer_cast<CircuitBreaker<Input, Output>>(
        this->shared_from_this());

    inner_->invoke(
        input, config.child(), dispatcher,
        [self, callback = std::move(callback)](Result<Output> result) mutable {
          if (mcp::holds_alternative<Output>(result)) {
            self->onSuccess();
          } else {
            self->onFailure();
          }
          callback(std::move(result));
        });
  }

  // Manual reset of circuit breaker (for testing/admin purposes)
  void reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    transitionTo(CircuitState::CLOSED);
    failure_count_.store(0);
    half_open_successes_.store(0);
  }

  // Factory method
  static std::shared_ptr<CircuitBreaker<Input, Output>> create(
      RunnablePtr inner,
      CircuitBreakerPolicy policy = CircuitBreakerPolicy()) {
    return std::make_shared<CircuitBreaker<Input, Output>>(std::move(inner),
                                                           std::move(policy));
  }

 private:
  // Check current state and transition if needed (e.g., OPEN -> HALF_OPEN)
  CircuitState checkAndTransitionState() {
    CircuitState current = state_.load();

    if (current == CircuitState::OPEN) {
      // Check if recovery timeout has elapsed
      uint64_t now = currentTimeMs();
      uint64_t last_failure = last_failure_time_.load();
      uint64_t elapsed = now - last_failure;

      if (elapsed >= policy_.recovery_timeout_ms) {
        // Try to transition to HALF_OPEN
        std::lock_guard<std::mutex> lock(mutex_);
        if (state_.load() == CircuitState::OPEN) {
          transitionTo(CircuitState::HALF_OPEN);
          half_open_successes_.store(0);
          return CircuitState::HALF_OPEN;
        }
      }
    }

    return state_.load();
  }

  // Called when operation succeeds
  void onSuccess() {
    std::lock_guard<std::mutex> lock(mutex_);

    CircuitState current = state_.load();
    if (current == CircuitState::HALF_OPEN) {
      // Count successful calls in half-open state
      uint32_t successes = ++half_open_successes_;
      if (successes >= policy_.half_open_max_calls) {
        // Enough successes - close the circuit
        transitionTo(CircuitState::CLOSED);
        failure_count_.store(0);
      }
    } else {
      // Reset failure count on success
      failure_count_.store(0);
    }
  }

  // Called when operation fails
  void onFailure() {
    std::lock_guard<std::mutex> lock(mutex_);

    CircuitState current = state_.load();
    if (current == CircuitState::HALF_OPEN) {
      // Failure in half-open - immediately reopen
      transitionTo(CircuitState::OPEN);
      last_failure_time_.store(currentTimeMs());
    } else {
      // Count failure and potentially open circuit
      uint32_t failures = ++failure_count_;
      if (failures >= policy_.failure_threshold) {
        transitionTo(CircuitState::OPEN);
        last_failure_time_.store(currentTimeMs());
      }
    }
  }

  // Transition to new state with optional callback
  void transitionTo(CircuitState new_state) {
    CircuitState old_state = state_.exchange(new_state);
    if (old_state != new_state && policy_.on_state_change) {
      policy_.on_state_change(old_state, new_state);
    }
  }

  // Get current time in milliseconds
  static uint64_t currentTimeMs() {
    auto now = std::chrono::steady_clock::now();
    auto ms =
        std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch());
    return static_cast<uint64_t>(ms.count());
  }

  RunnablePtr inner_;
  CircuitBreakerPolicy policy_;
  std::atomic<CircuitState> state_;
  std::atomic<uint32_t> failure_count_;
  std::atomic<uint32_t> half_open_successes_;
  std::atomic<uint64_t> last_failure_time_;
  std::mutex mutex_;
};

// Convenience alias for JSON circuit breaker
using JsonCircuitBreaker = CircuitBreaker<JsonValue, JsonValue>;

// Factory function for creating circuit breaker wrapper
template <typename I, typename O>
std::shared_ptr<CircuitBreaker<I, O>> withCircuitBreaker(
    std::shared_ptr<Runnable<I, O>> inner,
    CircuitBreakerPolicy policy = CircuitBreakerPolicy()) {
  return CircuitBreaker<I, O>::create(std::move(inner), std::move(policy));
}

// Factory for JSON circuit breaker
inline std::shared_ptr<JsonCircuitBreaker> withCircuitBreaker(
    JsonRunnablePtr inner,
    CircuitBreakerPolicy policy = CircuitBreakerPolicy()) {
  return JsonCircuitBreaker::create(std::move(inner), std::move(policy));
}

}  // namespace resilience
}  // namespace orch
}  // namespace gopher
