#pragma once

// Simple Dispatcher Implementation
// A basic dispatcher that doesn't require external dependencies
// Useful for testing and standalone usage

#include "gopher/orch/core/dispatcher.h"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>

namespace gopher {
namespace orch {
namespace core {

// Simple timer implementation
class SimpleTimer : public Timer {
 public:
  SimpleTimer() : enabled_(false) {}
  
  void enable() override { enabled_ = true; }
  void disable() override { enabled_ = false; }
  bool enabled() const override { return enabled_; }
  
 private:
  std::atomic<bool> enabled_;
};

// Simple single-threaded dispatcher implementation
// Executes callbacks in a queue, suitable for testing
class SimpleDispatcher : public Dispatcher {
 public:
  explicit SimpleDispatcher(const std::string& name = "simple")
      : name_(name),
        exit_requested_(false),
        thread_id_(std::this_thread::get_id()) {}
  
  ~SimpleDispatcher() {
    exit();
  }
  
  void post(PostCallback callback) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      callbacks_.push_back(std::move(callback));
    }
    cv_.notify_one();
  }
  
  bool isThreadSafe() const override {
    return std::this_thread::get_id() == thread_id_;
  }
  
  const std::string& name() const override {
    return name_;
  }
  
  TimerPtr createTimer(TimerCallback callback,
                       std::chrono::milliseconds timeout) override {
    // Schedule the callback to run after timeout
    auto timer = std::make_unique<SimpleTimer>();
    timer->enable();  // Enable the timer immediately
    
    // Post the timer callback after the timeout
    std::thread([this, callback, timeout, raw_timer = timer.get()]() {
      std::this_thread::sleep_for(timeout);
      if (raw_timer->enabled()) {
        post(callback);
      }
    }).detach();
    
    return timer;
  }
  
  void run(RunMode mode) override {
    // Update thread ID when run is called
    thread_id_ = std::this_thread::get_id();
    
    switch (mode) {
      case RunMode::Block:
        runBlock();
        break;
      case RunMode::NonBlock:
        runNonBlock();
        break;
      case RunMode::Once:
        runOnce();
        break;
    }
  }
  
  void exit() override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      exit_requested_ = true;
    }
    cv_.notify_all();
  }
  
 private:
  void runBlock() {
    while (!exit_requested_) {
      std::unique_lock<std::mutex> lock(mutex_);
      cv_.wait(lock, [this] { return !callbacks_.empty() || exit_requested_; });
      
      if (exit_requested_) break;
      
      // Process all pending callbacks
      while (!callbacks_.empty()) {
        auto callback = std::move(callbacks_.front());
        callbacks_.pop_front();
        lock.unlock();
        callback();
        lock.lock();
      }
    }
  }
  
  void runNonBlock() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      
      // Process all pending callbacks without waiting
      while (!callbacks_.empty()) {
        auto callback = std::move(callbacks_.front());
        callbacks_.pop_front();
        mutex_.unlock();
        callback();
        mutex_.lock();
      }
    }
    
    // Give a small yield to allow timer threads to schedule and post callbacks
    std::this_thread::sleep_for(std::chrono::microseconds(100));
  }
  
  void runOnce() {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (!callbacks_.empty()) {
      auto callback = std::move(callbacks_.front());
      callbacks_.pop_front();
      lock.unlock();
      callback();
    }
  }
  
  std::string name_;
  std::deque<PostCallback> callbacks_;
  mutable std::mutex mutex_;
  std::condition_variable cv_;
  std::atomic<bool> exit_requested_;
  std::thread::id thread_id_;
};

// Factory for creating simple dispatchers
class SimpleDispatcherFactory : public DispatcherFactory {
 public:
  DispatcherPtr createDispatcher(const std::string& name) override {
    return std::make_unique<SimpleDispatcher>(name);
  }
  
  const std::string& backendName() const override {
    static const std::string name = "simple";
    return name;
  }
};

// Immediate dispatcher for testing - executes callbacks immediately
class ImmediateDispatcher : public Dispatcher {
 public:
  explicit ImmediateDispatcher(const std::string& name = "immediate")
      : name_(name) {}
  
  void post(PostCallback callback) override {
    // Execute immediately
    callback();
  }
  
  bool isThreadSafe() const override {
    // Always return true since we execute immediately
    return true;
  }
  
  const std::string& name() const override {
    return name_;
  }
  
  TimerPtr createTimer(TimerCallback callback,
                       std::chrono::milliseconds timeout) override {
    // For immediate dispatcher, just create a timer that fires immediately
    auto timer = std::make_unique<SimpleTimer>();
    timer->enable();
    
    // Execute callback after timeout in a detached thread
    std::thread([callback, timeout]() {
      std::this_thread::sleep_for(timeout);
      callback();
    }).detach();
    
    return timer;
  }
  
  void run(RunMode mode) override {
    // No-op for immediate dispatcher
    (void)mode;
  }
  
  void exit() override {
    // No-op for immediate dispatcher
  }
  
 private:
  std::string name_;
};

}  // namespace core
}  // namespace orch
}  // namespace gopher