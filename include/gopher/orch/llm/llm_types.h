#pragma once

// LLM Types - Core types for LLM provider integration
//
// Provides message types, tool call structures, and response types
// for interacting with LLM providers (OpenAI, Anthropic, Ollama, etc.)

#include <chrono>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::core;

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

// Forward declaration
struct ToolCall;

// Message role in conversation
enum class Role {
  SYSTEM,     // System prompt
  USER,       // User message
  ASSISTANT,  // Assistant response
  TOOL        // Tool result
};

// Convert Role to string
inline std::string roleToString(Role role) {
  switch (role) {
    case Role::SYSTEM:
      return "system";
    case Role::USER:
      return "user";
    case Role::ASSISTANT:
      return "assistant";
    case Role::TOOL:
      return "tool";
    default:
      return "user";
  }
}

// Parse string to Role
inline Role parseRole(const std::string& role) {
  if (role == "system") return Role::SYSTEM;
  if (role == "user") return Role::USER;
  if (role == "assistant") return Role::ASSISTANT;
  if (role == "tool") return Role::TOOL;
  return Role::USER;
}

// Tool call requested by LLM
struct ToolCall {
  std::string id;          // Unique ID for this call (used for matching results)
  std::string name;        // Tool name to call
  JsonValue arguments;     // Arguments as JSON

  ToolCall() = default;
  ToolCall(const std::string& id_, const std::string& name_,
           const JsonValue& args_)
      : id(id_), name(name_), arguments(args_) {}
};

// Message in conversation
struct Message {
  Role role;
  std::string content;

  // For tool responses (role = TOOL)
  optional<std::string> tool_call_id;

  // For assistant messages with tool calls
  optional<std::vector<ToolCall>> tool_calls;

  Message() : role(Role::USER) {}

  Message(Role r, const std::string& c)
      : role(r), content(c), tool_call_id(nullopt), tool_calls(nullopt) {}

  // Factory methods for convenience
  static Message system(const std::string& content) {
    return Message(Role::SYSTEM, content);
  }

  static Message user(const std::string& content) {
    return Message(Role::USER, content);
  }

  static Message assistant(const std::string& content) {
    Message msg(Role::ASSISTANT, content);
    return msg;
  }

  static Message assistantWithToolCalls(const std::vector<ToolCall>& calls) {
    Message msg(Role::ASSISTANT, "");
    msg.tool_calls = calls;
    return msg;
  }

  static Message toolResult(const std::string& call_id,
                            const std::string& content) {
    Message msg(Role::TOOL, content);
    msg.tool_call_id = call_id;
    return msg;
  }

  // Check if message has tool calls
  bool hasToolCalls() const {
    return tool_calls.has_value() && !tool_calls->empty();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL SPECIFICATION (For telling LLM what tools are available)
// ═══════════════════════════════════════════════════════════════════════════

struct ToolSpec {
  std::string name;
  std::string description;
  JsonValue parameters;  // JSON Schema for parameters

  ToolSpec() = default;
  ToolSpec(const std::string& n, const std::string& d, const JsonValue& p)
      : name(n), description(d), parameters(p) {}
};

// ═══════════════════════════════════════════════════════════════════════════
// LLM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

struct LLMConfig {
  std::string model;  // e.g., "gpt-4", "claude-3-opus-20240229"

  optional<double> temperature;  // 0.0 - 2.0
  optional<int> max_tokens;      // Max response tokens
  optional<double> top_p;        // Nucleus sampling
  optional<int> seed;            // For reproducibility

  optional<std::vector<std::string>> stop;  // Stop sequences

  // Request timeout
  std::chrono::milliseconds timeout{60000};

  LLMConfig() = default;
  explicit LLMConfig(const std::string& m) : model(m) {}

  // Builder pattern
  LLMConfig& withModel(const std::string& m) {
    model = m;
    return *this;
  }

  LLMConfig& withTemperature(double t) {
    temperature = t;
    return *this;
  }

  LLMConfig& withMaxTokens(int t) {
    max_tokens = t;
    return *this;
  }

  LLMConfig& withTopP(double p) {
    top_p = p;
    return *this;
  }

  LLMConfig& withSeed(int s) {
    seed = s;
    return *this;
  }

  LLMConfig& withStop(const std::vector<std::string>& s) {
    stop = s;
    return *this;
  }

  LLMConfig& withTimeout(std::chrono::milliseconds t) {
    timeout = t;
    return *this;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// USAGE STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

struct Usage {
  int prompt_tokens = 0;
  int completion_tokens = 0;
  int total_tokens = 0;

  Usage() = default;
  Usage(int prompt, int completion)
      : prompt_tokens(prompt),
        completion_tokens(completion),
        total_tokens(prompt + completion) {}
};

// ═══════════════════════════════════════════════════════════════════════════
// LLM RESPONSE
// ═══════════════════════════════════════════════════════════════════════════

struct LLMResponse {
  Message message;            // The response message
  std::string finish_reason;  // "stop", "tool_calls", "length", "content_filter"
  optional<Usage> usage;

  LLMResponse() = default;

  // Check if LLM wants to call tools
  bool hasToolCalls() const { return message.hasToolCalls(); }

  // Get tool calls (empty vector if none)
  const std::vector<ToolCall>& toolCalls() const {
    static const std::vector<ToolCall> empty;
    return message.tool_calls.has_value() ? *message.tool_calls : empty;
  }

  // Check if conversation is complete (no more tool calls needed)
  bool isComplete() const {
    return finish_reason == "stop" || finish_reason == "end_turn";
  }

  // Check if response was truncated due to token limit
  bool isTruncated() const { return finish_reason == "length"; }
};

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING TYPES (Optional, for streaming support)
// ═══════════════════════════════════════════════════════════════════════════

struct StreamDelta {
  optional<std::string> content;     // Content chunk
  optional<ToolCall> tool_call;      // Tool call chunk (partial)
  optional<std::string> finish_reason;
};

struct StreamChunk {
  StreamDelta delta;
  bool is_final = false;
};

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES
// ═══════════════════════════════════════════════════════════════════════════

namespace LLMError {
enum : int {
  OK = 0,
  INVALID_API_KEY = -100,
  RATE_LIMITED = -101,
  CONTEXT_LENGTH_EXCEEDED = -102,
  INVALID_MODEL = -103,
  CONTENT_FILTERED = -104,
  SERVICE_UNAVAILABLE = -105,
  NETWORK_ERROR = -106,
  PARSE_ERROR = -107,
  UNKNOWN = -199
};
}  // namespace LLMError

}  // namespace llm
}  // namespace orch
}  // namespace gopher
