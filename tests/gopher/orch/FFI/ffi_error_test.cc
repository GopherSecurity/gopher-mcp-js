/**
 * @file ffi_error_test.cc
 * @brief Unit tests for FFI error handling
 *
 * Tests:
 * - ErrorManager SetAndGet
 * - ErrorManager Clear
 * - ErrorManager GetName
 * - Error scope pattern
 */

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Error Tests
// =============================================================================

class FFIErrorTest : public OrchTest {
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
// Error Manager Tests
// =============================================================================

TEST_F(FFIErrorTest, ErrorManagerSetAndGet) {
  ErrorManager::SetError(GOPHER_ORCH_ERROR_INVALID_ARGUMENT, "Test error",
                         "Detail info");

  auto* info = ErrorManager::GetLastError();
  ASSERT_NE(info, nullptr);
  EXPECT_EQ(info->code, GOPHER_ORCH_ERROR_INVALID_ARGUMENT);
  EXPECT_STREQ(info->message, "Test error");
  EXPECT_STREQ(info->details, "Detail info");
}

TEST_F(FFIErrorTest, ErrorManagerClear) {
  ErrorManager::SetError(GOPHER_ORCH_ERROR_TIMEOUT, "Error");
  EXPECT_NE(ErrorManager::GetLastError(), nullptr);

  ErrorManager::ClearError();
  EXPECT_EQ(ErrorManager::GetLastError(), nullptr);
}

TEST_F(FFIErrorTest, ErrorManagerGetName) {
  EXPECT_STREQ(ErrorManager::GetErrorName(GOPHER_ORCH_OK), "GOPHER_ORCH_OK");
  EXPECT_STREQ(ErrorManager::GetErrorName(GOPHER_ORCH_ERROR_TIMEOUT),
               "GOPHER_ORCH_ERROR_TIMEOUT");
  EXPECT_STREQ(ErrorManager::GetErrorName(GOPHER_ORCH_ERROR_CANCELLED),
               "GOPHER_ORCH_ERROR_CANCELLED");
  EXPECT_STREQ(ErrorManager::GetErrorName(GOPHER_ORCH_ERROR_INVALID_HANDLE),
               "GOPHER_ORCH_ERROR_INVALID_HANDLE");
  EXPECT_STREQ(
      ErrorManager::GetErrorName(static_cast<gopher_orch_error_t>(-9999)),
      "GOPHER_ORCH_ERROR_UNKNOWN");
}

// =============================================================================
// Error Scope Pattern Tests
// =============================================================================

TEST_F(FFIErrorTest, ErrorScopePattern) {
  /* Test the error scope pattern using ErrorManager directly */
  ErrorManager::SetError(GOPHER_ORCH_ERROR_TIMEOUT, "Pre-existing error");

  {
    /* Clear error on entry (what ErrorScope does) */
    ErrorManager::ClearError();

    /* Verify error is cleared */
    EXPECT_EQ(ErrorManager::GetLastError(), nullptr);

    /* Set a new error */
    ErrorManager::SetError(GOPHER_ORCH_ERROR_CANCELLED, "New error");

    /* Verify new error */
    auto* info = ErrorManager::GetLastError();
    ASSERT_NE(info, nullptr);
    EXPECT_EQ(info->code, GOPHER_ORCH_ERROR_CANCELLED);
    EXPECT_STREQ(info->message, "New error");
  }
}
