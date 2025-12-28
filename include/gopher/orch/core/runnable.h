#pragma once

// Runnable<Input, Output> - Universal composable interface
// Core abstraction for all operations in the orchestration framework
//
// Design principles:
// - Async-first: All operations use callbacks, no blocking
// - Dispatcher-native: Callbacks invoked in dispatcher thread context
// - Composable: Can be chained with pipe(), parallel(), etc.
// - Type-safe: Strong typing with explicit Input/Output types

#include <memory>
#include <string>

#include "gopher/orch/core/config.h"
#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace core {

// Forward declarations for composition functions
template <typename I, typename M, typename O>
class SequenceRunnable;

template <typename I, typename O>
class ParallelRunnable;

// Runnable<Input, Output> - Base class for all composable operations
//
// All callbacks are invoked in dispatcher thread context following the pattern:
// Create -> Configure -> Invoke (with dispatcher) -> Callback in dispatcher
//
// Implementations must:
// 1. Call callback exactly once (success or error)
// 2. Post callback to dispatcher if not already in dispatcher context
// 3. Handle cancellation gracefully
template <typename Input, typename Output>
class Runnable : public std::enable_shared_from_this<Runnable<Input, Output>> {
 public:
  using InputType = Input;
  using OutputType = Output;
  using Callback = ResultCallback<Output>;
  using Ptr = std::shared_ptr<Runnable<Input, Output>>;

  virtual ~Runnable() = default;

  // Human-readable name for debugging and tracing
  virtual std::string name() const = 0;

  // Invoke the runnable asynchronously
  // - input: The input value to process
  // - config: Configuration options (tags, metadata, timeout, etc.)
  // - dispatcher: Event loop for async operations
  // - callback: Called exactly once with Result<Output>
  //
  // The callback MUST be invoked in the dispatcher's thread context.
  // Implementations should post to dispatcher if running in a different thread.
  virtual void invoke(const Input& input,
                      const RunnableConfig& config,
                      Dispatcher& dispatcher,
                      Callback callback) = 0;

  // Convenience: invoke with default config
  void invoke(const Input& input, Dispatcher& dispatcher, Callback callback) {
    invoke(input, RunnableConfig(), dispatcher, std::move(callback));
  }

  // Get shared pointer to this runnable
  Ptr shared() { return this->shared_from_this(); }

 protected:
  Runnable() = default;

  // Helper to post callback to dispatcher
  // Use this when the result is ready but we're not in dispatcher context
  template <typename T>
  static void postResult(Dispatcher& dispatcher,
                         ResultCallback<T> callback,
                         Result<T> result) {
    dispatcher.post(
        [callback = std::move(callback), result = std::move(result)]() mutable {
          callback(std::move(result));
        });
  }

  // Helper to post error to dispatcher
  template <typename T>
  static void postError(Dispatcher& dispatcher,
                        ResultCallback<T> callback,
                        int code,
                        const std::string& message) {
    dispatcher.post([callback = std::move(callback), code, message]() {
      callback(Result<T>(Error(code, message)));
    });
  }
};

// Type alias for JSON-to-JSON runnable (used for type-erased operations)
using JsonRunnable = Runnable<JsonValue, JsonValue>;
using JsonRunnablePtr = std::shared_ptr<JsonRunnable>;

// Concept-like trait to check if a type is a Runnable
template <typename T>
struct is_runnable : std::false_type {};

template <typename I, typename O>
struct is_runnable<Runnable<I, O>> : std::true_type {};

template <typename I, typename O>
struct is_runnable<std::shared_ptr<Runnable<I, O>>> : std::true_type {};

}  // namespace core
}  // namespace orch
}  // namespace gopher
