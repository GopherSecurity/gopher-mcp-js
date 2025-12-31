# Agent Design Document

## Overview

The Agent module implements the ReAct (Reasoning + Acting) pattern for building AI agents that can use tools to accomplish tasks. The agent iteratively calls an LLM, executes requested tools, and feeds results back until the task is complete.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           ReActAgent                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        AgentConfig                           │   │
│  │  • system_prompt    • max_iterations    • timeout            │   │
│  │  • llm_config       • parallel_tool_calls                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │   LLMProvider   │  │   ToolRegistry  │  │   AgentState    │     │
│  │                 │  │                 │  │                 │     │
│  │ • chat()        │  │ • getToolSpecs()│  │ • messages      │     │
│  │ • toolCalls     │  │ • executeTool() │  │ • steps         │     │
│  └─────────────────┘  └─────────────────┘  │ • status        │     │
│                                             └─────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

## ReAct Loop Flow

```
                              ┌─────────────┐
                              │    Start    │
                              └──────┬──────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   Add user query to   │
                         │   message history     │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                ▼                │
                    │    ┌───────────────────────┐   │
                    │    │  Check iteration &    │   │
                    │    │  timeout limits       │   │
                    │    └───────────┬───────────┘   │
                    │                │               │
                    │         ┌──────┴──────┐       │
                    │         │  Exceeded?  │       │
                    │         └──────┬──────┘       │
                    │           Yes/ │ \No          │
                    │              /  │  \          │
                    │             ▼   │   ▼         │
                    │    ┌─────────┐  │  ┌─────────────────┐
                    │    │  FAIL   │  │  │   Call LLM      │
                    │    └─────────┘  │  │   with tools    │
                    │                 │  └────────┬────────┘
                    │                 │           │
                    │                 │           ▼
                    │                 │  ┌─────────────────┐
                    │                 │  │  Record step    │
                    │                 │  └────────┬────────┘
                    │                 │           │
                    │                 │           ▼
                    │                 │  ┌─────────────────┐
                    │                 │  │ Has tool calls? │
                    │                 │  └────────┬────────┘
                    │                 │      Yes/ │ \No
                    │                 │         /  │  \
                    │                 │        ▼   │   ▼
                    │                 │ ┌──────────┐│  ┌──────────┐
                    │                 │ │ Execute  ││  │ COMPLETE │
                    │                 │ │  tools   ││  └──────────┘
                    │                 │ └────┬─────┘│
                    │                 │      │      │
                    │                 │      ▼      │
                    │                 │ ┌──────────┐│
                    │                 │ │Add tool  ││
                    │                 │ │results to││
                    │                 │ │messages  ││
                    │                 │ └────┬─────┘│
                    │                 │      │      │
                    └─────────────────┼──────┘      │
                                      │             │
                                      └─────────────┘
                                         (loop)
```

## Core Components

### 1. AgentConfig

```cpp
struct AgentConfig {
  LLMConfig llm_config;           // Model settings
  std::string system_prompt;      // Agent behavior definition
  int max_iterations = 10;        // Prevent infinite loops
  optional<int> max_total_tokens; // Token budget
  std::chrono::milliseconds timeout{300000};  // 5 min default
  bool parallel_tool_calls = true;

  // Builder pattern
  AgentConfig& withModel(const std::string& model);
  AgentConfig& withSystemPrompt(const std::string& prompt);
  AgentConfig& withMaxIterations(int iterations);
  AgentConfig& withTemperature(double t);
};
```

### 2. AgentState

```cpp
enum class AgentStatus {
  IDLE,                    // Not started
  RUNNING,                 // Currently executing
  COMPLETED,               // Finished successfully
  FAILED,                  // Error occurred
  CANCELLED,               // Cancelled by user
  MAX_ITERATIONS_REACHED   // Hit iteration limit
};

struct AgentState {
  AgentStatus status;
  std::vector<Message> messages;   // Conversation history
  std::vector<AgentStep> steps;    // Execution steps
  int current_iteration;
  Usage total_usage;               // Token counts
  optional<Error> error;
};
```

### 3. AgentStep

```cpp
struct ToolExecution {
  std::string tool_name;
  std::string call_id;
  JsonValue input;
  JsonValue output;
  bool success;
  std::string error_message;
};

struct AgentStep {
  int step_number;
  Message llm_message;
  optional<Usage> llm_usage;
  std::vector<ToolExecution> tool_executions;
  std::chrono::milliseconds llm_duration;
};
```

### 4. Callbacks

```cpp
// Called when agent completes
using AgentCallback = std::function<void(Result<AgentResult>)>;

// Called after each step (for progress monitoring)
using StepCallback = std::function<void(const AgentStep&)>;

// Called before tool execution (can approve/reject)
using ToolApprovalCallback = std::function<bool(const ToolCall&)>;
```

## Detailed Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ReActAgent::run()                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Initialize State                                                          │
│    • status = RUNNING                                                        │
│    • Add context messages (if any)                                           │
│    • Add user query as USER message                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. executeLoop()                                                             │
│    • Check cancellation flag                                                 │
│    • Check iteration limit (current_iteration >= max_iterations)             │
│    • Check timeout (elapsed > config.timeout)                                │
│    • Increment current_iteration                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. callLLM()                                                                 │
│    • Build messages from state                                               │
│    • Get tool specs from registry                                            │
│    • Call provider->chat(messages, tools, config, dispatcher, callback)      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. On LLM Response                                                           │
│    • Create AgentStep with LLM message and usage                             │
│    • Record step (triggers step callback)                                    │
│    • Call handleLLMResponse()                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
              Has Tool Calls?                No Tool Calls
                         │                         │
                         ▼                         ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ 5a. executeToolCalls()          │  │ 5b. completeRun(COMPLETED)      │
│     • Check approval callback   │  │     • Set status                │
│     • Call registry.executeTool │  │     • Build AgentResult         │
│       for each tool             │  │     • Invoke completion callback│
│     • Collect results           │  └─────────────────────────────────┘
└─────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. handleToolResults()                                                       │
│    • Update last step with tool executions                                   │
│    • Add TOOL messages for each result                                       │
│    • Post to dispatcher: executeLoop() (continue loop)                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Example Usage

### Basic Agent

```cpp
#include "gopher/orch/agent/agent.h"
#include "gopher/orch/llm/openai_provider.h"

using namespace gopher::orch::agent;
using namespace gopher::orch::llm;

// Create provider
auto provider = createOpenAIProvider("sk-your-api-key");

// Create tool registry
auto registry = makeToolRegistry();

// Add a simple tool
JsonValue searchSchema = JsonValue::object();
searchSchema["type"] = "object";
JsonValue props = JsonValue::object();
JsonValue queryProp = JsonValue::object();
queryProp["type"] = "string";
props["query"] = queryProp;
searchSchema["properties"] = props;

registry->addSyncTool("search", "Search the web", searchSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        std::string query = args["query"].getString();
        // Perform search...
        JsonValue result = JsonValue::object();
        result["results"] = "Search results for: " + query;
        return Result<JsonValue>(result);
    });

// Configure agent
AgentConfig config("gpt-4");
config.withSystemPrompt("You are a helpful assistant with web search capability.")
      .withMaxIterations(5)
      .withTemperature(0.7);

// Create agent
auto agent = ReActAgent::create(provider, registry, config);

// Run agent
agent->run("What is the weather like in Tokyo today?", dispatcher,
    [](Result<AgentResult> result) {
        if (mcp::holds_alternative<AgentResult>(result)) {
            auto& agentResult = mcp::get<AgentResult>(result);
            std::cout << "Response: " << agentResult.response << std::endl;
            std::cout << "Steps: " << agentResult.iterationCount() << std::endl;
            std::cout << "Tokens: " << agentResult.total_usage.total_tokens << std::endl;
        } else {
            auto& error = mcp::get<Error>(result);
            std::cerr << "Agent failed: " << error.message << std::endl;
        }
    });
```

### Agent with Progress Monitoring

```cpp
auto agent = ReActAgent::create(provider, registry, config);

// Monitor each step
agent->setStepCallback([](const AgentStep& step) {
    std::cout << "Step " << step.step_number << ":" << std::endl;
    std::cout << "  LLM response: " << step.llm_message.content << std::endl;

    if (!step.tool_executions.empty()) {
        std::cout << "  Tool executions:" << std::endl;
        for (const auto& exec : step.tool_executions) {
            std::cout << "    - " << exec.tool_name
                      << (exec.success ? " (success)" : " (failed)")
                      << std::endl;
        }
    }
});

agent->run("Research the latest AI developments", dispatcher, callback);
```

### Agent with Tool Approval

```cpp
auto agent = ReActAgent::create(provider, registry, config);

// Require approval for dangerous tools
agent->setToolApprovalCallback([](const ToolCall& call) -> bool {
    if (call.name == "delete_file" || call.name == "execute_command") {
        std::cout << "Tool '" << call.name << "' requires approval." << std::endl;
        std::cout << "Arguments: " << call.arguments.toString() << std::endl;
        std::cout << "Approve? (y/n): ";

        std::string input;
        std::getline(std::cin, input);
        return input == "y" || input == "yes";
    }
    return true;  // Auto-approve other tools
});

agent->run("Clean up temp files", dispatcher, callback);
```

### Agent with Context

```cpp
// Provide conversation history
std::vector<Message> context = {
    Message::user("My name is Alice and I work at Acme Corp."),
    Message::assistant("Hello Alice! Nice to meet you. How can I help you today?")
};

agent->run("What company do I work at?", context, dispatcher,
    [](Result<AgentResult> result) {
        // Agent can access previous context
        // Response: "You work at Acme Corp."
    });
```

### Multiple Tools Agent

```cpp
auto registry = makeToolRegistry();

// Calculator tool
registry->addSyncTool("calculate", "Perform math calculations", calcSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        std::string expr = args["expression"].getString();
        // Evaluate expression...
        return Result<JsonValue>(JsonValue(42.0));
    });

// Weather tool
registry->addSyncTool("get_weather", "Get current weather", weatherSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        std::string city = args["city"].getString();
        JsonValue result = JsonValue::object();
        result["temperature"] = 72;
        result["condition"] = "sunny";
        return Result<JsonValue>(result);
    });

// Time tool
registry->addSyncTool("get_time", "Get current time", timeSchema,
    [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue result = JsonValue::object();
        result["time"] = "2:30 PM";
        result["timezone"] = "PST";
        return Result<JsonValue>(result);
    });

// Agent can now use all three tools
agent->run(
    "What's the weather in Seattle, what time is it there, and what is 15 * 7?",
    dispatcher, callback);
```

### Cancellation

```cpp
auto agent = ReActAgent::create(provider, registry, config);

// Start long-running task
agent->run("Analyze this large dataset...", dispatcher, callback);

// Cancel from another thread or timer
std::this_thread::sleep_for(std::chrono::seconds(30));
if (agent->isRunning()) {
    agent->cancel();
    // Callback will receive CANCELLED status
}
```

## Message Flow Example

```
User: "What's 25 * 4 and what's the weather in Paris?"

┌───────────────────────────────────────────────────────────────────────────┐
│ Iteration 1                                                                │
├───────────────────────────────────────────────────────────────────────────┤
│ Messages to LLM:                                                           │
│   [SYSTEM] You are a helpful assistant with tools.                         │
│   [USER] What's 25 * 4 and what's the weather in Paris?                    │
│                                                                            │
│ LLM Response:                                                              │
│   [ASSISTANT] I'll help you with both. Let me calculate and check weather. │
│   Tool calls:                                                              │
│     1. calculate({expression: "25 * 4"})                                   │
│     2. get_weather({city: "Paris"})                                        │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Tool Execution                                                             │
├───────────────────────────────────────────────────────────────────────────┤
│ calculate({expression: "25 * 4"}) → {result: 100}                          │
│ get_weather({city: "Paris"}) → {temp: 18, condition: "cloudy"}             │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Iteration 2                                                                │
├───────────────────────────────────────────────────────────────────────────┤
│ Messages to LLM:                                                           │
│   [SYSTEM] You are a helpful assistant with tools.                         │
│   [USER] What's 25 * 4 and what's the weather in Paris?                    │
│   [ASSISTANT] I'll help you with both...                                   │
│   [TOOL] call_1: {result: 100}                                             │
│   [TOOL] call_2: {temp: 18, condition: "cloudy"}                           │
│                                                                            │
│ LLM Response:                                                              │
│   [ASSISTANT] 25 × 4 = 100, and Paris is currently 18°C and cloudy.        │
│   (No tool calls - conversation complete)                                  │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            Agent COMPLETED
                    Response: "25 × 4 = 100, and Paris
                    is currently 18°C and cloudy."
```

## Error Handling

```cpp
namespace AgentError {
  enum : int {
    OK = 0,
    NO_PROVIDER = -200,      // No LLM provider configured
    NO_TOOLS = -201,         // No tools available
    MAX_ITERATIONS = -202,   // Hit iteration limit
    TIMEOUT = -203,          // Timeout exceeded
    TOOL_EXECUTION_FAILED = -204,
    LLM_ERROR = -205,        // LLM call failed
    CANCELLED = -206,        // User cancelled
    UNKNOWN = -299
  };
}

// Handle different outcomes
agent->run(query, dispatcher, [](Result<AgentResult> result) {
    if (mcp::holds_alternative<AgentResult>(result)) {
        auto& r = mcp::get<AgentResult>(result);
        switch (r.status) {
            case AgentStatus::COMPLETED:
                // Success
                break;
            case AgentStatus::MAX_ITERATIONS_REACHED:
                // Task too complex, consider breaking it down
                break;
            case AgentStatus::CANCELLED:
                // User cancelled
                break;
        }
    } else {
        auto& error = mcp::get<Error>(result);
        // Handle error based on code
    }
});
```

## Best Practices

1. **Set appropriate limits**: Configure `max_iterations` and `timeout` based on task complexity
2. **Use clear system prompts**: Guide the agent's behavior and tool usage
3. **Handle tool errors gracefully**: Tools should return meaningful error messages
4. **Monitor with step callbacks**: Track progress for long-running tasks
5. **Implement approval for sensitive tools**: Use `ToolApprovalCallback` for destructive operations
6. **Provide relevant context**: Include conversation history when continuity matters
