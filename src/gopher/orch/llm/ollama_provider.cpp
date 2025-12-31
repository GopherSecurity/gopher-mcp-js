#include "gopher/orch/llm/ollama_provider.h"
#include "../api/production_api_engine.h"

namespace gopher {
namespace orch {
namespace llm {

// ═══════════════════════════════════════════════════════════════════════
// CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════

OllamaProvider::OllamaProvider(const OllamaConfig& config)
    : config_(config) {
    auto sync_engine = std::make_shared<api::ProductionApiEngine>();
    sync_engine->setBaseUrl(config_.base_url);
    api_engine_ = std::make_shared<api::AsyncApiEngine>(sync_engine);
}

// ═══════════════════════════════════════════════════════════════════════
// LIST MODELS
// ═══════════════════════════════════════════════════════════════════════

void OllamaProvider::listModels(
    Dispatcher& dispatcher,
    std::function<void(Result<std::vector<std::string>>)> callback) {
    
    auto headers = buildHeaders();
    
    api_engine_->get("/api/tags", headers, dispatcher,
        [callback](Result<ApiResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(Result<std::vector<std::string>>(mcp::get<Error>(result)));
                return;
            }
            
            auto& response = mcp::get<ApiResponse>(result);
            if (response.status_code != 200) {
                callback(makeOrchError<std::vector<std::string>>(
                    OrchError::API_ERROR,
                    "Failed to list Ollama models: " + response.body));
                return;
            }
            
            try {
                JsonValue json = JsonValue::parse(response.body);
                std::vector<std::string> models;
                
                if (json.has("models") && json["models"].isArray()) {
                    for (const auto& model : json["models"]) {
                        if (model.has("name")) {
                            models.push_back(model["name"].asString());
                        }
                    }
                }
                
                callback(makeSuccess(models));
            } catch (const std::exception& e) {
                callback(makeOrchError<std::vector<std::string>>(
                    OrchError::PARSE_ERROR,
                    std::string("Failed to parse Ollama models: ") + e.what()));
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════

void OllamaProvider::chat(
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
    
    api_engine_->post("/api/chat", body, headers, dispatcher,
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
                    std::string("Failed to parse Ollama response: ") + e.what()));
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING
// ═══════════════════════════════════════════════════════════════════════

void OllamaProvider::chatStream(
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
    
    // TODO: Implement streaming with newline-delimited JSON when HTTP client supports it
    // For now, fall back to non-streaming
    chat(messages, tools, config, dispatcher, on_complete);
}

// ═══════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════

void OllamaProvider::healthCheck(
    Dispatcher& dispatcher,
    std::function<void(Result<bool>)> callback) {
    
    auto headers = buildHeaders();
    
    api_engine_->get("/api/version", headers, dispatcher,
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
// OLLAMA-SPECIFIC METHODS
// ═══════════════════════════════════════════════════════════════════════

void OllamaProvider::pullModel(
    const std::string& model_name,
    Dispatcher& dispatcher,
    std::function<void(const std::string&)> on_progress,
    std::function<void(Result<bool>)> callback) {
    
    JsonValue body = JsonValue::object();
    body["name"] = model_name;
    body["stream"] = false;  // TODO: Support streaming progress
    
    auto headers = buildHeaders();
    
    api_engine_->post("/api/pull", body, headers, dispatcher,
        [callback](Result<ApiResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(Result<bool>(mcp::get<Error>(result)));
                return;
            }
            
            auto& response = mcp::get<ApiResponse>(result);
            
            if (response.status_code != 200) {
                callback(makeOrchError<bool>(
                    OrchError::API_ERROR,
                    "Failed to pull model: " + response.body));
                return;
            }
            
            callback(makeSuccess(true));
        });
}

void OllamaProvider::generateEmbeddings(
    const std::string& text,
    const std::string& model,
    Dispatcher& dispatcher,
    std::function<void(Result<std::vector<float>>)> callback) {
    
    JsonValue body = JsonValue::object();
    body["model"] = model.empty() ? "llama2" : model;
    body["prompt"] = text;
    
    auto headers = buildHeaders();
    
    api_engine_->post("/api/embeddings", body, headers, dispatcher,
        [callback](Result<ApiResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(Result<std::vector<float>>(mcp::get<Error>(result)));
                return;
            }
            
            auto& response = mcp::get<ApiResponse>(result);
            
            if (response.status_code != 200) {
                callback(makeOrchError<std::vector<float>>(
                    OrchError::API_ERROR,
                    "Failed to generate embeddings: " + response.body));
                return;
            }
            
            try {
                JsonValue json = JsonValue::parse(response.body);
                std::vector<float> embeddings;
                
                if (json.has("embedding") && json["embedding"].isArray()) {
                    for (const auto& val : json["embedding"]) {
                        embeddings.push_back(static_cast<float>(val.asDouble()));
                    }
                }
                
                callback(makeSuccess(embeddings));
            } catch (const std::exception& e) {
                callback(makeOrchError<std::vector<float>>(
                    OrchError::PARSE_ERROR,
                    std::string("Failed to parse embeddings: ") + e.what()));
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════
// PRIVATE HELPER METHODS
// ═══════════════════════════════════════════════════════════════════════

JsonValue OllamaProvider::buildRequestBody(
    const std::vector<Message>& messages,
    const std::vector<ToolSpec>& tools,
    const LLMConfig& config) const {
    
    JsonValue body = JsonValue::object();
    body["model"] = config.model.empty() ? config_.default_model : config.model;
    body["stream"] = false;  // Non-streaming by default
    
    // Convert messages to Ollama format
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
                // Ollama doesn't have native tool support yet
                // Include tool results as user messages
                m["role"] = "user";
                m["content"] = "Tool result for " + msg.tool_call_id.value_or("unknown") + ": " + msg.content;
                msgs.push_back(m);
                continue;
        }
        
        m["content"] = msg.content;
        
        // Handle tool calls in content for models that support it
        if (msg.tool_calls && !msg.tool_calls->empty()) {
            std::string tools_text = msg.content + "\n\nTool calls:\n";
            for (const auto& call : *msg.tool_calls) {
                tools_text += "- " + call.name + "(" + call.arguments.toString() + ")\n";
            }
            m["content"] = tools_text;
        }
        
        msgs.push_back(m);
    }
    body["messages"] = msgs;
    
    // Convert tools if the model supports them (future Ollama feature)
    if (!tools.empty()) {
        body["tools"] = convertToolsToOllamaFormat(tools);
    }
    
    // Options
    JsonValue options = JsonValue::object();
    
    if (config.temperature) {
        options["temperature"] = *config.temperature;
    }
    if (config.max_tokens) {
        options["num_predict"] = *config.max_tokens;
    }
    if (config.top_p) {
        options["top_p"] = *config.top_p;
    }
    if (config.seed) {
        options["seed"] = *config.seed;
    }
    if (config.stop && !config.stop->empty()) {
        JsonValue stops = JsonValue::array();
        for (const auto& s : *config.stop) {
            stops.push_back(s);
        }
        options["stop"] = stops;
    }
    
    // Ollama-specific options
    if (config_.num_ctx) {
        options["num_ctx"] = *config_.num_ctx;
    }
    if (config_.num_gpu) {
        options["num_gpu"] = *config_.num_gpu;
    }
    
    body["options"] = options;
    
    // Keep alive
    if (config_.keep_alive) {
        body["keep_alive"] = "5m";  // Keep model loaded for 5 minutes
    }
    
    return body;
}

Result<LLMResponse> OllamaProvider::parseResponse(const JsonValue& json) const {
    LLMResponse response;
    response.message.role = Message::Role::ASSISTANT;
    
    // Parse message content
    if (json.has("message")) {
        const auto& msg = json["message"];
        if (msg.has("content")) {
            response.message.content = msg["content"].asString();
        }
    }
    
    // Parse finish reason
    if (json.has("done") && json["done"].asBool()) {
        response.finish_reason = "stop";
    }
    
    // Parse usage statistics
    if (json.has("eval_count") || json.has("prompt_eval_count")) {
        Usage usage;
        if (json.has("prompt_eval_count")) {
            usage.prompt_tokens = json["prompt_eval_count"].asInt();
        }
        if (json.has("eval_count")) {
            usage.completion_tokens = json["eval_count"].asInt();
        }
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
        response.usage = usage;
    }
    
    // Parse model
    if (json.has("model")) {
        response.model = json["model"].asString();
    }
    
    // Check for tool calls in the response (if Ollama adds support)
    // For now, we might need to parse them from the text content
    // This is a placeholder for future functionality
    
    return makeSuccess(response);
}

std::map<std::string, std::string> OllamaProvider::buildHeaders() const {
    std::map<std::string, std::string> headers;
    headers["Content-Type"] = "application/json";
    return headers;
}

Result<LLMResponse> OllamaProvider::handleApiError(const ApiResponse& response) const {
    std::string error_message = "Ollama API error: " + std::to_string(response.status_code);
    
    try {
        JsonValue json = JsonValue::parse(response.body);
        if (json.has("error")) {
            error_message = json["error"].asString();
        }
    } catch (...) {
        error_message += " - " + response.body;
    }
    
    OrchError::Code error_code;
    switch (response.status_code) {
        case 400: error_code = OrchError::INVALID_ARGUMENT; break;
        case 404: error_code = OrchError::NOT_FOUND; break;
        case 500: error_code = OrchError::SERVICE_UNAVAILABLE; break;
        default: error_code = OrchError::API_ERROR;
    }
    
    return makeOrchError<LLMResponse>(error_code, error_message);
}

JsonValue OllamaProvider::convertToolsToOllamaFormat(const std::vector<ToolSpec>& tools) const {
    // Placeholder for future Ollama tool support
    // Currently, Ollama doesn't have native tool/function calling
    // We could potentially use a specific prompt format to simulate it
    
    JsonValue toolsJson = JsonValue::array();
    for (const auto& tool : tools) {
        JsonValue t = JsonValue::object();
        t["name"] = tool.name;
        t["description"] = tool.description;
        t["parameters"] = tool.parameters;
        toolsJson.push_back(t);
    }
    
    return toolsJson;
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher