# Multi-Agent Coordination Example

Demonstrates multiple specialized agents working together on a complex task.

## What This Example Shows

- Creating specialized agents with different tools
- Sequential agent coordination
- Passing data between agents
- Building a research-analyze-write pipeline

## Running

```bash
# Build
cd build
make multi_agent

# Run (requires OpenAI API key)
OPENAI_API_KEY=sk-... ./bin/multi_agent
```

## Expected Output

```
Multi-Agent Coordination Demo
========================================

Topic: AI adoption trends in enterprise
----------------------------------------

[Phase 1] Research Agent gathering information...
  Research complete.

[Phase 2] Analyzer Agent processing data...
  Analysis complete.

[Phase 3] Writer Agent generating report...
  Report generated.

========================================
FINAL REPORT:
========================================
# AI Adoption Trends in Enterprise

Based on our research and analysis, here are the key findings...

========================================
Multi-agent workflow complete.
```

## Agent Architecture

```
                    ┌─────────────────┐
                    │   Coordinator   │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Researcher    │ │    Analyzer     │ │     Writer      │
│                 │ │                 │ │                 │
│ Tools:          │ │ Tools:          │ │ Tools:          │
│ - search_web    │ │ - calc_stats    │ │ - format_report │
│ - fetch_data    │ │ - id_trends     │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────► Data ─────┴───────► Output ───┘
```

## Code Walkthrough

### 1. Create Specialized Agent
```cpp
auto researcher = createSpecializedAgent(
    provider,
    "Researcher",
    "You are a research specialist. Your job is to gather information "
    "using search and data fetching tools.",
    researchTools);
```

### 2. Agent-Specific Tools
```cpp
auto researchTools = makeToolRegistry();
researchTools->addSyncTool(
    "search_web",
    "Search the web for information",
    JsonValue::object(),
    [](const JsonValue& args) -> Result<JsonValue> {
        // Search implementation
    });
```

### 3. Sequential Coordination
```cpp
// Phase 1: Research
researcher->invoke(researchQuery, config, dispatcher,
    [&researchResult](Result<JsonValue> result) {
        researchResult = mcp::get<JsonValue>(result);
    });

// Phase 2: Analysis (uses research results)
JsonValue analysisInput;
analysisInput["research"] = researchResult;
analyzer->invoke(analysisInput, config, dispatcher, callback);

// Phase 3: Writing (uses both research and analysis)
JsonValue writerInput;
writerInput["research"] = researchResult;
writerInput["analysis"] = analysisResult;
writer->invoke(writerInput, config, dispatcher, callback);
```

## Agent Roles

| Agent | Purpose | Tools |
|-------|---------|-------|
| Researcher | Gather information | search_web, fetch_data |
| Analyzer | Process and analyze data | calculate_stats, identify_trends |
| Writer | Generate reports | format_report |

## Coordination Patterns

### Sequential Pipeline
```
Researcher → Analyzer → Writer
```
Each agent receives output from previous agents.

### Parallel Execution (Alternative)
```cpp
// Run research and analysis in parallel
auto parallel = makeParallel({researcher, analyzer});
parallel->invoke(input, config, dispatcher, callback);
```

### Supervisor Pattern (Alternative)
```cpp
// Supervisor decides which agent to call
auto supervisor = makeSupervisorAgent(
    {researcher, analyzer, writer},
    supervisorPrompt);
```

## Key Concepts

- **Specialization**: Each agent has focused capabilities
- **Tool Isolation**: Agents only access their own tools
- **Data Flow**: Results passed between agents
- **Coordination**: Sequential or parallel execution

## See Also

- [Agent Framework](../../docs/Agent.md)
- [Composition Patterns](../../docs/Composition.md)
- [Simple Agent Example](../simple_agent/)
