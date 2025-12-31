// MockHttpClient - Mock HTTP client for testing REST endpoints
//
// Provides configurable HTTP responses for testing without network calls.
// Supports:
// - Pre-configured responses per URL/method
// - Request recording for verification
// - Error simulation
// - Response delays

#pragma once

#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "gopher/orch/server/rest_server.h"

namespace gopher {
namespace orch {
namespace server {

// Request record for verification
struct HttpRequestRecord {
  HttpMethod method;
  std::string url;
  std::map<std::string, std::string> headers;
  std::string body;
};

// Mock response configuration
struct MockHttpResponseConfig {
  HttpResponse response;
  optional<Error> error;
  std::chrono::milliseconds delay{0};
};

// MockHttpClient - In-memory HTTP client for testing
class MockHttpClient : public HttpClient {
 public:
  MockHttpClient() = default;

  void request(HttpMethod method,
               const std::string& url,
               const std::map<std::string, std::string>& headers,
               const std::string& body,
               Dispatcher& dispatcher,
               ResponseCallback callback) override {
    std::lock_guard<std::mutex> lock(mutex_);

    // Record the request
    HttpRequestRecord record;
    record.method = method;
    record.url = url;
    record.headers = headers;
    record.body = body;
    requests_.push_back(record);

    // Build key for response lookup
    std::string key = httpMethodToString(method) + " " + url;

    // Look for exact match first, then prefix match
    MockHttpResponseConfig response_config;
    auto it = responses_.find(key);
    if (it != responses_.end()) {
      response_config = it->second;
    } else {
      // Try prefix match
      for (const auto& kv : responses_) {
        if (key.find(kv.first) == 0 || kv.first.find(key) == 0) {
          response_config = kv.second;
          break;
        }
      }
      // If no match and default is set
      if (default_response_.has_value()) {
        response_config.response = *default_response_;
      } else {
        // Default 404 response
        response_config.response.status_code = 404;
        response_config.response.body = "{\"error\": \"Not found\"}";
      }
    }

    // Schedule response
    if (response_config.delay.count() > 0) {
      auto timer = dispatcher.createTimer(
          [callback = std::move(callback), response_config]() mutable {
            if (response_config.error.has_value()) {
              callback(Result<HttpResponse>(*response_config.error));
            } else {
              callback(Result<HttpResponse>(std::move(response_config.response)));
            }
          });
      timer->enableTimer(response_config.delay);
    } else {
      dispatcher.post([callback = std::move(callback), response_config]() mutable {
        if (response_config.error.has_value()) {
          callback(Result<HttpResponse>(*response_config.error));
        } else {
          callback(Result<HttpResponse>(std::move(response_config.response)));
        }
      });
    }
  }

  // =========================================================================
  // MockHttpClient-specific API for test configuration
  // =========================================================================

  // Set response for a specific URL/method
  MockHttpClient& setResponse(HttpMethod method,
                               const std::string& url,
                               int status_code,
                               const std::string& body) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = httpMethodToString(method) + " " + url;
    MockHttpResponseConfig config;
    config.response.status_code = status_code;
    config.response.body = body;
    responses_[key] = config;
    return *this;
  }

  // Set response with headers
  MockHttpClient& setResponse(HttpMethod method,
                               const std::string& url,
                               int status_code,
                               const std::string& body,
                               const std::map<std::string, std::string>& headers) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = httpMethodToString(method) + " " + url;
    MockHttpResponseConfig config;
    config.response.status_code = status_code;
    config.response.body = body;
    config.response.headers = headers;
    responses_[key] = config;
    return *this;
  }

  // Set error for a specific URL/method
  MockHttpClient& setError(HttpMethod method,
                            const std::string& url,
                            int code,
                            const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = httpMethodToString(method) + " " + url;
    MockHttpResponseConfig config;
    config.error = Error(code, message);
    responses_[key] = config;
    return *this;
  }

  // Set default response for unmatched requests
  MockHttpClient& setDefaultResponse(int status_code, const std::string& body) {
    std::lock_guard<std::mutex> lock(mutex_);
    HttpResponse response;
    response.status_code = status_code;
    response.body = body;
    default_response_ = response;
    return *this;
  }

  // Set response delay
  MockHttpClient& setDelay(HttpMethod method,
                            const std::string& url,
                            std::chrono::milliseconds delay) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = httpMethodToString(method) + " " + url;
    if (responses_.find(key) != responses_.end()) {
      responses_[key].delay = delay;
    }
    return *this;
  }

  // Get all recorded requests
  std::vector<HttpRequestRecord> requests() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return requests_;
  }

  // Get request count
  size_t requestCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return requests_.size();
  }

  // Get last request
  optional<HttpRequestRecord> lastRequest() const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (requests_.empty()) {
      return nullopt;
    }
    return requests_.back();
  }

  // Check if a specific URL was called
  bool wasCalled(HttpMethod method, const std::string& url) const {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& req : requests_) {
      if (req.method == method && req.url == url) {
        return true;
      }
    }
    return false;
  }

  // Reset mock state
  void reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    requests_.clear();
    responses_.clear();
    default_response_ = nullopt;
  }

 private:
  mutable std::mutex mutex_;
  std::vector<HttpRequestRecord> requests_;
  std::map<std::string, MockHttpResponseConfig> responses_;
  optional<HttpResponse> default_response_;
};

// Factory function
inline std::shared_ptr<MockHttpClient> makeMockHttpClient() {
  return std::make_shared<MockHttpClient>();
}

}  // namespace server
}  // namespace orch
}  // namespace gopher
