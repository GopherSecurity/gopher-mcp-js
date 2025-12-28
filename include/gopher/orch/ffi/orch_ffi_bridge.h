/**
 * @file orch_ffi_bridge.h
 * @brief Internal C++ to C bridge for gopher-orch FFI layer
 *
 * This header provides the internal bridge between C++ and C APIs with
 * comprehensive RAII support, FFI-safe type conversions, and automatic
 * resource management. It ensures thread-safe operations and prevents
 * resource leaks through systematic RAII enforcement.
 *
 * Architecture:
 * - RAII wrappers for all C++ resources
 * - Thread-safe handle management with reference counting
 * - Automatic cleanup through scope guards and transactions
 * - FFI-safe type conversions with validation
 * - Comprehensive error handling with recovery
 *
 * Key Design Decisions:
 * - JSON-to-JSON type erasure at FFI boundary
 * - All Runnable templates exposed as JsonRunnable
 * - Thread-local error messages for C API
 * - Opaque handles with reference counting
 *
 * This file is NOT part of the public API and should only be included
 * by implementation files.
 */

#ifndef GOPHER_ORCH_FFI_BRIDGE_H
#define GOPHER_ORCH_FFI_BRIDGE_H

#include "orch_ffi.h"

/* C++ standard library headers */
#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

/* gopher-orch C++ headers */
#include "gopher/orch/callback/callback_handler.h"
#include "gopher/orch/callback/callback_manager.h"
#include "gopher/orch/core/config.h"
#include "gopher/orch/core/dispatcher.h"
#include "gopher/orch/core/runnable.h"
#include "gopher/orch/core/types.h"
#include "gopher/orch/human/approval.h"

namespace gopher {
namespace orch {
namespace ffi {

/* ============================================================================
 * Handle Base Class
 *
 * All FFI handle implementations derive from this base class.
 * Provides reference counting and global registry for leak detection.
 * ============================================================================
 */

class HandleBase {
 public:
  explicit HandleBase(gopher_orch_type_id_t type)
      : ref_count_(1), type_id_(type) {
    RegisterHandle(this);
  }

  virtual ~HandleBase() { UnregisterHandle(this); }

  /* Reference counting */
  void AddRef() { ref_count_.fetch_add(1, std::memory_order_relaxed); }

  void Release() {
    if (ref_count_.fetch_sub(1, std::memory_order_acq_rel) == 1) {
      delete this;
    }
  }

  int32_t GetRefCount() const {
    return ref_count_.load(std::memory_order_relaxed);
  }

  gopher_orch_type_id_t GetType() const { return type_id_; }

  /* Virtual methods for resource management */
  virtual void Cleanup() {}
  virtual bool IsValid() const { return true; }

 private:
  std::atomic<int32_t> ref_count_;
  gopher_orch_type_id_t type_id_;

  /* Global handle registry */
  static void RegisterHandle(HandleBase* handle);
  static void UnregisterHandle(HandleBase* handle);
};

/* ============================================================================
 * Handle Registry for Leak Detection
 * ============================================================================
 */

class HandleRegistry {
 public:
  static HandleRegistry& Instance() {
    static HandleRegistry instance;
    return instance;
  }

  void Register(HandleBase* handle) {
    if (!handle)
      return;
    std::lock_guard<std::mutex> lock(mutex_);
    handles_.insert(handle);
    stats_.total_created++;
  }

  void Unregister(HandleBase* handle) {
    if (!handle)
      return;
    std::lock_guard<std::mutex> lock(mutex_);
    handles_.erase(handle);
    stats_.total_destroyed++;
  }

  bool IsValid(void* handle) const {
    if (!handle)
      return false;
    std::lock_guard<std::mutex> lock(mutex_);
    return handles_.find(static_cast<HandleBase*>(handle)) != handles_.end();
  }

  struct Stats {
    size_t total_created{0};
    size_t total_destroyed{0};
  };

  Stats GetStats() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return stats_;
  }

  size_t GetActiveCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return handles_.size();
  }

  void PrintLeakReport() const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!handles_.empty()) {
      fprintf(stderr, "gopher-orch FFI: %zu handles leaked:\n", handles_.size());
      for (auto* handle : handles_) {
        fprintf(stderr, "  - Handle type %d at %p (refcount=%d)\n",
                handle->GetType(), static_cast<void*>(handle),
                handle->GetRefCount());
      }
    }
  }

 private:
  mutable std::mutex mutex_;
  std::unordered_set<HandleBase*> handles_;
  Stats stats_;
};

/* Inline implementations */
inline void HandleBase::RegisterHandle(HandleBase* handle) {
  HandleRegistry::Instance().Register(handle);
}

inline void HandleBase::UnregisterHandle(HandleBase* handle) {
  HandleRegistry::Instance().Unregister(handle);
}

/* ============================================================================
 * Error Manager - Thread-local error handling
 * ============================================================================
 */

class ErrorManager {
 public:
  static void SetError(gopher_orch_error_t code,
                       const std::string& message,
                       const std::string& details = "",
                       const char* file = nullptr,
                       int line = 0) {
    auto& info = GetThreadLocalError();
    info.code = code;

    /* Store message in thread-local storage */
    auto& msg = GetThreadLocalMessage();
    auto& det = GetThreadLocalDetails();
    msg = message;
    det = details;

    info.message = msg.c_str();
    info.details = det.empty() ? nullptr : det.c_str();
    info.file = file;
    info.line = line;
  }

  static const gopher_orch_error_info_t* GetLastError() {
    auto& info = GetThreadLocalError();
    return (info.code != GOPHER_ORCH_OK) ? &info : nullptr;
  }

  static void ClearError() {
    auto& info = GetThreadLocalError();
    info.code = GOPHER_ORCH_OK;
    info.message = nullptr;
    info.details = nullptr;
    info.file = nullptr;
    info.line = 0;
  }

  static const char* GetErrorName(gopher_orch_error_t code) {
    switch (code) {
      case GOPHER_ORCH_OK: return "GOPHER_ORCH_OK";
      case GOPHER_ORCH_ERROR_INVALID_HANDLE: return "GOPHER_ORCH_ERROR_INVALID_HANDLE";
      case GOPHER_ORCH_ERROR_INVALID_ARGUMENT: return "GOPHER_ORCH_ERROR_INVALID_ARGUMENT";
      case GOPHER_ORCH_ERROR_NULL_POINTER: return "GOPHER_ORCH_ERROR_NULL_POINTER";
      case GOPHER_ORCH_ERROR_NOT_FOUND: return "GOPHER_ORCH_ERROR_NOT_FOUND";
      case GOPHER_ORCH_ERROR_ALREADY_EXISTS: return "GOPHER_ORCH_ERROR_ALREADY_EXISTS";
      case GOPHER_ORCH_ERROR_RESOURCE_LIMIT: return "GOPHER_ORCH_ERROR_RESOURCE_LIMIT";
      case GOPHER_ORCH_ERROR_NO_MEMORY: return "GOPHER_ORCH_ERROR_NO_MEMORY";
      case GOPHER_ORCH_ERROR_CONNECTION_FAILED: return "GOPHER_ORCH_ERROR_CONNECTION_FAILED";
      case GOPHER_ORCH_ERROR_NOT_CONNECTED: return "GOPHER_ORCH_ERROR_NOT_CONNECTED";
      case GOPHER_ORCH_ERROR_TIMEOUT: return "GOPHER_ORCH_ERROR_TIMEOUT";
      case GOPHER_ORCH_ERROR_INVALID_TRANSITION: return "GOPHER_ORCH_ERROR_INVALID_TRANSITION";
      case GOPHER_ORCH_ERROR_GUARD_REJECTED: return "GOPHER_ORCH_ERROR_GUARD_REJECTED";
      case GOPHER_ORCH_ERROR_INVALID_STATE: return "GOPHER_ORCH_ERROR_INVALID_STATE";
      case GOPHER_ORCH_ERROR_CANCELLED: return "GOPHER_ORCH_ERROR_CANCELLED";
      case GOPHER_ORCH_ERROR_APPROVAL_DENIED: return "GOPHER_ORCH_ERROR_APPROVAL_DENIED";
      case GOPHER_ORCH_ERROR_CIRCUIT_OPEN: return "GOPHER_ORCH_ERROR_CIRCUIT_OPEN";
      case GOPHER_ORCH_ERROR_FALLBACK_EXHAUSTED: return "GOPHER_ORCH_ERROR_FALLBACK_EXHAUSTED";
      case GOPHER_ORCH_ERROR_PARSE_ERROR: return "GOPHER_ORCH_ERROR_PARSE_ERROR";
      case GOPHER_ORCH_ERROR_INVALID_JSON: return "GOPHER_ORCH_ERROR_INVALID_JSON";
      case GOPHER_ORCH_ERROR_INTERNAL: return "GOPHER_ORCH_ERROR_INTERNAL";
      case GOPHER_ORCH_ERROR_NOT_IMPLEMENTED: return "GOPHER_ORCH_ERROR_NOT_IMPLEMENTED";
      default: return "GOPHER_ORCH_ERROR_UNKNOWN";
    }
  }

 private:
  static gopher_orch_error_info_t& GetThreadLocalError() {
    thread_local gopher_orch_error_info_t info = {};
    return info;
  }

  static std::string& GetThreadLocalMessage() {
    thread_local std::string message;
    return message;
  }

  static std::string& GetThreadLocalDetails() {
    thread_local std::string details;
    return details;
  }
};

/* Macro for setting error with file/line */
#define SET_ERROR(code, msg) \
  ErrorManager::SetError(code, msg, "", __FILE__, __LINE__)

#define SET_ERROR_DETAIL(code, msg, detail) \
  ErrorManager::SetError(code, msg, detail, __FILE__, __LINE__)

/* ============================================================================
 * Handle Implementations
 * ============================================================================
 */

/**
 * JSON value handle implementation
 */
struct JsonImpl : public HandleBase {
  explicit JsonImpl(core::JsonValue value)
      : HandleBase(GOPHER_ORCH_TYPE_JSON), value(std::move(value)) {}

  core::JsonValue value;
};

/**
 * Dispatcher handle implementation
 */
struct DispatcherImpl : public HandleBase {
  DispatcherImpl()
      : HandleBase(GOPHER_ORCH_TYPE_DISPATCHER),
        dispatcher(std::make_unique<core::Dispatcher>()) {}

  ~DispatcherImpl() override { Cleanup(); }

  void Cleanup() override {
    if (dispatcher) {
      dispatcher->exit();
    }
  }

  std::unique_ptr<core::Dispatcher> dispatcher;
  std::thread::id dispatcher_thread_id;
};

/**
 * Configuration handle implementation
 */
struct ConfigImpl : public HandleBase {
  ConfigImpl() : HandleBase(GOPHER_ORCH_TYPE_CONFIG) {}

  core::RunnableConfig config;
};

/**
 * Runnable handle implementation - type-erased to JSON->JSON
 */
struct RunnableImpl : public HandleBase {
  using JsonRunnable = core::Runnable<core::JsonValue, core::JsonValue>;

  explicit RunnableImpl(std::shared_ptr<JsonRunnable> runnable)
      : HandleBase(GOPHER_ORCH_TYPE_RUNNABLE), runnable(std::move(runnable)) {}

  std::shared_ptr<JsonRunnable> runnable;
};

/**
 * Callback manager handle implementation
 */
struct CallbackManagerImpl : public HandleBase {
  CallbackManagerImpl()
      : HandleBase(GOPHER_ORCH_TYPE_CALLBACK_MANAGER),
        manager(std::make_shared<callback::CallbackManager>()) {}

  std::shared_ptr<callback::CallbackManager> manager;
};

/**
 * Approval handler handle implementation
 */
struct ApprovalHandlerImpl : public HandleBase {
  explicit ApprovalHandlerImpl(std::shared_ptr<human::ApprovalHandler> handler)
      : HandleBase(GOPHER_ORCH_TYPE_APPROVAL_HANDLER),
        handler(std::move(handler)) {}

  std::shared_ptr<human::ApprovalHandler> handler;
};

/**
 * Cancellation token implementation
 */
struct CancelTokenImpl : public HandleBase {
  CancelTokenImpl() : HandleBase(GOPHER_ORCH_TYPE_CANCEL_TOKEN) {}

  std::atomic<bool> cancelled{false};
};

/**
 * Iterator implementation
 */
struct IteratorImpl : public HandleBase {
  IteratorImpl(gopher_orch_json_t json)
      : HandleBase(GOPHER_ORCH_TYPE_ITERATOR), json_(json), index_(0) {
    if (json) {
      auto* impl = reinterpret_cast<JsonImpl*>(json);
      if (impl->value.isObject()) {
        is_object_ = true;
        object_iter_ = impl->value.begin();
        object_end_ = impl->value.end();
      } else if (impl->value.isArray()) {
        is_object_ = false;
        array_size_ = impl->value.size();
      }
    }
  }

  gopher_orch_json_t json_;
  size_t index_;
  bool is_object_ = false;
  core::JsonValue::const_iterator object_iter_;
  core::JsonValue::const_iterator object_end_;
  size_t array_size_ = 0;
  std::string current_key_;
  core::JsonValue current_value_;
};

/**
 * Sequence builder implementation
 */
struct SequenceImpl : public HandleBase {
  SequenceImpl() : HandleBase(GOPHER_ORCH_TYPE_SEQUENCE) {}

  std::vector<std::shared_ptr<RunnableImpl::JsonRunnable>> steps;
};

/**
 * Parallel builder implementation
 */
struct ParallelImpl : public HandleBase {
  ParallelImpl() : HandleBase(GOPHER_ORCH_TYPE_PARALLEL) {}

  std::vector<
      std::pair<std::string, std::shared_ptr<RunnableImpl::JsonRunnable>>>
      branches;
};

/**
 * Router builder implementation
 */
struct RouterImpl : public HandleBase {
  RouterImpl() : HandleBase(GOPHER_ORCH_TYPE_ROUTER) {}

  struct Route {
    gopher_orch_condition_fn condition;
    void* user_context;
    std::shared_ptr<RunnableImpl::JsonRunnable> runnable;
  };

  std::vector<Route> routes;
  std::shared_ptr<RunnableImpl::JsonRunnable> default_route;
};

/**
 * RAII guard implementation
 */
struct GuardImpl : public HandleBase {
  GuardImpl(void* handle, gopher_orch_type_id_t type,
            gopher_orch_cleanup_fn cleanup)
      : HandleBase(GOPHER_ORCH_TYPE_GUARD),
        handle_(handle),
        type_(type),
        cleanup_(cleanup),
        released_(false) {}

  ~GuardImpl() override {
    if (!released_ && handle_ && cleanup_) {
      cleanup_(handle_);
    }
  }

  void* Release() {
    void* h = handle_;
    handle_ = nullptr;
    released_ = true;
    return h;
  }

  void* handle_;
  gopher_orch_type_id_t type_;
  gopher_orch_cleanup_fn cleanup_;
  bool released_;
};

/**
 * Transaction implementation
 */
struct TransactionImpl : public HandleBase {
  struct Resource {
    void* handle;
    gopher_orch_type_id_t type;
    gopher_orch_cleanup_fn cleanup;
  };

  explicit TransactionImpl(const gopher_orch_transaction_opts_t* opts)
      : HandleBase(GOPHER_ORCH_TYPE_TRANSACTION), committed_(false) {
    if (opts) {
      auto_rollback_ = opts->auto_rollback;
      strict_ordering_ = opts->strict_ordering;
      max_resources_ = opts->max_resources;
    }
  }

  ~TransactionImpl() override {
    if (!committed_ && auto_rollback_) {
      Rollback();
    }
  }

  gopher_orch_error_t Add(void* handle, gopher_orch_type_id_t type) {
    if (!handle)
      return GOPHER_ORCH_ERROR_NULL_POINTER;
    if (committed_)
      return GOPHER_ORCH_ERROR_INVALID_STATE;
    if (max_resources_ > 0 && resources_.size() >= max_resources_)
      return GOPHER_ORCH_ERROR_RESOURCE_LIMIT;

    resources_.push_back({handle, type, nullptr});
    return GOPHER_ORCH_OK;
  }

  gopher_orch_error_t Commit() {
    if (committed_)
      return GOPHER_ORCH_ERROR_INVALID_STATE;
    committed_ = true;
    resources_.clear();
    return GOPHER_ORCH_OK;
  }

  void Rollback() {
    if (committed_)
      return;

    /* Cleanup in reverse order (LIFO) */
    while (!resources_.empty()) {
      auto& res = resources_.back();
      CleanupResource(res);
      resources_.pop_back();
    }
    committed_ = true;
  }

  size_t Size() const { return resources_.size(); }

 private:
  void CleanupResource(const Resource& res) {
    if (!res.handle)
      return;

    if (res.cleanup) {
      res.cleanup(res.handle);
    } else {
      /* Default cleanup based on type */
      auto* base = static_cast<HandleBase*>(res.handle);
      base->Release();
    }
  }

  std::vector<Resource> resources_;
  bool committed_;
  bool auto_rollback_ = true;
  bool strict_ordering_ = true;
  size_t max_resources_ = 0;
};

/* ============================================================================
 * Lambda Runnable Implementation
 *
 * Wraps a C callback function as a JsonRunnable.
 * ============================================================================
 */

class LambdaRunnable
    : public core::Runnable<core::JsonValue, core::JsonValue> {
 public:
  LambdaRunnable(gopher_orch_lambda_fn fn, void* user_context,
                 gopher_orch_destructor_fn destructor, std::string name)
      : fn_(fn),
        user_context_(user_context),
        destructor_(destructor),
        name_(std::move(name)) {}

  ~LambdaRunnable() override {
    if (destructor_ && user_context_) {
      destructor_(user_context_);
    }
  }

  std::string name() const override { return name_; }

  void invoke(const core::JsonValue& input,
              const core::RunnableConfig& config,
              core::Dispatcher& dispatcher,
              core::ResultCallback<core::JsonValue> callback) override {
    (void)config;

    /* Create input handle for callback */
    auto* input_impl = new JsonImpl(input);

    /* Post to dispatcher to call the callback in the right context */
    dispatcher.post([this, input_impl, callback]() {
      gopher_orch_error_t error = GOPHER_ORCH_OK;
      auto result = fn_(user_context_,
                        reinterpret_cast<gopher_orch_json_t>(input_impl),
                        &error);

      /* Cleanup input handle */
      input_impl->Release();

      if (error != GOPHER_ORCH_OK || !result) {
        callback(core::Result<core::JsonValue>(
            core::Error(error, ErrorManager::GetErrorName(error))));
      } else {
        auto* result_impl = reinterpret_cast<JsonImpl*>(result);
        core::JsonValue output = result_impl->value;
        result_impl->Release();
        callback(core::makeSuccess(std::move(output)));
      }
    });
  }

 private:
  gopher_orch_lambda_fn fn_;
  void* user_context_;
  gopher_orch_destructor_fn destructor_;
  std::string name_;
};

