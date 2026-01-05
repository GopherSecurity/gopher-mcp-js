// Resilient API Client Example
//
// Demonstrates resilience patterns for external API calls:
// - Retry with exponential backoff
// - Timeout protection
// - Fallback on failure
// - Circuit breaker for failure isolation

#include "gopher/orch/orch.h"

#include <chrono>
#include <iostream>
#include <random>

using namespace gopher::orch;
using namespace gopher::orch::core;
using namespace gopher::orch::resilience;

// Simulated API response
struct ApiResponse {
  bool success;
  std::string data;
  int latency_ms;
};

// Simulated unreliable API client
class UnreliableApiClient {
 public:
  UnreliableApiClient(double failure_rate = 0.5, int max_latency_ms = 500)
      : failure_rate_(failure_rate),
        max_latency_ms_(max_latency_ms),
        gen_(std::random_device{}()) {}

  // Simulates an API call that may fail or be slow
  void fetch(const std::string& endpoint,
             Dispatcher& dispatcher,
             std::function<void(Result<ApiResponse>)> callback) {
    std::uniform_real_distribution<> fail_dist(0.0, 1.0);
    std::uniform_int_distribution<> latency_dist(10, max_latency_ms_);

    bool will_fail = fail_dist(gen_) < failure_rate_;
    int latency = latency_dist(gen_);

    // Simulate network latency
    dispatcher.setTimeout(
        [this, endpoint, will_fail, latency, callback = std::move(callback)]() {
          if (will_fail) {
            callback(makeOrchError<ApiResponse>(
                OrchError::NETWORK_ERROR,
                "Connection failed to " + endpoint));
          } else {
            ApiResponse response;
            response.success = true;
            response.data = "Response from " + endpoint;
            response.latency_ms = latency;
            callback(makeSuccess(std::move(response)));
          }
        },
        std::chrono::milliseconds(latency));
  }

  void setFailureRate(double rate) { failure_rate_ = rate; }

 private:
  double failure_rate_;
  int max_latency_ms_;
  std::mt19937 gen_;
};

// Create a runnable from the API client
RunnablePtr<std::string, ApiResponse> makeApiRunnable(
    std::shared_ptr<UnreliableApiClient> client) {
  return makeLambda<std::string, ApiResponse>(
      [client](const std::string& endpoint,
               Dispatcher& dispatcher,
               ResultCallback<ApiResponse> callback) {
        client->fetch(endpoint, dispatcher, std::move(callback));
      });
}

