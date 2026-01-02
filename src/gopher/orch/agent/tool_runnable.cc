// ToolRunnable Implementation

#include "gopher/orch/agent/tool_runnable.h"

#include <atomic>

namespace gopher {
namespace orch {
namespace agent {

// =============================================================================
// Factory
// =============================================================================

ToolRunnable::Ptr ToolRunnable::create(ToolExecutorPtr executor) {
  return Ptr(new ToolRunnable(std::move(executor)));
}

ToolRunnable::ToolRunnable(ToolExecutorPtr executor)
    : executor_(std::move(executor)) {}

// =============================================================================
// Runnable Interface
// =============================================================================

std::string ToolRunnable::name() const { return "ToolRunnable"; }

void ToolRunnable::invoke(const JsonValue& input,
                          const RunnableConfig& /* config */,
                          Dispatcher& dispatcher,
                          Callback callback) {
  // Validate executor
  if (!executor_) {
    postError<JsonValue>(dispatcher, std::move(callback),
                         OrchError::INVALID_ARGUMENT,
                         "No tool executor configured");
    return;
  }

  // Check if input has tool_calls array (multiple calls)
  if (input.isObject() && input.contains("tool_calls") &&
      input["tool_calls"].isArray()) {
    auto calls = parseMultipleCalls(input);
    if (calls.empty()) {
      postError<JsonValue>(dispatcher, std::move(callback),
                           OrchError::INVALID_ARGUMENT,
                           "Empty tool_calls array");
      return;
    }
    executeMultiple(calls, dispatcher, std::move(callback));
    return;
  }

  // Single tool call
  auto single = parseSingleCall(input);
  if (!single.valid) {
    postError<JsonValue>(dispatcher, std::move(callback),
                         OrchError::INVALID_ARGUMENT,
                         "Invalid tool call input: missing 'name' field");
    return;
  }

  executeSingle(single.id, single.name, single.arguments, dispatcher,
                std::move(callback));
}

// =============================================================================
// Execution
// =============================================================================

void ToolRunnable::executeSingle(const std::string& id,
                                 const std::string& name,
                                 const JsonValue& arguments,
                                 Dispatcher& dispatcher,
                                 Callback callback) {
  executor_->executeTool(
      name, arguments, dispatcher,
      [id, callback = std::move(callback)](Result<JsonValue> result) mutable {
        JsonValue output = JsonValue::object();
        if (!id.empty()) {
          output["id"] = id;
        }

        if (mcp::holds_alternative<Error>(result)) {
          output["success"] = false;
          output["error"] = mcp::get<Error>(result).message;
          // Still return success Result with error info in JSON
          callback(Result<JsonValue>(std::move(output)));
        } else {
          output["success"] = true;
          output["result"] = mcp::get<JsonValue>(result);
          callback(Result<JsonValue>(std::move(output)));
        }
      });
}

void ToolRunnable::executeMultiple(const std::vector<ToolCall>& calls,
                                   Dispatcher& dispatcher,
                                   Callback callback) {
  // Use the executor's parallel execution
  executor_->executeToolCalls(
      calls, true,  // parallel = true
      dispatcher,
      [calls, callback = std::move(callback)](
          std::vector<Result<JsonValue>> results) mutable {
        JsonValue output = JsonValue::object();
        JsonValue results_array = JsonValue::array();

        for (size_t i = 0; i < calls.size(); ++i) {
          JsonValue result_obj = JsonValue::object();
          result_obj["id"] = calls[i].id;

          if (i < results.size()) {
            if (mcp::holds_alternative<JsonValue>(results[i])) {
              result_obj["success"] = true;
              result_obj["result"] = mcp::get<JsonValue>(results[i]);
            } else {
              result_obj["success"] = false;
              result_obj["error"] = mcp::get<Error>(results[i]).message;
            }
          } else {
            result_obj["success"] = false;
            result_obj["error"] = "No result returned";
          }

          results_array.push_back(result_obj);
        }

        output["results"] = results_array;
        callback(Result<JsonValue>(std::move(output)));
      });
}

// =============================================================================
// Parsing
// =============================================================================

ToolRunnable::SingleCall ToolRunnable::parseSingleCall(const JsonValue& input) {
  SingleCall result;

  if (!input.isObject()) {
    return result;
  }

  // Get name (required)
  if (input.contains("name") && input["name"].isString()) {
    result.name = input["name"].getString();
    result.valid = true;
  } else {
    return result;
  }

  // Get id (optional)
  if (input.contains("id") && input["id"].isString()) {
    result.id = input["id"].getString();
  }

  // Get arguments (optional, default to empty object)
  if (input.contains("arguments")) {
    result.arguments = input["arguments"];
  } else {
    result.arguments = JsonValue::object();
  }

  return result;
}

std::vector<ToolCall> ToolRunnable::parseMultipleCalls(const JsonValue& input) {
  std::vector<ToolCall> calls;

  if (!input.isObject() || !input.contains("tool_calls") ||
      !input["tool_calls"].isArray()) {
    return calls;
  }

  const auto& calls_array = input["tool_calls"];
  for (size_t i = 0; i < calls_array.size(); ++i) {
    const auto& call_obj = calls_array[i];
    if (!call_obj.isObject()) {
      continue;
    }

    ToolCall call;

    // Get name (required)
    if (!call_obj.contains("name") || !call_obj["name"].isString()) {
      continue;
    }
    call.name = call_obj["name"].getString();

    // Get id (optional, generate if missing)
    if (call_obj.contains("id") && call_obj["id"].isString()) {
      call.id = call_obj["id"].getString();
    } else {
      call.id = "call_" + std::to_string(i);
    }

    // Get arguments
    if (call_obj.contains("arguments")) {
      call.arguments = call_obj["arguments"];
    } else {
      call.arguments = JsonValue::object();
    }

    calls.push_back(std::move(call));
  }

  return calls;
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
