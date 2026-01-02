// AgentRunnable Implementation

#include "gopher/orch/agent/agent_runnable.h"

#include <chrono>

namespace gopher {
namespace orch {
namespace agent {

// =============================================================================
// Factory Methods
// =============================================================================

AgentRunnable::Ptr AgentRunnable::create(LLMProviderPtr provider,
                                         ToolExecutorPtr executor,
                                         const AgentConfig& config) {
  return Ptr(
      new AgentRunnable(std::move(provider), std::move(executor), config));
}

AgentRunnable::Ptr AgentRunnable::create(LLMProviderPtr provider,
                                         ToolRegistryPtr registry,
                                         const AgentConfig& config) {
  ToolExecutorPtr executor = registry ? makeToolExecutor(registry) : nullptr;
  return create(std::move(provider), std::move(executor), config);
}

AgentRunnable::Ptr AgentRunnable::create(LLMProviderPtr provider,
                                         const AgentConfig& config) {
  return create(std::move(provider), ToolExecutorPtr{}, config);
}

AgentRunnable::AgentRunnable(LLMProviderPtr provider,
                             ToolExecutorPtr executor,
                             const AgentConfig& config)
    : provider_(std::move(provider)),
      executor_(std::move(executor)),
      config_(config) {}

// =============================================================================
// Runnable Interface
// =============================================================================

std::string AgentRunnable::name() const { return "AgentRunnable"; }

void AgentRunnable::invoke(const JsonValue& input,
                           const RunnableConfig& /* runnable_config */,
                           Dispatcher& dispatcher,
                           Callback callback) {
  // Validate provider
  if (!provider_) {
    postError<JsonValue>(dispatcher, std::move(callback),
                         AgentError::NO_PROVIDER, "No LLM provider configured");
    return;
  }

  // Parse input
  auto parsed = parseInput(input);

  if (parsed.query.empty() && parsed.context.empty()) {
    postError<JsonValue>(dispatcher, std::move(callback),
                         OrchError::INVALID_ARGUMENT,
                         "No query or messages provided");
    return;
  }

  // Initialize state
  AgentState state;
  state.status = AgentStatus::RUNNING;
  state.start_time = std::chrono::steady_clock::now();
  state.remaining_steps = parsed.config.max_iterations;

  // Add context messages
  for (const auto& msg : parsed.context) {
    state.messages.push_back(msg);
  }

  // Add user query as message if provided
  if (!parsed.query.empty()) {
    state.messages.push_back(Message::user(parsed.query));
  }

  // Store config for this run
  config_ = parsed.config;

  // Start the ReAct loop
  executeLoop(state, dispatcher, std::move(callback));
}

// =============================================================================
// Input Parsing
// =============================================================================

AgentRunnable::ParsedInput AgentRunnable::parseInput(
    const JsonValue& input) const {
  ParsedInput result;
  result.config = config_;  // Start with current config

  // Handle string input as simple query
  if (input.isString()) {
    result.query = input.getString();
    return result;
  }

  if (!input.isObject()) {
    return result;
  }

  // Parse query
  if (input.contains("query") && input["query"].isString()) {
    result.query = input["query"].getString();
  }

  // Parse context messages
  if (input.contains("context") && input["context"].isArray()) {
    const auto& context_arr = input["context"];
    for (size_t i = 0; i < context_arr.size(); ++i) {
      const auto& msg_json = context_arr[i];
      if (!msg_json.isObject())
        continue;

      Role role = Role::USER;
      if (msg_json.contains("role") && msg_json["role"].isString()) {
        role = parseRole(msg_json["role"].getString());
      }

      std::string content;
      if (msg_json.contains("content") && msg_json["content"].isString()) {
        content = msg_json["content"].getString();
      }

      result.context.push_back(Message(role, content));
    }
  }

  // Parse LangGraph-style messages input
  if (input.contains("messages") && input["messages"].isArray()) {
    const auto& msgs_arr = input["messages"];
    for (size_t i = 0; i < msgs_arr.size(); ++i) {
      const auto& msg_json = msgs_arr[i];
      if (!msg_json.isObject())
        continue;

      Role role = Role::USER;
      if (msg_json.contains("role") && msg_json["role"].isString()) {
        role = parseRole(msg_json["role"].getString());
      }

      std::string content;
      if (msg_json.contains("content") && msg_json["content"].isString()) {
        content = msg_json["content"].getString();
      }

      result.context.push_back(Message(role, content));
    }
  }

  // Parse config overrides
  if (input.contains("config") && input["config"].isObject()) {
    const auto& cfg = input["config"];

    if (cfg.contains("max_iterations") && cfg["max_iterations"].isNumber()) {
      result.config.max_iterations = cfg["max_iterations"].getInt();
    }
    if (cfg.contains("system_prompt") && cfg["system_prompt"].isString()) {
      result.config.system_prompt = cfg["system_prompt"].getString();
    }
    if (cfg.contains("model") && cfg["model"].isString()) {
      result.config.llm_config.model = cfg["model"].getString();
    }
    if (cfg.contains("temperature") && cfg["temperature"].isNumber()) {
      result.config.llm_config.temperature = cfg["temperature"].getFloat();
    }
  }

  return result;
}

// =============================================================================
// Agent Loop Execution
// =============================================================================

void AgentRunnable::executeLoop(AgentState& state,
                                Dispatcher& dispatcher,
                                Callback callback) {
  // Check if should continue
  if (!shouldContinue(state)) {
    completeRun(state, std::move(callback));
    return;
  }

  state.current_iteration++;
  state.remaining_steps--;

  // Call LLM
  callLLM(state, dispatcher, std::move(callback));
}

void AgentRunnable::callLLM(AgentState& state,
                            Dispatcher& dispatcher,
                            Callback callback) {
  auto messages = buildMessages(state);
  auto tools = getToolSpecs();

  auto start_time = std::chrono::steady_clock::now();

  // Capture state by value for the async callback
  provider_->chat(
      messages, tools, config_.llm_config, dispatcher,
      [this, state, start_time, &dispatcher,
       callback = std::move(callback)](Result<LLMResponse> result) mutable {
        if (mcp::holds_alternative<Error>(result)) {
          state.status = AgentStatus::FAILED;
          state.error = mcp::get<Error>(result);
          completeRun(state, std::move(callback));
          return;
        }

        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start_time);

        const auto& response = mcp::get<LLMResponse>(result);

        // Record step
        recordStep(state, response.message, response.usage, duration);

        // Handle response
        handleLLMResponse(response, state, dispatcher, std::move(callback));
      });
}

void AgentRunnable::handleLLMResponse(const LLMResponse& response,
                                      AgentState& state,
                                      Dispatcher& dispatcher,
                                      Callback callback) {
  // Add assistant message to history
  state.messages.push_back(response.message);

  // Update usage
  if (response.usage.has_value()) {
    state.total_usage.prompt_tokens += response.usage->prompt_tokens;
    state.total_usage.completion_tokens += response.usage->completion_tokens;
    state.total_usage.total_tokens += response.usage->total_tokens;
  }

  // Check if LLM wants to call tools
  if (response.hasToolCalls()) {
    executeTools(response.toolCalls(), state, dispatcher, std::move(callback));
  } else {
    // No tool calls - agent is done
    state.status = AgentStatus::COMPLETED;
    completeRun(state, std::move(callback));
  }
}

void AgentRunnable::executeTools(const std::vector<ToolCall>& calls,
                                 AgentState& state,
                                 Dispatcher& dispatcher,
                                 Callback callback) {
  // Check tool approval
  if (approval_callback_) {
    for (const auto& call : calls) {
      if (!approval_callback_(call)) {
        state.status = AgentStatus::CANCELLED;
        state.error =
            Error(AgentError::CANCELLED, "Tool call rejected: " + call.name);
        completeRun(state, std::move(callback));
        return;
      }
    }
  }

  // Check if we have an executor
  if (!executor_) {
    // No tools - add error messages and continue
    for (const auto& call : calls) {
      state.messages.push_back(
          Message::toolResult(call.id, "Error: No tools configured"));
    }
    // Continue loop to let LLM handle the error
    dispatcher.post(
        [this, state, &dispatcher, callback = std::move(callback)]() mutable {
          executeLoop(state, dispatcher, std::move(callback));
        });
    return;
  }

  // Execute tools
  executor_->executeToolCalls(
      calls, config_.parallel_tool_calls, dispatcher,
      [this, calls, state, &dispatcher, callback = std::move(callback)](
          std::vector<Result<JsonValue>> results) mutable {
        // Update last step with tool executions
        if (!state.steps.empty()) {
          auto& last_step = state.steps.back();
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

          state.messages.push_back(
              Message::toolResult(calls[i].id, result_content));
        }

        // Continue the loop
        executeLoop(state, dispatcher, std::move(callback));
      });
}

void AgentRunnable::completeRun(AgentState& state, Callback callback) {
  state.elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - state.start_time);

  // Check for max iterations
  if (state.remaining_steps <= 0 && state.status == AgentStatus::RUNNING) {
    state.status = AgentStatus::MAX_ITERATIONS_REACHED;
    state.error =
        Error(AgentError::MAX_ITERATIONS, "Maximum iterations reached");
  }

  // Build output
  if (state.status == AgentStatus::COMPLETED ||
      state.status == AgentStatus::MAX_ITERATIONS_REACHED) {
    JsonValue output = buildOutput(state);
    callback(Result<JsonValue>(std::move(output)));
  } else {
    // Return error
    callback(Result<JsonValue>(
        state.error.value_or(Error(AgentError::UNKNOWN, "Unknown error"))));
  }
}

// =============================================================================
// Output Building
// =============================================================================

JsonValue AgentRunnable::buildOutput(const AgentState& state) const {
  JsonValue output = JsonValue::object();

  // Get final response from last assistant message
  std::string response;
  for (auto it = state.messages.rbegin(); it != state.messages.rend(); ++it) {
    if (it->role == Role::ASSISTANT && !it->content.empty()) {
      response = it->content;
      break;
    }
  }
  output["response"] = response;

  // Status
  output["status"] = agentStatusToString(state.status);

  // Iterations
  output["iterations"] = static_cast<int>(state.steps.size());

  // Messages
  JsonValue messages_arr = JsonValue::array();
  for (const auto& msg : state.messages) {
    JsonValue msg_json = JsonValue::object();
    msg_json["role"] = roleToString(msg.role);
    msg_json["content"] = msg.content;
    if (msg.tool_call_id.has_value()) {
      msg_json["tool_call_id"] = *msg.tool_call_id;
    }
    if (msg.hasToolCalls()) {
      JsonValue calls_arr = JsonValue::array();
      for (const auto& call : *msg.tool_calls) {
        JsonValue call_json = JsonValue::object();
        call_json["id"] = call.id;
        call_json["name"] = call.name;
        call_json["arguments"] = call.arguments;
        calls_arr.push_back(call_json);
      }
      msg_json["tool_calls"] = calls_arr;
    }
    messages_arr.push_back(msg_json);
  }
  output["messages"] = messages_arr;

  // Usage
  JsonValue usage = JsonValue::object();
  usage["prompt_tokens"] = state.total_usage.prompt_tokens;
  usage["completion_tokens"] = state.total_usage.completion_tokens;
  usage["total_tokens"] = state.total_usage.total_tokens;
  output["usage"] = usage;

  // Duration
  output["duration_ms"] = static_cast<int>(state.elapsed.count());

  // Error if any
  if (state.error.has_value()) {
    JsonValue error = JsonValue::object();
    error["code"] = state.error->code;
    error["message"] = state.error->message;
    output["error"] = error;
  }

  return output;
}

// =============================================================================
// Helpers
// =============================================================================

std::vector<Message> AgentRunnable::buildMessages(
    const AgentState& state) const {
  std::vector<Message> messages;

  // Add system prompt if configured
  if (!config_.system_prompt.empty()) {
    messages.push_back(Message::system(config_.system_prompt));
  }

  // Add conversation history
  for (const auto& msg : state.messages) {
    messages.push_back(msg);
  }

  return messages;
}

std::vector<ToolSpec> AgentRunnable::getToolSpecs() const {
  if (executor_ && executor_->registry()) {
    return executor_->registry()->getToolSpecs();
  }
  return {};
}

bool AgentRunnable::shouldContinue(const AgentState& state) const {
  // Stop if not running
  if (state.status != AgentStatus::RUNNING) {
    return false;
  }

  // Stop if max iterations reached
  if (state.remaining_steps <= 0) {
    return false;
  }

  // Check timeout
  auto elapsed = std::chrono::steady_clock::now() - state.start_time;
  if (elapsed > config_.timeout) {
    return false;
  }

  return true;
}

void AgentRunnable::recordStep(AgentState& state,
                               const Message& llm_message,
                               const optional<Usage>& usage,
                               std::chrono::milliseconds llm_duration) {
  AgentStep step;
  step.step_number = state.current_iteration;
  step.llm_message = llm_message;
  step.llm_usage = usage;
  step.llm_duration = llm_duration;

  state.steps.push_back(std::move(step));

  // Invoke step callback
  if (step_callback_ && config_.enable_step_callbacks) {
    step_callback_(state.steps.back());
  }
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
