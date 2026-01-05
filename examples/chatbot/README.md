# Multi-turn Conversational Agent Example

A chatbot that maintains conversation history and can use tools across multiple turns.

## What This Example Shows

- Maintaining conversation context across turns
- Building input with message history
- Using tools within conversation flow
- Interactive REPL-style interface
- Conversation reset functionality

## Running

```bash
# Build
cd build
make chatbot

# Run (requires OpenAI API key)
OPENAI_API_KEY=sk-... ./bin/chatbot
```

## Expected Output

```
Chatbot ready! Type 'quit' to exit, 'reset' to clear history.
========================================

You: Hello!
Assistant: Hi there! How can I help you today?

You: What time is it?

Assistant: Let me check the time for you.

[Calling tool: get_time]

The current time is 2:30 PM. Is there anything else you would like to know?

You: Remember that my favorite color is blue

Assistant: [Calling tool: remember]

I have noted that your favorite color is blue. I will remember this for our conversation.

You: reset
Conversation reset.

You: quit

Goodbye!
```

## Code Walkthrough

### 1. Chatbot Class
```cpp
class Chatbot {
 public:
  Chatbot(LLMProviderPtr provider, ToolRegistryPtr registry);
  void chat(const std::string& user_message,
            Dispatcher& dispatcher,
            std::function<void(std::string)> on_response);
  void reset();
 private:
  std::vector<Message> conversation_;
};
```

### 2. Conversation Management
```cpp
// Add user message to history
conversation_.push_back(Message::user(user_message));

// Build context from history
JsonValue context = JsonValue::array();
for (const auto& msg : conversation_) {
  JsonValue msg_json = JsonValue::object();
  msg_json["role"] = roleToString(msg.role);
  msg_json["content"] = msg.content;
  context.push_back(msg_json);
}
```

### 3. Interactive Loop
```cpp
while (true) {
  std::getline(std::cin, line);
  if (line == "quit") break;
  if (line == "reset") {
    chatbot.reset();
    continue;
  }
  chatbot.chat(line, dispatcher, on_response);
}
```

## Key Concepts

- **Message History**: Stores all messages for context
- **System Message**: Initial prompt defining assistant behavior
- **Tool Integration**: Tools available across conversation turns
- **Reset**: Clears history while keeping system prompt

## See Also

- [Agent Framework](../../docs/Agent.md)
- [Simple Agent Example](../simple_agent/)
