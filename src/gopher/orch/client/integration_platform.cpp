#include "gopher/orch/client/integration_platform.h"
#include <thread>
#include <random>
#include <sstream>

namespace gopher {
namespace orch {
namespace client {

// Helper to generate UUID
static std::string generateUUID() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);
    
    std::stringstream ss;
    for (int i = 0; i < 32; ++i) {
        if (i == 8 || i == 12 || i == 16 || i == 20) {
            ss << '-';
        }
        ss << std::hex << dis(gen);
    }
    return ss.str();
}

IntegrationPlatform::IntegrationPlatform(const Config& config) : config_(config) {
    // Register default OAuth connectors
    oauthManager_.registerConnector("gmail", {
        "mock_gmail_client_id",
        "mock_gmail_client_secret",
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://oauth2.googleapis.com/token",
        {"gmail.send", "gmail.readonly"},
        "http://localhost:8080/callback"
    });
    
    oauthManager_.registerConnector("slack", {
        "mock_slack_client_id",
        "mock_slack_client_secret",
        "https://slack.com/oauth/v2/authorize",
        "https://slack.com/api/oauth.v2.access",
        {"chat:write", "channels:read"},
        "http://localhost:8080/callback"
    });
    
    oauthManager_.registerConnector("github", {
        "mock_github_client_id",
        "mock_github_client_secret",
        "https://github.com/login/oauth/authorize",
        "https://github.com/login/oauth/access_token",
        {"repo", "user"},
        "http://localhost:8080/callback"
    });
}

void IntegrationPlatform::registerTool(ToolPtr tool) {
    tools_[tool->name()] = tool;
}

std::vector<ToolPtr> IntegrationPlatform::getTools(
    const std::string& userId,
    const std::vector<std::string>& toolNames
) {
    std::vector<ToolPtr> userTools;
    
    if (toolNames.empty()) {
        // Return all tools
        for (const auto& pair : tools_) {
            userTools.push_back(pair.second);
        }
    } else {
        // Return requested tools
        for (const auto& name : toolNames) {
            auto it = tools_.find(name);
            if (it != tools_.end()) {
                userTools.push_back(it->second);
            }
        }
    }
    
    return userTools;
}

IntegrationPlatform::ConnectionRequest IntegrationPlatform::linkAccount(
    const std::string& userId,
    const std::string& connectorId
) {
    ConnectionRequest request;
    request.requestId = generateUUID();
    request.connectorId = connectorId;
    request.userId = userId;
    
    std::string state = generateUUID();
    request.authUrl = oauthManager_.generateAuthUrl(connectorId, userId, state);
    
    pendingRequests_[request.requestId] = request;
    
    return request;
}

Result<ConnectedAccountPtr> IntegrationPlatform::waitForConnection(
    const std::string& requestId,
    std::chrono::milliseconds timeout
) {
    auto it = pendingRequests_.find(requestId);
    if (it == pendingRequests_.end()) {
        return Result<ConnectedAccountPtr>(Error(404, "Connection request not found"));
    }
    
    // In real implementation, would poll for OAuth callback
    // For demo, simulate successful connection after brief delay
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    
    auto& request = it->second;
    
    // Simulate OAuth code exchange
    std::string mockCode = "mock_auth_code_" + generateUUID();
    std::string mockState = generateUUID();
    
    auto tokenResult = oauthManager_.exchangeCode(
        request.connectorId,
        mockCode,
        mockState
    );
    
    if (tokenResult.hasError()) {
        return Result<ConnectedAccountPtr>(tokenResult.error());
    }
    
    auto account = std::make_shared<ConnectedAccount>(
        generateUUID(),
        request.userId,
        request.connectorId,
        tokenResult.value()
    );
    
    ensureUser(request.userId)->addConnectedAccount(account);
    pendingRequests_.erase(it);
    
    return makeSuccess(account);
}

Result<JsonValue> IntegrationPlatform::executeTool(
    const std::string& userId,
    const std::string& toolName,
    const JsonValue& params
) {
    auto toolIt = tools_.find(toolName);
    if (toolIt == tools_.end()) {
        return Result<JsonValue>(Error(404, "Tool not found: " + toolName));
    }
    
    // Check if tool requires connection
    // For demo, we'll use the first available connection
    auto user = getUserContext(userId);
    optional<std::string> connectionId;
    
    auto accounts = user->getConnectedAccounts();
    if (!accounts.empty()) {
        connectionId = optional<std::string>(accounts[0]->id());
    }
    
    return toolIt->second->execute(userId, params, connectionId);
}

JsonValue IntegrationPlatform::getToolsForProvider(
    const std::string& userId,
    const std::vector<std::string>& toolNames
) {
    auto tools = getTools(userId, toolNames);
    return config_.provider->transformTools(tools);
}

Result<JsonValue> IntegrationPlatform::handleProviderResponse(
    const std::string& userId,
    const JsonValue& aiResponse
) {
    // Build tool map for provider
    std::unordered_map<std::string, ToolPtr> toolMap;
    for (const auto& pair : tools_) {
        toolMap[pair.first] = pair.second;
    }
    
    return config_.provider->handleToolCalls(userId, aiResponse, toolMap);
}

UserContextPtr IntegrationPlatform::getUserContext(const std::string& userId) {
    return ensureUser(userId);
}

UserContextPtr IntegrationPlatform::ensureUser(const std::string& userId) {
    auto it = users_.find(userId);
    if (it == users_.end()) {
        auto user = std::make_shared<UserContext>(userId);
        users_[userId] = user;
        return user;
    }
    return it->second;
}

}  // namespace client
}  // namespace orch
}  // namespace gopher