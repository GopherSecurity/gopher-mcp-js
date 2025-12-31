// Basic LLM Chat Example
// This example demonstrates simple chat completion with different providers

#include "gopher/orch/llm/llm.h"
#include "gopher/orch/core/types.h"
#include <iostream>
#include <cstdlib>
#include <thread>

using namespace gopher::orch;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// Helper function to print response
void printResponse(const std::string& provider, const LLMResponse& response) {
    std::cout << "\n=== " << provider << " Response ===" << std::endl;
    std::cout << response.message.content << std::endl;
    
    if (response.usage) {
        std::cout << "\n📊 Token Usage:" << std::endl;
        std::cout << "  Prompt tokens: " << response.usage->prompt_tokens << std::endl;
        std::cout << "  Completion tokens: " << response.usage->completion_tokens << std::endl;
        std::cout << "  Total tokens: " << response.usage->total_tokens << std::endl;
    }
    
    if (response.model) {
        std::cout << "  Model used: " << *response.model << std::endl;
    }
    
    std::cout << "  Finish reason: " << response.finish_reason << std::endl;
}

int main(int argc, char** argv) {
    std::cout << "🤖 LLM Basic Chat Example\n" << std::endl;
    
    // Create dispatcher for async operations
    auto dispatcher = std::make_shared<Dispatcher>();
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 1: OpenAI Provider
    // ═══════════════════════════════════════════════════════════════════
    
    if (const char* api_key = std::getenv("OPENAI_API_KEY")) {
        std::cout << "Testing OpenAI Provider..." << std::endl;
        
        // Create provider
        auto openai = makeOpenAIProvider(api_key);
        
        // Create messages
        std::vector<Message> messages = {
            Message::system("You are a helpful assistant. Be concise."),
            Message::user("What is the capital of France? Answer in one word.")
        };
        
        // Configure the model
        LLMConfig config = LLMConfig()
            .withModel("gpt-3.5-turbo")  // Using cheaper model for example
            .withTemperature(0.0)         // Deterministic
            .withMaxTokens(10);           // Short response
        
        // Make the call
        bool openai_done = false;
        openai->chat(messages, config, *dispatcher, 
            [&openai_done](Result<LLMResponse> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    std::cerr << "❌ OpenAI Error: " 
                              << mcp::get<Error>(result).message << std::endl;
                } else {
                    printResponse("OpenAI", mcp::get<LLMResponse>(result));
                }
                openai_done = true;
            });
        
        // Run dispatcher until complete
        while (!openai_done) {
            dispatcher->poll();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    } else {
        std::cout << "⚠️  Skipping OpenAI (OPENAI_API_KEY not set)" << std::endl;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 2: Anthropic Provider
    // ═══════════════════════════════════════════════════════════════════
    
    if (const char* api_key = std::getenv("ANTHROPIC_API_KEY")) {
        std::cout << "\nTesting Anthropic Provider..." << std::endl;
        
        // Create provider
        auto anthropic = makeAnthropicProvider(api_key);
        
        // Create messages
        std::vector<Message> messages = {
            Message::system("You are Claude, a helpful AI assistant. Be very brief."),
            Message::user("What is 2+2? Just give the number.")
        };
        
        // Configure
        LLMConfig config = LLMConfig()
            .withModel("claude-3-haiku-20240307")  // Fast, cheap model
            .withTemperature(0.0)
            .withMaxTokens(5);
        
        // Make the call
        bool anthropic_done = false;
        anthropic->chat(messages, config, *dispatcher,
            [&anthropic_done](Result<LLMResponse> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    std::cerr << "❌ Anthropic Error: " 
                              << mcp::get<Error>(result).message << std::endl;
                } else {
                    printResponse("Anthropic", mcp::get<LLMResponse>(result));
                }
                anthropic_done = true;
            });
        
        // Run dispatcher until complete
        while (!anthropic_done) {
            dispatcher->poll();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    } else {
        std::cout << "⚠️  Skipping Anthropic (ANTHROPIC_API_KEY not set)" << std::endl;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 3: Ollama Provider (Local)
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\nTesting Ollama Provider (local)..." << std::endl;
    
    // Create Ollama provider (no API key needed)
    auto ollama = makeOllamaProvider();
    
    // First, check if Ollama is running
    bool ollama_available = false;
    ollama->healthCheck(*dispatcher,
        [&ollama_available](Result<bool> result) {
            ollama_available = mcp::holds_alternative<bool>(result) && 
                             mcp::get<bool>(result);
        });
    
    // Wait for health check
    for (int i = 0; i < 10 && !ollama_available; ++i) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    if (ollama_available) {
        // List available models
        std::cout << "Checking available Ollama models..." << std::endl;
        bool list_done = false;
        ollama->listModels(*dispatcher,
            [&list_done](Result<std::vector<std::string>> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    std::cerr << "Failed to list models" << std::endl;
                } else {
                    auto models = mcp::get<std::vector<std::string>>(result);
                    std::cout << "Available models: ";
                    for (const auto& model : models) {
                        std::cout << model << " ";
                    }
                    std::cout << std::endl;
                }
                list_done = true;
            });
        
        while (!list_done) {
            dispatcher->poll();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        
        // Try to chat with a simple model
        std::vector<Message> messages = {
            Message::user("Say 'Hello World' and nothing else.")
        };
        
        LLMConfig config = LLMConfig()
            .withModel("llama2")  // Or any model you have pulled
            .withTemperature(0.0)
            .withMaxTokens(10);
        
        bool ollama_done = false;
        ollama->chat(messages, config, *dispatcher,
            [&ollama_done](Result<LLMResponse> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    std::cerr << "❌ Ollama Error: " 
                              << mcp::get<Error>(result).message << std::endl;
                } else {
                    printResponse("Ollama", mcp::get<LLMResponse>(result));
                }
                ollama_done = true;
            });
        
        while (!ollama_done) {
            dispatcher->poll();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    } else {
        std::cout << "⚠️  Ollama not running (start with: ollama serve)" << std::endl;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 4: Multi-turn Conversation
    // ═══════════════════════════════════════════════════════════════════
    
    if (const char* api_key = std::getenv("OPENAI_API_KEY")) {
        std::cout << "\n=== Multi-turn Conversation Example ===" << std::endl;
        
        auto openai = makeOpenAIProvider(api_key);
        
        // Build a conversation
        std::vector<Message> conversation = {
            Message::system("You are a helpful math tutor. Be encouraging and clear."),
            Message::user("I'm trying to understand fractions. What is 1/2 + 1/4?"),
            Message::assistant("Great question! Let me help you with that.\n\n"
                             "To add 1/2 + 1/4, we need a common denominator:\n"
                             "- 1/2 = 2/4\n"
                             "- So 2/4 + 1/4 = 3/4\n\n"
                             "The answer is 3/4! 🎉"),
            Message::user("Thanks! Now what about 3/4 - 1/2?")
        };
        
        LLMConfig config = LLMConfig()
            .withModel("gpt-3.5-turbo")
            .withTemperature(0.7)
            .withMaxTokens(150);
        
        bool done = false;
        openai->chat(conversation, config, *dispatcher,
            [&done](Result<LLMResponse> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    std::cerr << "Error: " << mcp::get<Error>(result).message << std::endl;
                } else {
                    auto& response = mcp::get<LLMResponse>(result);
                    std::cout << "\n🤖 Assistant: " << response.message.content << std::endl;
                }
                done = true;
            });
        
        while (!done) {
            dispatcher->poll();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 5: Different Configuration Presets
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n=== Configuration Presets Example ===" << std::endl;
    
    // Deterministic configuration (for consistent outputs)
    LLMConfig deterministic = LLMConfig::deterministic()
        .withModel("gpt-3.5-turbo")
        .withMaxTokens(100);
    std::cout << "Deterministic: temp=" << *deterministic.temperature 
              << ", seed=" << *deterministic.seed << std::endl;
    
    // Creative configuration (for varied outputs)
    LLMConfig creative = LLMConfig::creative()
        .withModel("gpt-4")
        .withMaxTokens(500);
    std::cout << "Creative: temp=" << *creative.temperature 
              << ", top_p=" << *creative.top_p << std::endl;
    
    // Default configuration
    LLMConfig default_config = LLMConfig::defaultConfig()
        .withModel("gpt-3.5-turbo");
    std::cout << "Default: temp=" << *default_config.temperature 
              << ", max_tokens=" << *default_config.max_tokens << std::endl;
    
    std::cout << "\n✅ Basic Chat Example Complete!" << std::endl;
    
    return 0;
}