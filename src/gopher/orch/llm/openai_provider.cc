// OpenAI Provider Implementation

#include "gopher/orch/llm/openai_provider.h"

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

class OpenAIProvider::Impl {
 public:
  OpenAIConfig config;
  HttpClientPtr http_client;
  mutable std::mutex mutex;

  explicit Impl(const OpenAIConfig& cfg) : config(cfg) {
    // Create HTTP client for API calls
    http_client = std::make_shared<DefaultHttpClient>();
  }

  std::string chatEndpoint() const {
    if (config.is_azure) {
      return config.base_url + "/openai/deployments/" + config.azure_deployment +
             "/chat/completions?api-version=" + config.azure_api_version;
    }
    return config.base_url + "/chat/completions";
  }

  std::map<std::string, std::string> headers() const {
    std::map<std::string, std::string> hdrs;
    hdrs["Content-Type"] = "application/json";

    if (config.is_azure) {
      hdrs["api-key"] = config.api_key;
    } else {
      hdrs["Authorization"] = "Bearer " + config.api_key;
      if (!config.organization.empty()) {
        hdrs["OpenAI-Organization"] = config.organization;
      }
    }

    return hdrs;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY METHODS
// ═══════════════════════════════════════════════════════════════════════════

OpenAIProvider::Ptr OpenAIProvider::create(const std::string& api_key) {
  return create(OpenAIConfig(api_key));
}

OpenAIProvider::Ptr OpenAIProvider::create(const std::string& api_key,
                                            const std::string& base_url) {
  OpenAIConfig config(api_key);
  if (!base_url.empty()) {
    config.withBaseUrl(base_url);
  }
  return create(config);
}

OpenAIProvider::Ptr OpenAIProvider::create(const OpenAIConfig& config) {
  return Ptr(new OpenAIProvider(config));
}

OpenAIProvider::OpenAIProvider(const OpenAIConfig& config)
    : impl_(std::make_unique<Impl>(config)) {}

OpenAIProvider::~OpenAIProvider() = default;

// ═══════════════════════════════════════════════════════════════════════════
// CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════════

void OpenAIProvider::chat(const std::vector<Message>& messages,
                          const std::vector<ToolSpec>& tools,
                          const LLMConfig& config,
                          Dispatcher& dispatcher,
                          ChatCallback callback) {
  // Build request
  auto request = buildRequest(messages, tools, config, false);
  auto request_body = request.toString();

  auto url = impl_->chatEndpoint();
  auto headers = impl_->headers();

  // Make HTTP request
  impl_->http_client->request(
      HttpMethod::POST, url, headers, request_body, dispatcher,
      [this, callback = std::move(callback)](Result<HttpResponse> result) {
        if (!mcp::holds_alternative<HttpResponse>(result)) {
          callback(Result<LLMResponse>(mcp::get<Error>(result)));
          return;
        }

        auto& response = mcp::get<HttpResponse>(result);
        if (!response.isSuccess()) {
          // Parse error response
          std::string error_msg = "HTTP " + std::to_string(response.status_code);
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

        // Parse response
        try {
          auto response_json = JsonValue::parse(response.body);
          auto parsed = parseResponse(response_json);
          callback(std::move(parsed));
        } catch (const std::exception& e) {
          callback(Result<LLMResponse>(
              Error(LLMError::PARSE_ERROR, std::string("Failed to parse response: ") + e.what())));
        }
      });
}

void OpenAIProvider::chatStream(const std::vector<Message>& messages,
                                 const std::vector<ToolSpec>& tools,
                                 const LLMConfig& config,
                                 Dispatcher& dispatcher,
                                 StreamCallback on_chunk,
                                 ChatCallback on_complete) {
  // For now, fall back to non-streaming
  // Full streaming implementation would require SSE parsing
  chat(messages, tools, config, dispatcher, std::move(on_complete));
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE BUILDING
// ═══════════════════════════════════════════════════════════════════════════

JsonValue OpenAIProvider::buildRequest(const std::vector<Message>& messages,
                                        const std::vector<ToolSpec>& tools,
                                        const LLMConfig& config,
                                        bool stream) const {
  JsonValue request = JsonValue::object();

  // Model
  request["model"] = config.model;

  // Messages
  JsonValue msgs = JsonValue::array();
  for (const auto& msg : messages) {
    msgs.push_back(messageToJson(msg));
  }
  request["messages"] = msgs;

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
  if (config.max_tokens.has_value()) {
    request["max_tokens"] = *config.max_tokens;
  }
  if (config.top_p.has_value()) {
    request["top_p"] = *config.top_p;
  }
  if (config.seed.has_value()) {
    request["seed"] = *config.seed;
  }
  if (config.stop.has_value() && !config.stop->empty()) {
    JsonValue stop_array = JsonValue::array();
    for (const auto& s : *config.stop) {
      stop_array.push_back(s);
    }
    request["stop"] = stop_array;
  }

  if (stream) {
    request["stream"] = true;
  }

  return request;
}

Result<LLMResponse> OpenAIProvider::parseResponse(const JsonValue& response) const {
  LLMResponse result;

  try {
    // Get the first choice
    if (!response.contains("choices") || response["choices"].empty()) {
      return Result<LLMResponse>(
          Error(LLMError::PARSE_ERROR, "No choices in response"));
    }

    const auto& choice = response["choices"][0];

    // Parse finish reason
    if (choice.contains("finish_reason") && !choice["finish_reason"].isNull()) {
      result.finish_reason = choice["finish_reason"].getString();
    }

    // Parse message
    if (choice.contains("message")) {
      const auto& msg = choice["message"];

      // Role
      if (msg.contains("role")) {
        result.message.role = parseRole(msg["role"].getString());
      } else {
        result.message.role = Role::ASSISTANT;
      }

      // Content
      if (msg.contains("content") && !msg["content"].isNull()) {
        result.message.content = msg["content"].getString();
      }

      // Tool calls
      if (msg.contains("tool_calls") && !msg["tool_calls"].isNull()) {
        std::vector<ToolCall> tool_calls;
        for (size_t i = 0; i < msg["tool_calls"].size(); ++i) {
          const auto& tc = msg["tool_calls"][i];
          ToolCall call;
          call.id = tc["id"].getString();

          if (tc.contains("function")) {
            call.name = tc["function"]["name"].getString();
            if (tc["function"].contains("arguments")) {
              std::string args_str = tc["function"]["arguments"].getString();
              try {
                call.arguments = JsonValue::parse(args_str);
              } catch (...) {
                // If parsing fails, store as string
                call.arguments = args_str;
              }
            }
          }

          tool_calls.push_back(std::move(call));
        }
        result.message.tool_calls = std::move(tool_calls);
      }
    }

    // Parse usage
    if (response.contains("usage")) {
      const auto& usage = response["usage"];
      Usage u;
      u.prompt_tokens = usage.contains("prompt_tokens") ? usage["prompt_tokens"].getInt() : 0;
      u.completion_tokens = usage.contains("completion_tokens") ? usage["completion_tokens"].getInt() : 0;
      u.total_tokens = usage.contains("total_tokens") ? usage["total_tokens"].getInt() : 0;
      result.usage = u;
    }

    return Result<LLMResponse>(std::move(result));

  } catch (const std::exception& e) {
    return Result<LLMResponse>(
        Error(LLMError::PARSE_ERROR, std::string("Parse error: ") + e.what()));
  }
}

JsonValue OpenAIProvider::messageToJson(const Message& msg) const {
  JsonValue json = JsonValue::object();

  json["role"] = roleToString(msg.role);

  // Handle tool results
  if (msg.role == Role::TOOL) {
    json["role"] = "tool";
    json["content"] = msg.content;
    if (msg.tool_call_id.has_value()) {
      json["tool_call_id"] = *msg.tool_call_id;
    }
    return json;
  }

  // Regular message content
  if (!msg.content.empty()) {
    json["content"] = msg.content;
  }

  // Tool calls for assistant messages
  if (msg.role == Role::ASSISTANT && msg.hasToolCalls()) {
    JsonValue tool_calls = JsonValue::array();
    for (const auto& tc : *msg.tool_calls) {
      JsonValue call = JsonValue::object();
      call["id"] = tc.id;
      call["type"] = "function";

      JsonValue func = JsonValue::object();
      func["name"] = tc.name;
      func["arguments"] = tc.arguments.toString();
      call["function"] = func;

      tool_calls.push_back(call);
    }
    json["tool_calls"] = tool_calls;
  }

  return json;
}

JsonValue OpenAIProvider::toolToJson(const ToolSpec& tool) const {
  JsonValue json = JsonValue::object();
  json["type"] = "function";

  JsonValue func = JsonValue::object();
  func["name"] = tool.name;
  func["description"] = tool.description;
  func["parameters"] = tool.parameters;

  json["function"] = func;
  return json;
}

Result<StreamChunk> OpenAIProvider::parseStreamChunk(const std::string& data) const {
  // SSE data parsing would go here
  // For now, return empty chunk
  StreamChunk chunk;
  return Result<StreamChunk>(std::move(chunk));
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

bool OpenAIProvider::isModelSupported(const std::string& model) const {
  // Accept any model string - OpenAI will validate
  // This allows for new models and custom deployments
  return !model.empty();
}

std::vector<std::string> OpenAIProvider::supportedModels() const {
  return {
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
      "o1",
      "o1-mini",
      "o1-preview"
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

std::string OpenAIProvider::endpoint() const {
  return impl_->chatEndpoint();
}

bool OpenAIProvider::isConfigured() const {
  return !impl_->config.api_key.empty();
}

std::string OpenAIProvider::organization() const {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  return impl_->config.organization;
}

void OpenAIProvider::setOrganization(const std::string& org) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->config.organization = org;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

LLMProviderPtr createOpenAIProvider(const std::string& api_key,
                                     const std::string& base_url) {
  if (base_url.empty()) {
    return OpenAIProvider::create(api_key);
  }
  return OpenAIProvider::create(api_key, base_url);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher
