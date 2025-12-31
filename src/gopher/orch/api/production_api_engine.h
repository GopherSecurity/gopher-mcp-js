#ifndef GOPHER_ORCH_API_PRODUCTION_API_ENGINE_H
#define GOPHER_ORCH_API_PRODUCTION_API_ENGINE_H

#include "gopher/orch/api/api_engine.h"
#include <curl/curl.h>
#include <mutex>

namespace gopher {
namespace orch {
namespace api {

class ProductionApiEngine : public ApiEngine {
public:
    explicit ProductionApiEngine(const std::string& base_url = "");
    ~ProductionApiEngine() override;
    
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
    
private:
    CURL* curl_handle_;
    std::mutex curl_mutex_;
    std::string auth_header_;
    
    // Helper methods
    void initCurl();
    void cleanupCurl();
    ApiResponse executeRequest(const std::string& url, 
                              const std::string& method,
                              const std::string& data,
                              const std::unordered_map<std::string, std::string>& headers);
    
    ApiResponse executeWithRetry(const std::string& url, 
                                const std::string& method,
                                const std::string& data,
                                const std::unordered_map<std::string, std::string>& headers);
    
    static size_t writeCallback(void* contents, size_t size, size_t nmemb, void* userp);
    static size_t headerCallback(char* buffer, size_t size, size_t nitems, void* userdata);
};

} // namespace api
} // namespace orch
} // namespace gopher

#endif // GOPHER_ORCH_API_PRODUCTION_API_ENGINE_H