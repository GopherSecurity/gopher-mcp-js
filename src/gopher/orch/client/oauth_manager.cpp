#include "gopher/orch/client/oauth_manager.h"
#include <sstream>
#include <random>
#include <iomanip>

namespace gopher {
namespace orch {
namespace client {

// Helper functions
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

static std::string urlEncode(const std::string& value) {
    std::ostringstream escaped;
    escaped.fill('0');
    escaped << std::hex;

    for (auto c : value) {
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            escaped << c;
        } else {
            escaped << std::uppercase;
            escaped << '%' << std::setw(2) << int((unsigned char) c);
            escaped << std::nouppercase;
        }
    }
    return escaped.str();
}

std::string OAuthManager::generateAuthUrl(
    const std::string& connectorId,
    const std::string& userId,
    const std::string& state
) {
    auto it = connectors_.find(connectorId);
    if (it == connectors_.end()) {
        return "";
    }
    
    const auto& config = it->second;
    
    std::stringstream url;
    url << config.authUrl << "?";
    url << "client_id=" << urlEncode(config.clientId);
    url << "&redirect_uri=" << urlEncode(config.redirectUri);
    url << "&response_type=code";
    url << "&state=" << urlEncode(state);
    
    if (!config.scopes.empty()) {
        url << "&scope=";
        for (size_t i = 0; i < config.scopes.size(); ++i) {
            if (i > 0) url << "%20";
            url << urlEncode(config.scopes[i]);
        }
    }
    
    pendingStates_[state] = userId;
    
    return url.str();
}

Result<OAuthTokens> OAuthManager::exchangeCode(
    const std::string& connectorId,
    const std::string& code,
    const std::string& state
) {
    auto stateIt = pendingStates_.find(state);
    if (stateIt == pendingStates_.end()) {
        return Result<OAuthTokens>(Error(401, "Invalid state parameter"));
    }
    
    auto configIt = connectors_.find(connectorId);
    if (configIt == connectors_.end()) {
        return Result<OAuthTokens>(Error(404, "Connector not found"));
    }
    
    // In real implementation, would make HTTP POST request to token URL
    // For now, return mock tokens
    OAuthTokens tokens;
    tokens.accessToken = "mock_access_token_" + generateUUID();
    tokens.refreshToken = "mock_refresh_token_" + generateUUID();
    tokens.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(1);
    
    pendingStates_.erase(stateIt);
    
    return makeSuccess(tokens);
}

Result<OAuthTokens> OAuthManager::refreshTokens(
    const std::string& connectorId,
    const std::string& refreshToken
) {
    auto configIt = connectors_.find(connectorId);
    if (configIt == connectors_.end()) {
        return Result<OAuthTokens>(Error(404, "Connector not found"));
    }
    
    // In real implementation, would make HTTP POST request to refresh
    OAuthTokens tokens;
    tokens.accessToken = "mock_refreshed_token_" + generateUUID();
    tokens.refreshToken = refreshToken;  // Usually stays the same
    tokens.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(1);
    
    return makeSuccess(tokens);
}

void OAuthManager::registerConnector(
    const std::string& connectorId,
    const OAuthConfig& config
) {
    connectors_[connectorId] = config;
}

}  // namespace client
}  // namespace orch
}  // namespace gopher