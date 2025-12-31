#include "gopher/orch/llm/openai_provider.h"
#include "../api/production_api_engine.h"
#include <sstream>
#include <iomanip>

namespace gopher {
namespace orch {
namespace llm {

// ═══════════════════════════════════════════════════════════════════════
// CONSTRUCTOR / DESTRUCTOR
// ═══════════════════════════════════════════════════════════════════════

OpenAIProvider::OpenAIProvider(const OpenAIConfig& config)
    : config_(config) {
    // Initialize API engine with base configuration
    if (config_.api_key.empty()) {
        throw std::runtime_error("OpenAI API key is required");
    }
    
    // Create API engine (will use real or test implementation based on build)
    auto sync_engine = std::make_shared<api::ProductionApiEngine>();
    sync_engine->setBaseUrl(config_.base_url);
    sync_engine->setApiKey(config_.api_key);
    api_engine_ = std::make_shared<api::AsyncApiEngine>(sync_engine);
}

OpenAIProvider::OpenAIProvider(const std::string& api_key)
    : OpenAIProvider(OpenAIConfig{api_key}) {}

// ═══════════════════════════════════════════════════════════════════════
// LIST MODELS
// ═══════════════════════════════════════════════════════════════════════

void OpenAIProvider::listModels(
    Dispatcher& dispatcher,
    std::function<void(Result<std::vector<std::string>>)> callback) {
    
    auto headers = buildHeaders();
    
    api_engine_->get("/models", headers, dispatcher,
        [callback](Result<ApiResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(Result<std::vector<std::string>>(mcp::get<Error>(result)));
                return;
            }
            
            auto& response = mcp::get<ApiResponse>(result);
            if (response.status_code != 200) {
                callback(makeOrchError<std::vector<std::string>>(
                    OrchError::API_ERROR,
                    "Failed to list models: " + response.body));
                return;
            }
            
            try {
                JsonValue json = JsonValue::parse(response.body);
                std::vector<std::string> models;
                
                if (json.has("data") && json["data"].isArray()) {
                    for (const auto& model : json["data"]) {
                        if (model.has("id")) {
                            models.push_back(model["id"].asString());
                        }
                    }
                }
                
                callback(makeSuccess(models));
            } catch (const std::exception& e) {
                callback(makeOrchError<std::vector<std::string>>(
                    OrchError::PARSE_ERROR,
                    std::string("Failed to parse models response: ") + e.what()));
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════

void OpenAIProvider::chat(
    const std::vector<Message>& messages,
    const std::vector<ToolSpec>& tools,
    const LLMConfig& config,
    Dispatcher& dispatcher,
    std::function<void(Result<LLMResponse>)> callback) {
    
    // Validate configuration
    auto validation = validateConfig(config);
    if (mcp::holds_alternative<Error>(validation)) {
        callback(Result<LLMResponse>(mcp::get<Error>(validation)));
        return;
    }
    
    // Build request
    JsonValue body = buildRequestBody(messages, tools, config);
    auto headers = buildHeaders();
    
    // Make API call with retries
    int attempts = 0;
    std::function<void()> makeRequest = [=, &attempts, &makeRequest]() mutable {
        api_engine_->post("/chat/completions", body, headers, dispatcher,
            [=, &attempts, &makeRequest](Result<ApiResponse> result) mutable {
                if (mcp::holds_alternative<Error>(result)) {
                    if (++attempts < config_.max_retries) {
                        // Retry with exponential backoff
                        auto delay = std::chrono::milliseconds(1000 * attempts);
                        dispatcher.postDelayed([makeRequest] { makeRequest(); }, delay);
                    } else {
                        callback(Result<LLMResponse>(mcp::get<Error>(result)));
                    }
                    return;
                }
                
                auto& response = mcp::get<ApiResponse>(result);
                
                // Handle rate limiting
                if (response.status_code == 429) {
                    if (++attempts < config_.max_retries) {
                        // Extract retry-after header if available
                        auto it = response.headers.find("retry-after");
                        int delay_seconds = (it != response.headers.end()) 
                            ? std::stoi(it->second) : (attempts * 2);
                        
                        dispatcher.postDelayed([makeRequest] { makeRequest(); },
                                               std::chrono::seconds(delay_seconds));
                    } else {
                        callback(makeOrchError<LLMResponse>(
                            OrchError::RATE_LIMITED,
                            "Rate limit exceeded after " + std::to_string(config_.max_retries) + " retries"));
                    }
                    return;
                }
                
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
                        std::string("Failed to parse OpenAI response: ") + e.what()));
                }
            });
    };
    
    makeRequest();
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING
// ═══════════════════════════════════════════════════════════════════════

void OpenAIProvider::chatStream(
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
    headers["Accept"] = "text/event-stream";
    
    // Reset streaming state
    stream_buffer_.clear();
    accumulated_response_ = LLMResponse();
    accumulated_response_.message.role = Message::Role::ASSISTANT;
    
    // TODO: Implement SSE streaming when HTTP client supports it
    // For now, fall back to non-streaming
    chat(messages, tools, config, dispatcher, on_complete);
}

// ═══════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════

void OpenAIProvider::healthCheck(
    Dispatcher& dispatcher,
    std::function<void(Result<bool>)> callback) {
    
    auto headers = buildHeaders();
    
    api_engine_->get("/models", headers, dispatcher,
        [callback](Result<ApiResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(makeSuccess(false));
                return;
            }
            
            auto& response = mcp::get<ApiResponse>(result);
            callback(makeSuccess(response.status_code == 200));
        });
}

// ═══════════════════════════════════════════════════════════════════════
// PRIVATE HELPER METHODS
// ═══════════════════════════════════════════════════════════════════════

JsonValue OpenAIProvider::buildRequestBody(
    const std::vector<Message>& messages,
    const std::vector<ToolSpec>& tools,
    const LLMConfig& config) const {
    
    JsonValue body = JsonValue::object();
    body["model"] = config.model.empty() ? config_.default_model : config.model;
    
    // Convert messages
    JsonValue msgs = JsonValue::array();
    for (const auto& msg : messages) {
        JsonValue m = JsonValue::object();
        
        switch (msg.role) {
            case Message::Role::SYSTEM:
                m["role"] = "system";
                break;
            case Message::Role::USER:
                m["role"] = "user";
                break;
            case Message::Role::ASSISTANT:
                m["role"] = "assistant";
                break;
            case Message::Role::TOOL:
                m["role"] = "tool";
                if (msg.tool_call_id) {
                    m["tool_call_id"] = *msg.tool_call_id;
                }
                break;
        }
        
        m["content"] = msg.content;
        
        // Add tool calls if present (for assistant messages)
        if (msg.tool_calls && !msg.tool_calls->empty()) {
            JsonValue tc = JsonValue::array();
            for (const auto& call : *msg.tool_calls) {
                JsonValue c = JsonValue::object();
                c["id"] = call.id;
                c["type"] = "function";
                JsonValue func = JsonValue::object();
                func["name"] = call.name;
                func["arguments"] = call.arguments.toString();
                c["function"] = func;
                tc.push_back(c);
            }
            m["tool_calls"] = tc;
        }
        
        msgs.push_back(m);
    }
    body["messages"] = msgs;
    
    // Convert tools to OpenAI format
    if (!tools.empty()) {
        JsonValue toolsJson = JsonValue::array();
        for (const auto& tool : tools) {
            JsonValue t = JsonValue::object();
            t["type"] = "function";
            JsonValue func = JsonValue::object();
            func["name"] = tool.name;
            func["description"] = tool.description;
            func["parameters"] = tool.parameters;
            t["function"] = func;
            toolsJson.push_back(t);
        }
        body["tools"] = toolsJson;
        body["tool_choice"] = "auto";  // Let model decide when to use tools
    }
    
    // Optional parameters
    if (config.temperature) {
        body["temperature"] = *config.temperature;
    }
    if (config.max_tokens) {
        body["max_tokens"] = *config.max_tokens;
    }
    if (config.top_p) {
        body["top_p"] = *config.top_p;
    }
    if (config.stop && !config.stop->empty()) {
        JsonValue stops = JsonValue::array();
        for (const auto& s : *config.stop) {
            stops.push_back(s);
        }
        body["stop"] = stops;
    }
    if (config.seed) {
        body["seed"] = *config.seed;
    }
    
    return body;
}

Result<LLMResponse> OpenAIProvider::parseResponse(const JsonValue& json) const {
    LLMResponse response;
    
    // Parse choices[0]
    if (!json.has("choices") || !json["choices"].isArray() || json["choices"].size() == 0) {
        return makeOrchError<LLMResponse>(OrchError::PARSE_ERROR,
                                           "Invalid OpenAI response: no choices");
    }
    
    const auto& choice = json["choices"][0];
    
    if (!choice.has("message")) {
        return makeOrchError<LLMResponse>(OrchError::PARSE_ERROR,
                                           "Invalid OpenAI response: no message in choice");
    }
    
    const auto& msg = choice["message"];
    
    // Parse role (should always be assistant for responses)
    response.message.role = Message::Role::ASSISTANT;
    
    // Parse content
    if (msg.has("content") && !msg["content"].isNull()) {
        response.message.content = msg["content"].asString();
    }
    
    // Parse tool calls
    if (msg.has("tool_calls") && msg["tool_calls"].isArray()) {
        std::vector<ToolCall> calls;
        for (const auto& tc : msg["tool_calls"]) {
            ToolCall call;
            call.id = tc["id"].asString();
            
            if (tc.has("function")) {
                call.name = tc["function"]["name"].asString();
                std::string args_str = tc["function"]["arguments"].asString();
                try {
                    call.arguments = JsonValue::parse(args_str);
                } catch (...) {
                    // If arguments can't be parsed as JSON, store as string
                    call.arguments = args_str;
                }
            }
            calls.push_back(call);
        }
        response.message.tool_calls = calls;
    }
    
    // Parse finish reason
    if (choice.has("finish_reason") && !choice["finish_reason"].isNull()) {
        response.finish_reason = choice["finish_reason"].asString();
    }
    
    // Parse usage
    if (json.has("usage")) {
        Usage usage;
        const auto& u = json["usage"];
        if (u.has("prompt_tokens")) {
            usage.prompt_tokens = u["prompt_tokens"].asInt();
        }
        if (u.has("completion_tokens")) {
            usage.completion_tokens = u["completion_tokens"].asInt();
        }
        if (u.has("total_tokens")) {
            usage.total_tokens = u["total_tokens"].asInt();
        }
        response.usage = usage;
    }
    
    // Parse model used
    if (json.has("model")) {
        response.model = json["model"].asString();
    }
    
    return makeSuccess(response);
}

std::map<std::string, std::string> OpenAIProvider::buildHeaders() const {
    std::map<std::string, std::string> headers;
    headers["Content-Type"] = "application/json";
    headers["Authorization"] = "Bearer " + config_.api_key;
    
    if (!config_.organization.empty()) {
        headers["OpenAI-Organization"] = config_.organization;
    }
    
    return headers;
}

Result<LLMResponse> OpenAIProvider::handleApiError(const ApiResponse& response) const {
    std::string error_message = "OpenAI API error: " + std::to_string(response.status_code);
    
    try {
        JsonValue json = JsonValue::parse(response.body);
        if (json.has("error")) {
            const auto& error = json["error"];
            if (error.has("message")) {
                error_message = error["message"].asString();
            }
            if (error.has("type")) {
                error_message = error["type"].asString() + ": " + error_message;
            }
        }
    } catch (...) {
        error_message += " - " + response.body;
    }
    
    // Map status codes to error types
    OrchError::Code error_code;
    switch (response.status_code) {
        case 400:
            error_code = OrchError::INVALID_ARGUMENT;
            break;
        case 401:
            error_code = OrchError::AUTHENTICATION_FAILED;
            break;
        case 403:
            error_code = OrchError::PERMISSION_DENIED;
            break;
        case 404:
            error_code = OrchError::NOT_FOUND;
            break;
        case 429:
            error_code = OrchError::RATE_LIMITED;
            break;
        case 500:
        case 502:
        case 503:
            error_code = OrchError::SERVICE_UNAVAILABLE;
            break;
        default:
            error_code = OrchError::API_ERROR;
    }
    
    return makeOrchError<LLMResponse>(error_code, error_message);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher