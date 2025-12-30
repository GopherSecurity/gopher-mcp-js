// Example: Integration Platform using gopher-orch
// Demonstrates Provider Pattern, User Isolation, Tool Abstraction, and OAuth

#include <iostream>
#include <memory>
#include <chrono>
#include <thread>

#include "gopher/orch/client/integration_platform.h"
#include "gopher/orch/client/tool.h"
#include "gopher/orch/client/runnable_adapters.h"
#include "gopher/orch/client/provider/all_providers.h"
#include "gopher/orch/client/user_context.h"
#include "gopher/orch/core/simple_dispatcher.h"
#include "gopher/orch/composition/sequence.h"
#include "gopher/orch/composition/parallel.h"

using namespace gopher::orch;
using namespace gopher::orch::core;
using namespace gopher::orch::client;
using namespace gopher::orch::client::provider;
using namespace gopher::orch::composition;

// =============================================================================
// Example Tool Implementation (for demonstration)
// =============================================================================

class ExampleTool : public Tool {
public:
    ExampleTool(const std::string& name, const std::string& desc) 
        : Tool(name, desc) {}
    
    Result<JsonValue> execute(
        const std::string& userId,
        const JsonValue& params,
        const optional<std::string>& connectionId = nullopt
    ) override {
        // Mock implementation for demo
        JsonValue result = JsonValue::object();
        result["status"] = "success";
        result["tool"] = name_;
        result["user"] = userId;
        return makeSuccess(result);
    }
    
    ToolSchema getSchema() const override {
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        params["properties"] = JsonValue::object();
        return {name_, description_, params, JsonValue::object()};
    }
};

// =============================================================================
// Demo: AI Email Assistant with OAuth Authentication
// =============================================================================

void demonstrateEmailAssistant() {
    std::cout << "\n=== Integration Platform Email Assistant Demo ===" << std::endl;
    
    // 1. Initialize Integration Platform with Anthropic Provider
    IntegrationPlatform::Config config;
    config.apiKey = "demo_api_key";
    config.provider = provider::createProvider("anthropic");
    
    auto platform = std::make_shared<IntegrationPlatform>(config);
    
    // 2. Register example tools
    platform->registerTool(std::make_shared<ExampleTool>("GMAIL_SEND_EMAIL", "Send an email"));
    platform->registerTool(std::make_shared<ExampleTool>("SLACK_SEND_MESSAGE", "Send a Slack message"));
    platform->registerTool(std::make_shared<ExampleTool>("GITHUB_CREATE_ISSUE", "Create a GitHub issue"));
    
    // 3. User isolation - all operations scoped to this user
    std::string userId = "user_alice@example.com";
    
    // 4. OAuth Authentication Flow
    std::cout << "\n[OAuth] Initiating Gmail connection for user: " << userId << std::endl;
    auto connectionRequest = platform->linkAccount(userId, "gmail");
    std::cout << "[OAuth] Auth URL generated: " << connectionRequest.authUrl.substr(0, 50) << "..." << std::endl;
    std::cout << "[OAuth] Request ID: " << connectionRequest.requestId << std::endl;
    
    // Simulate user authorization (in real app, user would visit authUrl)
    std::cout << "[OAuth] Simulating user authorization..." << std::endl;
    auto connectionResult = platform->waitForConnection(
        connectionRequest.requestId,
        std::chrono::seconds(5)
    );
    
    if (connectionResult.hasError()) {
        std::cerr << "[OAuth] Connection failed: " << connectionResult.error().message << std::endl;
        return;
    }
    
    auto connection = connectionResult.value();
    std::cout << "[OAuth] Successfully connected! Account ID: " << connection->id() << std::endl;
    
    // 5. Get tools for AI (formatted for Claude)
    auto tools = platform->getToolsForProvider(userId, {"GMAIL_SEND_EMAIL", "SLACK_SEND_MESSAGE"});
    std::cout << "\n[Tools] Available tools formatted for AI:" << std::endl;
    
    if (tools.isArray()) {
        for (size_t i = 0; i < tools.size(); ++i) {
            const auto& tool = tools[i];
            std::cout << "  - " << tool["name"].getString() 
                      << ": " << tool["description"].getString() << std::endl;
        }
    }
    
    // 6. Simulate AI choosing to send an email
    std::cout << "\n[AI] Processing user request: 'Send an email to Bob about the meeting'" << std::endl;
    
    // Create email parameters as if AI generated them
    JsonValue emailParams = JsonValue::object();
    emailParams["to"] = "bob@example.com";
    emailParams["subject"] = "Meeting Tomorrow";
    emailParams["body"] = "Hi Bob,\n\nJust a reminder about our meeting tomorrow at 2 PM.\n\nBest regards,\nAlice";
    
    // Execute tool
    auto result = platform->executeTool(userId, "GMAIL_SEND_EMAIL", emailParams);
    
    if (result.hasError()) {
        std::cerr << "[Tool] Execution failed: " << result.error().message << std::endl;
        return;
    }
    
    std::cout << "[Tool] Email sent successfully!" << std::endl;
    std::cout << "  Message ID: " << result.value()["messageId"].getString() << std::endl;
    std::cout << "  Status: " << result.value()["status"].getString() << std::endl;
}

