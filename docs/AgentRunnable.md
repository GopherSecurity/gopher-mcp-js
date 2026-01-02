# Agent-Runnable Integration Design

## Overview

This document describes how `Agent`, `Runnable`, and `LLM` components work together in gopher-orch, enabling seamless composition of AI agents with other workflow components.

The design is inspired by LangChain, LangGraph, and n8n patterns, adapted for C++ with async-first, dispatcher-based execution.

## Goals

1. **Composability**: Agents can be used anywhere a `Runnable` is expected
2. **Consistency**: Same patterns for LLM, Tools, and Agents
3. **Flexibility**: Support both direct Agent usage and Runnable composition
4. **Type Safety**: Leverage C++ templates while maintaining JSON interoperability

## Architecture

### Three-Level Runnable Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RUNNABLE LAYER                                     │
│                                                                             │
│  Level 3: Graph Runnables (Complex Workflows)                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  CompiledStateGraph                                                    │ │
│  │  (Nodes + Edges + State with Reducers)                                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│  Level 2: Composite Runnables (Composition Patterns)                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │  Sequence  │  │  Parallel  │  │   Router   │  │   AgentRunnable    │   │
│  │  (A→B→C)   │  │  (A|B|C)   │  │ (if/else)  │  │   (LLM↔Tools)     │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────────┘   │
│                                    │                                        │
│  Level 1: Primitive Runnables (Leaf Nodes)                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │   Lambda   │  │LLMRunnable │  │ToolRunnable│  │   Other Leaves     │   │
│  │ (function) │  │  (LLM API) │  │(tool exec) │  │                    │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────────┘   │
│                                                                             │
│  Foundation: Runnable<Input, Output>                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  invoke(input, config, dispatcher, callback)                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐      │
│    │ LLMProvider  │         │ToolRegistry  │         │ ToolExecutor │      │
│    │ (API calls)  │         │  (storage)   │         │ (execution)  │      │
│    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘      │
│           │                        │                        │              │
│           ▼                        └────────┬───────────────┘              │
│    ┌──────────────┐                         │                              │
│    │ LLMRunnable  │                         ▼                              │
│    │   (wrapper)  │                  ┌──────────────┐                      │
│    └──────┬───────┘                  │ ToolRunnable │                      │
│           │                          │   (wrapper)  │                      │
│           │                          └──────┬───────┘                      │
│           │                                 │                              │
│           └─────────────┬───────────────────┘                              │
│                         │                                                  │
│                         ▼                                                  │
│              ┌─────────────────────┐                                       │
│              │   AgentRunnable     │                                       │
│              │                     │                                       │
│              │  ┌───────────────┐  │                                       │
│              │  │  Agent Graph  │  │                                       │
│              │  │  (LLM↔Tools)  │  │                                       │
│              │  └───────────────┘  │                                       │
│              └──────────┬──────────┘                                       │
│                         │                                                  │
│                         ▼                                                  │
│              ┌─────────────────────┐                                       │
│              │  Runnable<Json,Json>│                                       │
│              │  (composable)       │                                       │
│              └─────────────────────┘                                       │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. LLMRunnable

Wraps `LLMProvider` as a `Runnable<JsonValue, JsonValue>`.

**Purpose**: Makes LLM calls composable with other Runnables.

**Header**: `include/gopher/orch/llm/llm_runnable.h`

```cpp
class LLMRunnable : public Runnable<JsonValue, JsonValue> {
 public:
  explicit LLMRunnable(LLMProviderPtr provider,
                       const LLMConfig& config = LLMConfig());

  std::string name() const override;

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override;

 private:
  LLMProviderPtr provider_;
  LLMConfig default_config_;
};
```

**Input Schema**:
```json
{
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "tools": [
    {"name": "search", "description": "...", "parameters": {...}}
  ],
  "config": {
    "temperature": 0.7,
    "max_tokens": 1000
  }
}
```

**Output Schema**:
```json
{
  "message": {
    "role": "assistant",
    "content": "Hi there!",
    "tool_calls": [
      {"id": "call_1", "name": "search", "arguments": {"query": "..."}}
    ]
  },
  "finish_reason": "tool_calls",
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 20,
    "total_tokens": 70
  }
}
```

### 2. ToolRunnable

Wraps `ToolExecutor` as a `Runnable<JsonValue, JsonValue>`.

**Purpose**: Makes tool execution composable, supports parallel tool calls.

**Header**: `include/gopher/orch/agent/tool_runnable.h`

```cpp
class ToolRunnable : public Runnable<JsonValue, JsonValue> {
 public:
  explicit ToolRunnable(ToolExecutorPtr executor);

  std::string name() const override;

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override;

 private:
  ToolExecutorPtr executor_;
};
```

**Input Schema** (single tool call):
```json
{
  "id": "call_123",
  "name": "search",
  "arguments": {"query": "weather in Tokyo"}
}
```

**Input Schema** (multiple tool calls - parallel execution):
```json
{
  "tool_calls": [
    {"id": "call_1", "name": "search", "arguments": {"query": "weather"}},
    {"id": "call_2", "name": "calculator", "arguments": {"expr": "2+2"}}
  ]
}
```

**Output Schema**:
```json
{
  "results": [
    {"id": "call_1", "result": {"temperature": 25}, "success": true},
    {"id": "call_2", "result": 4, "success": true}
  ]
}
```

### 3. AgentState

State container that flows through the agent graph, with reducer support.

**Header**: `include/gopher/orch/agent/agent_state.h`

```cpp
struct AgentState {
  std::vector<Message> messages;     // Conversation history
  int remaining_steps = 10;          // Iteration counter
  optional<Error> error;             // Error state

  // Reducer: merge state updates (messages are APPENDED)
  static AgentState reduce(const AgentState& current,
                           const AgentState& update);

  // Serialize to/from JSON for graph nodes
  JsonValue toJson() const;
  static AgentState fromJson(const JsonValue& json);
};
```

**Reducer Semantics**:
```cpp
// Messages use APPEND reducer (like LangGraph's add_messages)
AgentState AgentState::reduce(const AgentState& current,
                               const AgentState& update) {
  AgentState result;

  // Append new messages to existing
  result.messages = current.messages;
  for (const auto& msg : update.messages) {
    result.messages.push_back(msg);
  }

  // Other fields use last-write-wins
  result.remaining_steps = update.remaining_steps;
  result.error = update.error;

  return result;
}
```

### 4. AgentRunnable

The main integration point - wraps Agent functionality as a composable Runnable.

**Header**: `include/gopher/orch/agent/agent_runnable.h`

```cpp
class AgentRunnable : public Runnable<JsonValue, JsonValue> {
 public:
  using Ptr = std::shared_ptr<AgentRunnable>;

  // Factory methods
  static Ptr create(LLMProviderPtr provider,
                    ToolExecutorPtr tools,
                    const AgentConfig& config = AgentConfig());

  static Ptr create(LLMProviderPtr provider,
                    ToolRegistryPtr registry,
                    const AgentConfig& config = AgentConfig());

  std::string name() const override;

  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,
              Callback callback) override;

  // Accessors
  void setStepCallback(StepCallback callback);
  void setToolApprovalCallback(ToolApprovalCallback callback);

 private:
  // Internal graph nodes
  std::shared_ptr<LLMRunnable> llm_node_;
  std::shared_ptr<ToolRunnable> tool_node_;
  AgentConfig config_;

  // Graph execution
  void runLoop(AgentState& state,
               const RunnableConfig& config,
               Dispatcher& dispatcher,
               Callback callback);

  std::string shouldContinue(const AgentState& state);
};
```

**Input Schema**:
```json
{
  "query": "What is the weather in Tokyo?",
  "context": [
    {"role": "user", "content": "Previous message"}
  ],
  "config": {
    "max_iterations": 5
  }
}
```

Alternative input formats (auto-detected):
```json
// String input
"What is the weather?"

// LangGraph-style messages input
{
  "messages": [
    {"role": "user", "content": "What is the weather?"}
  ]
}
```

**Output Schema**:
```json
{
  "response": "The weather in Tokyo is 25°C and sunny.",
  "status": "completed",
  "iterations": 2,
  "messages": [...],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200
  },
  "duration_ms": 3500
}
```

## Agent Internal Graph Structure

AgentRunnable internally operates as a graph, following the LangGraph pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT INTERNAL GRAPH                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                                   INPUT
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │    Parse Input      │
                          │  (extract query,    │
                          │   context, config)  │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   Initialize State  │
                          │  AgentState {       │
                          │    messages: [...], │
                          │    remaining: 10    │
                          │  }                  │
                          └──────────┬──────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │                                             │
              │                    LOOP                     │
              │                                             │
              │     ┌─────────────────────────────────┐    │
              │     │         LLM Node                │    │
              │     │       (LLMRunnable)             │    │
              │     │                                 │    │
              │     │  Input:  state.messages         │    │
              │     │  Output: assistant message      │    │
              │     └────────────────┬────────────────┘    │
              │                      │                     │
              │                      ▼                     │
              │     ┌─────────────────────────────────┐    │
              │     │      should_continue()          │    │
              │     │                                 │    │
              │     │  - has_tool_calls? → "tools"   │    │
              │     │  - no_tool_calls? → "end"      │    │
              │     │  - max_iterations? → "end"     │    │
              │     └────────────────┬────────────────┘    │
              │                      │                     │
              │            ┌─────────┴─────────┐          │
              │            │                   │          │
              │            ▼                   ▼          │
              │     ┌─────────────┐     ┌───────────┐    │
              │     │ Tools Node  │     │    END    │────┼───► OUTPUT
              │     │(ToolRunnable│     └───────────┘    │
              │     │  parallel)  │                      │
              │     └──────┬──────┘                      │
              │            │                             │
              │            │ (append tool results        │
              │            │  to state.messages)         │
              │            │                             │
              │            └─────────────────────────────┘
              │                      │
              └──────────────────────┘
```

## Usage Examples

### Example 1: Direct AgentRunnable Usage

```cpp
#include "gopher/orch/agent/agent_runnable.h"

// Create components
auto provider = createOpenAIProvider("sk-...");
auto registry = makeToolRegistry();
registry->addTool("search", "Search the web", schema, searchHandler);

// Create agent runnable
auto agent = AgentRunnable::create(provider, registry,
    AgentConfig("gpt-4o").withMaxIterations(5));

// Invoke as Runnable
JsonValue input = JsonValue::object();
input["query"] = "What is the weather in Tokyo?";

agent->invoke(input, RunnableConfig(), dispatcher,
    [](Result<JsonValue> result) {
        if (isSuccess(result)) {
            std::cout << getValue(result)["response"].getString() << std::endl;
        }
    });
```

### Example 2: Agent in Sequence Pipeline

```cpp
#include "gopher/orch/composition/sequence.h"
#include "gopher/orch/agent/agent_runnable.h"

// Preprocessing: extract and validate query
auto preprocess = makeJsonLambda([](const JsonValue& input) {
    JsonValue output = JsonValue::object();
    output["query"] = sanitize(input["user_input"].getString());
    return makeSuccess(output);
}, "Preprocess");

// Postprocessing: format response
auto postprocess = makeJsonLambda([](const JsonValue& input) {
    JsonValue output = JsonValue::object();
    output["answer"] = input["response"];
    output["source"] = "AI Assistant";
    return makeSuccess(output);
}, "Postprocess");

// Build pipeline
auto pipeline = sequence("AgentPipeline")
    .add(preprocess)
    .add(AgentRunnable::create(provider, registry))
    .add(postprocess)
    .build();

// Execute
pipeline->invoke(userInput, config, dispatcher, callback);
```

### Example 3: Multi-Agent Router

```cpp
#include "gopher/orch/composition/router.h"
#include "gopher/orch/agent/agent_runnable.h"

// Different agents for different tasks
auto codeAgent = AgentRunnable::create(codeProvider, codeTools,
    AgentConfig("gpt-4o").withSystemPrompt("You are a coding assistant."));

auto researchAgent = AgentRunnable::create(researchProvider, searchTools,
    AgentConfig("gpt-4o").withSystemPrompt("You are a research assistant."));

auto generalAgent = AgentRunnable::create(provider, {},
    AgentConfig("gpt-4o"));

