# Simple ReAct Agent Example

A basic AI agent that uses tools to answer questions using the ReAct (Reasoning + Acting) pattern.

## What This Example Shows

- Creating an LLM provider (OpenAI)
- Registering tools (calculator, weather, search)
- Building an AgentRunnable
- Observing agent steps with callbacks
- Running the agent to completion

## Running

```bash
# Build
cd build
make simple_agent

# Run (requires OpenAI API key)
OPENAI_API_KEY=sk-... ./bin/simple_agent

# Custom query
OPENAI_API_KEY=sk-... ./bin/simple_agent "What's 100/4?"
```

## Expected Output

```
Query: What's 10*5 and what's the weather in Tokyo?
----------------------------------------

[Step 1] Calling tools: calculator get_weather

[Step 2] Response ready

========================================
Final Response:
The result of 10*5 is 50, and the weather in Tokyo is sunny with a
temperature of 72°F and 45% humidity.
----------------------------------------
Iterations: 2
Total tokens: 256
```

## Code Walkthrough

### 1. Create Provider
```cpp
auto provider = makeOpenAIProvider(api_key, "gpt-4");
```

### 2. Register Tools
```cpp
auto registry = makeToolRegistry();
registry->addSyncTool("calculator", ...);
registry->addTool("get_weather", ...);  // async
```

### 3. Create Agent
```cpp
auto agent = makeAgentRunnable(provider, registry, config);
```

### 4. Run
```cpp
agent->invoke(query, config, dispatcher, callback);
```

## See Also

- [Agent Framework](../../docs/Agent.md)
- [Tool Registry](../../docs/ToolRegistry.md)
