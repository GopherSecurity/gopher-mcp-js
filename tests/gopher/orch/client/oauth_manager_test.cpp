#include <gtest/gtest.h>
#include "gopher/orch/client/oauth_manager.h"
#include <thread>

using namespace gopher::orch::client;
using namespace gopher::orch::core;

class OAuthManagerTest : public ::testing::Test {
protected:
    void SetUp() override {
        manager = std::make_unique<OAuthManager>();
        
        // Register test OAuth connectors
        OAuthConfig gmailConfig;
        gmailConfig.clientId = "test_gmail_client";
        gmailConfig.clientSecret = "test_gmail_secret";
        gmailConfig.authUrl = "https://accounts.google.com/oauth/authorize";
        gmailConfig.tokenUrl = "https://oauth2.googleapis.com/token";
        gmailConfig.scopes = {"gmail.send", "gmail.readonly"};
        gmailConfig.redirectUri = "http://localhost:8080/callback";
        
        manager->registerConnector("gmail", gmailConfig);
        
        OAuthConfig slackConfig;
        slackConfig.clientId = "test_slack_client";
        slackConfig.clientSecret = "test_slack_secret";
        slackConfig.authUrl = "https://slack.com/oauth/v2/authorize";
        slackConfig.tokenUrl = "https://slack.com/api/oauth.v2.access";
        slackConfig.scopes = {"chat:write"};
        slackConfig.redirectUri = "http://localhost:8080/callback";
        
        manager->registerConnector("slack", slackConfig);
    }
    
    std::unique_ptr<OAuthManager> manager;
};

TEST_F(OAuthManagerTest, GenerateAuthUrl) {
    std::string state = "test_state_123";
    std::string userId = "user@example.com";
    
    std::string authUrl = manager->generateAuthUrl("gmail", userId, state);
    
    EXPECT_FALSE(authUrl.empty());
    EXPECT_NE(authUrl.find("https://accounts.google.com/oauth/authorize"), std::string::npos);
    EXPECT_NE(authUrl.find("client_id=test_gmail_client"), std::string::npos);
    EXPECT_NE(authUrl.find("redirect_uri="), std::string::npos);
    EXPECT_NE(authUrl.find("response_type=code"), std::string::npos);
    EXPECT_NE(authUrl.find("state=test_state_123"), std::string::npos);
    EXPECT_NE(authUrl.find("scope="), std::string::npos);
}

TEST_F(OAuthManagerTest, GenerateAuthUrlWithScopes) {
    std::string state = "state_456";
    std::string userId = "user2@example.com";
    
    std::string authUrl = manager->generateAuthUrl("slack", userId, state);
    
    EXPECT_FALSE(authUrl.empty());
    EXPECT_NE(authUrl.find("https://slack.com/oauth/v2/authorize"), std::string::npos);
    EXPECT_NE(authUrl.find("client_id=test_slack_client"), std::string::npos);
    EXPECT_NE(authUrl.find("chat%3Awrite"), std::string::npos); // URL encoded chat:write
}

TEST_F(OAuthManagerTest, GenerateAuthUrlForUnknownConnector) {
    std::string state = "state_789";
    std::string userId = "user3@example.com";
    
    std::string authUrl = manager->generateAuthUrl("unknown", userId, state);
    
    EXPECT_TRUE(authUrl.empty());
}

TEST_F(OAuthManagerTest, ExchangeCodeSuccess) {
    // First generate an auth URL to set up state
    std::string state = "exchange_test_state";
    std::string userId = "user@example.com";
    manager->generateAuthUrl("gmail", userId, state);
    
    // Exchange code (mock implementation returns success)
    auto result = manager->exchangeCode("gmail", "auth_code_123", state);
    
    ASSERT_TRUE(result.hasValue());
    const auto& tokens = result.value();
    
    EXPECT_FALSE(tokens.accessToken.empty());
    EXPECT_NE(tokens.accessToken.find("mock_access_token_"), std::string::npos);
    EXPECT_FALSE(tokens.refreshToken.empty());
    EXPECT_NE(tokens.refreshToken.find("mock_refresh_token_"), std::string::npos);
    
    // Check expiration is in the future
    auto now = std::chrono::system_clock::now();
    EXPECT_GT(tokens.expiresAt, now);
}

TEST_F(OAuthManagerTest, ExchangeCodeInvalidState) {
    // Try to exchange code with invalid state
    auto result = manager->exchangeCode("gmail", "auth_code_123", "invalid_state");
    
    ASSERT_TRUE(result.hasError());
    EXPECT_EQ(result.error().code, 401);
    EXPECT_NE(result.error().message.find("Invalid state"), std::string::npos);
}

