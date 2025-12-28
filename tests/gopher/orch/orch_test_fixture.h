#pragma once

// Shared test fixture for gopher-orch unit tests
// Provides common dispatcher setup and async helpers

#include "gopher/orch/orch.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

#include "mcp/event/libevent_dispatcher.h"

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
    dispatcher_ = std::make_unique<mcp::event::LibeventDispatcher>("test");
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
      dispatcher_->run(mcp::event::RunType::NonBlock);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    EXPECT_TRUE(mcp::holds_alternative<T>(result))
        << "Operation failed: " << mcp::get<Error>(result).message;
    return mcp::get<T>(result);
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
      dispatcher_->run(mcp::event::RunType::NonBlock);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    return result;
  }

  std::unique_ptr<mcp::event::LibeventDispatcher> dispatcher_;
};
