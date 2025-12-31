#pragma once

// Agent Module - AI agent framework with ReAct pattern
//
// This module provides:
// - Agent: Abstract interface for AI agents
// - ReActAgent: ReAct pattern implementation (Reasoning + Acting)
// - ToolRegistry: Unified tool management from multiple sources
// - AgentConfig, AgentState, AgentResult: Configuration and state types
//
// Usage:
//   #include "gopher/orch/agent/agent_module.h"
//   using namespace gopher::orch::agent;
//
//   // Create LLM provider
//   auto provider = createOpenAIProvider("sk-...");
//
//   // Create tool registry and add tools
//   auto registry = makeToolRegistry();
//   registry->addTool("search", "Search the web", schema,
//       [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
//           // Search implementation...
//       });
//
//   // Create and configure agent
//   AgentConfig config("gpt-4o");
//   config.withSystemPrompt("You are a helpful research assistant.")
//         .withMaxIterations(10);
//
//   auto agent = makeAgent(provider, registry, config);
//
//   // Run agent
//   agent->run("What's the latest news about AI?", dispatcher,
//       [](Result<AgentResult> result) {
//           if (result.isOk()) {
//               std::cout << result.value().response << std::endl;
//           }
//       });

// Core types
#include "gopher/orch/agent/agent_types.h"

// Tool definitions and configuration
#include "gopher/orch/agent/tool_definition.h"
#include "gopher/orch/agent/config_loader.h"
#include "gopher/orch/agent/rest_tool_adapter.h"

// Tool management
#include "gopher/orch/agent/tool_registry.h"

// Agent interface and implementations
#include "gopher/orch/agent/agent.h"

namespace gopher {
namespace orch {
namespace agent {

// Convenience re-exports
using core::Dispatcher;
using core::Error;
using core::JsonCallback;
using core::JsonValue;
using core::Result;

}  // namespace agent
}  // namespace orch
}  // namespace gopher