TEST_F(OAuthManagerTest, ExchangeCodeUnknownConnector) {
    std::string state = "test_state";
    manager->generateAuthUrl("gmail", "user@example.com", state);
    
    auto result = manager->exchangeCode("unknown_connector", "auth_code", state);
    
    ASSERT_TRUE(result.hasError());
    EXPECT_EQ(result.error().code, 404);
    EXPECT_NE(result.error().message.find("Connector not found"), std::string::npos);
}

TEST_F(OAuthManagerTest, RefreshTokensSuccess) {
    auto result = manager->refreshTokens("gmail", "old_refresh_token");
    
    ASSERT_TRUE(result.hasValue());
    const auto& tokens = result.value();
    
    EXPECT_FALSE(tokens.accessToken.empty());
    EXPECT_NE(tokens.accessToken.find("mock_refreshed_token_"), std::string::npos);
    EXPECT_EQ(tokens.refreshToken, "old_refresh_token"); // Refresh token usually stays the same
    
    // Check expiration is in the future
    auto now = std::chrono::system_clock::now();
    EXPECT_GT(tokens.expiresAt, now);
}

TEST_F(OAuthManagerTest, RefreshTokensUnknownConnector) {
    auto result = manager->refreshTokens("unknown", "refresh_token");
    
    ASSERT_TRUE(result.hasError());
    EXPECT_EQ(result.error().code, 404);
    EXPECT_NE(result.error().message.find("Connector not found"), std::string::npos);
}

TEST_F(OAuthManagerTest, RegisterMultipleConnectors) {
    OAuthConfig githubConfig;
    githubConfig.clientId = "github_client";
    githubConfig.clientSecret = "github_secret";
    githubConfig.authUrl = "https://github.com/login/oauth/authorize";
    githubConfig.tokenUrl = "https://github.com/login/oauth/access_token";
    githubConfig.scopes = {"repo", "user"};
    githubConfig.redirectUri = "http://localhost:8080/callback";
    
    manager->registerConnector("github", githubConfig);
    
    // Test that all connectors work
    std::string gmailUrl = manager->generateAuthUrl("gmail", "user1", "state1");
    std::string slackUrl = manager->generateAuthUrl("slack", "user2", "state2");
    std::string githubUrl = manager->generateAuthUrl("github", "user3", "state3");
    
    EXPECT_FALSE(gmailUrl.empty());
    EXPECT_FALSE(slackUrl.empty());
    EXPECT_FALSE(githubUrl.empty());
    
    EXPECT_NE(gmailUrl.find("accounts.google.com"), std::string::npos);
    EXPECT_NE(slackUrl.find("slack.com"), std::string::npos);
    EXPECT_NE(githubUrl.find("github.com"), std::string::npos);
}

TEST_F(OAuthManagerTest, OverrideExistingConnector) {
    // Register a new config for gmail
    OAuthConfig newGmailConfig;
    newGmailConfig.clientId = "new_gmail_client";
    newGmailConfig.clientSecret = "new_gmail_secret";
    newGmailConfig.authUrl = "https://accounts.google.com/oauth/authorize";
    newGmailConfig.tokenUrl = "https://oauth2.googleapis.com/token";
    newGmailConfig.scopes = {"gmail.compose"};
    newGmailConfig.redirectUri = "http://localhost:9090/callback";
    
    manager->registerConnector("gmail", newGmailConfig);
    
    std::string authUrl = manager->generateAuthUrl("gmail", "user", "state");
    
    // Check that new config is used
    EXPECT_NE(authUrl.find("client_id=new_gmail_client"), std::string::npos);
}

TEST_F(OAuthManagerTest, TokenExpiration) {
    // Exchange code to get tokens
    std::string state = "expiry_test";
    manager->generateAuthUrl("gmail", "user@example.com", state);
    auto result = manager->exchangeCode("gmail", "auth_code", state);
    
    ASSERT_TRUE(result.hasValue());
    const auto& tokens = result.value();
    
    // Check that expiration is approximately 1 hour from now (as per mock implementation)
    auto now = std::chrono::system_clock::now();
    auto expectedExpiry = now + std::chrono::hours(1);
    
    auto diff = std::chrono::duration_cast<std::chrono::minutes>(
        tokens.expiresAt - expectedExpiry
    ).count();
    
    // Should be within a few minutes (accounting for test execution time)
    EXPECT_LT(std::abs(diff), 5);
}