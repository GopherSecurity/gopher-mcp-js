#pragma once

#include <memory>
#include <string>
#include "gopher/orch/core/runnable.h"
#include "gopher/orch/client/tool.h"
#include "gopher/orch/client/integration_platform.h"

namespace gopher {
namespace orch {
namespace client {

using namespace gopher::orch::core;

// Tool as a Runnable
class ToolRunnable : public JsonRunnable {
public:
    ToolRunnable(IntegrationPlatformPtr platform, const std::string& userId, ToolPtr tool)
        : platform_(platform), userId_(userId), tool_(tool) {}
    
    std::string name() const override {
        return "Tool:" + tool_->name();
    }
    
    void invoke(
        const JsonValue& input,
        const RunnableConfig& config,
        Dispatcher& dispatcher,
        Callback callback
    ) override;
    
private:
    IntegrationPlatformPtr platform_;
    std::string userId_;
    ToolPtr tool_;
};

// OAuth flow as a Runnable
class OAuthRunnable : public JsonRunnable {
public:
    OAuthRunnable(IntegrationPlatformPtr platform, const std::string& userId, const std::string& connectorId)
        : platform_(platform), userId_(userId), connectorId_(connectorId) {}
    
    std::string name() const override {
        return "OAuth:" + connectorId_;
    }
    
    void invoke(
        const JsonValue& input,
        const RunnableConfig& config,
        Dispatcher& dispatcher,
        Callback callback
    ) override;
    
private:
    IntegrationPlatformPtr platform_;
    std::string userId_;
    std::string connectorId_;
};

}  // namespace client
}  // namespace orch
}  // namespace gopher