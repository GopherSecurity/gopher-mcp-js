#pragma once

// GraphState - State container for StateGraph workflows
//
// Design principles:
// - Channel-based state management with optional reducers
// - Version tracking for change detection
// - JSON serialization for persistence and debugging
// - Thread-safe for concurrent node execution in Pregel model

#include <functional>
#include <map>
#include <string>
#include <vector>

#include "gopher/orch/core/types.h"

namespace gopher {
namespace orch {
namespace graph {

using namespace gopher::orch::core;

// =============================================================================
// StateChannel - Manages a single piece of state with optional reducer
// =============================================================================
//
// Reducers enable accumulating results from multiple parallel nodes.
// Without a reducer, last-write-wins semantics apply.
//
// Example reducers:
// - Append reducer for messages: [](a, b) { return concat(a, b); }
// - Max reducer for scores: [](a, b) { return max(a, b); }
// - Merge reducer for objects: [](a, b) { return merge(a, b); }

template <typename T>
class StateChannel {
 public:
  using Reducer = std::function<T(const T&, const T&)>;

  // Default constructor: last-write-wins semantics
  StateChannel() : has_value_(false), version_(0), reducer_(nullptr) {}

  // Constructor with reducer: values are combined using the reducer function
  explicit StateChannel(Reducer reducer)
      : has_value_(false), version_(0), reducer_(std::move(reducer)) {}

  // Apply an update to this channel
  // If a reducer is set and we have a previous value, combine them
  // Otherwise, just store the new value
  void update(const T& new_value) {
    if (reducer_ && has_value_) {
      value_ = reducer_(value_, new_value);
    } else {
      value_ = new_value;
      has_value_ = true;
    }
    version_++;
  }

  // Get the current value
  const T& value() const { return value_; }

  // Check if this channel has been set
  bool hasValue() const { return has_value_; }

  // Get the version number (incremented on each update)
  uint64_t version() const { return version_; }

  // Reset the channel to its initial state
  void reset() {
    value_ = T();
    has_value_ = false;
    version_ = 0;
  }

 private:
  T value_;
  bool has_value_;
  uint64_t version_;
  Reducer reducer_;
};

// =============================================================================
// JsonReducer - Common reducers for JsonValue channels
// =============================================================================

namespace reducers {

// Last-write-wins (default behavior)
inline JsonValue lastWriteWins(const JsonValue& /* old_value */,
                               const JsonValue& new_value) {
  return new_value;
}

// Append arrays: [1, 2] + [3, 4] = [1, 2, 3, 4]
inline JsonValue appendArray(const JsonValue& old_value,
                             const JsonValue& new_value) {
  if (!old_value.isArray() || !new_value.isArray()) {
    return new_value;
  }
  JsonValue result = JsonValue::array();
  for (size_t i = 0; i < old_value.size(); ++i) {
    result.push_back(old_value[i]);
  }
  for (size_t i = 0; i < new_value.size(); ++i) {
    result.push_back(new_value[i]);
  }
  return result;
}

// Merge objects (shallow): {a: 1} + {b: 2} = {a: 1, b: 2}
inline JsonValue mergeObjects(const JsonValue& old_value,
                              const JsonValue& new_value) {
  if (!old_value.isObject() || !new_value.isObject()) {
    return new_value;
  }
  JsonValue result = old_value;
  for (const auto& key : new_value.keys()) {
    result[key] = new_value[key];
  }
  return result;
}

}  // namespace reducers

// =============================================================================
// ChannelConfig - Configuration for a state channel
// =============================================================================

struct ChannelConfig {
  using Reducer = std::function<JsonValue(const JsonValue&, const JsonValue&)>;

  // Optional reducer function for combining values
  Reducer reducer;

  // Default value when channel is not set
  JsonValue default_value;

  ChannelConfig() : reducer(nullptr), default_value(JsonValue::null()) {}

  explicit ChannelConfig(Reducer r)
      : reducer(std::move(r)), default_value(JsonValue::null()) {}

  ChannelConfig(Reducer r, JsonValue def)
      : reducer(std::move(r)), default_value(std::move(def)) {}
};

// =============================================================================
// GraphState - Container for all state channels
// =============================================================================
//
// GraphState holds all the data flowing through a StateGraph.
// Each key maps to a channel that can have an optional reducer.
//
// Lifecycle:
// 1. Create from input JSON
// 2. Nodes read state, produce updates
// 3. Updates are merged (using reducers if configured)
// 4. Final state is serialized to JSON

class GraphState {
 public:
  using Reducer = std::function<JsonValue(const JsonValue&, const JsonValue&)>;

  GraphState() = default;

  // Configure a channel with a reducer
  // Must be called before any updates to that channel
  void configureChannel(const std::string& key, Reducer reducer) {
    reducers_[key] = std::move(reducer);
  }

  // Configure a channel with default value
  void configureChannel(const std::string& key, Reducer reducer,
                        const JsonValue& default_value) {
    reducers_[key] = std::move(reducer);
    channels_[key] = default_value;
    versions_[key] = 0;
  }

  // Set a value by key (applies reducer if configured)
  void set(const std::string& key, const JsonValue& value) {
    auto reducer_it = reducers_.find(key);
    auto existing_it = channels_.find(key);

    if (reducer_it != reducers_.end() && existing_it != channels_.end() &&
        reducer_it->second) {
      // Apply reducer to combine old and new values
      channels_[key] = reducer_it->second(existing_it->second, value);
    } else {
      // Last-write-wins
      channels_[key] = value;
    }
    versions_[key]++;
  }

  // Get a value by key (returns null if not found)
  JsonValue get(const std::string& key) const {
    auto it = channels_.find(key);
    if (it == channels_.end()) {
      return JsonValue::null();
    }
    return it->second;
  }

  // Check if key exists
  bool has(const std::string& key) const {
    return channels_.find(key) != channels_.end();
  }

  // Get version of a key (0 if never set)
  uint64_t version(const std::string& key) const {
    auto it = versions_.find(key);
    return it != versions_.end() ? it->second : 0;
  }

  // Get all keys
  std::vector<std::string> keys() const {
    std::vector<std::string> result;
    result.reserve(channels_.size());
    for (const auto& entry : channels_) {
      result.push_back(entry.first);
    }
    return result;
  }

  // Serialize to JSON
  JsonValue toJson() const {
    JsonValue result = JsonValue::object();
    for (const auto& entry : channels_) {
      result[entry.first] = entry.second;
    }
    return result;
  }

  // Deserialize from JSON
  static GraphState fromJson(const JsonValue& json) {
    GraphState state;
    if (json.isObject()) {
      for (const auto& key : json.keys()) {
        state.channels_[key] = json[key];
        state.versions_[key] = 1;
      }
    }
    return state;
  }

  // Merge another state into this one (respects reducers)
  void merge(const GraphState& other) {
    for (const auto& entry : other.channels_) {
      set(entry.first, entry.second);
    }
  }

  // Create a copy with the same reducer configuration
  GraphState copy() const {
    GraphState result;
    result.channels_ = channels_;
    result.versions_ = versions_;
    result.reducers_ = reducers_;
    return result;
  }

 private:
  std::map<std::string, JsonValue> channels_;
  std::map<std::string, uint64_t> versions_;
  std::map<std::string, Reducer> reducers_;
};

// Callback type for graph node completion
using GraphStateCallback = std::function<void(Result<GraphState>)>;

}  // namespace graph
}  // namespace orch
}  // namespace gopher
