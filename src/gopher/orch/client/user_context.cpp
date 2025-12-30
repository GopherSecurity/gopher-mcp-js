#include "gopher/orch/client/user_context.h"

namespace gopher {
namespace orch {
namespace client {

std::vector<ConnectedAccountPtr> UserContext::getConnectedAccounts() const {
    std::vector<ConnectedAccountPtr> accounts;
    for (const auto& pair : connectedAccounts_) {
        accounts.push_back(pair.second);
    }
    return accounts;
}

void UserContext::addConnectedAccount(ConnectedAccountPtr account) {
    connectedAccounts_[account->connectorId()] = account;
}

optional<ConnectedAccountPtr> UserContext::getConnectedAccount(
    const std::string& connectorId
) const {
    auto it = connectedAccounts_.find(connectorId);
    if (it != connectedAccounts_.end()) {
        return optional<ConnectedAccountPtr>(it->second);
    }
    return nullopt;
}

}  // namespace client
}  // namespace orch
}  // namespace gopher