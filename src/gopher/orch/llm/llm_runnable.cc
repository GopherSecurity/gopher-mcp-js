// LLMRunnable Implementation

#include "gopher/orch/llm/llm_runnable.h"

namespace gopher {
namespace orch {
namespace llm {

// =============================================================================
// Factory
// =============================================================================

LLMRunnable::Ptr LLMRunnable::create(LLMProviderPtr provider,
                                     const LLMConfig& config) {
  return Ptr(new LLMRunnable(std::move(provider), config));
}

LLMRunnable::LLMRunnable(LLMProviderPtr provider, const LLMConfig& config)
    : provider_(std::move(provider)), default_config_(config) {}

// =============================================================================
// Runnable Interface
// =============================================================================

std::string LLMRunnable::name() const {
  if (provider_) {
    return "LLMRunnable(" + provider_->name() + ")";
  }
  return "LLMRunnable";
}

void LLMRunnable::invoke(const JsonValue& input,
                         const RunnableConfig& /* config */,
                         Dispatcher& dispatcher,
                         Callback callback) {
  // Validate provider
  if (!provider_) {
    postError<JsonValue>(dispatcher, std::move(callback), LLMError::UNKNOWN,
                         "No LLM provider configured");
    return;
  }

  // Parse input
  ParsedInput parsed = parseInput(input);

  // Validate messages
  if (parsed.messages.empty()) {
    postError<JsonValue>(dispatcher, std::move(callback),
                         LLMError::INVALID_MODEL, "No messages provided");
    return;
  }

  // Call the LLM provider
  provider_->chat(
      parsed.messages, parsed.tools, parsed.config, dispatcher,
      [callback = std::move(callback)](Result<LLMResponse> result) mutable {
        if (mcp::holds_alternative<Error>(result)) {
          callback(Result<JsonValue>(mcp::get<Error>(result)));
        } else {
          JsonValue output = responseToJson(mcp::get<LLMResponse>(result));
          callback(Result<JsonValue>(std::move(output)));
        }
      });
}

// =============================================================================
// Input Parsing
// =============================================================================

LLMRunnable::ParsedInput LLMRunnable::parseInput(const JsonValue& input) const {
  ParsedInput result;
  result.config = default_config_;

  // Handle string input as simple user message
  if (input.isString()) {
    result.messages.push_back(Message::user(input.getString()));
    return result;
  }

  // Handle object input
  if (!input.isObject()) {
    return result;
  }

  // Parse messages array
  if (input.contains("messages") && input["messages"].isArray()) {
    const auto& messages_array = input["messages"];
    for (size_t i = 0; i < messages_array.size(); ++i) {
      result.messages.push_back(parseMessage(messages_array[i]));
    }
  }

  // Parse tools array
  if (input.contains("tools") && input["tools"].isArray()) {
    const auto& tools_array = input["tools"];
    for (size_t i = 0; i < tools_array.size(); ++i) {
      result.tools.push_back(parseToolSpec(tools_array[i]));
    }
  }

  // Parse config overrides
  if (input.contains("config") && input["config"].isObject()) {
    const auto& config_obj = input["config"];

    if (config_obj.contains("model") && config_obj["model"].isString()) {
      result.config.model = config_obj["model"].getString();
    }
    if (config_obj.contains("temperature") &&
        config_obj["temperature"].isNumber()) {
      result.config.temperature = config_obj["temperature"].getFloat();
    }
    if (config_obj.contains("max_tokens") &&
        config_obj["max_tokens"].isNumber()) {
      result.config.max_tokens = config_obj["max_tokens"].getInt();
    }
    if (config_obj.contains("top_p") && config_obj["top_p"].isNumber()) {
      result.config.top_p = config_obj["top_p"].getFloat();
    }
    if (config_obj.contains("seed") && config_obj["seed"].isNumber()) {
      result.config.seed = config_obj["seed"].getInt();
    }
  }

  return result;
}

Message LLMRunnable::parseMessage(const JsonValue& json) {
  if (!json.isObject()) {
    return Message::user("");
  }

  Role role = Role::USER;
  if (json.contains("role") && json["role"].isString()) {
    role = parseRole(json["role"].getString());
  }

  std::string content;
  if (json.contains("content") && json["content"].isString()) {
    content = json["content"].getString();
  }

  Message msg(role, content);

  // Parse tool_call_id for tool messages
  if (json.contains("tool_call_id") && json["tool_call_id"].isString()) {
    msg.tool_call_id = json["tool_call_id"].getString();
  }

  // Parse tool_calls for assistant messages
  if (json.contains("tool_calls") && json["tool_calls"].isArray()) {
    std::vector<ToolCall> calls;
    const auto& calls_array = json["tool_calls"];
    for (size_t i = 0; i < calls_array.size(); ++i) {
      const auto& call_obj = calls_array[i];
      if (call_obj.isObject()) {
        ToolCall call;
        if (call_obj.contains("id") && call_obj["id"].isString()) {
          call.id = call_obj["id"].getString();
        }
        if (call_obj.contains("name") && call_obj["name"].isString()) {
          call.name = call_obj["name"].getString();
        }
        if (call_obj.contains("arguments")) {
          call.arguments = call_obj["arguments"];
        }
        calls.push_back(std::move(call));
      }
    }
    if (!calls.empty()) {
      msg.tool_calls = std::move(calls);
    }
  }

  return msg;
}

ToolSpec LLMRunnable::parseToolSpec(const JsonValue& json) {
  ToolSpec spec;
  if (!json.isObject()) {
    return spec;
  }

  if (json.contains("name") && json["name"].isString()) {
    spec.name = json["name"].getString();
  }
  if (json.contains("description") && json["description"].isString()) {
    spec.description = json["description"].getString();
  }
  if (json.contains("parameters")) {
    spec.parameters = json["parameters"];
  }

  return spec;
}

// =============================================================================
// Output Conversion
// =============================================================================

JsonValue LLMRunnable::responseToJson(const LLMResponse& response) {
  JsonValue output = JsonValue::object();

  // Convert message
  output["message"] = messageToJson(response.message);

  // Add finish_reason
  output["finish_reason"] = response.finish_reason;

  // Add usage if present
  if (response.usage.has_value()) {
    JsonValue usage = JsonValue::object();
    usage["prompt_tokens"] = response.usage->prompt_tokens;
    usage["completion_tokens"] = response.usage->completion_tokens;
    usage["total_tokens"] = response.usage->total_tokens;
    output["usage"] = usage;
  }

  return output;
}

JsonValue LLMRunnable::messageToJson(const Message& message) {
  JsonValue json = JsonValue::object();

  json["role"] = roleToString(message.role);
  json["content"] = message.content;

  if (message.tool_call_id.has_value()) {
    json["tool_call_id"] = *message.tool_call_id;
  }

  if (message.tool_calls.has_value() && !message.tool_calls->empty()) {
    JsonValue calls_array = JsonValue::array();
    for (const auto& call : *message.tool_calls) {
      JsonValue call_obj = JsonValue::object();
      call_obj["id"] = call.id;
      call_obj["name"] = call.name;
      call_obj["arguments"] = call.arguments;
      calls_array.push_back(call_obj);
    }
    json["tool_calls"] = calls_array;
  }

  return json;
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher
