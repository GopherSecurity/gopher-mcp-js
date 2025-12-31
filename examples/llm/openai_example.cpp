// OpenAI Provider Example
// This example demonstrates how to use the OpenAI provider for GPT models

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <memory>
#include <sstream>

// Mock types for demonstration
namespace gopher {
namespace orch {
namespace llm {

// Message structure
struct Message {
    enum class Role { SYSTEM, USER, ASSISTANT, FUNCTION };
    Role role;
    std::string content;
    std::string name;  // For function messages
    
    static Message system(const std::string& text) {
        return {Role::SYSTEM, text, ""};
    }
    
    static Message user(const std::string& text) {
        return {Role::USER, text, ""};
    }
    
    static Message assistant(const std::string& text) {
        return {Role::ASSISTANT, text, ""};
    }
    
    static Message function(const std::string& name, const std::string& result) {
        return {Role::FUNCTION, result, name};
    }
};

// Tool/Function specification
struct ToolSpec {
    std::string name;
    std::string description;
    std::string parameters; // JSON schema as string
};

// Configuration
struct LLMConfig {
    std::string model = "gpt-3.5-turbo";
    double temperature = 0.7;
    int max_tokens = 1024;
    double top_p = 1.0;
    int seed = -1;
    
    static LLMConfig gpt4() {
        return {
            .model = "gpt-4-turbo-preview",
            .temperature = 0.7,
            .max_tokens = 4096
        };
    }
    
    static LLMConfig gpt35() {
        return {
            .model = "gpt-3.5-turbo",
            .temperature = 0.7,
            .max_tokens = 2048
        };
    }
    
    static LLMConfig deterministic() {
        return {
            .model = "gpt-3.5-turbo",
            .temperature = 0.0,
            .max_tokens = 1024,
            .top_p = 1.0,
            .seed = 42
        };
    }
};

// Response
struct LLMResponse {
    Message message;
    std::string finish_reason;
    struct Usage {
        int prompt_tokens;
        int completion_tokens;
        int total_tokens;
    };
    std::unique_ptr<Usage> usage;
    
    // For function calling
    struct FunctionCall {
        std::string name;
        std::string arguments; // JSON string
    };
    std::vector<FunctionCall> function_calls;
};

// OpenAI configuration
struct OpenAIConfig {
    std::string api_key;
    std::string base_url = "https://api.openai.com/v1";
    std::string organization;
    std::string default_model = "gpt-3.5-turbo";
    
    static OpenAIConfig fromEnv() {
        OpenAIConfig config;
        if (const char* key = std::getenv("OPENAI_API_KEY")) {
            config.api_key = key;
        }
        if (const char* org = std::getenv("OPENAI_ORG_ID")) {
            config.organization = org;
        }
        return config;
    }
};

// Mock OpenAI Provider
class OpenAIProvider {
public:
    explicit OpenAIProvider(const OpenAIConfig& config)
        : config_(config) {
        if (config_.api_key.empty()) {
            throw std::runtime_error("OpenAI API key is required. Set OPENAI_API_KEY environment variable.");
        }
        std::cout << "✓ OpenAI provider initialized" << std::endl;
        if (!config_.organization.empty()) {
            std::cout << "  Organization: " << config_.organization << std::endl;
        }
    }
    
    explicit OpenAIProvider(const std::string& api_key)
        : OpenAIProvider(OpenAIConfig{api_key}) {}
    
