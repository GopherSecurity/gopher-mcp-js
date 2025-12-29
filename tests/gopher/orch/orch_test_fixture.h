#pragma once

// Shared test fixture for gopher-orch unit tests
// Provides common dispatcher setup and async helpers

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

// Use our dispatcher abstraction
#include "gopher/orch/core/dispatcher.h"

// Include the appropriate dispatcher implementation
#ifndef BUILD_WITHOUT_GOPHER_MCP
#include "gopher/orch/core/mcp_dispatcher_adapter.h"
#else
#include "gopher/orch/core/simple_dispatcher.h"
#endif

#include "gopher/orch/orch.h"
#include "gtest/gtest.h"

using namespace gopher::orch;
using namespace gopher::orch::core;
using namespace gopher::orch::composition;
using namespace gopher::orch::resilience;
using namespace gopher::orch::server;

// Test fixture with dispatcher
class OrchTest : public ::testing::Test {
 protected:
  void SetUp() override {
#ifndef BUILD_WITHOUT_GOPHER_MCP
    // Use MCP dispatcher when available
    dispatcher_ = std::make_unique<MCPDispatcherAdapter>("test");
#else
    // Use simple dispatcher for standalone testing
    dispatcher_ = std::make_unique<SimpleDispatcher>("test");
#endif
  }

  void TearDown() override { dispatcher_.reset(); }

  // Run dispatcher until callback completes
  template <typename T>
  T runToCompletion(
      std::function<void(Dispatcher&, ResultCallback<T>)> operation) {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    Result<T> result = Result<T>(Error(-1, "Not completed"));

    operation(*dispatcher_, [&](Result<T> r) {
      std::lock_guard<std::mutex> lock(mutex);
      result = std::move(r);
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
      dispatcher_->run(Dispatcher::RunMode::NonBlock);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    EXPECT_TRUE(result.hasValue())
        << "Operation failed: " << result.error().message;
    return result.value();
  }

  // Run dispatcher until callback completes (allow error)
  template <typename T>
  Result<T> runToCompletionResult(
      std::function<void(Dispatcher&, ResultCallback<T>)> operation) {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    Result<T> result = Result<T>(Error(-1, "Not completed"));

    operation(*dispatcher_, [&](Result<T> r) {
      std::lock_guard<std::mutex> lock(mutex);
      result = std::move(r);
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
      dispatcher_->run(Dispatcher::RunMode::NonBlock);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    return result;
  }

  std::unique_ptr<Dispatcher> dispatcher_;
};
