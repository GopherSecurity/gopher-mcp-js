// Ollama Provider Example
// This example demonstrates how to use the Ollama provider for local LLM models

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <memory>
#include <chrono>
#include <thread>

// Mock types for demonstration
namespace gopher {
namespace orch {
namespace llm {

// Message structure
struct Message {
    enum class Role { SYSTEM, USER, ASSISTANT };
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

// Configuration
struct LLMConfig {
    std::string model = "llama2";
    double temperature = 0.7;
    int max_tokens = 512;
    int num_ctx = 2048;  // Context window
    int num_gpu = -1;    // Number of layers to offload to GPU
    
    static LLMConfig fast() {
        return {
            .model = "llama2",
            .temperature = 0.7,
            .max_tokens = 256,
            .num_ctx = 2048,
            .num_gpu = -1
        };
    }
    
    static LLMConfig quality() {
        return {
            .model = "llama2:13b",
            .temperature = 0.5,
            .max_tokens = 1024,
            .num_ctx = 4096,
            .num_gpu = -1
        };
    }
};

// Response
struct LLMResponse {
    Message message;
    std::string finish_reason;
    struct Timing {
        double eval_duration;     // Time to generate response (ns)
        double prompt_eval_duration; // Time to process prompt (ns)
        int eval_count;           // Tokens generated
        int prompt_eval_count;    // Prompt tokens processed
    };
    std::unique_ptr<Timing> timing;
};

// Ollama configuration
struct OllamaConfig {
    std::string base_url = "http://localhost:11434";
    std::string default_model = "llama2";
    bool keep_alive = true;
    int num_ctx = 2048;
    
    static OllamaConfig fromEnv() {
        OllamaConfig config;
        if (const char* url = std::getenv("OLLAMA_HOST")) {
            config.base_url = url;
        }
        if (const char* model = std::getenv("OLLAMA_MODEL")) {
            config.default_model = model;
        }
        return config;
    }
};

// Mock Ollama Provider
class OllamaProvider {
public:
    explicit OllamaProvider(const OllamaConfig& config = OllamaConfig())
        : config_(config) {
        std::cout << "✓ Ollama provider initialized" << std::endl;
        std::cout << "  Base URL: " << config_.base_url << std::endl;
        std::cout << "  Default model: " << config_.default_model << std::endl;
    }
    
    // Check if Ollama is running
    bool healthCheck() {
        std::cout << "🔍 Checking Ollama status at " << config_.base_url << "..." << std::endl;
        
        // Mock health check
        bool is_running = (config_.base_url == "http://localhost:11434");
        
        if (is_running) {
            std::cout << "✅ Ollama is running" << std::endl;
        } else {
            std::cout << "❌ Ollama is not accessible" << std::endl;
            std::cout << "   Start Ollama with: ollama serve" << std::endl;
        }
        
        return is_running;
    }
    
    // List available models
    std::vector<std::string> listModels() {
        // Mock model list (in reality, would query /api/tags)
        return {
            "llama2",
            "llama2:7b",
            "llama2:13b",
            "llama2:70b",
            "mistral",
            "mixtral",
            "codellama",
            "phi",
            "neural-chat",
            "starling-lm",
            "orca-mini"
        };
    }
    
    // Pull a model
    void pullModel(const std::string& model_name) {
        std::cout << "\n📦 Pulling model: " << model_name << std::endl;
        
        // Simulate download progress
        for (int i = 0; i <= 100; i += 20) {
            std::cout << "   Progress: " << i << "%" << std::flush;
            if (i < 100) {
                std::cout << "\r";
                std::this_thread::sleep_for(std::chrono::milliseconds(200));
            }
        }
        std::cout << std::endl;
        std::cout << "✅ Model " << model_name << " is ready" << std::endl;
    }
    
    // Chat completion
    LLMResponse chat(const std::vector<Message>& messages,
                     const LLMConfig& config = LLMConfig()) {
        
        std::cout << "\n🤖 Processing with Ollama..." << std::endl;
        std::cout << "   Model: " << config.model << std::endl;
        std::cout << "   Temperature: " << config.temperature << std::endl;
        std::cout << "   Max tokens: " << config.max_tokens << std::endl;
        std::cout << "   Context window: " << config.num_ctx << std::endl;
        
        if (config.num_gpu > 0) {
            std::cout << "   GPU layers: " << config.num_gpu << std::endl;
        }
        
        // Simulate local processing time
        std::cout << "   Processing locally..." << std::flush;
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        std::cout << " Done!" << std::endl;
        
        // Mock response
        LLMResponse response;
        response.message.role = Message::Role::ASSISTANT;
        response.finish_reason = "stop";
        
        // Generate mock response based on input
        if (!messages.empty()) {
            const auto& last_msg = messages.back();
            if (last_msg.role == Message::Role::USER) {
                std::string model_name = config.model;
                
                if (last_msg.content.find("hello") != std::string::npos ||
                    last_msg.content.find("Hello") != std::string::npos) {
                    response.message.content = 
                        "Hello! I'm " + model_name + " running locally through Ollama. "
                        "I'm a large language model that can help with various tasks "
                        "while keeping your data completely private on your machine.";
                } else if (last_msg.content.find("privacy") != std::string::npos ||
                          last_msg.content.find("local") != std::string::npos) {
                    response.message.content = 
                        "One of the key advantages of using Ollama is complete privacy:\n"
                        "• All processing happens locally on your machine\n"
                        "• No data is sent to external servers\n"
                        "• You have full control over the models\n"
                        "• Works offline once models are downloaded\n"
                        "• No API costs or rate limits";
                } else if (last_msg.content.find("code") != std::string::npos) {
                    response.message.content = 
                        "```python\n"
                        "# Running locally with " + model_name + "\n"
                        "import ollama\n\n"
                        "response = ollama.chat(\n"
                        "    model='" + config.model + "',\n"
                        "    messages=[{'role': 'user', 'content': 'Hello!'}]\n"
                        ")\n"
                        "print(response['message']['content'])\n"
                        "```\n\n"
                        "This code shows how to use Ollama's Python library!";
                } else {
                    response.message.content = 
                        "[" + model_name + " via Ollama]\n"
                        "I understand: \"" + last_msg.content + "\"\n\n"
                        "This is a mock response. In production, Ollama would process "
                        "this locally using the " + config.model + " model.";
                }
            }
        }
        
        // Mock timing information
        response.timing = std::make_unique<LLMResponse::Timing>();
        response.timing->prompt_eval_duration = 125000000;  // 125ms in nanoseconds
        response.timing->eval_duration = 450000000;         // 450ms
        response.timing->prompt_eval_count = messages.back().content.length() / 4;
        response.timing->eval_count = response.message.content.length() / 4;
        
        return response;
    }
    
