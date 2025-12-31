#pragma once

#include "gopher/orch/core/types.h"
#include <vector>
#include <string>
#include <chrono>

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::core;

// Additional error codes for LLM operations
namespace OrchError {
enum Code : int {
    OK = 0,
    INVALID_ARGUMENT = -1,
    API_ERROR = -100,
    AUTHENTICATION_FAILED = -101,
    PERMISSION_DENIED = -102,
    NOT_FOUND = -103,
    RATE_LIMITED = -104,
    PARSE_ERROR = -105,
    SERVICE_UNAVAILABLE = -106,
    EXECUTION_ERROR = -107
};
}  // namespace OrchError

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════

// Forward declaration
struct ToolCall;

struct Message {
    enum class Role { 
        SYSTEM, 
        USER, 
        ASSISTANT, 
        TOOL 
    };

    Role role;
    std::string content;
    
    // For tool responses (role = TOOL)
    optional<std::string> tool_call_id;
    
    // For assistant messages with tool calls
    optional<std::vector<ToolCall>> tool_calls;
    
    // Factory methods
    static Message system(const std::string& content) {
        return {Role::SYSTEM, content, nullopt, nullopt};
    }
    
    static Message user(const std::string& content) {
        return {Role::USER, content, nullopt, nullopt};
    }
    
    static Message assistant(const std::string& content) {
        return {Role::ASSISTANT, content, nullopt, nullopt};
    }
    
    static Message assistantWithTools(const std::string& content, 
                                       const std::vector<ToolCall>& calls) {
        return {Role::ASSISTANT, content, nullopt, calls};
    }
    
    static Message toolResult(const std::string& tool_call_id,
                               const std::string& content) {
        return {Role::TOOL, content, tool_call_id, nullopt};
    }
};

// ═══════════════════════════════════════════════════════════════════════
// TOOL CALL (from LLM response)
// ═══════════════════════════════════════════════════════════════════════

struct ToolCall {
    std::string id;          // Unique ID for this call
    std::string name;        // Tool name to call
    JsonValue arguments;     // Arguments as JSON
};

// ═══════════════════════════════════════════════════════════════════════
// TOOL SPEC (for telling LLM what tools are available)
// ═══════════════════════════════════════════════════════════════════════

struct ToolSpec {
    std::string name;
    std::string description;
    JsonValue parameters;  // JSON Schema for parameters
    
    // Convert to JSON for API calls
    JsonValue toJson() const {
        JsonValue json = JsonValue::object();
        json["name"] = name;
        json["description"] = description;
        json["parameters"] = parameters;
        return json;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// LLM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

struct LLMConfig {
    std::string model;                         // e.g., "gpt-4", "claude-3-opus"
    optional<double> temperature;              // 0.0 - 2.0
    optional<int> max_tokens;                  // Max response tokens
    optional<std::vector<std::string>> stop;   // Stop sequences
    optional<double> top_p;                    // Nucleus sampling
    optional<int> seed;                        // For reproducibility
    optional<JsonValue> extra;                 // Provider-specific options
    
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
    
    LLMConfig& withStop(const std::vector<std::string>& s) {
        stop = s;
        return *this;
    }
    
    LLMConfig& withSeed(int s) {
        seed = s;
        return *this;
    }
    
    LLMConfig& withExtra(const JsonValue& e) {
        extra = e;
        return *this;
    }
    
    // Default configurations
    static LLMConfig defaultConfig() {
        return LLMConfig()
            .withTemperature(0.7)
            .withMaxTokens(2048);
    }
    
    static LLMConfig deterministic() {
        return LLMConfig()
            .withTemperature(0.0)
            .withSeed(42);
    }
    
    static LLMConfig creative() {
        return LLMConfig()
            .withTemperature(1.2)
            .withTopP(0.95);
    }
};

// ═══════════════════════════════════════════════════════════════════════
// LLM RESPONSE
// ═══════════════════════════════════════════════════════════════════════

struct Usage {
    int prompt_tokens = 0;
    int completion_tokens = 0;
    int total_tokens = 0;
    
    JsonValue toJson() const {
        JsonValue json = JsonValue::object();
        json["prompt_tokens"] = prompt_tokens;
        json["completion_tokens"] = completion_tokens;
        json["total_tokens"] = total_tokens;
        return json;
    }
};

struct LLMResponse {
    Message message;                // The response message
    std::string finish_reason;      // "stop", "tool_calls", "length", "content_filter"
    optional<Usage> usage;
    optional<std::string> model;    // Model actually used (for fallbacks)
    
    // Convenience methods
    bool hasToolCalls() const {
        return message.tool_calls.has_value() && !message.tool_calls->empty();
    }
    
    const std::vector<ToolCall>& toolCalls() const {
        static std::vector<ToolCall> empty;
        return message.tool_calls.has_value() ? *message.tool_calls : empty;
    }
    
    bool isComplete() const {
        return finish_reason == "stop" || finish_reason == "end_turn";
    }
    
    bool requiresToolExecution() const {
        return finish_reason == "tool_calls" || hasToolCalls();
    }
    
    bool hitTokenLimit() const {
        return finish_reason == "length" || finish_reason == "max_tokens";
    }
};

// ═══════════════════════════════════════════════════════════════════════
// STREAMING
// ═══════════════════════════════════════════════════════════════════════

struct StreamChunk {
    enum class Type {
        CONTENT,      // Text content delta
        TOOL_CALL,    // Tool call delta
        USAGE,        // Usage statistics
        DONE          // Stream complete
    };
    
    Type type = Type::CONTENT;
    optional<std::string> content_delta;     // Text content chunk
    optional<ToolCall> tool_call_delta;      // Tool call chunk
    optional<Usage> usage_delta;             // Token usage
    bool is_final = false;
};

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

struct ProviderConfig {
    std::string api_key;
    std::string base_url;
    optional<std::string> organization;
    std::chrono::milliseconds timeout{60000};
    int max_retries = 3;
    std::chrono::milliseconds retry_delay{1000};
    
    // Headers to add to all requests
    std::map<std::string, std::string> extra_headers;
};

}  // namespace llm
}  // namespace orch
}  // namespace gopher