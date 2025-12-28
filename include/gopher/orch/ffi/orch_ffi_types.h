/**
 * @file orch_ffi_types.h
 * @brief FFI-safe type definitions for gopher-orch C API
 *
 * This header provides FFI-safe type definitions enabling gopher-orch to be
 * used from any language with C FFI support (Python, Rust, Go, Node.js, etc.).
 *
 * Design Principles (following gopher-mcp C API patterns):
 * - All types are FFI-safe primitives or opaque handles
 * - Opaque handles hide C++ implementation details
 * - Clear ownership semantics: OWNED vs BORROWED annotations
 * - Thread-local error handling for non-intrusive error propagation
 * - JSON-to-JSON as the primary FFI boundary (type-erased)
 * - Callback convention: function pointer + void* context
 *
 * Architecture:
 * - All operations happen in dispatcher thread context
 * - Callbacks are invoked in dispatcher thread
 * - RAII guards ensure automatic cleanup
 * - Follows Create -> Configure -> Use -> Destroy lifecycle
 *
 * Memory Management:
 * - All handles are reference-counted internally
 * - Automatic cleanup through RAII guards
 * - Optional manual resource management with explicit _free() functions
 * - Thread-safe resource tracking in debug mode
 */

#ifndef GOPHER_ORCH_FFI_TYPES_H
#define GOPHER_ORCH_FFI_TYPES_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Platform Detection and Export Macros
 * ============================================================================
 */

#if defined(_WIN32) || defined(__CYGWIN__)
#ifdef GOPHER_ORCH_BUILDING_DLL
#define GOPHER_ORCH_API __declspec(dllexport)
#else
#define GOPHER_ORCH_API __declspec(dllimport)
#endif
#else
#if __GNUC__ >= 4 || defined(__clang__)
#define GOPHER_ORCH_API __attribute__((visibility("default")))
#else
#define GOPHER_ORCH_API
#endif
#endif

/* C++ noexcept compatibility */
#ifdef __cplusplus
#define GOPHER_ORCH_NOEXCEPT noexcept
#else
#define GOPHER_ORCH_NOEXCEPT
#endif

/* ============================================================================
 * FFI-Safe Primitive Types
 * ============================================================================
 */

/** Boolean type - 0 = false, non-zero = true */
typedef int32_t gopher_orch_bool_t;
#define GOPHER_ORCH_FALSE 0
#define GOPHER_ORCH_TRUE 1

/** Size type for counts and lengths */
typedef size_t gopher_orch_size_t;

/** Duration in milliseconds */
typedef uint64_t gopher_orch_duration_ms_t;

/* ============================================================================
 * Opaque Handle Types
 *
 * All handles are pointers to implementation structs.
 * NULL indicates invalid/error.
 * Forward declarations hide C++ implementation details.
 *
 * Handles are reference-counted internally:
 * - gopher_orch_*_add_ref() increments reference count
 * - gopher_orch_*_release() decrements reference count
 * - When count reaches 0, resource is destroyed
 * ============================================================================
 */

/** Dispatcher handle - event loop for async operations */
typedef struct gopher_orch_dispatcher_impl* gopher_orch_dispatcher_t;

/**
 * Runnable handle - type-erased JSON-to-JSON operation
 *
 * This is the core abstraction: all runnables are exposed as JSON->JSON
 * transformations at the FFI boundary, regardless of their C++ template types.
 */
typedef struct gopher_orch_runnable_impl* gopher_orch_runnable_t;

/** Server handle - MCP server connection */
typedef struct gopher_orch_server_impl* gopher_orch_server_t;

/** JSON value handle - wrapper around internal JSON type */
typedef struct gopher_orch_json_impl* gopher_orch_json_t;

/** Configuration handle - RunnableConfig wrapper */
typedef struct gopher_orch_config_impl* gopher_orch_config_t;

/** Callback manager handle - for observability */
typedef struct gopher_orch_callback_manager_impl* gopher_orch_callback_manager_t;

/** Approval handler handle - for human-in-the-loop */
typedef struct gopher_orch_approval_handler_impl* gopher_orch_approval_handler_t;

/** Sequence builder handle */
typedef struct gopher_orch_sequence_impl* gopher_orch_sequence_t;

/** Parallel builder handle */
typedef struct gopher_orch_parallel_impl* gopher_orch_parallel_t;

/** Router builder handle */
typedef struct gopher_orch_router_impl* gopher_orch_router_t;

/** State machine handle */
typedef struct gopher_orch_fsm_impl* gopher_orch_fsm_t;

/** State graph builder handle */
typedef struct gopher_orch_graph_impl* gopher_orch_graph_t;

/** Compiled state graph handle (runnable) */
typedef struct gopher_orch_compiled_graph_impl* gopher_orch_compiled_graph_t;

/** Cancellation token handle */
typedef struct gopher_orch_cancel_token_impl* gopher_orch_cancel_token_t;

/** Iterator handle - for collections */
typedef struct gopher_orch_iterator_impl* gopher_orch_iterator_t;

/** RAII guard handle - for automatic cleanup */
typedef struct gopher_orch_guard_impl* gopher_orch_guard_t;

/** Transaction handle - for atomic multi-resource operations */
typedef struct gopher_orch_transaction_impl* gopher_orch_transaction_t;

/* ============================================================================
 * Type ID Enumeration
 *
 * Used for runtime type checking and RAII guard type validation.
 * ============================================================================
 */

typedef enum {
  GOPHER_ORCH_TYPE_UNKNOWN = 0,
  GOPHER_ORCH_TYPE_DISPATCHER = 1,
  GOPHER_ORCH_TYPE_RUNNABLE = 2,
  GOPHER_ORCH_TYPE_SERVER = 3,
  GOPHER_ORCH_TYPE_JSON = 4,
  GOPHER_ORCH_TYPE_CONFIG = 5,
  GOPHER_ORCH_TYPE_CALLBACK_MANAGER = 6,
  GOPHER_ORCH_TYPE_APPROVAL_HANDLER = 7,
  GOPHER_ORCH_TYPE_SEQUENCE = 8,
  GOPHER_ORCH_TYPE_PARALLEL = 9,
  GOPHER_ORCH_TYPE_ROUTER = 10,
  GOPHER_ORCH_TYPE_FSM = 11,
  GOPHER_ORCH_TYPE_GRAPH = 12,
  GOPHER_ORCH_TYPE_COMPILED_GRAPH = 13,
  GOPHER_ORCH_TYPE_CANCEL_TOKEN = 14,
  GOPHER_ORCH_TYPE_ITERATOR = 15,
  GOPHER_ORCH_TYPE_GUARD = 16,
  GOPHER_ORCH_TYPE_TRANSACTION = 17,
} gopher_orch_type_id_t;

/* ============================================================================
 * Error Codes
 *
 * Negative values indicate errors, zero indicates success.
 * Use gopher_orch_last_error() for detailed error information.
 * ============================================================================
 */

typedef enum {
  /* Success */
  GOPHER_ORCH_OK = 0,

  /* Handle/argument errors */
  GOPHER_ORCH_ERROR_INVALID_HANDLE = -1,
  GOPHER_ORCH_ERROR_INVALID_ARGUMENT = -2,
  GOPHER_ORCH_ERROR_NULL_POINTER = -3,

  /* Resource errors */
  GOPHER_ORCH_ERROR_NOT_FOUND = -10,
  GOPHER_ORCH_ERROR_ALREADY_EXISTS = -11,
  GOPHER_ORCH_ERROR_RESOURCE_LIMIT = -12,
  GOPHER_ORCH_ERROR_NO_MEMORY = -13,

  /* Connection errors */
  GOPHER_ORCH_ERROR_CONNECTION_FAILED = -20,
  GOPHER_ORCH_ERROR_NOT_CONNECTED = -21,
  GOPHER_ORCH_ERROR_TIMEOUT = -22,

  /* State machine errors */
  GOPHER_ORCH_ERROR_INVALID_TRANSITION = -30,
  GOPHER_ORCH_ERROR_GUARD_REJECTED = -31,
  GOPHER_ORCH_ERROR_INVALID_STATE = -32,

  /* Execution errors */
  GOPHER_ORCH_ERROR_CANCELLED = -40,
  GOPHER_ORCH_ERROR_APPROVAL_DENIED = -41,
  GOPHER_ORCH_ERROR_CIRCUIT_OPEN = -42,
  GOPHER_ORCH_ERROR_FALLBACK_EXHAUSTED = -43,

  /* Parse/format errors */
  GOPHER_ORCH_ERROR_PARSE_ERROR = -50,
  GOPHER_ORCH_ERROR_INVALID_JSON = -51,

  /* Internal errors */
  GOPHER_ORCH_ERROR_INTERNAL = -90,
  GOPHER_ORCH_ERROR_NOT_IMPLEMENTED = -91,
  GOPHER_ORCH_ERROR_UNKNOWN = -99
} gopher_orch_error_t;

/* ============================================================================
 * Structured Error Information
 *
 * Provides detailed error context via thread-local storage.
 * Error messages are valid until the next API call on the same thread.
 * ============================================================================
 */

typedef struct {
  gopher_orch_error_t code;  /* Error code */
  const char* message;       /* BORROWED: Error message, valid until next call */
  const char* details;       /* BORROWED: Additional context, may be NULL */
  const char* file;          /* BORROWED: Source file where error occurred */
  int32_t line;              /* Source line number */
} gopher_orch_error_info_t;

/* ============================================================================
 * FFI-Safe String Types
 *
 * Strings are passed as const char* (null-terminated, UTF-8 encoded).
 * For strings returned by the API:
 * - BORROWED: Valid until next API call or handle destruction
 * - OWNED: Caller must free with gopher_orch_free()
 * ============================================================================
 */

/** Non-owning string view for input parameters */
typedef struct {
  const char* data;           /* UTF-8 encoded, may be NULL */
  gopher_orch_size_t length;  /* Length in bytes (excluding null terminator) */
} gopher_orch_string_view_t;

/** Owning string buffer for output parameters */
typedef struct {
  char* data;                 /* UTF-8 encoded, null-terminated */
  gopher_orch_size_t length;  /* Length in bytes (excluding null terminator) */
  gopher_orch_size_t capacity;/* Allocated capacity */
} gopher_orch_string_buffer_t;

/* ============================================================================
 * Callback Function Types
 *
 * All callbacks follow the pattern: function pointer + void* user_context
 * Callbacks are ALWAYS invoked in the dispatcher thread context.
 *
 * Convention for JSON callbacks (following the FFI analysis):
 *   (const char* input_json, void* context) -> char*
 * But we use gopher_orch_json_t handles for efficiency (avoid re-parsing).
 * ============================================================================
 */

/**
 * Generic work callback - posted to dispatcher thread
 * @param user_context User-provided context data
 *
 * Note: noexcept is not valid on typedef function pointers in C++14.
 * Callbacks should not throw exceptions across the FFI boundary.
 */
typedef void (*gopher_orch_work_fn)(void* user_context);

/**
 * Destructor callback - called when callback registration is removed
 * @param user_context User-provided context to cleanup
 */
typedef void (*gopher_orch_destructor_fn)(void* user_context);

/**
 * Async completion callback for JSON results
 * OWNERSHIP: result is OWNED by callback - must call gopher_orch_json_release
 *
 * @param user_context User-provided context data
 * @param error Error code (GOPHER_ORCH_OK on success)
 * @param result JSON result handle, NULL on error, OWNED by callback
 */
typedef void (*gopher_orch_completion_fn)(
    void* user_context,
    gopher_orch_error_t error,
    gopher_orch_json_t result);

/**
 * State transition observer callback
 *
 * @param user_context User-provided context data
 * @param from_state Previous state ID
 * @param to_state New state ID
 * @param event Triggering event ID
 */
typedef void (*gopher_orch_transition_fn)(
    void* user_context,
    int32_t from_state,
    int32_t to_state,
    int32_t event);

/**
 * State machine guard callback - return non-zero to allow transition
 *
 * @param user_context User-provided context data
 * @param from_state Current state ID
 * @param event Triggering event ID
 * @return Non-zero to allow transition, zero to reject
 */
typedef int32_t (*gopher_orch_guard_fn)(
    void* user_context,
    int32_t from_state,
    int32_t event);

/**
 * State machine action callback
 *
 * @param user_context User-provided context data
 * @param from_state Previous state ID
 * @param to_state New state ID
 * @param event Triggering event ID
 */
typedef void (*gopher_orch_action_fn)(
    void* user_context,
    int32_t from_state,
    int32_t to_state,
    int32_t event);

/**
 * Router condition callback - return non-zero if route should be taken
 *
 * @param user_context User-provided context data
 * @param input Input JSON value, BORROWED - do not destroy
 * @return Non-zero if this route should be taken
 */
typedef int32_t (*gopher_orch_condition_fn)(
    void* user_context,
    gopher_orch_json_t input);

/**
 * StateGraph conditional edge callback - returns destination node name
 * OWNERSHIP: Returned string is BORROWED - valid only during callback
 *
 * @param user_context User-provided context data
 * @param state Current graph state, BORROWED - do not destroy
 * @return Destination node name, BORROWED, or NULL to end
 */
typedef const char* (*gopher_orch_edge_condition_fn)(
    void* user_context,
    gopher_orch_json_t state);

/**
 * Lambda function for custom runnables
 * OWNERSHIP: input is BORROWED, return value is OWNED by caller
 *
 * This is the core FFI pattern: (JSON input, context) -> JSON output
 *
 * @param user_context User-provided context data
 * @param input Input JSON value, BORROWED - do not destroy
 * @param out_error Output error code
 * @return Result JSON value, OWNED by caller, NULL on error
 */
typedef gopher_orch_json_t (*gopher_orch_lambda_fn)(
    void* user_context,
    gopher_orch_json_t input,
    gopher_orch_error_t* out_error);

/**
 * Approval request callback for human-in-the-loop
 *
 * @param user_context User-provided context data
 * @param action_name Name of the action requiring approval, BORROWED
 * @param preview Preview data for review, BORROWED - do not destroy
 * @param prompt Human-readable prompt, BORROWED
 * @param out_approved Output: set to non-zero to approve
 * @param out_reason Output: reason for decision, OWNED by caller (must free)
 * @param out_modifications Output: optional input modifications, OWNED (may be NULL)
 */
typedef void (*gopher_orch_approval_fn)(
    void* user_context,
    const char* action_name,
    gopher_orch_json_t preview,
    const char* prompt,
    gopher_orch_bool_t* out_approved,
    char** out_reason,
    gopher_orch_json_t* out_modifications);

/**
 * Chain start/end event callback
 *
 * @param user_context User-provided context data
 * @param run_id Unique run identifier, BORROWED
 * @param name Chain name, BORROWED
 * @param data Input/output data, BORROWED - do not destroy
 */
typedef void (*gopher_orch_chain_event_fn)(
    void* user_context,
    const char* run_id,
    const char* name,
    gopher_orch_json_t data);

/**
 * Chain error event callback
 */
typedef void (*gopher_orch_chain_error_fn)(
    void* user_context,
    const char* run_id,
    const char* name,
    gopher_orch_error_t error,
    const char* message);

/**
 * Tool start/end event callback
 */
typedef void (*gopher_orch_tool_event_fn)(
    void* user_context,
    const char* run_id,
    const char* tool_name,
    gopher_orch_json_t data);

/**
 * Tool error event callback
 */
typedef void (*gopher_orch_tool_error_fn)(
    void* user_context,
    const char* run_id,
    const char* tool_name,
    gopher_orch_error_t error,
    const char* message);

/**
 * Retry event callback
 */
typedef void (*gopher_orch_retry_fn)(
    void* user_context,
    const char* run_id,
    const char* name,
    gopher_orch_error_t error,
    uint32_t attempt,
    uint32_t max_attempts);

/**
 * Custom event callback
 */
