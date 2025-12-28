#pragma once

// Fallback - Try alternatives on failure
// Chains multiple runnables and tries each in order until one succeeds
//
// Behavior:
// - Tries primary runnable first
// - On failure, tries each fallback in order
// - Returns first successful result
// - Returns FALLBACK_EXHAUSTED error if all fail

#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace resilience {

using namespace gopher::orch::core;

// Fallback - Try alternatives on failure
template <typename Input, typename Output>
class Fallback : public Runnable<Input, Output> {
 public:
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;
  using Callback = typename Runnable<Input, Output>::Callback;

  Fallback(RunnablePtr primary, std::vector<RunnablePtr> fallbacks)
      : primary_(std::move(primary)), fallbacks_(std::move(fallbacks)) {}

  std::string name() const override {
    std::string result = "Fallback(" + primary_->name();
    for (const auto& fb : fallbacks_) {
      result += " -> " + fb->name();
    }
    result += ")";
    return result;
  }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    // Start with primary (index 0)
    attemptInvoke(input, config, dispatcher, std::move(callback), 0);
  }

  // Get the primary runnable
  RunnablePtr primary() const { return primary_; }

  // Get fallback runnables
  const std::vector<RunnablePtr>& fallbacks() const { return fallbacks_; }

  // Factory method
  static std::shared_ptr<Fallback<Input, Output>> create(
      RunnablePtr primary, std::vector<RunnablePtr> fallbacks) {
    return std::make_shared<Fallback<Input, Output>>(std::move(primary),
                                                     std::move(fallbacks));
  }

 private:
  void attemptInvoke(const Input& input,
                     const RunnableConfig& config,
                     Dispatcher& dispatcher,
                     Callback callback,
                     size_t index) {
    // Get current runnable to try
    RunnablePtr current;
    if (index == 0) {
      current = primary_;
    } else if (index <= fallbacks_.size()) {
      current = fallbacks_[index - 1];
    } else {
      // All fallbacks exhausted
      dispatcher.post([callback = std::move(callback)]() {
        callback(makeOrchError<Output>(OrchError::FALLBACK_EXHAUSTED,
                                       "All fallback options failed"));
      });
      return;
    }

    auto self = std::static_pointer_cast<Fallback<Input, Output>>(
        this->shared_from_this());
    auto input_copy = input;  // Copy for potential fallback

    current->invoke(
        input, config.child(), dispatcher,
        [self, input_copy, config, &dispatcher, callback = std::move(callback),
         index](Result<Output> result) mutable {
          if (mcp::holds_alternative<Output>(result)) {
            // Success - return result
            callback(std::move(result));
            return;
          }

          // Failure - try next fallback
          self->attemptInvoke(input_copy, config, dispatcher,
                              std::move(callback), index + 1);
        });
  }

  RunnablePtr primary_;
  std::vector<RunnablePtr> fallbacks_;
};

// Convenience alias for JSON fallback
using JsonFallback = Fallback<JsonValue, JsonValue>;

// Builder for creating Fallback with fluent API
template <typename Input, typename Output>
class FallbackBuilder {
 public:
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;

  explicit FallbackBuilder(RunnablePtr primary)
      : primary_(std::move(primary)) {}

  // Add a fallback option
  FallbackBuilder& orElse(RunnablePtr fallback) {
    fallbacks_.push_back(std::move(fallback));
    return *this;
  }

  std::shared_ptr<Fallback<Input, Output>> build() {
    return Fallback<Input, Output>::create(std::move(primary_),
                                           std::move(fallbacks_));
  }

  // Implicit conversion to shared_ptr
  operator std::shared_ptr<Fallback<Input, Output>>() { return build(); }

 private:
  RunnablePtr primary_;
  std::vector<RunnablePtr> fallbacks_;
};

// Factory function for creating fallback builder
template <typename I, typename O>
FallbackBuilder<I, O> withFallback(std::shared_ptr<Runnable<I, O>> primary) {
  return FallbackBuilder<I, O>(std::move(primary));
}

// Factory for JSON fallback builder
inline FallbackBuilder<JsonValue, JsonValue> withFallback(
    JsonRunnablePtr primary) {
  return FallbackBuilder<JsonValue, JsonValue>(std::move(primary));
}

}  // namespace resilience
}  // namespace orch
}  // namespace gopher
