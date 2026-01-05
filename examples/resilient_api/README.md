# Resilient API Client Example

Demonstrates resilience patterns for handling unreliable external services.

## What This Example Shows

- Retry with exponential backoff
- Timeout protection
- Fallback on failure
- Circuit breaker for failure isolation
- Combining multiple resilience patterns

## Running

```bash
# Build
cd build
make resilient_api

# Run
./bin/resilient_api
```

## Expected Output

```
Resilient API Client Demo
========================================

1. Retry Pattern (max 3 attempts, exponential backoff)
----------------------------------------
  Success: Response from /api/data

2. Timeout Pattern (150ms timeout)
----------------------------------------
  Timeout or error: Operation timed out

3. Fallback Pattern
----------------------------------------
  Got data: Cached fallback data for /api/unreliable

4. Circuit Breaker Pattern
----------------------------------------
  Call 1: Failed: Connection failed
  Call 2: Failed: Connection failed
  Call 3: Failed: Connection failed
  Call 4: Circuit OPEN - call rejected
  Call 5: Circuit OPEN - call rejected
  Call 6: Circuit OPEN - call rejected

5. Combined Resilience (Retry + Timeout + Fallback)
----------------------------------------
  Got data: Response from /api/important

========================================
Demo complete.
```

## Resilience Patterns

### 1. Retry with Backoff
```cpp
auto retryConfig = RetryConfig()
    .withMaxAttempts(3)
    .withInitialDelay(std::chrono::milliseconds(100))
    .withMaxDelay(std::chrono::milliseconds(1000))
    .withBackoffMultiplier(2.0);

auto retryableApi = makeRetry(apiCall, retryConfig);
```

### 2. Timeout Protection
```cpp
auto timedApi = makeTimeout(slowApi, std::chrono::milliseconds(150));
```

### 3. Fallback on Failure
```cpp
auto safeApi = makeFallback(unreliableApi, fallbackApi);
```

### 4. Circuit Breaker
```cpp
auto cbConfig = CircuitBreakerConfig()
    .withFailureThreshold(3)     // Open after 3 failures
    .withSuccessThreshold(2)     // Close after 2 successes
    .withTimeout(std::chrono::seconds(5));  // Half-open after 5s

auto protectedApi = makeCircuitBreaker(apiCall, cbConfig);
```

### 5. Combined Patterns
```cpp
// Build defense-in-depth: retry -> timeout -> fallback
auto combinedApi = makeFallback(
    makeTimeout(
        makeRetry(apiCall, RetryConfig().withMaxAttempts(2)),
        std::chrono::milliseconds(300)),
    fallbackApi);
```

## Key Concepts

- **Retry**: Automatically retry failed operations with configurable backoff
- **Timeout**: Bound operation duration to prevent hanging
- **Fallback**: Provide degraded response when primary fails
- **Circuit Breaker**: Stop calling failing services to allow recovery

## Circuit Breaker States

```
     ┌─────────────────────────────────────┐
     │                                     │
     ▼                                     │
  CLOSED ──(failures >= threshold)──► OPEN
     ▲                                     │
     │                                     │
     │                              (timeout expires)
     │                                     │
     │                                     ▼
     └───(successes >= threshold)─── HALF_OPEN
```

## See Also

- [Resilience Patterns](../../docs/Resilience.md)
- [Runnable Interface](../../docs/Runnable.md)
