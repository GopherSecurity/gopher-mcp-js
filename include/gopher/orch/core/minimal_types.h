#pragma once

// Minimal type definitions for standalone build (without MCP)
// Provides basic implementations of Result, Error, optional, etc.

#include <memory>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>
#include <cstdlib> // for std::to_string

namespace gopher {
namespace orch {
namespace core {

// Forward declarations
struct nullopt_t {};
constexpr nullopt_t nullopt{};

// Simple Error type
struct Error {
  int code;
  std::string message;
  
  Error(int c = 0, const std::string& msg = "") 
      : code(c), message(msg) {}
};

// Simple Result type - stores either value or error
template <typename T>
class Result {
 public:
  // Success constructor - disabled if T is Error
  template<typename U = T>
  explicit Result(U value, 
                  typename std::enable_if<!std::is_same<U, Error>::value>::type* = nullptr) 
      : has_value_(true) {
    new (&storage_) T(std::move(value));
  }
  
  // Error constructor
  explicit Result(Error error)
      : has_value_(false) {
    new (&error_storage_) Error(std::move(error));
  }
  
  // Copy constructor
  Result(const Result& other) : has_value_(other.has_value_) {
    if (has_value_) {
      new (&storage_) T(other.value());
    } else {
      new (&error_storage_) Error(other.error());
    }
  }
  
  // Move constructor
  Result(Result&& other) : has_value_(other.has_value_) {
    if (has_value_) {
      new (&storage_) T(std::move(other.value()));
    } else {
      new (&error_storage_) Error(std::move(other.error()));
    }
  }
  
  // Destructor
  ~Result() {
    if (has_value_) {
      reinterpret_cast<T*>(&storage_)->~T();
    } else {
      reinterpret_cast<Error*>(&error_storage_)->~Error();
    }
  }
  
  // Assignment operators
  Result& operator=(const Result& other) {
    if (this != &other) {
      this->~Result();
      new (this) Result(other);
    }
    return *this;
  }
  
  Result& operator=(Result&& other) {
    if (this != &other) {
      this->~Result();
      new (this) Result(std::move(other));
    }
    return *this;
  }
  
  // Check if result contains a value
  bool hasValue() const { return has_value_; }
  bool hasError() const { return !has_value_; }
  
  // Get value (undefined behavior if hasError())
  T& value() { 
    return *reinterpret_cast<T*>(&storage_);
  }
  const T& value() const {
    return *reinterpret_cast<const T*>(&storage_);
  }
  
  // Get error (undefined behavior if hasValue())
  Error& error() {
    return *reinterpret_cast<Error*>(&error_storage_);
  }
  const Error& error() const {
    return *reinterpret_cast<const Error*>(&error_storage_);
  }
  
 private:
  bool has_value_;
  typename std::aligned_storage<sizeof(T), alignof(T)>::type storage_;
  typename std::aligned_storage<sizeof(Error), alignof(Error)>::type error_storage_;
};

// Simple optional type
template <typename T>
class optional {
 public:
  optional() : has_value_(false) {}
  
  optional(nullopt_t) : has_value_(false) {}
  
  explicit optional(T value)
      : has_value_(true), value_(std::move(value)) {}
  
  bool has_value() const { return has_value_; }
  
  T& value() { return value_; }
  const T& value() const { return value_; }
  
  T& operator*() { return value_; }
  const T& operator*() const { return value_; }
  
  T* operator->() { return &value_; }
  const T* operator->() const { return &value_; }
  
  explicit operator bool() const { return has_value_; }
  
  // Assignment operators
  optional& operator=(nullopt_t) {
    has_value_ = false;
    return *this;
  }
  
  optional& operator=(const T& value) {
    has_value_ = true;
    value_ = value;
    return *this;
  }
  
  optional& operator=(T&& value) {
    has_value_ = true;
    value_ = std::move(value);
    return *this;
  }
  
 private:
  bool has_value_;
  T value_;
};

// Helper for creating optional
template <typename T>
optional<T> make_optional(T value) {
  return optional<T>(std::move(value));
}

// Simple JSON value type
class JsonValue {
 public:
  enum Type {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object
  };
  
  JsonValue() : type_(Null) {}
  
  // Copy constructor
  JsonValue(const JsonValue& other) 
      : type_(other.type_), 
        bool_value_(other.bool_value_),
        number_value_(other.number_value_),
        string_value_(other.string_value_),
        array_values_(other.array_values_),
        object_values_(other.object_values_) {}
  
