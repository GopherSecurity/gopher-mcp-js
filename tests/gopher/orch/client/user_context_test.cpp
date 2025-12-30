#include <gtest/gtest.h>
#include "gopher/orch/client/user_context.h"
#include "gopher/orch/client/connected_account.h"

using namespace gopher::orch::client;
using namespace gopher::orch::core;

class UserContextTest : public ::testing::Test {
protected:
    void SetUp() override {
        userContext = std::make_unique<UserContext>("user@example.com");
        
        // Create some test accounts
        OAuthTokens tokens1;
        tokens1.accessToken = "access_token_1";
        tokens1.refreshToken = "refresh_token_1";
        tokens1.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(1);
        
        account1 = std::make_shared<ConnectedAccount>(
            "account_1",
            "user@example.com",
            "gmail",
            tokens1
        );
        
        OAuthTokens tokens2;
        tokens2.accessToken = "access_token_2";
        tokens2.refreshToken = "refresh_token_2";
        tokens2.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(2);
        
        account2 = std::make_shared<ConnectedAccount>(
            "account_2",
            "user@example.com",
            "slack",
            tokens2
        );
    }
    
    std::unique_ptr<UserContext> userContext;
    ConnectedAccountPtr account1;
    ConnectedAccountPtr account2;
};

TEST_F(UserContextTest, GetUserId) {
    EXPECT_EQ(userContext->userId(), "user@example.com");
}

TEST_F(UserContextTest, InitiallyNoConnectedAccounts) {
    auto accounts = userContext->getConnectedAccounts();
    EXPECT_TRUE(accounts.empty());
}

TEST_F(UserContextTest, AddConnectedAccount) {
    userContext->addConnectedAccount(account1);
    
    auto accounts = userContext->getConnectedAccounts();
    ASSERT_EQ(accounts.size(), 1);
    EXPECT_EQ(accounts[0]->id(), "account_1");
    EXPECT_EQ(accounts[0]->connectorId(), "gmail");
}

TEST_F(UserContextTest, AddMultipleConnectedAccounts) {
    userContext->addConnectedAccount(account1);
    userContext->addConnectedAccount(account2);
    
    auto accounts = userContext->getConnectedAccounts();
    ASSERT_EQ(accounts.size(), 2);
    
    // Find accounts in the list (order not guaranteed)
    bool foundAccount1 = false;
    bool foundAccount2 = false;
    
    for (const auto& account : accounts) {
        if (account->id() == "account_1") {
            foundAccount1 = true;
            EXPECT_EQ(account->connectorId(), "gmail");
        } else if (account->id() == "account_2") {
            foundAccount2 = true;
            EXPECT_EQ(account->connectorId(), "slack");
        }
    }
    
    EXPECT_TRUE(foundAccount1);
    EXPECT_TRUE(foundAccount2);
}

TEST_F(UserContextTest, GetConnectedAccountByConnectorId) {
    userContext->addConnectedAccount(account1);
    userContext->addConnectedAccount(account2);
    
    auto gmailAccount = userContext->getConnectedAccount("gmail");
    ASSERT_TRUE(gmailAccount.hasValue());
    EXPECT_EQ(gmailAccount.value()->id(), "account_1");
    
    auto slackAccount = userContext->getConnectedAccount("slack");
    ASSERT_TRUE(slackAccount.hasValue());
    EXPECT_EQ(slackAccount.value()->id(), "account_2");
}

TEST_F(UserContextTest, GetNonExistentConnectedAccount) {
    userContext->addConnectedAccount(account1);
    
    auto githubAccount = userContext->getConnectedAccount("github");
    EXPECT_FALSE(githubAccount.hasValue());
}

TEST_F(UserContextTest, ReplaceConnectedAccountForSameConnector) {
    userContext->addConnectedAccount(account1);
    
    // Create a new account for the same connector
    OAuthTokens newTokens;
    newTokens.accessToken = "new_access_token";
    newTokens.refreshToken = "new_refresh_token";
    newTokens.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(3);
    
    auto newGmailAccount = std::make_shared<ConnectedAccount>(
        "account_3",
        "user@example.com",
        "gmail",
        newTokens
    );
    
    userContext->addConnectedAccount(newGmailAccount);
    
    // Should still have only one gmail account
    auto accounts = userContext->getConnectedAccounts();
    ASSERT_EQ(accounts.size(), 1);
    
    // Should be the new account
    auto gmailAccount = userContext->getConnectedAccount("gmail");
    ASSERT_TRUE(gmailAccount.hasValue());
    EXPECT_EQ(gmailAccount.value()->id(), "account_3");
}

