#pragma once

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <chrono>
#include "gopher/orch/core/types.h"
#include "gopher/orch/client/tool.h"
#include "gopher/orch/client/provider/provider_base.h"
#include "gopher/orch/client/oauth_manager.h"
#include "gopher/orch/client/user_context.h"
#include "gopher/orch/client/connected_account.h"

namespace gopher {
namespace orch {
namespace client {

using namespace gopher::orch::core;

// Main integration platform class
class IntegrationPlatform {
public:
    struct Config {
        std::string apiKey;
        provider::ProviderPtr provider;
        std::chrono::milliseconds timeout = std::chrono::milliseconds(30000);
        int maxRetries = 3;
    };
    
    explicit IntegrationPlatform(const Config& config);
    
    // Tool Management
    void registerTool(ToolPtr tool);
    std::vector<ToolPtr> getTools(
        const std::string& userId,
        const std::vector<std::string>& toolNames = {}
    );
    
    // OAuth Connection Management
    struct ConnectionRequest {
        std::string requestId;
        std::string authUrl;
        std::string connectorId;
        std::string userId;
    };
    
    ConnectionRequest linkAccount(
        const std::string& userId,
        const std::string& connectorId
    );
    
    Result<ConnectedAccountPtr> waitForConnection(
        const std::string& requestId,
        std::chrono::milliseconds timeout = std::chrono::milliseconds(300000)
    );
    
    // Tool Execution
    Result<JsonValue> executeTool(
        const std::string& userId,
        const std::string& toolName,
        const JsonValue& params
    );
    
    // Provider Integration
    JsonValue getToolsForProvider(
        const std::string& userId,
        const std::vector<std::string>& toolNames = {}
    );
    
    Result<JsonValue> handleProviderResponse(
        const std::string& userId,
        const JsonValue& aiResponse
    );
    
    // User Management
    UserContextPtr getUserContext(const std::string& userId);
    
private:
    Config config_;
    OAuthManager oauthManager_;
    std::unordered_map<std::string, ToolPtr> tools_;
    std::unordered_map<std::string, UserContextPtr> users_;
    std::unordered_map<std::string, ConnectionRequest> pendingRequests_;
    
    // Helper to ensure user exists
    UserContextPtr ensureUser(const std::string& userId);
};

using IntegrationPlatformPtr = std::shared_ptr<IntegrationPlatform>;

}  // namespace client
}  // namespace orch
}  // namespace gopher