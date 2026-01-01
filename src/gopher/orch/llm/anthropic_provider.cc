// Anthropic Provider Implementation

#include "gopher/orch/llm/anthropic_provider.h"

#include <mutex>
#include <sstream>

#include "gopher/orch/server/rest_server.h"

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::core;
using namespace gopher::orch::server;

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

class AnthropicProvider::Impl {
 public:
  AnthropicConfig config;
  HttpClientPtr http_client;
  mutable std::mutex mutex;

  explicit Impl(const AnthropicConfig& cfg) : config(cfg) {
    http_client = std::make_shared<DefaultHttpClient>();
  }

  std::string messagesEndpoint() const {
    return config.base_url + "/v1/messages";
  }

  std::map<std::string, std::string> headers() const {
    std::map<std::string, std::string> hdrs;
    hdrs["Content-Type"] = "application/json";
    hdrs["x-api-key"] = config.api_key;
    hdrs["anthropic-version"] = config.api_version;

    // Add beta headers if any
    if (!config.betas.empty()) {
      std::string beta_str;
      for (size_t i = 0; i < config.betas.size(); ++i) {
        if (i > 0)
          beta_str += ",";
        beta_str += config.betas[i];
      }
      hdrs["anthropic-beta"] = beta_str;
    }

    return hdrs;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY METHODS
// ═══════════════════════════════════════════════════════════════════════════

AnthropicProvider::Ptr AnthropicProvider::create(const std::string& api_key) {
  return create(AnthropicConfig(api_key));
}

AnthropicProvider::Ptr AnthropicProvider::create(const std::string& api_key,
                                                 const std::string& base_url) {
  AnthropicConfig config(api_key);
  if (!base_url.empty()) {
    config.withBaseUrl(base_url);
  }
  return create(config);
}

AnthropicProvider::Ptr AnthropicProvider::create(
    const AnthropicConfig& config) {
  return Ptr(new AnthropicProvider(config));
}

AnthropicProvider::AnthropicProvider(const AnthropicConfig& config)
    : impl_(std::make_unique<Impl>(config)) {}

AnthropicProvider::~AnthropicProvider() = default;

// ═══════════════════════════════════════════════════════════════════════════
// CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════════

void AnthropicProvider::chat(const std::vector<Message>& messages,
                             const std::vector<ToolSpec>& tools,
                             const LLMConfig& config,
                             Dispatcher& dispatcher,
                             ChatCallback callback) {
  auto request = buildRequest(messages, tools, config, false);
  auto request_body = request.toString();

  auto url = impl_->messagesEndpoint();
  auto headers = impl_->headers();

  impl_->http_client->request(
      HttpMethod::POST, url, headers, request_body, dispatcher,
      [this, callback = std::move(callback)](Result<HttpResponse> result) {
        if (!mcp::holds_alternative<HttpResponse>(result)) {
          callback(Result<LLMResponse>(mcp::get<Error>(result)));
          return;
        }

        auto& response = mcp::get<HttpResponse>(result);
        if (!response.isSuccess()) {
          std::string error_msg =
              "HTTP " + std::to_string(response.status_code);
          try {
            auto error_json = JsonValue::parse(response.body);
            if (error_json.contains("error") &&
                error_json["error"].contains("message")) {
              error_msg = error_json["error"]["message"].getString();
            }
          } catch (...) {
            error_msg += ": " + response.body;
          }

          int error_code = LLMError::UNKNOWN;
          if (response.status_code == 401) {
            error_code = LLMError::INVALID_API_KEY;
          } else if (response.status_code == 429) {
            error_code = LLMError::RATE_LIMITED;
          } else if (response.status_code >= 500) {
            error_code = LLMError::SERVICE_UNAVAILABLE;
          }

          callback(Result<LLMResponse>(Error(error_code, error_msg)));
          return;
        }

        try {
          auto response_json = JsonValue::parse(response.body);
          auto parsed = parseResponse(response_json);
          callback(std::move(parsed));
        } catch (const std::exception& e) {
          callback(Result<LLMResponse>(
              Error(LLMError::PARSE_ERROR,
                    std::string("Failed to parse response: ") + e.what())));
        }
      });
}

void AnthropicProvider::chatStream(const std::vector<Message>& messages,
                                   const std::vector<ToolSpec>& tools,
                                   const LLMConfig& config,
                                   Dispatcher& dispatcher,
                                   StreamCallback on_chunk,
                                   ChatCallback on_complete) {
  // Fall back to non-streaming for now
  chat(messages, tools, config, dispatcher, std::move(on_complete));
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE BUILDING
// ═══════════════════════════════════════════════════════════════════════════

JsonValue AnthropicProvider::buildRequest(const std::vector<Message>& messages,
                                          const std::vector<ToolSpec>& tools,
                                          const LLMConfig& config,
                                          bool stream) const {
  JsonValue request = JsonValue::object();

  // Model
  request["model"] = config.model;

  // Convert messages (extract system separately)
  auto [system_prompt, anthropic_messages] =
      messagesToAnthropicFormat(messages);

  if (!system_prompt.empty()) {
    request["system"] = system_prompt;
  }
  request["messages"] = anthropic_messages;

  // Max tokens (required for Anthropic)
  request["max_tokens"] = config.max_tokens.value_or(4096);

  // Tools (if any)
  if (!tools.empty()) {
    JsonValue tool_array = JsonValue::array();
    for (const auto& tool : tools) {
      tool_array.push_back(toolToJson(tool));
    }
    request["tools"] = tool_array;
  }

  // Optional parameters
  if (config.temperature.has_value()) {
    request["temperature"] = *config.temperature;
  }
  if (config.top_p.has_value()) {
    request["top_p"] = *config.top_p;
  }
  if (config.stop.has_value() && !config.stop->empty()) {
    JsonValue stop_array = JsonValue::array();
    for (const auto& s : *config.stop) {
      stop_array.push_back(s);
    }
    request["stop_sequences"] = stop_array;
  }

  if (stream) {
    request["stream"] = true;
  }

  return request;
}

std::pair<std::string, JsonValue> AnthropicProvider::messagesToAnthropicFormat(
    const std::vector<Message>& messages) const {
  std::string system_prompt;
  JsonValue anthropic_messages = JsonValue::array();

  for (const auto& msg : messages) {
    if (msg.role == Role::SYSTEM) {
      // Anthropic has separate system field
      if (!system_prompt.empty()) {
        system_prompt += "\n\n";
      }
      system_prompt += msg.content;
      continue;
    }

    JsonValue json_msg = JsonValue::object();

    if (msg.role == Role::USER) {
      json_msg["role"] = "user";

      // Check if this is a tool result
      if (msg.tool_call_id.has_value()) {
        // Tool result format for Anthropic
        JsonValue content = JsonValue::array();
        JsonValue tool_result = JsonValue::object();
        tool_result["type"] = "tool_result";
        tool_result["tool_use_id"] = *msg.tool_call_id;
        tool_result["content"] = msg.content;
        content.push_back(tool_result);
        json_msg["content"] = content;
      } else {
        json_msg["content"] = msg.content;
      }

    } else if (msg.role == Role::TOOL) {
      // Tool results in Anthropic go in a user message
      json_msg["role"] = "user";
      JsonValue content = JsonValue::array();
      JsonValue tool_result = JsonValue::object();
      tool_result["type"] = "tool_result";
      if (msg.tool_call_id.has_value()) {
        tool_result["tool_use_id"] = *msg.tool_call_id;
      }
      tool_result["content"] = msg.content;
      content.push_back(tool_result);
      json_msg["content"] = content;

    } else if (msg.role == Role::ASSISTANT) {
      json_msg["role"] = "assistant";

      if (msg.hasToolCalls()) {
        // Assistant message with tool use
        JsonValue content = JsonValue::array();

        // Add text content if present
        if (!msg.content.empty()) {
          JsonValue text_block = JsonValue::object();
          text_block["type"] = "text";
          text_block["text"] = msg.content;
          content.push_back(text_block);
        }

        // Add tool use blocks
        for (const auto& tc : *msg.tool_calls) {
          JsonValue tool_use = JsonValue::object();
          tool_use["type"] = "tool_use";
          tool_use["id"] = tc.id;
          tool_use["name"] = tc.name;
          tool_use["input"] = tc.arguments;
          content.push_back(tool_use);
        }

        json_msg["content"] = content;
      } else {
        json_msg["content"] = msg.content;
      }
    }

    anthropic_messages.push_back(json_msg);
  }

  return {system_prompt, anthropic_messages};
}

Result<LLMResponse> AnthropicProvider::parseResponse(
    const JsonValue& response) const {
  LLMResponse result;

  try {
    // Parse stop reason
    if (response.contains("stop_reason") && !response["stop_reason"].isNull()) {
      std::string stop_reason = response["stop_reason"].getString();
      // Map Anthropic stop reasons to our format
      if (stop_reason == "end_turn") {
        result.finish_reason = "stop";
      } else if (stop_reason == "tool_use") {
        result.finish_reason = "tool_calls";
      } else if (stop_reason == "max_tokens") {
        result.finish_reason = "length";
      } else {
        result.finish_reason = stop_reason;
      }
    }

    result.message.role = Role::ASSISTANT;

    // Parse content array
    if (response.contains("content") && response["content"].isArray()) {
      std::string text_content;
      std::vector<ToolCall> tool_calls;

      const auto& content_array = response["content"];
      for (size_t i = 0; i < content_array.size(); ++i) {
        const auto& block = content_array[i];
        std::string block_type =
            block.contains("type") ? block["type"].getString() : "";

        if (block_type == "text") {
          if (!text_content.empty()) {
            text_content += "\n";
          }
          text_content += block["text"].getString();

        } else if (block_type == "tool_use") {
          ToolCall tc;
          tc.id = block["id"].getString();
          tc.name = block["name"].getString();
          tc.arguments = block["input"];
          tool_calls.push_back(std::move(tc));
        }
      }

      result.message.content = text_content;
      if (!tool_calls.empty()) {
        result.message.tool_calls = std::move(tool_calls);
      }
    }

    // Parse usage
    if (response.contains("usage")) {
      const auto& usage = response["usage"];
      Usage u;
      u.prompt_tokens =
          usage.contains("input_tokens") ? usage["input_tokens"].getInt() : 0;
      u.completion_tokens =
          usage.contains("output_tokens") ? usage["output_tokens"].getInt() : 0;
      u.total_tokens = u.prompt_tokens + u.completion_tokens;
      result.usage = u;
    }

    return Result<LLMResponse>(std::move(result));

  } catch (const std::exception& e) {
    return Result<LLMResponse>(
        Error(LLMError::PARSE_ERROR, std::string("Parse error: ") + e.what()));
  }
}

JsonValue AnthropicProvider::toolToJson(const ToolSpec& tool) const {
  JsonValue json = JsonValue::object();
  json["name"] = tool.name;
  json["description"] = tool.description;
  json["input_schema"] = tool.parameters;
  return json;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

bool AnthropicProvider::isModelSupported(const std::string& model) const {
  // Accept any model - Anthropic will validate
  return !model.empty();
}

std::vector<std::string> AnthropicProvider::supportedModels() const {
  return {"claude-3-5-sonnet-latest", "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-latest",  "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",   "claude-3-sonnet-20240229",
          "claude-3-haiku-20240307",  "claude-opus-4-5-20251101",
          "claude-sonnet-4-20250514"};
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

std::string AnthropicProvider::endpoint() const {
  return impl_->messagesEndpoint();
}

bool AnthropicProvider::isConfigured() const {
  return !impl_->config.api_key.empty();
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

LLMProviderPtr createAnthropicProvider(const std::string& api_key,
                                       const std::string& base_url) {
  if (base_url.empty()) {
    return AnthropicProvider::create(api_key);
  }
  return AnthropicProvider::create(api_key, base_url);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher
