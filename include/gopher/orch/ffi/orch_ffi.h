/**
 * @file orch_ffi.h
 * @brief FFI-friendly C API for gopher-orch orchestration framework
 *
 * This header provides the complete C API for the gopher-orch C++ framework.
 * It follows an event-driven, dispatcher thread-confined architecture while
 * ensuring FFI-safety and automatic resource management through RAII.
 *
 * Architecture:
 * - All operations happen in dispatcher thread context
 * - Callbacks are invoked in dispatcher thread
 * - RAII guards ensure automatic cleanup
 * - FFI-safe types for cross-language bindings
 * - Follows Create -> Configure -> Use -> Destroy lifecycle
 *
 * Memory Management:
 * - All handles are reference-counted internally
 * - Automatic cleanup through RAII guards
 * - Optional manual resource management for FFI
 * - Thread-safe resource tracking in debug mode
 *
 * Key Design Decision - JSON-to-JSON FFI Boundary:
 * - All Runnable<TInput, TOutput> templates are type-erased to JSON->JSON
 * - This provides the cleanest FFI surface (80% of use cases)
 * - Target languages handle typing in their wrapper layers
 * - For custom types, use JSON serialization at the boundary
 *
 * Usage from other languages:
 * - Python: ctypes/cffi wrapper, or pybind11 for direct C++ binding
 * - Node.js: nbind or N-API native addon
 * - Rust: cxx crate or bindgen for C API
 * - Go: cgo with C API
 * - Ruby: Rice gem (pybind11-like) or FFI gem
 * - Lua: sol2 or LuaBridge
 */

#ifndef GOPHER_ORCH_FFI_H
#define GOPHER_ORCH_FFI_H

#include "orch_ffi_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Version and Initialization
 * ============================================================================
 */

#define GOPHER_ORCH_VERSION_MAJOR 1
#define GOPHER_ORCH_VERSION_MINOR 0
#define GOPHER_ORCH_VERSION_PATCH 0

/**
 * Get runtime version (for ABI compatibility check)
 * Caller should verify version matches compiled headers
 */
GOPHER_ORCH_API void gopher_orch_version(int* major,
                                         int* minor,
                                         int* patch) GOPHER_ORCH_NOEXCEPT;

/**
 * Get version as string
 * @return Version string (e.g., "1.0.0"), do not free
 */
