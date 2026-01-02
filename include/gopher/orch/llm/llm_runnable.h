#pragma once

// LLMRunnable - Wraps LLMProvider as a composable Runnable
//
// Enables LLM calls to be composed with other Runnables in pipelines,
// sequences, and graphs. Transforms JSON input into LLM chat requests
// and returns LLM responses as JSON.
//
// Usage:
//   auto provider = createOpenAIProvider("sk-...");
//   auto llm = LLMRunnable::create(provider, LLMConfig("gpt-4"));
//
//   JsonValue input = JsonValue::object();
//   input["messages"] = messages_array;
//
//   llm->invoke(input, config, dispatcher, [](Result<JsonValue> result) {
//     // Handle result...
//   });

#include <memory>
#include <string>

#include "gopher/orch/core/runnable.h"
#include "gopher/orch/llm/llm_provider.h"
#include "gopher/orch/llm/llm_types.h"

namespace gopher {
namespace orch {
namespace llm {

using namespace gopher::orch::core;

// LLMRunnable - Adapter that makes LLMProvider a Runnable<JsonValue, JsonValue>
//
// Input Schema:
// {
//   "messages": [
//     {"role": "system", "content": "..."},
//     {"role": "user", "content": "..."}
//   ],
//   "tools": [...],        // optional
//   "config": {...}        // optional, overrides default config
// }
//
// Alternative: Simple string input becomes a user message
// "Hello, how are you?"
//
// Output Schema:
// {
//   "message": {
//     "role": "assistant",
//     "content": "...",
//     "tool_calls": [...]  // optional
//   },
//   "finish_reason": "stop" | "tool_calls" | "length",
//   "usage": {
//     "prompt_tokens": 50,
//     "completion_tokens": 20,
//     "total_tokens": 70
//   }
// }
class LLMRunnable : public Runnable<JsonValue, JsonValue> {
 public:
  using Ptr = std::shared_ptr<LLMRunnable>;

  // Factory method
  static Ptr create(LLMProviderPtr provider,
                    const LLMConfig& config = LLMConfig());

  // Runnable interface
  std::string name() const override;

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override;

  // Accessors
  LLMProviderPtr provider() const { return provider_; }
  const LLMConfig& defaultConfig() const { return default_config_; }

  // Set default config
  void setDefaultConfig(const LLMConfig& config) { default_config_ = config; }

 private:
  LLMRunnable(LLMProviderPtr provider, const LLMConfig& config);

  // Parse input JSON into messages, tools, and config
  struct ParsedInput {
    std::vector<Message> messages;
    std::vector<ToolSpec> tools;
    LLMConfig config;
  };
  ParsedInput parseInput(const JsonValue& input) const;

  // Convert LLMResponse to JSON output
  static JsonValue responseToJson(const LLMResponse& response);

  // Convert Message to JSON
  static JsonValue messageToJson(const Message& message);

  // Parse Message from JSON
  static Message parseMessage(const JsonValue& json);

  // Parse ToolSpec from JSON
  static ToolSpec parseToolSpec(const JsonValue& json);

  LLMProviderPtr provider_;
  LLMConfig default_config_;
};

// Convenience factory function
inline LLMRunnable::Ptr makeLLMRunnable(LLMProviderPtr provider,
                                        const LLMConfig& config = LLMConfig()) {
  return LLMRunnable::create(std::move(provider), config);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher
