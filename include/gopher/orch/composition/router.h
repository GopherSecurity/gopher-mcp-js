#pragma once

// Router - Conditional branching for runnables
// Routes input to different runnables based on conditions
//
// Behavior:
// - Evaluates conditions in order until one matches
// - Routes to the matching runnable
// - Falls back to default if no condition matches
// - Returns error if no match and no default

#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "gopher/orch/core/runnable.h"

namespace gopher {
namespace orch {
namespace composition {

using namespace gopher::orch::core;

// Type-safe Router for typed runnables
// Evaluates conditions against input and routes to matching runnable
template <typename Input, typename Output>
class Router : public Runnable<Input, Output> {
 public:
  using Condition = std::function<bool(const Input&)>;
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;
  using Route = std::pair<Condition, RunnablePtr>;
  using Callback = typename Runnable<Input, Output>::Callback;

  Router(std::vector<Route> routes,
         RunnablePtr default_route,
         const std::string& name = "")
      : routes_(std::move(routes)),
        default_(std::move(default_route)),
        name_(name) {}

  std::string name() const override {
    if (!name_.empty()) {
      return name_;
    }
    std::string result = "Router(";
    result += std::to_string(routes_.size()) + " routes";
    if (default_) {
      result += ", default=" + default_->name();
    }
    result += ")";
    return result;
  }

  void invoke(const Input& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override {
    // Evaluate conditions in order
    for (const auto& route : routes_) {
      if (route.first(input)) {
        // Found matching route - invoke it
        route.second->invoke(input, config.child(), dispatcher,
                             std::move(callback));
        return;
      }
    }

    // No match - try default route
    if (default_) {
      default_->invoke(input, config.child(), dispatcher, std::move(callback));
      return;
    }

    // No match and no default - return error
    dispatcher.post([callback = std::move(callback)]() {
      callback(makeOrchError<Output>(OrchError::INVALID_ARGUMENT,
                                     "No matching route and no default"));
    });
  }

  // Get number of routes
  size_t size() const { return routes_.size(); }

  // Check if has default route
  bool hasDefault() const { return default_ != nullptr; }

 private:
  std::vector<Route> routes_;
  RunnablePtr default_;
  std::string name_;
};

// JSON Router - type-erased version for dynamic routing
using JsonRouter = Router<JsonValue, JsonValue>;

// Builder for creating Router with fluent API
template <typename Input, typename Output>
class RouterBuilder {
 public:
  using Condition = std::function<bool(const Input&)>;
  using RunnablePtr = std::shared_ptr<Runnable<Input, Output>>;

  explicit RouterBuilder(const std::string& name = "") : name_(name) {}

  // Add a conditional route
  RouterBuilder& when(Condition condition, RunnablePtr runnable) {
    routes_.emplace_back(std::move(condition), std::move(runnable));
    return *this;
  }

  // Set default route (when no conditions match)
  RouterBuilder& otherwise(RunnablePtr runnable) {
    default_ = std::move(runnable);
    return *this;
  }

  std::shared_ptr<Router<Input, Output>> build() {
    return std::make_shared<Router<Input, Output>>(std::move(routes_),
                                                   std::move(default_), name_);
  }

  // Implicit conversion to shared_ptr
  operator std::shared_ptr<Router<Input, Output>>() { return build(); }

 private:
  std::vector<std::pair<Condition, RunnablePtr>> routes_;
  RunnablePtr default_;
  std::string name_;
};

// Factory for JSON router builder
inline RouterBuilder<JsonValue, JsonValue> router(
    const std::string& name = "") {
  return RouterBuilder<JsonValue, JsonValue>(name);
}

// Factory function for type-safe router
template <typename I, typename O>
RouterBuilder<I, O> makeRouter(const std::string& name = "") {
  return RouterBuilder<I, O>(name);
}

}  // namespace composition
}  // namespace orch
}  // namespace gopher
