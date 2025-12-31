#pragma once

#include "gopher/orch/api/api_engine.h"
#include "gopher/orch/core/types.h"
#include <map>

namespace gopher {
namespace orch {
namespace api {

using namespace gopher::orch::core;

// Async wrapper for ApiEngine
class AsyncApiEngine {
public:
    explicit AsyncApiEngine(std::shared_ptr<ApiEngine> engine) 
        : engine_(engine) {}
    
    // Async GET
    void get(const std::string& endpoint,
             const std::map<std::string, std::string>& headers,
             Dispatcher& dispatcher,
             std::function<void(Result<ApiResponse>)> callback) {
        dispatcher.post([this, endpoint, headers, callback, &dispatcher] {
            try {
                std::unordered_map<std::string, std::string> h(headers.begin(), headers.end());
                auto response = engine_->get(endpoint, h);
                dispatcher.post([callback, response] {
                    callback(makeSuccess(response));
                });
            } catch (const std::exception& e) {
                dispatcher.post([callback, e] {
                    callback(makeOrchError<ApiResponse>(-1, e.what()));
                });
            }
        });
    }
    
    // Async POST with JsonValue
    void post(const std::string& endpoint,
              const JsonValue& data,
              const std::map<std::string, std::string>& headers,
              Dispatcher& dispatcher,
              std::function<void(Result<ApiResponse>)> callback) {
        dispatcher.post([this, endpoint, data, headers, callback, &dispatcher] {
            try {
                std::unordered_map<std::string, std::string> h(headers.begin(), headers.end());
                h["Content-Type"] = "application/json";
                auto response = engine_->post(endpoint, data.toString(), h);
                dispatcher.post([callback, response] {
                    callback(makeSuccess(response));
                });
            } catch (const std::exception& e) {
                dispatcher.post([callback, e] {
                    callback(makeOrchError<ApiResponse>(-1, e.what()));
                });
            }
        });
    }
    
    void setBaseUrl(const std::string& url) {
        engine_->setBaseUrl(url);
    }
    
    void setApiKey(const std::string& key) {
        engine_->setApiKey(key);
    }
    
    void setBearerToken(const std::string& token) {
        engine_->setBearerToken(token);
    }
    
private:
    std::shared_ptr<ApiEngine> engine_;
};

// Factory for production API engine
std::shared_ptr<AsyncApiEngine> makeProductionApiEngine();

}  // namespace api
}  // namespace orch
}  // namespace gopher