#pragma once

#include "gopher/orch/core/runnable.h"
#include "gopher/orch/core/types.h"
#include "gopher/orch/llm/llm_types.h"
#include "gopher/orch/api/api_engine.h"
#include <memory>
#include <functional>

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::core;
using namespace gopher::orch::api;

// ═══════════════════════════════════════════════════════════════════════
// LLM PROVIDER INTERFACE
// ═══════════════════════════════════════════════════════════════════════

class LLMProvider {
public:
    virtual ~LLMProvider() = default;
    
    // Provider name (e.g., "openai", "anthropic", "ollama")
    virtual std::string name() const = 0;
    
    // Model availability check
    virtual void listModels(
        Dispatcher& dispatcher,
        std::function<void(Result<std::vector<std::string>>)> callback) {
        // Default: return configured model
        dispatcher.post([callback] {
            callback(makeSuccess(std::vector<std::string>{}));
        });
    }
    
    // Chat completion with tool support
    // This is the main method - send messages, get response (possibly with tool calls)
    virtual void chat(
        const std::vector<Message>& messages,
        const std::vector<ToolSpec>& tools,    // Available tools for LLM to call
        const LLMConfig& config,
        Dispatcher& dispatcher,
        std::function<void(Result<LLMResponse>)> callback) = 0;
    
    // Convenience: chat without tools
    void chat(const std::vector<Message>& messages,
              const LLMConfig& config,
              Dispatcher& dispatcher,
              std::function<void(Result<LLMResponse>)> callback) {
        chat(messages, {}, config, dispatcher, std::move(callback));
    }
    
    // Optional: streaming support
    virtual bool supportsStreaming() const { return false; }
    
    virtual void chatStream(
        const std::vector<Message>& messages,
        const std::vector<ToolSpec>& tools,
        const LLMConfig& config,
        Dispatcher& dispatcher,
        std::function<void(const StreamChunk&)> on_chunk,
        std::function<void(Result<LLMResponse>)> on_complete) {
        // Default: not supported, fall back to non-streaming
        chat(messages, tools, config, dispatcher, std::move(on_complete));
    }
    
    // Health check
    virtual void healthCheck(
        Dispatcher& dispatcher,
        std::function<void(Result<bool>)> callback) {
        // Default: try a minimal API call
        dispatcher.post([callback] {
            callback(makeSuccess(true));
        });
    }

protected:
    LLMProvider() = default;
    
    // Helper: validate configuration
    Result<bool> validateConfig(const LLMConfig& config) const {
        if (config.model.empty()) {
            return makeOrchError<bool>(OrchError::INVALID_ARGUMENT, 
                                        "Model name is required");
        }
        if (config.temperature && (*config.temperature < 0.0 || *config.temperature > 2.0)) {
            return makeOrchError<bool>(OrchError::INVALID_ARGUMENT,
                                        "Temperature must be between 0.0 and 2.0");
        }
        if (config.top_p && (*config.top_p < 0.0 || *config.top_p > 1.0)) {
            return makeOrchError<bool>(OrchError::INVALID_ARGUMENT,
                                        "top_p must be between 0.0 and 1.0");
        }
        return makeSuccess(true);
    }
};

using LLMProviderPtr = std::shared_ptr<LLMProvider>;

// ═══════════════════════════════════════════════════════════════════════
// LLM PROVIDER AS RUNNABLE
// ═══════════════════════════════════════════════════════════════════════

// Adapter to use LLMProvider as a Runnable
class LLMRunnable : public Runnable<JsonValue, JsonValue> {
public:
    struct Config {
        LLMProviderPtr provider;
        LLMConfig llm_config;
        bool include_tools = false;
        std::vector<ToolSpec> tools;
    };
    
    explicit LLMRunnable(const Config& config) 
        : config_(config) {}
    
    void invoke(const JsonValue& input,
                const RunnableConfig& config,
                Dispatcher& dispatcher,
                ResultCallback<JsonValue> callback) override {
        
        // Parse input as messages
        std::vector<Message> messages;
        if (input.isArray()) {
            for (size_t i = 0; i < input.size(); ++i) {
                const auto& msg = input[i];
                Message m;
                std::string role = msg["role"].getString();
                if (role == "system") m.role = Message::Role::SYSTEM;
                else if (role == "user") m.role = Message::Role::USER;
                else if (role == "assistant") m.role = Message::Role::ASSISTANT;
                else if (role == "tool") m.role = Message::Role::TOOL;
                
                m.content = msg["content"].getString();
                
                if (msg.contains("tool_call_id")) {
                    m.tool_call_id = msg["tool_call_id"].getString();
                }
                
                messages.push_back(m);
            }
        } else if (input.isString()) {
            // Single user message
            messages.push_back(Message::user(input.getString()));
        }
        
        // Call LLM
        config_.provider->chat(
            messages, 
            config_.include_tools ? config_.tools : std::vector<ToolSpec>{},
            config_.llm_config,
            dispatcher,
            [callback](Result<LLMResponse> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    callback(Result<JsonValue>(mcp::get<Error>(result)));
                    return;
                }
                
                auto& response = mcp::get<LLMResponse>(result);
                
                // Convert response to JSON
                JsonValue output = JsonValue::object();
                output["role"] = "assistant";
                output["content"] = response.message.content;
                
                if (response.hasToolCalls()) {
                    JsonValue tools = JsonValue::array();
                    for (const auto& call : response.toolCalls()) {
                        JsonValue t = JsonValue::object();
                        t["id"] = call.id;
                        t["name"] = call.name;
                        t["arguments"] = call.arguments;
                        tools.push_back(t);
                    }
                    output["tool_calls"] = tools;
                }
                
                output["finish_reason"] = response.finish_reason;
                
                if (response.usage) {
                    output["usage"] = response.usage->toJson();
                }
                
                callback(makeSuccess(output));
            });
    }
    
    std::string name() const override {
        return "llm:" + config_.provider->name();
    }

private:
    Config config_;
};

// Factory function
inline std::shared_ptr<LLMRunnable> makeLLMRunnable(
    LLMProviderPtr provider,
    const LLMConfig& config = LLMConfig::defaultConfig()) {
    
    LLMRunnable::Config runnable_config;
    runnable_config.provider = provider;
    runnable_config.llm_config = config;
    
    return std::make_shared<LLMRunnable>(runnable_config);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher