#pragma once

// CallbackHandler - Interface for receiving observability events
//
// Provides hooks for monitoring execution of chains, tools, and custom events.
// Implementations can log, trace, or perform other observability tasks.
//
// All handler methods have default empty implementations, allowing handlers
// to override only the events they care about.

#include <chrono>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace callback {

// =============================================================================
// EventType - Categories of observable events
// =============================================================================

enum class EventType {
  CHAIN_START,  // Runnable chain begins execution
  CHAIN_END,    // Runnable chain completes successfully
  CHAIN_ERROR,  // Runnable chain fails with error
  TOOL_START,   // Tool invocation begins
  TOOL_END,     // Tool invocation completes successfully
  TOOL_ERROR,   // Tool invocation fails with error
  LLM_START,    // LLM request begins (future use)
  LLM_END,      // LLM request completes (future use)
  LLM_ERROR,    // LLM request fails (future use)
  CUSTOM        // User-defined custom event
};

// =============================================================================
// RunInfo - Contextual information about a running operation
// =============================================================================

// RunInfo carries metadata about the current execution context.
// This information flows through the callback chain, enabling:
// - Hierarchical tracing via parent_run_id
// - Timing measurements via start_time
// - Filtering and grouping via tags
// - Custom context via metadata
struct RunInfo {
  std::string run_id;         // Unique identifier for this run
  std::string parent_run_id;  // Parent run ID for hierarchical tracing
  std::string name;           // Human-readable name of the operation
  std::string run_type;       // Type: "chain", "tool", "llm", "graph", etc.
  std::chrono::steady_clock::time_point start_time;  // When execution started
  std::vector<std::string> tags;                     // Tags for filtering
  core::JsonValue metadata;                          // Additional metadata

  RunInfo()
      : start_time(std::chrono::steady_clock::now()),
        metadata(core::JsonValue::object()) {}

  // Calculate duration from start to now
  std::chrono::milliseconds durationMs() const {
    auto now = std::chrono::steady_clock::now();
    return std::chrono::duration_cast<std::chrono::milliseconds>(now -
                                                                 start_time);
  }
};

// =============================================================================
// CallbackHandler - Interface for receiving events
// =============================================================================

// CallbackHandler is the base interface for all callback handlers.
// Implementations override the event methods they want to handle.
// Default implementations are provided (empty) so handlers only need
// to implement what they care about.
//
// All callback methods are called synchronously in the dispatcher thread.
// Handlers should not block or perform expensive operations.
class CallbackHandler {
 public:
  virtual ~CallbackHandler() = default;

  // -------------------------------------------------------------------------
  // Chain Events - Fired for Runnable chain execution
  // -------------------------------------------------------------------------

  // Called when a chain (sequence of runnables) starts execution
  virtual void onChainStart(const RunInfo& info, const core::JsonValue& input) {
    (void)info;
    (void)input;
  }

  // Called when a chain completes successfully
  virtual void onChainEnd(const RunInfo& info, const core::JsonValue& output) {
    (void)info;
    (void)output;
  }

  // Called when a chain fails with an error
  virtual void onChainError(const RunInfo& info, const core::Error& error) {
    (void)info;
    (void)error;
  }

  // -------------------------------------------------------------------------
  // Tool Events - Fired for tool/server invocations
  // -------------------------------------------------------------------------

  // Called when a tool invocation starts
  virtual void onToolStart(const RunInfo& info,
                           const std::string& tool_name,
                           const core::JsonValue& input) {
    (void)info;
    (void)tool_name;
    (void)input;
  }

  // Called when a tool invocation completes successfully
  virtual void onToolEnd(const RunInfo& info,
                         const std::string& tool_name,
                         const core::JsonValue& output) {
    (void)info;
    (void)tool_name;
    (void)output;
  }

  // Called when a tool invocation fails with an error
  virtual void onToolError(const RunInfo& info,
                           const std::string& tool_name,
                           const core::Error& error) {
    (void)info;
    (void)tool_name;
    (void)error;
  }

  // -------------------------------------------------------------------------
  // LLM Events - For future LLM integration
  // -------------------------------------------------------------------------

  // Called when an LLM request starts
  virtual void onLLMStart(const RunInfo& info, const core::JsonValue& input) {
    (void)info;
    (void)input;
  }

  // Called when an LLM request completes
  virtual void onLLMEnd(const RunInfo& info, const core::JsonValue& output) {
    (void)info;
    (void)output;
  }

  // Called when an LLM request fails
  virtual void onLLMError(const RunInfo& info, const core::Error& error) {
    (void)info;
    (void)error;
  }

  // -------------------------------------------------------------------------
  // Custom Events - User-defined events
  // -------------------------------------------------------------------------

  // Called for user-defined custom events
  // event_name: Identifies the event type (e.g., "fsm.transition")
  // data: Event-specific payload
  virtual void onCustomEvent(const std::string& event_name,
                             const core::JsonValue& data) {
    (void)event_name;
    (void)data;
  }

  // -------------------------------------------------------------------------
  // Retry Events - For resilience pattern observability
  // -------------------------------------------------------------------------

  // Called when a retry is about to be attempted
  virtual void onRetry(const RunInfo& info,
                       const core::Error& error,
                       uint32_t attempt,
                       uint32_t max_attempts) {
    (void)info;
    (void)error;
    (void)attempt;
    (void)max_attempts;
  }
};

// =============================================================================
// LoggingCallbackHandler - Logs events for debugging
// =============================================================================

// LoggingCallbackHandler provides a simple logging implementation.
// By default, it uses a simple stdout-based logging. In production,
// you would typically use a proper logging framework.
class LoggingCallbackHandler : public CallbackHandler {
 public:
  // Log level for filtering messages
  enum class LogLevel { DEBUG, INFO, WARN, ERROR };

  explicit LoggingCallbackHandler(LogLevel min_level = LogLevel::INFO)
      : min_level_(min_level) {}

  void onChainStart(const RunInfo& info,
                    const core::JsonValue& input) override {
    log(LogLevel::INFO, "CHAIN_START", info.name, input);
  }

  void onChainEnd(const RunInfo& info, const core::JsonValue& output) override {
    log(LogLevel::INFO, "CHAIN_END",
        info.name + " (" + std::to_string(info.durationMs().count()) + "ms)",
        output);
  }

  void onChainError(const RunInfo& info, const core::Error& error) override {
    logError(LogLevel::ERROR, "CHAIN_ERROR", info.name, error);
  }

  void onToolStart(const RunInfo& info,
                   const std::string& tool_name,
                   const core::JsonValue& input) override {
    log(LogLevel::INFO, "TOOL_START", tool_name, input);
  }

  void onToolEnd(const RunInfo& info,
                 const std::string& tool_name,
                 const core::JsonValue& output) override {
    log(LogLevel::INFO, "TOOL_END",
        tool_name + " (" + std::to_string(info.durationMs().count()) + "ms)",
        output);
  }

  void onToolError(const RunInfo& info,
                   const std::string& tool_name,
                   const core::Error& error) override {
    logError(LogLevel::ERROR, "TOOL_ERROR", tool_name, error);
  }

  void onCustomEvent(const std::string& event_name,
                     const core::JsonValue& data) override {
    log(LogLevel::DEBUG, "CUSTOM", event_name, data);
  }

  void onRetry(const RunInfo& info,
               const core::Error& error,
               uint32_t attempt,
               uint32_t max_attempts) override {
    std::string msg = info.name + " attempt " + std::to_string(attempt) + "/" +
                      std::to_string(max_attempts);
    logError(LogLevel::WARN, "RETRY", msg, error);
  }

 protected:
  // Override these methods to integrate with your logging framework
  virtual void log(LogLevel level,
                   const std::string& event,
                   const std::string& name,
                   const core::JsonValue& data) {
    if (level < min_level_) {
      return;
    }
    // Simple stdout logging - replace with proper logging in production
    printf("[%s] %s - %s\n", event.c_str(), name.c_str(),
           data.toString().c_str());
  }

  virtual void logError(LogLevel level,
                        const std::string& event,
                        const std::string& name,
                        const core::Error& error) {
    if (level < min_level_) {
      return;
    }
    printf("[%s] %s - %s (code: %d)\n", event.c_str(), name.c_str(),
           error.message.c_str(), error.code);
  }

 private:
  LogLevel min_level_;
};

// =============================================================================
// NoOpCallbackHandler - Does nothing (for testing/disabling callbacks)
// =============================================================================

class NoOpCallbackHandler : public CallbackHandler {
 public:
  // All methods use default empty implementations
};

}  // namespace callback
}  // namespace orch
}  // namespace gopher
