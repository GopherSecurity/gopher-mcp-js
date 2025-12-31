// Anthropic Provider Example
// This example demonstrates how to use the Anthropic provider for Claude models

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <memory>

// Mock types for demonstration (simplified from the full implementation)
namespace gopher {
namespace orch {
namespace llm {

// Message structure
struct Message {
    enum class Role { SYSTEM, USER, ASSISTANT, TOOL };
    Role role;
    std::string content;
    
    static Message system(const std::string& text) {
        return {Role::SYSTEM, text};
    }
    
    static Message user(const std::string& text) {
        return {Role::USER, text};
    }
    
    static Message assistant(const std::string& text) {
        return {Role::ASSISTANT, text};
    }
};

// Configuration for LLM
struct LLMConfig {
    std::string model = "claude-3-haiku-20240307";
    double temperature = 0.7;
    int max_tokens = 1024;
    
    static LLMConfig deterministic() {
        return {
            .model = "claude-3-haiku-20240307",
            .temperature = 0.0,
            .max_tokens = 1024
        };
    }
    
    static LLMConfig creative() {
        return {
            .model = "claude-3-opus-20240229",
            .temperature = 0.9,
            .max_tokens = 2048
        };
    }
};

// Response from LLM
struct LLMResponse {
    Message message;
    std::string finish_reason;
    struct Usage {
        int prompt_tokens;
        int completion_tokens;
        int total_tokens;
    };
    std::unique_ptr<Usage> usage;
};

// Anthropic configuration
struct AnthropicConfig {
    std::string api_key;
    std::string base_url = "https://api.anthropic.com/v1";
    std::string anthropic_version = "2023-06-01";
    std::string default_model = "claude-3-haiku-20240307";
    
    static AnthropicConfig fromEnv() {
        AnthropicConfig config;
        if (const char* key = std::getenv("ANTHROPIC_API_KEY")) {
            config.api_key = key;
        }
        return config;
    }
};

// Mock Anthropic Provider for demonstration
class AnthropicProvider {
public:
    explicit AnthropicProvider(const AnthropicConfig& config)
        : config_(config) {
        if (config_.api_key.empty()) {
            throw std::runtime_error("Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.");
        }
        std::cout << "✓ Anthropic provider initialized with API key" << std::endl;
    }
    
    explicit AnthropicProvider(const std::string& api_key)
        : AnthropicProvider(AnthropicConfig{api_key}) {}
    
    std::string name() const { return "anthropic"; }
    
    // Synchronous chat for demonstration (real implementation would be async)
    LLMResponse chat(const std::vector<Message>& messages,
                     const LLMConfig& config = LLMConfig()) {
        
        std::cout << "\n📤 Sending request to Anthropic API..." << std::endl;
        std::cout << "   Model: " << config.model << std::endl;
        std::cout << "   Temperature: " << config.temperature << std::endl;
        std::cout << "   Max tokens: " << config.max_tokens << std::endl;
        
        // Extract system message (Anthropic handles system messages separately)
        std::string system_prompt;
        std::vector<Message> user_messages;
        
        for (const auto& msg : messages) {
            if (msg.role == Message::Role::SYSTEM) {
                if (!system_prompt.empty()) system_prompt += "\n\n";
                system_prompt += msg.content;
            } else {
                user_messages.push_back(msg);
            }
        }
        
        if (!system_prompt.empty()) {
            std::cout << "   System prompt: \"" << system_prompt.substr(0, 50) 
                      << (system_prompt.length() > 50 ? "..." : "") << "\"" << std::endl;
        }
        
        // Mock API response
        // In real implementation, this would:
        // 1. Build JSON request with messages
        // 2. Send HTTPS POST to api.anthropic.com/v1/messages
        // 3. Parse JSON response
        
        LLMResponse response;
        response.message.role = Message::Role::ASSISTANT;
        response.finish_reason = "stop";
        
        // Create a mock response based on the last user message
        if (!user_messages.empty()) {
            const auto& last_msg = user_messages.back();
            if (last_msg.role == Message::Role::USER) {
                // Generate mock Claude response
                if (last_msg.content.find("hello") != std::string::npos ||
                    last_msg.content.find("Hello") != std::string::npos) {
                    response.message.content = 
                        "Hello! I'm Claude, an AI assistant created by Anthropic. "
                        "I'm here to help with a wide variety of tasks including answering questions, "
                        "helping with analysis and writing, coding, math, creative projects, and more. "
                        "How can I assist you today?";
                } else if (last_msg.content.find("code") != std::string::npos) {
                    response.message.content = 
                        "I'd be happy to help with coding! I can assist with:\n"
                        "• Writing code in various languages (Python, JavaScript, C++, etc.)\n"
                        "• Debugging and explaining code\n"
                        "• Code reviews and optimization\n"
                        "• Algorithm design and data structures\n"
                        "• Best practices and design patterns\n\n"
                        "What specific coding task would you like help with?";
                } else if (last_msg.content.find("math") != std::string::npos) {
                    response.message.content = 
                        "I can help with various mathematical topics! Whether you need help with:\n"
                        "• Basic arithmetic and algebra\n"
                        "• Calculus and differential equations\n"
                        "• Statistics and probability\n"
                        "• Linear algebra and matrices\n"
                        "• Problem solving and proofs\n\n"
                        "What mathematical concept or problem would you like to explore?";
                } else {
                    response.message.content = 
                        "I understand you're asking about: \"" + last_msg.content + "\"\n\n"
                        "[This is a mock response from the Anthropic provider example. "
                        "In a real implementation, this would connect to Claude's API and provide "
                        "an actual AI-generated response based on the input.]";
                }
            }
        }
        
        // Mock usage statistics
        response.usage = std::make_unique<LLMResponse::Usage>();
        response.usage->prompt_tokens = system_prompt.length() / 4;  // Rough estimate
        for (const auto& msg : user_messages) {
            response.usage->prompt_tokens += msg.content.length() / 4;
        }
        response.usage->completion_tokens = response.message.content.length() / 4;
        response.usage->total_tokens = response.usage->prompt_tokens + response.usage->completion_tokens;
        
        std::cout << "📥 Received response from Claude" << std::endl;
        
        return response;
    }
    
    // List available models
    std::vector<std::string> listModels() {
        return {
            "claude-3-opus-20240229",    // Most capable
            "claude-3-sonnet-20240229",  // Balanced
            "claude-3-haiku-20240307",   // Fastest
            "claude-2.1",
            "claude-2.0",
            "claude-instant-1.2"
        };
    }
    
private:
    AnthropicConfig config_;
};

// Factory function
std::shared_ptr<AnthropicProvider> makeAnthropicProvider(const std::string& api_key) {
    return std::make_shared<AnthropicProvider>(api_key);
}

std::shared_ptr<AnthropicProvider> makeAnthropicProviderFromEnv() {
    return std::make_shared<AnthropicProvider>(AnthropicConfig::fromEnv());
}

} // namespace llm
} // namespace orch
} // namespace gopher

// Helper function to print response
void printResponse(const gopher::orch::llm::LLMResponse& response) {
    std::cout << "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" << std::endl;
    std::cout << "🤖 Claude's Response:" << std::endl;
    std::cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" << std::endl;
    std::cout << response.message.content << std::endl;
    std::cout << "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" << std::endl;
    
    if (response.usage) {
        std::cout << "📊 Token Usage:" << std::endl;
        std::cout << "   • Prompt tokens: " << response.usage->prompt_tokens << std::endl;
        std::cout << "   • Completion tokens: " << response.usage->completion_tokens << std::endl;
        std::cout << "   • Total tokens: " << response.usage->total_tokens << std::endl;
    }
    std::cout << "   • Finish reason: " << response.finish_reason << std::endl;
}

int main() {
    using namespace gopher::orch::llm;
    
    std::cout << "🤖 Anthropic Claude Example\n" << std::endl;
    
    // Check for API key
    const char* api_key = std::getenv("ANTHROPIC_API_KEY");
    if (!api_key) {
        std::cout << "⚠️  Warning: ANTHROPIC_API_KEY environment variable not set" << std::endl;
        std::cout << "   Using mock responses for demonstration\n" << std::endl;
        
        // Use a dummy key for demonstration
        api_key = "mock-api-key-for-demo";
    }
    
    try {
        // ═══════════════════════════════════════════════════════════════════
        // Example 1: Basic Chat with Claude
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "=== Example 1: Basic Chat with Claude ===" << std::endl;
        
        auto provider = makeAnthropicProvider(api_key);
        
        std::vector<Message> messages = {
            Message::system("You are Claude, a helpful AI assistant created by Anthropic. "
                           "Be concise but informative in your responses."),
            Message::user("Hello Claude! Please introduce yourself briefly.")
        };
        
        auto response = provider->chat(messages, LLMConfig::deterministic());
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 2: Different Models
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 2: Using Different Claude Models ===" << std::endl;
        
        // List available models
        std::cout << "Available Claude models:" << std::endl;
        for (const auto& model : provider->listModels()) {
            std::cout << "   • " << model << std::endl;
        }
        
        // Use Opus (most capable) for complex reasoning
        std::cout << "\n🧠 Using Claude 3 Opus for complex reasoning..." << std::endl;
        
        LLMConfig opus_config;
        opus_config.model = "claude-3-opus-20240229";
        opus_config.temperature = 0.2;
        opus_config.max_tokens = 500;
        
        messages = {
            Message::system("You are an expert problem solver."),
            Message::user("What's the best approach to learn programming?")
        };
        
        response = provider->chat(messages, opus_config);
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 3: Multi-turn Conversation
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 3: Multi-turn Conversation ===" << std::endl;
        
        std::vector<Message> conversation = {
            Message::system("You are a helpful coding assistant. Keep responses focused and practical."),
            Message::user("I need help with C++ vectors"),
            Message::assistant("I'd be happy to help you with C++ vectors! Vectors are dynamic arrays "
                              "that can grow and shrink in size. What specific aspect would you like "
                              "to know about? For example:\n"
                              "• Basic usage and initialization\n"
                              "• Adding/removing elements\n"
                              "• Iterating through vectors\n"
                              "• Common operations and algorithms"),
            Message::user("Show me how to iterate through a vector")
        };
        
        response = provider->chat(conversation, LLMConfig());
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 4: Creative vs Deterministic
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 4: Temperature Settings ===" << std::endl;
        
        messages = {
            Message::user("Write a one-line description of the ocean")
        };
        
        std::cout << "🎯 Deterministic (temperature=0.0):" << std::endl;
        response = provider->chat(messages, LLMConfig::deterministic());
        std::cout << "Response: " << response.message.content << std::endl;
        
        std::cout << "\n🎨 Creative (temperature=0.9):" << std::endl;
        response = provider->chat(messages, LLMConfig::creative());
        std::cout << "Response: " << response.message.content << std::endl;
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 5: Cost-Optimized with Haiku
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 5: Fast & Efficient with Claude 3 Haiku ===" << std::endl;
        
        LLMConfig haiku_config;
        haiku_config.model = "claude-3-haiku-20240307";  // Fastest and most cost-effective
        haiku_config.temperature = 0.3;
        haiku_config.max_tokens = 100;
        
        messages = {
            Message::user("What is 15% of 240? Just give the answer.")
        };
        
        response = provider->chat(messages, haiku_config);
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Implementation Notes
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" << std::endl;
        std::cout << "📝 Implementation Notes:" << std::endl;
        std::cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" << std::endl;
        
        std::cout << "This example demonstrates the Anthropic provider interface." << std::endl;
        std::cout << "\nIn a real implementation, the provider would:" << std::endl;
        std::cout << "1. Build proper JSON requests following Anthropic's API format" << std::endl;
        std::cout << "2. Handle authentication with x-api-key header" << std::endl;
        std::cout << "3. Send HTTPS requests to api.anthropic.com/v1/messages" << std::endl;
        std::cout << "4. Parse streaming responses (SSE format)" << std::endl;
        std::cout << "5. Handle rate limiting and retries" << std::endl;
        std::cout << "6. Support tool/function calling" << std::endl;
        
        std::cout << "\n🔑 To use with real API:" << std::endl;
        std::cout << "   export ANTHROPIC_API_KEY='your-api-key-here'" << std::endl;
        std::cout << "   ./anthropic_example" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "\n❌ Error: " << e.what() << std::endl;
        return 1;
    }
    
    std::cout << "\n✅ Anthropic example complete!" << std::endl;
    
    return 0;
}