#pragma once

// Agent - ReAct-style AI agent implementation
//
// Implements the ReAct (Reasoning + Acting) pattern:
// 1. LLM receives user query and available tools
// 2. LLM reasons and decides to either respond or use tools
// 3. If tool calls requested, execute them
// 4. Feed tool results back to LLM
// 5. Repeat until LLM provides final response
//
// Usage:
//   auto provider = createOpenAIProvider("sk-...");
//   auto registry = makeToolRegistry();
//   registry->addTool("search", "Search the web", schema, searchFunc);
//
//   AgentConfig config("gpt-4o");
//   config.withSystemPrompt("You are a helpful assistant.");
//
//   auto agent = ReActAgent::create(provider, registry, config);
//   agent->run("What's the weather in Tokyo?", dispatcher, callback);

#include <atomic>
#include <memory>
#include <string>
#include <vector>

#include "gopher/orch/agent/agent_types.h"
#include "gopher/orch/agent/tool_registry.h"
#include "gopher/orch/llm/llm_provider.h"

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::llm;

// Forward declaration
class Agent;
using AgentPtr = std::shared_ptr<Agent>;

// Agent - Abstract base class for AI agents
class Agent {
 public:
  virtual ~Agent() = default;

  // Run the agent with a user query
  virtual void run(const std::string& query,
                   Dispatcher& dispatcher,
                   AgentCallback callback) = 0;

  // Run with additional context messages
  virtual void run(const std::string& query,
                   const std::vector<Message>& context,
                   Dispatcher& dispatcher,
                   AgentCallback callback) = 0;

  // Cancel a running agent
  virtual void cancel() = 0;

  // Get current state
  virtual const AgentState& state() const = 0;

  // Check if running
  virtual bool isRunning() const = 0;

  // Set step callback for progress monitoring
  virtual void setStepCallback(StepCallback callback) = 0;

  // Set tool approval callback
  virtual void setToolApprovalCallback(ToolApprovalCallback callback) = 0;
};

// ReActAgent - Implementation of ReAct pattern
//
// Thread Safety:
// - run() should be called from dispatcher thread
// - cancel() can be called from any thread
// - Callbacks are invoked in dispatcher thread context
class ReActAgent : public Agent {
 public:
  using Ptr = std::shared_ptr<ReActAgent>;

  // Factory methods
  static Ptr create(LLMProviderPtr provider,
                    ToolRegistryPtr tools,
                    const AgentConfig& config = AgentConfig());

  static Ptr create(LLMProviderPtr provider,
                    const AgentConfig& config = AgentConfig());

  ~ReActAgent() override;

  // Agent interface
  void run(const std::string& query,
           Dispatcher& dispatcher,
           AgentCallback callback) override;

  void run(const std::string& query,
           const std::vector<Message>& context,
           Dispatcher& dispatcher,
           AgentCallback callback) override;

  void cancel() override;

  const AgentState& state() const override;
  bool isRunning() const override;

  void setStepCallback(StepCallback callback) override;
  void setToolApprovalCallback(ToolApprovalCallback callback) override;

  // ReActAgent-specific methods

  // Get the LLM provider
  LLMProviderPtr provider() const;

  // Get the tool registry
  ToolRegistryPtr tools() const;

  // Get configuration
  const AgentConfig& config() const;

  // Update configuration (only when not running)
  void setConfig(const AgentConfig& config);

  // Add tools dynamically
  void addTool(const std::string& name,
               const std::string& description,
               const JsonValue& parameters,
               ToolFunction function);

 private:
  explicit ReActAgent(LLMProviderPtr provider,
                      ToolRegistryPtr tools,
                      const AgentConfig& config);

  // Internal execution methods
  void executeLoop(Dispatcher& dispatcher);
  void callLLM(Dispatcher& dispatcher);
  void handleLLMResponse(const LLMResponse& response, Dispatcher& dispatcher);
  void executeToolCalls(const std::vector<ToolCall>& calls,
                        Dispatcher& dispatcher);
  void handleToolResults(const std::vector<ToolCall>& calls,
                         const std::vector<Result<JsonValue>>& results,
                         Dispatcher& dispatcher);
  void completeRun(AgentStatus status, Dispatcher& dispatcher);

  // Build result from current state
  AgentResult buildResult() const;

  class Impl;
  std::unique_ptr<Impl> impl_;
};

// Convenience function to create agent
inline AgentPtr makeAgent(LLMProviderPtr provider,
                          ToolRegistryPtr tools,
                          const AgentConfig& config = AgentConfig()) {
  return ReActAgent::create(provider, tools, config);
}

inline AgentPtr makeAgent(LLMProviderPtr provider,
                          const AgentConfig& config = AgentConfig()) {
  return ReActAgent::create(provider, config);
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
