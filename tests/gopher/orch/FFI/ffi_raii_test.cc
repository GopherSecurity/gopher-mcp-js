/**
 * @file ffi_raii_test.cc
 * @brief Unit tests for FFI RAII utilities
 *
 * Tests:
 * - ResourceGuard (Basic, Release, Move, Reset, Swap)
 * - AllocationTransaction (Commit, Rollback, ExplicitRollback, Move)
 * - ScopedCleanup (Basic, Dismiss, Execute, Move)
 */

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_raii.h"
#include "gopher/orch/ffi/orch_ffi_types.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI RAII Tests
// =============================================================================

class FFIRaiiTest : public OrchTest {
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
// ResourceGuard Tests
// =============================================================================

TEST_F(FFIRaiiTest, ResourceGuardBasic) {
  static bool released = false;
  released = false;

  {
    ResourceGuard<void*> guard(reinterpret_cast<void*>(0x1234), [](void* ptr) {
      EXPECT_EQ(ptr, reinterpret_cast<void*>(0x1234));
      released = true;
    });

    EXPECT_TRUE(static_cast<bool>(guard));
    EXPECT_EQ(guard.get(), reinterpret_cast<void*>(0x1234));
  }

  EXPECT_TRUE(released);
}

TEST_F(FFIRaiiTest, ResourceGuardRelease) {
  static bool released = false;
  released = false;

  void* ptr = nullptr;
  {
    ResourceGuard<void*> guard(reinterpret_cast<void*>(0x5678),
                               [](void*) { released = true; });

    ptr = guard.release();
  }

  EXPECT_FALSE(released);
  EXPECT_EQ(ptr, reinterpret_cast<void*>(0x5678));
}

TEST_F(FFIRaiiTest, ResourceGuardMove) {
  static int release_count = 0;
  release_count = 0;

  {
    ResourceGuard<void*> guard1(reinterpret_cast<void*>(0xABCD),
                                [](void*) { release_count++; });

    ResourceGuard<void*> guard2 = std::move(guard1);

    EXPECT_FALSE(static_cast<bool>(guard1));
    EXPECT_TRUE(static_cast<bool>(guard2));
  }

  EXPECT_EQ(release_count, 1);
}

TEST_F(FFIRaiiTest, ResourceGuardReset) {
  static int release_count = 0;
  release_count = 0;

  ResourceGuard<void*> guard(reinterpret_cast<void*>(0x1111),
                             [](void*) { release_count++; });

  guard.reset(reinterpret_cast<void*>(0x2222));
  EXPECT_EQ(release_count, 1);
  EXPECT_EQ(guard.get(), reinterpret_cast<void*>(0x2222));

  guard.reset();
  EXPECT_EQ(release_count, 2);
  EXPECT_FALSE(static_cast<bool>(guard));
}

TEST_F(FFIRaiiTest, ResourceGuardSwap) {
  ResourceGuard<void*> guard1(reinterpret_cast<void*>(0x1111), [](void*) {});
  ResourceGuard<void*> guard2(reinterpret_cast<void*>(0x2222), [](void*) {});

  guard1.swap(guard2);

  EXPECT_EQ(guard1.get(), reinterpret_cast<void*>(0x2222));
  EXPECT_EQ(guard2.get(), reinterpret_cast<void*>(0x1111));
}

// =============================================================================
// AllocationTransaction Tests
// =============================================================================

TEST_F(FFIRaiiTest, AllocationTransactionCommit) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  {
    AllocationTransaction txn;
    txn.track(reinterpret_cast<void*>(1), [](void*) { cleanup_count++; });
    txn.track(reinterpret_cast<void*>(2), [](void*) { cleanup_count++; });

    EXPECT_EQ(txn.size(), 2);
    txn.commit();
    EXPECT_TRUE(txn.is_committed());
  }

  /* After commit, resources should NOT be cleaned up */
  EXPECT_EQ(cleanup_count, 0);
}

TEST_F(FFIRaiiTest, AllocationTransactionRollback) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  {
    AllocationTransaction txn;
    txn.track(reinterpret_cast<void*>(1), [](void*) { cleanup_count++; });
    txn.track(reinterpret_cast<void*>(2), [](void*) { cleanup_count++; });
    /* No commit - should rollback on destruction */
  }

  /* After rollback, all resources should be cleaned up */
  EXPECT_EQ(cleanup_count, 2);
}

TEST_F(FFIRaiiTest, AllocationTransactionExplicitRollback) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  AllocationTransaction txn;
  txn.track(reinterpret_cast<void*>(1), [](void*) { cleanup_count++; });
  txn.track(reinterpret_cast<void*>(2), [](void*) { cleanup_count++; });

  txn.rollback();
  EXPECT_EQ(cleanup_count, 2);
  EXPECT_EQ(txn.size(), 0);
  EXPECT_TRUE(
      txn.is_committed()); /* Marked as committed to prevent double cleanup */
}

TEST_F(FFIRaiiTest, AllocationTransactionMove) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  {
    AllocationTransaction txn1;
    txn1.track(reinterpret_cast<void*>(1), [](void*) { cleanup_count++; });

    AllocationTransaction txn2 = std::move(txn1);
    EXPECT_EQ(txn2.size(), 1);
    /* txn1 should not cleanup since ownership moved */
  }

  EXPECT_EQ(cleanup_count, 1); /* Only txn2 cleaned up */
}

// =============================================================================
// ScopedCleanup Tests
// =============================================================================

TEST_F(FFIRaiiTest, ScopedCleanupBasic) {
  static bool cleaned = false;
  cleaned = false;

  {
    ScopedCleanup cleanup([&]() { cleaned = true; });
  }

  EXPECT_TRUE(cleaned);
}

TEST_F(FFIRaiiTest, ScopedCleanupDismiss) {
  static bool cleaned = false;
  cleaned = false;

  {
    ScopedCleanup cleanup([&]() { cleaned = true; });
    cleanup.dismiss();
  }

  EXPECT_FALSE(cleaned);
}

TEST_F(FFIRaiiTest, ScopedCleanupExecute) {
  static bool cleaned = false;
  cleaned = false;

  {
    ScopedCleanup cleanup([&]() { cleaned = true; });
    cleanup.execute();
    EXPECT_TRUE(cleaned);
  }

  /* Should not execute twice */
  cleaned = false;
  /* Destructor runs but cleanup was already dismissed */
}

TEST_F(FFIRaiiTest, ScopedCleanupMove) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  {
    ScopedCleanup cleanup1([&]() { cleanup_count++; });
    ScopedCleanup cleanup2 = std::move(cleanup1);
    /* cleanup1 should not cleanup since ownership moved */
  }

  EXPECT_EQ(cleanup_count, 1);
}
