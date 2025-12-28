#pragma once

// StateMachine - Type-safe finite state machine
// Manages entity lifecycles with discrete states and event-driven transitions
//
// Use cases:
// - Connection states (DISCONNECTED → CONNECTING → CONNECTED → ERROR)
// - Workflow lifecycle (PENDING → RUNNING → PAUSED → COMPLETED)
// - Agent behavior (IDLE → THINKING → ACTING → WAITING)

#include <functional>
#include <map>
#include <memory>
#include <utility>
#include <vector>

#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace fsm {

using namespace gopher::orch::core;

// =============================================================================
// StateMachine - Type-safe finite state machine
// =============================================================================

template <typename TState, typename TEvent, typename TContext = void*>
class StateMachine {
 public:
  using StateType = TState;
  using EventType = TEvent;
  using ContextType = TContext;

  // Guard: returns true if transition is allowed
  using Guard =
      std::function<bool(TState from, TEvent event, const TContext& ctx)>;

  // Action: executed during transition
  using TransitionAction =
      std::function<void(TState from, TState to, TEvent event, TContext& ctx)>;

  // State callbacks: executed on entry/exit
  using StateAction = std::function<void(TState state, TContext& ctx)>;

  // Observer: notified of all state changes
  using StateObserver =
      std::function<void(TState from, TState to, TEvent event)>;

  // Async transition callback
  using TransitionCallback = std::function<void(Result<TState>)>;

  explicit StateMachine(TState initial_state) : current_state_(initial_state) {}

  // =========================================================================
  // Configuration (Builder pattern)
  // =========================================================================

  // Add a valid transition: from --[event]--> to
  StateMachine& addTransition(TState from, TEvent event, TState to) {
    transitions_[{from, event}] = to;
    return *this;
  }

  // Add guard condition for a transition
  // Guard must return true for transition to proceed
  StateMachine& setGuard(TState from, TEvent event, Guard guard) {
    guards_[{from, event}] = std::move(guard);
    return *this;
  }

  // Add action to execute during transition (after exit, before enter)
  StateMachine& setAction(TState from, TEvent event, TransitionAction action) {
    actions_[{from, event}] = std::move(action);
    return *this;
  }

  // Set callback when entering a state
  StateMachine& onEnter(TState state, StateAction callback) {
    on_enter_[state] = std::move(callback);
    return *this;
  }

  // Set callback when exiting a state
  StateMachine& onExit(TState state, StateAction callback) {
    on_exit_[state] = std::move(callback);
    return *this;
  }

  // Set global state change observer (for logging/tracing)
  StateMachine& onStateChange(StateObserver observer) {
    state_observer_ = std::move(observer);
    return *this;
  }

  // =========================================================================
  // State Query
  // =========================================================================

  TState currentState() const { return current_state_; }

  bool isInState(TState state) const { return current_state_ == state; }

  // Check if an event can trigger a transition from current state
  bool canTrigger(TEvent event) const {
    return canTriggerWith(event, context_);
  }

  bool canTriggerWith(TEvent event, const TContext& ctx) const {
    auto key = std::make_pair(current_state_, event);

    // Check if transition exists
    auto trans_it = transitions_.find(key);
    if (trans_it == transitions_.end()) {
      return false;
    }

    // Check guard if present
    auto guard_it = guards_.find(key);
    if (guard_it != guards_.end()) {
      return guard_it->second(current_state_, event, ctx);
    }

    return true;
  }

  // Get list of valid events from current state
  std::vector<TEvent> validEvents() const {
    std::vector<TEvent> events;
    for (const auto& entry : transitions_) {
      if (entry.first.first == current_state_) {
        if (canTrigger(entry.first.second)) {
          events.push_back(entry.first.second);
        }
      }
    }
    return events;
  }

  // =========================================================================
  // Synchronous Trigger
  // =========================================================================

  Result<TState> trigger(TEvent event) { return triggerWith(event, context_); }

  Result<TState> triggerWith(TEvent event, TContext& ctx) {
    auto key = std::make_pair(current_state_, event);

    // Find transition
    auto trans_it = transitions_.find(key);
    if (trans_it == transitions_.end()) {
      return makeOrchError<TState>(
          OrchError::INVALID_TRANSITION,
          "No transition defined for event in current state");
    }

    // Check guard
    auto guard_it = guards_.find(key);
    if (guard_it != guards_.end() &&
        !guard_it->second(current_state_, event, ctx)) {
      return makeOrchError<TState>(OrchError::GUARD_REJECTED,
                                   "Transition guard returned false");
    }

    TState from_state = current_state_;
    TState to_state = trans_it->second;

    // Execute exit callback
    auto exit_it = on_exit_.find(from_state);
    if (exit_it != on_exit_.end()) {
      exit_it->second(from_state, ctx);
    }

    // Execute transition action
    auto action_it = actions_.find(key);
    if (action_it != actions_.end()) {
      action_it->second(from_state, to_state, event, ctx);
    }

    // Update state
    current_state_ = to_state;

    // Execute enter callback
    auto enter_it = on_enter_.find(to_state);
    if (enter_it != on_enter_.end()) {
      enter_it->second(to_state, ctx);
    }

    // Notify observer
    if (state_observer_) {
      state_observer_(from_state, to_state, event);
    }

    return makeSuccess(to_state);
  }

  // =========================================================================
  // Async Trigger (Dispatcher Integration)
  // =========================================================================

  void triggerAsync(TEvent event,
                    Dispatcher& dispatcher,
                    TransitionCallback callback) {
    dispatcher.post([this, event, callback = std::move(callback)]() {
      callback(trigger(event));
    });
  }

  void triggerAsyncWith(TEvent event,
                        TContext& ctx,
                        Dispatcher& dispatcher,
                        TransitionCallback callback) {
    dispatcher.post([this, event, &ctx, callback = std::move(callback)]() {
      callback(triggerWith(event, ctx));
    });
  }

  // =========================================================================
  // Context Management
  // =========================================================================

  void setContext(TContext ctx) { context_ = std::move(ctx); }
  TContext& context() { return context_; }
  const TContext& context() const { return context_; }

  // =========================================================================
  // Reset
  // =========================================================================

  void reset(TState state) { current_state_ = state; }

  void reset(TState state, TContext ctx) {
    current_state_ = state;
    context_ = std::move(ctx);
  }

 private:
  using TransitionKey = std::pair<TState, TEvent>;

  // Custom comparator for pair keys (works with enums)
  struct PairCompare {
    bool operator()(const TransitionKey& a, const TransitionKey& b) const {
      if (static_cast<int>(a.first) != static_cast<int>(b.first)) {
        return static_cast<int>(a.first) < static_cast<int>(b.first);
      }
      return static_cast<int>(a.second) < static_cast<int>(b.second);
    }
  };

  TState current_state_;
  TContext context_;

  std::map<TransitionKey, TState, PairCompare> transitions_;
  std::map<TransitionKey, Guard, PairCompare> guards_;
  std::map<TransitionKey, TransitionAction, PairCompare> actions_;
  std::map<TState, StateAction> on_enter_;
  std::map<TState, StateAction> on_exit_;
  StateObserver state_observer_;
};

// =============================================================================
// StateMachineBuilder - Fluent builder for state machines
// =============================================================================

template <typename TState, typename TEvent, typename TContext = void*>
class StateMachineBuilder {
 public:
  using Machine = StateMachine<TState, TEvent, TContext>;

  explicit StateMachineBuilder(TState initial_state)
      : machine_(std::make_shared<Machine>(initial_state)) {}

  // Add a transition
  StateMachineBuilder& transition(TState from, TEvent event, TState to) {
    machine_->addTransition(from, event, to);
    return *this;
  }

  // Set guard for last added transition
  StateMachineBuilder& withGuard(TState from,
                                 TEvent event,
                                 typename Machine::Guard guard) {
    machine_->setGuard(from, event, std::move(guard));
    return *this;
  }

  // Set action for last added transition
  StateMachineBuilder& withAction(TState from,
                                  TEvent event,
                                  typename Machine::TransitionAction action) {
    machine_->setAction(from, event, std::move(action));
    return *this;
  }

  // Set entry callback for a state
  StateMachineBuilder& onEnter(TState state,
                               typename Machine::StateAction callback) {
    machine_->onEnter(state, std::move(callback));
    return *this;
  }

  // Set exit callback for a state
  StateMachineBuilder& onExit(TState state,
                              typename Machine::StateAction callback) {
    machine_->onExit(state, std::move(callback));
    return *this;
  }

  // Set state change observer
  StateMachineBuilder& onStateChange(typename Machine::StateObserver observer) {
    machine_->onStateChange(std::move(observer));
    return *this;
  }

  // Build the state machine
  std::shared_ptr<Machine> build() { return machine_; }

  // Implicit conversion
  operator std::shared_ptr<Machine>() { return build(); }

 private:
  std::shared_ptr<Machine> machine_;
};

// Factory function for creating state machine builder
template <typename TState, typename TEvent, typename TContext = void*>
StateMachineBuilder<TState, TEvent, TContext> makeStateMachine(
    TState initial_state) {
  return StateMachineBuilder<TState, TEvent, TContext>(initial_state);
}

}  // namespace fsm
}  // namespace orch
}  // namespace gopher
