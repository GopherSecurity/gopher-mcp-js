#pragma once

// Lambda - Create Runnable from a function or lambda
// Enables quick creation of custom operations without defining new classes

#include <functional>
#include <memory>
#include <string>
#include <utility>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace core {

// Synchronous function signature: (Input, Config) -> Result<Output>
// Use this when the operation can complete immediately
template <typename Input, typename Output>
using SyncFunc =
    std::function<Result<Output>(const Input&, const RunnableConfig&)>;

// Asynchronous function signature: (Input, Config, Dispatcher&, Callback)
// Use this when the operation needs async I/O or timer-based delays
template <typename Input, typename Output>
using AsyncFunc = std::function<void(
    const Input&, const RunnableConfig&, Dispatcher&, ResultCallback<Output>)>;

// Lambda Runnable - wraps a function as a Runnable
//
// Supports both synchronous and asynchronous functions:
// - Sync functions are posted to dispatcher for execution
// - Async functions are called directly (they manage their own posting)
template <typename Input, typename Output>
class Lambda : public Runnable<Input, Output> {
 public:
  using Callback = typename Runnable<Input, Output>::Callback;

  // Create from synchronous function
  // The function will be invoked via dispatcher.post() to ensure
  // the callback runs in dispatcher context
  static std::shared_ptr<Lambda> fromSync(SyncFunc<Input, Output> func,
                                          const std::string& name = "Lambda") {
    return std::shared_ptr<Lambda>(new Lambda(std::move(func), name, true));
  }

  // Create from asynchronous function
  // The function is responsible for calling the callback in dispatcher context
  static std::shared_ptr<Lambda> fromAsync(AsyncFunc<Input, Output> func,
                                           const std::string& name = "Lambda") {
    return std::shared_ptr<Lambda>(new Lambda(std::move(func), name, false));
  }

  std::string name() const override { return name_; }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    if (is_sync_) {
      // For sync functions, post to dispatcher to ensure callback runs in
      // dispatcher context. Capture by value to ensure data survives
      auto func = sync_func_;
      dispatcher.post(
          [func, input, config, callback = std::move(callback)]() mutable {
            Result<Output> result = func(input, config);
            callback(std::move(result));
          });
    } else {
      // For async functions, call directly - they manage their own posting
      async_func_(input, config, dispatcher, std::move(callback));
    }
  }

 private:
  // Private constructor - use factory methods
  Lambda(SyncFunc<Input, Output> func, std::string name, bool is_sync)
      : sync_func_(std::move(func)),
        name_(std::move(name)),
        is_sync_(is_sync) {}

  Lambda(AsyncFunc<Input, Output> func, std::string name, bool is_sync)
      : async_func_(std::move(func)),
        name_(std::move(name)),
        is_sync_(is_sync) {}

  SyncFunc<Input, Output> sync_func_;
  AsyncFunc<Input, Output> async_func_;
  std::string name_;
  bool is_sync_;
};

// Convenience factory functions

// Create Lambda from sync function: (Input, Config) -> Result<Output>
template <typename Input, typename Output>
std::shared_ptr<Lambda<Input, Output>> makeLambda(
    SyncFunc<Input, Output> func, const std::string& name = "Lambda") {
  return Lambda<Input, Output>::fromSync(std::move(func), name);
}

// Create Lambda from simple sync function: Input -> Result<Output>
// (ignores config)
template <typename Input, typename Output>
std::shared_ptr<Lambda<Input, Output>> makeLambda(
    std::function<Result<Output>(const Input&)> func,
    const std::string& name = "Lambda") {
  return Lambda<Input, Output>::fromSync(
      [func = std::move(func)](const Input& input, const RunnableConfig&) {
        return func(input);
      },
      name);
}

// Create Lambda from async function
template <typename Input, typename Output>
std::shared_ptr<Lambda<Input, Output>> makeLambdaAsync(
    AsyncFunc<Input, Output> func, const std::string& name = "Lambda") {
  return Lambda<Input, Output>::fromAsync(std::move(func), name);
}

// JSON-specific Lambda (most common use case for FFI and dynamic composition)
using JsonLambda = Lambda<JsonValue, JsonValue>;

// Create JSON Lambda from sync function
inline std::shared_ptr<JsonLambda> makeJsonLambda(
    SyncFunc<JsonValue, JsonValue> func,
    const std::string& name = "JsonLambda") {
  return JsonLambda::fromSync(std::move(func), name);
}

// Create JSON Lambda from simple sync function (ignores config)
inline std::shared_ptr<JsonLambda> makeJsonLambda(
    std::function<Result<JsonValue>(const JsonValue&)> func,
    const std::string& name = "JsonLambda") {
  return JsonLambda::fromSync(
      [func = std::move(func)](const JsonValue& input, const RunnableConfig&) {
        return func(input);
      },
      name);
}

}  // namespace core
}  // namespace orch
}  // namespace gopher
