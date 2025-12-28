#pragma once

// HumanApproval - Human-in-the-loop approval gate for Runnable operations
//
// This module provides a way to pause execution and request human approval
// before proceeding with sensitive or irreversible operations.
//
// The approval flow:
// 1. HumanApproval wraps an inner Runnable
// 2. When invoked, it creates an ApprovalRequest with preview and context
// 3. The ApprovalHandler is called to get human decision
// 4. If approved, the inner Runnable is invoked (possibly with modifications)
// 5. If denied, an error is returned
//
// Usage:
//   auto handler = std::make_shared<CallbackApprovalHandler>([](auto& req) {
//     // Show UI, get decision...
//     return ApprovalResponse{true, "Approved by user"};
//   });
//
//   auto protected_op = HumanApproval<In, Out>::create(
//     dangerous_operation,
//     handler,
//     "This operation will modify production data. Continue?"
//   );

#include <functional>
#include <memory>
#include <string>
#include <utility>

#include "gopher/orch/core/runnable.h"
#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace human {

// =============================================================================
// ApprovalRequest - Information sent for human review
// =============================================================================

// ApprovalRequest contains all the context a human needs to make a decision.
// It includes:
// - action_name: What operation is being performed
// - preview: A preview of what will happen (input data, expected effects)
// - prompt: A human-readable question/message
// - metadata: Additional context (tags, source, urgency, etc.)
struct ApprovalRequest {
  std::string action_name;   // Name of the action requiring approval
  core::JsonValue preview;   // Preview of input/effects for review
  std::string prompt;        // Human-readable prompt/question
  core::JsonValue metadata;  // Additional context

  ApprovalRequest()
      : preview(core::JsonValue::object()),
        metadata(core::JsonValue::object()) {}
};

// =============================================================================
// ApprovalResponse - Human decision
// =============================================================================

// ApprovalResponse contains the human's decision and any modifications.
// The modifications field allows the human to adjust the input before
// the operation proceeds (e.g., correcting parameters, reducing scope).
struct ApprovalResponse {
  bool approved;                  // True if the operation should proceed
  std::string reason;             // Explanation for the decision
  core::JsonValue modifications;  // Optional modifications to input

  ApprovalResponse() : approved(false), modifications(core::JsonValue()) {}

  // Factory methods for common responses
  static ApprovalResponse approve(const std::string& reason = "Approved") {
    ApprovalResponse resp;
    resp.approved = true;
    resp.reason = reason;
    return resp;
  }

  static ApprovalResponse deny(const std::string& reason = "Denied") {
    ApprovalResponse resp;
    resp.approved = false;
    resp.reason = reason;
    return resp;
  }

  static ApprovalResponse approveWithModifications(
      const core::JsonValue& mods,
      const std::string& reason = "Approved with modifications") {
    ApprovalResponse resp;
    resp.approved = true;
    resp.reason = reason;
    resp.modifications = mods;
    return resp;
  }
};

// =============================================================================
// ApprovalHandler - Interface for requesting human approval
// =============================================================================

// ApprovalHandler is the interface for different approval mechanisms.
// Implementations might:
// - Show a CLI prompt
// - Display a GUI dialog
// - Send a notification and wait for response
// - Use an automated approval system (for testing)
//
// The callback-based API allows async approval (e.g., waiting for external
// response).
class ApprovalHandler {
 public:
  virtual ~ApprovalHandler() = default;

  // Request approval from a human.
  // The callback must be invoked exactly once with the response.
  // Implementations should ensure the callback is eventually called,
  // even on timeout (with approved=false).
  virtual void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) = 0;
};

// =============================================================================
// HumanApproval - Wrap a runnable with human approval gate
// =============================================================================

// HumanApproval wraps an inner Runnable and gates it with human approval.
// The approval flow is:
// 1. Create ApprovalRequest with preview of the input
// 2. Call ApprovalHandler::requestApproval
// 3. On approval: invoke inner Runnable (with modifications if provided)
// 4. On denial: return error with reason
//
// Thread safety: The approval callback may be invoked on any thread.
// The inner Runnable invoke is always called on the dispatcher thread.
template <typename TInput, typename TOutput>
class HumanApproval : public core::Runnable<TInput, TOutput> {
 public:
  using Ptr = std::shared_ptr<HumanApproval<TInput, TOutput>>;
  using InnerPtr = typename core::Runnable<TInput, TOutput>::Ptr;

  HumanApproval(InnerPtr inner,
                std::shared_ptr<ApprovalHandler> handler,
                std::string prompt)
      : inner_(std::move(inner)),
        handler_(std::move(handler)),
        prompt_(std::move(prompt)) {}

  std::string name() const override {
    return "HumanApproval(" + inner_->name() + ")";
  }

  void invoke(const TInput& input,
              const core::RunnableConfig& config,
              core::Dispatcher& dispatcher,
              core::ResultCallback<TOutput> callback) override {
    // Build the approval request
    ApprovalRequest request;
    request.action_name = inner_->name();
    request.preview = toJsonPreview(input);
    request.prompt = prompt_;

    // Capture what we need for the callback
    // Use static_pointer_cast to get the correct type since we inherit
    // enable_shared_from_this from Runnable base class
    auto self = std::static_pointer_cast<HumanApproval<TInput, TOutput>>(
        this->shared_from_this());
    auto inner = inner_;
    auto cfg = config;

    // Request approval (may be async)
    handler_->requestApproval(
        request, [self, inner, cfg, &dispatcher, callback,
                  input](ApprovalResponse response) mutable {
          if (!response.approved) {
            // Denied - post error to dispatcher
            dispatcher.post([callback, response]() {
              callback(core::Result<TOutput>(core::Error(
                  core::OrchError::APPROVAL_DENIED, response.reason)));
            });
            return;
          }

          // Approved - invoke inner runnable
          // Apply modifications if provided
          TInput final_input = input;
          if (!response.modifications.isNull()) {
            final_input =
                self->fromJsonModifications(input, response.modifications);
          }

          // Post invoke to dispatcher to ensure we're in the right context
          dispatcher.post([inner, final_input, cfg, &dispatcher, callback]() {
            inner->invoke(final_input, cfg, dispatcher, std::move(callback));
          });
        });
  }

  // Factory method
  static Ptr create(InnerPtr inner,
                    std::shared_ptr<ApprovalHandler> handler,
                    const std::string& prompt) {
    return std::make_shared<HumanApproval<TInput, TOutput>>(
        std::move(inner), std::move(handler), prompt);
  }

 protected:
  // Convert input to JSON for preview
  // Default implementation works for JsonValue inputs
  // Override this for custom preview formatting with non-JSON types
  virtual core::JsonValue toJsonPreview(const TInput& input) {
    return toJsonImpl(input);
  }

  // Apply modifications to input
  // Default implementation works for JsonValue inputs
  // Override this for custom modification handling with non-JSON types
  virtual TInput fromJsonModifications(const TInput& original,
                                       const core::JsonValue& mods) {
    (void)original;
    return fromJsonImpl(mods);
  }

 private:
  // Type-specific JSON conversion helpers
  // These use SFINAE to handle JsonValue vs other types

  // For JsonValue inputs, just return as-is
  template <typename T = TInput>
  typename std::enable_if<std::is_same<T, core::JsonValue>::value,
                          core::JsonValue>::type
  toJsonImpl(const T& input) const {
    return input;
  }

  // For non-JsonValue inputs, attempt construction
  template <typename T = TInput>
  typename std::enable_if<!std::is_same<T, core::JsonValue>::value,
                          core::JsonValue>::type
  toJsonImpl(const T& input) const {
    return core::JsonValue(input);
  }

  // For JsonValue outputs, just return as-is
  template <typename T = TInput>
  typename std::enable_if<std::is_same<T, core::JsonValue>::value, T>::type
  fromJsonImpl(const core::JsonValue& json) const {
    return json;
  }

  // For non-JsonValue outputs, this is a placeholder that will fail at compile
  // time Users should override fromJsonModifications for non-JsonValue types
  template <typename T = TInput>
  typename std::enable_if<!std::is_same<T, core::JsonValue>::value, T>::type
  fromJsonImpl(const core::JsonValue& json) const {
    // This static_assert provides a clear error message
    static_assert(std::is_same<T, core::JsonValue>::value,
                  "HumanApproval with non-JsonValue types requires "
                  "overriding fromJsonModifications()");
    (void)json;
    return T{};
  }

  InnerPtr inner_;
  std::shared_ptr<ApprovalHandler> handler_;
  std::string prompt_;
};

// =============================================================================
// CallbackApprovalHandler - Use a callback for approval
// =============================================================================

// CallbackApprovalHandler uses a synchronous callback function to make
// approval decisions. This is useful for:
// - Testing with deterministic approval logic
// - Simple CLI prompts
// - Automated approval based on rules
class CallbackApprovalHandler : public ApprovalHandler {
 public:
  // Callback type: takes request, returns response
  using ApprovalCallback =
      std::function<ApprovalResponse(const ApprovalRequest&)>;

  explicit CallbackApprovalHandler(ApprovalCallback callback)
      : callback_(std::move(callback)) {}

  void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) override {
    // Invoke the callback synchronously
    ApprovalResponse response = callback_(request);
    callback(std::move(response));
  }

 private:
  ApprovalCallback callback_;
};

// =============================================================================
// AsyncCallbackApprovalHandler - Use an async callback for approval
// =============================================================================

// AsyncCallbackApprovalHandler allows fully async approval decisions.
// The callback receives both the request and a response callback.
class AsyncCallbackApprovalHandler : public ApprovalHandler {
 public:
  using AsyncApprovalCallback = std::function<void(
      const ApprovalRequest&, std::function<void(ApprovalResponse)>)>;

  explicit AsyncCallbackApprovalHandler(AsyncApprovalCallback callback)
      : callback_(std::move(callback)) {}

  void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) override {
    callback_(request, std::move(callback));
  }

 private:
  AsyncApprovalCallback callback_;
};

// =============================================================================
// AutoApprovalHandler - Automatically approves (for testing)
// =============================================================================

// AutoApprovalHandler automatically approves all requests.
// Use this for:
// - Unit testing the approval flow
// - Development/staging environments
// - Non-sensitive operations that still need the approval interface
class AutoApprovalHandler : public ApprovalHandler {
 public:
  explicit AutoApprovalHandler(const std::string& reason = "Auto-approved")
      : reason_(reason) {}

  void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) override {
    (void)request;
    callback(ApprovalResponse::approve(reason_));
  }

 private:
  std::string reason_;
};

// =============================================================================
// AutoDenyHandler - Automatically denies (for testing)
// =============================================================================

// AutoDenyHandler automatically denies all requests.
// Use this for:
// - Testing error handling paths
// - Temporarily disabling operations
// - Safety fallback when approval system is unavailable
class AutoDenyHandler : public ApprovalHandler {
 public:
  explicit AutoDenyHandler(const std::string& reason = "Auto-denied")
      : reason_(reason) {}

  void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) override {
    (void)request;
    callback(ApprovalResponse::deny(reason_));
  }

 private:
  std::string reason_;
};

// =============================================================================
// ConditionalApprovalHandler - Approve based on condition
// =============================================================================

// ConditionalApprovalHandler approves or denies based on a predicate.
// Useful for rule-based automatic approval of certain operations.
class ConditionalApprovalHandler : public ApprovalHandler {
 public:
  using Predicate = std::function<bool(const ApprovalRequest&)>;

  explicit ConditionalApprovalHandler(
      Predicate predicate,
      const std::string& approve_reason = "Condition met",
      const std::string& deny_reason = "Condition not met")
      : predicate_(std::move(predicate)),
        approve_reason_(approve_reason),
        deny_reason_(deny_reason) {}

  void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) override {
    if (predicate_(request)) {
      callback(ApprovalResponse::approve(approve_reason_));
    } else {
      callback(ApprovalResponse::deny(deny_reason_));
    }
  }

 private:
  Predicate predicate_;
  std::string approve_reason_;
  std::string deny_reason_;
};

// =============================================================================
// RecordingApprovalHandler - Records requests for testing
// =============================================================================

// RecordingApprovalHandler records all requests and delegates to an inner
// handler. Useful for testing that the right requests are being made.
class RecordingApprovalHandler : public ApprovalHandler {
 public:
  explicit RecordingApprovalHandler(std::shared_ptr<ApprovalHandler> inner)
      : inner_(std::move(inner)) {}

  void requestApproval(
      const ApprovalRequest& request,
      std::function<void(ApprovalResponse)> callback) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      recorded_requests_.push_back(request);
    }
    inner_->requestApproval(request, std::move(callback));
  }

  // Get all recorded requests
  std::vector<ApprovalRequest> recordedRequests() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return recorded_requests_;
  }

  // Get the number of recorded requests
  size_t requestCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return recorded_requests_.size();
  }

  // Clear recorded requests
  void clearRecords() {
    std::lock_guard<std::mutex> lock(mutex_);
    recorded_requests_.clear();
  }

 private:
  std::shared_ptr<ApprovalHandler> inner_;
  mutable std::mutex mutex_;
  std::vector<ApprovalRequest> recorded_requests_;
};

// =============================================================================
// Convenience type aliases
// =============================================================================

// JSON-to-JSON human approval wrapper
using JsonHumanApproval = HumanApproval<core::JsonValue, core::JsonValue>;

}  // namespace human
}  // namespace orch
}  // namespace gopher
