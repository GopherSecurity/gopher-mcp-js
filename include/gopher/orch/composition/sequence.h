#pragma once

// Sequence - Chain runnables together: output of one becomes input of next
// Implements the pipe pattern: A | B | C means A.output -> B.input -> C.input
//
// Short-circuits on first error - subsequent steps are not executed

#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace composition {

using namespace gopher::orch::core;

// Sequence of two runnables with type-safe chaining
// A's output must match B's input type
template <typename Input, typename Middle, typename Output>
class Sequence2 : public Runnable<Input, Output> {
 public:
  using FirstPtr = std::shared_ptr<Runnable<Input, Middle>>;
  using SecondPtr = std::shared_ptr<Runnable<Middle, Output>>;
  using Callback = typename Runnable<Input, Output>::Callback;

  Sequence2(FirstPtr first, SecondPtr second, const std::string& name = "")
      : first_(std::move(first)),
        second_(std::move(second)),
        name_(name.empty() ? first_->name() + " | " + second_->name() : name) {}

  std::string name() const override { return name_; }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    // Capture pointers by value to extend lifetime
    auto first = first_;
    auto second = second_;

    // Invoke first, then chain to second on success
    first->invoke(input, config, dispatcher,
                  [second, config, &dispatcher, callback = std::move(callback)](
                      Result<Middle> result) mutable {
                    if (mcp::holds_alternative<Error>(result)) {
                      // Short-circuit: propagate error without running second
                      callback(Result<Output>(mcp::get<Error>(result)));
                    } else {
                      // Chain: use first's output as second's input
                      second->invoke(mcp::get<Middle>(result), config.child(),
                                     dispatcher, std::move(callback));
                    }
                  });
  }

 private:
  FirstPtr first_;
  SecondPtr second_;
  std::string name_;
};

// JSON Sequence - chains multiple JSON runnables
// Uses type-erased JsonRunnable for dynamic composition
class Sequence : public JsonRunnable {
 public:
  using Callback = JsonRunnable::Callback;

  explicit Sequence(const std::string& name = "Sequence") : name_(name) {}

  // Add a step to the sequence
  Sequence& add(JsonRunnablePtr step) {
    steps_.push_back(std::move(step));
    return *this;
  }

  // Build the sequence name from step names if not explicitly set
  std::string name() const override {
    if (!name_.empty() && name_ != "Sequence") {
      return name_;
    }
    if (steps_.empty()) {
      return "Sequence(empty)";
    }
    std::string result = steps_[0]->name();
    for (size_t i = 1; i < steps_.size(); ++i) {
      result += " | " + steps_[i]->name();
    }
    return result;
  }

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    if (steps_.empty()) {
      // Empty sequence just passes through input
      dispatcher.post([input, callback = std::move(callback)]() {
        callback(makeSuccess(input));
      });
      return;
    }

    // Start the chain with first step
    invokeStep(0, input, config, dispatcher, std::move(callback));
  }

  // Get number of steps
  size_t size() const { return steps_.size(); }

  // Check if empty
  bool empty() const { return steps_.empty(); }

 private:
  void invokeStep(size_t index,
                  const JsonValue& input,
                  const RunnableConfig& config,
                  Dispatcher& dispatcher,
                  Callback callback) {
    if (index >= steps_.size()) {
      // All steps completed successfully
      dispatcher.post([input, callback = std::move(callback)]() {
        callback(makeSuccess(input));
      });
      return;
    }

    // Capture state for the callback chain
    // Using shared_from_this to keep the Sequence alive during async execution
    auto self = std::static_pointer_cast<Sequence>(this->shared_from_this());
    auto step = steps_[index];

    step->invoke(
        input, config.child(), dispatcher,
        [self, index, config, &dispatcher,
         callback = std::move(callback)](Result<JsonValue> result) mutable {
          if (mcp::holds_alternative<Error>(result)) {
            // Short-circuit on error
            callback(std::move(result));
          } else {
            // Continue to next step
            self->invokeStep(index + 1, mcp::get<JsonValue>(result), config,
                             dispatcher, std::move(callback));
          }
        });
  }

  std::vector<JsonRunnablePtr> steps_;
  std::string name_;
};

// Builder for creating Sequence with fluent API
class SequenceBuilder {
 public:
  explicit SequenceBuilder(const std::string& name = "Sequence")
      : sequence_(std::make_shared<Sequence>(name)) {}

  SequenceBuilder& add(JsonRunnablePtr step) {
    sequence_->add(std::move(step));
    return *this;
  }

  // Template version for typed runnables
  template <typename R>
  SequenceBuilder& add(std::shared_ptr<R> step) {
    sequence_->add(std::static_pointer_cast<JsonRunnable>(std::move(step)));
    return *this;
  }

  std::shared_ptr<Sequence> build() { return std::move(sequence_); }

  // Implicit conversion to shared_ptr
  operator std::shared_ptr<Sequence>() { return build(); }

 private:
  std::shared_ptr<Sequence> sequence_;
};

// Factory function for type-safe two-step sequence
template <typename I, typename M, typename O>
std::shared_ptr<Sequence2<I, M, O>> makeSequence(
    std::shared_ptr<Runnable<I, M>> first,
    std::shared_ptr<Runnable<M, O>> second,
    const std::string& name = "") {
  return std::make_shared<Sequence2<I, M, O>>(std::move(first),
                                              std::move(second), name);
}

// Operator | for chaining (type-safe version)
template <typename I, typename M, typename O>
std::shared_ptr<Sequence2<I, M, O>> operator|(
    std::shared_ptr<Runnable<I, M>> first,
    std::shared_ptr<Runnable<M, O>> second) {
  return makeSequence(std::move(first), std::move(second));
}

// Factory for JSON sequence
inline SequenceBuilder sequence(const std::string& name = "Sequence") {
  return SequenceBuilder(name);
}

}  // namespace composition
}  // namespace orch
}  // namespace gopher
