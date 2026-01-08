#pragma once

// RunnableConfig - Configuration options for Runnable invocations
// Provides metadata, tags, and execution options that flow through the chain

#include <chrono>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {

// Forward declaration for CallbackManager (avoids circular dependency)
namespace callback {
class CallbackManager;
}  // namespace callback

namespace core {

// Configuration passed to each Runnable invocation
// Carries metadata, tags, and execution options through the composition chain
class RunnableConfig {
 public:
  RunnableConfig() = default;

  // Builder pattern for fluent configuration
  RunnableConfig& withTag(const std::string& key, const std::string& value) {
    tags_[key] = value;
    return *this;
  }

  RunnableConfig& withMetadata(const std::string& key, const JsonValue& value) {
    metadata_[key] = value;
    return *this;
  }

  RunnableConfig& withRunName(const std::string& name) {
    run_name_ = name;
    return *this;
  }

  RunnableConfig& withMaxConcurrency(size_t max) {
    max_concurrency_ = max;
    return *this;
  }

  RunnableConfig& withTimeout(std::chrono::milliseconds timeout) {
    timeout_ms_ = timeout;
    return *this;
  }

  RunnableConfig& withRecursionLimit(size_t limit) {
    recursion_limit_ = limit;
    return *this;
  }

  // Set the callback manager for observability
  RunnableConfig& withCallbacks(
      std::shared_ptr<callback::CallbackManager> callbacks) {
    callbacks_ = std::move(callbacks);
    return *this;
  }

  // Accessors
  const std::map<std::string, std::string>& tags() const { return tags_; }

  const std::map<std::string, JsonValue>& metadata() const { return metadata_; }

  optional<std::string> tag(const std::string& key) const {
    auto it = tags_.find(key);
    if (it != tags_.end()) {
      // Explicit namespace to avoid ambiguity with std::make_optional in C++17
      return mcp::make_optional(it->second);
    }
    return nullopt;
  }

  const std::string& runName() const { return run_name_; }

  size_t maxConcurrency() const { return max_concurrency_; }

  std::chrono::milliseconds timeout() const { return timeout_ms_; }

  size_t recursionLimit() const { return recursion_limit_; }

  // Get the callback manager (may be null)
  std::shared_ptr<callback::CallbackManager> callbacks() const {
    return callbacks_;
  }

  // Check if callbacks are configured
  bool hasCallbacks() const { return callbacks_ != nullptr; }

  // Merge another config into this one (other takes precedence)
  RunnableConfig& merge(const RunnableConfig& other) {
    for (const auto& kv : other.tags_) {
      tags_[kv.first] = kv.second;
    }
    for (const auto& kv : other.metadata_) {
      metadata_[kv.first] = kv.second;
    }
    if (!other.run_name_.empty()) {
      run_name_ = other.run_name_;
    }
    if (other.max_concurrency_ > 0) {
      max_concurrency_ = other.max_concurrency_;
    }
    if (other.timeout_ms_.count() > 0) {
      timeout_ms_ = other.timeout_ms_;
    }
    if (other.recursion_limit_ > 0) {
      recursion_limit_ = other.recursion_limit_;
    }
    if (other.callbacks_) {
      callbacks_ = other.callbacks_;
    }
    return *this;
  }

  // Create a child config that inherits from this config
  RunnableConfig child() const {
    RunnableConfig child_config = *this;
    // Decrement recursion limit for child
    if (child_config.recursion_limit_ > 0) {
      child_config.recursion_limit_--;
    }
    return child_config;
  }

 private:
  std::map<std::string, std::string> tags_;
  std::map<std::string, JsonValue> metadata_;
  std::string run_name_;
  size_t max_concurrency_ = 0;               // 0 means unlimited
  std::chrono::milliseconds timeout_ms_{0};  // 0 means no timeout
  size_t recursion_limit_ = 25;              // Default recursion limit
  std::shared_ptr<callback::CallbackManager> callbacks_;  // Observability hooks
};

}  // namespace core
}  // namespace orch
}  // namespace gopher