// Route based on query type
auto agentRouter = router<JsonValue, JsonValue>("AgentRouter")
    .when([](const JsonValue& in) {
        return in["query"].getString().find("code") != std::string::npos;
    }, codeAgent)
    .when([](const JsonValue& in) {
        return in["query"].getString().find("search") != std::string::npos;
    }, researchAgent)
    .otherwise(generalAgent)
    .build();

agentRouter->invoke(input, config, dispatcher, callback);
```

### Example 4: Agent in StateGraph Workflow

```cpp
#include "gopher/orch/graph/state_graph.h"
#include "gopher/orch/agent/agent_runnable.h"

// Build complex workflow
StateGraph workflow;

// Add nodes
workflow.addNode("classifier", makeJsonLambda([](const JsonValue& in) {
    // Classify the request
    JsonValue out = in;
    out["category"] = classify(in["query"].getString());
    return makeSuccess(out);
}, "Classifier"));

workflow.addNode("agent", AgentRunnable::create(provider, tools));

workflow.addNode("validator", makeJsonLambda([](const JsonValue& in) {
    // Validate agent response
    JsonValue out = in;
    out["valid"] = validate(in["response"].getString());
    return makeSuccess(out);
}, "Validator"));

// Add edges
workflow.setEntryPoint("classifier");
workflow.addConditionalEdge("classifier", [](const GraphState& s) {
    return s.get("category").getString() == "complex" ? "agent" : "end";
});
workflow.addEdge("agent", "validator");
workflow.addConditionalEdge("validator", [](const GraphState& s) {
    return s.get("valid").getBool() ? "end" : "agent";  // Retry if invalid
});

// Compile and run
auto compiled = workflow.compile();
compiled->invoke(input, config, dispatcher, callback);
```

### Example 5: Parallel Multi-Agent

```cpp
#include "gopher/orch/composition/parallel.h"
#include "gopher/orch/agent/agent_runnable.h"

// Run multiple specialized agents in parallel
auto multiAgent = parallel("MultiAgentResearch")
    .add("web_search", AgentRunnable::create(provider, webSearchTools))
    .add("academic", AgentRunnable::create(provider, academicTools))
    .add("news", AgentRunnable::create(provider, newsTools))
    .build();

// Result combines all agent outputs
// {"web_search": {...}, "academic": {...}, "news": {...}}
multiAgent->invoke(input, config, dispatcher, callback);
```

### Example 6: Agent with Resilience

```cpp
#include "gopher/orch/resilience/retry.h"
#include "gopher/orch/resilience/timeout.h"
#include "gopher/orch/agent/agent_runnable.h"

auto agent = AgentRunnable::create(provider, tools);

// Add timeout per invocation
auto timedAgent = Timeout<JsonValue, JsonValue>::create(
    agent,
    std::chrono::seconds(60)
);

// Add retry with exponential backoff
auto resilientAgent = Retry<JsonValue, JsonValue>::create(
    timedAgent,
    RetryPolicy::exponential(3, 1000)  // 3 attempts, 1s initial delay
);

resilientAgent->invoke(input, config, dispatcher, callback);
```

## File Structure

```
include/gopher/orch/
├── core/
│   ├── runnable.h              # Base Runnable<I,O> template
│   ├── lambda.h                # Lambda wrapper
│   ├── config.h                # RunnableConfig
│   └── types.h                 # Core types (Result, Error, etc.)
│
├── llm/
│   ├── llm_provider.h          # LLMProvider interface
│   ├── llm_types.h             # Message, ToolCall, LLMResponse
│   ├── llm_runnable.h          # NEW: LLMRunnable wrapper
│   ├── openai_provider.h       # OpenAI implementation
│   └── anthropic_provider.h    # Anthropic implementation
│
├── agent/
│   ├── agent.h                 # Agent interface (direct use)
│   ├── agent_types.h           # AgentConfig, AgentResult
│   ├── agent_state.h           # NEW: AgentState with reducers
│   ├── agent_runnable.h        # NEW: AgentRunnable (composable)
│   ├── tool_registry.h         # Tool storage
│   ├── tool_executor.h         # Tool execution
│   ├── tool_runnable.h         # NEW: ToolRunnable wrapper
│   └── tool_definition.h       # Tool types
│
├── composition/
│   ├── sequence.h              # Sequential composition
│   ├── parallel.h              # Parallel composition
│   └── router.h                # Conditional routing
│
├── resilience/
│   ├── retry.h                 # Retry wrapper
│   ├── timeout.h               # Timeout wrapper
│   ├── circuit_breaker.h       # Circuit breaker
│   └── fallback.h              # Fallback wrapper
│
└── graph/
    ├── state_graph.h           # StateGraph builder
    ├── graph_state.h           # GraphState container
    ├── graph_node.h            # Node types
    └── compiled_graph.h        # CompiledStateGraph
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Wrapper vs Inheritance | Wrapper (Option A) | C++ single inheritance, type safety, flexibility |
| State Management | AgentState with reducers | Enables parallel tools, clear message history |
| Input/Output Types | JsonValue | Flexible, interoperable with all components |
| Internal Structure | Graph-based | Matches LangGraph, enables complex flows |
| Tool Execution | Parallel by default | Performance, matches LLM batch tool calls |
| Error Handling | Result<T> monad | Consistent with codebase, explicit errors |
| Tool Execution Location | Internal (Option 1) | Simpler execution flow, no context switching |
| Connection Types | Optional enhancement | Useful for visual builders, not required initially |

## Learnings from n8n

n8n is a workflow automation platform with strong AI agent integration. Their architecture provides several patterns worth considering.

### 1. Typed Connection System

n8n uses `NodeConnectionTypes` to distinguish different connection semantics:

```typescript
NodeConnectionTypes = {
  AiAgent: 'ai_agent',
  AiLanguageModel: 'ai_languageModel',
  AiMemory: 'ai_memory',
  AiTool: 'ai_tool',
  AiOutputParser: 'ai_outputParser',
  Main: 'main',  // regular data flow
}
```

This allows nodes to have multiple typed input/output ports. An Agent node can accept:
- `AiLanguageModel` → the LLM connection
- `AiTool` → zero or more tool connections
- `AiMemory` → optional memory connection
- `Main` → trigger/data input

**Applicable to gopher-orch**: We could add connection type hints for visual graph builders:

```cpp
enum class ConnectionType {
  Main,      // Regular data flow
  Tool,      // Tool connection
  Memory,    // Memory/state connection
  LLM        // LLM provider connection
};

// Optional: typed edges in CompiledStateGraph
struct TypedEdge {
  std::string from_node;
  std::string to_node;
  ConnectionType type;
};
```

### 2. Engine Request/Response Pattern

n8n separates tool calls into a request-response cycle:

```
Agent Node                      Engine
    │                              │
    ├── LLM returns tool calls ───►│
    │◄── EngineRequest (pause) ────┤
    │                              │
    │   [Engine executes tool      │
    │    nodes in parallel]        │
    │                              │
    │◄── EngineResponse (resume) ──┤
    ├── Continue with results ────►│
```

**Key insight**: Tools execute *outside* the agent loop as independent nodes, enabling:
- **Tools as visual nodes** that can be connected in the UI
- **Parallel tool execution** at the engine level
- **Tool reusability** across different agents/workflows

**Design options for gopher-orch**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| Option 1 (Current) | Tools execute inside agent loop | Simpler, self-contained | Less visual, tools not reusable |
| Option 2 (n8n-style) | Agent yields tool requests | Visual composition, reusable tools | More complex, context switching |

**Recommendation**: Start with Option 1 (internal execution). Add Option 2 later for visual builder use cases:

```cpp
// Future: External tool execution mode
struct ToolRequest {
  std::string tool_name;
  JsonValue arguments;
  std::string call_id;
};

// Agent can optionally yield pending tool calls
enum class AgentYieldReason { ToolCalls, Complete, Error };

struct AgentYield {
  AgentYieldReason reason;
  std::vector<ToolRequest> pending_tools;  // If reason == ToolCalls
  JsonValue result;                         // If reason == Complete
};
```

### 3. RunnableSequence Composition

n8n uses LangChain's `RunnableSequence.from([...])` for composing agent internals:

```typescript
const runnableAgent = RunnableSequence.from([
  fallbackAgent ? agent.withFallbacks([fallbackAgent]) : agent,
  getAgentStepsParser(outputParser, memory),
  fixEmptyContentMessage,
]);
```

This validates our `Sequence<>` pattern for composing processing steps internally.

### 4. Batching and Fallback

n8n's `executeBatch` demonstrates:
- Batch processing multiple inputs through the same agent
- Built-in fallback model support
- `continueOnFail` error handling per item

**Applicable to gopher-orch**: Consider adding to AgentConfig:

```cpp
struct AgentConfig {
  // ... existing fields ...

  // Fallback support (inspired by n8n)
  LLMProviderPtr fallback_provider;

  // Batch processing
  int batch_size = 1;
  std::chrono::milliseconds delay_between_batches{0};
  bool continue_on_fail = false;
};
```

### 5. Versioned Node Types

n8n maintains backward compatibility via versioned implementations:

```typescript
nodeVersions = {
  1: new AgentV1(baseDescription),
  2: new AgentV2(baseDescription),
  3: new AgentV3(baseDescription),
}
```

**Applicable to gopher-orch**: For production, consider versioning:

```cpp
// Version in config
struct AgentConfig {
  int version = 1;  // For serialization compatibility
  // ...
};

// Or version in class name for breaking changes
class AgentRunnableV2 : public Runnable<JsonValue, JsonValue> { ... };
```

### 6. DirectedGraph Operations

n8n's `WorkflowExecute` uses `DirectedGraph.fromWorkflow(workflow)` for:
- Finding start nodes
- Detecting cycles (`handleCycles`)
- Partial execution (subgraph extraction)
- Dirty node tracking for re-execution

**Applicable to gopher-orch**: Our `CompiledStateGraph` should support:

```cpp
class CompiledStateGraph {
  // Existing
  void invoke(...);

  // Consider adding (inspired by n8n)
  std::vector<std::string> findStartNodes() const;
  bool hasCycles() const;
  CompiledStateGraph extractSubgraph(
      const std::string& from,
      const std::string& to) const;

  // Partial execution: re-run from a specific node
  void invokePartial(
      const std::string& start_node,
      const GraphState& existing_state,
      Dispatcher& dispatcher,
      Callback callback);
};
```

### Adoption Priority

| Pattern | Priority | Recommendation |
|---------|----------|----------------|
| Typed connections | Low | Add later for visual builders |
| External tool execution | Low | Start internal, add external mode later |
| RunnableSequence composition | Already done | Validates our Sequence pattern |
| Fallback model support | Medium | Add to AgentConfig |
| Batch processing | Medium | Add to AgentConfig |
| Versioning | Medium | Add version field for compatibility |
| Graph operations | Medium | Add partial execution support |

## Thread Safety

All components follow the dispatcher-based threading model:

1. **Invoke**: Called from dispatcher thread
2. **Callbacks**: Always invoked in dispatcher thread context
3. **State**: Not shared across threads; passed through callbacks
4. **Cancellation**: Atomic flag checked at safe points

```cpp
// Thread safety contract
class AgentRunnable : public Runnable<JsonValue, JsonValue> {
  // invoke() must be called from dispatcher thread
  // callback is always invoked in dispatcher thread
  void invoke(const JsonValue& input,
              const RunnableConfig& config,
              Dispatcher& dispatcher,  // All async work uses this
              Callback callback) override;
};
```

## References

- LangChain Runnable: `langchain-core/runnables/base.py`
- LangGraph Pregel: `langgraph/pregel/main.py`
- LangGraph create_react_agent: `langgraph/prebuilt/chat_agent_executor.py`
- n8n Agent Node: `packages/@n8n/nodes-langchain/nodes/agents/Agent/`
- n8n ToolsAgent Execute: `nodes/agents/Agent/agents/ToolsAgent/V3/execute.ts`
- n8n NodeConnectionTypes: `packages/workflow/src/interfaces.ts:2169`
- n8n WorkflowExecute: `packages/core/src/execution-engine/workflow-execute.ts`
- gopher-orch Runnable: `include/gopher/orch/core/runnable.h`
- gopher-orch Agent: `include/gopher/orch/agent/agent.h`