/* ============================================================================
 * FFI Callback Handler Implementation
 *
 * Wraps C callback functions as a CallbackHandler.
 * ============================================================================
 */

class FFICallbackHandler : public callback::CallbackHandler {
 public:
  explicit FFICallbackHandler(const gopher_orch_callback_handler_config_t& config)
      : config_(config) {}

  ~FFICallbackHandler() override {
    if (config_.destructor && config_.user_context) {
      config_.destructor(config_.user_context);
    }
  }

  void onChainStart(const callback::RunInfo& info,
                    const core::JsonValue& input) override {
    if (config_.on_chain_start) {
      auto* input_impl = new JsonImpl(input);
      config_.on_chain_start(
          config_.user_context, info.run_id.c_str(), info.name.c_str(),
          reinterpret_cast<gopher_orch_json_t>(input_impl));
      input_impl->Release();
    }
  }

  void onChainEnd(const callback::RunInfo& info,
                  const core::JsonValue& output) override {
    if (config_.on_chain_end) {
      auto* output_impl = new JsonImpl(output);
      config_.on_chain_end(
          config_.user_context, info.run_id.c_str(), info.name.c_str(),
          reinterpret_cast<gopher_orch_json_t>(output_impl));
      output_impl->Release();
    }
  }

  void onChainError(const callback::RunInfo& info,
                    const core::Error& error) override {
    if (config_.on_chain_error) {
      config_.on_chain_error(config_.user_context, info.run_id.c_str(),
                             info.name.c_str(),
                             static_cast<gopher_orch_error_t>(error.code),
                             error.message.c_str());
    }
  }

  void onToolStart(const callback::RunInfo& info, const std::string& tool_name,
                   const core::JsonValue& input) override {
    if (config_.on_tool_start) {
      auto* input_impl = new JsonImpl(input);
      config_.on_tool_start(
          config_.user_context, info.run_id.c_str(), tool_name.c_str(),
          reinterpret_cast<gopher_orch_json_t>(input_impl));
      input_impl->Release();
    }
  }

  void onToolEnd(const callback::RunInfo& info, const std::string& tool_name,
                 const core::JsonValue& output) override {
    if (config_.on_tool_end) {
      auto* output_impl = new JsonImpl(output);
      config_.on_tool_end(
          config_.user_context, info.run_id.c_str(), tool_name.c_str(),
          reinterpret_cast<gopher_orch_json_t>(output_impl));
      output_impl->Release();
    }
  }

  void onToolError(const callback::RunInfo& info, const std::string& tool_name,
                   const core::Error& error) override {
    if (config_.on_tool_error) {
      config_.on_tool_error(config_.user_context, info.run_id.c_str(),
                            tool_name.c_str(),
                            static_cast<gopher_orch_error_t>(error.code),
                            error.message.c_str());
    }
  }

  void onRetry(const callback::RunInfo& info, const core::Error& error,
               uint32_t attempt, uint32_t max_attempts) override {
    if (config_.on_retry) {
      config_.on_retry(config_.user_context, info.run_id.c_str(),
                       info.name.c_str(),
                       static_cast<gopher_orch_error_t>(error.code), attempt,
                       max_attempts);
    }
  }

  void onCustomEvent(const std::string& event_name,
                     const core::JsonValue& data) override {
    if (config_.on_custom_event) {
      auto* data_impl = new JsonImpl(data);
      config_.on_custom_event(
          config_.user_context, event_name.c_str(),
          reinterpret_cast<gopher_orch_json_t>(data_impl));
      data_impl->Release();
    }
  }

 private:
  gopher_orch_callback_handler_config_t config_;
};

/* ============================================================================
 * FFI Approval Handler Implementation
 *
 * Wraps C callback function as an ApprovalHandler.
 * ============================================================================
 */

