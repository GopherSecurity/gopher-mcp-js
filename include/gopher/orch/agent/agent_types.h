#pragma once

// Agent Types - Core types for AI agent implementation
//
// Provides configuration, state, and result types for running
// ReAct-style agents that combine LLM reasoning with tool execution.

#include <chrono>
#include <functional>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"
#include "gopher/orch/llm/llm_types.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;
using namespace gopher::orch::llm;

// ═══════════════════════════════════════════════════════════════════════════
// AGENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

struct AgentConfig {
  // LLM configuration
  LLMConfig llm_config;

  // System prompt for the agent
  std::string system_prompt;

  // Maximum iterations in the ReAct loop (prevents infinite loops)
  int max_iterations = 10;

  // Maximum total tokens across all iterations
  optional<int> max_total_tokens;

  // Timeout for entire agent run
  std::chrono::milliseconds timeout{300000};  // 5 minutes default

  // Tool execution settings
  bool parallel_tool_calls = true;  // Execute multiple tool calls in parallel

  // Callbacks
  bool enable_step_callbacks = true;

  AgentConfig() = default;

  explicit AgentConfig(const std::string& model) : llm_config(model) {}

  AgentConfig& withModel(const std::string& model) {
    llm_config.model = model;
    return *this;
  }

  AgentConfig& withSystemPrompt(const std::string& prompt) {
    system_prompt = prompt;
    return *this;
  }

  AgentConfig& withTemperature(double t) {
    llm_config.temperature = t;
    return *this;
  }

  AgentConfig& withMaxTokens(int tokens) {
    llm_config.max_tokens = tokens;
    return *this;
  }

  AgentConfig& withMaxIterations(int iterations) {
    max_iterations = iterations;
    return *this;
  }

  AgentConfig& withTimeout(std::chrono::milliseconds t) {
    timeout = t;
    return *this;
  }

