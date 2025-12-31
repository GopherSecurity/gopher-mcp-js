#ifndef GOPHER_ORCH_API_TEST_API_ENGINE_H
#define GOPHER_ORCH_API_TEST_API_ENGINE_H

#include "gopher/orch/api/api_engine.h"
#include <queue>
#include <functional>
#include <regex>

namespace gopher {
namespace orch {
namespace api {

struct MockResponse {
    std::string url_pattern;  // Regex pattern to match URLs
    std::string method;
    ApiResponse response;
    std::function<ApiResponse(const std::string&, const std::string&)> handler;
};

class TestApiEngine : public ApiEngine {
public:
    TestApiEngine();
    ~TestApiEngine() override = default;
    
    // Core API methods implementation
    ApiResponse get(const std::string& endpoint, 
                   const std::unordered_map<std::string, std::string>& headers = {}) override;
    
    ApiResponse post(const std::string& endpoint, 
                    const std::string& data,
                    const std::unordered_map<std::string, std::string>& headers = {}) override;
    
    ApiResponse put(const std::string& endpoint, 
                   const std::string& data,
                   const std::unordered_map<std::string, std::string>& headers = {}) override;
    
    ApiResponse del(const std::string& endpoint,
                   const std::unordered_map<std::string, std::string>& headers = {}) override;
    
    ApiResponse request(const ApiRequest& request) override;
    
    // Configuration methods
    void setBaseUrl(const std::string& base_url) override;
    void setDefaultHeaders(const std::unordered_map<std::string, std::string>& headers) override;
    void setTimeout(int timeout_ms) override;
    void setRetryPolicy(int max_retries, int retry_delay_ms) override;
    
    // Authentication
    void setApiKey(const std::string& api_key) override;
    void setBearerToken(const std::string& token) override;
    void setBasicAuth(const std::string& username, const std::string& password) override;
    
    // Test-specific methods
    void addMockResponse(const std::string& url_pattern, 
                         const std::string& method, 
                         const ApiResponse& response);
    
    void addMockHandler(const std::string& url_pattern, 
                       const std::string& method,
                       std::function<ApiResponse(const std::string&, const std::string&)> handler);
    
    void setDefaultResponse(const ApiResponse& response);
    
    void queueResponse(const ApiResponse& response);
    
    void clearMocks();
    
    // Request tracking
    struct RequestRecord {
        std::string url;
        std::string method;
        std::string data;
        std::unordered_map<std::string, std::string> headers;
        std::chrono::system_clock::time_point timestamp;
    };
    
    const std::vector<RequestRecord>& getRequestHistory() const { return request_history_; }
    void clearRequestHistory() { request_history_.clear(); }
    
    // Simulation controls
    void simulateNetworkError(bool enable) { simulate_network_error_ = enable; }
    void simulateTimeout(bool enable) { simulate_timeout_ = enable; }
    void setResponseDelay(int delay_ms) { response_delay_ms_ = delay_ms; }
    
private:
    std::vector<MockResponse> mock_responses_;
    std::queue<ApiResponse> response_queue_;
    ApiResponse default_response_;
    std::vector<RequestRecord> request_history_;
    
    std::string api_key_;
    std::string bearer_token_;
    std::string basic_auth_;
    
    bool simulate_network_error_ = false;
    bool simulate_timeout_ = false;
    int response_delay_ms_ = 0;
    
    ApiResponse findMockResponse(const std::string& url, const std::string& method, const std::string& data);
    void recordRequest(const std::string& url, const std::string& method, 
                      const std::string& data, const std::unordered_map<std::string, std::string>& headers);
};

} // namespace api
} // namespace orch
} // namespace gopher

#endif // GOPHER_ORCH_API_TEST_API_ENGINE_H