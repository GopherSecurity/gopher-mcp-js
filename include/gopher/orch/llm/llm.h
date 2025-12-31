#pragma once

// LLM Module - Unified interface for LLM providers
//
// This module provides:
// - LLMProvider: Abstract interface for LLM API calls
// - OpenAIProvider: OpenAI API (GPT-4, etc.)
// - AnthropicProvider: Anthropic API (Claude models)
// - Common types: Message, ToolCall, LLMResponse, etc.
//
// Usage:
//   #include "gopher/orch/llm/llm.h"
//   using namespace gopher::orch::llm;
//
//   auto provider = createOpenAIProvider("sk-...");
//   LLMConfig config("gpt-4o");
//   config.withTemperature(0.7);
//
//   std::vector<Message> messages = {
//       Message::system("You are a helpful assistant."),
//       Message::user("Hello!")
//   };
//
//   provider->chat(messages, {}, config, dispatcher, [](Result<LLMResponse> r) {
//       if (r.isOk()) {
//           std::cout << r.value().message.content << std::endl;
//       }
//   });

// Core types
#include "gopher/orch/llm/llm_types.h"

// Base provider interface
#include "gopher/orch/llm/llm_provider.h"

// Provider implementations
#include "gopher/orch/llm/openai_provider.h"
#include "gopher/orch/llm/anthropic_provider.h"

namespace gopher {
namespace orch {
namespace llm {

// Convenience re-exports at llm namespace level

// Types
using core::Dispatcher;
using core::Error;
using core::JsonValue;
using core::Result;

}  // namespace llm
}  // namespace orch
}  // namespace gopher
