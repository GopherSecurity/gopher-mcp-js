// Unit tests for StateMachine (finite state machine)

#include "orch_test_fixture.h"

using namespace gopher::orch::fsm;

// Define test states and events (prefixed with Test to avoid conflict with
// server::TestConnState)
enum class TestConnState { DISCONNECTED, CONNECTING, CONNECTED, ERROR };
enum class TestConnEvent { CONNECT, CONNECTED, DISCONNECT, FAIL };

// =============================================================================
// StateMachine Tests
// =============================================================================

TEST_F(OrchTest, StateMachineBasic) {
  // Create a simple connection state machine
  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING)
      .addTransition(TestConnState::CONNECTING, TestConnEvent::CONNECTED,
                     TestConnState::CONNECTED)
      .addTransition(TestConnState::CONNECTED, TestConnEvent::DISCONNECT,
                     TestConnState::DISCONNECTED)
      .addTransition(TestConnState::CONNECTING, TestConnEvent::FAIL,
                     TestConnState::ERROR)
      .addTransition(TestConnState::ERROR, TestConnEvent::CONNECT,
                     TestConnState::CONNECTING);

  EXPECT_EQ(sm.currentState(), TestConnState::DISCONNECTED);

  // Trigger transitions
  auto result1 = sm.trigger(TestConnEvent::CONNECT);
  EXPECT_TRUE(mcp::holds_alternative<TestConnState>(result1));
  EXPECT_EQ(sm.currentState(), TestConnState::CONNECTING);

  auto result2 = sm.trigger(TestConnEvent::CONNECTED);
  EXPECT_TRUE(mcp::holds_alternative<TestConnState>(result2));
  EXPECT_EQ(sm.currentState(), TestConnState::CONNECTED);

  auto result3 = sm.trigger(TestConnEvent::DISCONNECT);
  EXPECT_TRUE(mcp::holds_alternative<TestConnState>(result3));
  EXPECT_EQ(sm.currentState(), TestConnState::DISCONNECTED);
}

TEST_F(OrchTest, StateMachineInvalidTransition) {
  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING);

  // Try invalid transition
  auto result = sm.trigger(TestConnEvent::DISCONNECT);
  EXPECT_TRUE(mcp::holds_alternative<Error>(result));
  EXPECT_EQ(mcp::get<Error>(result).code, OrchError::INVALID_TRANSITION);
  EXPECT_EQ(sm.currentState(), TestConnState::DISCONNECTED);
}

TEST_F(OrchTest, StateMachineWithGuard) {
  // Use int as context to track retry count
  StateMachine<TestConnState, TestConnEvent, int> sm(
      TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING)
      .addTransition(TestConnState::CONNECTING, TestConnEvent::FAIL,
                     TestConnState::DISCONNECTED)
      .setGuard(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                [](TestConnState, TestConnEvent, const int& retries) {
                  // Only allow connect if retries < 3
                  return retries < 3;
                });

  sm.setContext(0);

  // First connect should work
  auto result1 = sm.trigger(TestConnEvent::CONNECT);
  EXPECT_TRUE(mcp::holds_alternative<TestConnState>(result1));
  EXPECT_EQ(sm.currentState(), TestConnState::CONNECTING);

  // Fail and increment retry count
  sm.trigger(TestConnEvent::FAIL);
  sm.setContext(1);

  // Second connect should work
  auto result2 = sm.trigger(TestConnEvent::CONNECT);
  EXPECT_TRUE(mcp::holds_alternative<TestConnState>(result2));

  sm.trigger(TestConnEvent::FAIL);
  sm.setContext(3);  // Set to 3 retries

  // Third connect should be rejected by guard
  auto result3 = sm.trigger(TestConnEvent::CONNECT);
  EXPECT_TRUE(mcp::holds_alternative<Error>(result3));
  EXPECT_EQ(mcp::get<Error>(result3).code, OrchError::GUARD_REJECTED);
}

TEST_F(OrchTest, StateMachineWithCallbacks) {
  std::vector<std::string> log;

  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING)
      .addTransition(TestConnState::CONNECTING, TestConnEvent::CONNECTED,
                     TestConnState::CONNECTED)
      .onEnter(
          TestConnState::CONNECTING,
          [&log](TestConnState, void*&) { log.push_back("enter_connecting"); })
      .onExit(
          TestConnState::CONNECTING,
          [&log](TestConnState, void*&) { log.push_back("exit_connecting"); })
      .onEnter(
          TestConnState::CONNECTED,
          [&log](TestConnState, void*&) { log.push_back("enter_connected"); })
      .onStateChange([&log](TestConnState from, TestConnState to,
                            TestConnEvent) { log.push_back("state_change"); });

  sm.trigger(TestConnEvent::CONNECT);
  sm.trigger(TestConnEvent::CONNECTED);

  EXPECT_EQ(log.size(), 5u);
  EXPECT_EQ(log[0], "enter_connecting");
  EXPECT_EQ(log[1], "state_change");
  EXPECT_EQ(log[2], "exit_connecting");
  EXPECT_EQ(log[3], "enter_connected");
  EXPECT_EQ(log[4], "state_change");
}

TEST_F(OrchTest, StateMachineValidEvents) {
  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING)
      .addTransition(TestConnState::CONNECTING, TestConnEvent::CONNECTED,
                     TestConnState::CONNECTED)
      .addTransition(TestConnState::CONNECTING, TestConnEvent::FAIL,
                     TestConnState::ERROR);

  // From DISCONNECTED, only CONNECT is valid
  auto events = sm.validEvents();
  EXPECT_EQ(events.size(), 1u);
  EXPECT_EQ(events[0], TestConnEvent::CONNECT);

  // Move to CONNECTING
  sm.trigger(TestConnEvent::CONNECT);

  // From CONNECTING, CONNECTED and FAIL are valid
  events = sm.validEvents();
  EXPECT_EQ(events.size(), 2u);
}

TEST_F(OrchTest, StateMachineCanTrigger) {
  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING);

  EXPECT_TRUE(sm.canTrigger(TestConnEvent::CONNECT));
  EXPECT_FALSE(sm.canTrigger(TestConnEvent::DISCONNECT));
  EXPECT_FALSE(sm.canTrigger(TestConnEvent::CONNECTED));
}

TEST_F(OrchTest, StateMachineBuilder) {
  auto sm = makeStateMachine<TestConnState, TestConnEvent>(
                TestConnState::DISCONNECTED)
                .transition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                            TestConnState::CONNECTING)
                .transition(TestConnState::CONNECTING, TestConnEvent::CONNECTED,
                            TestConnState::CONNECTED)
                .build();

  EXPECT_EQ(sm->currentState(), TestConnState::DISCONNECTED);

  sm->trigger(TestConnEvent::CONNECT);
  EXPECT_EQ(sm->currentState(), TestConnState::CONNECTING);

  sm->trigger(TestConnEvent::CONNECTED);
  EXPECT_EQ(sm->currentState(), TestConnState::CONNECTED);
}

TEST_F(OrchTest, StateMachineReset) {
  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::CONNECTED);

  EXPECT_EQ(sm.currentState(), TestConnState::CONNECTED);

  sm.reset(TestConnState::DISCONNECTED);
  EXPECT_EQ(sm.currentState(), TestConnState::DISCONNECTED);
}

TEST_F(OrchTest, StateMachineAsyncTrigger) {
  StateMachine<TestConnState, TestConnEvent> sm(TestConnState::DISCONNECTED);

  sm.addTransition(TestConnState::DISCONNECTED, TestConnEvent::CONNECT,
                   TestConnState::CONNECTING);

  std::mutex mutex;
  std::condition_variable cv;
  bool done = false;
  Result<TestConnState> async_result =
      Result<TestConnState>(Error(-1, "Not completed"));

  sm.triggerAsync(TestConnEvent::CONNECT, *dispatcher_,
                  [&](Result<TestConnState> result) {
                    std::lock_guard<std::mutex> lock(mutex);
                    async_result = std::move(result);
                    done = true;
                    cv.notify_one();
                  });

  // Run dispatcher until done
  while (true) {
    {
      std::unique_lock<std::mutex> lock(mutex);
      if (done)
        break;
    }
    dispatcher_->run(mcp::event::RunType::NonBlock);
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }

  EXPECT_TRUE(mcp::holds_alternative<TestConnState>(async_result));
  EXPECT_EQ(mcp::get<TestConnState>(async_result), TestConnState::CONNECTING);
  EXPECT_EQ(sm.currentState(), TestConnState::CONNECTING);
}