  explicit JsonValue(bool b) : type_(Bool), bool_value_(b) {}
  explicit JsonValue(double n) : type_(Number), number_value_(n) {}
  explicit JsonValue(int n) : type_(Number), number_value_(n) {}
  JsonValue(const std::string& s) : type_(String), string_value_(s) {}
  JsonValue(const char* s) : type_(String), string_value_(s) {}
  
  // Assignment operators for convenient use
  JsonValue& operator=(bool b) {
    type_ = Bool;
    bool_value_ = b;
    return *this;
  }
  
  JsonValue& operator=(int n) {
    type_ = Number;
    number_value_ = n;
    return *this;
  }
  
  JsonValue& operator=(double n) {
    type_ = Number;
    number_value_ = n;
    return *this;
  }
  
  JsonValue& operator=(const std::string& s) {
    type_ = String;
    string_value_ = s;
    return *this;
  }
  
  JsonValue& operator=(const char* s) {
    type_ = String;
    string_value_ = s;
    return *this;
  }
  
  static JsonValue null() { return JsonValue(); }
  static JsonValue array() { 
    JsonValue v;
    v.type_ = Array;
    return v;
  }
  static JsonValue object() {
    JsonValue v;
    v.type_ = Object;
    return v;
  }
  
  Type type() const { return type_; }
  
  bool isNull() const { return type_ == Null; }
  bool isBool() const { return type_ == Bool; }
  bool isNumber() const { return type_ == Number; }
  bool isString() const { return type_ == String; }
  bool isArray() const { return type_ == Array; }
  bool isObject() const { return type_ == Object; }
  
  // Basic accessors (simplified)
  bool getBool() const { return bool_value_; }
  double getNumber() const { return number_value_; }
  int getInt() const { return static_cast<int>(number_value_); }
  const std::string& getString() const { return string_value_; }
  
  // Convert to string representation
  std::string toString() const {
    switch (type_) {
      case Null: return "null";
      case Bool: return bool_value_ ? "true" : "false";
      case Number: return std::to_string(number_value_);
      case String: return string_value_;
      case Array: return "[array]";
      case Object: return "{object}";
      default: return "";
    }
  }
  
  // Array operations (simplified)
  size_t size() const { 
    return array_values_ ? array_values_->size() : 0;
  }
  
  void push_back(JsonValue value) {
    if (!array_values_) {
      array_values_ = std::make_shared<std::vector<JsonValue>>();
    }
    array_values_->push_back(std::move(value));
  }
  
  // Object operations (simplified)
  JsonValue& operator[](const std::string& key) {
    if (!object_values_) {
      object_values_ = std::make_shared<std::vector<std::pair<std::string, JsonValue>>>();
    }
    // Find or create
    for (auto& kv : *object_values_) {
      if (kv.first == key) {
        return kv.second;
      }
    }
    object_values_->push_back({key, JsonValue()});
    return object_values_->back().second;
  }
  
  const JsonValue& operator[](const std::string& key) const {
    static const JsonValue null_value;
    if (!object_values_) {
      return null_value;
    }
    for (const auto& kv : *object_values_) {
      if (kv.first == key) {
        return kv.second;
      }
    }
    return null_value;
  }
  
  // Array access operators
  JsonValue& operator[](size_t index) {
    if (!array_values_) {
      array_values_ = std::make_shared<std::vector<JsonValue>>();
    }
    if (index >= array_values_->size()) {
      array_values_->resize(index + 1);
    }
    return (*array_values_)[index];
  }
  
  const JsonValue& operator[](size_t index) const {
    static const JsonValue null_value;
    if (!array_values_ || index >= array_values_->size()) {
      return null_value;
    }
    return (*array_values_)[index];
  }
  
  std::vector<std::string> keys() const {
    std::vector<std::string> result;
    if (object_values_) {
      for (const auto& kv : *object_values_) {
        result.push_back(kv.first);
      }
    }
    return result;
  }
  
  // Check if object contains a key
  bool contains(const std::string& key) const {
    if (!object_values_) {
      return false;
    }
    for (const auto& kv : *object_values_) {
      if (kv.first == key) {
        return true;
      }
    }
    return false;
  }
  
  // Iterator support for object type
  using iterator = std::vector<std::pair<std::string, JsonValue>>::iterator;
  using const_iterator = std::vector<std::pair<std::string, JsonValue>>::const_iterator;
  
  iterator begin() {
    if (!object_values_) {
      static std::vector<std::pair<std::string, JsonValue>> empty;
      return empty.begin();
    }
    return object_values_->begin();
  }
  
  iterator end() {
    if (!object_values_) {
      static std::vector<std::pair<std::string, JsonValue>> empty;
      return empty.end();
    }
    return object_values_->end();
  }
  
  const_iterator begin() const {
    if (!object_values_) {
      static const std::vector<std::pair<std::string, JsonValue>> empty;
      return empty.begin();
    }
    return object_values_->begin();
  }
  
  const_iterator end() const {
    if (!object_values_) {
      static const std::vector<std::pair<std::string, JsonValue>> empty;
      return empty.end();
    }
    return object_values_->end();
  }
  
 private:
  Type type_;
  bool bool_value_ = false;
  double number_value_ = 0.0;
  std::string string_value_;
  std::shared_ptr<std::vector<JsonValue>> array_values_;
  std::shared_ptr<std::vector<std::pair<std::string, JsonValue>>> object_values_;
};

// Helper functions for Result type (to match MCP interface)
// Check if Result holds a value (not error)
template <typename T>
inline bool holds_alternative(const Result<T>& result) {
  return result.hasValue();
}

// Template version to check for specific type in Result
// Specialization for checking if Result contains Error
template <typename T>
inline bool holds_alternative_error(const Result<T>& result) {
  return result.hasError();
}

// Specialization for checking if Result contains value type
template <typename T>
inline bool holds_alternative_value(const Result<T>& result) {
  return result.hasValue();
}

template <typename T>
inline T& get(Result<T>& result) {
  if (result.hasError()) {
    return *static_cast<T*>(nullptr); // This will crash - matching MCP behavior
  }
  return result.value();
}

template <typename T>
inline const T& get(const Result<T>& result) {
  if (result.hasError()) {
    return *static_cast<const T*>(nullptr); // This will crash - matching MCP behavior
  }
  return result.value();
}

// Template to determine if type is Error
template<typename T>
struct is_error : std::false_type {};

template<>
struct is_error<Error> : std::true_type {};

// Generic get template
template <typename RequestedType, typename ResultType>
inline typename std::enable_if<!is_error<RequestedType>::value, RequestedType&>::type
get(Result<ResultType>& result) {
  return result.value();
}

template <typename RequestedType, typename ResultType>
inline typename std::enable_if<!is_error<RequestedType>::value, const RequestedType&>::type
get(const Result<ResultType>& result) {
  return result.value();
}

// Specialization for getting Error from Result
template <typename RequestedType, typename ResultType>
inline typename std::enable_if<is_error<RequestedType>::value, Error&>::type
get(Result<ResultType>& result) {
  return result.error();
}

template <typename RequestedType, typename ResultType>
inline typename std::enable_if<is_error<RequestedType>::value, const Error&>::type
get(const Result<ResultType>& result) {
  return result.error();
}

}  // namespace core
}  // namespace orch
}  // namespace gopher

// Bring core types into mcp namespace for compatibility
namespace mcp {
using gopher::orch::core::Error;
using gopher::orch::core::Result;
using gopher::orch::core::optional;
using gopher::orch::core::make_optional;
using gopher::orch::core::nullopt;

// Template functions need to be in the namespace
// For Result<T> when checking if it contains T (value)
template <typename T>
inline bool holds_alternative(const gopher::orch::core::Result<T>& result) {
  return result.hasValue();
}

// For getting the value type from Result
template <typename T>
inline T& get(gopher::orch::core::Result<T>& result) {
  return gopher::orch::core::get(result);
}

template <typename T>
inline const T& get(const gopher::orch::core::Result<T>& result) {
  return gopher::orch::core::get(result);
}

// Template specialization for getting specific type from Result
template <typename RequestedType, typename T>
inline typename std::enable_if<std::is_same<RequestedType, gopher::orch::core::Error>::value, gopher::orch::core::Error&>::type
get(gopher::orch::core::Result<T>& result) {
  return result.error();
}

template <typename RequestedType, typename T>
inline typename std::enable_if<std::is_same<RequestedType, gopher::orch::core::Error>::value, const gopher::orch::core::Error&>::type
get(const gopher::orch::core::Result<T>& result) {
  return result.error();
}

template <typename RequestedType, typename T>
inline typename std::enable_if<!std::is_same<RequestedType, gopher::orch::core::Error>::value && std::is_same<RequestedType, T>::value, T&>::type
get(gopher::orch::core::Result<T>& result) {
  return result.value();
}

template <typename RequestedType, typename T>
inline typename std::enable_if<!std::is_same<RequestedType, gopher::orch::core::Error>::value && std::is_same<RequestedType, T>::value, const T&>::type
get(const gopher::orch::core::Result<T>& result) {
  return result.value();
}

namespace json {
using JsonValue = gopher::orch::core::JsonValue;
}  // namespace json
}  // namespace mcp