#pragma once

// Main header for LLM functionality

#include "gopher/orch/llm/llm_types.h"
#include "gopher/orch/llm/llm_provider.h"
#include "gopher/orch/llm/openai_provider.h"
#include "gopher/orch/llm/anthropic_provider.h"
#include "gopher/orch/llm/ollama_provider.h"

namespace gopher {
namespace orch {
namespace llm {

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER REGISTRY
// ═══════════════════════════════════════════════════════════════════════

class LLMProviderRegistry {
public:
    static LLMProviderRegistry& instance() {
        static LLMProviderRegistry registry;
        return registry;
    }
    
    void registerProvider(const std::string& name, LLMProviderPtr provider) {
        providers_[name] = provider;
    }
    
    LLMProviderPtr getProvider(const std::string& name) const {
        auto it = providers_.find(name);
        return (it != providers_.end()) ? it->second : nullptr;
    }
    
    std::vector<std::string> listProviders() const {
        std::vector<std::string> names;
        for (const auto& pair : providers_) {
            names.push_back(pair.first);
        }
        return names;
    }
    
    // Convenience: Auto-detect provider from environment
    static LLMProviderPtr fromEnvironment() {
        // Check for API keys in order of preference
        if (std::getenv("OPENAI_API_KEY")) {
            return makeOpenAIProviderFromEnv();
        }
        if (std::getenv("ANTHROPIC_API_KEY")) {
            return makeAnthropicProviderFromEnv();
        }
        if (std::getenv("OLLAMA_HOST") || 
            // Check if Ollama is running locally
            std::system("curl -s http://localhost:11434/api/tags >/dev/null 2>&1") == 0) {
            return makeOllamaProviderFromEnv();
        }
        return nullptr;
    }

private:
    LLMProviderRegistry() = default;
    std::map<std::string, LLMProviderPtr> providers_;
};

// ═══════════════════════════════════════════════════════════════════════
// LLM CHAIN - Compose LLM operations
// ═══════════════════════════════════════════════════════════════════════

class LLMChain : public Runnable<JsonValue, JsonValue> {
public:
    struct Config {
        LLMProviderPtr provider;
        std::string system_prompt;
        LLMConfig llm_config = LLMConfig::defaultConfig();
        std::vector<ToolSpec> tools;
        bool auto_execute_tools = false;
        optional<std::function<Result<JsonValue>(const ToolCall&)>> tool_executor;
    };
    
    explicit LLMChain(const Config& config) : config_(config) {}
    
    void invoke(const JsonValue& input,
                const RunnableConfig& runnable_config,
                Dispatcher& dispatcher,
                ResultCallback<JsonValue> callback) override {
        
        // Build messages from input
        std::vector<Message> messages;
        
        // Add system prompt if configured
        if (!config_.system_prompt.empty()) {
            messages.push_back(Message::system(config_.system_prompt));
        }
        
        // Parse input
        if (input.isString()) {
            messages.push_back(Message::user(input.asString()));
        } else if (input.isObject() && input.has("messages")) {
            // Parse message history
            for (const auto& msg : input["messages"]) {
                Message m;
                std::string role = msg["role"].asString();
                if (role == "system") m.role = Message::Role::SYSTEM;
                else if (role == "user") m.role = Message::Role::USER;
                else if (role == "assistant") m.role = Message::Role::ASSISTANT;
                else if (role == "tool") m.role = Message::Role::TOOL;
                
                m.content = msg["content"].asString();
                messages.push_back(m);
            }
        }
        
        // Call LLM with potential tool execution loop
        executeLLMWithTools(messages, dispatcher, callback);
    }
    
    std::string name() const override {
        return "llm_chain:" + config_.provider->name();
    }

private:
    void executeLLMWithTools(
        std::vector<Message> messages,
        Dispatcher& dispatcher,
        ResultCallback<JsonValue> callback) {
        
        config_.provider->chat(
            messages,
            config_.tools,
            config_.llm_config,
            dispatcher,
            [this, messages, &dispatcher, callback](Result<LLMResponse> result) mutable {
                if (mcp::holds_alternative<Error>(result)) {
                    callback(Result<JsonValue>(mcp::get<Error>(result)));
                    return;
                }
                
                auto& response = mcp::get<LLMResponse>(result);
                
                // Check if we need to execute tools
                if (config_.auto_execute_tools && response.hasToolCalls() && config_.tool_executor) {
                    // Add assistant message with tool calls
                    messages.push_back(response.message);
                    
                    // Execute each tool call
                    std::vector<Message> tool_results;
                    for (const auto& call : response.toolCalls()) {
                        auto result = (*config_.tool_executor)(call);
                        if (mcp::holds_alternative<Error>(result)) {
                            // Tool execution failed
                            tool_results.push_back(
                                Message::toolResult(call.id, 
                                    "Error: " + mcp::get<Error>(result).message));
                        } else {
                            tool_results.push_back(
                                Message::toolResult(call.id,
                                    mcp::get<JsonValue>(result).toString()));
                        }
                    }
                    
                    // Add tool results to messages
                    messages.insert(messages.end(), tool_results.begin(), tool_results.end());
                    
                    // Call LLM again with tool results
                    executeLLMWithTools(messages, dispatcher, callback);
                } else {
                    // No tools to execute, return response
                    JsonValue output = JsonValue::object();
                    output["content"] = response.message.content;
                    output["role"] = "assistant";
                    
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
                }
            });
    }
    
    Config config_;
};

// Factory function
inline std::shared_ptr<LLMChain> makeLLMChain(
    LLMProviderPtr provider,
    const std::string& system_prompt = "",
    const LLMConfig& config = LLMConfig::defaultConfig()) {
    
    LLMChain::Config chain_config;
    chain_config.provider = provider;
    chain_config.system_prompt = system_prompt;
    chain_config.llm_config = config;
    
    return std::make_shared<LLMChain>(chain_config);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher