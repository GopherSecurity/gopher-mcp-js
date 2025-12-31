#ifndef GOPHER_ORCH_API_API_ENGINE_H
#define GOPHER_ORCH_API_API_ENGINE_H

#include <string>
#include <memory>
#include <functional>
#include <unordered_map>
#include <vector>
#include <optional>

namespace gopher {
namespace orch {
namespace api {

struct ApiResponse {
    int status_code;
    std::string body;
    std::unordered_map<std::string, std::string> headers;
    std::string error_message;
    
    bool isSuccess() const { return status_code >= 200 && status_code < 300; }
};

struct ApiRequest {
    std::string url;
    std::string method;
    std::unordered_map<std::string, std::string> headers;
    std::string body;
    int timeout_ms = 30000;
};

class ApiEngine {
public:
    virtual ~ApiEngine() = default;
    
    // Core API methods
    virtual ApiResponse get(const std::string& endpoint, 
                           const std::unordered_map<std::string, std::string>& headers = {}) = 0;
    
    virtual ApiResponse post(const std::string& endpoint, 
                            const std::string& data,
                            const std::unordered_map<std::string, std::string>& headers = {}) = 0;
    
    virtual ApiResponse put(const std::string& endpoint, 
                           const std::string& data,
                           const std::unordered_map<std::string, std::string>& headers = {}) = 0;
    
    virtual ApiResponse del(const std::string& endpoint,
                           const std::unordered_map<std::string, std::string>& headers = {}) = 0;
    
    // Generic request method
    virtual ApiResponse request(const ApiRequest& request) = 0;
    
    // Configuration methods
    virtual void setBaseUrl(const std::string& base_url) = 0;
    virtual void setDefaultHeaders(const std::unordered_map<std::string, std::string>& headers) = 0;
    virtual void setTimeout(int timeout_ms) = 0;
    virtual void setRetryPolicy(int max_retries, int retry_delay_ms) = 0;
    
    // Authentication
    virtual void setApiKey(const std::string& api_key) = 0;
    virtual void setBearerToken(const std::string& token) = 0;
    virtual void setBasicAuth(const std::string& username, const std::string& password) = 0;
    
    // Business logic API methods
    virtual std::string fetchComposite(const std::string& namespace_str);
    
protected:
    std::string base_url_;
    std::unordered_map<std::string, std::string> default_headers_;
    int timeout_ms_ = 30000;
    int max_retries_ = 3;
    int retry_delay_ms_ = 1000;
    
    // Helper method for building full URL
    std::string buildUrl(const std::string& endpoint) const {
        if (endpoint.find("http://") == 0 || endpoint.find("https://") == 0) {
            return endpoint;
        }
        std::string url = base_url_;
        if (!url.empty() && url.back() != '/' && !endpoint.empty() && endpoint.front() != '/') {
            url += '/';
        }
        return url + endpoint;
    }
};

// Factory methods for creating API engine instances
std::unique_ptr<ApiEngine> createProductionApiEngine(const std::string& base_url = "");
std::unique_ptr<ApiEngine> createTestApiEngine();

} // namespace api
} // namespace orch
} // namespace gopher

#endif // GOPHER_ORCH_API_API_ENGINE_H