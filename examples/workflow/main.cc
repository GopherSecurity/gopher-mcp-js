// StateGraph Workflow Example
//
// Demonstrates a document processing workflow using StateGraph.
// Shows conditional branching, node execution, and state management.

#include "gopher/orch/orch.h"

#include <iostream>
#include <string>

using namespace gopher::orch;
using namespace gopher::orch::graph;
using namespace gopher::orch::core;

// Document processing state
struct DocumentState {
  std::string content;
  std::string classification;  // "technical", "legal", "general"
  std::string summary;
  std::vector<std::string> keywords;
  bool needs_review = false;
  int word_count = 0;

  // Merge function for state updates
  static DocumentState merge(const DocumentState& base,
                             const DocumentState& update) {
    DocumentState result = base;
    if (!update.content.empty()) result.content = update.content;
    if (!update.classification.empty())
      result.classification = update.classification;
    if (!update.summary.empty()) result.summary = update.summary;
    if (!update.keywords.empty()) result.keywords = update.keywords;
    if (update.needs_review) result.needs_review = update.needs_review;
    if (update.word_count > 0) result.word_count = update.word_count;
    return result;
  }
};

// Count words in document
DocumentState countWords(const DocumentState& state, Dispatcher& d) {
  DocumentState update;
  int count = 0;
  bool in_word = false;
  for (char c : state.content) {
    if (std::isspace(c)) {
      in_word = false;
    } else if (!in_word) {
      in_word = true;
      count++;
    }
  }
  update.word_count = count;
  return update;
}

// Classify document based on content
DocumentState classifyDocument(const DocumentState& state, Dispatcher& d) {
  DocumentState update;

  // Simple keyword-based classification
  const std::string& content = state.content;
  if (content.find("API") != std::string::npos ||
      content.find("function") != std::string::npos ||
      content.find("code") != std::string::npos) {
    update.classification = "technical";
  } else if (content.find("agreement") != std::string::npos ||
             content.find("contract") != std::string::npos ||
             content.find("liability") != std::string::npos) {
    update.classification = "legal";
    update.needs_review = true;  // Legal docs need review
  } else {
    update.classification = "general";
  }

  return update;
}

// Generate summary for technical documents
DocumentState summarizeTechnical(const DocumentState& state, Dispatcher& d) {
  DocumentState update;
  update.summary = "Technical document summary: " +
                   state.content.substr(0, std::min(size_t(50), state.content.size())) +
                   "...";
  update.keywords = {"technical", "documentation", "API"};
  return update;
}

// Generate summary for legal documents
DocumentState summarizeLegal(const DocumentState& state, Dispatcher& d) {
  DocumentState update;
  update.summary = "Legal document summary: " +
                   state.content.substr(0, std::min(size_t(50), state.content.size())) +
                   "...";
  update.keywords = {"legal", "contract", "agreement"};
  return update;
}

// Generate summary for general documents
DocumentState summarizeGeneral(const DocumentState& state, Dispatcher& d) {
  DocumentState update;
  update.summary = "General document summary: " +
                   state.content.substr(0, std::min(size_t(50), state.content.size())) +
                   "...";
  update.keywords = {"general", "document"};
  return update;
}

// Finalize processing
DocumentState finalize(const DocumentState& state, Dispatcher& d) {
  // No state changes, just a pass-through node
  return DocumentState();
}

// Router function for conditional branching
std::string routeByClassification(const DocumentState& state) {
  if (state.classification == "technical") {
    return "summarize_technical";
  } else if (state.classification == "legal") {
    return "summarize_legal";
  } else {
    return "summarize_general";
  }
}

int main() {
  auto dispatcher = mcp::event::createLibeventDispatcher();

  // =========================================================================
  // Build StateGraph for document processing
  // =========================================================================
  //
  // Workflow structure:
  //   START -> count_words -> classify -> [conditional branch]
  //                                            |
  //                          +-----------------+------------------+
  //                          |                 |                  |
  //                    technical            legal             general
  //                          |                 |                  |
  //                    summarize_tech    summarize_legal    summarize_general
  //                          |                 |                  |
  //                          +-----------------+------------------+
  //                                            |
  //                                        finalize -> END

  auto graph = StateGraphBuilder<DocumentState>()
      .addNode("count_words", countWords)
      .addNode("classify", classifyDocument)
      .addNode("summarize_technical", summarizeTechnical)
      .addNode("summarize_legal", summarizeLegal)
      .addNode("summarize_general", summarizeGeneral)
      .addNode("finalize", finalize)
      // Define edges
      .addEdge(START, "count_words")
      .addEdge("count_words", "classify")
      // Conditional routing based on classification
      .addConditionalEdge("classify", routeByClassification, {
          {"summarize_technical", "summarize_technical"},
          {"summarize_legal", "summarize_legal"},
          {"summarize_general", "summarize_general"}
      })
      // All summarization nodes lead to finalize
      .addEdge("summarize_technical", "finalize")
      .addEdge("summarize_legal", "finalize")
      .addEdge("summarize_general", "finalize")
      .addEdge("finalize", END)
      .compile();

  // =========================================================================
  // Process sample documents
  // =========================================================================

  std::vector<std::string> documents = {
      "This API function returns a JSON response with the user data.",
      "This agreement constitutes the entire contract between parties.",
      "The weather today is sunny with a high of 75 degrees.",
  };

  for (size_t i = 0; i < documents.size(); i++) {
    std::cout << "\n========================================\n";
    std::cout << "Document " << (i + 1) << ":\n";
    std::cout << "\"" << documents[i] << "\"\n";
    std::cout << "----------------------------------------\n";

    // Create initial state
    DocumentState initial;
    initial.content = documents[i];

    bool done = false;
    graph->invoke(
        initial,
        RunnableConfig(),
        *dispatcher,
        [&done](Result<DocumentState> result) {
          if (mcp::holds_alternative<Error>(result)) {
            std::cerr << "Error: " << mcp::get<Error>(result).message << "\n";
          } else {
            const auto& state = mcp::get<DocumentState>(result);
            std::cout << "Classification: " << state.classification << "\n";
            std::cout << "Word count: " << state.word_count << "\n";
            std::cout << "Summary: " << state.summary << "\n";
            std::cout << "Keywords: ";
            for (size_t j = 0; j < state.keywords.size(); j++) {
              if (j > 0) std::cout << ", ";
              std::cout << state.keywords[j];
            }
            std::cout << "\n";
            if (state.needs_review) {
              std::cout << "*** Flagged for review ***\n";
            }
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  std::cout << "\n========================================\n";
  std::cout << "All documents processed.\n";

  return 0;
}
