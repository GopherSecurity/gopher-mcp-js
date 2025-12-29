#pragma once

// Core types for gopher-orch framework
// Provides type aliases and common definitions used throughout the library

#include <functional>
#include <memory>
#include <new>  // Required for placement new in variant
#include <string>
#include <vector>

// Include our dispatcher abstraction
#include "gopher/orch/core/dispatcher.h"

// Use MCP core types for C++14 compatibility when available
#ifndef BUILD_WITHOUT_GOPHER_MCP
#include "mcp/core/optional.h"
#include "mcp/core/result.h"
#include "mcp/core/type_helpers.h"
#include "mcp/core/variant.h"
#include "mcp/json/json_bridge.h"
#include "mcp/types.h"
#else
// Minimal implementations when MCP is not available
#include "gopher/orch/core/minimal_types.h"
#endif

namespace gopher {
namespace orch {
namespace core {

#ifndef BUILD_WITHOUT_GOPHER_MCP
// Re-export MCP types into our namespace for convenience
using mcp::Error;
using mcp::make_optional;
using mcp::nullopt;
using mcp::optional;
using mcp::Result;

// JSON type alias - using MCP's JsonValue
using JsonValue = mcp::json::JsonValue;
#else
// Use minimal implementations when MCP is not available
// These would need to be implemented in minimal_types.h
#endif

// Result callback type - invoked when async operation completes
// All callbacks are invoked in dispatcher thread context
template <typename T>
using ResultCallback = std::function<void(Result<T>)>;

// Void result for operations that don't return a value
using VoidResult = Result<std::nullptr_t>;
using VoidCallback = ResultCallback<std::nullptr_t>;

// JSON-specific callback used for type-erased operations
using JsonCallback = ResultCallback<JsonValue>;

// Forward declarations
template <typename Input, typename Output>
class Runnable;

class RunnableConfig;

// Type-erased runnable that works with JSON values
// This is the primary interface used by composition patterns and FFI
using JsonRunnable = Runnable<JsonValue, JsonValue>;
using JsonRunnablePtr = std::shared_ptr<JsonRunnable>;

// Error codes specific to orchestration
// Using enum for C++14 compatibility (constexpr static members need out-of-line
// definition)
namespace OrchError {
enum : int {
  OK = 0,
  INVALID_ARGUMENT = -1,
  TOOL_NOT_FOUND = -2,
  CONNECTION_FAILED = -3,
  TIMEOUT = -4,
  CANCELLED = -5,
  GUARD_REJECTED = -6,
  INVALID_TRANSITION = -7,
  APPROVAL_DENIED = -8,
  CIRCUIT_OPEN = -9,
  FALLBACK_EXHAUSTED = -10,
  NOT_CONNECTED = -11,
  INTERNAL_ERROR = -99
};
}  // namespace OrchError

// Helper to create error results
template <typename T>
inline Result<T> makeOrchError(int code, const std::string& message) {
  return Result<T>(Error(code, message));
}

// Helper to create success results
// Uses decay to remove const/reference qualifiers for proper Result type
template <typename T>
inline Result<typename std::decay<T>::type> makeSuccess(T&& value) {
  return Result<typename std::decay<T>::type>(std::forward<T>(value));
}

// Helper to check if result is successful
template <typename T>
inline bool isSuccess(const Result<T>& result) {
  return result.hasValue();
}

// Helper to check if result is an error
template <typename T>
inline bool isError(const Result<T>& result) {
  return result.hasError();
}

// Helper to get value from result (undefined behavior if error)
template <typename T>
inline const T& getValue(const Result<T>& result) {
  return result.value();
}

// Helper to get error from result (undefined behavior if success)
template <typename T>
inline const Error& getError(const Result<T>& result) {
  return result.error();
}

}  // namespace core
}  // namespace orch
}  // namespace gopher
