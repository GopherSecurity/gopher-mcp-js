/**
 * @file ffi_builder_test.cc
 * @brief Unit tests for FFI builder components
 *
 * Tests:
 * - SequenceImpl (Creation)
 * - ParallelImpl (Creation)
 * - RouterImpl (Creation)
 * - TransactionImpl (Creation, AddAndCommit, Rollback)
 */

#include "orch_test_fixture.h"

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Builder Tests
// =============================================================================

class FFIBuilderTest : public OrchTest {
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
// SequenceImpl Tests
// =============================================================================

TEST_F(FFIBuilderTest, SequenceImplCreation) {
  auto* seq = new SequenceImpl();
  EXPECT_EQ(seq->GetType(), GOPHER_ORCH_TYPE_SEQUENCE);
  EXPECT_TRUE(seq->steps.empty());
  seq->Release();
}

// =============================================================================
// ParallelImpl Tests
// =============================================================================

TEST_F(FFIBuilderTest, ParallelImplCreation) {
  auto* parallel = new ParallelImpl();
  EXPECT_EQ(parallel->GetType(), GOPHER_ORCH_TYPE_PARALLEL);
  EXPECT_TRUE(parallel->branches.empty());
  parallel->Release();
}

// =============================================================================
// RouterImpl Tests
// =============================================================================

TEST_F(FFIBuilderTest, RouterImplCreation) {
  auto* router = new RouterImpl();
  EXPECT_EQ(router->GetType(), GOPHER_ORCH_TYPE_ROUTER);
  EXPECT_TRUE(router->routes.empty());
  EXPECT_EQ(router->default_route, nullptr);
  router->Release();
}

// =============================================================================
// TransactionImpl Tests
// =============================================================================

TEST_F(FFIBuilderTest, TransactionImplCreation) {
  auto* txn = new TransactionImpl(nullptr);
  EXPECT_EQ(txn->GetType(), GOPHER_ORCH_TYPE_TRANSACTION);
  EXPECT_EQ(txn->Size(), 0);
  txn->Release();
}

TEST_F(FFIBuilderTest, TransactionImplAddAndCommit) {
  auto* txn = new TransactionImpl(nullptr);
  auto* json = new JsonImpl(core::JsonValue::object());

  auto result = txn->Add(json, GOPHER_ORCH_TYPE_JSON);
  EXPECT_EQ(result, GOPHER_ORCH_OK);
  EXPECT_EQ(txn->Size(), 1);

  result = txn->Commit();
  EXPECT_EQ(result, GOPHER_ORCH_OK);

  /* After commit, json handle is still valid (ownership transferred) */
  json->Release();
  txn->Release();
}

TEST_F(FFIBuilderTest, TransactionImplRollback) {
  auto* txn = new TransactionImpl(nullptr);

  /* Track a handle - it will be cleaned up on rollback */
  size_t initial_count = HandleRegistry::Instance().GetActiveCount();
  auto* json = new JsonImpl(core::JsonValue::object());
  EXPECT_EQ(HandleRegistry::Instance().GetActiveCount(), initial_count + 1);

  txn->Add(json, GOPHER_ORCH_TYPE_JSON);
  txn->Rollback();

  /* After rollback, json should be released */
  EXPECT_EQ(HandleRegistry::Instance().GetActiveCount(), initial_count);

  txn->Release();
}