    // Generate embeddings
    std::vector<float> generateEmbeddings(const std::string& text,
                                          const std::string& model = "llama2") {
        std::cout << "\n🔢 Generating embeddings..." << std::endl;
        std::cout << "   Model: " << model << std::endl;
        std::cout << "   Text length: " << text.length() << " characters" << std::endl;
        
        // Mock embeddings (normally 4096 dimensions for llama2)
        std::vector<float> embeddings;
        for (int i = 0; i < 10; i++) {  // Just 10 for demo
            embeddings.push_back(0.1f * i);
        }
        
        std::cout << "   Generated " << embeddings.size() << "-dimensional embedding" << std::endl;
        return embeddings;
    }
    
private:
    OllamaConfig config_;
};

} // namespace llm
} // namespace orch
} // namespace gopher

// Helper functions
void printResponse(const gopher::orch::llm::LLMResponse& response) {
    std::cout << "\n┌─────────────────────────────────────────────────────┐" << std::endl;
    std::cout << "│ 🦙 Ollama Response                                  │" << std::endl;
    std::cout << "└─────────────────────────────────────────────────────┘\n" << std::endl;
    std::cout << response.message.content << std::endl;
    
    if (response.timing) {
        std::cout << "\n⏱️  Performance Metrics:" << std::endl;
        
        double prompt_ms = response.timing->prompt_eval_duration / 1000000.0;
        double eval_ms = response.timing->eval_duration / 1000000.0;
        double total_ms = prompt_ms + eval_ms;
        
        std::cout << "   • Prompt processing: " << prompt_ms << "ms "
                  << "(" << response.timing->prompt_eval_count << " tokens)" << std::endl;
        
        std::cout << "   • Response generation: " << eval_ms << "ms "
                  << "(" << response.timing->eval_count << " tokens)" << std::endl;
        
        if (response.timing->eval_count > 0 && eval_ms > 0) {
            double tokens_per_sec = (response.timing->eval_count * 1000.0) / eval_ms;
            std::cout << "   • Generation speed: " << tokens_per_sec << " tokens/sec" << std::endl;
        }
        
        std::cout << "   • Total time: " << total_ms << "ms" << std::endl;
    }
}

int main() {
    using namespace gopher::orch::llm;
    
    std::cout << "🦙 Ollama Local LLM Example\n" << std::endl;
    
    try {
        // ═══════════════════════════════════════════════════════════════════
        // Setup and Health Check
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "=== Setting up Ollama Provider ===" << std::endl;
        
        auto provider = std::make_shared<OllamaProvider>(OllamaConfig::fromEnv());
        
        if (!provider->healthCheck()) {
            std::cout << "\n💡 To run Ollama:" << std::endl;
            std::cout << "   1. Install: https://ollama.ai" << std::endl;
            std::cout << "   2. Start server: ollama serve" << std::endl;
            std::cout << "   3. Pull a model: ollama pull llama2" << std::endl;
            std::cout << "\nContinuing with mock responses...\n" << std::endl;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 1: List Available Models
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n=== Example 1: Available Local Models ===" << std::endl;
        
        auto models = provider->listModels();
        std::cout << "\nModels available for local use:" << std::endl;
        for (const auto& model : models) {
            std::cout << "   • " << model;
            
            // Add descriptions
            if (model.find("llama2") != std::string::npos) {
                if (model.find("70b") != std::string::npos) {
                    std::cout << " (70B parameters - requires ~40GB RAM)";
                } else if (model.find("13b") != std::string::npos) {
                    std::cout << " (13B parameters - requires ~8GB RAM)";
                } else if (model.find("7b") != std::string::npos) {
                    std::cout << " (7B parameters - requires ~4GB RAM)";
                } else {
                    std::cout << " (Default 7B model)";
                }
            } else if (model == "codellama") {
                std::cout << " (Optimized for code generation)";
            } else if (model == "mistral") {
                std::cout << " (Fast and efficient 7B model)";
            } else if (model == "mixtral") {
                std::cout << " (Mixture of experts, 8x7B)";
            } else if (model == "phi") {
                std::cout << " (Microsoft's small but capable model)";
            }
            std::cout << std::endl;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 2: Basic Chat
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 2: Basic Local Chat ===" << std::endl;
        
        std::vector<Message> messages = {
            Message::system("You are a helpful assistant running locally."),
            Message::user("Hello! Tell me about the benefits of running LLMs locally.")
        };
        
        auto response = provider->chat(messages, LLMConfig::fast());
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 3: Code Generation with CodeLlama
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 3: Code Generation ===" << std::endl;
        
        LLMConfig code_config;
        code_config.model = "codellama";
        code_config.temperature = 0.1;  // Low temperature for code
        code_config.max_tokens = 512;
        
        messages = {
            Message::user("Write a Python function to calculate fibonacci numbers")
        };
        
        response = provider->chat(messages, code_config);
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 4: Pull a New Model
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 4: Model Management ===" << std::endl;
        
        std::cout << "Demonstrating model pull (mock):" << std::endl;
        provider->pullModel("mistral");
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 5: Embeddings Generation
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 5: Generate Embeddings ===" << std::endl;
        
        std::string text = "Local LLMs provide privacy and control.";
        auto embeddings = provider->generateEmbeddings(text, "llama2");
        
        std::cout << "First few embedding values: [";
        for (size_t i = 0; i < std::min(size_t(5), embeddings.size()); i++) {
            std::cout << embeddings[i];
            if (i < 4 && i < embeddings.size() - 1) std::cout << ", ";
        }
        std::cout << ", ...]" << std::endl;
        
        // ═══════════════════════════════════════════════════════════════════
        // Example 6: Performance Comparison
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n\n=== Example 6: Quality vs Speed Trade-off ===" << std::endl;
        
        messages = {
            Message::user("Explain quantum computing in one sentence.")
        };
        
        std::cout << "🚀 Fast mode (7B model):" << std::endl;
        response = provider->chat(messages, LLMConfig::fast());
        printResponse(response);
        
        std::cout << "\n🎯 Quality mode (13B model):" << std::endl;
        response = provider->chat(messages, LLMConfig::quality());
        printResponse(response);
        
        // ═══════════════════════════════════════════════════════════════════
        // Implementation Notes
        // ═══════════════════════════════════════════════════════════════════
        
        std::cout << "\n┌─────────────────────────────────────────────────────┐" << std::endl;
        std::cout << "│ 📝 Ollama Implementation Notes                      │" << std::endl;
        std::cout << "└─────────────────────────────────────────────────────┘" << std::endl;
        
        std::cout << "\nOllama provides:" << std::endl;
        std::cout << "• 🔒 Complete privacy - all data stays local" << std::endl;
        std::cout << "• 💰 No API costs or rate limits" << std::endl;
        std::cout << "• ⚡ Low latency (no network round trips)" << std::endl;
        std::cout << "• 🔧 Full control over models and parameters" << std::endl;
        std::cout << "• 📴 Works offline after model download" << std::endl;
        
        std::cout << "\nSystem Requirements:" << std::endl;
        std::cout << "• 7B models: ~4GB RAM" << std::endl;
        std::cout << "• 13B models: ~8GB RAM" << std::endl;
        std::cout << "• 70B models: ~40GB RAM" << std::endl;
        std::cout << "• GPU optional but recommended for speed" << std::endl;
        
        std::cout << "\n🚀 Quick Start:" << std::endl;
        std::cout << "   # Install Ollama" << std::endl;
        std::cout << "   curl -fsSL https://ollama.ai/install.sh | sh" << std::endl;
        std::cout << "   \n   # Start server" << std::endl;
        std::cout << "   ollama serve" << std::endl;
        std::cout << "   \n   # Pull a model" << std::endl;
        std::cout << "   ollama pull llama2" << std::endl;
        std::cout << "   \n   # Run this example" << std::endl;
        std::cout << "   ./ollama_example" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "\n❌ Error: " << e.what() << std::endl;
        return 1;
    }
    
    std::cout << "\n✅ Ollama example complete!" << std::endl;
    
    return 0;
}