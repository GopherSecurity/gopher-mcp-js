# Resilience Patterns

Gopher Orch provides four production-grade resilience patterns: **Retry**, **Timeout**, **Fallback**, and **Circuit Breaker**. These patterns wrap any Runnable to add reliability.

## Overview

| Pattern | Purpose | Use Case |
|---------|---------|----------|
| Retry | Repeat on failure | Transient errors, network issues |
| Timeout | Limit execution time | Prevent hanging operations |
| Fallback | Try alternatives | Graceful degradation |
| Circuit Breaker | Prevent cascade failures | Failing external services |

## Retry

Automatically retry failed operations with exponential backoff.

### Basic Usage

```cpp
#include "gopher/orch/resilience/retry.h"

using namespace gopher::orch::resilience;

// Default: 3 attempts, exponential backoff
auto reliable = withRetry(unreliableOperation);

// Custom policy
auto custom = withRetry(operation, RetryPolicy()
    .max_attempts(5)
    .initial_delay_ms(100)
    .backoff_multiplier(2.0)
    .max_delay_ms(10000)
    .jitter(true));
```

### RetryPolicy Options

```cpp
struct RetryPolicy {
    uint32_t max_attempts = 3;       // Total attempts (including first)
    uint64_t initial_delay_ms = 500; // Delay before first retry
    double backoff_multiplier = 2.0; // Multiply delay each retry
    uint64_t max_delay_ms = 30000;   // Cap on delay
    bool jitter = true;              // Add random jitter (±50%)

    // Optional: only retry specific errors
    std::function<bool(const Error&)> retry_on;

    // Optional: callback on each retry (for logging)
    std::function<void(const Error&, uint32_t attempt)> on_retry;
};
```

### Factory Methods

```cpp
// Exponential backoff (default)
auto policy = RetryPolicy::exponential(3, 500);

// Fixed delay (no backoff)
auto policy = RetryPolicy::fixed(5, 1000);
```

### Selective Retry

Only retry specific errors:

```cpp
auto policy = RetryPolicy();
policy.retry_on = [](const Error& e) {
    // Only retry network errors
    return e.code == NetworkError::TIMEOUT ||
           e.code == NetworkError::CONNECTION_RESET;
};

auto reliable = withRetry(operation, policy);
```

## Timeout

Limit execution time for any operation.

### Basic Usage

```cpp
#include "gopher/orch/resilience/timeout.h"

using namespace gopher::orch::resilience;

// 30 second timeout
auto bounded = withTimeout(slowOperation, 30000);

// Invoke - returns TIMEOUT error if exceeded
bounded->invoke(input, config, dispatcher, [](Result<JsonValue> result) {
    if (mcp::holds_alternative<Error>(result)) {
        auto& error = mcp::get<Error>(result);
        if (error.code == OrchError::TIMEOUT) {
            std::cout << "Operation timed out!" << std::endl;
        }
    }
});
```

### Nested Timeouts

Inner timeouts take precedence:

```cpp
// Outer: 60 seconds
auto outer = withTimeout(
    // Inner: 10 seconds (triggers first)
    withTimeout(slowOp, 10000),
    60000
);
```

## Fallback

Try alternative operations on failure.

### Basic Usage

```cpp
#include "gopher/orch/resilience/fallback.h"

using namespace gopher::orch::resilience;

// Try primary, then fallback
auto safe = withFallback(primaryApi)
    .orElse(backupApi)
    .orElse(cachedResponse)
    .build();
```

### Multiple Fallbacks

```cpp
auto robust = withFallback(premiumService)
    .orElse(standardService)
    .orElse(freeService)
    .orElse(offlineCache)
    .build();

// Tries each in order until one succeeds
// Returns FALLBACK_EXHAUSTED if all fail
```

### With Different Strategies

```cpp
// Fast path with slow fallback
auto tiered = withFallback(
    withTimeout(fastCache, 100))  // 100ms timeout for cache
    .orElse(database)             // Fall back to DB
    .build();
```

## Circuit Breaker

Prevent cascade failures by stopping calls to failing services.

### Basic Usage

