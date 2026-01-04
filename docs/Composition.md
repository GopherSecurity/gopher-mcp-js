# Composition Patterns

Gopher Orch provides three core composition patterns for building complex workflows from simple components: **Sequence**, **Parallel**, and **Router**.

## Overview

| Pattern | Purpose | Behavior |
|---------|---------|----------|
| Sequence | Chain operations | Output of A becomes input of B |
| Parallel | Concurrent execution | Same input to all branches, collect results |
| Router | Conditional branching | Route to different handlers based on conditions |

## Sequence

Chain multiple runnables together where the output of one becomes the input of the next.

### Basic Usage

```cpp
#include "gopher/orch/composition/sequence.h"

using namespace gopher::orch::composition;

// Using pipe operator (type-safe)
auto pipeline = parseInput | processData | formatOutput;

// Using builder (JSON runnables)
auto seq = sequence("MyPipeline")
    .add(step1)
    .add(step2)
    .add(step3)
    .build();

// Invoke
seq->invoke(input, config, dispatcher, callback);
```

### Type-Safe Chaining

When types are known at compile time, use the `|` operator:

```cpp
// Types must match: A's output = B's input
auto step1 = makeSyncLambda<std::string, int>(...);      // string -> int
auto step2 = makeSyncLambda<int, JsonValue>(...);        // int -> JsonValue

auto pipeline = step1 | step2;  // string -> JsonValue
```

### Dynamic Chaining

For runtime-composed pipelines, use the builder:

```cpp
auto builder = sequence("DynamicPipeline");

for (auto& step : steps) {
    builder.add(step);
}

auto pipeline = builder.build();
```

### Error Handling

Sequence **short-circuits on first error** - subsequent steps are not executed:

```cpp
auto seq = sequence()
    .add(mayFail)      // If this fails...
    .add(neverRuns)    // ...this is skipped
    .build();
```

## Parallel

Execute multiple runnables concurrently with the same input.

### Basic Usage

```cpp
#include "gopher/orch/composition/parallel.h"

using namespace gopher::orch::composition;

// Build parallel execution
auto par = parallel("FetchAll")
    .add("weather", fetchWeather)
    .add("news", fetchNews)
    .add("stocks", fetchStocks)
    .build();

// Invoke - all branches get the same input
par->invoke(input, config, dispatcher, [](Result<JsonValue> result) {
    // Result is an object with keys: weather, news, stocks
    auto& data = mcp::get<JsonValue>(result);
    auto weather = data["weather"];
    auto news = data["news"];
    auto stocks = data["stocks"];
});
```

### Result Structure

Results are collected into a JSON object with branch keys:

```json
{
  "weather": { "temp": 72, "condition": "sunny" },
  "news": [ { "title": "..." }, ... ],
  "stocks": { "AAPL": 150.00, ... }
}
```

### Fail-Fast Behavior

By default, Parallel uses **fail-fast** semantics:
- First error cancels pending branches
- Error is returned immediately

```cpp
auto par = parallel()
    .add("fast", quickOp)      // Completes first
    .add("slow", slowOp)       // If fast fails, slow is cancelled
    .build();
```

## Router

Route input to different runnables based on conditions.

### Basic Usage

```cpp
#include "gopher/orch/composition/router.h"

using namespace gopher::orch::composition;

// JSON router with conditions
auto route = router("ActionRouter")
    .when([](const JsonValue& input) {
        return input["action"].getString() == "search";
    }, searchHandler)
    .when([](const JsonValue& input) {
        return input["action"].getString() == "calculate";
    }, calculateHandler)
    .otherwise(defaultHandler)
    .build();

// Invoke - routes to matching handler
route->invoke(input, config, dispatcher, callback);
```

### Type-Safe Router

For typed runnables:

```cpp
auto route = makeRouter<std::string, JsonValue>("TypedRouter")
    .when([](const std::string& s) { return s.starts_with("http"); }, httpHandler)
    .when([](const std::string& s) { return s.starts_with("file"); }, fileHandler)
    .otherwise(defaultHandler)
    .build();
```

### Condition Evaluation

Conditions are evaluated in order:
1. First matching condition wins
2. If no match, uses `otherwise` handler
3. If no `otherwise`, returns error

```cpp
auto route = router()
    .when(isHighPriority, fastPath)    // Checked first
    .when(isNormalPriority, normalPath) // Checked second
    .otherwise(slowPath)                // Fallback
    .build();
```

## Combining Patterns

Patterns can be nested and combined:

```cpp
// Sequence with parallel step
auto pipeline = sequence()
    .add(parseInput)
    .add(parallel()
        .add("validate", validator)
        .add("enrich", enricher)
        .build())
    .add(processResults)
    .build();

// Router with sequence branches
auto workflow = router()
    .when(isSimple, simpleHandler)
    .when(isComplex, sequence()
        .add(analyze)
        .add(process)
        .add(format)
        .build())
    .otherwise(errorHandler)
    .build();
```

## With Resilience Patterns

Add reliability to composed workflows:

```cpp
#include "gopher/orch/resilience/retry.h"
#include "gopher/orch/resilience/timeout.h"

// Parallel with timeout
auto bounded = withTimeout(
    parallel()
        .add("api1", fetchFromApi1)
        .add("api2", fetchFromApi2)
        .build(),
    5000  // 5 second timeout for entire parallel execution
);

// Sequence with retry
auto reliable = withRetry(
    sequence()
        .add(fetchData)
        .add(processData)
        .build(),
    RetryPolicy::exponential(3)
);
```

## Factory Functions

| Function | Description |
|----------|-------------|
| `sequence(name)` | Create Sequence builder |
| `parallel(name)` | Create Parallel builder |
| `router(name)` | Create JSON Router builder |
| `makeRouter<I,O>(name)` | Create typed Router builder |
| `makeSequence(a, b)` | Create type-safe two-step Sequence |
| `a \| b` | Pipe operator for type-safe chaining |

## Best Practices

1. **Name your compositions** - Use descriptive names for debugging
2. **Keep branches independent** - Parallel branches shouldn't depend on each other
3. **Handle errors at boundaries** - Use resilience wrappers where appropriate
4. **Consider timeouts** - Long-running compositions should have timeouts
5. **Test branches individually** - Unit test each component before composing

## See Also

- [Runnable Interface](Runnable.md) - Core interface
- [Resilience Patterns](Resilience.md) - Retry, Timeout, Fallback, CircuitBreaker
- [StateGraph Guide](StateGraph.md) - Stateful workflows with conditional edges
