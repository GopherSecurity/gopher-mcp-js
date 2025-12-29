#pragma once

// Dispatcher abstraction for gopher-orch framework
// Provides a minimal interface for event loop and callback posting
// This allows gopher-orch to work with different dispatcher implementations

#include <chrono>
#include <functional>
#include <memory>
#include <string>

namespace gopher {
namespace orch {
namespace core {

// Forward declarations
class Timer;
using TimerPtr = std::unique_ptr<Timer>;
using PostCallback = std::function<void()>;
using TimerCallback = std::function<void()>;

// Timer interface for scheduled callbacks
class Timer {
 public:
  virtual ~Timer() = default;
  
  // Enable/disable the timer
  virtual void enable() = 0;
  virtual void disable() = 0;
  
  // Check if timer is enabled
  virtual bool enabled() const = 0;
};

// Dispatcher interface - minimal abstraction for event loop
// All gopher-orch components use this interface instead of concrete implementations
class Dispatcher {
 public:
  virtual ~Dispatcher() = default;
  
  // Post a callback to be executed in the dispatcher thread
  // Thread-safe: can be called from any thread
  virtual void post(PostCallback callback) = 0;
  
  // Check if the current thread is the dispatcher thread
  virtual bool isThreadSafe() const = 0;
  
  // Get the name of this dispatcher (for debugging)
  virtual const std::string& name() const = 0;
  
  // Create a timer that fires after the specified duration
  // The callback will be invoked in the dispatcher thread
  virtual TimerPtr createTimer(TimerCallback callback,
                                std::chrono::milliseconds timeout) = 0;
  
  // Run the dispatcher (for testing and standalone usage)
  enum class RunMode {
    Block,     // Run until exit() is called
    NonBlock,  // Process pending events and return
    Once       // Process one event and return
  };
  
  virtual void run(RunMode mode = RunMode::Block) = 0;
  
  // Exit the dispatcher (causes run() to return)
  virtual void exit() = 0;
};

using DispatcherPtr = std::unique_ptr<Dispatcher>;

// Factory for creating dispatcher instances
class DispatcherFactory {
 public:
  virtual ~DispatcherFactory() = default;
  
  // Create a new dispatcher instance
  virtual DispatcherPtr createDispatcher(const std::string& name) = 0;
  
  // Get the name of this factory's backend
  virtual const std::string& backendName() const = 0;
};

using DispatcherFactoryPtr = std::unique_ptr<DispatcherFactory>;

}  // namespace core
}  // namespace orch
}  // namespace gopher