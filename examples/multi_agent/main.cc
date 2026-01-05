// Multi-Agent Coordination Example
//
// Demonstrates multiple specialized agents working together:
// - Researcher agent: Gathers information
// - Analyzer agent: Analyzes data
// - Writer agent: Generates reports
// - Coordinator: Orchestrates the workflow

#include <iostream>
#include <string>

#include "gopher/orch/orch.h"

using namespace gopher::orch;
using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// Agent task result
struct AgentResult {
  std::string agent_name;
  std::string output;
  int tokens_used;
};

// Create a specialized agent with specific tools and prompt
AgentRunnablePtr createSpecializedAgent(LLMProviderPtr provider,
                                        const std::string& name,
                                        const std::string& system_prompt,
                                        ToolRegistryPtr tools) {
  return AgentRunnable::create(provider, makeToolExecutor(tools),
                               AgentConfig("gpt-4")
                                   .withSystemPrompt(system_prompt)
                                   .withMaxIterations(3));
}

int main() {
  const char* api_key = std::getenv("OPENAI_API_KEY");
  if (!api_key) {
    std::cerr << "Error: OPENAI_API_KEY environment variable not set\n";
    return 1;
  }

  auto dispatcher = mcp::event::createLibeventDispatcher();
  auto provider = makeOpenAIProvider(api_key, "gpt-4");

  std::cout << "Multi-Agent Coordination Demo\n";
  std::cout << "========================================\n\n";

  // =========================================================================
  // Create specialized agents with their tools
  // =========================================================================

  // 1. Researcher Agent - gathers information
  auto researchTools = makeToolRegistry();
  researchTools->addSyncTool(
      "search_web",
      "Search the web for information. Input: {\"query\": \"...\"}",
      JsonValue::object(), [](const JsonValue& args) -> Result<JsonValue> {
        auto query = args["query"].getString();
        JsonValue results = JsonValue::object();
        results["query"] = query;
        results["findings"] = JsonValue::array({
            JsonValue("Finding 1: " + query + " shows positive trends"),
            JsonValue("Finding 2: Market data indicates growth"),
            JsonValue("Finding 3: Expert opinions are mixed"),
        });
        return makeSuccess(std::move(results));
      });

  researchTools->addSyncTool(
      "fetch_data", "Fetch data from a source. Input: {\"source\": \"...\"}",
      JsonValue::object(), [](const JsonValue& args) -> Result<JsonValue> {
        auto source = args["source"].getString();
        JsonValue data = JsonValue::object();
        data["source"] = source;
        data["data"] = JsonValue::array({
            JsonValue(42.5),
            JsonValue(38.2),
            JsonValue(45.8),
            JsonValue(51.3),
        });
        return makeSuccess(std::move(data));
      });

  auto researcher = createSpecializedAgent(
      provider, "Researcher",
      "You are a research specialist. Your job is to gather information "
      "using search and data fetching tools. Be thorough and systematic.",
      researchTools);

  // 2. Analyzer Agent - analyzes data
  auto analyzerTools = makeToolRegistry();
  analyzerTools->addSyncTool(
      "calculate_stats",
      "Calculate statistics on data. Input: {\"values\": [...]}",
      JsonValue::object(), [](const JsonValue& args) -> Result<JsonValue> {
        auto& values = args["values"];
        double sum = 0;
        double min = 1e9, max = -1e9;
        int count = 0;

        for (size_t i = 0; i < values.size(); i++) {
          double val = values[i].getFloat();
          sum += val;
          if (val < min)
            min = val;
          if (val > max)
            max = val;
          count++;
        }

        JsonValue stats = JsonValue::object();
        stats["count"] = count;
        stats["sum"] = sum;
        stats["average"] = count > 0 ? sum / count : 0;
        stats["min"] = min;
        stats["max"] = max;
        return makeSuccess(std::move(stats));
      });

  analyzerTools->addSyncTool(
      "identify_trends", "Identify trends in data. Input: {\"data\": [...]}",
      JsonValue::object(), [](const JsonValue& args) -> Result<JsonValue> {
        JsonValue trends = JsonValue::object();
        trends["trend"] = "upward";
        trends["confidence"] = 0.85;
        trends["insight"] = "Data shows consistent growth pattern";
        return makeSuccess(std::move(trends));
      });

  auto analyzer = createSpecializedAgent(
      provider, "Analyzer",
      "You are a data analyst. Your job is to analyze data, calculate "
      "statistics, and identify trends. Provide clear insights.",
      analyzerTools);

  // 3. Writer Agent - generates reports
  auto writerTools = makeToolRegistry();
  writerTools->addSyncTool(
      "format_report",
      "Format content as a report. Input: {\"title\": \"...\", \"sections\": "
      "[...]}",
      JsonValue::object(), [](const JsonValue& args) -> Result<JsonValue> {
        std::string report = "# " + args["title"].getString() + "\n\n";
        auto& sections = args["sections"];
        for (size_t i = 0; i < sections.size(); i++) {
          report += "## Section " + std::to_string(i + 1) + "\n";
          report += sections[i].getString() + "\n\n";
        }
        JsonValue result = JsonValue::object();
        result["report"] = report;
        return makeSuccess(std::move(result));
      });

  auto writer = createSpecializedAgent(
      provider, "Writer",
      "You are a technical writer. Your job is to create clear, "
      "well-structured reports from research and analysis results.",
      writerTools);

  // =========================================================================
  // Orchestrate multi-agent workflow
  // =========================================================================

  std::string topic = "AI adoption trends in enterprise";

  std::cout << "Topic: " << topic << "\n";
  std::cout << "----------------------------------------\n\n";

  // Step 1: Research Phase
  std::cout << "[Phase 1] Research Agent gathering information...\n";
  JsonValue researchResult;
  {
    bool done = false;
    JsonValue input = JsonValue::object();
    input["query"] = "Research: " + topic;

    researcher->invoke(input, RunnableConfig(), *dispatcher,
                       [&done, &researchResult](Result<JsonValue> result) {
                         if (mcp::holds_alternative<Error>(result)) {
                           std::cerr << "Research failed: "
                                     << mcp::get<Error>(result).message << "\n";
                         } else {
                           researchResult = mcp::get<JsonValue>(result);
                           std::cout << "  Research complete.\n";
                         }
                         done = true;
                       });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  // Step 2: Analysis Phase
  std::cout << "\n[Phase 2] Analyzer Agent processing data...\n";
  JsonValue analysisResult;
  {
    bool done = false;
    JsonValue input = JsonValue::object();
    input["research"] = researchResult;
    input["query"] = "Analyze the research findings";

    analyzer->invoke(input, RunnableConfig(), *dispatcher,
                     [&done, &analysisResult](Result<JsonValue> result) {
                       if (mcp::holds_alternative<Error>(result)) {
                         std::cerr << "Analysis failed: "
                                   << mcp::get<Error>(result).message << "\n";
                       } else {
                         analysisResult = mcp::get<JsonValue>(result);
                         std::cout << "  Analysis complete.\n";
                       }
                       done = true;
                     });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  // Step 3: Writing Phase
  std::cout << "\n[Phase 3] Writer Agent generating report...\n";
  {
    bool done = false;
    JsonValue input = JsonValue::object();
    input["research"] = researchResult;
    input["analysis"] = analysisResult;
    input["query"] = "Create a report on: " + topic;

    writer->invoke(
        input, RunnableConfig(), *dispatcher,
        [&done](Result<JsonValue> result) {
          if (mcp::holds_alternative<Error>(result)) {
            std::cerr << "Writing failed: " << mcp::get<Error>(result).message
                      << "\n";
          } else {
            auto& output = mcp::get<JsonValue>(result);
            std::cout << "  Report generated.\n\n";
            std::cout << "========================================\n";
            std::cout << "FINAL REPORT:\n";
            std::cout << "========================================\n";
            std::cout << output["response"].getString() << "\n";
          }
          done = true;
        });

    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  std::cout << "\n========================================\n";
  std::cout << "Multi-agent workflow complete.\n";

  return 0;
}
