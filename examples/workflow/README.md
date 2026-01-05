# StateGraph Workflow Example

A document processing workflow demonstrating StateGraph with conditional branching.

## What This Example Shows

- Building a StateGraph with multiple nodes
- State merging with reducer functions
- Conditional edge routing
- Processing multiple documents through the workflow
- LangGraph-style graph compilation

## Running

```bash
# Build
cd build
make workflow

# Run
./bin/workflow
```

## Expected Output

```
========================================
Document 1:
"This API function returns a JSON response with the user data."
----------------------------------------
Classification: technical
Word count: 11
Summary: Technical document summary: This API function returns a JSON response...
Keywords: technical, documentation, API

========================================
Document 2:
"This agreement constitutes the entire contract between parties."
----------------------------------------
Classification: legal
Word count: 8
Summary: Legal document summary: This agreement constitutes the entire contract...
Keywords: legal, contract, agreement
*** Flagged for review ***

========================================
Document 3:
"The weather today is sunny with a high of 75 degrees."
----------------------------------------
Classification: general
Word count: 11
Summary: General document summary: The weather today is sunny with a high of 75...
Keywords: general, document

========================================
All documents processed.
```

## Workflow Structure

```
START -> count_words -> classify -> [conditional branch]
                                          |
                        +-----------------+------------------+
                        |                 |                  |
                  technical            legal             general
                        |                 |                  |
                  summarize_tech    summarize_legal    summarize_general
                        |                 |                  |
                        +-----------------+------------------+
                                          |
                                      finalize -> END
```

## Code Walkthrough

### 1. Define State Structure
```cpp
struct DocumentState {
  std::string content;
  std::string classification;
  std::string summary;
  std::vector<std::string> keywords;
  bool needs_review = false;
  int word_count = 0;

  static DocumentState merge(const DocumentState& base,
                             const DocumentState& update);
};
```

### 2. Define Node Functions
```cpp
DocumentState classifyDocument(const DocumentState& state, Dispatcher& d) {
  DocumentState update;
  // Classification logic...
  update.classification = "technical";
  return update;
}
```

### 3. Define Router Function
```cpp
std::string routeByClassification(const DocumentState& state) {
  if (state.classification == "technical") {
    return "summarize_technical";
  } else if (state.classification == "legal") {
    return "summarize_legal";
  }
  return "summarize_general";
}
```

### 4. Build Graph
```cpp
auto graph = StateGraphBuilder<DocumentState>()
    .addNode("classify", classifyDocument)
    .addNode("summarize_technical", summarizeTechnical)
    // ...more nodes...
    .addEdge(START, "classify")
    .addConditionalEdge("classify", routeByClassification, {
        {"summarize_technical", "summarize_technical"},
        {"summarize_legal", "summarize_legal"},
        {"summarize_general", "summarize_general"}
    })
    .compile();
```

### 5. Execute Workflow
```cpp
DocumentState initial;
initial.content = "Document content...";

graph->invoke(initial, config, dispatcher, [](Result<DocumentState> result) {
    const auto& state = mcp::get<DocumentState>(result);
    std::cout << "Classification: " << state.classification << "\n";
});
```

## Key Concepts

- **State**: Immutable data structure passed between nodes
- **Nodes**: Functions that transform state
- **Edges**: Define execution flow between nodes
- **Conditional Edges**: Route based on state values
- **Reducer**: Merges partial state updates

## See Also

- [StateGraph Guide](../../docs/StateGraph.md)
- [Runnable Interface](../../docs/Runnable.md)