typedef void (*gopher_orch_custom_event_fn)(
    void* user_context,
    const char* event_name,
    gopher_orch_json_t data);

/**
 * Guard cleanup callback for RAII guards
 *
 * @param resource Resource to cleanup
 */
typedef void (*gopher_orch_cleanup_fn)(void* resource);

/* ============================================================================
 * Configuration Structures
 * ============================================================================
 */

/** Retry policy configuration */
typedef struct {
  uint32_t max_attempts;        /* Maximum number of attempts (1 = no retry) */
  uint64_t initial_delay_ms;    /* Initial delay between retries */
  double backoff_multiplier;    /* Multiplier for exponential backoff */
  uint64_t max_delay_ms;        /* Maximum delay between retries */
  gopher_orch_bool_t jitter;    /* Add random jitter to delays */
} gopher_orch_retry_policy_t;

/** Circuit breaker policy configuration */
typedef struct {
  uint32_t failure_threshold;   /* Failures before opening circuit */
  uint64_t recovery_timeout_ms; /* Time before attempting half-open */
  uint32_t half_open_max_calls; /* Max calls in half-open state */
} gopher_orch_circuit_breaker_policy_t;

/** MCP server transport type */
typedef enum {
  GOPHER_ORCH_TRANSPORT_STDIO = 0,
  GOPHER_ORCH_TRANSPORT_SSE = 1,
  GOPHER_ORCH_TRANSPORT_WEBSOCKET = 2
} gopher_orch_transport_type_t;

/** MCP server configuration */
typedef struct {
  const char* name;             /* Server name */
  gopher_orch_transport_type_t transport;

  /* Stdio transport options */
  const char* command;          /* Command to execute */
  const char* const* args;      /* Command arguments (NULL-terminated) */
  gopher_orch_size_t args_count;
  const char* const* env_keys;  /* Environment variable keys */
  const char* const* env_values;/* Environment variable values */
  gopher_orch_size_t env_count;

  /* SSE/WebSocket transport options */
  const char* url;
  const char* const* header_keys;
  const char* const* header_values;
  gopher_orch_size_t header_count;

  /* Timeouts */
  uint64_t connect_timeout_ms;
  uint64_t request_timeout_ms;
} gopher_orch_mcp_config_t;

/** Callback handler configuration */
typedef struct {
  gopher_orch_chain_event_fn on_chain_start;
  gopher_orch_chain_event_fn on_chain_end;
  gopher_orch_chain_error_fn on_chain_error;
  gopher_orch_tool_event_fn on_tool_start;
  gopher_orch_tool_event_fn on_tool_end;
  gopher_orch_tool_error_fn on_tool_error;
  gopher_orch_retry_fn on_retry;
  gopher_orch_custom_event_fn on_custom_event;
  void* user_context;
  gopher_orch_destructor_fn destructor;  /* Called when handler is removed */
} gopher_orch_callback_handler_config_t;

/** Transaction options */
typedef struct {
  gopher_orch_bool_t auto_rollback;   /* Auto-rollback if not committed */
  gopher_orch_bool_t strict_ordering; /* Cleanup in reverse order (LIFO) */
  uint32_t max_resources;             /* Maximum resources (0 = unlimited) */
} gopher_orch_transaction_opts_t;

/** State graph node configuration */
typedef struct {
  const char* name;             /* Node name */
  gopher_orch_runnable_t runnable;  /* Associated runnable (may be NULL) */
  const char* output_key;       /* Key to write output to state (NULL for none) */
} gopher_orch_node_config_t;

/** State channel type for reducers */
typedef enum {
  GOPHER_ORCH_CHANNEL_LAST_VALUE = 0,   /* Keep last value */
  GOPHER_ORCH_CHANNEL_APPEND_LIST = 1,  /* Append to list */
  GOPHER_ORCH_CHANNEL_MERGE_OBJECT = 2, /* Merge objects */
} gopher_orch_channel_type_t;

#ifdef __cplusplus
}
#endif

#endif /* GOPHER_ORCH_FFI_TYPES_H */
