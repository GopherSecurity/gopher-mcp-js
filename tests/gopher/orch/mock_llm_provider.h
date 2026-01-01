// MockLLMProvider - Mock LLM provider for testing agents and tool execution
//
// Provides configurable responses for testing without network calls.
// Supports:
// - Pre-configured responses
// - Tool call simulation
// - Response sequences
// - Error simulation

#pragma once

#include <mutex>
#include <queue>
#include <string>
#include <vector>

#include "gopher/orch/llm/llm_provider.h"

namespace gopher {
namespace orch {
namespace llm {

// Mock response configuration
struct MockResponseConfig {
  LLMResponse response;
  optional<Error> error;
  std::chrono::milliseconds delay{0};
};

// MockLLMProvider - In-memory LLM provider for testing
class MockLLMProvider : public LLMProvider {
 public:
  using Ptr = std::shared_ptr<MockLLMProvider>;

  explicit MockLLMProvider(const std::string& name = "mock-llm")
      : name_(name) {}

  // LLMProvider interface
  std::string name() const override { return name_; }

  void chat(const std::vector<Message>& messages,
            const std::vector<ToolSpec>& tools,
            const LLMConfig& config,
            Dispatcher& dispatcher,
            ChatCallback callback) override {
    std::lock_guard<std::mutex> lock(mutex_);

    call_count_++;
    last_messages_ = messages;
    last_tools_ = tools;
    last_config_ = config;

    // Get next response from queue, or use default
    MockResponseConfig response_config;
    if (!response_queue_.empty()) {
      response_config = response_queue_.front();
      response_queue_.pop();
    } else if (default_response_.has_value()) {
      response_config.response = *default_response_;
    } else {
      // Default: return empty response
      response_config.response.message =
          Message::assistant("Default mock response");
      response_config.response.finish_reason = "stop";
    }

    // Schedule response with optional delay
    if (response_config.delay.count() > 0) {
      auto timer = dispatcher.createTimer([callback = std::move(callback),
                                           response_config]() mutable {
        if (response_config.error.has_value()) {
          callback(Result<LLMResponse>(*response_config.error));
        } else {
          callback(Result<LLMResponse>(std::move(response_config.response)));
        }
      });
      timer->enableTimer(response_config.delay);
    } else {
      dispatcher.post([callback = std::move(callback),
                       response_config]() mutable {
        if (response_config.error.has_value()) {
          callback(Result<LLMResponse>(*response_config.error));
        } else {
          callback(Result<LLMResponse>(std::move(response_config.response)));
        }
      });
    }
  }

  void chatStream(const std::vector<Message>& messages,
                  const std::vector<ToolSpec>& tools,
                  const LLMConfig& config,
                  Dispatcher& dispatcher,
                  StreamCallback on_chunk,
                  ChatCallback on_complete) override {
    // Fall back to non-streaming
    chat(messages, tools, config, dispatcher, std::move(on_complete));
  }

  bool isModelSupported(const std::string& model) const override {
    return !model.empty();
  }

  std::vector<std::string> supportedModels() const override {
    return {"mock-model", "test-model"};
  }

  std::string endpoint() const override { return "mock://localhost/v1/chat"; }

  bool isConfigured() const override { return true; }

  // =========================================================================
  // MockLLMProvider-specific API for test configuration
  // =========================================================================

  // Set default response for all calls
  MockLLMProvider& setDefaultResponse(const std::string& content) {
    std::lock_guard<std::mutex> lock(mutex_);
    LLMResponse response;
    response.message = Message::assistant(content);
    response.finish_reason = "stop";
    default_response_ = response;
    return *this;
  }

  // Set default response with tool calls
  MockLLMProvider& setDefaultToolCalls(
      const std::vector<ToolCall>& tool_calls) {
    std::lock_guard<std::mutex> lock(mutex_);
    LLMResponse response;
    response.message = Message::assistantWithToolCalls(tool_calls);
    response.finish_reason = "tool_calls";
    default_response_ = response;
    return *this;
  }

  // Queue a response (FIFO order)
  MockLLMProvider& queueResponse(const std::string& content) {
    std::lock_guard<std::mutex> lock(mutex_);
    MockResponseConfig config;
    config.response.message = Message::assistant(content);
    config.response.finish_reason = "stop";
    response_queue_.push(config);
    return *this;
  }

  // Queue a tool call response
  MockLLMProvider& queueToolCalls(const std::vector<ToolCall>& tool_calls) {
    std::lock_guard<std::mutex> lock(mutex_);
    MockResponseConfig config;
    config.response.message = Message::assistantWithToolCalls(tool_calls);
    config.response.finish_reason = "tool_calls";
    response_queue_.push(config);
    return *this;
  }

  // Queue an error response
  MockLLMProvider& queueError(int code, const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);
    MockResponseConfig config;
    config.error = Error(code, message);
    response_queue_.push(config);
    return *this;
  }

  // Queue a full LLMResponse
  MockLLMProvider& queueFullResponse(const LLMResponse& response) {
    std::lock_guard<std::mutex> lock(mutex_);
    MockResponseConfig config;
    config.response = response;
    response_queue_.push(config);
    return *this;
  }

  // Set response delay
  MockLLMProvider& setDelay(std::chrono::milliseconds delay) {
    std::lock_guard<std::mutex> lock(mutex_);
    delay_ = delay;
    return *this;
  }

  // Get call count
  size_t callCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return call_count_;
  }

  // Get last messages received
  std::vector<Message> lastMessages() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return last_messages_;
  }

  // Get last tools received
  std::vector<ToolSpec> lastTools() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return last_tools_;
  }

  // Get last config received
  LLMConfig lastConfig() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return last_config_;
  }

  // Reset mock state
  void reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    call_count_ = 0;
    last_messages_.clear();
    last_tools_.clear();
    default_response_ = nullopt;
    while (!response_queue_.empty()) {
      response_queue_.pop();
    }
  }

 private:
  mutable std::mutex mutex_;
  std::string name_;
  size_t call_count_ = 0;
  std::vector<Message> last_messages_;
  std::vector<ToolSpec> last_tools_;
  LLMConfig last_config_;
  optional<LLMResponse> default_response_;
  std::queue<MockResponseConfig> response_queue_;
  std::chrono::milliseconds delay_{0};
};

// Factory function
inline std::shared_ptr<MockLLMProvider> makeMockLLMProvider(
    const std::string& name = "mock-llm") {
  return std::make_shared<MockLLMProvider>(name);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher
