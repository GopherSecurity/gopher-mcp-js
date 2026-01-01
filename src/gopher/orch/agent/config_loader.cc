// ConfigLoader Implementation - File I/O operations

#include "gopher/orch/agent/config_loader.h"

#include <fstream>
#include <sstream>

namespace gopher {
namespace orch {
namespace agent {

VoidResult ConfigLoader::loadEnvFile(const std::string& path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    return VoidResult(Error(-1, "Cannot open .env file: " + path));
  }

  std::string line;
  while (std::getline(file, line)) {
    // Skip empty lines and comments
    if (line.empty() || line[0] == '#') {
      continue;
    }

    // Find the = separator
    auto pos = line.find('=');
    if (pos == std::string::npos) {
      continue;
    }

    std::string key = line.substr(0, pos);
    std::string value = line.substr(pos + 1);

    // Trim whitespace
    while (!key.empty() && std::isspace(key.back()))
      key.pop_back();
    while (!key.empty() && std::isspace(key.front()))
      key.erase(0, 1);
    while (!value.empty() && std::isspace(value.back()))
      value.pop_back();
    while (!value.empty() && std::isspace(value.front()))
      value.erase(0, 1);

    // Remove quotes if present
    if (value.size() >= 2) {
      if ((value.front() == '"' && value.back() == '"') ||
          (value.front() == '\'' && value.back() == '\'')) {
        value = value.substr(1, value.size() - 2);
      }
    }

    if (!key.empty()) {
      env_vars_[key] = value;
    }
  }

  return VoidResult(nullptr);
}

Result<RegistryConfig> ConfigLoader::loadFromFile(const std::string& path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    return Result<RegistryConfig>(
        Error(-1, "Cannot open config file: " + path));
  }

  std::stringstream buffer;
  buffer << file.rdbuf();

  return loadFromString(buffer.str());
}

}  // namespace agent
}  // namespace orch
}  // namespace gopher