    // Chat completion
    LLMResponse chat(const std::vector<Message>& messages,
                     const LLMConfig& config = LLMConfig(),
                     const std::vector<ToolSpec>& tools = {}) {
        
        std::cout << "\n📤 Sending request to OpenAI API..." << std::endl;
        std::cout << "   Model: " << config.model << std::endl;
        std::cout << "   Temperature: " << config.temperature << std::endl;
        std::cout << "   Max tokens: " << config.max_tokens << std::endl;
        
        if (!tools.empty()) {
            std::cout << "   Tools available: ";
            for (const auto& tool : tools) {
                std::cout << tool.name << " ";
            }
            std::cout << std::endl;
        }
        
        // Mock API response
        LLMResponse response;
        response.message.role = Message::Role::ASSISTANT;
        response.finish_reason = "stop";
        
        // Generate mock response based on input
        if (!messages.empty()) {
            const auto& last_msg = messages.back();
            if (last_msg.role == Message::Role::USER) {
                // Check if asking about functions/tools
                if (!tools.empty() && last_msg.content.find("weather") != std::string::npos) {
                    // Mock function call
                    response.message.content = "I'll check the weather for you.";
                    response.function_calls.push_back({
                        "get_weather",
                        R"({"location": "San Francisco", "units": "celsius"})"
                    });
                    response.finish_reason = "function_call";
                } else if (last_msg.content.find("GPT") != std::string::npos ||
                          last_msg.content.find("model") != std::string::npos) {
                    if (config.model.find("gpt-4") != std::string::npos) {
                        response.message.content = 
                            "I'm GPT-4, OpenAI's most advanced language model. I offer:\n"
                            "• Enhanced reasoning and analysis capabilities\n"
                            "• Better understanding of nuanced instructions\n"
                            "• More accurate and detailed responses\n"
                            "• Stronger performance on complex tasks\n"
                            "• Support for up to 128K tokens in context";
                    } else {
                        response.message.content = 
                            "I'm GPT-3.5 Turbo, a fast and efficient language model from OpenAI. "
                            "I provide quick, accurate responses for a wide range of tasks including "
                            "conversation, analysis, coding help, and creative writing.";
                    }
                } else if (last_msg.content.find("code") != std::string::npos) {
                    response.message.content = 
                        "```python\n"
                        "# Example code generated by " + config.model + "\n"
                        "def greet(name):\n"
                        "    return f\"Hello, {name}! Welcome to OpenAI.\"\n"
                        "\n"
                        "print(greet(\"Developer\"))\n"
                        "```\n\n"
                        "This is a simple Python function example. I can help with various "
                        "programming languages and tasks!";
                } else {
                    response.message.content = 
                        "[Mock " + config.model + " response]\n"
                        "I understand you said: \"" + last_msg.content + "\"\n\n"
                        "In a real implementation, this would connect to OpenAI's API and provide "
                        "an actual GPT-generated response.";
                }
            }
        }
        
        // Mock usage statistics
        response.usage = std::make_unique<LLMResponse::Usage>();
        int total_content = 0;
        for (const auto& msg : messages) {
            total_content += msg.content.length();
        }
        response.usage->prompt_tokens = total_content / 4;
        response.usage->completion_tokens = response.message.content.length() / 4;
        response.usage->total_tokens = response.usage->prompt_tokens + response.usage->completion_tokens;
        
        std::cout << "📥 Received response from OpenAI" << std::endl;
        
        return response;
    }
    
    // List available models
    std::vector<std::string> listModels() {
        return {
            "gpt-4-turbo-preview",
            "gpt-4-1106-preview",
            "gpt-4",
            "gpt-4-32k",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k",
            "gpt-3.5-turbo-1106"
        };
    }
    
private:
    OpenAIConfig config_;
};

} // namespace llm
} // namespace orch
} // namespace gopher

// Helper function
void printResponse(const gopher::orch::llm::LLMResponse& response) {
    std::cout << "\n╔══════════════════════════════════════════════════════╗" << std::endl;
    std::cout << "║ 🤖 GPT Response                                       ║" << std::endl;
    std::cout << "╚══════════════════════════════════════════════════════╝\n" << std::endl;
    std::cout << response.message.content << std::endl;
    
    if (!response.function_calls.empty()) {
        std::cout << "\n📞 Function Calls:" << std::endl;
        for (const auto& call : response.function_calls) {
            std::cout << "   • " << call.name << "(" << call.arguments << ")" << std::endl;
        }
    }
    
    std::cout << "\n────────────────────────────────────────────────────────" << std::endl;
    
    if (response.usage) {
        std::cout << "📊 Usage: " 
                  << response.usage->prompt_tokens << " prompt + "
                  << response.usage->completion_tokens << " completion = "
                  << response.usage->total_tokens << " total tokens" << std::endl;
    }
    std::cout << "✓ Finish reason: " << response.finish_reason << std::endl;
}

int main() {
    using namespace gopher::orch::llm;
    
    std::cout << "🚀 OpenAI GPT Example\n" << std::endl;
    
    // Check for API key
    const char* api_key = std::getenv("OPENAI_API_KEY");
    if (!api_key) {
        std::cout << "⚠️  Warning: OPENAI_API_KEY environment variable not set" << std::endl;
        std::cout << "   Using mock responses for demonstration\n" << std::endl;
        api_key = "mock-api-key-for-demo";
    }
    
    try {
        // ═══════════════════════════════════════════════════════════════════
        // Example 1: Basic Chat with GPT-3.5
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "=== Example 1: Basic Chat with GPT-3.5 Turbo ===" << std::endl;
        
        auto provider = std::make_shared<OpenAIProvider>(api_key);
        
        std::vector<Message> messages = {
            Message::system("You are a helpful assistant."),
            Message::user("What model are you and what can you do?")
        };
        
        auto response = provider->chat(messages, LLMConfig::gpt35());
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 2: GPT-4 for Complex Reasoning
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 2: GPT-4 for Complex Tasks ===" << std::endl;
        
        messages = {
            Message::system("You are an expert programmer and architect."),
            Message::user("Show me a simple code example in Python.")
        };
        
        response = provider->chat(messages, LLMConfig::gpt4());
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 3: Function Calling
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 3: Function Calling ===" << std::endl;
        
        // Define available tools
        std::vector<ToolSpec> tools = {
            {
                "get_weather",
                "Get the current weather in a location",
                R"({
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "units": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                    },
                    "required": ["location"]
                })"
            },
            {
                "search_web",
                "Search the web for information",
                R"({
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"}
                    },
                    "required": ["query"]
                })"
            }
        };
        
        messages = {
            Message::user("What's the weather like in San Francisco?")
        };
        
        response = provider->chat(messages, LLMConfig(), tools);
        printResponse(response);
        
        // If function was called, show how to handle it
        if (!response.function_calls.empty()) {
            std::cout << "\n💡 Handling function call..." << std::endl;
            
            // Add the assistant's message with function call
            messages.push_back(response.message);
            
            // Mock function execution result
            messages.push_back(Message::function(
                "get_weather",
                R"({"temperature": 18, "conditions": "Partly cloudy", "humidity": 65})"
            ));
            
            // Get final response
            std::cout << "\nGetting final response with function result..." << std::endl;
            response = provider->chat(messages, LLMConfig());
            printResponse(response);
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 4: Deterministic Output
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 4: Deterministic Output ===" << std::endl;
        
        messages = {
            Message::user("Generate a random number between 1 and 10.")
        };
        
        std::cout << "🎯 First call (seed=42, temperature=0):" << std::endl;
        response = provider->chat(messages, LLMConfig::deterministic());
        std::cout << "Response: " << response.message.content << std::endl;
        
        std::cout << "\n🎯 Second call (same settings):" << std::endl;
        response = provider->chat(messages, LLMConfig::deterministic());
        std::cout << "Response: " << response.message.content << std::endl;
        std::cout << "(In production, these would be identical due to seed)" << std::endl;
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 5: Model Comparison
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 5: Available Models ===" << std::endl;
        
        auto models = provider->listModels();
        std::cout << "Available OpenAI models:" << std::endl;
        for (const auto& model : models) {
            std::cout << "   • " << model;
            if (model.find("gpt-4") != std::string::npos) {
                std::cout << " (Advanced reasoning)";
            } else if (model.find("32k") != std::string::npos || 
                      model.find("16k") != std::string::npos) {
                std::cout << " (Extended context)";
            } else if (model.find("turbo") != std::string::npos) {
                std::cout << " (Fast & efficient)";
            }
            std::cout << std::endl;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Implementation Notes
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n╔══════════════════════════════════════════════════════╗" << std::endl;
        std::cout << "║ 📝 Implementation Notes                               ║" << std::endl;
        std::cout << "╚══════════════════════════════════════════════════════╝" << std::endl;
        
        std::cout << "\nThis example demonstrates the OpenAI provider interface." << std::endl;
        std::cout << "\nKey features shown:" << std::endl;
        std::cout << "• Multiple GPT models (3.5, 4, with different contexts)" << std::endl;
        std::cout << "• Function/tool calling for extending capabilities" << std::endl;
        std::cout << "• Deterministic outputs with seed parameter" << std::endl;
        std::cout << "• Token usage tracking for cost monitoring" << std::endl;
        
        std::cout << "\n🔑 To use with real API:" << std::endl;
        std::cout << "   export OPENAI_API_KEY='sk-...'" << std::endl;
        std::cout << "   export OPENAI_ORG_ID='org-...' (optional)" << std::endl;
        std::cout << "   ./openai_example" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "\n❌ Error: " << e.what() << std::endl;
        return 1;
    }
    
    std::cout << "\n✅ OpenAI example complete!" << std::endl;
    
    return 0;
}