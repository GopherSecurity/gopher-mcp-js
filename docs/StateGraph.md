# StateGraph Guide

StateGraph provides LangGraph-style stateful workflows with conditional edges. It implements the Pregel model (Bulk Synchronous Parallel) for deterministic, reproducible execution.

## Overview

StateGraph enables:
- **Stateful execution** - Maintain state across nodes
- **Conditional transitions** - Branch based on state
- **Cyclic workflows** - Loops and iterations
- **Composable nodes** - Any Runnable can be a node

## Quick Start

```cpp
#include "gopher/orch/graph/state_graph.h"

using namespace gopher::orch::graph;

// Define graph
StateGraph graph;
graph
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addEdge(StateGraph::START(), "agent")
    .addConditionalEdge("agent", [](const GraphState& state) {
        if (state.get("should_continue").getBool()) {
            return "tools";
        }
        return StateGraph::END();
    })
    .addEdge("tools", "agent");

// Compile and execute
auto compiled = graph.compile();
compiled->invoke(initialState, config, dispatcher, callback);
```

## GraphState

State is stored as a JSON-like key-value structure:

```cpp
GraphState state;

// Set values
state.set("messages", JsonValue::array());
state.set("step_count", 0);
state.set("status", "running");

// Get values
auto messages = state.get("messages");
auto count = state.get("step_count").getInt();

// Convert to/from JSON
JsonValue json = state.toJson();
GraphState restored = GraphState::fromJson(json);
```

## Adding Nodes

### Synchronous Lambda

```cpp
graph.addNode("increment", [](const GraphState& state) {
    GraphState result = state;
    int count = state.get("count").getInt();
    result.set("count", count + 1);
    return result;
});
```

### Async Lambda

```cpp
graph.addNodeAsync("fetch", [](const GraphState& state,
                               const RunnableConfig& config,
                               Dispatcher& dispatcher,
                               GraphStateCallback callback) {
    // Perform async operation
    fetchData(state.get("url").getString(), dispatcher,
        [state, callback = std::move(callback)](Result<JsonValue> result) {
            if (mcp::holds_alternative<Error>(result)) {
                callback(Result<GraphState>(mcp::get<Error>(result)));
                return;
            }
            GraphState newState = state;
            newState.set("data", mcp::get<JsonValue>(result));
            callback(makeSuccess(std::move(newState)));
        });
});
```

### JsonRunnable Node

```cpp
// Any JsonRunnable can be a node
auto llmRunnable = makeLLMRunnable(provider, config);
graph.addNode("llm", llmRunnable);

// The runnable receives state as JSON, returns updates
// Output keys are merged into state
```

## Adding Edges

### Direct Edges

Always transition from one node to another:

```cpp
graph.addEdge("start", "process");  // start -> process
graph.addEdge("process", "end");    // process -> end
```

### Conditional Edges

Transition based on state evaluation:

```cpp
graph.addConditionalEdge("agent", [](const GraphState& state) -> std::string {
    auto action = state.get("action").getString();

    if (action == "search") return "search_node";
    if (action == "calculate") return "calc_node";
    if (action == "done") return StateGraph::END();

    return "error_node";  // Default
});
```

### Special Nodes

```cpp
// START - entry point (implicit)
graph.addEdge(StateGraph::START(), "first_node");

// END - terminates execution
graph.addEdge("last_node", StateGraph::END());
```

## Execution Model

StateGraph uses the **Pregel model**:

1. **PLAN** - Determine which nodes can execute
2. **EXECUTE** - Run scheduled nodes in parallel
3. **UPDATE** - Apply state changes atomically
4. **REPEAT** - Continue until END is reached

```
┌─────────────────────────────────────────┐
│              Execution Loop              │
├─────────────────────────────────────────┤
│  1. PLAN: Find ready nodes              │
│     - Check edges from current position │
│     - Evaluate conditional edges        │
│                                         │
│  2. EXECUTE: Run nodes                  │
│     - Execute node functions            │
│     - Collect state updates             │
│                                         │
│  3. UPDATE: Merge state                 │
│     - Apply updates atomically          │
│     - Determine next nodes              │
│                                         │
│  4. Check: END reached?                 │
│     - Yes: Return final state           │
│     - No: Loop to step 1                │
└─────────────────────────────────────────┘
```

## ReAct Agent Example

Build a reasoning agent with tool usage:

```cpp
StateGraph graph;

// Agent node - decides what to do
graph.addNode("agent", [&llm](const GraphState& state) {
    // Call LLM with messages
    auto response = llm->chat(state.get("messages"));

    GraphState result = state;
    auto messages = state.get("messages");
    messages.push_back(response.message.toJson());
    result.set("messages", messages);

    // Check if agent wants to use tools
    if (response.hasToolCalls()) {
        result.set("tool_calls", response.toolCallsJson());
        result.set("should_continue", true);
    } else {
        result.set("should_continue", false);
    }

    return result;
});

// Tools node - executes tool calls
graph.addNode("tools", [&executor](const GraphState& state) {
    auto calls = state.get("tool_calls");
    auto results = executor->execute(calls);

    GraphState result = state;
    auto messages = state.get("messages");
    for (auto& r : results) {
        messages.push_back(r.toJson());
    }
    result.set("messages", messages);
    result.set("tool_calls", JsonValue::null());

    return result;
});

// Wire up the graph
graph.addEdge(StateGraph::START(), "agent")
     .addConditionalEdge("agent", [](const GraphState& s) {
         return s.get("should_continue").getBool() ? "tools" : StateGraph::END();
     })
     .addEdge("tools", "agent");

// Compile and run
auto agent = graph.compile();
```

## Compiled Graph

The compiled graph is a `Runnable<JsonValue, JsonValue>`:

```cpp
auto compiled = graph.compile();

// It's just a Runnable - compose it!
auto withTimeout = withTimeout(compiled, 60000);
auto withRetry = withRetry(compiled, RetryPolicy::exponential(3));

// Or put it in a sequence
auto pipeline = sequence()
    .add(prepareInput)
    .add(compiled)
    .add(formatOutput)
    .build();
```

## State Reducers

For custom state merging logic (like LangGraph's `add_messages`):

```cpp
// Define custom state with reducer
struct AgentState {
    std::vector<Message> messages;  // APPEND semantics
    int step_count;                 // LAST_WRITE_WINS
    Usage total_usage;              // ACCUMULATE

    // Reducer merges updates into current state
    static AgentState reduce(const AgentState& current,
                             const AgentState& update) {
        AgentState result;

        // APPEND: messages
        result.messages = current.messages;
        for (const auto& msg : update.messages) {
            result.messages.push_back(msg);
        }

        // LAST_WRITE_WINS: step_count
        result.step_count = update.step_count;

        // ACCUMULATE: usage
        result.total_usage.prompt_tokens =
            current.total_usage.prompt_tokens + update.total_usage.prompt_tokens;

        return result;
    }
};
```

## Best Practices

1. **Keep nodes focused** - Each node should do one thing
2. **Use meaningful node names** - Helps with debugging and tracing
3. **Handle errors in nodes** - Return errors via callback
4. **Avoid shared mutable state** - Let the graph manage state
5. **Test nodes independently** - Unit test before composing
6. **Set max iterations** - Prevent infinite loops

## Debugging

```cpp
// Enable step callbacks
auto compiled = graph.compile();
compiled->setStepCallback([](const std::string& node, const GraphState& state) {
    std::cout << "Executed node: " << node << std::endl;
    std::cout << "State: " << state.toJson().toString() << std::endl;
});
```

## See Also

- [Runnable Interface](Runnable.md) - Core interface
- [Agent Framework](Agent.md) - ReAct agents with tools
- [Composition Patterns](Composition.md) - Sequence, Parallel, Router
