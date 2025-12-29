/**
 * @file ffi_core_test.cc
 * @brief Unit tests for FFI core components
 *
 * Tests:
 * - DispatcherImpl (Creation, Post)
 * - ConfigImpl (Creation, WithTag)
 * - CancelTokenImpl (Creation, Cancel)
 */

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Core Tests
// =============================================================================

class FFICoreTest : public OrchTest {
 protected:
  void SetUp() override {
    OrchTest::SetUp();
    ErrorManager::ClearError();
  }

  void TearDown() override {
    ErrorManager::ClearError();
    OrchTest::TearDown();
  }
};

// =============================================================================
// DispatcherImpl Tests
// =============================================================================

TEST_F(FFICoreTest, DispatcherImplCreation) {
  auto* dispatcher = new DispatcherImpl();
  EXPECT_NE(dispatcher->dispatcher, nullptr);
  EXPECT_EQ(dispatcher->GetType(), GOPHER_ORCH_TYPE_DISPATCHER);
  dispatcher->Release();
}

TEST_F(FFICoreTest, DispatcherImplPost) {
  auto* dispatcher = new DispatcherImpl();
  std::atomic<bool> executed{false};

  dispatcher->dispatcher->post([&executed]() { executed.store(true); });
  dispatcher->dispatcher->run(mcp::event::RunType::NonBlock);

  EXPECT_TRUE(executed.load());
  dispatcher->Release();
}

// =============================================================================
// ConfigImpl Tests
// =============================================================================

TEST_F(FFICoreTest, ConfigImplCreation) {
  auto* config = new ConfigImpl();
  EXPECT_EQ(config->GetType(), GOPHER_ORCH_TYPE_CONFIG);
  config->Release();
}

TEST_F(FFICoreTest, ConfigImplWithTag) {
  auto* config = new ConfigImpl();
  config->config.withTag("key", "value");
  EXPECT_TRUE(config->config.tag("key").has_value());
  EXPECT_EQ(config->config.tag("key").value(), "value");
  config->Release();
}

// =============================================================================
// CancelTokenImpl Tests
// =============================================================================

TEST_F(FFICoreTest, CancelTokenImplCreation) {
  auto* token = new CancelTokenImpl();
  EXPECT_EQ(token->GetType(), GOPHER_ORCH_TYPE_CANCEL_TOKEN);
  EXPECT_FALSE(token->cancelled.load());
  token->Release();
}

TEST_F(FFICoreTest, CancelTokenImplCancel) {
  auto* token = new CancelTokenImpl();
  EXPECT_FALSE(token->cancelled.load());

  token->cancelled.store(true);
  EXPECT_TRUE(token->cancelled.load());

  token->Release();
}
