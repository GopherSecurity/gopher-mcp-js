#pragma once

#include <memory>
#include <string>
#include <chrono>
#include "gopher/orch/core/types.h"
#include "gopher/orch/client/oauth_manager.h"

namespace gopher {
namespace orch {
namespace client {

using namespace gopher::orch::core;

// Represents a user's authenticated service connection
class ConnectedAccount {
public:
    ConnectedAccount(
        const std::string& id,
        const std::string& userId,
        const std::string& connectorId,
        const OAuthTokens& tokens
    ) : id_(id), userId_(userId), connectorId_(connectorId), tokens_(tokens) {}
    
    const std::string& id() const { return id_; }
    const std::string& userId() const { return userId_; }
    const std::string& connectorId() const { return connectorId_; }
    
    // Check if tokens are valid
    bool isValid() const;
    
    // Get current access token (refreshes if needed)
    Result<std::string> getAccessToken(OAuthManager& manager);
    
private:
    std::string id_;
    std::string userId_;
    std::string connectorId_;
    OAuthTokens tokens_;
};

using ConnectedAccountPtr = std::shared_ptr<ConnectedAccount>;

}  // namespace client
}  // namespace orch
}  // namespace gopher