// =============================================================================
// Demo: Multi-Tool Workflow using Runnables
// =============================================================================

void demonstrateMultiToolWorkflow() {
    std::cout << "\n=== Multi-Tool Workflow Demo ===" << std::endl;
    
    // Setup
    IntegrationPlatform::Config config;
    config.apiKey = "demo_api_key";
    config.provider = provider::createProvider("openai");
    
    auto platform = std::make_shared<IntegrationPlatform>(config);
    platform->registerTool(std::make_shared<ExampleTool>("GMAIL_SEND_EMAIL", "Send an email"));
    platform->registerTool(std::make_shared<ExampleTool>("SLACK_SEND_MESSAGE", "Send a Slack message"));
    platform->registerTool(std::make_shared<ExampleTool>("GITHUB_CREATE_ISSUE", "Create a GitHub issue"));
    
    std::string userId = "user_developer@example.com";
    
    // Create dispatcher for async operations
    SimpleDispatcher dispatcher("demo");
    
    // Create tool runnables
    auto gmailTool = std::make_shared<ToolRunnable>(
        platform, userId, 
        std::make_shared<ExampleTool>("GMAIL_SEND_EMAIL", "Send an email")
    );
    
    auto slackTool = std::make_shared<ToolRunnable>(
        platform, userId,
        std::make_shared<ExampleTool>("SLACK_SEND_MESSAGE", "Send a Slack message")
    );
    
    auto githubTool = std::make_shared<ToolRunnable>(
        platform, userId,
        std::make_shared<ExampleTool>("GITHUB_CREATE_ISSUE", "Create a GitHub issue")
    );
    
    // Create parallel workflow - notify multiple channels at once
    auto notifyAll = parallel("NotifyAllChannels")
        .add("email", gmailTool)
        .add("slack", slackTool)
        .add("github", githubTool)
        .build();
    
    std::cout << "\n[Workflow] Executing parallel notifications..." << std::endl;
    
    // Prepare input for each tool
    JsonValue input = JsonValue::object();
    
    // Email params
    JsonValue emailData = JsonValue::object();
    emailData["to"] = "team@example.com";
    emailData["subject"] = "New Feature Released";
    emailData["body"] = "We've just released the new integration feature!";
    input["email"] = emailData;
    
    // Slack params  
    JsonValue slackData = JsonValue::object();
    slackData["channel"] = "#releases";
    slackData["text"] = "🚀 New feature released! Check your email for details.";
    input["slack"] = slackData;
    
    // GitHub params
    JsonValue githubData = JsonValue::object();
    githubData["repo"] = "company/product";
    githubData["title"] = "Feature Release: Integration Platform";
    githubData["body"] = "Tracking issue for the new integration platform release";
    input["github"] = githubData;
    
    // Execute workflow
    bool completed = false;
    Result<JsonValue> workflowResult = Result<JsonValue>(Error(-1, "Not completed"));
    
    notifyAll->invoke(input, RunnableConfig(), dispatcher, 
        [&](Result<JsonValue> result) {
            workflowResult = result;
            completed = true;
        }
    );
    
    // Run dispatcher
    while (!completed) {
        dispatcher.run(Dispatcher::RunMode::NonBlock);
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    if (workflowResult.hasError()) {
        std::cerr << "[Workflow] Failed: " << workflowResult.error().message << std::endl;
        return;
    }
    
    std::cout << "[Workflow] All notifications sent successfully!" << std::endl;
    
    const auto& results = workflowResult.value();
    if (results.contains("email")) {
        std::cout << "  Email: " << results["email"]["messageId"].getString() << std::endl;
    }
    if (results.contains("slack")) {
        std::cout << "  Slack: " << results["slack"]["messageId"].getString() << std::endl;
    }
    if (results.contains("github")) {
        std::cout << "  GitHub: Issue #" << results["github"]["issueNumber"].getInt() << std::endl;
    }
}

// =============================================================================
// Demo: Provider Pattern - Framework Switching
// =============================================================================

void demonstrateProviderPattern() {
    std::cout << "\n=== Provider Pattern Demo ===" << std::endl;
    
    // Register tools once
    auto gmailTool = std::make_shared<ExampleTool>("GMAIL_SEND_EMAIL", "Send an email");
    auto slackTool = std::make_shared<ExampleTool>("SLACK_SEND_MESSAGE", "Send a Slack message");
    
    std::vector<ToolPtr> tools = {gmailTool, slackTool};
    std::string userId = "user_test@example.com";
    
    // Test with Anthropic Provider
    {
        std::cout << "\n[Provider] Using Anthropic/Claude format:" << std::endl;
        auto provider = std::make_shared<AnthropicProvider>();
        auto formatted = provider->transformTools(tools);
        
        if (formatted.isArray()) {
            for (size_t i = 0; i < formatted.size(); ++i) {
                const auto& tool = formatted[i];
                std::cout << "  Tool: " << tool["name"].getString() << std::endl;
                std::cout << "    - Has input_schema: " 
                          << (tool.contains("input_schema") ? "Yes" : "No") << std::endl;
            }
        }
    }
    
    // Test with OpenAI Provider
    {
        std::cout << "\n[Provider] Using OpenAI/GPT format:" << std::endl;
        auto provider = std::make_shared<OpenAIProvider>();
        auto formatted = provider->transformTools(tools);
        
        if (formatted.isArray()) {
            for (size_t i = 0; i < formatted.size(); ++i) {
                const auto& tool = formatted[i];
                std::cout << "  Type: " << tool["type"].getString() << std::endl;
                if (tool.contains("function")) {
                    std::cout << "    - Function: " 
                              << tool["function"]["name"].getString() << std::endl;
                }
            }
        }
    }
    
    std::cout << "\n[Provider] Same tools, different formats for different AI frameworks!" << std::endl;
}

// =============================================================================
// Demo: User Isolation
// =============================================================================

void demonstrateUserIsolation() {
    std::cout << "\n=== User Isolation Demo ===" << std::endl;
    
    IntegrationPlatform::Config config;
    config.apiKey = "demo_api_key";
    config.provider = provider::createProvider("anthropic");
    
    auto platform = std::make_shared<IntegrationPlatform>(config);
    platform->registerTool(std::make_shared<ExampleTool>("GMAIL_SEND_EMAIL", "Send an email"));
    
    // Create connections for different users
    std::vector<std::string> users = {
        "alice@company.com",
        "bob@company.com",
        "charlie@company.com"
    };
    
    for (const auto& userId : users) {
        std::cout << "\n[Isolation] Setting up user: " << userId << std::endl;
        
        // Each user gets their own OAuth connection
        auto request = platform->linkAccount(userId, "gmail");
        auto result = platform->waitForConnection(request.requestId);
        
        if (result.hasValue()) {
            std::cout << "  ✓ Connected with account ID: " << result.value()->id() << std::endl;
        }
        
        // Each user's context is completely isolated
        auto context = platform->getUserContext(userId);
        auto accounts = context->getConnectedAccounts();
        std::cout << "  ✓ User has " << accounts.size() << " connected account(s)" << std::endl;
    }
    
    // Verify isolation - Bob can't access Alice's connections
    std::cout << "\n[Isolation] Verifying isolation:" << std::endl;
    auto aliceContext = platform->getUserContext("alice@company.com");
    auto bobContext = platform->getUserContext("bob@company.com");
    
    std::cout << "  Alice's accounts: " << aliceContext->getConnectedAccounts().size() << std::endl;
    std::cout << "  Bob's accounts: " << bobContext->getConnectedAccounts().size() << std::endl;
    std::cout << "  ✓ Each user's data is completely isolated!" << std::endl;
}

// =============================================================================
// Main
// =============================================================================

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "      C++ Integration Platform         " << std::endl;
    std::cout << "     Using gopher-orch Framework       " << std::endl;
    std::cout << "========================================" << std::endl;
    
    try {
        // Run all demonstrations
        demonstrateEmailAssistant();
        demonstrateMultiToolWorkflow();
        demonstrateProviderPattern();
        demonstrateUserIsolation();
        
        std::cout << "\n========================================" << std::endl;
        std::cout << "        All Demos Completed!            " << std::endl;
        std::cout << "========================================" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}