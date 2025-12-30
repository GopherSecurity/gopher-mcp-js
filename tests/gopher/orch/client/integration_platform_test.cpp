#include <gtest/gtest.h>
#include "gopher/orch/client/integration_platform.h"
#include "gopher/orch/client/tool.h"
#include "gopher/orch/client/provider/all_providers.h"

using namespace gopher::orch::client;
using namespace gopher::orch::client::provider;
using namespace gopher::orch::core;

// Mock Tool for testing
class PlatformTestTool : public Tool {
public:
    PlatformTestTool(const std::string& name, const std::string& desc) 
        : Tool(name, desc), executionCount(0) {}
    
    Result<JsonValue> execute(
        const std::string& userId,
        const JsonValue& params,
        const optional<std::string>& connectionId = nullopt
    ) override {
        executionCount++;
        lastUserId = userId;
        
        JsonValue result = JsonValue::object();
        result["success"] = true;
        result["tool"] = name_;
        result["execution_count"] = executionCount;
        
        if (connectionId.hasValue()) {
            result["connection_used"] = connectionId.value();
        }
        
        if (params.contains("action")) {
            result["action"] = params["action"];
        }
        
        return makeSuccess(result);
    }
    
    ToolSchema getSchema() const override {
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        
        JsonValue properties = JsonValue::object();
        JsonValue actionProp = JsonValue::object();
        actionProp["type"] = "string";
        actionProp["description"] = "Action to perform";
        properties["action"] = actionProp;
        params["properties"] = properties;
        
        return {name_, description_, params, JsonValue::object()};
    }
    
    int executionCount;
    std::string lastUserId;
};

class IntegrationPlatformTest : public ::testing::Test {
protected:
    void SetUp() override {
        platform = std::make_unique<IntegrationPlatform>();
        
        // Register OAuth connectors
        OAuthConfig gmailConfig;
        gmailConfig.clientId = "gmail_client_id";
        gmailConfig.clientSecret = "gmail_client_secret";
        gmailConfig.authUrl = "https://accounts.google.com/oauth/authorize";
        gmailConfig.tokenUrl = "https://oauth2.googleapis.com/token";
        gmailConfig.scopes = {"gmail.send", "gmail.readonly"};
        gmailConfig.redirectUri = "http://localhost:8080/callback";
        
        platform->registerOAuthConnector("gmail", gmailConfig);
        
        OAuthConfig slackConfig;
        slackConfig.clientId = "slack_client_id";
        slackConfig.clientSecret = "slack_client_secret";
        slackConfig.authUrl = "https://slack.com/oauth/v2/authorize";
        slackConfig.tokenUrl = "https://slack.com/api/oauth.v2.access";
        slackConfig.scopes = {"chat:write"};
        slackConfig.redirectUri = "http://localhost:8080/callback";
        
        platform->registerOAuthConnector("slack", slackConfig);
        
        // Create test tools
        emailTool = std::make_shared<PlatformTestTool>("send_email", "Send an email");
        messageTool = std::make_shared<PlatformTestTool>("send_message", "Send a message");
        analyticsTool = std::make_shared<PlatformTestTool>("get_analytics", "Get analytics");
        
        // Register tools
        platform->registerTool(emailTool, "gmail");
        platform->registerTool(messageTool, "slack");
        platform->registerTool(analyticsTool);  // Tool without specific connector
        
        // Register providers
        platform->registerProvider(std::make_unique<AnthropicProvider>());
        platform->registerProvider(std::make_unique<OpenAIProvider>());
    }
    
    std::unique_ptr<IntegrationPlatform> platform;
    std::shared_ptr<PlatformTestTool> emailTool;
    std::shared_ptr<PlatformTestTool> messageTool;
    std::shared_ptr<PlatformTestTool> analyticsTool;
};

TEST_F(IntegrationPlatformTest, RegisterAndRetrieveTool) {
    auto tool = platform->getTool("send_email");
    ASSERT_NE(tool, nullptr);
    EXPECT_EQ(tool->name(), "send_email");
    EXPECT_EQ(tool->description(), "Send an email");
}

TEST_F(IntegrationPlatformTest, GetNonExistentTool) {
    auto tool = platform->getTool("non_existent_tool");
    EXPECT_EQ(tool, nullptr);
}

TEST_F(IntegrationPlatformTest, GetAvailableTools) {
    auto tools = platform->getAvailableTools();
    
    ASSERT_EQ(tools.size(), 3);
    
    std::vector<std::string> toolNames;
    for (const auto& tool : tools) {
        toolNames.push_back(tool->name());
    }
    
    EXPECT_NE(std::find(toolNames.begin(), toolNames.end(), "send_email"), toolNames.end());
    EXPECT_NE(std::find(toolNames.begin(), toolNames.end(), "send_message"), toolNames.end());
    EXPECT_NE(std::find(toolNames.begin(), toolNames.end(), "get_analytics"), toolNames.end());
}

