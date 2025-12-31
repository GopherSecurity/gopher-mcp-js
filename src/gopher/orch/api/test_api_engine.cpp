#include "test_api_engine.h"
#include <thread>
#include <chrono>
#include <sstream>

namespace gopher {
namespace orch {
namespace api {

TestApiEngine::TestApiEngine() {
    // Set default response for unmocked requests
    default_response_.status_code = 404;
    default_response_.body = "{\"error\": \"Not Found\"}";
    default_response_.error_message = "No mock response configured for this request";
}

ApiResponse TestApiEngine::get(const std::string& endpoint, 
                              const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    recordRequest(url, "GET", "", headers);
    
    if (response_delay_ms_ > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(response_delay_ms_));
    }
    
    if (simulate_network_error_) {
        ApiResponse error_response;
        error_response.status_code = -1;
        error_response.error_message = "Simulated network error";
        return error_response;
    }
    
    if (simulate_timeout_) {
        ApiResponse timeout_response;
        timeout_response.status_code = -1;
        timeout_response.error_message = "Request timeout";
        return timeout_response;
    }
    
    return findMockResponse(url, "GET", "");
}

ApiResponse TestApiEngine::post(const std::string& endpoint, 
                               const std::string& data,
                               const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    recordRequest(url, "POST", data, headers);
    
    if (response_delay_ms_ > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(response_delay_ms_));
    }
    
    if (simulate_network_error_) {
        ApiResponse error_response;
        error_response.status_code = -1;
        error_response.error_message = "Simulated network error";
        return error_response;
    }
    
    if (simulate_timeout_) {
        ApiResponse timeout_response;
        timeout_response.status_code = -1;
        timeout_response.error_message = "Request timeout";
        return timeout_response;
    }
    
    return findMockResponse(url, "POST", data);
}

ApiResponse TestApiEngine::put(const std::string& endpoint, 
                              const std::string& data,
                              const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    recordRequest(url, "PUT", data, headers);
    
    if (response_delay_ms_ > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(response_delay_ms_));
    }
    
    if (simulate_network_error_) {
        ApiResponse error_response;
        error_response.status_code = -1;
        error_response.error_message = "Simulated network error";
        return error_response;
    }
    
    if (simulate_timeout_) {
        ApiResponse timeout_response;
        timeout_response.status_code = -1;
        timeout_response.error_message = "Request timeout";
        return timeout_response;
    }
    
    return findMockResponse(url, "PUT", data);
}

ApiResponse TestApiEngine::del(const std::string& endpoint,
                              const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    recordRequest(url, "DELETE", "", headers);
    
    if (response_delay_ms_ > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(response_delay_ms_));
    }
    
    if (simulate_network_error_) {
        ApiResponse error_response;
        error_response.status_code = -1;
        error_response.error_message = "Simulated network error";
        return error_response;
    }
    
    if (simulate_timeout_) {
        ApiResponse timeout_response;
        timeout_response.status_code = -1;
        timeout_response.error_message = "Request timeout";
        return timeout_response;
    }
    
    return findMockResponse(url, "DELETE", "");
}

ApiResponse TestApiEngine::request(const ApiRequest& request) {
    std::string url = buildUrl(request.url);
    recordRequest(url, request.method, request.body, request.headers);
    
    if (response_delay_ms_ > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(response_delay_ms_));
    }
    
    if (simulate_network_error_) {
        ApiResponse error_response;
        error_response.status_code = -1;
        error_response.error_message = "Simulated network error";
        return error_response;
    }
    
    if (simulate_timeout_) {
        ApiResponse timeout_response;
        timeout_response.status_code = -1;
        timeout_response.error_message = "Request timeout";
        return timeout_response;
    }
    
    return findMockResponse(url, request.method, request.body);
}

void TestApiEngine::setBaseUrl(const std::string& base_url) {
    base_url_ = base_url;
}

void TestApiEngine::setDefaultHeaders(const std::unordered_map<std::string, std::string>& headers) {
    default_headers_ = headers;
}

void TestApiEngine::setTimeout(int timeout_ms) {
    timeout_ms_ = timeout_ms;
}

void TestApiEngine::setRetryPolicy(int max_retries, int retry_delay_ms) {
    max_retries_ = max_retries;
    retry_delay_ms_ = retry_delay_ms;
}

void TestApiEngine::setApiKey(const std::string& api_key) {
    api_key_ = api_key;
    default_headers_["X-API-Key"] = api_key;
}

void TestApiEngine::setBearerToken(const std::string& token) {
    bearer_token_ = token;
    default_headers_["Authorization"] = "Bearer " + token;
}

void TestApiEngine::setBasicAuth(const std::string& username, const std::string& password) {
    basic_auth_ = username + ":" + password;
    default_headers_["Authorization"] = "Basic " + basic_auth_;
}

void TestApiEngine::addMockResponse(const std::string& url_pattern, 
                                   const std::string& method, 
                                   const ApiResponse& response) {
    MockResponse mock;
    mock.url_pattern = url_pattern;
    mock.method = method;
    mock.response = response;
    mock_responses_.push_back(mock);
}

void TestApiEngine::addMockHandler(const std::string& url_pattern, 
                                  const std::string& method,
                                  std::function<ApiResponse(const std::string&, const std::string&)> handler) {
    MockResponse mock;
    mock.url_pattern = url_pattern;
    mock.method = method;
    mock.handler = handler;
    mock_responses_.push_back(mock);
}

void TestApiEngine::setDefaultResponse(const ApiResponse& response) {
    default_response_ = response;
}

void TestApiEngine::queueResponse(const ApiResponse& response) {
    response_queue_.push(response);
}

void TestApiEngine::clearMocks() {
    mock_responses_.clear();
    while (!response_queue_.empty()) {
        response_queue_.pop();
    }
}

ApiResponse TestApiEngine::findMockResponse(const std::string& url, 
                                           const std::string& method, 
                                           const std::string& data) {
    // Check queued responses first
    if (!response_queue_.empty()) {
        ApiResponse response = response_queue_.front();
        response_queue_.pop();
        return response;
    }
    
    // Check mock responses
    for (const auto& mock : mock_responses_) {
        if (mock.method != method) {
            continue;
        }
        
        std::regex pattern(mock.url_pattern);
        if (std::regex_match(url, pattern)) {
            if (mock.handler) {
                return mock.handler(url, data);
            } else {
                return mock.response;
            }
        }
    }
    
    // Return default response
    return default_response_;
}

void TestApiEngine::recordRequest(const std::string& url, 
                                 const std::string& method, 
                                 const std::string& data,
                                 const std::unordered_map<std::string, std::string>& headers) {
    RequestRecord record;
    record.url = url;
    record.method = method;
    record.data = data;
    record.headers = headers;
    record.timestamp = std::chrono::system_clock::now();
    
    // Merge with default headers
    for (const auto& [key, value] : default_headers_) {
        if (record.headers.find(key) == record.headers.end()) {
            record.headers[key] = value;
        }
    }
    
    request_history_.push_back(record);
}

// Factory function implementation
std::unique_ptr<ApiEngine> createTestApiEngine() {
    return std::make_unique<TestApiEngine>();
}

} // namespace api
} // namespace orch
} // namespace gopher