int main() {
  auto dispatcher = mcp::event::createLibeventDispatcher();

  // Create unreliable API client (50% failure rate)
  auto client = std::make_shared<UnreliableApiClient>(0.5, 200);
  auto apiCall = makeApiRunnable(client);

  std::cout << "Resilient API Client Demo\n";
  std::cout << "========================================\n\n";

  // =========================================================================
  // Pattern 1: Retry with Exponential Backoff
  // =========================================================================
  std::cout << "1. Retry Pattern (max 3 attempts, exponential backoff)\n";
  std::cout << "----------------------------------------\n";

  auto retryConfig = RetryConfig()
      .withMaxAttempts(3)
      .withInitialDelay(std::chrono::milliseconds(100))
      .withMaxDelay(std::chrono::milliseconds(1000))
      .withBackoffMultiplier(2.0);

  auto retryableApi = makeRetry(apiCall, retryConfig);

  {
    bool done = false;
    int attempt = 0;
    retryableApi->invoke(
        "/api/data",
        RunnableConfig(),
        *dispatcher,
        [&done, &attempt](Result<ApiResponse> result) {
          if (mcp::holds_alternative<Error>(result)) {
            std::cout << "  Failed after retries: "
                      << mcp::get<Error>(result).message << "\n";
          } else {
            auto& response = mcp::get<ApiResponse>(result);
            std::cout << "  Success: " << response.data << "\n";
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  // =========================================================================
  // Pattern 2: Timeout Protection
  // =========================================================================
  std::cout << "\n2. Timeout Pattern (150ms timeout)\n";
  std::cout << "----------------------------------------\n";

  // Create slow API (high latency)
  auto slowClient = std::make_shared<UnreliableApiClient>(0.0, 500);
  auto slowApi = makeApiRunnable(slowClient);
  auto timedApi = makeTimeout(slowApi, std::chrono::milliseconds(150));

  {
    bool done = false;
    timedApi->invoke(
        "/api/slow",
        RunnableConfig(),
        *dispatcher,
        [&done](Result<ApiResponse> result) {
          if (mcp::holds_alternative<Error>(result)) {
            std::cout << "  Timeout or error: "
                      << mcp::get<Error>(result).message << "\n";
          } else {
            auto& response = mcp::get<ApiResponse>(result);
            std::cout << "  Success (within timeout): " << response.data << "\n";
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  // =========================================================================
  // Pattern 3: Fallback on Failure
  // =========================================================================
  std::cout << "\n3. Fallback Pattern\n";
  std::cout << "----------------------------------------\n";

  // Create always-failing API
  auto failingClient = std::make_shared<UnreliableApiClient>(1.0, 50);
  auto failingApi = makeApiRunnable(failingClient);

  // Create fallback that returns cached data
  auto fallbackApi = makeLambda<std::string, ApiResponse>(
      [](const std::string& endpoint,
         Dispatcher& dispatcher,
         ResultCallback<ApiResponse> callback) {
        ApiResponse cached;
        cached.success = true;
        cached.data = "Cached fallback data for " + endpoint;
        cached.latency_ms = 0;
        callback(makeSuccess(std::move(cached)));
      });

  auto safeApi = makeFallback(failingApi, fallbackApi);

  {
    bool done = false;
    safeApi->invoke(
        "/api/unreliable",
        RunnableConfig(),
        *dispatcher,
        [&done](Result<ApiResponse> result) {
          if (mcp::holds_alternative<Error>(result)) {
            std::cout << "  Error: " << mcp::get<Error>(result).message << "\n";
          } else {
            auto& response = mcp::get<ApiResponse>(result);
            std::cout << "  Got data: " << response.data << "\n";
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  // =========================================================================
  // Pattern 4: Circuit Breaker
  // =========================================================================
  std::cout << "\n4. Circuit Breaker Pattern\n";
  std::cout << "----------------------------------------\n";

  auto cbConfig = CircuitBreakerConfig()
      .withFailureThreshold(3)
      .withSuccessThreshold(2)
      .withTimeout(std::chrono::seconds(5));

  // Reset client to 70% failure rate for circuit breaker demo
  client->setFailureRate(0.7);
  auto protectedApi = makeCircuitBreaker(apiCall, cbConfig);

  // Make multiple calls to trigger circuit breaker
  for (int i = 1; i <= 6; i++) {
    bool done = false;
    std::cout << "  Call " << i << ": ";

    protectedApi->invoke(
        "/api/fragile",
        RunnableConfig(),
        *dispatcher,
        [&done](Result<ApiResponse> result) {
          if (mcp::holds_alternative<Error>(result)) {
            const auto& err = mcp::get<Error>(result);
            if (err.message.find("Circuit open") != std::string::npos) {
              std::cout << "Circuit OPEN - call rejected\n";
            } else {
              std::cout << "Failed: " << err.message << "\n";
            }
          } else {
            std::cout << "Success\n";
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  // =========================================================================
  // Pattern 5: Combined Resilience
  // =========================================================================
  std::cout << "\n5. Combined Resilience (Retry + Timeout + Fallback)\n";
  std::cout << "----------------------------------------\n";

  // Reset client for combined demo
  client->setFailureRate(0.3);

  auto combinedApi = makeFallback(
      makeTimeout(
          makeRetry(apiCall, RetryConfig().withMaxAttempts(2)),
          std::chrono::milliseconds(300)),
      fallbackApi);

  {
    bool done = false;
    combinedApi->invoke(
        "/api/important",
        RunnableConfig(),
        *dispatcher,
        [&done](Result<ApiResponse> result) {
          if (mcp::holds_alternative<Error>(result)) {
            std::cout << "  Final error: "
                      << mcp::get<Error>(result).message << "\n";
          } else {
            auto& response = mcp::get<ApiResponse>(result);
            std::cout << "  Got data: " << response.data << "\n";
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  std::cout << "\n========================================\n";
  std::cout << "Demo complete.\n";

  return 0;
}
