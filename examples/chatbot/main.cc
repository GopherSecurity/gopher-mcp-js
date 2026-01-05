// Multi-turn Conversational Agent Example
//
// Demonstrates a chatbot that maintains conversation history
// and can use tools across multiple turns.

#include <iostream>
#include <string>

#include "gopher/orch/orch.h"

using namespace gopher::orch;
using namespace gopher::orch::agent;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

class Chatbot {
 public:
  Chatbot(LLMProviderPtr provider, ToolRegistryPtr registry)
      : provider_(std::move(provider)), registry_(std::move(registry)) {
    // Initialize conversation with system message
    conversation_.push_back(
        Message::system("You are a helpful conversational assistant. "
                        "You can use tools when needed. "
                        "Remember context from previous messages."));
  }

  // Process a user message and return the response
  void chat(const std::string& user_message,
            Dispatcher& dispatcher,
            std::function<void(std::string)> on_response) {
    // Add user message to conversation
    conversation_.push_back(Message::user(user_message));

    // Create agent for this turn
    auto executor = makeToolExecutor(registry_);
    auto agent = AgentRunnable::create(
        provider_, executor, AgentConfig("gpt-4").withMaxIterations(5));

    // Build input with conversation context
    JsonValue input = JsonValue::object();
    JsonValue context = JsonValue::array();
    for (const auto& msg : conversation_) {
      JsonValue msg_json = JsonValue::object();
      msg_json["role"] = roleToString(msg.role);
      msg_json["content"] = msg.content;
      context.push_back(msg_json);
    }
    input["context"] = context;
    input["query"] = "";  // Query is already in context

    agent->invoke(
        input, RunnableConfig(), dispatcher,
        [this, on_response = std::move(on_response)](Result<JsonValue> result) {
          if (mcp::holds_alternative<Error>(result)) {
            on_response("Error: " + mcp::get<Error>(result).message);
            return;
          }

          auto& output = mcp::get<JsonValue>(result);
          std::string response = output["response"].getString();

          // Add assistant response to conversation history
          conversation_.push_back(Message::assistant(response));

          on_response(response);
        });
  }

  // Get conversation history
  const std::vector<Message>& history() const { return conversation_; }

  // Clear conversation (start fresh)
  void reset() {
    conversation_.clear();
    conversation_.push_back(
        Message::system("You are a helpful conversational assistant."));
  }

 private:
  LLMProviderPtr provider_;
  ToolRegistryPtr registry_;
  std::vector<Message> conversation_;
};

int main() {
  const char* api_key = std::getenv("OPENAI_API_KEY");
  if (!api_key) {
    std::cerr << "Error: OPENAI_API_KEY environment variable not set\n";
    return 1;
  }

  auto dispatcher = mcp::event::createLibeventDispatcher();

  // Create provider and registry
  auto provider = makeOpenAIProvider(api_key, "gpt-4");
  auto registry = makeToolRegistry();

  // Add some tools
  registry->addSyncTool(
      "remember", "Remember a fact for later. Input: {\"fact\": \"...\"}",
      JsonValue::object(), [](const JsonValue& args) -> Result<JsonValue> {
        // In real app, would store to memory
        return makeSuccess(
            JsonValue("Remembered: " + args["fact"].getString()));
      });

  registry->addSyncTool(
      "get_time", "Get current time", JsonValue::object(),
      [](const JsonValue&) -> Result<JsonValue> {
        return makeSuccess(JsonValue("Current time: 2:30 PM"));
      });

  // Create chatbot
  Chatbot chatbot(provider, registry);

  std::cout
      << "Chatbot ready! Type 'quit' to exit, 'reset' to clear history.\n";
  std::cout << "========================================\n\n";

  // Interactive loop
  std::string line;
  while (true) {
    std::cout << "You: ";
    std::getline(std::cin, line);

    if (line == "quit" || line == "exit") {
      break;
    }

    if (line == "reset") {
      chatbot.reset();
      std::cout << "Conversation reset.\n\n";
      continue;
    }

    if (line.empty()) {
      continue;
    }

    bool done = false;
    chatbot.chat(line, *dispatcher, [&done](std::string response) {
      std::cout << "\nAssistant: " << response << "\n\n";
      done = true;
    });

    // Run until response received
    while (!done) {
      dispatcher->run(mcp::event::Dispatcher::RunType::NonBlock);
    }
  }

  std::cout << "\nGoodbye!\n";
  return 0;
}
