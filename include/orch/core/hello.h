#pragma once

#include <memory>
#include <string>

namespace gopher {
namespace orch {
namespace core {

// Hello class demonstrates basic gopher-orch functionality
// This is a simple example to verify the build system works correctly
class Hello {
 public:
  Hello();
  explicit Hello(const std::string& name);
  ~Hello();

  std::string greet() const;
  std::string greet_with_prefix(const std::string& prefix) const;

  void set_name(const std::string& name);
  const std::string& get_name() const;

  static std::string get_version();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

// Builder pattern for Hello class construction
class HelloBuilder {
 public:
  HelloBuilder& with_name(const std::string& name);
  HelloBuilder& with_greeting_style(const std::string& style);

  std::unique_ptr<Hello> build() const;

 private:
  std::string name_ = "World";
  std::string style_ = "default";
};

}  // namespace core
}  // namespace orch
}  // namespace gopher
