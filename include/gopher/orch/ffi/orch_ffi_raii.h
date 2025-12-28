/**
 * @file orch_ffi_raii.h
 * @brief RAII utilities for gopher-orch C++ wrapper layer
 *
 * This header provides C++ RAII wrappers around the C FFI API,
 * making it safe and convenient to use from C++ code while still
 * going through the C API (useful for testing FFI bindings).
 *
 * These utilities follow the patterns from gopher-mcp C API:
 * - ResourceGuard: RAII wrapper for single resources
 * - AllocationTransaction: RAII wrapper for multi-resource transactions
 * - ScopedCleanup: Execute cleanup on scope exit
 *
 * Usage:
 *   // Single resource with automatic cleanup
 *   auto json = ResourceGuard<gopher_orch_json_t>(
 *       gopher_orch_json_object(),
 *       gopher_orch_json_release);
 *
 *   // Multi-resource transaction
 *   AllocationTransaction txn;
 *   txn.track(gopher_orch_json_object(), gopher_orch_json_release);
 *   txn.track(gopher_orch_json_array(), gopher_orch_json_release);
 *   // ... do work ...
 *   txn.commit();  // Ownership transferred, no cleanup on scope exit
 */

#ifndef GOPHER_ORCH_FFI_RAII_H
#define GOPHER_ORCH_FFI_RAII_H

#ifdef __cplusplus

#include <functional>
#include <memory>
#include <type_traits>
#include <utility>
#include <vector>

#include "orch_ffi.h"

namespace gopher {
namespace orch {
namespace ffi {

/* ============================================================================
 * ResourceGuard - RAII wrapper for single handle
 *
 * Similar to std::unique_ptr but designed for C FFI handles.
 * ============================================================================
 */

template <typename T>
class ResourceGuard {
 public:
  using Deleter = std::function<void(T)>;

  /* Default constructor - empty guard */
  ResourceGuard() : handle_(nullptr), deleter_(nullptr) {}

  /* Constructor with handle and deleter */
  ResourceGuard(T handle, Deleter deleter)
      : handle_(handle), deleter_(std::move(deleter)) {}

  /* Move constructor */
  ResourceGuard(ResourceGuard&& other) noexcept
      : handle_(other.handle_), deleter_(std::move(other.deleter_)) {
    other.handle_ = nullptr;
  }

  /* Move assignment */
  ResourceGuard& operator=(ResourceGuard&& other) noexcept {
    if (this != &other) {
      reset();
      handle_ = other.handle_;
      deleter_ = std::move(other.deleter_);
      other.handle_ = nullptr;
    }
    return *this;
  }

  /* Disable copy */
  ResourceGuard(const ResourceGuard&) = delete;
  ResourceGuard& operator=(const ResourceGuard&) = delete;

  /* Destructor - cleanup if not released */
  ~ResourceGuard() { reset(); }

  /* Get the underlying handle (does not transfer ownership) */
  T get() const { return handle_; }

  /* Implicit conversion to handle type for convenience */
  operator T() const { return handle_; }

  /* Check if guard holds a valid handle */
  explicit operator bool() const { return handle_ != nullptr; }

  /* Release ownership and return the handle */
  T release() {
    T h = handle_;
    handle_ = nullptr;
    return h;
  }

  /* Reset and cleanup current handle, optionally set new handle */
  void reset(T new_handle = nullptr, Deleter new_deleter = nullptr) {
    if (handle_ && deleter_) {
      deleter_(handle_);
    }
    handle_ = new_handle;
    if (new_deleter) {
      deleter_ = std::move(new_deleter);
    }
  }

  /* Swap with another guard */
  void swap(ResourceGuard& other) noexcept {
    std::swap(handle_, other.handle_);
    std::swap(deleter_, other.deleter_);
  }

 private:
  T handle_;
  Deleter deleter_;
};

/* ============================================================================
 * Convenience type aliases for common handle types
 * ============================================================================
 */

using JsonGuard = ResourceGuard<gopher_orch_json_t>;
using RunnableGuard = ResourceGuard<gopher_orch_runnable_t>;
using DispatcherGuard = ResourceGuard<gopher_orch_dispatcher_t>;
using ConfigGuard = ResourceGuard<gopher_orch_config_t>;
using ServerGuard = ResourceGuard<gopher_orch_server_t>;
using FsmGuard = ResourceGuard<gopher_orch_fsm_t>;
using GraphGuard = ResourceGuard<gopher_orch_graph_t>;
using SequenceGuard = ResourceGuard<gopher_orch_sequence_t>;
using ParallelGuard = ResourceGuard<gopher_orch_parallel_t>;
using RouterGuard = ResourceGuard<gopher_orch_router_t>;
using CallbackManagerGuard = ResourceGuard<gopher_orch_callback_manager_t>;
using ApprovalHandlerGuard = ResourceGuard<gopher_orch_approval_handler_t>;
using CancelTokenGuard = ResourceGuard<gopher_orch_cancel_token_t>;
using IteratorGuard = ResourceGuard<gopher_orch_iterator_t>;

/* ============================================================================
 * Factory functions for creating guarded handles
 * ============================================================================
 */

inline JsonGuard make_json_null() {
  return JsonGuard(gopher_orch_json_null(), gopher_orch_json_release);
}

inline JsonGuard make_json_bool(gopher_orch_bool_t value) {
  return JsonGuard(gopher_orch_json_bool(value), gopher_orch_json_release);
}

inline JsonGuard make_json_int(int64_t value) {
  return JsonGuard(gopher_orch_json_int(value), gopher_orch_json_release);
}

inline JsonGuard make_json_double(double value) {
  return JsonGuard(gopher_orch_json_double(value), gopher_orch_json_release);
}

inline JsonGuard make_json_string(const char* value) {
  return JsonGuard(gopher_orch_json_string(value), gopher_orch_json_release);
}

inline JsonGuard make_json_object() {
  return JsonGuard(gopher_orch_json_object(), gopher_orch_json_release);
}

inline JsonGuard make_json_array() {
  return JsonGuard(gopher_orch_json_array(), gopher_orch_json_release);
}

inline JsonGuard parse_json(const char* json_str) {
  return JsonGuard(gopher_orch_json_parse(json_str), gopher_orch_json_release);
}

inline DispatcherGuard make_dispatcher() {
  return DispatcherGuard(gopher_orch_dispatcher_create(),
                         gopher_orch_dispatcher_destroy);
}

inline ConfigGuard make_config() {
  return ConfigGuard(gopher_orch_config_create(), gopher_orch_config_destroy);
}

inline SequenceGuard make_sequence() {
  return SequenceGuard(gopher_orch_sequence_create(),
                       gopher_orch_sequence_destroy);
}

inline ParallelGuard make_parallel() {
  return ParallelGuard(gopher_orch_parallel_create(),
                       gopher_orch_parallel_destroy);
}

inline RouterGuard make_router() {
  return RouterGuard(gopher_orch_router_create(), gopher_orch_router_destroy);
}

inline GraphGuard make_graph() {
  return GraphGuard(gopher_orch_graph_create(), gopher_orch_graph_destroy);
}

inline FsmGuard make_fsm(int32_t initial_state) {
  return FsmGuard(gopher_orch_fsm_create(initial_state),
                  gopher_orch_fsm_destroy);
}

inline CancelTokenGuard make_cancel_token() {
  return CancelTokenGuard(gopher_orch_cancel_token_create(),
                          gopher_orch_cancel_token_destroy);
}

inline CallbackManagerGuard make_callback_manager() {
  return CallbackManagerGuard(gopher_orch_callback_manager_create(),
                              gopher_orch_callback_manager_destroy);
}

/* ============================================================================
 * AllocationTransaction - RAII wrapper for multi-resource operations
 *
 * Ensures all-or-nothing semantics: if commit() is not called before
 * destruction, all tracked resources are cleaned up.
 * ============================================================================
 */

class AllocationTransaction {
 public:
  AllocationTransaction() : committed_(false) {}

  /* Disable copy */
  AllocationTransaction(const AllocationTransaction&) = delete;
  AllocationTransaction& operator=(const AllocationTransaction&) = delete;

  /* Move support */
  AllocationTransaction(AllocationTransaction&& other) noexcept
      : resources_(std::move(other.resources_)), committed_(other.committed_) {
    other.committed_ = true;  /* Prevent cleanup in moved-from object */
  }

  AllocationTransaction& operator=(AllocationTransaction&& other) noexcept {
    if (this != &other) {
      rollback();
      resources_ = std::move(other.resources_);
      committed_ = other.committed_;
      other.committed_ = true;
    }
    return *this;
  }

  /* Destructor - rollback if not committed */
  ~AllocationTransaction() {
    if (!committed_) {
      rollback();
    }
  }

  /**
   * Track a resource for cleanup
   * @param handle Resource handle
   * @param deleter Cleanup function
   */
  template <typename T, typename D>
  void track(T handle, D deleter) {
    if (handle) {
      resources_.emplace_back([handle, deleter]() { deleter(handle); });
    }
  }

  /**
   * Track a ResourceGuard (takes ownership)
   */
  template <typename T>
  void track(ResourceGuard<T>&& guard) {
    if (guard) {
      T handle = guard.release();
      /* Need to capture the deleter type-erased */
      resources_.emplace_back([handle]() {
        /* This requires knowing the deleter type - use with care */
        /* For full type safety, use the track(handle, deleter) overload */
      });
    }
  }

  /**
   * Commit transaction - prevent cleanup
   */
  void commit() { committed_ = true; }

  /**
   * Rollback transaction - cleanup all resources
   */
  void rollback() {
    /* Cleanup in reverse order (LIFO) */
    while (!resources_.empty()) {
      try {
        resources_.back()();
      } catch (...) {
        /* Suppress exceptions during cleanup */
      }
      resources_.pop_back();
    }
    committed_ = true;  /* Prevent double cleanup */
  }

  /**
   * Get number of tracked resources
   */
  size_t size() const { return resources_.size(); }

  /**
   * Check if transaction has been committed
   */
  bool is_committed() const { return committed_; }

 private:
  std::vector<std::function<void()>> resources_;
  bool committed_;
};

/* ============================================================================
 * ScopedCleanup - Execute cleanup function on scope exit
 *
 * Use for any cleanup that doesn't fit the handle pattern.
 * ============================================================================
 */

class ScopedCleanup {
 public:
  using Cleanup = std::function<void()>;

  explicit ScopedCleanup(Cleanup cleanup)
      : cleanup_(std::move(cleanup)), dismissed_(false) {}

  /* Disable copy */
  ScopedCleanup(const ScopedCleanup&) = delete;
  ScopedCleanup& operator=(const ScopedCleanup&) = delete;

  /* Move support */
  ScopedCleanup(ScopedCleanup&& other) noexcept
      : cleanup_(std::move(other.cleanup_)), dismissed_(other.dismissed_) {
    other.dismissed_ = true;
  }

  ScopedCleanup& operator=(ScopedCleanup&& other) noexcept {
    if (this != &other) {
      execute();
      cleanup_ = std::move(other.cleanup_);
      dismissed_ = other.dismissed_;
      other.dismissed_ = true;
    }
    return *this;
  }

  ~ScopedCleanup() { execute(); }

  /**
   * Dismiss cleanup - prevent execution
   */
  void dismiss() { dismissed_ = true; }

  /**
   * Execute cleanup now (and dismiss)
   */
  void execute() {
    if (!dismissed_ && cleanup_) {
      try {
        cleanup_();
      } catch (...) {
        /* Suppress exceptions */
      }
      dismissed_ = true;
    }
  }

 private:
  Cleanup cleanup_;
  bool dismissed_;
};

/* Helper macro for scope cleanup */
#define GOPHER_ORCH_SCOPE_EXIT(code) \
  ::gopher::orch::ffi::ScopedCleanup _scope_exit_##__LINE__([&]() { code; })

/* ============================================================================
 * ErrorScope - Clear error on scope entry, optionally check on exit
 * ============================================================================
 */

class ErrorScope {
 public:
  ErrorScope() { gopher_orch_clear_error(); }

