#include "gopher/orch/llm/anthropic_provider.h"
#include "../api/production_api_engine.h"

namespace gopher {
namespace orch {
namespace llm {

// ═══════════════════════════════════════════════════════════════════════
// CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════

AnthropicProvider::AnthropicProvider(const AnthropicConfig& config)
    : config_(config) {
    if (config_.api_key.empty()) {
        throw std::runtime_error("Anthropic API key is required");
    }
    
    auto sync_engine = std::make_shared<api::ProductionApiEngine>();
    sync_engine->setBaseUrl(config_.base_url);
    sync_engine->setApiKey(config_.api_key);
    api_engine_ = std::make_shared<api::AsyncApiEngine>(sync_engine);
}

AnthropicProvider::AnthropicProvider(const std::string& api_key)
    : AnthropicProvider(AnthropicConfig{api_key}) {}

// ═══════════════════════════════════════════════════════════════════════
// LIST MODELS
// ═══════════════════════════════════════════════════════════════════════

void AnthropicProvider::listModels(
    Dispatcher& dispatcher,
    std::function<void(Result<std::vector<std::string>>)> callback) {
    
    // Anthropic doesn't provide a models endpoint, return known models
    dispatcher.post([callback] {
        std::vector<std::string> models = {
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
            "claude-2.1",
            "claude-2.0",
            "claude-instant-1.2"
        };
        callback(makeSuccess(models));
    });
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════

void AnthropicProvider::chat(
    const std::vector<Message>& messages,
    const std::vector<ToolSpec>& tools,
    const LLMConfig& config,
    Dispatcher& dispatcher,
    std::function<void(Result<LLMResponse>)> callback) {
    
    auto validation = validateConfig(config);
    if (mcp::holds_alternative<Error>(validation)) {
        callback(Result<LLMResponse>(mcp::get<Error>(validation)));
        return;
    }
    
    JsonValue body = buildRequestBody(messages, tools, config);
    auto headers = buildHeaders();
    
    api_engine_->post("/messages", body, headers, dispatcher,
        [this, callback](Result<ApiResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(Result<LLMResponse>(mcp::get<Error>(result)));
                return;
            }
            
            auto& response = mcp::get<ApiResponse>(result);
            
            if (response.status_code != 200) {
                callback(handleApiError(response));
                return;
            }
            
            try {
                JsonValue json = JsonValue::parse(response.body);
                callback(parseResponse(json));
            } catch (const std::exception& e) {
                callback(makeOrchError<LLMResponse>(
                    OrchError::PARSE_ERROR,
                    std::string("Failed to parse Anthropic response: ") + e.what()));
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING
// ═══════════════════════════════════════════════════════════════════════

void AnthropicProvider::chatStream(
    const std::vector<Message>& messages,
    const std::vector<ToolSpec>& tools,
    const LLMConfig& config,
    Dispatcher& dispatcher,
    std::function<void(const StreamChunk&)> on_chunk,
    std::function<void(Result<LLMResponse>)> on_complete) {
    
    // Build request with streaming enabled
    JsonValue body = buildRequestBody(messages, tools, config);
    body["stream"] = true;
    
    auto headers = buildHeaders();
    
    // TODO: Implement SSE streaming when HTTP client supports it
    // For now, fall back to non-streaming
    chat(messages, tools, config, dispatcher, on_complete);
}

// ═══════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════

void AnthropicProvider::healthCheck(
    Dispatcher& dispatcher,
    std::function<void(Result<bool>)> callback) {
    
    // Make a minimal API call to check connectivity
    std::vector<Message> messages = {
        Message::user("Hi")
    };
    
    LLMConfig config;
    config.model = "claude-3-haiku-20240307";  // Cheapest model
    config.max_tokens = 1;
    
    chat(messages, {}, config, dispatcher,
        [callback](Result<LLMResponse> result) {
            callback(makeSuccess(!mcp::holds_alternative<Error>(result)));
        });
}

// ═══════════════════════════════════════════════════════════════════════
// PRIVATE HELPER METHODS
// ═══════════════════════════════════════════════════════════════════════

JsonValue AnthropicProvider::buildRequestBody(
    const std::vector<Message>& messages,
    const std::vector<ToolSpec>& tools,
    const LLMConfig& config) const {
    
    JsonValue body = JsonValue::object();
    body["model"] = config.model.empty() ? config_.default_model : config.model;
    body["max_tokens"] = config.max_tokens.value_or(4096);
    
    // Prepare messages (extract system prompt)
    auto [system_prompt, user_messages] = prepareMessages(messages);
    
    if (!system_prompt.empty()) {
        body["system"] = system_prompt;
    }
    
    // Convert messages to Anthropic format
    JsonValue msgs = JsonValue::array();
    for (const auto& msg : user_messages) {
        JsonValue m = JsonValue::object();
        
        switch (msg.role) {
            case Message::Role::USER:
                m["role"] = "user";
                break;
            case Message::Role::ASSISTANT:
                m["role"] = "assistant";
                break;
            case Message::Role::TOOL:
                // Tool results in Anthropic are user messages with tool_use_id
                m["role"] = "user";
                JsonValue content = JsonValue::array();
                JsonValue tool_result = JsonValue::object();
                tool_result["type"] = "tool_result";
                tool_result["tool_use_id"] = msg.tool_call_id.value_or("");
                tool_result["content"] = msg.content;
                content.push_back(tool_result);
                m["content"] = content;
                continue;
            default:
                continue;  // Skip system messages (handled separately)
        }
        
        // Handle content
        if (msg.tool_calls && !msg.tool_calls->empty()) {
            // Assistant message with tool calls
            JsonValue content = JsonValue::array();
            
            // Add text if present
            if (!msg.content.empty()) {
                JsonValue text = JsonValue::object();
                text["type"] = "text";
                text["text"] = msg.content;
                content.push_back(text);
            }
            
            // Add tool calls
            for (const auto& call : *msg.tool_calls) {
                JsonValue tool_use = JsonValue::object();
                tool_use["type"] = "tool_use";
                tool_use["id"] = call.id;
                tool_use["name"] = call.name;
                tool_use["input"] = call.arguments;
                content.push_back(tool_use);
            }
            
            m["content"] = content;
        } else {
            m["content"] = msg.content;
        }
        
        msgs.push_back(m);
    }
    body["messages"] = msgs;
    
    // Convert tools to Anthropic format
    if (!tools.empty()) {
        JsonValue toolsJson = JsonValue::array();
        for (const auto& tool : tools) {
            JsonValue t = JsonValue::object();
            t["name"] = tool.name;
            t["description"] = tool.description;
            t["input_schema"] = tool.parameters;
            toolsJson.push_back(t);
        }
        body["tools"] = toolsJson;
    }
    
    // Optional parameters
    if (config.temperature) {
        body["temperature"] = *config.temperature;
    }
    if (config.top_p) {
        body["top_p"] = *config.top_p;
    }
    if (config.stop && !config.stop->empty()) {
        JsonValue stops = JsonValue::array();
        for (const auto& s : *config.stop) {
            stops.push_back(s);
        }
        body["stop_sequences"] = stops;
    }
    
    return body;
}

Result<LLMResponse> AnthropicProvider::parseResponse(const JsonValue& json) const {
    LLMResponse response;
    response.message.role = Message::Role::ASSISTANT;
    
    // Parse content
    if (json.has("content") && json["content"].isArray()) {
        std::vector<ToolCall> tool_calls;
        
        for (const auto& content : json["content"]) {
            if (!content.has("type")) continue;
            
            std::string type = content["type"].asString();
            
            if (type == "text") {
                response.message.content += content["text"].asString();
            } else if (type == "tool_use") {
                ToolCall call;
                call.id = content["id"].asString();
                call.name = content["name"].asString();
                call.arguments = content["input"];
                tool_calls.push_back(call);
            }
        }
        
        if (!tool_calls.empty()) {
            response.message.tool_calls = tool_calls;
        }
    }
    
    // Parse stop reason
    if (json.has("stop_reason")) {
        std::string reason = json["stop_reason"].asString();
        if (reason == "end_turn") {
            response.finish_reason = "stop";
        } else if (reason == "tool_use") {
            response.finish_reason = "tool_calls";
        } else {
            response.finish_reason = reason;
        }
    }
    
    // Parse usage
    if (json.has("usage")) {
        Usage usage;
        usage.prompt_tokens = json["usage"]["input_tokens"].asInt();
        usage.completion_tokens = json["usage"]["output_tokens"].asInt();
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
        response.usage = usage;
    }
    
    // Parse model
    if (json.has("model")) {
        response.model = json["model"].asString();
    }
    
    return makeSuccess(response);
}

std::map<std::string, std::string> AnthropicProvider::buildHeaders() const {
    std::map<std::string, std::string> headers;
    headers["Content-Type"] = "application/json";
    headers["x-api-key"] = config_.api_key;
    headers["anthropic-version"] = config_.anthropic_version;
    return headers;
}

Result<LLMResponse> AnthropicProvider::handleApiError(const ApiResponse& response) const {
    std::string error_message = "Anthropic API error: " + std::to_string(response.status_code);
    
    try {
        JsonValue json = JsonValue::parse(response.body);
        if (json.has("error")) {
            const auto& error = json["error"];
            if (error.has("message")) {
                error_message = error["message"].asString();
            }
        }
    } catch (...) {
        error_message += " - " + response.body;
    }
    
    OrchError::Code error_code;
    switch (response.status_code) {
        case 400: error_code = OrchError::INVALID_ARGUMENT; break;
        case 401: error_code = OrchError::AUTHENTICATION_FAILED; break;
        case 403: error_code = OrchError::PERMISSION_DENIED; break;
        case 404: error_code = OrchError::NOT_FOUND; break;
        case 429: error_code = OrchError::RATE_LIMITED; break;
        default: error_code = OrchError::API_ERROR;
    }
    
    return makeOrchError<LLMResponse>(error_code, error_message);
}

std::pair<std::string, std::vector<Message>> AnthropicProvider::prepareMessages(
    const std::vector<Message>& messages) const {
    
    std::string system_prompt;
    std::vector<Message> user_messages;
    
    for (const auto& msg : messages) {
        if (msg.role == Message::Role::SYSTEM) {
            // Combine all system messages
            if (!system_prompt.empty()) {
                system_prompt += "\n\n";
            }
            system_prompt += msg.content;
        } else {
            user_messages.push_back(msg);
        }
    }
    
    return {system_prompt, user_messages};
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher