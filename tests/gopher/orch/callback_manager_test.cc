// Unit tests for CallbackManager and CallbackHandler

#include "orch_test_fixture.h"

using namespace gopher::orch::callback;

// =============================================================================
// Test Helper: Recording callback handler
// =============================================================================

class RecordingHandler : public CallbackHandler {
 public:
  struct ChainEvent {
    std::string type;  // "start", "end", "error"
    std::string name;
    core::JsonValue data;
  };

  struct ToolEvent {
    std::string type;
    std::string tool_name;
    core::JsonValue data;
  };

  std::vector<ChainEvent> chain_events;
  std::vector<ToolEvent> tool_events;
  std::vector<std::pair<std::string, core::JsonValue>> custom_events;
  std::mutex mutex;

  void onChainStart(const RunInfo& info,
                    const core::JsonValue& input) override {
    std::lock_guard<std::mutex> lock(mutex);
    chain_events.push_back({"start", info.name, input});
  }

  void onChainEnd(const RunInfo& info, const core::JsonValue& output) override {
    std::lock_guard<std::mutex> lock(mutex);
    chain_events.push_back({"end", info.name, output});
  }

  void onChainError(const RunInfo& info, const core::Error& error) override {
    std::lock_guard<std::mutex> lock(mutex);
    core::JsonValue data = core::JsonValue::object();
    data["code"] = error.code;
    data["message"] = error.message;
    chain_events.push_back({"error", info.name, data});
  }

  void onToolStart(const RunInfo& info,
                   const std::string& tool_name,
                   const core::JsonValue& input) override {
    std::lock_guard<std::mutex> lock(mutex);
    (void)info;
    tool_events.push_back({"start", tool_name, input});
  }

  void onToolEnd(const RunInfo& info,
                 const std::string& tool_name,
                 const core::JsonValue& output) override {
    std::lock_guard<std::mutex> lock(mutex);
    (void)info;
    tool_events.push_back({"end", tool_name, output});
  }

  void onToolError(const RunInfo& info,
                   const std::string& tool_name,
                   const core::Error& error) override {
    std::lock_guard<std::mutex> lock(mutex);
    (void)info;
    core::JsonValue data = core::JsonValue::object();
    data["code"] = error.code;
    data["message"] = error.message;
    tool_events.push_back({"error", tool_name, data});
  }

  void onCustomEvent(const std::string& event_name,
                     const core::JsonValue& data) override {
    std::lock_guard<std::mutex> lock(mutex);
    custom_events.push_back({event_name, data});
  }
};

// =============================================================================
// CallbackHandler Tests
// =============================================================================

TEST_F(OrchTest, CallbackHandlerDefaultMethods) {
  // Default handler should not crash when methods are called
  CallbackHandler handler;
  RunInfo info;
  info.name = "test";
  core::JsonValue data = core::JsonValue::object();
  core::Error error(1, "test error");

  // These should all be no-ops
  handler.onChainStart(info, data);
  handler.onChainEnd(info, data);
  handler.onChainError(info, error);
  handler.onToolStart(info, "tool", data);
  handler.onToolEnd(info, "tool", data);
  handler.onToolError(info, "tool", error);
  handler.onCustomEvent("event", data);
  handler.onRetry(info, error, 1, 3);
}

TEST_F(OrchTest, NoOpCallbackHandler) {
  NoOpCallbackHandler handler;
  RunInfo info;
  core::JsonValue data = core::JsonValue::object();
  core::Error error(1, "test error");

  // Should compile and run without issues
  handler.onChainStart(info, data);
  handler.onChainEnd(info, data);
  handler.onChainError(info, error);
}

// =============================================================================
// CallbackManager Tests
// =============================================================================

TEST_F(OrchTest, CallbackManagerBasic) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);
  EXPECT_EQ(manager->handlerCount(), 1u);

  // Emit chain events
  core::JsonValue input = core::JsonValue::object();
  input["key"] = "value";

  auto run_info = manager->startChain("test_chain", input);
  EXPECT_FALSE(run_info.run_id.empty());
  EXPECT_EQ(run_info.name, "test_chain");
  EXPECT_EQ(run_info.run_type, "chain");

  core::JsonValue output = core::JsonValue::object();
  output["result"] = "success";
  manager->endChain(run_info, output);

  // Verify events were recorded
  EXPECT_EQ(handler->chain_events.size(), 2u);
  EXPECT_EQ(handler->chain_events[0].type, "start");
  EXPECT_EQ(handler->chain_events[0].name, "test_chain");
  EXPECT_EQ(handler->chain_events[1].type, "end");
  EXPECT_EQ(handler->chain_events[1].name, "test_chain");
}

TEST_F(OrchTest, CallbackManagerChainError) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  core::JsonValue input = core::JsonValue::object();
  auto run_info = manager->startChain("failing_chain", input);

  core::Error error(OrchError::INTERNAL_ERROR, "Something went wrong");
  manager->errorChain(run_info, error);

  EXPECT_EQ(handler->chain_events.size(), 2u);
  EXPECT_EQ(handler->chain_events[0].type, "start");
  EXPECT_EQ(handler->chain_events[1].type, "error");
  EXPECT_EQ(handler->chain_events[1].data["code"].getInt(),
            OrchError::INTERNAL_ERROR);
}

TEST_F(OrchTest, CallbackManagerToolEvents) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  core::JsonValue input = core::JsonValue::object();
  input["arg"] = "test";

  auto run_info = manager->startTool("my_tool", input);
  EXPECT_EQ(run_info.run_type, "tool");

  core::JsonValue output = core::JsonValue::object();
  output["result"] = 42;
  manager->endTool(run_info, "my_tool", output);

  EXPECT_EQ(handler->tool_events.size(), 2u);
  EXPECT_EQ(handler->tool_events[0].type, "start");
  EXPECT_EQ(handler->tool_events[0].tool_name, "my_tool");
  EXPECT_EQ(handler->tool_events[1].type, "end");
  EXPECT_EQ(handler->tool_events[1].tool_name, "my_tool");
}

TEST_F(OrchTest, CallbackManagerCustomEvents) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  core::JsonValue data = core::JsonValue::object();
  data["fsm"] = "connection";
  data["from"] = "disconnected";
  data["to"] = "connecting";

  manager->emitCustomEvent("fsm.transition", data);

  EXPECT_EQ(handler->custom_events.size(), 1u);
  EXPECT_EQ(handler->custom_events[0].first, "fsm.transition");
  EXPECT_EQ(handler->custom_events[0].second["fsm"].getString(), "connection");
}

TEST_F(OrchTest, CallbackManagerMultipleHandlers) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler1 = std::make_shared<RecordingHandler>();
  auto handler2 = std::make_shared<RecordingHandler>();

  manager->addHandler(handler1);
  manager->addHandler(handler2);
  EXPECT_EQ(manager->handlerCount(), 2u);

  core::JsonValue input = core::JsonValue::object();
  auto run_info = manager->startChain("multi_handler_chain", input);
  manager->endChain(run_info, input);

  // Both handlers should have received the events
  EXPECT_EQ(handler1->chain_events.size(), 2u);
  EXPECT_EQ(handler2->chain_events.size(), 2u);
}

TEST_F(OrchTest, CallbackManagerRemoveHandler) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);
  EXPECT_EQ(manager->handlerCount(), 1u);

  manager->removeHandler(handler);
  EXPECT_EQ(manager->handlerCount(), 0u);

  // Events should not be received after removal
  core::JsonValue input = core::JsonValue::object();
  auto run_info = manager->startChain("after_removal", input);

  EXPECT_EQ(handler->chain_events.size(), 0u);
}

TEST_F(OrchTest, CallbackManagerClearHandlers) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler1 = std::make_shared<RecordingHandler>();
  auto handler2 = std::make_shared<RecordingHandler>();

  manager->addHandler(handler1);
  manager->addHandler(handler2);
  EXPECT_EQ(manager->handlerCount(), 2u);

  manager->clearHandlers();
  EXPECT_EQ(manager->handlerCount(), 0u);
}

TEST_F(OrchTest, CallbackManagerChildManager) {
  auto parent = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  parent->addHandler(handler);

  // Create child manager
  auto child = parent->child();

  // Child should inherit handlers
  EXPECT_EQ(child->handlerCount(), 1u);

  // Child should have parent_run_id set
  EXPECT_EQ(child->parentRunId(), parent->runId());

  // Events from child should be received
  core::JsonValue input = core::JsonValue::object();
  auto run_info = child->startChain("child_chain", input);

  EXPECT_EQ(handler->chain_events.size(), 1u);
  EXPECT_EQ(run_info.parent_run_id, parent->runId());
}

TEST_F(OrchTest, CallbackManagerTags) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);
  manager->addTags({"env:prod", "version:1.0"});

  core::JsonValue input = core::JsonValue::object();
  auto run_info = manager->startChain("tagged_chain", input, {"extra:tag"});

  // Should have both inheritable and provided tags
  EXPECT_EQ(run_info.tags.size(), 3u);
}

TEST_F(OrchTest, CallbackManagerMetadata) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);
  core::JsonValue user_id = core::JsonValue("user123");
  manager->addMetadata("user_id", user_id);

  core::JsonValue input = core::JsonValue::object();
  core::JsonValue extra_metadata = core::JsonValue::object();
  extra_metadata["request_id"] = "req456";

  auto run_info =
      manager->startChain("metadata_chain", input, {}, extra_metadata);

  // Should have merged metadata
  EXPECT_EQ(run_info.metadata["user_id"].getString(), "user123");
  EXPECT_EQ(run_info.metadata["request_id"].getString(), "req456");
}

// =============================================================================
// ChainGuard Tests
// =============================================================================

TEST_F(OrchTest, ChainGuardSuccess) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  {
    core::JsonValue input = core::JsonValue::object();
    ChainGuard guard(manager, "guarded_chain", input);

    // Simulate work...
    core::JsonValue output = core::JsonValue::object();
    output["status"] = "done";
    guard.setOutput(output);
  }

  EXPECT_EQ(handler->chain_events.size(), 2u);
  EXPECT_EQ(handler->chain_events[0].type, "start");
  EXPECT_EQ(handler->chain_events[1].type, "end");
}

TEST_F(OrchTest, ChainGuardError) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  {
    core::JsonValue input = core::JsonValue::object();
    ChainGuard guard(manager, "failing_guarded_chain", input);

    core::Error error(OrchError::INTERNAL_ERROR, "Failed");
    guard.setError(error);
  }

  EXPECT_EQ(handler->chain_events.size(), 2u);
  EXPECT_EQ(handler->chain_events[0].type, "start");
  EXPECT_EQ(handler->chain_events[1].type, "error");
}

TEST_F(OrchTest, ChainGuardAutoError) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  {
    core::JsonValue input = core::JsonValue::object();
    ChainGuard guard(manager, "unfinished_chain", input);
    // Guard goes out of scope without setOutput/setError
  }

  // Should automatically emit error
  EXPECT_EQ(handler->chain_events.size(), 2u);
  EXPECT_EQ(handler->chain_events[0].type, "start");
  EXPECT_EQ(handler->chain_events[1].type, "error");
}

// =============================================================================
// ToolGuard Tests
// =============================================================================

TEST_F(OrchTest, ToolGuardSuccess) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  {
    core::JsonValue input = core::JsonValue::object();
    ToolGuard guard(manager, "guarded_tool", input);

    core::JsonValue output = core::JsonValue::object();
    output["result"] = 42;
    guard.setOutput(output);
  }

  EXPECT_EQ(handler->tool_events.size(), 2u);
  EXPECT_EQ(handler->tool_events[0].type, "start");
  EXPECT_EQ(handler->tool_events[1].type, "end");
}

TEST_F(OrchTest, ToolGuardAutoError) {
  auto manager = std::make_shared<CallbackManager>();
  auto handler = std::make_shared<RecordingHandler>();

  manager->addHandler(handler);

  {
    core::JsonValue input = core::JsonValue::object();
    ToolGuard guard(manager, "unfinished_tool", input);
    // Guard goes out of scope without completion
  }

  EXPECT_EQ(handler->tool_events.size(), 2u);
  EXPECT_EQ(handler->tool_events[0].type, "start");
  EXPECT_EQ(handler->tool_events[1].type, "error");
}

// =============================================================================
// RunInfo Tests
// =============================================================================

TEST_F(OrchTest, RunInfoDuration) {
  RunInfo info;
  info.start_time = std::chrono::steady_clock::now();

  // Sleep a bit
  std::this_thread::sleep_for(std::chrono::milliseconds(10));

  auto duration = info.durationMs();
  EXPECT_GE(duration.count(), 10);
}

// =============================================================================
// LoggingCallbackHandler Tests
// =============================================================================

TEST_F(OrchTest, LoggingCallbackHandlerBasic) {
  // Just verify it doesn't crash
  LoggingCallbackHandler handler(LoggingCallbackHandler::LogLevel::DEBUG);

  RunInfo info;
  info.name = "test";
  info.start_time = std::chrono::steady_clock::now();

  core::JsonValue data = core::JsonValue::object();
  data["key"] = "value";

  handler.onChainStart(info, data);
  handler.onChainEnd(info, data);
  handler.onChainError(info, core::Error(1, "test error"));
  handler.onToolStart(info, "tool", data);
  handler.onToolEnd(info, "tool", data);
  handler.onToolError(info, "tool", core::Error(1, "test error"));
  handler.onCustomEvent("custom", data);
  handler.onRetry(info, core::Error(1, "retry error"), 1, 3);
}

// =============================================================================
// RunnableConfig Callbacks Integration Tests
// =============================================================================

TEST_F(OrchTest, RunnableConfigWithCallbacks) {
  auto manager = std::make_shared<CallbackManager>();

  RunnableConfig config;
  config.withCallbacks(manager);

  EXPECT_TRUE(config.hasCallbacks());
  EXPECT_EQ(config.callbacks(), manager);
}

TEST_F(OrchTest, RunnableConfigCallbacksInheritance) {
  auto manager = std::make_shared<CallbackManager>();

  RunnableConfig parent;
  parent.withCallbacks(manager);

  RunnableConfig child = parent.child();

  // Child should inherit callbacks
  EXPECT_TRUE(child.hasCallbacks());
  EXPECT_EQ(child.callbacks(), manager);
}

TEST_F(OrchTest, RunnableConfigMergeCallbacks) {
  auto manager1 = std::make_shared<CallbackManager>();
  auto manager2 = std::make_shared<CallbackManager>();

  RunnableConfig config1;
  config1.withCallbacks(manager1);

  RunnableConfig config2;
  config2.withCallbacks(manager2);

  config1.merge(config2);

  // Merged callbacks should be from config2
  EXPECT_EQ(config1.callbacks(), manager2);
}