TEST_F(UserContextTest, UserIsolation) {
    // Create another user context
    UserContext otherUser("other@example.com");
    
    // Add accounts to first user
    userContext->addConnectedAccount(account1);
    userContext->addConnectedAccount(account2);
    
    // Other user should have no accounts
    EXPECT_TRUE(otherUser.getConnectedAccounts().empty());
    
    // Add different account to other user
    OAuthTokens otherTokens;
    otherTokens.accessToken = "other_access_token";
    otherTokens.refreshToken = "other_refresh_token";
    otherTokens.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(1);
    
    auto otherAccount = std::make_shared<ConnectedAccount>(
        "other_account",
        "other@example.com",
        "gmail",
        otherTokens
    );
    
    otherUser.addConnectedAccount(otherAccount);
    
    // Check isolation
    EXPECT_EQ(userContext->getConnectedAccounts().size(), 2);
    EXPECT_EQ(otherUser.getConnectedAccounts().size(), 1);
    
    auto firstUserGmail = userContext->getConnectedAccount("gmail");
    auto otherUserGmail = otherUser.getConnectedAccount("gmail");
    
    ASSERT_TRUE(firstUserGmail.hasValue());
    ASSERT_TRUE(otherUserGmail.hasValue());
    
    // Should be different accounts
    EXPECT_NE(firstUserGmail.value()->id(), otherUserGmail.value()->id());
    EXPECT_EQ(firstUserGmail.value()->userId(), "user@example.com");
    EXPECT_EQ(otherUserGmail.value()->userId(), "other@example.com");
}

// Test ConnectedAccount functionality
class ConnectedAccountTest : public ::testing::Test {
protected:
    void SetUp() override {
        validTokens.accessToken = "valid_access_token";
        validTokens.refreshToken = "valid_refresh_token";
        validTokens.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(1);
        
        expiredTokens.accessToken = "expired_access_token";
        expiredTokens.refreshToken = "expired_refresh_token";
        expiredTokens.expiresAt = std::chrono::system_clock::now() - std::chrono::hours(1);
        
        oauthManager = std::make_unique<OAuthManager>();
        
        // Register gmail connector
        OAuthConfig config;
        config.clientId = "test_client";
        config.clientSecret = "test_secret";
        config.authUrl = "https://accounts.google.com/oauth/authorize";
        config.tokenUrl = "https://oauth2.googleapis.com/token";
        config.scopes = {"gmail.send"};
        config.redirectUri = "http://localhost:8080/callback";
        
        oauthManager->registerConnector("gmail", config);
    }
    
    OAuthTokens validTokens;
    OAuthTokens expiredTokens;
    std::unique_ptr<OAuthManager> oauthManager;
};

TEST_F(ConnectedAccountTest, AccountProperties) {
    ConnectedAccount account("acc_123", "user@example.com", "gmail", validTokens);
    
    EXPECT_EQ(account.id(), "acc_123");
    EXPECT_EQ(account.userId(), "user@example.com");
    EXPECT_EQ(account.connectorId(), "gmail");
}

TEST_F(ConnectedAccountTest, ValidTokenCheck) {
    ConnectedAccount validAccount("acc_1", "user@example.com", "gmail", validTokens);
    EXPECT_TRUE(validAccount.isValid());
    
    ConnectedAccount expiredAccount("acc_2", "user@example.com", "gmail", expiredTokens);
    EXPECT_FALSE(expiredAccount.isValid());
}

TEST_F(ConnectedAccountTest, GetAccessTokenWhenValid) {
    ConnectedAccount account("acc_1", "user@example.com", "gmail", validTokens);
    
    auto result = account.getAccessToken(*oauthManager);
    
    ASSERT_TRUE(result.hasValue());
    EXPECT_EQ(result.value(), "valid_access_token");
}

TEST_F(ConnectedAccountTest, GetAccessTokenWhenExpired) {
    ConnectedAccount account("acc_1", "user@example.com", "gmail", expiredTokens);
    
    auto result = account.getAccessToken(*oauthManager);
    
    ASSERT_TRUE(result.hasValue());
    // Should get a refreshed token
    EXPECT_NE(result.value(), "expired_access_token");
    EXPECT_NE(result.value().find("mock_refreshed_token_"), std::string::npos);
    
    // Account should now be valid
    EXPECT_TRUE(account.isValid());
}