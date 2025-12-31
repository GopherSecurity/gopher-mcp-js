// Anthropic Provider Example
// This example demonstrates how to use the Anthropic provider for Claude models
// Now with real API connections!

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <memory>
#include <sstream>
#include <curl/curl.h>

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

// Helper function for CURL write callback
size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp) {
    userp->append((char*)contents, size * nmemb);
    return size * nmemb;
}

// Simple JSON builder/parser helpers
std::string escapeJson(const std::string& s) {
    std::ostringstream o;
    for (char c : s) {
        switch (c) {
            case '"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\b': o << "\\b"; break;
            case '\f': o << "\\f"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default:
                if (c >= 0 && c < 0x20) {
                    o << "\\u" << std::hex << (int)c;
                } else {
                    o << c;
                }
        }
    }
    return o.str();
}

// Extract content from JSON response (simple parser)
std::string extractContent(const std::string& json) {
    // Look for "content":[{"text":
    size_t pos = json.find("\"content\":");
    if (pos == std::string::npos) return "";
    
    pos = json.find("\"text\":", pos);
    if (pos == std::string::npos) return "";
    
    pos = json.find('"', pos + 7);
    if (pos == std::string::npos) return "";
    
    size_t start = pos + 1;
    size_t end = start;
    
    // Find the closing quote, handling escapes
    while (end < json.length()) {
        if (json[end] == '"' && json[end-1] != '\\') {
            break;
        }
        end++;
    }
    
    if (end >= json.length()) return "";
    
    std::string content = json.substr(start, end - start);
    
    // Unescape the content
    std::string result;
    for (size_t i = 0; i < content.length(); i++) {
        if (content[i] == '\\' && i + 1 < content.length()) {
            switch (content[i + 1]) {
                case 'n': result += '\n'; i++; break;
                case 't': result += '\t'; i++; break;
                case 'r': result += '\r'; i++; break;
                case '"': result += '"'; i++; break;
                case '\\': result += '\\'; i++; break;
                default: result += content[i];
            }
        } else {
            result += content[i];
        }
    }
    
    return result;
}

// Extract token counts from response
struct TokenUsage {
    int input_tokens = 0;
    int output_tokens = 0;
};

TokenUsage extractUsage(const std::string& json) {
    TokenUsage usage;
    
    // Look for "usage":{"input_tokens":
    size_t pos = json.find("\"usage\":");
    if (pos == std::string::npos) return usage;
    
    pos = json.find("\"input_tokens\":", pos);
    if (pos != std::string::npos) {
        pos += 15; // length of "input_tokens":
        usage.input_tokens = std::atoi(json.c_str() + pos);
    }
    
    pos = json.find("\"output_tokens\":", pos);
    if (pos != std::string::npos) {
        pos += 16; // length of "output_tokens":
        usage.output_tokens = std::atoi(json.c_str() + pos);
    }
    
    return usage;
}

// Anthropic Provider with real API calls
class AnthropicProvider {
public:
    explicit AnthropicProvider(const AnthropicConfig& config)
        : config_(config) {
        if (config_.api_key.empty() || config_.api_key == "mock-api-key-for-demo") {
            std::cout << "⚠️  No valid API key provided, will use mock responses" << std::endl;
            use_mock_ = true;
        } else {
            std::cout << "✓ Anthropic provider initialized with API key" << std::endl;
            use_mock_ = false;
        }
    }
    
    explicit AnthropicProvider(const std::string& api_key)
        : AnthropicProvider(AnthropicConfig{api_key}) {}
    
    std::string name() const { return "anthropic"; }
    
    // Chat with real API call
    LLMResponse chat(const std::vector<Message>& messages,
                     const LLMConfig& config = LLMConfig()) {
        
        std::cout << "\n📤 Sending request to Anthropic API..." << std::endl;
        std::cout << "   Model: " << config.model << std::endl;
        std::cout << "   Temperature: " << config.temperature << std::endl;
        std::cout << "   Max tokens: " << config.max_tokens << std::endl;
        
        // Extract system message
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
        
        LLMResponse response;
        response.message.role = Message::Role::ASSISTANT;
        response.finish_reason = "stop";
        
        if (use_mock_ || config_.api_key == "mock-api-key-for-demo") {
            // Return mock response if no valid API key
            if (!user_messages.empty() && user_messages.back().role == Message::Role::USER) {
                response.message.content = "[Mock response] I understand: \"" + 
                    user_messages.back().content + "\"\n\n" +
                    "To get real responses from Claude, please set your ANTHROPIC_API_KEY environment variable.";
            }
            response.usage = std::make_unique<LLMResponse::Usage>();
            response.usage->prompt_tokens = 10;
            response.usage->completion_tokens = 20;
            response.usage->total_tokens = 30;
            std::cout << "📥 Returned mock response (no API key)" << std::endl;
            return response;
        }
        
        // Build the JSON request
        std::ostringstream json_request;
        json_request << "{";
        json_request << "\"model\":\"" << config.model << "\",";
        json_request << "\"max_tokens\":" << config.max_tokens << ",";
        json_request << "\"temperature\":" << config.temperature << ",";
        
        // Add system message if present
        if (!system_prompt.empty()) {
            json_request << "\"system\":\"" << escapeJson(system_prompt) << "\",";
        }
        
        // Add messages array
        json_request << "\"messages\":[";
        bool first = true;
        for (const auto& msg : user_messages) {
            if (!first) json_request << ",";
            first = false;
            
            json_request << "{";
            json_request << "\"role\":\"";
            switch (msg.role) {
                case Message::Role::USER: json_request << "user"; break;
                case Message::Role::ASSISTANT: json_request << "assistant"; break;
                default: json_request << "user";
            }
            json_request << "\",";
            json_request << "\"content\":\"" << escapeJson(msg.content) << "\"";
            json_request << "}";
        }
        json_request << "]}";
        
        // Make the HTTP request using CURL
        CURL* curl = curl_easy_init();
        if (!curl) {
            response.message.content = "Error: Failed to initialize CURL";
            return response;
        }
        
        std::string response_body;
        
        // Setup CURL options
        curl_easy_setopt(curl, CURLOPT_URL, "https://api.anthropic.com/v1/messages");
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        
        // Set headers
        struct curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        std::string auth_header = "x-api-key: " + config_.api_key;
        headers = curl_slist_append(headers, auth_header.c_str());
        headers = curl_slist_append(headers, "anthropic-version: 2023-06-01");
        
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        
        // Set the request body
        std::string request_body = json_request.str();
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, request_body.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, request_body.length());
        
        // Set up response handling
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_body);
        
        // Perform the request
        CURLcode res = curl_easy_perform(curl);
        
        if (res != CURLE_OK) {
            response.message.content = "Error: Request failed - " + std::string(curl_easy_strerror(res));
            std::cout << "❌ Request failed: " << curl_easy_strerror(res) << std::endl;
        } else {
            // Check HTTP response code
            long http_code = 0;
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
            
            if (http_code == 200) {
                // Parse the response
                std::string content = extractContent(response_body);
                if (!content.empty()) {
                    response.message.content = content;
                    
                    // Extract usage statistics
                    TokenUsage usage = extractUsage(response_body);
                    response.usage = std::make_unique<LLMResponse::Usage>();
                    response.usage->prompt_tokens = usage.input_tokens;
                    response.usage->completion_tokens = usage.output_tokens;
                    response.usage->total_tokens = usage.input_tokens + usage.output_tokens;
                    
                    std::cout << "📥 Received response from Claude API" << std::endl;
                } else {
                    response.message.content = "Error: Failed to parse response";
                    std::cout << "❌ Failed to parse API response" << std::endl;
                }
            } else {
                response.message.content = "Error: HTTP " + std::to_string(http_code);
                
                // Try to extract error message from response
                size_t error_pos = response_body.find("\"error\":");
                if (error_pos != std::string::npos) {
                    size_t msg_pos = response_body.find("\"message\":", error_pos);
                    if (msg_pos != std::string::npos) {
                        std::string error_msg = extractContent("{\"content\":[{\"text\":" + 
                            response_body.substr(msg_pos + 10) + "}]}");
                        if (!error_msg.empty()) {
                            response.message.content += " - " + error_msg;
                        }
                    }
                }
                
                std::cout << "❌ HTTP error code: " << http_code << std::endl;
            }
        }
        
        // Cleanup
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
        
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
    bool use_mock_ = false;
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
    
    // Initialize CURL globally
    curl_global_init(CURL_GLOBAL_DEFAULT);
    
    // Check for API key
    const char* api_key = std::getenv("ANTHROPIC_API_KEY");
    if (!api_key) {
        std::cout << "⚠️  Warning: ANTHROPIC_API_KEY environment variable not set" << std::endl;
        std::cout << "   Using mock responses for demonstration" << std::endl;
        std::cout << "   To use real API: export ANTHROPIC_API_KEY='your-api-key'\n" << std::endl;
        
        // Use a dummy key for demonstration
        api_key = "mock-api-key-for-demo";
    } else {
        std::cout << "✅ Found ANTHROPIC_API_KEY, will make real API calls\n" << std::endl;
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
    
    // Cleanup CURL
    curl_global_cleanup();
    
    return 0;
}