/**
 * @file ffi_handle_test.cc
 * @brief Unit tests for FFI handle management
 *
 * Tests:
 * - Handle registry (Basic, InvalidHandle, Stats)
 * - Handle base (RefCounting)
 * - GuardImpl (Creation, WithCleanup, Release)
 */

#include "orch_test_fixture.h"

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Handle Tests
// =============================================================================

class FFIHandleTest : public OrchTest {
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
// Handle Registry Tests
// =============================================================================

TEST_F(FFIHandleTest, HandleRegistryBasic) {
  size_t initial_count = HandleRegistry::Instance().GetActiveCount();

  {
    /* Create a JsonImpl handle */
    auto* json = new JsonImpl(core::JsonValue::object());
    EXPECT_EQ(HandleRegistry::Instance().GetActiveCount(), initial_count + 1);
    EXPECT_TRUE(HandleRegistry::Instance().IsValid(json));

    json->Release();
  }

  EXPECT_EQ(HandleRegistry::Instance().GetActiveCount(), initial_count);
}

TEST_F(FFIHandleTest, HandleRegistryInvalidHandle) {
  EXPECT_FALSE(HandleRegistry::Instance().IsValid(nullptr));
  EXPECT_FALSE(
      HandleRegistry::Instance().IsValid(reinterpret_cast<void*>(0x1234)));
}

TEST_F(FFIHandleTest, HandleRegistryStats) {
  auto stats_before = HandleRegistry::Instance().GetStats();

  {
    auto* json = new JsonImpl(core::JsonValue::null());
    json->Release();
  }

  auto stats_after = HandleRegistry::Instance().GetStats();
  EXPECT_EQ(stats_after.total_created, stats_before.total_created + 1);
  EXPECT_EQ(stats_after.total_destroyed, stats_before.total_destroyed + 1);
}

// =============================================================================
// Handle Base Tests
// =============================================================================

TEST_F(FFIHandleTest, HandleBaseRefCounting) {
  auto* json = new JsonImpl(core::JsonValue::object());
  EXPECT_EQ(json->GetRefCount(), 1);
  EXPECT_EQ(json->GetType(), GOPHER_ORCH_TYPE_JSON);

  json->AddRef();
  EXPECT_EQ(json->GetRefCount(), 2);

  json->Release();
  EXPECT_EQ(json->GetRefCount(), 1);

  json->Release(); /* Should delete */
}

// =============================================================================
// GuardImpl Tests
// =============================================================================

TEST_F(FFIHandleTest, GuardImplCreation) {
  /* Test that GuardImpl is created with correct type */
  auto* guard = new GuardImpl(reinterpret_cast<void*>(0x1234),
                              GOPHER_ORCH_TYPE_JSON, nullptr);

  EXPECT_EQ(guard->GetType(), GOPHER_ORCH_TYPE_GUARD);
  EXPECT_EQ(guard->handle_, reinterpret_cast<void*>(0x1234));
  EXPECT_EQ(guard->type_, GOPHER_ORCH_TYPE_JSON);
  EXPECT_EQ(guard->cleanup_, nullptr);
  EXPECT_FALSE(guard->released_);

  /* Use HandleBase::Release to decrement refcount and delete */
  guard->HandleBase::Release();
}

TEST_F(FFIHandleTest, GuardImplWithCleanup) {
  /* Test cleanup function is called when guard is destroyed */
  static bool cleanup_called = false;
  static void* cleanup_ptr = nullptr;

  /* Use a struct to hold the state and provide a static function */
  struct CleanupState {
    static void cleanup(void* ptr) {
      cleanup_called = true;
      cleanup_ptr = ptr;
    }
  };

  cleanup_called = false;
  cleanup_ptr = nullptr;

  {
    auto* guard = new GuardImpl(reinterpret_cast<void*>(0x5678),
                                GOPHER_ORCH_TYPE_JSON, CleanupState::cleanup);

    EXPECT_EQ(guard->GetRefCount(), 1);
    /* Use HandleBase::Release to decrement refcount and trigger destructor */
    guard->HandleBase::Release();
  }

  EXPECT_TRUE(cleanup_called);
  EXPECT_EQ(cleanup_ptr, reinterpret_cast<void*>(0x5678));
}

/* Static for GuardImplRelease test */
static bool g_guard_release_cleanup_called = false;

static void guard_release_cleanup_fn(void*) {
  g_guard_release_cleanup_called = true;
}

TEST_F(FFIHandleTest, GuardImplRelease) {
  g_guard_release_cleanup_called = false;

  auto* guard = new GuardImpl(reinterpret_cast<void*>(0x5678),
                              GOPHER_ORCH_TYPE_UNKNOWN, guard_release_cleanup_fn);

  void* ptr = guard->Release();
  EXPECT_EQ(ptr, reinterpret_cast<void*>(0x5678));

  guard->HandleBase::Release();

  /* Cleanup should NOT be called since we released ownership */
  EXPECT_FALSE(g_guard_release_cleanup_called);
}
