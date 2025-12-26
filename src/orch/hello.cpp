#include "orch/core/hello.h"
#include "orch/core/version.h"
#include <sstream>

namespace orch {
namespace core {

class Hello::Impl {
public:
  Impl() : name_("World") {}
  explicit Impl(const std::string &name) : name_(name) {}

  std::string name_;
};

Hello::Hello() : impl_(std::make_unique<Impl>()) {}

Hello::Hello(const std::string &name) : impl_(std::make_unique<Impl>(name)) {}

Hello::~Hello() = default;

std::string Hello::greet() const {
  std::ostringstream oss;
  oss << "Hello, " << impl_->name_ << "!";
  return oss.str();
}

std::string Hello::greet_with_prefix(const std::string &prefix) const {
  std::ostringstream oss;
  oss << prefix << " " << impl_->name_ << "!";
  return oss.str();
}

void Hello::set_name(const std::string &name) { impl_->name_ = name; }

const std::string &Hello::get_name() const { return impl_->name_; }

std::string Hello::get_version() { return Version::string(); }

HelloBuilder &HelloBuilder::with_name(const std::string &name) {
  name_ = name;
  return *this;
}

HelloBuilder &HelloBuilder::with_greeting_style(const std::string &style) {
  style_ = style;
  return *this;
}

std::unique_ptr<Hello> HelloBuilder::build() const {
  return std::make_unique<Hello>(name_);
}

} // namespace core
} // namespace orch
