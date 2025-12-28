/**
 * @file ffi_test.cc
 * @brief Unit tests for FFI layer internal components
 *
 * Tests the FFI bridge internals including:
 * - Type definitions and constants
 * - Handle base and registry
 * - Error manager
 * - RAII utilities (ResourceGuard, AllocationTransaction, ScopedCleanup)
 * - Bridge handle implementations
 *
 * Note: The C API functions (gopher_orch_*) require implementation.
 * These tests focus on the internal C++ components that are header-only.
 */

#include "orch_test_fixture.h"

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_raii.h"
#include "gopher/orch/ffi/orch_ffi_types.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Tests
// =============================================================================

class FFITest : public OrchTest {
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
// Type Definition Tests
// =============================================================================

TEST_F(FFITest, VersionMacros) {
  EXPECT_GE(GOPHER_ORCH_VERSION_MAJOR, 1);
  EXPECT_GE(GOPHER_ORCH_VERSION_MINOR, 0);
  EXPECT_GE(GOPHER_ORCH_VERSION_PATCH, 0);
}

TEST_F(FFITest, BooleanConstants) {
  EXPECT_EQ(GOPHER_ORCH_FALSE, 0);
  EXPECT_NE(GOPHER_ORCH_TRUE, 0);
}

TEST_F(FFITest, ErrorCodeValues) {
  EXPECT_EQ(GOPHER_ORCH_OK, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_INVALID_HANDLE, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_INVALID_ARGUMENT, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_NULL_POINTER, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_NOT_FOUND, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_TIMEOUT, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_CANCELLED, 0);
}

TEST_F(FFITest, TypeIdValues) {
  EXPECT_NE(GOPHER_ORCH_TYPE_DISPATCHER, GOPHER_ORCH_TYPE_RUNNABLE);
  EXPECT_NE(GOPHER_ORCH_TYPE_JSON, GOPHER_ORCH_TYPE_CONFIG);
  EXPECT_NE(GOPHER_ORCH_TYPE_FSM, GOPHER_ORCH_TYPE_GRAPH);
}

TEST_F(FFITest, ChannelTypeValues) {
  EXPECT_EQ(GOPHER_ORCH_CHANNEL_LAST_VALUE, 0);
  EXPECT_EQ(GOPHER_ORCH_CHANNEL_APPEND_LIST, 1);
  EXPECT_EQ(GOPHER_ORCH_CHANNEL_MERGE_OBJECT, 2);
}

TEST_F(FFITest, TransportTypeValues) {
  EXPECT_EQ(GOPHER_ORCH_TRANSPORT_STDIO, 0);
  EXPECT_EQ(GOPHER_ORCH_TRANSPORT_SSE, 1);
  EXPECT_EQ(GOPHER_ORCH_TRANSPORT_WEBSOCKET, 2);
}

// =============================================================================
// Error Manager Tests
// =============================================================================

TEST_F(FFITest, ErrorManagerSetAndGet) {
  ErrorManager::SetError(GOPHER_ORCH_ERROR_INVALID_ARGUMENT, "Test error",
                         "Detail info");

  auto* info = ErrorManager::GetLastError();
  ASSERT_NE(info, nullptr);
  EXPECT_EQ(info->code, GOPHER_ORCH_ERROR_INVALID_ARGUMENT);
  EXPECT_STREQ(info->message, "Test error");
  EXPECT_STREQ(info->details, "Detail info");
}

TEST_F(FFITest, ErrorManagerClear) {
  ErrorManager::SetError(GOPHER_ORCH_ERROR_TIMEOUT, "Error");
  EXPECT_NE(ErrorManager::GetLastError(), nullptr);

  ErrorManager::ClearError();
  EXPECT_EQ(ErrorManager::GetLastError(), nullptr);
}

TEST_F(FFITest, ErrorManagerGetName) {
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
// Handle Registry Tests
// =============================================================================

TEST_F(FFITest, HandleRegistryBasic) {
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

TEST_F(FFITest, HandleRegistryInvalidHandle) {
  EXPECT_FALSE(HandleRegistry::Instance().IsValid(nullptr));
  EXPECT_FALSE(
      HandleRegistry::Instance().IsValid(reinterpret_cast<void*>(0x1234)));
}

TEST_F(FFITest, HandleRegistryStats) {
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

TEST_F(FFITest, HandleBaseRefCounting) {
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
// JsonImpl Tests
// =============================================================================

TEST_F(FFITest, JsonImplNull) {
  auto* json = new JsonImpl(core::JsonValue::null());
  EXPECT_TRUE(json->value.isNull());
  json->Release();
}

TEST_F(FFITest, JsonImplObject) {
  auto* json = new JsonImpl(core::JsonValue::object());
  EXPECT_TRUE(json->value.isObject());
  json->value["key"] = core::JsonValue("value");
  EXPECT_EQ(json->value["key"].getString(), "value");
  json->Release();
}

TEST_F(FFITest, JsonImplArray) {
  auto* json = new JsonImpl(core::JsonValue::array());
  EXPECT_TRUE(json->value.isArray());
  json->value.push_back(core::JsonValue(1));
  json->value.push_back(core::JsonValue(2));
  EXPECT_EQ(json->value.size(), 2);
  json->Release();
}

// =============================================================================
// DispatcherImpl Tests
// =============================================================================

TEST_F(FFITest, DispatcherImplCreation) {
  auto* dispatcher = new DispatcherImpl();
  EXPECT_NE(dispatcher->dispatcher, nullptr);
  EXPECT_EQ(dispatcher->GetType(), GOPHER_ORCH_TYPE_DISPATCHER);
  dispatcher->Release();
}

TEST_F(FFITest, DispatcherImplPost) {
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

TEST_F(FFITest, ConfigImplCreation) {
  auto* config = new ConfigImpl();
  EXPECT_EQ(config->GetType(), GOPHER_ORCH_TYPE_CONFIG);
  config->Release();
}

TEST_F(FFITest, ConfigImplWithTag) {
  auto* config = new ConfigImpl();
  config->config.withTag("key", "value");
  EXPECT_TRUE(config->config.tag("key").has_value());
  EXPECT_EQ(config->config.tag("key").value(), "value");
  config->Release();
}

// =============================================================================
// CancelTokenImpl Tests
// =============================================================================

TEST_F(FFITest, CancelTokenImplCreation) {
  auto* token = new CancelTokenImpl();
  EXPECT_EQ(token->GetType(), GOPHER_ORCH_TYPE_CANCEL_TOKEN);
  EXPECT_FALSE(token->cancelled.load());
  token->Release();
}

TEST_F(FFITest, CancelTokenImplCancel) {
  auto* token = new CancelTokenImpl();
  EXPECT_FALSE(token->cancelled.load());

  token->cancelled.store(true);
  EXPECT_TRUE(token->cancelled.load());

  token->Release();
}

// =============================================================================
// SequenceImpl Tests
// =============================================================================

TEST_F(FFITest, SequenceImplCreation) {
  auto* seq = new SequenceImpl();
  EXPECT_EQ(seq->GetType(), GOPHER_ORCH_TYPE_SEQUENCE);
  EXPECT_TRUE(seq->steps.empty());
  seq->Release();
}

// =============================================================================
// ParallelImpl Tests
// =============================================================================

TEST_F(FFITest, ParallelImplCreation) {
  auto* parallel = new ParallelImpl();
  EXPECT_EQ(parallel->GetType(), GOPHER_ORCH_TYPE_PARALLEL);
  EXPECT_TRUE(parallel->branches.empty());
  parallel->Release();
}

// =============================================================================
// RouterImpl Tests
// =============================================================================

TEST_F(FFITest, RouterImplCreation) {
  auto* router = new RouterImpl();
  EXPECT_EQ(router->GetType(), GOPHER_ORCH_TYPE_ROUTER);
  EXPECT_TRUE(router->routes.empty());
  EXPECT_EQ(router->default_route, nullptr);
  router->Release();
}

// =============================================================================
// TransactionImpl Tests
// =============================================================================

TEST_F(FFITest, TransactionImplCreation) {
  auto* txn = new TransactionImpl(nullptr);
  EXPECT_EQ(txn->GetType(), GOPHER_ORCH_TYPE_TRANSACTION);
  EXPECT_EQ(txn->Size(), 0);
  txn->Release();
}

TEST_F(FFITest, TransactionImplAddAndCommit) {
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

TEST_F(FFITest, TransactionImplRollback) {
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

// =============================================================================
// GuardImpl Tests
// =============================================================================

TEST_F(FFITest, GuardImplCreation) {
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

TEST_F(FFITest, GuardImplWithCleanup) {
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
                                GOPHER_ORCH_TYPE_JSON,
                                CleanupState::cleanup);

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

TEST_F(FFITest, GuardImplRelease) {
  g_guard_release_cleanup_called = false;

  auto* guard = new GuardImpl(reinterpret_cast<void*>(0x5678),
                              GOPHER_ORCH_TYPE_UNKNOWN,
                              guard_release_cleanup_fn);

  void* ptr = guard->Release();
  EXPECT_EQ(ptr, reinterpret_cast<void*>(0x5678));

  guard->HandleBase::Release();

  /* Cleanup should NOT be called since we released ownership */
  EXPECT_FALSE(g_guard_release_cleanup_called);
}

// =============================================================================
// RAII Utility Tests - ResourceGuard
// =============================================================================

TEST_F(FFITest, ResourceGuardBasic) {
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

TEST_F(FFITest, ResourceGuardRelease) {
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

TEST_F(FFITest, ResourceGuardMove) {
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

TEST_F(FFITest, ResourceGuardReset) {
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

TEST_F(FFITest, ResourceGuardSwap) {
  ResourceGuard<void*> guard1(reinterpret_cast<void*>(0x1111),
                              [](void*) {});
  ResourceGuard<void*> guard2(reinterpret_cast<void*>(0x2222),
                              [](void*) {});

  guard1.swap(guard2);

  EXPECT_EQ(guard1.get(), reinterpret_cast<void*>(0x2222));
  EXPECT_EQ(guard2.get(), reinterpret_cast<void*>(0x1111));
}

// =============================================================================
// RAII Utility Tests - AllocationTransaction
// =============================================================================

TEST_F(FFITest, AllocationTransactionCommit) {
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

TEST_F(FFITest, AllocationTransactionRollback) {
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

TEST_F(FFITest, AllocationTransactionExplicitRollback) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  AllocationTransaction txn;
  txn.track(reinterpret_cast<void*>(1), [](void*) { cleanup_count++; });
  txn.track(reinterpret_cast<void*>(2), [](void*) { cleanup_count++; });

  txn.rollback();
  EXPECT_EQ(cleanup_count, 2);
  EXPECT_EQ(txn.size(), 0);
  EXPECT_TRUE(txn.is_committed()); /* Marked as committed to prevent double cleanup */
}

TEST_F(FFITest, AllocationTransactionMove) {
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
// RAII Utility Tests - ScopedCleanup
// =============================================================================

TEST_F(FFITest, ScopedCleanupBasic) {
  static bool cleaned = false;
  cleaned = false;

  { ScopedCleanup cleanup([&]() { cleaned = true; }); }

  EXPECT_TRUE(cleaned);
}

TEST_F(FFITest, ScopedCleanupDismiss) {
  static bool cleaned = false;
  cleaned = false;

  {
    ScopedCleanup cleanup([&]() { cleaned = true; });
    cleanup.dismiss();
  }

  EXPECT_FALSE(cleaned);
}

TEST_F(FFITest, ScopedCleanupExecute) {
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

TEST_F(FFITest, ScopedCleanupMove) {
  static int cleanup_count = 0;
  cleanup_count = 0;

  {
    ScopedCleanup cleanup1([&]() { cleanup_count++; });
    ScopedCleanup cleanup2 = std::move(cleanup1);
    /* cleanup1 should not cleanup since ownership moved */
  }

  EXPECT_EQ(cleanup_count, 1);
}

// =============================================================================
// Error Scope Pattern Tests (using ErrorManager directly)
// =============================================================================

TEST_F(FFITest, ErrorScopePattern) {
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

// =============================================================================
// LambdaRunnable Tests
// =============================================================================

TEST_F(FFITest, LambdaRunnableCreation) {
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

TEST_F(FFITest, LambdaRunnableWithContext) {
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

TEST_F(FFITest, LambdaRunnableDestructor) {
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
// Configuration Structure Tests
// =============================================================================

TEST_F(FFITest, RetryPolicyStructure) {
  gopher_orch_retry_policy_t policy = {};
  policy.max_attempts = 3;
  policy.initial_delay_ms = 100;
  policy.backoff_multiplier = 2.0;
  policy.max_delay_ms = 1000;
  policy.jitter = GOPHER_ORCH_TRUE;

  EXPECT_EQ(policy.max_attempts, 3);
  EXPECT_EQ(policy.initial_delay_ms, 100);
  EXPECT_DOUBLE_EQ(policy.backoff_multiplier, 2.0);
  EXPECT_EQ(policy.max_delay_ms, 1000);
  EXPECT_EQ(policy.jitter, GOPHER_ORCH_TRUE);
}

TEST_F(FFITest, CircuitBreakerPolicyStructure) {
  gopher_orch_circuit_breaker_policy_t policy = {};
  policy.failure_threshold = 5;
  policy.recovery_timeout_ms = 30000;
  policy.half_open_max_calls = 1;

  EXPECT_EQ(policy.failure_threshold, 5);
  EXPECT_EQ(policy.recovery_timeout_ms, 30000);
  EXPECT_EQ(policy.half_open_max_calls, 1);
}

TEST_F(FFITest, McpConfigStructure) {
  gopher_orch_mcp_config_t config = {};

  config.name = "test-server";
  config.transport = GOPHER_ORCH_TRANSPORT_STDIO;
  config.command = "/usr/bin/echo";
  config.connect_timeout_ms = 5000;
  config.request_timeout_ms = 30000;

  EXPECT_STREQ(config.name, "test-server");
  EXPECT_EQ(config.transport, GOPHER_ORCH_TRANSPORT_STDIO);
  EXPECT_STREQ(config.command, "/usr/bin/echo");
  EXPECT_EQ(config.connect_timeout_ms, 5000);
  EXPECT_EQ(config.request_timeout_ms, 30000);
}

TEST_F(FFITest, TransactionOptsStructure) {
  gopher_orch_transaction_opts_t opts = {};
  opts.auto_rollback = GOPHER_ORCH_TRUE;
  opts.strict_ordering = GOPHER_ORCH_TRUE;
  opts.max_resources = 100;

  EXPECT_EQ(opts.auto_rollback, GOPHER_ORCH_TRUE);
  EXPECT_EQ(opts.strict_ordering, GOPHER_ORCH_TRUE);
  EXPECT_EQ(opts.max_resources, 100);
}

// =============================================================================
// CallbackManager Handle Tests
// =============================================================================

TEST_F(FFITest, CallbackManagerImplCreation) {
  auto* manager = new CallbackManagerImpl();
  EXPECT_EQ(manager->GetType(), GOPHER_ORCH_TYPE_CALLBACK_MANAGER);
  EXPECT_NE(manager->manager, nullptr);
  manager->Release();
}

// =============================================================================
// ApprovalHandler Handle Tests
// =============================================================================

TEST_F(FFITest, ApprovalHandlerImplCreation) {
  auto handler = std::make_shared<human::AutoApprovalHandler>("Test approval");
  auto* impl = new ApprovalHandlerImpl(handler);
  EXPECT_EQ(impl->GetType(), GOPHER_ORCH_TYPE_APPROVAL_HANDLER);
  EXPECT_NE(impl->handler, nullptr);
  impl->Release();
}

// =============================================================================
// Iterator Handle Tests
// =============================================================================

TEST_F(FFITest, IteratorImplObjectIteration) {
  auto* json = new JsonImpl(core::JsonValue::object());
  json->value["a"] = core::JsonValue(1);
  json->value["b"] = core::JsonValue(2);

  auto* iter =
      new IteratorImpl(reinterpret_cast<gopher_orch_json_t>(json));
  EXPECT_EQ(iter->GetType(), GOPHER_ORCH_TYPE_ITERATOR);
  EXPECT_TRUE(iter->is_object_);
  EXPECT_EQ(iter->object_keys_.size(), 2);

  iter->Release();
  json->Release();
}

TEST_F(FFITest, IteratorImplArrayIteration) {
  auto* json = new JsonImpl(core::JsonValue::array());
  json->value.push_back(core::JsonValue(1));
  json->value.push_back(core::JsonValue(2));
  json->value.push_back(core::JsonValue(3));

  auto* iter =
      new IteratorImpl(reinterpret_cast<gopher_orch_json_t>(json));
  EXPECT_FALSE(iter->is_object_);
  EXPECT_EQ(iter->array_size_, 3);

  iter->Release();
  json->Release();
}
