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
struct AgentState {
  AgentStatus status = AgentStatus::IDLE;

  // Conversation history
  std::vector<Message> messages;

  // Steps taken
  std::vector<AgentStep> steps;

  // Current iteration
  int current_iteration = 0;

  // Token usage
  Usage total_usage;

  // Timing
  std::chrono::steady_clock::time_point start_time;
  std::chrono::milliseconds elapsed{0};

  // Error info (if failed)
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