  AgentConfig& withParallelToolCalls(bool enabled) {
    parallel_tool_calls = enabled;
    return *this;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AGENT STATE
// ═══════════════════════════════════════════════════════════════════════════

// Current state of agent execution
enum class AgentStatus {
  IDLE,                   // Not started
  RUNNING,                // Currently executing
  COMPLETED,              // Finished successfully
  FAILED,                 // Error occurred
  CANCELLED,              // Cancelled by user
  MAX_ITERATIONS_REACHED  // Hit iteration limit
};

// Convert status to string
inline std::string agentStatusToString(AgentStatus status) {
  switch (status) {
    case AgentStatus::IDLE:
      return "idle";
    case AgentStatus::RUNNING:
      return "running";
    case AgentStatus::COMPLETED:
      return "completed";
    case AgentStatus::FAILED:
      return "failed";
    case AgentStatus::CANCELLED:
      return "cancelled";
    case AgentStatus::MAX_ITERATIONS_REACHED:
      return "max_iterations_reached";
    default:
      return "unknown";
  }
}

// Record of a single tool execution
struct ToolExecution {
  std::string tool_name;
  std::string call_id;
  JsonValue input;
  JsonValue output;
  bool success = true;
  std::string error_message;
  std::chrono::milliseconds duration{0};
};

// Record of a single agent step (one LLM call + tool executions)
struct AgentStep {
  int step_number = 0;

  // LLM response for this step
  Message llm_message;
  optional<Usage> llm_usage;

  // Tool executions (if any)
  std::vector<ToolExecution> tool_executions;

  // Timing
  std::chrono::milliseconds llm_duration{0};
  std::chrono::milliseconds tools_duration{0};
};

// Current state during agent execution
//
// Supports reducer-based state updates for graph-style execution.
// Messages use APPEND semantics (like LangGraph's add_messages),
// other fields use last-write-wins semantics.
struct AgentState {
  AgentStatus status = AgentStatus::IDLE;

  // Conversation history (uses APPEND reducer)
  std::vector<Message> messages;

  // Steps taken (uses APPEND reducer)
  std::vector<AgentStep> steps;

  // Current iteration (last-write-wins)
  int current_iteration = 0;

  // Remaining steps before max iterations (last-write-wins)
  int remaining_steps = 10;

  // Token usage (accumulated)
  Usage total_usage;

  // Timing
  std::chrono::steady_clock::time_point start_time;
  std::chrono::milliseconds elapsed{0};

  // Error info (if failed, last-write-wins)
  optional<Error> error;

  // Check if agent is still running
  bool isRunning() const { return status == AgentStatus::RUNNING; }

  // Check if agent completed successfully
  bool isCompleted() const { return status == AgentStatus::COMPLETED; }

  // Get last message content
  std::string lastContent() const {
    if (messages.empty())
      return "";
    return messages.back().content;
  }

  // =========================================================================
  // REDUCER - Merges state updates following LangGraph semantics
  // =========================================================================

  // Reduce (merge) two states. Used by graph execution to combine node outputs.
  // - messages: APPEND (new messages are appended to existing)
  // - steps: APPEND (new steps are appended)
  // - current_iteration: last-write-wins
  // - remaining_steps: last-write-wins
  // - total_usage: accumulated (tokens are added)
  // - status, error: last-write-wins
  static AgentState reduce(const AgentState& current, const AgentState& update) {
    AgentState result;

    // APPEND: messages
    result.messages = current.messages;
    for (const auto& msg : update.messages) {
      result.messages.push_back(msg);
    }

    // APPEND: steps
    result.steps = current.steps;
    for (const auto& step : update.steps) {
      result.steps.push_back(step);
    }

    // LAST-WRITE-WINS: other fields
    result.status = update.status;
    result.current_iteration = update.current_iteration;
    result.remaining_steps = update.remaining_steps;
    result.error = update.error;
    result.elapsed = update.elapsed;
    result.start_time = update.start_time;

    // ACCUMULATE: token usage
    result.total_usage.prompt_tokens =
        current.total_usage.prompt_tokens + update.total_usage.prompt_tokens;
    result.total_usage.completion_tokens =
        current.total_usage.completion_tokens + update.total_usage.completion_tokens;
    result.total_usage.total_tokens =
        current.total_usage.total_tokens + update.total_usage.total_tokens;

    return result;
  }

  // =========================================================================
  // JSON SERIALIZATION - For graph node I/O
  // =========================================================================

  // Convert state to JSON for passing between graph nodes
  JsonValue toJson() const {
    JsonValue json = JsonValue::object();

    json["status"] = agentStatusToString(status);
    json["current_iteration"] = current_iteration;
    json["remaining_steps"] = remaining_steps;

    // Messages array
    JsonValue messages_arr = JsonValue::array();
    for (const auto& msg : messages) {
      JsonValue msg_json = JsonValue::object();
      msg_json["role"] = roleToString(msg.role);
      msg_json["content"] = msg.content;
      if (msg.tool_call_id.has_value()) {
        msg_json["tool_call_id"] = *msg.tool_call_id;
      }
      if (msg.hasToolCalls()) {
        JsonValue calls_arr = JsonValue::array();
        for (const auto& call : *msg.tool_calls) {
          JsonValue call_json = JsonValue::object();
          call_json["id"] = call.id;
          call_json["name"] = call.name;
          call_json["arguments"] = call.arguments;
          calls_arr.push_back(call_json);
        }
        msg_json["tool_calls"] = calls_arr;
      }
      messages_arr.push_back(msg_json);
    }
    json["messages"] = messages_arr;

    // Usage
    JsonValue usage_json = JsonValue::object();
    usage_json["prompt_tokens"] = total_usage.prompt_tokens;
    usage_json["completion_tokens"] = total_usage.completion_tokens;
    usage_json["total_tokens"] = total_usage.total_tokens;
    json["usage"] = usage_json;

    // Error if present
    if (error.has_value()) {
      JsonValue err_json = JsonValue::object();
      err_json["code"] = error->code;
      err_json["message"] = error->message;
      json["error"] = err_json;
    }

    return json;
  }

  // Parse state from JSON
  static AgentState fromJson(const JsonValue& json) {
    AgentState state;

    if (!json.isObject()) {
      return state;
    }

    // Parse status
    if (json.contains("status") && json["status"].isString()) {
      std::string status_str = json["status"].getString();
      if (status_str == "idle") state.status = AgentStatus::IDLE;
      else if (status_str == "running") state.status = AgentStatus::RUNNING;
      else if (status_str == "completed") state.status = AgentStatus::COMPLETED;
      else if (status_str == "failed") state.status = AgentStatus::FAILED;
      else if (status_str == "cancelled") state.status = AgentStatus::CANCELLED;
      else if (status_str == "max_iterations_reached")
        state.status = AgentStatus::MAX_ITERATIONS_REACHED;
    }

    // Parse iteration counts
    if (json.contains("current_iteration") && json["current_iteration"].isNumber()) {
      state.current_iteration = json["current_iteration"].getInt();
    }
    if (json.contains("remaining_steps") && json["remaining_steps"].isNumber()) {
      state.remaining_steps = json["remaining_steps"].getInt();
    }

    // Parse messages
    if (json.contains("messages") && json["messages"].isArray()) {
      const auto& msgs_arr = json["messages"];
      for (size_t i = 0; i < msgs_arr.size(); ++i) {
        const auto& msg_json = msgs_arr[i];
        if (!msg_json.isObject()) continue;

        Role role = Role::USER;
        if (msg_json.contains("role") && msg_json["role"].isString()) {
          role = parseRole(msg_json["role"].getString());
        }

        std::string content;
        if (msg_json.contains("content") && msg_json["content"].isString()) {
          content = msg_json["content"].getString();
        }

        Message msg(role, content);

        if (msg_json.contains("tool_call_id") && msg_json["tool_call_id"].isString()) {
          msg.tool_call_id = msg_json["tool_call_id"].getString();
        }

        if (msg_json.contains("tool_calls") && msg_json["tool_calls"].isArray()) {
          std::vector<ToolCall> calls;
          const auto& calls_arr = msg_json["tool_calls"];
          for (size_t j = 0; j < calls_arr.size(); ++j) {
            const auto& call_json = calls_arr[j];
            if (!call_json.isObject()) continue;
            ToolCall call;
            if (call_json.contains("id") && call_json["id"].isString()) {
              call.id = call_json["id"].getString();
            }
            if (call_json.contains("name") && call_json["name"].isString()) {
              call.name = call_json["name"].getString();
            }
            if (call_json.contains("arguments")) {
              call.arguments = call_json["arguments"];
            }
            calls.push_back(std::move(call));
          }
          if (!calls.empty()) {
            msg.tool_calls = std::move(calls);
          }
        }

        state.messages.push_back(std::move(msg));
      }
    }

    // Parse usage
    if (json.contains("usage") && json["usage"].isObject()) {
      const auto& usage_json = json["usage"];
      if (usage_json.contains("prompt_tokens") && usage_json["prompt_tokens"].isNumber()) {
        state.total_usage.prompt_tokens = usage_json["prompt_tokens"].getInt();
      }
      if (usage_json.contains("completion_tokens") &&
          usage_json["completion_tokens"].isNumber()) {
        state.total_usage.completion_tokens = usage_json["completion_tokens"].getInt();
      }
      if (usage_json.contains("total_tokens") && usage_json["total_tokens"].isNumber()) {
        state.total_usage.total_tokens = usage_json["total_tokens"].getInt();
      }
    }

    // Parse error
    if (json.contains("error") && json["error"].isObject()) {
      const auto& err_json = json["error"];
      int code = 0;
      std::string message;
      if (err_json.contains("code") && err_json["code"].isNumber()) {
        code = err_json["code"].getInt();
      }
      if (err_json.contains("message") && err_json["message"].isString()) {
        message = err_json["message"].getString();
      }
      state.error = Error(code, message);
    }

    return state;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AGENT RESULT
// ═══════════════════════════════════════════════════════════════════════════

struct AgentResult {
  AgentStatus status = AgentStatus::IDLE;

  // Final response from the agent
  std::string response;

  // Full conversation history
  std::vector<Message> messages;

  // All steps taken
  std::vector<AgentStep> steps;

  // Total usage across all LLM calls
  Usage total_usage;

  // Total time taken
  std::chrono::milliseconds duration{0};

  // Error info (if failed)
  optional<Error> error;

  // Check if successful
  bool isSuccess() const { return status == AgentStatus::COMPLETED; }

  // Get number of iterations
  int iterationCount() const { return static_cast<int>(steps.size()); }
};

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════

// Called when agent completes
using AgentCallback = std::function<void(Result<AgentResult>)>;

// Called after each step (for progress monitoring)
using StepCallback = std::function<void(const AgentStep&)>;

// Called before tool execution (can modify/approve)
using ToolApprovalCallback = std::function<bool(const ToolCall&)>;

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES
// ═══════════════════════════════════════════════════════════════════════════

namespace AgentError {
enum : int {
  OK = 0,
  NO_PROVIDER = -200,
  NO_TOOLS = -201,
  MAX_ITERATIONS = -202,
  TIMEOUT = -203,
  TOOL_EXECUTION_FAILED = -204,
  LLM_ERROR = -205,
  CANCELLED = -206,
  UNKNOWN = -299
};
}  // namespace AgentError

}  // namespace agent
}  // namespace orch
}  // namespace gopher
