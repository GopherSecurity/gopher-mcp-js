#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <chrono>
#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace client {

using namespace gopher::orch::core;

// OAuth configuration for a service connector
struct OAuthConfig {
    std::string clientId;
    std::string clientSecret;
    std::string authUrl;
    std::string tokenUrl;
    std::vector<std::string> scopes;
    std::string redirectUri;
};

// OAuth tokens with expiration
struct OAuthTokens {
    std::string accessToken;
    std::string refreshToken;
    std::chrono::system_clock::time_point expiresAt;
};

// Manages OAuth authentication flows
class OAuthManager {
public:
    OAuthManager() = default;
    
    // Generate OAuth URL for user authorization
    std::string generateAuthUrl(
        const std::string& connectorId,
        const std::string& userId,
        const std::string& state
    );
    
    // Exchange authorization code for tokens
    Result<OAuthTokens> exchangeCode(
        const std::string& connectorId,
        const std::string& code,
        const std::string& state
    );
    
    // Refresh access token
    Result<OAuthTokens> refreshTokens(
        const std::string& connectorId,
        const std::string& refreshToken
    );
    
    // Register OAuth config for a service
    void registerConnector(
        const std::string& connectorId,
        const OAuthConfig& config
    );
    
private:
    std::unordered_map<std::string, OAuthConfig> connectors_;
    std::unordered_map<std::string, std::string> pendingStates_; // state -> userId
};

}  // namespace client
}  // namespace orch
}  // namespace gopher