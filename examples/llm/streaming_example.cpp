// Streaming LLM Example
// This example demonstrates streaming responses from LLM providers

#include "gopher/orch/llm/llm.h"
#include "gopher/orch/core/types.h"
#include <iostream>
#include <cstdlib>
#include <sstream>
#include <thread>
#include <iomanip>

using namespace gopher::orch;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// Helper to display streaming chunks
void displayChunk(const StreamChunk& chunk) {
    // Print the chunk content without newline to show streaming effect
    std::cout << chunk.content << std::flush;
    
    // Optional: show token information if available
    if (chunk.token_info) {
        // This would be shown in a debug mode
        // std::cerr << "[Token: " << *chunk.token_info << "]";
    }
}

int main(int argc, char** argv) {
    std::cout << "🌊 LLM Streaming Example\n" << std::endl;
    
    // Create dispatcher
    auto dispatcher = std::make_shared<Dispatcher>();
    
    // Check for API key
    const char* api_key = std::getenv("OPENAI_API_KEY");
    if (!api_key) {
        api_key = std::getenv("ANTHROPIC_API_KEY");
        if (!api_key) {
            std::cerr << "❌ Please set OPENAI_API_KEY or ANTHROPIC_API_KEY" << std::endl;
            return 1;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 1: Basic Streaming
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "=== Example 1: Basic Streaming ===" << std::endl;
    std::cout << "Prompt: Tell me a short story (3 sentences)" << std::endl;
    std::cout << "\nStreaming response:\n" << std::endl;
    
    // Create provider based on available API key
    LLMProviderPtr provider;
    if (std::getenv("OPENAI_API_KEY")) {
        provider = makeOpenAIProvider(std::getenv("OPENAI_API_KEY"));
    } else {
        provider = makeAnthropicProvider(std::getenv("ANTHROPIC_API_KEY"));
    }
    
    std::vector<Message> messages = {
        Message::system("You are a creative storyteller. Keep stories very brief."),
        Message::user("Tell me a short story about a robot learning to paint. Make it exactly 3 sentences.")
    };
    
    LLMConfig config = LLMConfig()
        .withModel(std::getenv("OPENAI_API_KEY") ? "gpt-3.5-turbo" : "claude-3-haiku-20240307")
        .withTemperature(0.8)
        .withMaxTokens(150);
    
    // Accumulate the full response
    std::stringstream accumulated;
    int chunk_count = 0;
    
    bool done = false;
    provider->chatStream(messages, {}, config, *dispatcher,
        // On chunk callback
        [&](const StreamChunk& chunk) {
            displayChunk(chunk);
            accumulated << chunk.content;
            chunk_count++;
        },
        // On complete callback
        [&](Result<LLMResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                std::cerr << "\n❌ Error: " << mcp::get<Error>(result).message << std::endl;
            } else {
                auto& response = mcp::get<LLMResponse>(result);
                std::cout << "\n\n📊 Streaming complete!" << std::endl;
                std::cout << "  Chunks received: " << chunk_count << std::endl;
                
                if (response.usage) {
                    std::cout << "  Total tokens: " << response.usage->total_tokens << std::endl;
                }
                
                std::cout << "  Finish reason: " << response.finish_reason << std::endl;
            }
            done = true;
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 2: Streaming with Progress Indicator
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 2: Streaming with Progress ===" << std::endl;
    std::cout << "Prompt: Explain quantum computing" << std::endl;
    std::cout << "\nStreaming with progress dots:\n" << std::endl;
    
    messages = {
        Message::user("Explain quantum computing in simple terms. About 100 words.")
    };
    
    config.withMaxTokens(200);
    
    accumulated.str("");  // Clear the accumulator
    chunk_count = 0;
    auto start_time = std::chrono::steady_clock::now();
    
    done = false;
    provider->chatStream(messages, {}, config, *dispatcher,
        [&](const StreamChunk& chunk) {
            // Show progress dots for each chunk
            if (chunk_count % 10 == 0) {
                std::cout << "." << std::flush;
            }
            accumulated << chunk.content;
            chunk_count++;
        },
        [&](Result<LLMResponse> result) {
            auto end_time = std::chrono::steady_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
            
            std::cout << "\n\n📝 Complete response:" << std::endl;
            std::cout << accumulated.str() << std::endl;
            
            if (!mcp::holds_alternative<Error>(result)) {
                auto& response = mcp::get<LLMResponse>(result);
                std::cout << "\n⏱️  Streaming stats:" << std::endl;
                std::cout << "  Time: " << duration.count() << "ms" << std::endl;
                std::cout << "  Chunks: " << chunk_count << std::endl;
                
                if (response.usage && response.usage->completion_tokens > 0) {
                    double tokens_per_second = (response.usage->completion_tokens * 1000.0) / duration.count();
                    std::cout << "  Speed: " << std::fixed << std::setprecision(1) 
                              << tokens_per_second << " tokens/sec" << std::endl;
                }
            }
            done = true;
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 3: Streaming Code Generation
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 3: Streaming Code Generation ===" << std::endl;
    std::cout << "Generating a Python function..." << std::endl;
    
    messages = {
        Message::system("You are a code generation assistant. Generate clean, well-commented code."),
        Message::user("Write a Python function that finds all prime numbers up to n using the Sieve of Eratosthenes.")
    };
    
    config.withTemperature(0.0)  // Deterministic for code
          .withMaxTokens(300);
    
    std::cout << "\n```python" << std::endl;
    
    accumulated.str("");
    bool in_code_block = false;
    
    done = false;
    provider->chatStream(messages, {}, config, *dispatcher,
        [&](const StreamChunk& chunk) {
            // Display the code as it streams
            std::cout << chunk.content << std::flush;
            accumulated << chunk.content;
        },
        [&](Result<LLMResponse> result) {
            std::cout << "\n```" << std::endl;
            
            if (!mcp::holds_alternative<Error>(result)) {
                std::cout << "\n✅ Code generation complete!" << std::endl;
            }
            done = true;
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 4: Streaming with Early Stop
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 4: Streaming with Early Stop ===" << std::endl;
    std::cout << "We'll stop the stream after receiving 50 tokens..." << std::endl;
    
    messages = {
        Message::user("Write a detailed essay about the history of computing.")
    };
    
    config.withMaxTokens(500);  // Allow for a long response
    
    accumulated.str("");
    int token_estimate = 0;
    const int stop_after_tokens = 50;
    bool should_stop = false;
    
    done = false;
    provider->chatStream(messages, {}, config, *dispatcher,
        [&](const StreamChunk& chunk) {
            if (!should_stop) {
                std::cout << chunk.content << std::flush;
                accumulated << chunk.content;
                
                // Estimate tokens (rough: ~4 chars per token)
                token_estimate += chunk.content.length() / 4;
                
                if (token_estimate >= stop_after_tokens) {
                    should_stop = true;
                    std::cout << "\n\n⏸️  [Stream stopped early after ~" 
                              << token_estimate << " tokens]" << std::endl;
                    // Note: In a real implementation, you'd need a way to cancel the stream
                    // This is a simplified example
                }
            }
        },
        [&](Result<LLMResponse> result) {
            if (!mcp::holds_alternative<Error>(result)) {
                auto& response = mcp::get<LLMResponse>(result);
                if (response.usage) {
                    std::cout << "\n📊 Actual tokens generated: " 
                              << response.usage->completion_tokens << std::endl;
                }
            }
            done = true;
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 5: Parallel Streaming (Multiple Providers)
    // ═══════════════════════════════════════════════════════════════════
    
    if (std::getenv("OPENAI_API_KEY") && std::getenv("ANTHROPIC_API_KEY")) {
        std::cout << "\n\n=== Example 5: Parallel Streaming ===" << std::endl;
        std::cout << "Racing OpenAI vs Anthropic..." << std::endl;
        
        auto openai = makeOpenAIProvider(std::getenv("OPENAI_API_KEY"));
        auto anthropic = makeAnthropicProvider(std::getenv("ANTHROPIC_API_KEY"));
        
        messages = {
            Message::user("What is the meaning of life? One sentence.")
        };
        
        LLMConfig race_config = LLMConfig()
            .withTemperature(0.7)
            .withMaxTokens(50);
        
        // OpenAI config
        auto openai_config = race_config;
        openai_config.model = "gpt-3.5-turbo";
        
        // Anthropic config
        auto anthropic_config = race_config;
        anthropic_config.model = "claude-3-haiku-20240307";
        
        std::string openai_response, anthropic_response;
        bool openai_done = false, anthropic_done = false;
        auto race_start = std::chrono::steady_clock::now();
        
        std::cout << "\n🏁 Starting race...\n" << std::endl;
        
        // Start OpenAI
        std::cout << "OpenAI: ";
        openai->chatStream(messages, {}, openai_config, *dispatcher,
            [](const StreamChunk& chunk) {
                std::cout << "." << std::flush;
            },
            [&](Result<LLMResponse> result) {
                auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::steady_clock::now() - race_start);
                
                if (!mcp::holds_alternative<Error>(result)) {
                    openai_response = mcp::get<LLMResponse>(result).message.content;
                    std::cout << " Done! (" << elapsed.count() << "ms)" << std::endl;
                }
                openai_done = true;
            });
        
        // Start Anthropic
        std::cout << "Claude: ";
        anthropic->chatStream(messages, {}, anthropic_config, *dispatcher,
            [](const StreamChunk& chunk) {
                std::cout << "." << std::flush;
            },
            [&](Result<LLMResponse> result) {
                auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::steady_clock::now() - race_start);
                
                if (!mcp::holds_alternative<Error>(result)) {
                    anthropic_response = mcp::get<LLMResponse>(result).message.content;
                    std::cout << " Done! (" << elapsed.count() << "ms)" << std::endl;
                }
                anthropic_done = true;
            });
        
        // Wait for both to complete
        while (!openai_done || !anthropic_done) {
            dispatcher->poll();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        
        std::cout << "\n📝 Results:" << std::endl;
        std::cout << "OpenAI: " << openai_response << std::endl;
        std::cout << "Claude: " << anthropic_response << std::endl;
    } else {
        std::cout << "\n⚠️  Skipping parallel streaming (need both API keys)" << std::endl;
    }
    
    std::cout << "\n✅ Streaming Example Complete!" << std::endl;
    
    return 0;
}