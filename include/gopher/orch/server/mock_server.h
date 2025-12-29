#pragma once

// MockServer - In-memory server implementation for testing
//
// Provides a server that operates entirely in memory with no network I/O.
// Useful for:
// - Unit testing workflows without network dependencies
// - Mocking specific tool behaviors
// - Recording tool calls for verification
// - Simulating errors and edge cases

#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "gopher/orch/server/server.h"

namespace gopher {
namespace orch {
namespace server {

// Mock tool response configuration
struct MockToolConfig {
  // Response to return on success
  optional<JsonValue> response;

  // Error to return (if set, overrides response)
  optional<Error> error;

  // Delay before responding (in milliseconds)
  std::chrono::milliseconds delay{0};

  // Number of calls received
  size_t call_count = 0;

  // Last arguments received
  optional<JsonValue> last_arguments;

  // Custom handler (overrides response/error if set)
  std::function<Result<JsonValue>(const JsonValue&)> handler;
};

// MockServer - In-memory server for testing
class MockServer : public Server {
 public:
  explicit MockServer(const std::string& name, const std::string& id = "")
      : name_(name),
        id_(id.empty() ? "mock-" + name : id),
        state_(ConnectionState::DISCONNECTED) {}

  // Server interface implementation
  std::string id() const override { return id_; }
  std::string name() const override { return name_; }
  ConnectionState connectionState() const override { return state_; }

  void connect(Dispatcher& dispatcher, ConnectionCallback callback) override {
    state_ = ConnectionState::CONNECTED;
    dispatcher.post([callback]() { callback(makeSuccess(nullptr)); });
  }

  void disconnect(Dispatcher& dispatcher,
                  std::function<void()> callback) override {
    state_ = ConnectionState::DISCONNECTED;
    if (callback) {
      dispatcher.post(std::move(callback));
    }
  }

  void listTools(Dispatcher& dispatcher, ToolListCallback callback) override {
    std::vector<ToolInfo> tools;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      for (const auto& kv : tools_) {
        tools.push_back(kv.second);
      }
    }
    dispatcher.post([tools = std::move(tools), callback]() {
      callback(makeSuccess(std::move(tools)));
    });
  }

  JsonRunnablePtr tool(const std::string& name) override {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = tools_.find(name);
    if (it == tools_.end()) {
      return nullptr;
    }
    return std::make_shared<ServerTool>(shared(), it->second);
  }

  void callTool(const std::string& name,
                const JsonValue& arguments,
                const RunnableConfig& config,
                Dispatcher& dispatcher,
                JsonCallback callback) override {
    MockToolConfig* tool_config = nullptr;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto it = configs_.find(name);
      if (it == configs_.end()) {
        auto tool_it = tools_.find(name);
        if (tool_it == tools_.end()) {
          dispatcher.post([name, callback]() {
            callback(Result<JsonValue>(
                Error(OrchError::TOOL_NOT_FOUND, "Tool not found: " + name)));
          });
          return;
        }
        // Create default config for tool
        configs_[name] = MockToolConfig();
        configs_[name].response = JsonValue::object();
        it = configs_.find(name);
      }
      tool_config = &it->second;
      tool_config->call_count++;
      tool_config->last_arguments = arguments;
    }

    // Capture result before posting
    Result<JsonValue> result = Result<JsonValue>(JsonValue::object());

    if (tool_config->handler) {
      result = tool_config->handler(arguments);
    } else if (tool_config->error.has_value()) {
      result = Result<JsonValue>(tool_config->error.value());
    } else if (tool_config->response.has_value()) {
      // Copy the response value to avoid reference issues
      JsonValue response_copy = tool_config->response.value();
      result = Result<JsonValue>(std::move(response_copy));
    }

    auto delay = tool_config->delay;

    if (delay.count() > 0) {
      // Create timer for delayed response
      auto timer =
          dispatcher.createTimer([result = std::move(result),
                                  callback = std::move(callback)]() mutable {
            callback(std::move(result));
          }, delay);
    } else {
      dispatcher.post([result = std::move(result),
                       callback = std::move(callback)]() mutable {
        callback(std::move(result));
      });
    }
  }

  // =========================================================================
  // MockServer-specific API for test configuration
  // =========================================================================

  // Add a tool to the mock server
  MockServer& addTool(const std::string& name,
                      const std::string& description = "") {
    std::lock_guard<std::mutex> lock(mutex_);
    tools_[name] = ToolInfo(name, description);
    return *this;
  }

  // Add a tool with schema
  MockServer& addTool(const ToolInfo& info) {
    std::lock_guard<std::mutex> lock(mutex_);
    tools_[info.name] = info;
    return *this;
  }

  // Set the response for a tool
  MockServer& setResponse(const std::string& toolName,
                          const JsonValue& response) {
    std::lock_guard<std::mutex> lock(mutex_);
    configs_[toolName].response = response;
    configs_[toolName].error = nullopt;
    return *this;
  }

  // Set an error response for a tool
  MockServer& setError(const std::string& toolName, const Error& error) {
    std::lock_guard<std::mutex> lock(mutex_);
    configs_[toolName].error = error;
    return *this;
  }

  MockServer& setError(const std::string& toolName,
                       int code,
                       const std::string& message) {
    return setError(toolName, Error(code, message));
  }

  // Set a delay before responding
  MockServer& setDelay(const std::string& toolName,
                       std::chrono::milliseconds delay) {
    std::lock_guard<std::mutex> lock(mutex_);
    configs_[toolName].delay = delay;
    return *this;
  }

  // Set a custom handler for a tool
  MockServer& setHandler(
      const std::string& toolName,
      std::function<Result<JsonValue>(const JsonValue&)> handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    configs_[toolName].handler = std::move(handler);
    return *this;
  }

  // Get call count for a tool
  size_t callCount(const std::string& toolName) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = configs_.find(toolName);
    if (it == configs_.end()) {
      return 0;
    }
    return it->second.call_count;
  }

  // Get total call count for all tools
  size_t totalCallCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    size_t total = 0;
    for (const auto& kv : configs_) {
      total += kv.second.call_count;
    }
    return total;
  }

  // Get last arguments for a tool
  optional<JsonValue> lastArguments(const std::string& toolName) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = configs_.find(toolName);
    if (it == configs_.end()) {
      return nullopt;
    }
    return it->second.last_arguments;
  }

  // Reset all call counts
  void resetCallCounts() {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& kv : configs_) {
      kv.second.call_count = 0;
      kv.second.last_arguments = nullopt;
    }
  }

  // Clear all tools and configs
  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    tools_.clear();
    configs_.clear();
  }

 private:
  mutable std::mutex mutex_;
  std::string name_;
  std::string id_;
  ConnectionState state_;
  std::map<std::string, ToolInfo> tools_;
  std::map<std::string, MockToolConfig> configs_;
};

// Factory function
inline std::shared_ptr<MockServer> makeMockServer(const std::string& name,
                                                  const std::string& id = "") {
  return std::make_shared<MockServer>(name, id);
}

}  // namespace server
}  // namespace orch
}  // namespace gopher
