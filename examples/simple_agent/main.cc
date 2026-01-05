// Simple ReAct Agent Example
//
// Demonstrates a basic AI agent that uses tools to answer questions.
// The agent reasons about which tools to use and iterates until done.

#include "gopher/orch/orch.h"

#include <iostream>

using namespace gopher::orch;
using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

int main(int argc, char* argv[]) {
  // Check for API key
  const char* api_key = std::getenv("OPENAI_API_KEY");
  if (!api_key) {
    std::cerr << "Error: OPENAI_API_KEY environment variable not set\n";
    std::cerr << "Usage: OPENAI_API_KEY=sk-... ./simple_agent\n";
    return 1;
  }

  // Create event dispatcher
  auto dispatcher = mcp::event::createLibeventDispatcher();

  // =========================================================================
  // Step 1: Create LLM Provider
  // =========================================================================
  auto provider = makeOpenAIProvider(api_key, "gpt-4");

  // =========================================================================
  // Step 2: Create Tool Registry with tools
  // =========================================================================
  auto registry = makeToolRegistry();

  // Calculator tool - synchronous
  registry->addSyncTool(
      "calculator",
      "Perform mathematical calculations. Input: {\"expression\": \"2+2\"}",
      JsonValue::object({{"expression", "string"}}),
      [](const JsonValue& args) -> Result<JsonValue> {
        auto expr = args["expression"].getString();

        // Simple expression evaluator (demo only)
        double result = 0;
        if (expr == "2+2") result = 4;
        else if (expr == "10*5") result = 50;
        else if (expr == "100/4") result = 25;
        else {
          return makeOrchError<JsonValue>(
              OrchError::INVALID_ARGUMENT,
              "Cannot evaluate: " + expr);
        }

        JsonValue response = JsonValue::object();
        response["result"] = result;
        return makeSuccess(std::move(response));
      });

  // Weather tool - async (simulated)
  registry->addTool(
      "get_weather",
      "Get current weather for a city. Input: {\"city\": \"Tokyo\"}",
      JsonValue::object({{"city", "string"}}),
      [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
        auto city = args["city"].getString();

        // Simulate async API call
        d.post([city, cb = std::move(cb)]() {
          JsonValue weather = JsonValue::object();
          weather["city"] = city;
          weather["temperature"] = 72;
          weather["condition"] = "sunny";
          weather["humidity"] = 45;
          cb(makeSuccess(std::move(weather)));
        });
      });

  // Search tool - async (simulated)
  registry->addTool(
      "search",
      "Search the web for information. Input: {\"query\": \"...\"}",
      JsonValue::object({{"query", "string"}}),
      [](const JsonValue& args, Dispatcher& d, JsonCallback cb) {
        auto query = args["query"].getString();

        d.post([query, cb = std::move(cb)]() {
          JsonValue results = JsonValue::object();
          results["query"] = query;
          results["results"] = JsonValue::array({
              JsonValue("Result 1: " + query + " - relevant information..."),
              JsonValue("Result 2: More details about " + query),
          });
          cb(makeSuccess(std::move(results)));
        });
      });

  // =========================================================================
  // Step 3: Create Agent
  // =========================================================================
  auto agent = makeAgentRunnable(
      provider,
      registry,
      AgentConfig("gpt-4")
          .withSystemPrompt(
              "You are a helpful assistant with access to tools. "
              "Use the calculator for math, get_weather for weather info, "
              "and search for general questions. "
              "Always explain your reasoning.")
          .withMaxIterations(5));

  // Optional: Set step callback for observability
  agent->setStepCallback([](const AgentStep& step) {
    std::cout << "\n[Step " << step.step_number << "] ";
    if (step.llm_message.hasToolCalls()) {
      std::cout << "Calling tools: ";
      for (const auto& call : *step.llm_message.tool_calls) {
        std::cout << call.name << " ";
      }
    } else {
      std::cout << "Response ready";
    }
    std::cout << std::endl;
  });

  // =========================================================================
  // Step 4: Run Agent with a query
  // =========================================================================
  std::string query = "What's 10*5 and what's the weather in Tokyo?";
  if (argc > 1) {
    query = argv[1];
  }

  std::cout << "Query: " << query << "\n";
  std::cout << "----------------------------------------\n";

  bool done = false;
  agent->invoke(
      JsonValue(query),
      RunnableConfig(),
      *dispatcher,
      [&done](Result<JsonValue> result) {
        if (mcp::holds_alternative<Error>(result)) {
          std::cerr << "Error: " << mcp::get<Error>(result).message << "\n";
        } else {
          auto& output = mcp::get<JsonValue>(result);
          std::cout << "\n========================================\n";
          std::cout << "Final Response:\n";
          std::cout << output["response"].getString() << "\n";
          std::cout << "----------------------------------------\n";
          std::cout << "Iterations: " << output["iterations"].getInt() << "\n";
          if (output.contains("usage")) {
            std::cout << "Total tokens: "
                      << output["usage"]["total_tokens"].getInt() << "\n";
          }
        }
        done = true;
      });

  // Run event loop until done
  while (!done) {
    dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
  }

  return 0;
}