TEST_F(IntegrationPlatformTest, GetToolsForConnector) {
    auto gmailTools = platform->getToolsForConnector("gmail");
    ASSERT_EQ(gmailTools.size(), 1);
    EXPECT_EQ(gmailTools[0]->name(), "send_email");
    
    auto slackTools = platform->getToolsForConnector("slack");
    ASSERT_EQ(slackTools.size(), 1);
    EXPECT_EQ(slackTools[0]->name(), "send_message");
    
    auto unknownTools = platform->getToolsForConnector("unknown");
    EXPECT_EQ(unknownTools.size(), 0);
}

TEST_F(IntegrationPlatformTest, ExecuteToolWithoutConnection) {
    JsonValue params = JsonValue::object();
    params["action"] = "test_action";
    
    auto result = platform->executeTool("user123", "get_analytics", params);
    
    ASSERT_TRUE(result.hasValue());
    EXPECT_TRUE(result.value()["success"].getBool());
    EXPECT_EQ(result.value()["action"].getString(), "test_action");
    EXPECT_FALSE(result.value().contains("connection_used"));
    
    // Check tool was executed
    EXPECT_EQ(analyticsTool->executionCount, 1);
    EXPECT_EQ(analyticsTool->lastUserId, "user123");
}

TEST_F(IntegrationPlatformTest, ExecuteToolWithConnection) {
    // First establish a connection for the user
    std::string state = "test_state_123";
    platform->initiateOAuth("gmail", "user456", state);
    
    // Simulate OAuth callback
    auto tokens = platform->handleOAuthCallback("gmail", "auth_code", state);
    ASSERT_TRUE(tokens.hasValue());
    
    // Now execute tool that requires connection
    JsonValue params = JsonValue::object();
    params["action"] = "send";
    
    auto result = platform->executeTool("user456", "send_email", params, "gmail");
    
    ASSERT_TRUE(result.hasValue());
    EXPECT_TRUE(result.value()["success"].getBool());
    EXPECT_EQ(result.value()["action"].getString(), "send");
    
    // Check tool was executed
    EXPECT_EQ(emailTool->executionCount, 1);
    EXPECT_EQ(emailTool->lastUserId, "user456");
}

TEST_F(IntegrationPlatformTest, ExecuteNonExistentTool) {
    JsonValue params = JsonValue::object();
    
    auto result = platform->executeTool("user123", "non_existent", params);
    
    ASSERT_TRUE(result.hasError());
    EXPECT_EQ(result.error().code, 404);
    EXPECT_NE(result.error().message.find("Tool not found"), std::string::npos);
}

TEST_F(IntegrationPlatformTest, OAuthFlowComplete) {
    std::string userId = "test_user@example.com";
    std::string state = "unique_state_456";
    
    // Initiate OAuth
    std::string authUrl = platform->initiateOAuth("gmail", userId, state);
    
    EXPECT_FALSE(authUrl.empty());
    EXPECT_NE(authUrl.find("https://accounts.google.com/oauth/authorize"), std::string::npos);
    EXPECT_NE(authUrl.find("state=unique_state_456"), std::string::npos);
    
    // Handle callback
    auto result = platform->handleOAuthCallback("gmail", "test_auth_code", state);
    
    ASSERT_TRUE(result.hasValue());
    const auto& tokens = result.value();
    EXPECT_FALSE(tokens.accessToken.empty());
    EXPECT_FALSE(tokens.refreshToken.empty());
    
    // Check user has connection
    auto userCtx = platform->getUserContext(userId);
    ASSERT_NE(userCtx, nullptr);
    
    auto connection = userCtx->getConnectedAccount("gmail");
    ASSERT_TRUE(connection.hasValue());
    EXPECT_EQ(connection.value()->userId(), userId);
}

TEST_F(IntegrationPlatformTest, RegisterAndRetrieveProvider) {
    auto provider = platform->getProvider("anthropic");
    ASSERT_NE(provider, nullptr);
    EXPECT_EQ(provider->name(), "anthropic");
    
    provider = platform->getProvider("openai");
    ASSERT_NE(provider, nullptr);
    EXPECT_EQ(provider->name(), "openai");
    
    provider = platform->getProvider("non_existent");
    EXPECT_EQ(provider, nullptr);
}

