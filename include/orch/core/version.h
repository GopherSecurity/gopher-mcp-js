#pragma once

#define GOPHER_ORCH_VERSION_MAJOR 0
#define GOPHER_ORCH_VERSION_MINOR 1
#define GOPHER_ORCH_VERSION_PATCH 0

#define GOPHER_ORCH_VERSION_STRING "0.1.0"

namespace gopher {
namespace orch {
namespace core {

struct Version {
  static constexpr int major() { return GOPHER_ORCH_VERSION_MAJOR; }
  static constexpr int minor() { return GOPHER_ORCH_VERSION_MINOR; }
  static constexpr int patch() { return GOPHER_ORCH_VERSION_PATCH; }
  static const char* string() { return GOPHER_ORCH_VERSION_STRING; }
};

}  // namespace core
}  // namespace orch
}  // namespace gopher
