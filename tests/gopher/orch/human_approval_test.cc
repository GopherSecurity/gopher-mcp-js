// Unit tests for HumanApproval and ApprovalHandler

#include "orch_test_fixture.h"

using namespace gopher::orch::human;

// =============================================================================
// ApprovalResponse Tests
// =============================================================================

TEST_F(OrchTest, ApprovalResponseApprove) {
  auto response = ApprovalResponse::approve("User approved");

  EXPECT_TRUE(response.approved);
  EXPECT_EQ(response.reason, "User approved");
  EXPECT_TRUE(response.modifications.isNull());
}

TEST_F(OrchTest, ApprovalResponseDeny) {
  auto response = ApprovalResponse::deny("User rejected");

  EXPECT_FALSE(response.approved);
  EXPECT_EQ(response.reason, "User rejected");
}

TEST_F(OrchTest, ApprovalResponseApproveWithModifications) {
  core::JsonValue mods = core::JsonValue::object();
  mods["amount"] = 100;

  auto response =
      ApprovalResponse::approveWithModifications(mods, "Reduced amount");

  EXPECT_TRUE(response.approved);
  EXPECT_EQ(response.reason, "Reduced amount");
  EXPECT_FALSE(response.modifications.isNull());
  EXPECT_EQ(response.modifications["amount"].getInt(), 100);
}

// =============================================================================
// AutoApprovalHandler Tests
// =============================================================================

TEST_F(OrchTest, AutoApprovalHandlerApproves) {
  auto handler = std::make_shared<AutoApprovalHandler>("Test auto-approve");

  ApprovalRequest request;
  request.action_name = "dangerous_action";
  request.prompt = "Are you sure?";

  bool callback_called = false;
  ApprovalResponse received_response;

  handler->requestApproval(request, [&](ApprovalResponse response) {
    callback_called = true;
    received_response = std::move(response);
  });

  EXPECT_TRUE(callback_called);
  EXPECT_TRUE(received_response.approved);
  EXPECT_EQ(received_response.reason, "Test auto-approve");
}

// =============================================================================
// AutoDenyHandler Tests
// =============================================================================

TEST_F(OrchTest, AutoDenyHandlerDenies) {
  auto handler = std::make_shared<AutoDenyHandler>("Security policy");

  ApprovalRequest request;
  request.action_name = "blocked_action";

  bool callback_called = false;
  ApprovalResponse received_response;

  handler->requestApproval(request, [&](ApprovalResponse response) {
    callback_called = true;
    received_response = std::move(response);
  });

  EXPECT_TRUE(callback_called);
  EXPECT_FALSE(received_response.approved);
  EXPECT_EQ(received_response.reason, "Security policy");
}

// =============================================================================
// CallbackApprovalHandler Tests
// =============================================================================

TEST_F(OrchTest, CallbackApprovalHandlerCustomLogic) {
  // Approve only if amount is less than 1000
  auto handler = std::make_shared<CallbackApprovalHandler>(
      [](const ApprovalRequest& req) -> ApprovalResponse {
        if (req.preview.contains("amount")) {
          int amount = req.preview["amount"].getInt();
          if (amount < 1000) {
            return ApprovalResponse::approve("Amount within limit");
          } else {
            return ApprovalResponse::deny("Amount exceeds limit");
          }
        }
        return ApprovalResponse::approve("No amount specified");
      });

  // Test with low amount - should approve
  ApprovalRequest request1;
  request1.preview = core::JsonValue::object();
  request1.preview["amount"] = 500;

  ApprovalResponse response1;
  handler->requestApproval(
      request1, [&response1](ApprovalResponse r) { response1 = std::move(r); });

  EXPECT_TRUE(response1.approved);

  // Test with high amount - should deny
  ApprovalRequest request2;
  request2.preview = core::JsonValue::object();
  request2.preview["amount"] = 2000;

  ApprovalResponse response2;
  handler->requestApproval(
      request2, [&response2](ApprovalResponse r) { response2 = std::move(r); });

  EXPECT_FALSE(response2.approved);
}

// =============================================================================
// ConditionalApprovalHandler Tests
// =============================================================================

TEST_F(OrchTest, ConditionalApprovalHandlerBasic) {
  // Approve if action starts with "safe_"
  auto handler = std::make_shared<ConditionalApprovalHandler>(
      [](const ApprovalRequest& req) {
        return req.action_name.find("safe_") == 0;
      },
      "Safe operation", "Unsafe operation blocked");

  // Test safe action
  ApprovalRequest safe_request;
  safe_request.action_name = "safe_operation";

  ApprovalResponse safe_response;
  handler->requestApproval(safe_request, [&safe_response](ApprovalResponse r) {
    safe_response = std::move(r);
  });

  EXPECT_TRUE(safe_response.approved);
  EXPECT_EQ(safe_response.reason, "Safe operation");

  // Test unsafe action
  ApprovalRequest unsafe_request;
  unsafe_request.action_name = "dangerous_operation";

  ApprovalResponse unsafe_response;
  handler->requestApproval(unsafe_request,
                           [&unsafe_response](ApprovalResponse r) {
                             unsafe_response = std::move(r);
                           });

  EXPECT_FALSE(unsafe_response.approved);
  EXPECT_EQ(unsafe_response.reason, "Unsafe operation blocked");
}

// =============================================================================
// AsyncCallbackApprovalHandler Tests
// =============================================================================

TEST_F(OrchTest, AsyncCallbackApprovalHandlerBasic) {
  auto handler = std::make_shared<AsyncCallbackApprovalHandler>(
      [](const ApprovalRequest& req,
         std::function<void(ApprovalResponse)> callback) {
        // Simulate async approval (in real code, this might post to a queue)
        callback(
            ApprovalResponse::approve("Async approved: " + req.action_name));
      });

  ApprovalRequest request;
  request.action_name = "async_action";

  ApprovalResponse response;
  handler->requestApproval(
      request, [&response](ApprovalResponse r) { response = std::move(r); });

  EXPECT_TRUE(response.approved);
  EXPECT_EQ(response.reason, "Async approved: async_action");
}

// =============================================================================
// RecordingApprovalHandler Tests
// =============================================================================

TEST_F(OrchTest, RecordingApprovalHandlerRecords) {
  auto inner = std::make_shared<AutoApprovalHandler>();
  auto handler = std::make_shared<RecordingApprovalHandler>(inner);

  // Make several requests
  ApprovalRequest request1;
  request1.action_name = "action1";
  handler->requestApproval(request1, [](ApprovalResponse) {});

  ApprovalRequest request2;
  request2.action_name = "action2";
  handler->requestApproval(request2, [](ApprovalResponse) {});

  ApprovalRequest request3;
  request3.action_name = "action3";
  handler->requestApproval(request3, [](ApprovalResponse) {});

  // Verify recordings
  EXPECT_EQ(handler->requestCount(), 3u);

  auto recorded = handler->recordedRequests();
  EXPECT_EQ(recorded[0].action_name, "action1");
  EXPECT_EQ(recorded[1].action_name, "action2");
  EXPECT_EQ(recorded[2].action_name, "action3");

  // Clear and verify
  handler->clearRecords();
  EXPECT_EQ(handler->requestCount(), 0u);
}

// =============================================================================
// HumanApproval Runnable Tests
// =============================================================================

// Simple test runnable that doubles a number
class DoublerRunnable
    : public core::Runnable<core::JsonValue, core::JsonValue> {
 public:
  std::string name() const override { return "Doubler"; }

  void invoke(const core::JsonValue& input,
              const core::RunnableConfig& config,
              core::Dispatcher& dispatcher,
              core::ResultCallback<core::JsonValue> callback) override {
    (void)config;
    dispatcher.post([input, callback]() {
      core::JsonValue output = core::JsonValue::object();
      if (input.contains("value")) {
        output["result"] = input["value"].getInt() * 2;
      } else {
        output["result"] = 0;
      }
      callback(core::makeSuccess(std::move(output)));
    });
  }
};

TEST_F(OrchTest, HumanApprovalApproved) {
  auto inner = std::make_shared<DoublerRunnable>();
  auto handler = std::make_shared<AutoApprovalHandler>("User approved");

  auto approval = HumanApproval<core::JsonValue, core::JsonValue>::create(
      inner, handler, "Double this value?");

  EXPECT_EQ(approval->name(), "HumanApproval(Doubler)");

  core::JsonValue input = core::JsonValue::object();
  input["value"] = 21;

  auto result = runToCompletion<core::JsonValue>(
      [&](core::Dispatcher& dispatcher,
          core::ResultCallback<core::JsonValue> callback) {
        approval->invoke(input, core::RunnableConfig(), dispatcher,
                         std::move(callback));
      });

  EXPECT_EQ(result["result"].getInt(), 42);
}

TEST_F(OrchTest, HumanApprovalDenied) {
  auto inner = std::make_shared<DoublerRunnable>();
  auto handler = std::make_shared<AutoDenyHandler>("Not authorized");

  auto approval = HumanApproval<core::JsonValue, core::JsonValue>::create(
      inner, handler, "Double this value?");

  core::JsonValue input = core::JsonValue::object();
  input["value"] = 21;

  auto result = runToCompletionResult<core::JsonValue>(
      [&](core::Dispatcher& dispatcher,
          core::ResultCallback<core::JsonValue> callback) {
        approval->invoke(input, core::RunnableConfig(), dispatcher,
                         std::move(callback));
      });

  EXPECT_TRUE(mcp::holds_alternative<core::Error>(result));
  auto error = mcp::get<core::Error>(result);
  EXPECT_EQ(error.code, OrchError::APPROVAL_DENIED);
  EXPECT_EQ(error.message, "Not authorized");
}

TEST_F(OrchTest, HumanApprovalWithModifications) {
  auto inner = std::make_shared<DoublerRunnable>();

  // Handler that modifies the input
  auto handler = std::make_shared<CallbackApprovalHandler>(
      [](const ApprovalRequest& req) -> ApprovalResponse {
        (void)req;
        // Modify value to 50 instead of original
        core::JsonValue mods = core::JsonValue::object();
        mods["value"] = 50;
        return ApprovalResponse::approveWithModifications(mods,
                                                          "Value adjusted");
      });

  auto approval = HumanApproval<core::JsonValue, core::JsonValue>::create(
      inner, handler, "Double this value?");

  core::JsonValue input = core::JsonValue::object();
  input["value"] = 21;  // Original value

  auto result = runToCompletion<core::JsonValue>(
      [&](core::Dispatcher& dispatcher,
          core::ResultCallback<core::JsonValue> callback) {
        approval->invoke(input, core::RunnableConfig(), dispatcher,
                         std::move(callback));
      });

  // Should be 50 * 2 = 100, not 21 * 2 = 42
  EXPECT_EQ(result["result"].getInt(), 100);
}

TEST_F(OrchTest, HumanApprovalRequestContainsPreview) {
  auto inner = std::make_shared<DoublerRunnable>();
  auto recording_handler = std::make_shared<RecordingApprovalHandler>(
      std::make_shared<AutoApprovalHandler>());

  auto approval = HumanApproval<core::JsonValue, core::JsonValue>::create(
      inner, recording_handler, "Please approve this operation");

  core::JsonValue input = core::JsonValue::object();
  input["value"] = 42;
  input["description"] = "Test operation";

  runToCompletion<core::JsonValue>(
      [&](core::Dispatcher& dispatcher,
          core::ResultCallback<core::JsonValue> callback) {
        approval->invoke(input, core::RunnableConfig(), dispatcher,
                         std::move(callback));
      });

  // Verify the request was properly formed
  EXPECT_EQ(recording_handler->requestCount(), 1u);
  auto recorded = recording_handler->recordedRequests();
  EXPECT_EQ(recorded[0].action_name, "Doubler");
  EXPECT_EQ(recorded[0].prompt, "Please approve this operation");
  EXPECT_EQ(recorded[0].preview["value"].getInt(), 42);
  EXPECT_EQ(recorded[0].preview["description"].getString(), "Test operation");
}

// =============================================================================
// JsonHumanApproval Alias Test
// =============================================================================

TEST_F(OrchTest, JsonHumanApprovalAlias) {
  auto inner = std::make_shared<DoublerRunnable>();
  auto handler = std::make_shared<AutoApprovalHandler>();

  // JsonHumanApproval is alias for HumanApproval<JsonValue, JsonValue>
  auto approval = JsonHumanApproval::create(inner, handler, "Approve?");

  core::JsonValue input = core::JsonValue::object();
  input["value"] = 10;

  auto result = runToCompletion<core::JsonValue>(
      [&](core::Dispatcher& dispatcher,
          core::ResultCallback<core::JsonValue> callback) {
        approval->invoke(input, core::RunnableConfig(), dispatcher,
                         std::move(callback));
      });

  EXPECT_EQ(result["result"].getInt(), 20);
}

// =============================================================================
// Integration: HumanApproval with Callback Manager
// =============================================================================

TEST_F(OrchTest, HumanApprovalWithCallbackManager) {
  auto inner = std::make_shared<DoublerRunnable>();
  auto handler = std::make_shared<AutoApprovalHandler>();

  auto approval = HumanApproval<core::JsonValue, core::JsonValue>::create(
      inner, handler, "Approve?");

  // Create callback manager to track execution
  auto manager = std::make_shared<callback::CallbackManager>();

  // Use a recording handler to verify events
  class RecordingCallback : public callback::CallbackHandler {
   public:
    std::vector<std::string> events;

    void onChainStart(const callback::RunInfo& info,
                      const core::JsonValue&) override {
      events.push_back("start:" + info.name);
    }

    void onChainEnd(const callback::RunInfo& info,
                    const core::JsonValue&) override {
      events.push_back("end:" + info.name);
    }
  };

  auto recorder = std::make_shared<RecordingCallback>();
  manager->addHandler(recorder);

  core::RunnableConfig config;
  config.withCallbacks(manager);

  // Start a chain that wraps the approval
  auto run_info =
      manager->startChain("approval_test", core::JsonValue::object());

  core::JsonValue input = core::JsonValue::object();
  input["value"] = 5;

  auto result = runToCompletion<core::JsonValue>(
      [&](core::Dispatcher& dispatcher,
          core::ResultCallback<core::JsonValue> callback) {
        approval->invoke(input, config, dispatcher, std::move(callback));
      });

  manager->endChain(run_info, result);

  EXPECT_EQ(result["result"].getInt(), 10);
  EXPECT_EQ(recorder->events.size(), 2u);
  EXPECT_EQ(recorder->events[0], "start:approval_test");
  EXPECT_EQ(recorder->events[1], "end:approval_test");
}
