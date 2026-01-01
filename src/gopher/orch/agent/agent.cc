// ReActAgent Implementation

#include "gopher/orch/agent/agent.h"

#include <chrono>
#include <mutex>

namespace gopher {
namespace orch {
namespace agent {

using namespace gopher::orch::core;

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

class ReActAgent::Impl {
 public:
  LLMProviderPtr provider;
  ToolRegistryPtr tools;
  ToolExecutorPtr executor;
  AgentConfig config;
  AgentState state;

  // Callbacks
  AgentCallback completion_callback;
  StepCallback step_callback;
  ToolApprovalCallback approval_callback;

  // Current dispatcher (set during run)
  Dispatcher* dispatcher = nullptr;

  // Cancellation flag
  std::atomic<bool> cancelled{false};

  // Thread safety
  mutable std::mutex mutex;

  Impl(LLMProviderPtr p, ToolRegistryPtr t, const AgentConfig& c)
      : provider(std::move(p)),
        tools(t ? t : makeToolRegistry()),
        executor(makeToolExecutor(tools)),
        config(c) {}

  // Build messages for LLM call
  std::vector<Message> buildMessages() const {
    std::vector<Message> messages;

    // Add system prompt if configured
    if (!config.system_prompt.empty()) {
      messages.push_back(Message::system(config.system_prompt));
    }

    // Add conversation history
    for (const auto& msg : state.messages) {
      messages.push_back(msg);
    }

    return messages;
  }

  // Get tool specs for LLM
  std::vector<ToolSpec> getToolSpecs() const {
    if (tools) {
      return tools->getToolSpecs();
    }
    return {};
  }

  // Record a step
  void recordStep(const AgentStep& step) {
    state.steps.push_back(step);

    // Update total usage
    if (step.llm_usage.has_value()) {
      state.total_usage.prompt_tokens += step.llm_usage->prompt_tokens;
      state.total_usage.completion_tokens += step.llm_usage->completion_tokens;
      state.total_usage.total_tokens += step.llm_usage->total_tokens;
    }

    // Invoke step callback
    if (step_callback) {
      step_callback(step);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY METHODS
// ═══════════════════════════════════════════════════════════════════════════

ReActAgent::Ptr ReActAgent::create(LLMProviderPtr provider,
                                   ToolRegistryPtr tools,
                                   const AgentConfig& config) {
  return Ptr(new ReActAgent(std::move(provider), std::move(tools), config));
}

ReActAgent::Ptr ReActAgent::create(LLMProviderPtr provider,
                                   const AgentConfig& config) {
  return create(std::move(provider), nullptr, config);
}

ReActAgent::ReActAgent(LLMProviderPtr provider,
                       ToolRegistryPtr tools,
                       const AgentConfig& config)
    : impl_(std::make_unique<Impl>(
          std::move(provider), std::move(tools), config)) {}

ReActAgent::~ReActAgent() { cancel(); }

// ═══════════════════════════════════════════════════════════════════════════
// RUN METHODS
// ═══════════════════════════════════════════════════════════════════════════

void ReActAgent::run(const std::string& query,
                     Dispatcher& dispatcher,
                     AgentCallback callback) {
  run(query, {}, dispatcher, std::move(callback));
}

void ReActAgent::run(const std::string& query,
                     const std::vector<Message>& context,
                     Dispatcher& dispatcher,
                     AgentCallback callback) {
  // Check if already running
  if (impl_->state.status == AgentStatus::RUNNING) {
    dispatcher.post([callback = std::move(callback)]() {
      callback(Result<AgentResult>(
          Error(AgentError::UNKNOWN, "Agent is already running")));
    });
    return;
  }

  // Check provider
  if (!impl_->provider) {
    dispatcher.post([callback = std::move(callback)]() {
      callback(Result<AgentResult>(
          Error(AgentError::NO_PROVIDER, "No LLM provider configured")));
    });
    return;
  }

  // Initialize state
  impl_->state = AgentState();
  impl_->state.status = AgentStatus::RUNNING;
  impl_->state.start_time = std::chrono::steady_clock::now();
  impl_->cancelled = false;

  // Add context messages
  for (const auto& msg : context) {
    impl_->state.messages.push_back(msg);
  }

  // Add user query
  impl_->state.messages.push_back(Message::user(query));

  // Store callback and dispatcher
  impl_->completion_callback = std::move(callback);
  impl_->dispatcher = &dispatcher;

  // Start the ReAct loop
  executeLoop(dispatcher);
}

void ReActAgent::cancel() {
  impl_->cancelled = true;

  if (impl_->state.status == AgentStatus::RUNNING) {
    impl_->state.status = AgentStatus::CANCELLED;
    impl_->state.error = Error(AgentError::CANCELLED, "Agent cancelled");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE ACCESS
// ═══════════════════════════════════════════════════════════════════════════

const AgentState& ReActAgent::state() const { return impl_->state; }

bool ReActAgent::isRunning() const {
  return impl_->state.status == AgentStatus::RUNNING;
}

void ReActAgent::setStepCallback(StepCallback callback) {
  impl_->step_callback = std::move(callback);
}

void ReActAgent::setToolApprovalCallback(ToolApprovalCallback callback) {
  impl_->approval_callback = std::move(callback);
}

LLMProviderPtr ReActAgent::provider() const { return impl_->provider; }

ToolRegistryPtr ReActAgent::tools() const { return impl_->tools; }

const AgentConfig& ReActAgent::config() const { return impl_->config; }

void ReActAgent::setConfig(const AgentConfig& config) {
  if (impl_->state.status != AgentStatus::RUNNING) {
    impl_->config = config;
  }
}

void ReActAgent::addTool(const std::string& name,
                         const std::string& description,
                         const JsonValue& parameters,
                         ToolFunction function) {
  if (impl_->tools) {
    impl_->tools->addTool(name, description, parameters, std::move(function));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

void ReActAgent::executeLoop(Dispatcher& dispatcher) {
  // Check cancellation
  if (impl_->cancelled) {
    completeRun(AgentStatus::CANCELLED, dispatcher);
    return;
  }

  // Check iteration limit
  if (impl_->state.current_iteration >= impl_->config.max_iterations) {
    impl_->state.error =
        Error(AgentError::MAX_ITERATIONS, "Maximum iterations reached");
    completeRun(AgentStatus::MAX_ITERATIONS_REACHED, dispatcher);
    return;
  }

  // Check timeout
  auto elapsed = std::chrono::steady_clock::now() - impl_->state.start_time;
  if (elapsed > impl_->config.timeout) {
    impl_->state.error = Error(AgentError::TIMEOUT, "Agent timeout");
    completeRun(AgentStatus::FAILED, dispatcher);
    return;
  }

  impl_->state.current_iteration++;

  // Call LLM
  callLLM(dispatcher);
}

void ReActAgent::callLLM(Dispatcher& dispatcher) {
  auto messages = impl_->buildMessages();
  auto tools = impl_->getToolSpecs();
  auto& config = impl_->config.llm_config;

  auto start_time = std::chrono::steady_clock::now();

  impl_->provider->chat(
      messages, tools, config, dispatcher,
      [this, &dispatcher, start_time](Result<LLMResponse> result) {
        if (!mcp::holds_alternative<LLMResponse>(result)) {
          impl_->state.error = mcp::get<Error>(result);
          completeRun(AgentStatus::FAILED, dispatcher);
          return;
        }

        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start_time);

        const auto& response = mcp::get<LLMResponse>(result);

        // Create step record
        AgentStep step;
        step.step_number = impl_->state.current_iteration;
        step.llm_message = response.message;
        step.llm_usage = response.usage;
        step.llm_duration = duration;

        // Record step first (will be updated with tool results if needed)
        impl_->recordStep(step);

        // Handle response (may complete run or execute tools)
        handleLLMResponse(response, dispatcher);
      });
}

void ReActAgent::handleLLMResponse(const LLMResponse& response,
                                   Dispatcher& dispatcher) {
  // Add assistant message to history
  impl_->state.messages.push_back(response.message);

  // Check if LLM wants to call tools
  if (response.hasToolCalls()) {
    // Execute tool calls
    executeToolCalls(response.toolCalls(), dispatcher);
  } else {
    // No tool calls - agent is done
    completeRun(AgentStatus::COMPLETED, dispatcher);
  }
}

void ReActAgent::executeToolCalls(const std::vector<ToolCall>& calls,
                                  Dispatcher& dispatcher) {
  // Check for tool approval
  if (impl_->approval_callback) {
    for (const auto& call : calls) {
      if (!impl_->approval_callback(call)) {
        // Tool call rejected
        impl_->state.error =
            Error(AgentError::CANCELLED, "Tool call rejected: " + call.name);
        completeRun(AgentStatus::CANCELLED, dispatcher);
        return;
      }
    }
  }

  if (!impl_->executor) {
    // No executor configured - add error result
    for (const auto& call : calls) {
      impl_->state.messages.push_back(
          Message::toolResult(call.id, "Error: No tools configured"));
    }
    // Continue loop
    dispatcher.post([this, &dispatcher]() { executeLoop(dispatcher); });
    return;
  }

  // Execute tools via executor
  auto start_time = std::chrono::steady_clock::now();

  impl_->executor->executeToolCalls(
      calls, impl_->config.parallel_tool_calls, dispatcher,
      [this, &dispatcher, calls,
       start_time](std::vector<Result<JsonValue>> results) {
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start_time);

        handleToolResults(calls, results, dispatcher);
      });
}

void ReActAgent::handleToolResults(
    const std::vector<ToolCall>& calls,
    const std::vector<Result<JsonValue>>& results,
    Dispatcher& dispatcher) {
  // Update last step with tool executions
  if (!impl_->state.steps.empty()) {
    auto& last_step = impl_->state.steps.back();
    for (size_t i = 0; i < calls.size(); ++i) {
      ToolExecution exec;
      exec.tool_name = calls[i].name;
      exec.call_id = calls[i].id;
      exec.input = calls[i].arguments;

      if (i < results.size()) {
        if (mcp::holds_alternative<JsonValue>(results[i])) {
          exec.output = mcp::get<JsonValue>(results[i]);
          exec.success = true;
        } else {
          exec.success = false;
          exec.error_message = mcp::get<Error>(results[i]).message;
        }
      }

      last_step.tool_executions.push_back(std::move(exec));
    }
  }

  // Add tool results to messages
  for (size_t i = 0; i < calls.size(); ++i) {
    std::string result_content;

    if (i < results.size()) {
      if (mcp::holds_alternative<JsonValue>(results[i])) {
        result_content = mcp::get<JsonValue>(results[i]).toString();
      } else {
        result_content = "Error: " + mcp::get<Error>(results[i]).message;
      }
    } else {
      result_content = "Error: No result returned";
    }

    impl_->state.messages.push_back(
        Message::toolResult(calls[i].id, result_content));
  }

  // Continue the loop
  dispatcher.post([this, &dispatcher]() { executeLoop(dispatcher); });
}

void ReActAgent::completeRun(AgentStatus status, Dispatcher& dispatcher) {
  impl_->state.status = status;
  impl_->state.elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - impl_->state.start_time);

  auto result = buildResult();

  if (impl_->completion_callback) {
    auto callback = std::move(impl_->completion_callback);
    impl_->completion_callback = nullptr;

    if (status == AgentStatus::COMPLETED) {
      callback(Result<AgentResult>(std::move(result)));
    } else {
      callback(Result<AgentResult>(impl_->state.error.value_or(
          Error(AgentError::UNKNOWN, "Unknown error"))));
    }
  }
}

AgentResult ReActAgent::buildResult() const {
  AgentResult result;
  result.status = impl_->state.status;
  result.messages = impl_->state.messages;
  result.steps = impl_->state.steps;
  result.total_usage = impl_->state.total_usage;
  result.duration = impl_->state.elapsed;
  result.error = impl_->state.error;

  // Get final response from last assistant message
  for (auto it = impl_->state.messages.rbegin();
       it != impl_->state.messages.rend(); ++it) {
    if (it->role == Role::ASSISTANT && !it->content.empty()) {
      result.response = it->content;
      break;
    }
  }

  return result;
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
