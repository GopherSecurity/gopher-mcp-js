#pragma once

// MCP Dispatcher Adapter
// Adapts mcp::event::Dispatcher to gopher::orch::core::Dispatcher interface
// This allows using MCP's libevent-based dispatcher with gopher-orch

#include "gopher/orch/core/dispatcher.h"

// Only include if MCP is available
#ifndef BUILD_WITHOUT_GOPHER_MCP
#include "mcp/event/libevent_dispatcher.h"

namespace gopher {
namespace orch {
namespace core {

// Timer adapter for MCP timers
class MCPTimerAdapter : public Timer {
 public:
  explicit MCPTimerAdapter(mcp::event::TimerPtr timer) 
      : timer_(std::move(timer)) {}
  
  void enable() override {
    if (timer_) {
      timer_->enableTimer();
    }
  }
  
  void disable() override {
    if (timer_) {
      timer_->disableTimer();
    }
  }
  
  bool enabled() const override {
    return timer_ && timer_->enabled();
  }
  
 private:
  mcp::event::TimerPtr timer_;
};

// Adapter to use MCP's LibeventDispatcher with gopher-orch
class MCPDispatcherAdapter : public Dispatcher {
 public:
  explicit MCPDispatcherAdapter(std::unique_ptr<mcp::event::LibeventDispatcher> impl)
      : impl_(std::move(impl)), name_(impl_ ? impl_->name() : "mcp") {}
  
  explicit MCPDispatcherAdapter(const std::string& name)
      : impl_(std::make_unique<mcp::event::LibeventDispatcher>(name)),
        name_(name) {}
  
  void post(PostCallback callback) override {
    if (impl_) {
      impl_->post(std::move(callback));
    }
  }
  
  bool isThreadSafe() const override {
    return impl_ ? impl_->isThreadSafe() : false;
  }
  
  const std::string& name() const override {
    return name_;
  }
  
  TimerPtr createTimer(TimerCallback callback,
                       std::chrono::milliseconds timeout) override {
    if (!impl_) {
      return nullptr;
    }
    
    // Create MCP timer and wrap it
    auto mcp_timer = impl_->createTimer([callback]() { callback(); });
    if (mcp_timer) {
      mcp_timer->enableTimer(timeout);
      return std::make_unique<MCPTimerAdapter>(std::move(mcp_timer));
    }
    return nullptr;
  }
  
  void run(RunMode mode) override {
    if (!impl_) return;
    
    switch (mode) {
      case RunMode::Block:
        impl_->run(mcp::event::RunType::Block);
        break;
      case RunMode::NonBlock:
        impl_->run(mcp::event::RunType::NonBlock);
        break;
      case RunMode::Once:
        // MCP doesn't have a "once" mode, use NonBlock
        impl_->run(mcp::event::RunType::NonBlock);
        break;
    }
  }
  
  void exit() override {
    if (impl_) {
      impl_->exit();
    }
  }
  
  // Get the underlying MCP dispatcher (for advanced usage)
  mcp::event::LibeventDispatcher* getMCPDispatcher() {
    return impl_.get();
  }
  
 private:
  std::unique_ptr<mcp::event::LibeventDispatcher> impl_;
  std::string name_;
};

// Factory for creating MCP-based dispatchers
class MCPDispatcherFactory : public DispatcherFactory {
 public:
  DispatcherPtr createDispatcher(const std::string& name) override {
    return std::make_unique<MCPDispatcherAdapter>(name);
  }
  
  const std::string& backendName() const override {
    static const std::string name = "mcp-libevent";
    return name;
  }
};

}  // namespace core
}  // namespace orch
}  // namespace gopher

#endif // BUILD_WITHOUT_GOPHER_MCP