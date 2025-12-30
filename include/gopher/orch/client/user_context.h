#pragma once

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include "gopher/orch/core/types.h"
#include "gopher/orch/client/connected_account.h"

namespace gopher {
namespace orch {
namespace client {

using namespace gopher::orch::core;

// User-scoped context for all operations
class UserContext {
public:
    explicit UserContext(const std::string& externalUserId)
        : userId_(externalUserId) {}
    
    // Get user's connected accounts
    std::vector<ConnectedAccountPtr> getConnectedAccounts() const;
    
    // Add connected account
    void addConnectedAccount(ConnectedAccountPtr account);
    
    // Get specific connected account
    optional<ConnectedAccountPtr> getConnectedAccount(
        const std::string& connectorId
    ) const;
    
    const std::string& userId() const { return userId_; }
    
private:
    std::string userId_;
    std::unordered_map<std::string, ConnectedAccountPtr> connectedAccounts_;
};

using UserContextPtr = std::shared_ptr<UserContext>;

}  // namespace client
}  // namespace orch
}  // namespace gopher