/**
 * @file ffi_lambda_test.cc
 * @brief Unit tests for FFI lambda and callback components
 *
 * Tests:
 * - LambdaRunnable (Creation, WithContext, Destructor)
 * - CallbackManagerImpl (Creation)
 * - ApprovalHandlerImpl (Creation)
 */

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Lambda Tests
// =============================================================================

class FFILambdaTest : public OrchTest {
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
// LambdaRunnable Tests
// =============================================================================

TEST_F(FFILambdaTest, LambdaRunnableCreation) {
  auto runnable = std::make_shared<LambdaRunnable>(
      [](void*, gopher_orch_json_t input,
         gopher_orch_error_t* out_error) -> gopher_orch_json_t {
        (void)input;
        *out_error = GOPHER_ORCH_OK;
        return reinterpret_cast<gopher_orch_json_t>(
            new JsonImpl(core::JsonValue(42)));
      },
      nullptr, nullptr, "TestLambda");

  EXPECT_EQ(runnable->name(), "TestLambda");
}

TEST_F(FFILambdaTest, LambdaRunnableWithContext) {
  int context_value = 100;

  auto runnable = std::make_shared<LambdaRunnable>(
      [](void* ctx, gopher_orch_json_t,
         gopher_orch_error_t* out_error) -> gopher_orch_json_t {
        int* value = static_cast<int*>(ctx);
        *out_error = GOPHER_ORCH_OK;
        return reinterpret_cast<gopher_orch_json_t>(
            new JsonImpl(core::JsonValue(*value)));
      },
      &context_value, nullptr, "ContextLambda");

  EXPECT_EQ(runnable->name(), "ContextLambda");
}

TEST_F(FFILambdaTest, LambdaRunnableDestructor) {
  static bool destructor_called = false;
  destructor_called = false;

  {
    auto runnable = std::make_shared<LambdaRunnable>(
        [](void*, gopher_orch_json_t,
           gopher_orch_error_t* out_error) -> gopher_orch_json_t {
          *out_error = GOPHER_ORCH_OK;
          return reinterpret_cast<gopher_orch_json_t>(
              new JsonImpl(core::JsonValue::null()));
        },
        reinterpret_cast<void*>(0x1234),
        [](void* ctx) {
          EXPECT_EQ(ctx, reinterpret_cast<void*>(0x1234));
          destructor_called = true;
        },
        "DestructorLambda");
  }

  EXPECT_TRUE(destructor_called);
}

// =============================================================================
// CallbackManagerImpl Tests
// =============================================================================

TEST_F(FFILambdaTest, CallbackManagerImplCreation) {
  auto* manager = new CallbackManagerImpl();
  EXPECT_EQ(manager->GetType(), GOPHER_ORCH_TYPE_CALLBACK_MANAGER);
  EXPECT_NE(manager->manager, nullptr);
  manager->Release();
}

// =============================================================================
// ApprovalHandlerImpl Tests
// =============================================================================

TEST_F(FFILambdaTest, ApprovalHandlerImplCreation) {
  auto handler = std::make_shared<human::AutoApprovalHandler>("Test approval");
  auto* impl = new ApprovalHandlerImpl(handler);
  EXPECT_EQ(impl->GetType(), GOPHER_ORCH_TYPE_APPROVAL_HANDLER);
  EXPECT_NE(impl->handler, nullptr);
  impl->Release();
}