GOPHER_ORCH_API const char* gopher_orch_version_string(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Initialize library (call once at startup)
 * Must be called before any other API functions
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_init(void) GOPHER_ORCH_NOEXCEPT;

/**
 * Shutdown library (call once at shutdown)
 * Cleans up all resources and checks for leaks
 */
GOPHER_ORCH_API void gopher_orch_shutdown(void) GOPHER_ORCH_NOEXCEPT;

/**
 * Check if library is initialized
 * @return GOPHER_ORCH_TRUE if initialized
 */
GOPHER_ORCH_API gopher_orch_bool_t gopher_orch_is_initialized(void)
    GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Error Handling
 * ============================================================================
 */

/**
 * Get last error info for current thread
 * @return Error info struct, or NULL if no error
 */
GOPHER_ORCH_API const gopher_orch_error_info_t* gopher_orch_last_error(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Get human-readable error name
 * @param code Error code
 * @return Error name string (e.g., "GOPHER_ORCH_ERROR_TIMEOUT"), do not free
 */
GOPHER_ORCH_API const char* gopher_orch_error_name(gopher_orch_error_t code)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Clear last error for current thread
 */
GOPHER_ORCH_API void gopher_orch_clear_error(void) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Memory Management
 * ============================================================================
 */

/**
 * Free memory allocated by the library
 * Use for strings returned with OWNED semantics
 * @param ptr Pointer to free (NULL-safe)
 */
GOPHER_ORCH_API void gopher_orch_free(void* ptr) GOPHER_ORCH_NOEXCEPT;

/**
 * Free string buffer
 * @param buffer String buffer to free (NULL-safe)
 */
GOPHER_ORCH_API void gopher_orch_string_buffer_free(
    gopher_orch_string_buffer_t* buffer) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * RAII Guard Functions
 *
 * Guards provide automatic cleanup when resources go out of scope.
 * This pattern works well with FFI - caller creates guard, performs
 * operations, then either commits (takes ownership) or lets guard cleanup.
 * ============================================================================
 */

/**
 * Create a RAII guard for a handle with automatic cleanup
 * @param handle Handle to guard (takes ownership)
 * @param type Type of handle for validation
 * @return Guard handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_guard_t gopher_orch_guard_create(
    void* handle, gopher_orch_type_id_t type) GOPHER_ORCH_NOEXCEPT;

/**
 * Create a RAII guard with custom cleanup function
 * @param handle Handle to guard (takes ownership)
 * @param type Type of handle for validation
 * @param cleanup Custom cleanup function
 * @return Guard handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_guard_t gopher_orch_guard_create_custom(
    void* handle,
    gopher_orch_type_id_t type,
    gopher_orch_cleanup_fn cleanup) GOPHER_ORCH_NOEXCEPT;

/**
 * Release resource from guard (prevents automatic cleanup)
 * @param guard Guard handle (will be nullified)
 * @return Original handle (caller takes ownership)
 */
GOPHER_ORCH_API void* gopher_orch_guard_release(gopher_orch_guard_t* guard)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy guard and cleanup resource
 * @param guard Guard handle (will be nullified)
 */
GOPHER_ORCH_API void gopher_orch_guard_destroy(gopher_orch_guard_t* guard)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Check if guard is valid and holds a resource
 * @param guard Guard handle
 * @return GOPHER_ORCH_TRUE if valid
 */
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_guard_is_valid(gopher_orch_guard_t guard) GOPHER_ORCH_NOEXCEPT;

/**
 * Get the guarded resource without releasing ownership
 * @param guard Guard handle
 * @return Guarded resource or NULL
 */
GOPHER_ORCH_API void* gopher_orch_guard_get(gopher_orch_guard_t guard)
    GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Transaction Management
 *
 * Transactions ensure all-or-nothing semantics for multi-resource operations.
 * Use when creating multiple resources that depend on each other.
 * ============================================================================
 */

/**
 * Create a new transaction with default options
 * @return Transaction handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_transaction_t gopher_orch_transaction_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Create a new transaction with custom options
 * @param opts Transaction options (may be NULL for defaults)
 * @return Transaction handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_transaction_t gopher_orch_transaction_create_ex(
    const gopher_orch_transaction_opts_t* opts) GOPHER_ORCH_NOEXCEPT;

/**
 * Add resource to transaction with automatic cleanup
 * @param txn Transaction handle
 * @param handle Resource handle (ownership transferred)
 * @param type Resource type for validation
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_transaction_add(gopher_orch_transaction_t txn,
                            void* handle,
                            gopher_orch_type_id_t type) GOPHER_ORCH_NOEXCEPT;

/**
 * Commit transaction (release resources, prevent cleanup)
 * @param txn Transaction handle (will be nullified)
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_transaction_commit(
    gopher_orch_transaction_t* txn) GOPHER_ORCH_NOEXCEPT;

/**
 * Rollback transaction (cleanup all resources)
 * @param txn Transaction handle (will be nullified)
 */
GOPHER_ORCH_API void gopher_orch_transaction_rollback(
    gopher_orch_transaction_t* txn) GOPHER_ORCH_NOEXCEPT;

/**
 * Get number of resources in transaction
 * @param txn Transaction handle
 * @return Number of resources
 */
GOPHER_ORCH_API gopher_orch_size_t gopher_orch_transaction_size(
    gopher_orch_transaction_t txn) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Cancellation Token
 *
 * Tokens allow cancelling async operations from any thread.
 * ============================================================================
 */

/**
 * Create cancellation token
 * @return Token handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_cancel_token_t gopher_orch_cancel_token_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy cancellation token
 * @param token Token handle
 */
GOPHER_ORCH_API void gopher_orch_cancel_token_destroy(
    gopher_orch_cancel_token_t token) GOPHER_ORCH_NOEXCEPT;

/**
 * Request cancellation - safe to call from any thread
 * @param token Token handle
 */
GOPHER_ORCH_API void gopher_orch_cancel_token_cancel(
    gopher_orch_cancel_token_t token) GOPHER_ORCH_NOEXCEPT;

/**
 * Check if cancelled
 * @param token Token handle
 * @return GOPHER_ORCH_TRUE if cancelled
 */
GOPHER_ORCH_API gopher_orch_bool_t gopher_orch_cancel_token_is_cancelled(
    gopher_orch_cancel_token_t token) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Dispatcher (Event Loop)
 *
 * The dispatcher provides an event loop for async operations.
 * All callbacks are invoked in the dispatcher thread context.
 * ============================================================================
 */

/**
 * Create dispatcher
 * @return Dispatcher handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_dispatcher_t gopher_orch_dispatcher_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Create dispatcher with RAII guard
 * @param guard Output: RAII guard for automatic cleanup
 * @return Dispatcher handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_dispatcher_t gopher_orch_dispatcher_create_guarded(
    gopher_orch_guard_t* guard) GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy dispatcher
 * @param dispatcher Dispatcher handle
 */
GOPHER_ORCH_API void gopher_orch_dispatcher_destroy(
    gopher_orch_dispatcher_t dispatcher) GOPHER_ORCH_NOEXCEPT;

/**
 * Run dispatcher (blocks until stopped)
 * @param dispatcher Dispatcher handle
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_dispatcher_run(
    gopher_orch_dispatcher_t dispatcher) GOPHER_ORCH_NOEXCEPT;

/**
 * Run dispatcher for one iteration
 * @param dispatcher Dispatcher handle
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_dispatcher_run_one(
    gopher_orch_dispatcher_t dispatcher) GOPHER_ORCH_NOEXCEPT;

/**
 * Run dispatcher for specified duration
 * @param dispatcher Dispatcher handle
 * @param timeout_ms Maximum time in milliseconds
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_dispatcher_run_timeout(gopher_orch_dispatcher_t dispatcher,
                                   uint64_t timeout_ms) GOPHER_ORCH_NOEXCEPT;

/**
 * Stop dispatcher
 * @param dispatcher Dispatcher handle
 */
GOPHER_ORCH_API void gopher_orch_dispatcher_stop(
    gopher_orch_dispatcher_t dispatcher) GOPHER_ORCH_NOEXCEPT;

/**
 * Post work to dispatcher thread
 * @param dispatcher Dispatcher handle
 * @param work Work function to execute
 * @param user_context User context passed to work function
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_dispatcher_post(gopher_orch_dispatcher_t dispatcher,
                            gopher_orch_work_fn work,
                            void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Check if current thread is dispatcher thread
 * @param dispatcher Dispatcher handle
 * @return GOPHER_ORCH_TRUE if in dispatcher thread
 */
GOPHER_ORCH_API gopher_orch_bool_t gopher_orch_dispatcher_is_thread(
    gopher_orch_dispatcher_t dispatcher) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * JSON Value API
 *
 * JSON is the primary data type at the FFI boundary.
 * All complex data is passed as JSON values.
 * ============================================================================
 */

/* Creation */
GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_null(void)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t
gopher_orch_json_bool(gopher_orch_bool_t value) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_int(int64_t value)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_double(double value)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_string(const char* value)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_object(void)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_array(void)
    GOPHER_ORCH_NOEXCEPT;

/* Lifecycle - reference counting */
GOPHER_ORCH_API void gopher_orch_json_add_ref(gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API void gopher_orch_json_release(gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_json_t
gopher_orch_json_clone(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;

/* Object operations */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_json_set(
    gopher_orch_json_t obj, const char* key, gopher_orch_json_t value)
    GOPHER_ORCH_NOEXCEPT; /* Takes ownership of value */

GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_get(gopher_orch_json_t obj,
                                                        const char* key)
    GOPHER_ORCH_NOEXCEPT; /* Returns BORROWED reference */

GOPHER_ORCH_API gopher_orch_bool_t gopher_orch_json_has(
    gopher_orch_json_t obj, const char* key) GOPHER_ORCH_NOEXCEPT;

GOPHER_ORCH_API gopher_orch_error_t gopher_orch_json_remove(
    gopher_orch_json_t obj, const char* key) GOPHER_ORCH_NOEXCEPT;

/* Array operations */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_json_push(gopher_orch_json_t arr, gopher_orch_json_t value)
    GOPHER_ORCH_NOEXCEPT; /* Takes ownership of value */

GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_at(gopher_orch_json_t arr,
                                                       gopher_orch_size_t index)
    GOPHER_ORCH_NOEXCEPT; /* Returns BORROWED reference */

GOPHER_ORCH_API gopher_orch_size_t
gopher_orch_json_length(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;

/* Type checking */
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_is_null(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_is_bool(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_is_number(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_is_string(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_is_object(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_is_array(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;

/* Value extraction */
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_json_as_bool(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API int64_t gopher_orch_json_as_int(gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API double gopher_orch_json_as_double(gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT;
GOPHER_ORCH_API const char* gopher_orch_json_as_string(
    gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT; /* Returns BORROWED string */

/* Serialization */
GOPHER_ORCH_API char* gopher_orch_json_stringify(gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT; /* OWNED: Caller must gopher_orch_free() */

GOPHER_ORCH_API char* gopher_orch_json_stringify_pretty(
    gopher_orch_json_t handle)
    GOPHER_ORCH_NOEXCEPT; /* OWNED: Caller must gopher_orch_free() */

GOPHER_ORCH_API gopher_orch_json_t gopher_orch_json_parse(const char* json_str)
    GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * JSON Iterator API
 *
 * Iterate over object keys and array elements.
 * ============================================================================
 */

/**
 * Create iterator for JSON object or array
 * @param handle JSON object or array handle
 * @return Iterator handle or NULL
 */
GOPHER_ORCH_API gopher_orch_iterator_t
gopher_orch_json_iter(gopher_orch_json_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy iterator
 * @param iter Iterator handle
 */
GOPHER_ORCH_API void gopher_orch_iter_destroy(gopher_orch_iterator_t iter)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Advance to next element
 * @param iter Iterator handle
 * @return GOPHER_ORCH_TRUE if advanced, GOPHER_ORCH_FALSE if exhausted
 */
GOPHER_ORCH_API gopher_orch_bool_t
gopher_orch_iter_next(gopher_orch_iterator_t iter) GOPHER_ORCH_NOEXCEPT;

/**
 * Get current key (for object iterators)
 * @param iter Iterator handle
 * @return Key string, BORROWED - valid until next iter_next or iter_destroy
 */
GOPHER_ORCH_API const char* gopher_orch_iter_key(gopher_orch_iterator_t iter)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Get current value
 * @param iter Iterator handle
 * @return Value handle, BORROWED - valid until next iter_next or iter_destroy
 */
GOPHER_ORCH_API gopher_orch_json_t
gopher_orch_iter_value(gopher_orch_iterator_t iter) GOPHER_ORCH_NOEXCEPT;

/**
 * Get current array index (for array iterators)
 * @param iter Iterator handle
 * @return Current index
 */
GOPHER_ORCH_API gopher_orch_size_t
gopher_orch_iter_index(gopher_orch_iterator_t iter) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Runnable API (Type-erased JSON-to-JSON)
 *
 * Core abstraction: all operations are exposed as JSON->JSON transformations.
 * This provides the cleanest FFI surface.
 * ============================================================================
 */

/**
 * Increment reference count
 * @param handle Runnable handle
 */
GOPHER_ORCH_API void gopher_orch_runnable_add_ref(gopher_orch_runnable_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Decrement reference count (destroys when count reaches 0)
 * @param handle Runnable handle
 */
GOPHER_ORCH_API void gopher_orch_runnable_release(gopher_orch_runnable_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Get runnable name
 * @param handle Runnable handle
 * @return Name string, BORROWED
 */
GOPHER_ORCH_API const char* gopher_orch_runnable_name(
    gopher_orch_runnable_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Invoke runnable asynchronously
 *
 * @param handle Runnable handle
 * @param input Input JSON value
 * @param config Configuration handle (NULL for defaults)
 * @param dispatcher Dispatcher handle
 * @param cancel_token Cancellation token (NULL if not needed)
 * @param callback Completion callback
 * @param user_context User context for callback
 */
GOPHER_ORCH_API void gopher_orch_runnable_invoke(
    gopher_orch_runnable_t handle,
    gopher_orch_json_t input,
    gopher_orch_config_t config,
    gopher_orch_dispatcher_t dispatcher,
    gopher_orch_cancel_token_t cancel_token,
    gopher_orch_completion_fn callback,
    void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Invoke runnable synchronously (blocks until complete)
 *
 * @param handle Runnable handle
 * @param input Input JSON value
 * @param config Configuration handle (NULL for defaults)
 * @param dispatcher Dispatcher handle
 * @param cancel_token Cancellation token (NULL if not needed)
 * @param out_result Output: result JSON handle (OWNED)
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_runnable_invoke_sync(
    gopher_orch_runnable_t handle,
    gopher_orch_json_t input,
    gopher_orch_config_t config,
    gopher_orch_dispatcher_t dispatcher,
    gopher_orch_cancel_token_t cancel_token,
    gopher_orch_json_t* out_result) GOPHER_ORCH_NOEXCEPT;

/**
 * Create lambda runnable from C function
 * This is the primary way FFI users create custom runnables.
 *
 * @param fn Lambda function
 * @param user_context User context passed to fn
 * @param name Runnable name
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_lambda_create(gopher_orch_lambda_fn fn,
                          void* user_context,
                          const char* name) GOPHER_ORCH_NOEXCEPT;

/**
 * Create lambda with destructor for context cleanup
 *
 * @param fn Lambda function
 * @param user_context User context passed to fn
 * @param destructor Called when runnable is destroyed to cleanup context
 * @param name Runnable name
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_lambda_create_with_destructor(gopher_orch_lambda_fn fn,
                                          void* user_context,
                                          gopher_orch_destructor_fn destructor,
                                          const char* name)
    GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Configuration API
 * ============================================================================
 */

/**
 * Create default configuration
 * @return Config handle or NULL
 */
GOPHER_ORCH_API gopher_orch_config_t gopher_orch_config_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy configuration
 * @param config Config handle
 */
GOPHER_ORCH_API void gopher_orch_config_destroy(gopher_orch_config_t config)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Set callback manager
 * @param config Config handle
 * @param manager Callback manager handle
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_config_set_callbacks(
    gopher_orch_config_t config,
    gopher_orch_callback_manager_t manager) GOPHER_ORCH_NOEXCEPT;

/**
 * Add tag to configuration
 * @param config Config handle
 * @param tag Tag string
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_config_add_tag(
    gopher_orch_config_t config, const char* tag) GOPHER_ORCH_NOEXCEPT;

/**
 * Set metadata value
 * @param config Config handle
 * @param key Metadata key
 * @param value Metadata value (takes ownership)
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_config_set_metadata(gopher_orch_config_t config,
                                const char* key,
                                gopher_orch_json_t value) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Composition API - Sequence
 *
 * Sequences execute runnables in order, passing output to next input.
 * Builder pattern: create -> add steps -> build
 * ============================================================================
 */

/**
 * Create sequence builder
 * @return Sequence builder handle or NULL
 */
GOPHER_ORCH_API gopher_orch_sequence_t gopher_orch_sequence_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy sequence builder (safe to call after build)
 * @param handle Sequence builder handle
 */
GOPHER_ORCH_API void gopher_orch_sequence_destroy(gopher_orch_sequence_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Add step to sequence
 * @param handle Sequence builder handle
 * @param step Runnable to add (reference count incremented)
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_sequence_add(gopher_orch_sequence_t handle,
                         gopher_orch_runnable_t step) GOPHER_ORCH_NOEXCEPT;

/**
 * Build sequence into runnable
 * @param handle Sequence builder handle
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_sequence_build(gopher_orch_sequence_t handle) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Composition API - Parallel
 *
 * Parallel executes multiple runnables concurrently, collecting results.
 * ============================================================================
 */

/**
 * Create parallel builder
 * @return Parallel builder handle or NULL
 */
GOPHER_ORCH_API gopher_orch_parallel_t gopher_orch_parallel_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy parallel builder
 * @param handle Parallel builder handle
 */
GOPHER_ORCH_API void gopher_orch_parallel_destroy(gopher_orch_parallel_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Add branch to parallel
 * @param handle Parallel builder handle
 * @param key Result key
 * @param runnable Runnable for this branch
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_parallel_add(gopher_orch_parallel_t handle,
                         const char* key,
                         gopher_orch_runnable_t runnable) GOPHER_ORCH_NOEXCEPT;

/**
 * Build parallel into runnable
 * @param handle Parallel builder handle
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_parallel_build(gopher_orch_parallel_t handle) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Composition API - Router
 *
 * Router selects between runnables based on conditions.
 * ============================================================================
 */

/**
 * Create router builder
 * @return Router builder handle or NULL
 */
GOPHER_ORCH_API gopher_orch_router_t gopher_orch_router_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy router builder
 * @param handle Router builder handle
 */
GOPHER_ORCH_API void gopher_orch_router_destroy(gopher_orch_router_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Add conditional route
 * @param handle Router builder handle
 * @param condition Condition function
 * @param user_context Context for condition function
 * @param runnable Runnable to use if condition matches
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_router_when(gopher_orch_router_t handle,
                        gopher_orch_condition_fn condition,
                        void* user_context,
                        gopher_orch_runnable_t runnable) GOPHER_ORCH_NOEXCEPT;

/**
 * Set default route
 * @param handle Router builder handle
 * @param runnable Runnable to use when no conditions match
 * @return GOPHER_ORCH_OK on success
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_router_otherwise(
    gopher_orch_router_t handle,
    gopher_orch_runnable_t runnable) GOPHER_ORCH_NOEXCEPT;

/**
 * Build router into runnable
 * @param handle Router builder handle
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_router_build(gopher_orch_router_t handle) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Resilience API
 *
 * Wrappers that add resilience patterns to runnables.
 * ============================================================================
 */

/**
 * Create retry wrapper
 * @param inner Inner runnable (reference count incremented)
 * @param policy Retry policy
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t gopher_orch_retry_create(
    gopher_orch_runnable_t inner,
    const gopher_orch_retry_policy_t* policy) GOPHER_ORCH_NOEXCEPT;

/**
 * Create timeout wrapper
 * @param inner Inner runnable
 * @param timeout_ms Timeout in milliseconds
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t gopher_orch_timeout_create(
    gopher_orch_runnable_t inner, uint64_t timeout_ms) GOPHER_ORCH_NOEXCEPT;

/**
 * Create fallback wrapper
 * @param primary Primary runnable
 * @param fallbacks Array of fallback runnables
 * @param fallback_count Number of fallbacks
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t gopher_orch_fallback_create(
    gopher_orch_runnable_t primary,
    gopher_orch_runnable_t* fallbacks,
    gopher_orch_size_t fallback_count) GOPHER_ORCH_NOEXCEPT;

/**
 * Create circuit breaker wrapper
 * @param inner Inner runnable
 * @param policy Circuit breaker policy
 * @return Runnable handle or NULL on error
 */
GOPHER_ORCH_API gopher_orch_runnable_t gopher_orch_circuit_breaker_create(
    gopher_orch_runnable_t inner,
    const gopher_orch_circuit_breaker_policy_t* policy) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Server API
 *
 * MCP server connections for tool invocation.
 * ============================================================================
 */

/**
 * Increment server reference count
 */
GOPHER_ORCH_API void gopher_orch_server_add_ref(gopher_orch_server_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Decrement server reference count
 */
GOPHER_ORCH_API void gopher_orch_server_release(gopher_orch_server_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Get server ID
 */
GOPHER_ORCH_API const char* gopher_orch_server_id(gopher_orch_server_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Get server name
 */
GOPHER_ORCH_API const char* gopher_orch_server_name(gopher_orch_server_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Check if server is connected
 */
GOPHER_ORCH_API gopher_orch_bool_t gopher_orch_server_is_connected(
    gopher_orch_server_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Get tool count
 */
GOPHER_ORCH_API gopher_orch_size_t
gopher_orch_server_tool_count(gopher_orch_server_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Get tool name by index
 */
GOPHER_ORCH_API const char* gopher_orch_server_tool_name(
    gopher_orch_server_t handle, gopher_orch_size_t index) GOPHER_ORCH_NOEXCEPT;

/**
 * Get tool as runnable
 * @param handle Server handle
 * @param tool_name Tool name
 * @return Runnable handle or NULL if not found
 */
GOPHER_ORCH_API gopher_orch_runnable_t gopher_orch_server_tool(
    gopher_orch_server_t handle, const char* tool_name) GOPHER_ORCH_NOEXCEPT;

/**
 * Call tool directly (async)
 */
GOPHER_ORCH_API void gopher_orch_server_call_tool(
    gopher_orch_server_t handle,
    const char* tool_name,
    gopher_orch_json_t arguments,
    gopher_orch_dispatcher_t dispatcher,
    gopher_orch_cancel_token_t cancel_token,
    gopher_orch_completion_fn callback,
    void* user_context) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Mock Server API (for testing)
 * ============================================================================
 */

/**
 * Create mock server
 */
GOPHER_ORCH_API gopher_orch_server_t
gopher_orch_mock_server_create(const char* name) GOPHER_ORCH_NOEXCEPT;

/**
 * Add tool to mock server
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_mock_server_add_tool(gopher_orch_server_t handle,
                                 const char* tool_name,
                                 const char* description) GOPHER_ORCH_NOEXCEPT;

/**
 * Set tool response
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_mock_server_set_response(
    gopher_orch_server_t handle,
    const char* tool_name,
    gopher_orch_json_t response) GOPHER_ORCH_NOEXCEPT;

/**
 * Set tool error
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_mock_server_set_error(
    gopher_orch_server_t handle,
    const char* tool_name,
    gopher_orch_error_t error_code,
    const char* error_message) GOPHER_ORCH_NOEXCEPT;

/**
 * Get call count
 */
GOPHER_ORCH_API gopher_orch_size_t gopher_orch_mock_server_call_count(
    gopher_orch_server_t handle, const char* tool_name) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * MCP Server API (real connections)
 * ============================================================================
 */

/**
 * Server creation callback
 */
typedef void (*gopher_orch_server_fn)(void* user_context,
                                      gopher_orch_error_t error,
                                      gopher_orch_server_t server);

/**
 * Create MCP server connection (async)
 */
GOPHER_ORCH_API void gopher_orch_mcp_server_create(
    const gopher_orch_mcp_config_t* config,
    gopher_orch_dispatcher_t dispatcher,
    gopher_orch_server_fn callback,
    void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Close MCP server connection
 */
GOPHER_ORCH_API void gopher_orch_mcp_server_close(gopher_orch_server_t handle,
                                                  gopher_orch_work_fn on_closed,
                                                  void* user_context)
    GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Callback Manager API (Observability)
 * ============================================================================
 */

/**
 * Create callback manager
 */
GOPHER_ORCH_API gopher_orch_callback_manager_t
gopher_orch_callback_manager_create(void) GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy callback manager
 */
GOPHER_ORCH_API void gopher_orch_callback_manager_destroy(
    gopher_orch_callback_manager_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Add callback handler
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_callback_manager_add_handler(
    gopher_orch_callback_manager_t handle,
    const gopher_orch_callback_handler_config_t* config) GOPHER_ORCH_NOEXCEPT;

/**
 * Get handler count
 */
GOPHER_ORCH_API gopher_orch_size_t gopher_orch_callback_manager_handler_count(
    gopher_orch_callback_manager_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Clear all handlers
 */
GOPHER_ORCH_API void gopher_orch_callback_manager_clear(
    gopher_orch_callback_manager_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Create child manager (inherits handlers, sets parent_run_id)
 */
GOPHER_ORCH_API gopher_orch_callback_manager_t
gopher_orch_callback_manager_child(gopher_orch_callback_manager_t handle)
    GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Approval Handler API (Human-in-the-Loop)
 * ============================================================================
 */

/**
 * Create auto-approve handler (for testing)
 */
GOPHER_ORCH_API gopher_orch_approval_handler_t
gopher_orch_auto_approval_create(const char* reason) GOPHER_ORCH_NOEXCEPT;

/**
 * Create auto-deny handler (for testing)
 */
GOPHER_ORCH_API gopher_orch_approval_handler_t
gopher_orch_auto_deny_create(const char* reason) GOPHER_ORCH_NOEXCEPT;

/**
 * Create callback-based approval handler
 */
GOPHER_ORCH_API gopher_orch_approval_handler_t
gopher_orch_callback_approval_create(gopher_orch_approval_fn fn,
                                     void* user_context,
                                     gopher_orch_destructor_fn destructor)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy approval handler
 */
GOPHER_ORCH_API void gopher_orch_approval_handler_destroy(
    gopher_orch_approval_handler_t handle) GOPHER_ORCH_NOEXCEPT;

/**
 * Create human approval wrapper
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_human_approval_create(gopher_orch_runnable_t inner,
                                  gopher_orch_approval_handler_t handler,
                                  const char* prompt) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * State Machine API (FSM with int32_t states/events)
 * ============================================================================
 */

/**
 * Create state machine
 */
GOPHER_ORCH_API gopher_orch_fsm_t gopher_orch_fsm_create(int32_t initial_state)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy state machine
 */
GOPHER_ORCH_API void gopher_orch_fsm_destroy(gopher_orch_fsm_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Add transition
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_add_transition(gopher_orch_fsm_t handle,
                               int32_t from_state,
                               int32_t event,
                               int32_t to_state) GOPHER_ORCH_NOEXCEPT;

/**
 * Set guard for transition
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_set_guard(gopher_orch_fsm_t handle,
                          int32_t from_state,
                          int32_t event,
                          gopher_orch_guard_fn guard,
                          void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Set action for transition
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_set_action(gopher_orch_fsm_t handle,
                           int32_t from_state,
                           int32_t event,
                           gopher_orch_action_fn action,
                           void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Set state entry action
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_on_enter(gopher_orch_fsm_t handle,
                         int32_t state,
                         gopher_orch_action_fn action,
                         void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Set state exit action
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_on_exit(gopher_orch_fsm_t handle,
                        int32_t state,
                        gopher_orch_action_fn action,
                        void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Set transition observer
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_set_observer(gopher_orch_fsm_t handle,
                             gopher_orch_transition_fn observer,
                             void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Get current state
 */
GOPHER_ORCH_API int32_t gopher_orch_fsm_current_state(gopher_orch_fsm_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Check if event can trigger transition
 */
GOPHER_ORCH_API gopher_orch_bool_t gopher_orch_fsm_can_trigger(
    gopher_orch_fsm_t handle, int32_t event) GOPHER_ORCH_NOEXCEPT;

/**
 * Trigger event (sync)
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_fsm_trigger(gopher_orch_fsm_t handle,
                        int32_t event,
                        int32_t* out_new_state) GOPHER_ORCH_NOEXCEPT;

/**
 * Trigger event (async)
 */
typedef void (*gopher_orch_fsm_trigger_fn)(void* user_context,
                                           gopher_orch_error_t error,
                                           int32_t new_state);

GOPHER_ORCH_API void gopher_orch_fsm_trigger_async(
    gopher_orch_fsm_t handle,
    int32_t event,
    gopher_orch_dispatcher_t dispatcher,
    gopher_orch_fsm_trigger_fn callback,
    void* user_context) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * State Graph API
 *
 * Graph-based workflows with conditional edges (JSON state).
 * ============================================================================
 */

/**
 * Create state graph builder
 */
GOPHER_ORCH_API gopher_orch_graph_t gopher_orch_graph_create(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Destroy state graph builder
 */
GOPHER_ORCH_API void gopher_orch_graph_destroy(gopher_orch_graph_t handle)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Add node to graph
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_graph_add_node(
    gopher_orch_graph_t handle,
    const char* name,
    gopher_orch_runnable_t runnable) GOPHER_ORCH_NOEXCEPT;

/**
 * Add edge from one node to another
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_graph_add_edge(gopher_orch_graph_t handle,
                           const char* from,
                           const char* to) GOPHER_ORCH_NOEXCEPT;

/**
 * Add conditional edge (router-style)
 */
GOPHER_ORCH_API gopher_orch_error_t
gopher_orch_graph_add_conditional_edge(gopher_orch_graph_t handle,
                                       const char* from,
                                       gopher_orch_edge_condition_fn condition,
                                       void* user_context) GOPHER_ORCH_NOEXCEPT;

/**
 * Set entry point
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_graph_set_entry(
    gopher_orch_graph_t handle, const char* node_name) GOPHER_ORCH_NOEXCEPT;

/**
 * Add state channel with reducer
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_graph_add_channel(
    gopher_orch_graph_t handle,
    const char* key,
    gopher_orch_channel_type_t type) GOPHER_ORCH_NOEXCEPT;

/**
 * Compile graph into runnable
 */
GOPHER_ORCH_API gopher_orch_runnable_t
gopher_orch_graph_compile(gopher_orch_graph_t handle) GOPHER_ORCH_NOEXCEPT;

/* ============================================================================
 * Resource Statistics and Debugging
 * ============================================================================
 */

/**
 * Get resource statistics
 */
GOPHER_ORCH_API gopher_orch_error_t gopher_orch_get_resource_stats(
    gopher_orch_size_t* active_count,
    gopher_orch_size_t* total_created,
    gopher_orch_size_t* total_destroyed) GOPHER_ORCH_NOEXCEPT;

/**
 * Check for resource leaks
 * @return Number of leaked resources
 */
GOPHER_ORCH_API gopher_orch_size_t gopher_orch_check_leaks(void)
    GOPHER_ORCH_NOEXCEPT;

/**
 * Print leak report to stderr
 */
GOPHER_ORCH_API void gopher_orch_print_leak_report(void) GOPHER_ORCH_NOEXCEPT;

#ifdef __cplusplus
} /* extern "C" */
#endif

/* ============================================================================
 * RAII Helper Macros (for C++ users of the C API)
 * ============================================================================
 */

#ifdef __cplusplus

#include <functional>
#include <memory>

/* Automatic cleanup guard for any handle */
#define GOPHER_ORCH_AUTO_GUARD(handle, type)                           \
  std::unique_ptr<void, std::function<void(void*)>> _guard_##__LINE__( \
      handle, [](void* h) {                                            \
        if (h) {                                                       \
          auto guard = gopher_orch_guard_create(h, type);              \
          gopher_orch_guard_destroy(&guard);                           \
        }                                                              \
      })

/* Scoped transaction with automatic rollback */
#define GOPHER_ORCH_SCOPED_TRANSACTION(name)                          \
  struct _TxnGuard_##__LINE__ {                                       \
    gopher_orch_transaction_t txn;                                    \
    bool committed = false;                                           \
    _TxnGuard_##__LINE__() : txn(gopher_orch_transaction_create()) {} \
    ~_TxnGuard_##__LINE__() {                                         \
      if (txn && !committed) {                                        \
        gopher_orch_transaction_rollback(&txn);                       \
      }                                                               \
    }                                                                 \
    void commit() {                                                   \
      if (txn) {                                                      \
        gopher_orch_transaction_commit(&txn);                         \
        committed = true;                                             \
      }                                                               \
    }                                                                 \
  } name

#endif /* __cplusplus */

/* ============================================================================
 * RAII Patterns for C Users
 * ============================================================================
 */

/* Guard creation macro */
#define GOPHER_ORCH_GUARD_CREATE(handle, type) \
  gopher_orch_guard_create(handle, type)

/* Safe resource release macro */
#define GOPHER_ORCH_SAFE_RELEASE(guard_ptr) \
  do {                                      \
    if (guard_ptr && *(guard_ptr)) {        \
      gopher_orch_guard_destroy(guard_ptr); \
    }                                       \
  } while (0)

/* Safe transaction cleanup macro */
#define GOPHER_ORCH_SAFE_TXN_CLEANUP(txn_ptr)    \
  do {                                           \
    if (txn_ptr && *(txn_ptr)) {                 \
      gopher_orch_transaction_rollback(txn_ptr); \
    }                                            \
  } while (0)

#endif /* GOPHER_ORCH_FFI_H */
