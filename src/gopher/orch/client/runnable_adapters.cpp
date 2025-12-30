#include "gopher/orch/client/runnable_adapters.h"

namespace gopher {
namespace orch {
namespace client {

void ToolRunnable::invoke(
    const JsonValue& input,
    const RunnableConfig& config,
    Dispatcher& dispatcher,
    Callback callback
) {
    dispatcher.post([this, input, callback]() {
        auto result = platform_->executeTool(userId_, tool_->name(), input);
        callback(result);
    });
}

void OAuthRunnable::invoke(
    const JsonValue& input,
    const RunnableConfig& config,
    Dispatcher& dispatcher,
    Callback callback
) {
    dispatcher.post([this, callback]() {
        auto request = platform_->linkAccount(userId_, connectorId_);
        
        JsonValue result = JsonValue::object();
        result["requestId"] = request.requestId;
        result["authUrl"] = request.authUrl;
        result["status"] = "pending";
        
        callback(makeSuccess(result));
    });
}

}  // namespace client
}  // namespace orch
}  // namespace gopher