#include "gopher/orch/client/connected_account.h"

namespace gopher {
namespace orch {
namespace client {

bool ConnectedAccount::isValid() const {
    return std::chrono::system_clock::now() < tokens_.expiresAt;
}

Result<std::string> ConnectedAccount::getAccessToken(OAuthManager& manager) {
    if (isValid()) {
        return makeSuccess(tokens_.accessToken);
    }
    
    // Refresh the token
    auto result = manager.refreshTokens(connectorId_, tokens_.refreshToken);
    if (result.hasError()) {
        return Result<std::string>(result.error());
    }
    
    tokens_ = result.value();
    return makeSuccess(tokens_.accessToken);
}

}  // namespace client
}  // namespace orch
}  // namespace gopher