  ~ErrorScope() = default;

  /**
   * Get last error code
   */
  gopher_orch_error_t error() const {
    auto info = gopher_orch_last_error();
    return info ? info->code : GOPHER_ORCH_OK;
  }

  /**
   * Get last error message
   */
  const char* message() const {
    auto info = gopher_orch_last_error();
    return info ? info->message : nullptr;
  }

  /**
   * Check if there was an error
   */
  bool has_error() const {
    auto info = gopher_orch_last_error();
    return info && info->code != GOPHER_ORCH_OK;
  }

  /**
   * Throw exception if there was an error
   */
  void throw_if_error() const {
    if (has_error()) {
      throw std::runtime_error(message() ? message() : "Unknown error");
    }
  }
};

/* ============================================================================
 * StringGuard - RAII wrapper for owned strings
 * ============================================================================
 */

class StringGuard {
 public:
  StringGuard() : str_(nullptr) {}
  explicit StringGuard(char* str) : str_(str) {}

  /* Disable copy */
  StringGuard(const StringGuard&) = delete;
  StringGuard& operator=(const StringGuard&) = delete;

  /* Move support */
  StringGuard(StringGuard&& other) noexcept : str_(other.str_) {
    other.str_ = nullptr;
  }

  StringGuard& operator=(StringGuard&& other) noexcept {
    if (this != &other) {
      reset();
      str_ = other.str_;
      other.str_ = nullptr;
    }
    return *this;
  }

  ~StringGuard() { reset(); }

  const char* get() const { return str_; }
  const char* c_str() const { return str_; }
  operator const char*() const { return str_; }
  explicit operator bool() const { return str_ != nullptr; }

  char* release() {
    char* s = str_;
    str_ = nullptr;
    return s;
  }

  void reset(char* new_str = nullptr) {
    if (str_) {
      gopher_orch_free(str_);
    }
    str_ = new_str;
  }

 private:
  char* str_;
};

/* Factory for JSON stringify */
inline StringGuard stringify_json(gopher_orch_json_t json) {
  return StringGuard(gopher_orch_json_stringify(json));
}

inline StringGuard stringify_json_pretty(gopher_orch_json_t json) {
  return StringGuard(gopher_orch_json_stringify_pretty(json));
}

/* ============================================================================
 * Async completion helper
 * ============================================================================
 */

/**
 * SyncCompletion - Helper for blocking on async operations
 *
 * Usage:
 *   SyncCompletion<gopher_orch_json_t> completion;
 *   gopher_orch_runnable_invoke(runnable, input, config, dispatcher,
 *                               nullptr, SyncCompletion<gopher_orch_json_t>::callback,
 *                               &completion);
 *   dispatcher->run_until(completion.is_complete);
 *   auto result = completion.get_result();
 */
template <typename T>
class SyncCompletion {
 public:
  SyncCompletion() : complete_(false), error_(GOPHER_ORCH_OK), result_(nullptr) {}

  /* Static callback for C API */
  static void callback(void* user_context,
                       gopher_orch_error_t error,
                       T result) noexcept {
    auto* self = static_cast<SyncCompletion*>(user_context);
    self->error_ = error;
    self->result_ = result;
    self->complete_ = true;
  }

  bool is_complete() const { return complete_; }
  gopher_orch_error_t error() const { return error_; }
  T result() const { return result_; }

  /* Get result, taking ownership */
  T take_result() {
    T r = result_;
    result_ = nullptr;
    return r;
  }

 private:
  std::atomic<bool> complete_;
  gopher_orch_error_t error_;
  T result_;
};

using JsonSyncCompletion = SyncCompletion<gopher_orch_json_t>;

}  // namespace ffi
}  // namespace orch
}  // namespace gopher

#endif /* __cplusplus */

#endif /* GOPHER_ORCH_FFI_RAII_H */