class FFIApprovalHandler : public human::ApprovalHandler {
 public:
  FFIApprovalHandler(gopher_orch_approval_fn fn, void* user_context,
                     gopher_orch_destructor_fn destructor)
      : fn_(fn), user_context_(user_context), destructor_(destructor) {}

  ~FFIApprovalHandler() override {
    if (destructor_ && user_context_) {
      destructor_(user_context_);
    }
  }

  void requestApproval(
      const human::ApprovalRequest& request,
      std::function<void(human::ApprovalResponse)> callback) override {
    /* Create preview handle */
    auto* preview_impl = new JsonImpl(request.preview);

    gopher_orch_bool_t approved = GOPHER_ORCH_FALSE;
    char* reason = nullptr;
    gopher_orch_json_t modifications = nullptr;

    fn_(user_context_, request.action_name.c_str(),
        reinterpret_cast<gopher_orch_json_t>(preview_impl),
        request.prompt.c_str(), &approved, &reason, &modifications);

    preview_impl->Release();

    /* Build response */
    human::ApprovalResponse response;
    response.approved = (approved != GOPHER_ORCH_FALSE);
    response.reason = reason ? reason : "";

    if (reason) {
      gopher_orch_free(reason);
    }

    if (modifications) {
      auto* mod_impl = reinterpret_cast<JsonImpl*>(modifications);
      response.modifications = mod_impl->value;
      mod_impl->Release();
    }

    callback(std::move(response));
  }

 private:
  gopher_orch_approval_fn fn_;
  void* user_context_;
  gopher_orch_destructor_fn destructor_;
};

/* ============================================================================
 * Utility Macros for Handle Validation
 * ============================================================================
 */

#define CHECK_HANDLE(handle, type_enum, return_val)                      \
  do {                                                                   \
    if (!handle) {                                                       \
      SET_ERROR(GOPHER_ORCH_ERROR_INVALID_HANDLE, "Handle is null");     \
      return return_val;                                                 \
    }                                                                    \
    auto* base = reinterpret_cast<HandleBase*>(handle);                  \
    if (base->GetType() != type_enum) {                                  \
      SET_ERROR(GOPHER_ORCH_ERROR_INVALID_HANDLE, "Handle type mismatch"); \
      return return_val;                                                 \
    }                                                                    \
  } while (0)

#define CHECK_HANDLE_VOID(handle, type_enum)                             \
  do {                                                                   \
    if (!handle) {                                                       \
      SET_ERROR(GOPHER_ORCH_ERROR_INVALID_HANDLE, "Handle is null");     \
      return;                                                            \
    }                                                                    \
    auto* base = reinterpret_cast<HandleBase*>(handle);                  \
    if (base->GetType() != type_enum) {                                  \
      SET_ERROR(GOPHER_ORCH_ERROR_INVALID_HANDLE, "Handle type mismatch"); \
      return;                                                            \
    }                                                                    \
  } while (0)

#define TRY_CATCH(code, return_val)                                     \
  try {                                                                 \
    code                                                                \
  } catch (const std::exception& e) {                                   \
    SET_ERROR(GOPHER_ORCH_ERROR_INTERNAL, e.what());                    \
    return return_val;                                                  \
  } catch (...) {                                                       \
    SET_ERROR(GOPHER_ORCH_ERROR_UNKNOWN, "Unknown exception");          \
    return return_val;                                                  \
  }

#define TRY_CATCH_VOID(code)                                            \
  try {                                                                 \
    code                                                                \
  } catch (const std::exception& e) {                                   \
    SET_ERROR(GOPHER_ORCH_ERROR_INTERNAL, e.what());                    \
    return;                                                             \
  } catch (...) {                                                       \
    SET_ERROR(GOPHER_ORCH_ERROR_UNKNOWN, "Unknown exception");          \
    return;                                                             \
  }

}  // namespace ffi
}  // namespace orch
}  // namespace gopher

#endif /* GOPHER_ORCH_FFI_BRIDGE_H */