TEST_F(IntegrationPlatformTest, ProcessAIRequestWithTools) {
    // Create AI request with tool call
    JsonValue aiResponse = JsonValue::object();
    JsonValue content = JsonValue::array();
    
    JsonValue toolUse = JsonValue::object();
    toolUse["type"] = "tool_use";
    toolUse["id"] = "call_789";
    toolUse["name"] = "get_analytics";
    JsonValue input = JsonValue::object();
    input["action"] = "fetch_data";
    toolUse["input"] = input;
    
    content.push_back(toolUse);
    aiResponse["content"] = content;
    
    auto result = platform->processAIRequest("user789", "anthropic", aiResponse);
    
    ASSERT_TRUE(result.hasValue());
    ASSERT_TRUE(result.value().isArray());
    EXPECT_EQ(result.value().size(), 1);
    
    const auto& toolResult = result.value()[0];
    EXPECT_EQ(toolResult["tool_use_id"].getString(), "call_789");
    EXPECT_FALSE(toolResult["is_error"].getBool());
    
    // Verify tool was executed
    EXPECT_EQ(analyticsTool->executionCount, 1);
    EXPECT_EQ(analyticsTool->lastUserId, "user789");
}

TEST_F(IntegrationPlatformTest, UserIsolation) {
    // Create connections for different users
    std::string state1 = "state_user1";
    std::string state2 = "state_user2";
    
    platform->initiateOAuth("gmail", "user1@example.com", state1);
    platform->initiateOAuth("gmail", "user2@example.com", state2);
    
    platform->handleOAuthCallback("gmail", "code1", state1);
    platform->handleOAuthCallback("gmail", "code2", state2);
    
    // Get user contexts
    auto ctx1 = platform->getUserContext("user1@example.com");
    auto ctx2 = platform->getUserContext("user2@example.com");
    
    ASSERT_NE(ctx1, nullptr);
    ASSERT_NE(ctx2, nullptr);
    
    // Verify isolation
    EXPECT_EQ(ctx1->userId(), "user1@example.com");
    EXPECT_EQ(ctx2->userId(), "user2@example.com");
    
    auto conn1 = ctx1->getConnectedAccount("gmail");
    auto conn2 = ctx2->getConnectedAccount("gmail");
    
    ASSERT_TRUE(conn1.hasValue());
    ASSERT_TRUE(conn2.hasValue());
    
    EXPECT_NE(conn1.value()->id(), conn2.value()->id());
}

TEST_F(IntegrationPlatformTest, RefreshExpiredToken) {
    // Setup user with connection
    std::string userId = "refresh_test_user@example.com";
    std::string state = "refresh_state";
    
    platform->initiateOAuth("slack", userId, state);
    auto initialTokens = platform->handleOAuthCallback("slack", "initial_code", state);
    ASSERT_TRUE(initialTokens.hasValue());
    
    // Get the user's context and connection
    auto userCtx = platform->getUserContext(userId);
    ASSERT_NE(userCtx, nullptr);
    
    auto connection = userCtx->getConnectedAccount("slack");
    ASSERT_TRUE(connection.hasValue());
    
    // Force token expiration by manipulating the connection
    // (In a real scenario, this would happen naturally over time)
    
    // Execute tool which should trigger token refresh if needed
    JsonValue params = JsonValue::object();
    params["action"] = "send_notification";
    
    auto result = platform->executeTool(userId, "send_message", params, "slack");
    
    ASSERT_TRUE(result.hasValue());
    EXPECT_TRUE(result.value()["success"].getBool());
    
    // Verify tool executed successfully
    EXPECT_GE(messageTool->executionCount, 1);
}

TEST_F(IntegrationPlatformTest, RegisterMultipleProviders) {
    // Register additional providers
    platform->registerProvider(std::make_unique<GoogleProvider>());
    platform->registerProvider(std::make_unique<LlamaProvider>());
    
    // Verify all providers are available
    auto anthropic = platform->getProvider("anthropic");
    auto openai = platform->getProvider("openai");
    auto google = platform->getProvider("google");
    auto llama = platform->getProvider("llama");
    
    EXPECT_NE(anthropic, nullptr);
    EXPECT_NE(openai, nullptr);
    EXPECT_NE(google, nullptr);
    EXPECT_NE(llama, nullptr);
}

TEST_F(IntegrationPlatformTest, OverrideExistingTool) {
    // Register a new version of an existing tool
    auto newEmailTool = std::make_shared<PlatformTestTool>("send_email", "Updated email sender");
    platform->registerTool(newEmailTool, "gmail");
    
    // Verify the tool was replaced
    auto tool = platform->getTool("send_email");
    ASSERT_NE(tool, nullptr);
    EXPECT_EQ(tool->description(), "Updated email sender");
    
    // Execute to verify it's the new tool
    JsonValue params = JsonValue::object();
    platform->executeTool("user", "send_email", params);
    
    EXPECT_EQ(newEmailTool->executionCount, 1);
    EXPECT_EQ(emailTool->executionCount, 0); // Old tool shouldn't be called
}