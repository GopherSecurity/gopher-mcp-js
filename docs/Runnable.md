# Runnable Interface

The `Runnable<Input, Output>` interface is the universal building block for all composable operations in Gopher Orch. Every operation - from simple lambdas to complex AI agents - implements this interface.

## Overview

```cpp
template <typename Input, typename Output>
class Runnable {
public:
  virtual std::string name() const = 0;
  virtual void invoke(const Input& input,
                      const RunnableConfig& config,
                      Dispatcher& dispatcher,
                      Callback callback) = 0;
};
```

## Design Principles

### 1. Async-First

All operations use callbacks - there are no blocking calls. This enables:
- Non-blocking I/O for network operations
- Efficient use of event loops
- Natural integration with the dispatcher model

### 2. Dispatcher-Native

Callbacks are always invoked in dispatcher thread context:
- Thread-safe by design
- No need for locks in most code
- Predictable execution order

### 3. Type-Safe

Strong typing with explicit Input/Output types:
- Compile-time type checking
- Clear interfaces between components
- No runtime type errors

### 4. Composable

Runnables can be combined using composition patterns:
- `Sequence`: Chain operations (A | B | C)
- `Parallel`: Execute concurrently
- `Router`: Conditional branching
- Resilience wrappers: Retry, Timeout, Fallback, CircuitBreaker

## Quick Start

### Creating a Lambda Runnable

```cpp
#include "gopher/orch/core/lambda.h"

using namespace gopher::orch::core;

// Synchronous lambda (simplest form)
auto greet = makeSyncLambda<std::string, std::string>(
    [](const std::string& name) -> Result<std::string> {
        return makeSuccess("Hello, " + name + "!");
    });

// Async lambda with dispatcher
auto fetch = makeLambda<std::string, JsonValue>(
    [](const std::string& url, Dispatcher& d, ResultCallback<JsonValue> cb) {
        // Perform async HTTP request...
        d.post([cb = std::move(cb)]() {
            cb(makeSuccess(JsonValue::object()));
        });
    });
```

### Invoking a Runnable

```cpp
// Get dispatcher (from event loop)
Dispatcher& dispatcher = getDispatcher();

// Invoke with callback
greet->invoke("World", RunnableConfig(), dispatcher,
    [](Result<std::string> result) {
        if (mcp::holds_alternative<std::string>(result)) {
            std::cout << mcp::get<std::string>(result) << std::endl;
        } else {
            std::cerr << mcp::get<Error>(result).message << std::endl;
        }
    });

// Run event loop
dispatcher.run();
```

## JsonRunnable

For dynamic, type-erased operations, use `JsonRunnable`:

```cpp
using JsonRunnable = Runnable<JsonValue, JsonValue>;
using JsonRunnablePtr = std::shared_ptr<JsonRunnable>;
```

This is used by:
- Composition patterns (Sequence, Parallel, Router)
- StateGraph nodes
- FFI bindings

## RunnableConfig

Configuration passed to every invocation:

```cpp
struct RunnableConfig {
    std::map<std::string, std::string> tags;      // Tracing tags
    std::map<std::string, JsonValue> metadata;    // Custom metadata
    optional<std::chrono::milliseconds> timeout;  // Operation timeout

    // Create child config for nested operations
    RunnableConfig child() const;
};
```

## Implementing Custom Runnables

### Basic Implementation

```cpp
class MyRunnable : public Runnable<std::string, int> {
public:
    std::string name() const override {
        return "MyRunnable";
    }

    void invoke(const std::string& input,
                const RunnableConfig& config,
                Dispatcher& dispatcher,
                Callback callback) override {
        // Perform operation...
        int result = input.length();

        // Always post callback to dispatcher
        dispatcher.post([callback = std::move(callback), result]() {
            callback(makeSuccess(result));
        });
    }
};
```

### Rules for Implementations

1. **Call callback exactly once** - Either success or error, never both, never zero times
2. **Post to dispatcher** - If not already in dispatcher context, use `dispatcher.post()`
3. **Handle errors gracefully** - Catch exceptions and convert to Error results
4. **Use shared_from_this()** - For capturing `this` in async callbacks

## Helper Methods

The base class provides helper methods:

```cpp
// Post result to dispatcher
template <typename T>
static void postResult(Dispatcher& dispatcher,
                       ResultCallback<T> callback,
                       Result<T> result);

// Post error to dispatcher
template <typename T>
static void postError(Dispatcher& dispatcher,
                      ResultCallback<T> callback,
                      int code,
                      const std::string& message);
```

## Composition

Runnables are designed to be composed:

```cpp
// Chain with pipe operator
auto pipeline = step1 | step2 | step3;

// Or use builders
auto seq = sequence()
    .add(step1)
    .add(step2)
    .add(step3)
    .build();

// Add resilience
auto reliable = withRetry(pipeline, RetryPolicy::exponential(3));
auto bounded = withTimeout(reliable, 30000);  // 30 seconds
```

## Type Aliases

Common type aliases for convenience:

```cpp
// JSON-based runnables
using JsonRunnable = Runnable<JsonValue, JsonValue>;
using JsonRunnablePtr = std::shared_ptr<JsonRunnable>;

// Result callbacks
template <typename T>
using ResultCallback = std::function<void(Result<T>)>;
```

## Best Practices

1. **Prefer composition over inheritance** - Use lambdas and composition patterns
2. **Keep runnables focused** - Single responsibility principle
3. **Use descriptive names** - The `name()` method helps debugging
4. **Handle all errors** - Never let exceptions escape
5. **Test with MockServer** - Use mocks for unit testing

## See Also

- [Composition Patterns](Composition.md) - Sequence, Parallel, Router
- [Resilience Patterns](Resilience.md) - Retry, Timeout, Fallback, CircuitBreaker
- [Agent Framework](Agent.md) - Building AI agents with tools
