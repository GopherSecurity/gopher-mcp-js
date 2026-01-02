#pragma once

// AgentRunnable - Wraps ReAct Agent as a composable Runnable
//
// Makes the ReAct agent pattern composable with other Runnables in pipelines,
// sequences, and graphs. Internally operates as a graph with LLM and Tool nodes.
//
// This is the main integration point for agent + runnable composition,
// implementing the wrapper pattern (Option A from design doc).
//
// Usage:
//   auto provider = createOpenAIProvider("sk-...");
//   auto registry = makeToolRegistry();
//   registry->addTool("search", "Search", schema, handler);
//
//   auto agent = AgentRunnable::create(provider, registry,
//       AgentConfig("gpt-4").withSystemPrompt("You are helpful"));
//
//   JsonValue input = JsonValue::object();
//   input["query"] = "What is the weather in Tokyo?";
//
//   agent->invoke(input, config, dispatcher, callback);

#include <memory>
#include <string>

#include "gopher/orch/agent/agent_types.h"
#include "gopher/orch/agent/tool_executor.h"
#include "gopher/orch/agent/tool_registry.h"
#include "gopher/orch/core/runnable.h"
#include "gopher/orch/llm/llm_provider.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;
using namespace gopher::orch::llm;

// Forward declaration
class AgentRunnable;
using AgentRunnablePtr = std::shared_ptr<AgentRunnable>;

// AgentRunnable - ReAct Agent as a Runnable<JsonValue, JsonValue>
//
// Input Schema:
// {
//   "query": "What is the weather?",        // Required
//   "context": [...],                        // Optional: prior messages
//   "config": {                              // Optional: override config
//     "max_iterations": 5,
//     "system_prompt": "..."
//   }
// }
//
// Alternative inputs (auto-detected):
// - Simple string: "What is the weather?"
// - LangGraph-style: {"messages": [...]}
//
// Output Schema:
// {
//   "response": "The weather is sunny.",
//   "status": "completed",
//   "iterations": 2,
//   "messages": [...],
//   "usage": {...},
//   "duration_ms": 3500
// }
class AgentRunnable : public Runnable<JsonValue, JsonValue> {
 public:
  using Ptr = std::shared_ptr<AgentRunnable>;

  // Factory methods
  static Ptr create(LLMProviderPtr provider,
                    ToolExecutorPtr executor,
                    const AgentConfig& config = AgentConfig());

  static Ptr create(LLMProviderPtr provider,
                    ToolRegistryPtr registry,
                    const AgentConfig& config = AgentConfig());

  static Ptr create(LLMProviderPtr provider,
                    const AgentConfig& config = AgentConfig());

  // Runnable interface
  std::string name() const override;

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override;

  // =========================================================================
  // CONFIGURATION
  // =========================================================================

  // Get/set config
  const AgentConfig& config() const { return config_; }
  void setConfig(const AgentConfig& config) { config_ = config; }

  // Get components
  LLMProviderPtr provider() const { return provider_; }
  ToolExecutorPtr executor() const { return executor_; }
  ToolRegistryPtr registry() const {
    return executor_ ? executor_->registry() : nullptr;
  }

  // =========================================================================
  // CALLBACKS
  // =========================================================================

  // Called after each step (LLM call + tool executions)
  void setStepCallback(StepCallback callback) {
    step_callback_ = std::move(callback);
  }

  // Called before tool execution for approval
  void setToolApprovalCallback(ToolApprovalCallback callback) {
    approval_callback_ = std::move(callback);
  }

 private:
  AgentRunnable(LLMProviderPtr provider,
                ToolExecutorPtr executor,
                const AgentConfig& config);

  // =========================================================================
  // INPUT PARSING
  // =========================================================================

  struct ParsedInput {
    std::string query;
    std::vector<Message> context;
    AgentConfig config;
  };
  ParsedInput parseInput(const JsonValue& input) const;

  // =========================================================================
  // AGENT LOOP EXECUTION
  // =========================================================================

  // Execute the ReAct loop
  void executeLoop(AgentState& state,
                   Dispatcher& dispatcher,
                   Callback callback);

  // Call LLM with current state
  void callLLM(AgentState& state, Dispatcher& dispatcher, Callback callback);

  // Handle LLM response (may call tools or complete)
  void handleLLMResponse(const LLMResponse& response,
                         AgentState& state,
                         Dispatcher& dispatcher,
                         Callback callback);

  // Execute tool calls
  void executeTools(const std::vector<ToolCall>& calls,
                    AgentState& state,
                    Dispatcher& dispatcher,
                    Callback callback);

  // Complete the agent run (success or failure)
  void completeRun(AgentState& state, Callback callback);

  // =========================================================================
  // OUTPUT BUILDING
  // =========================================================================

  // Build output JSON from final state
  JsonValue buildOutput(const AgentState& state) const;

  // =========================================================================
  // HELPERS
  // =========================================================================

  // Build messages array for LLM call
  std::vector<Message> buildMessages(const AgentState& state) const;

  // Get tool specs for LLM
  std::vector<ToolSpec> getToolSpecs() const;

  // Check if should continue loop
  bool shouldContinue(const AgentState& state) const;

  // Record a step
  void recordStep(AgentState& state,
                  const Message& llm_message,
                  const optional<Usage>& usage,
                  std::chrono::milliseconds llm_duration);

  LLMProviderPtr provider_;
  ToolExecutorPtr executor_;
  AgentConfig config_;

  StepCallback step_callback_;
  ToolApprovalCallback approval_callback_;
};

// Convenience factory functions
inline AgentRunnablePtr makeAgentRunnable(LLMProviderPtr provider,
                                          ToolRegistryPtr registry,
                                          const AgentConfig& config = AgentConfig()) {
  return AgentRunnable::create(std::move(provider), std::move(registry), config);
}

inline AgentRunnablePtr makeAgentRunnable(LLMProviderPtr provider,
                                          const AgentConfig& config = AgentConfig()) {
  return AgentRunnable::create(std::move(provider), config);
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
