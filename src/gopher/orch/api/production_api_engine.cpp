#include "production_api_engine.h"
#include <sstream>
#include <thread>
#include <chrono>
#include <cstring>

namespace gopher {
namespace orch {
namespace api {

ProductionApiEngine::ProductionApiEngine(const std::string& base_url) 
    : curl_handle_(nullptr) {
    base_url_ = base_url;
    initCurl();
}

ProductionApiEngine::~ProductionApiEngine() {
    cleanupCurl();
}

void ProductionApiEngine::initCurl() {
    curl_global_init(CURL_GLOBAL_ALL);
    curl_handle_ = curl_easy_init();
    if (!curl_handle_) {
        throw std::runtime_error("Failed to initialize CURL");
    }
}

void ProductionApiEngine::cleanupCurl() {
    if (curl_handle_) {
        curl_easy_cleanup(curl_handle_);
        curl_handle_ = nullptr;
    }
    curl_global_cleanup();
}

ApiResponse ProductionApiEngine::get(const std::string& endpoint, 
                                    const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    return executeWithRetry(url, "GET", "", headers);
}

ApiResponse ProductionApiEngine::post(const std::string& endpoint, 
                                     const std::string& data,
                                     const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    return executeWithRetry(url, "POST", data, headers);
}

ApiResponse ProductionApiEngine::put(const std::string& endpoint, 
                                    const std::string& data,
                                    const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    return executeWithRetry(url, "PUT", data, headers);
}

ApiResponse ProductionApiEngine::del(const std::string& endpoint,
                                    const std::unordered_map<std::string, std::string>& headers) {
    std::string url = buildUrl(endpoint);
    return executeWithRetry(url, "DELETE", "", headers);
}

ApiResponse ProductionApiEngine::request(const ApiRequest& request) {
    std::string url = buildUrl(request.url);
    
    // Set timeout for this specific request
    int original_timeout = timeout_ms_;
    timeout_ms_ = request.timeout_ms;
    
    ApiResponse response = executeWithRetry(url, request.method, request.body, request.headers);
    
    // Restore original timeout
    timeout_ms_ = original_timeout;
    
    return response;
}

void ProductionApiEngine::setBaseUrl(const std::string& base_url) {
    base_url_ = base_url;
}

void ProductionApiEngine::setDefaultHeaders(const std::unordered_map<std::string, std::string>& headers) {
    default_headers_ = headers;
}

void ProductionApiEngine::setTimeout(int timeout_ms) {
    timeout_ms_ = timeout_ms;
}

void ProductionApiEngine::setRetryPolicy(int max_retries, int retry_delay_ms) {
    max_retries_ = max_retries;
    retry_delay_ms_ = retry_delay_ms;
}

void ProductionApiEngine::setApiKey(const std::string& api_key) {
    auth_header_ = "X-API-Key: " + api_key;
}

void ProductionApiEngine::setBearerToken(const std::string& token) {
    auth_header_ = "Authorization: Bearer " + token;
}

void ProductionApiEngine::setBasicAuth(const std::string& username, const std::string& password) {
    std::string credentials = username + ":" + password;
    // Note: In production, you'd want to base64 encode the credentials
    auth_header_ = "Authorization: Basic " + credentials;
}

size_t ProductionApiEngine::writeCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    size_t total_size = size * nmemb;
    std::string* response_body = static_cast<std::string*>(userp);
    response_body->append(static_cast<char*>(contents), total_size);
    return total_size;
}

size_t ProductionApiEngine::headerCallback(char* buffer, size_t size, size_t nitems, void* userdata) {
    size_t total_size = size * nitems;
    auto* headers = static_cast<std::unordered_map<std::string, std::string>*>(userdata);
    
    std::string header_line(buffer, total_size);
    size_t colon_pos = header_line.find(':');
    
    if (colon_pos != std::string::npos) {
        std::string key = header_line.substr(0, colon_pos);
        std::string value = header_line.substr(colon_pos + 1);
        
        // Trim whitespace
        value.erase(0, value.find_first_not_of(" \t\r\n"));
        value.erase(value.find_last_not_of(" \t\r\n") + 1);
        
        (*headers)[key] = value;
    }
    
    return total_size;
}

ApiResponse ProductionApiEngine::executeRequest(const std::string& url, 
                                               const std::string& method,
                                               const std::string& data,
                                               const std::unordered_map<std::string, std::string>& headers) {
    std::lock_guard<std::mutex> lock(curl_mutex_);
    
    ApiResponse response;
    response.status_code = 0;
    
    if (!curl_handle_) {
        response.error_message = "CURL handle not initialized";
        return response;
    }
    
    // Reset CURL options
    curl_easy_reset(curl_handle_);
    
    // Set URL
    curl_easy_setopt(curl_handle_, CURLOPT_URL, url.c_str());
    
    // Set method
    if (method == "POST") {
        curl_easy_setopt(curl_handle_, CURLOPT_POST, 1L);
        curl_easy_setopt(curl_handle_, CURLOPT_POSTFIELDS, data.c_str());
    } else if (method == "PUT") {
        curl_easy_setopt(curl_handle_, CURLOPT_CUSTOMREQUEST, "PUT");
        curl_easy_setopt(curl_handle_, CURLOPT_POSTFIELDS, data.c_str());
    } else if (method == "DELETE") {
        curl_easy_setopt(curl_handle_, CURLOPT_CUSTOMREQUEST, "DELETE");
    } else if (method == "GET") {
        curl_easy_setopt(curl_handle_, CURLOPT_HTTPGET, 1L);
    }
    
    // Set headers
    struct curl_slist* header_list = nullptr;
    
    // Add default headers
    for (const auto& [key, value] : default_headers_) {
        std::string header_str = key + ": " + value;
        header_list = curl_slist_append(header_list, header_str.c_str());
    }
    
    // Add custom headers
    for (const auto& [key, value] : headers) {
        std::string header_str = key + ": " + value;
        header_list = curl_slist_append(header_list, header_str.c_str());
    }
    
    // Add authentication header if set
    if (!auth_header_.empty()) {
        header_list = curl_slist_append(header_list, auth_header_.c_str());
    }
    
    if (header_list) {
        curl_easy_setopt(curl_handle_, CURLOPT_HTTPHEADER, header_list);
    }
    
    // Set timeout
    curl_easy_setopt(curl_handle_, CURLOPT_TIMEOUT_MS, static_cast<long>(timeout_ms_));
    
    // Set callbacks
    curl_easy_setopt(curl_handle_, CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(curl_handle_, CURLOPT_WRITEDATA, &response.body);
    curl_easy_setopt(curl_handle_, CURLOPT_HEADERFUNCTION, headerCallback);
    curl_easy_setopt(curl_handle_, CURLOPT_HEADERDATA, &response.headers);
    
    // Perform request
    CURLcode curl_code = curl_easy_perform(curl_handle_);
    
    if (curl_code != CURLE_OK) {
        response.error_message = curl_easy_strerror(curl_code);
        response.status_code = -1;
    } else {
        long http_code = 0;
        curl_easy_getinfo(curl_handle_, CURLINFO_RESPONSE_CODE, &http_code);
        response.status_code = static_cast<int>(http_code);
    }
    
    // Clean up headers
    if (header_list) {
        curl_slist_free_all(header_list);
    }
    
    return response;
}

ApiResponse ProductionApiEngine::executeWithRetry(const std::string& url, 
                                                 const std::string& method,
                                                 const std::string& data,
                                                 const std::unordered_map<std::string, std::string>& headers) {
    ApiResponse response;
    
    for (int attempt = 0; attempt <= max_retries_; ++attempt) {
        response = executeRequest(url, method, data, headers);
        
        // Success or client error (4xx) - don't retry
        if (response.isSuccess() || (response.status_code >= 400 && response.status_code < 500)) {
            break;
        }
        
        // Don't sleep after the last attempt
        if (attempt < max_retries_) {
            std::this_thread::sleep_for(std::chrono::milliseconds(retry_delay_ms_));
        }
    }
    
    return response;
}

// Factory function implementation
std::unique_ptr<ApiEngine> createProductionApiEngine(const std::string& base_url) {
    return std::make_unique<ProductionApiEngine>(base_url);
}

} // namespace api
} // namespace orch
} // namespace gopher