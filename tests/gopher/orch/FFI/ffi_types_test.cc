/**
 * @file ffi_types_test.cc
 * @brief Unit tests for FFI type definitions and configuration structures
 *
 * Tests:
 * - Version macros
 * - Boolean constants
 * - Error code values
 * - Type ID values
 * - Channel type values
 * - Transport type values
 * - Configuration structures (RetryPolicy, CircuitBreaker, McpConfig, etc.)
 */

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI Type Tests
// =============================================================================

class FFITypesTest : public OrchTest {};

// =============================================================================
// Version and Constant Tests
// =============================================================================

TEST_F(FFITypesTest, VersionMacros) {
  EXPECT_GE(GOPHER_ORCH_VERSION_MAJOR, 1);
  EXPECT_GE(GOPHER_ORCH_VERSION_MINOR, 0);
  EXPECT_GE(GOPHER_ORCH_VERSION_PATCH, 0);
}

TEST_F(FFITypesTest, BooleanConstants) {
  EXPECT_EQ(GOPHER_ORCH_FALSE, 0);
  EXPECT_NE(GOPHER_ORCH_TRUE, 0);
}

TEST_F(FFITypesTest, ErrorCodeValues) {
  EXPECT_EQ(GOPHER_ORCH_OK, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_INVALID_HANDLE, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_INVALID_ARGUMENT, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_NULL_POINTER, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_NOT_FOUND, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_TIMEOUT, 0);
  EXPECT_LT(GOPHER_ORCH_ERROR_CANCELLED, 0);
}

TEST_F(FFITypesTest, TypeIdValues) {
  EXPECT_NE(GOPHER_ORCH_TYPE_DISPATCHER, GOPHER_ORCH_TYPE_RUNNABLE);
  EXPECT_NE(GOPHER_ORCH_TYPE_JSON, GOPHER_ORCH_TYPE_CONFIG);
  EXPECT_NE(GOPHER_ORCH_TYPE_FSM, GOPHER_ORCH_TYPE_GRAPH);
}

TEST_F(FFITypesTest, ChannelTypeValues) {
  EXPECT_EQ(GOPHER_ORCH_CHANNEL_LAST_VALUE, 0);
  EXPECT_EQ(GOPHER_ORCH_CHANNEL_APPEND_LIST, 1);
  EXPECT_EQ(GOPHER_ORCH_CHANNEL_MERGE_OBJECT, 2);
}

TEST_F(FFITypesTest, TransportTypeValues) {
  EXPECT_EQ(GOPHER_ORCH_TRANSPORT_STDIO, 0);
  EXPECT_EQ(GOPHER_ORCH_TRANSPORT_SSE, 1);
  EXPECT_EQ(GOPHER_ORCH_TRANSPORT_WEBSOCKET, 2);
}

// =============================================================================
// Configuration Structure Tests
// =============================================================================

TEST_F(FFITypesTest, RetryPolicyStructure) {
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

TEST_F(FFITypesTest, CircuitBreakerPolicyStructure) {
  gopher_orch_circuit_breaker_policy_t policy = {};
  policy.failure_threshold = 5;
  policy.recovery_timeout_ms = 30000;
  policy.half_open_max_calls = 1;

  EXPECT_EQ(policy.failure_threshold, 5);
  EXPECT_EQ(policy.recovery_timeout_ms, 30000);
  EXPECT_EQ(policy.half_open_max_calls, 1);
}

TEST_F(FFITypesTest, McpConfigStructure) {
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

TEST_F(FFITypesTest, TransactionOptsStructure) {
  gopher_orch_transaction_opts_t opts = {};
  opts.auto_rollback = GOPHER_ORCH_TRUE;
  opts.strict_ordering = GOPHER_ORCH_TRUE;
  opts.max_resources = 100;

  EXPECT_EQ(opts.auto_rollback, GOPHER_ORCH_TRUE);
  EXPECT_EQ(opts.strict_ordering, GOPHER_ORCH_TRUE);
  EXPECT_EQ(opts.max_resources, 100);
}