```cpp
#include "gopher/orch/resilience/circuit_breaker.h"

using namespace gopher::orch::resilience;

// Default: 5 failures, 30s recovery
auto protected = withCircuitBreaker(externalService);

// Custom policy
auto custom = withCircuitBreaker(service, CircuitBreakerPolicy()
    .failure_threshold(3)
    .recovery_timeout_ms(10000)
    .half_open_max_calls(2));
```

### Circuit States

```
     ┌─────────────────────────────────────────┐
     │                                         │
     │   CLOSED ──(failures >= threshold)──> OPEN
     │     │                                   │
     │     │                                   │
     │  (success)                    (recovery timeout)
     │     │                                   │
     │     │                                   ▼
     │     └─────────── HALF_OPEN <────────────┘
     │                     │
     │              (success/failure)
     │                     │
     └─────────────────────┘
```

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Failures exceeded threshold, requests immediately rejected
- **HALF_OPEN**: Testing recovery, limited requests allowed

### CircuitBreakerPolicy Options

```cpp
struct CircuitBreakerPolicy {
    uint32_t failure_threshold = 5;     // Failures to open circuit
    uint64_t recovery_timeout_ms = 30000; // Time before half-open
    uint32_t half_open_max_calls = 3;   // Successes to close circuit

    // Optional: callback on state changes
    std::function<void(CircuitState from, CircuitState to)> on_state_change;
};
```

### Monitoring State

```cpp
auto cb = withCircuitBreaker(service, policy);

// Check state
CircuitState state = cb->state();
uint32_t failures = cb->failureCount();

// Manual reset (for testing/admin)
cb->reset();
```

### Factory Methods

```cpp
// Standard policy
auto policy = CircuitBreakerPolicy::standard();

// Aggressive (quick to open)
auto policy = CircuitBreakerPolicy::aggressive(3, 10000);

// Lenient (slow to open)
auto policy = CircuitBreakerPolicy::lenient(10, 60000);
```

## Combining Patterns

Patterns can be stacked for comprehensive reliability:

```cpp
// Full resilience stack
auto robust = withCircuitBreaker(
    withFallback(
        withRetry(
            withTimeout(externalApi, 5000),  // 5s timeout
            RetryPolicy::exponential(3)       // 3 retries
        )
    )
    .orElse(cachedResponse)                   // Fallback to cache
    .build(),
    CircuitBreakerPolicy::aggressive()        // Fast circuit breaker
);
```

### Recommended Order

From inner to outer:
1. **Timeout** - Limit individual attempt time
2. **Retry** - Retry failed attempts
3. **Fallback** - Try alternatives if all retries fail
4. **Circuit Breaker** - Prevent calling failing services

```cpp
auto stack =
    withCircuitBreaker(         // 4. Outer: circuit breaker
        withFallback(           // 3. Try alternatives
            withRetry(          // 2. Retry on failure
                withTimeout(    // 1. Inner: timeout each attempt
                    operation,
                    1000),
                RetryPolicy::exponential(3)))
            .orElse(fallback)
            .build());
```

## Observability

All patterns support callbacks for monitoring:

```cpp
// Retry logging
RetryPolicy policy;
policy.on_retry = [](const Error& e, uint32_t attempt) {
    LOG(INFO) << "Retry attempt " << attempt << ": " << e.message;
};

// Circuit breaker state changes
CircuitBreakerPolicy cbPolicy;
cbPolicy.on_state_change = [](CircuitState from, CircuitState to) {
    LOG(WARNING) << "Circuit breaker: " << toString(from)
                 << " -> " << toString(to);
};
```

## Best Practices

1. **Set appropriate timeouts** - Don't let operations hang indefinitely
2. **Use jitter in retries** - Prevent thundering herd
3. **Configure circuit breakers per service** - Different services need different thresholds
4. **Monitor circuit state** - Alert when circuits open
5. **Test failure scenarios** - Verify resilience works as expected
6. **Have meaningful fallbacks** - Cached data is better than errors

## Error Codes

```cpp
namespace OrchError {
    TIMEOUT = -100,           // Operation timed out
    CIRCUIT_OPEN = -101,      // Circuit breaker is open
    FALLBACK_EXHAUSTED = -102 // All fallback options failed
}
```

## See Also

- [Runnable Interface](Runnable.md) - Core interface
- [Composition Patterns](Composition.md) - Sequence, Parallel, Router
- [Server Abstraction](Server.md) - Building reliable services
