/**
 * @file mcp_client_example.cc
 * @brief Example demonstrating gopher-orch integration with gopher-mcp
 *
 * This example shows how gopher-orch can extend and use gopher-mcp
 * functionality. It demonstrates:
 * 1. Using gopher-orch's Hello class
 * 2. Using gopher-mcp types and utilities
 * 3. Integration between both libraries
 */

#include <chrono>
#include <iostream>
#include <thread>

// gopher-orch includes
#include "orch/core/hello.h"
#include "orch/core/version.h"

// gopher-mcp includes
#include "mcp/json/json_bridge.h"
#include "mcp/types.h"

using namespace orch::core;
using namespace mcp;

int main(int argc, char* argv[]) {
  std::cout << "=== gopher-orch + gopher-mcp Integration Example ==="
            << std::endl;
  std::cout << std::endl;

  // Show versions
  std::cout << "Versions:" << std::endl;
  std::cout << "  gopher-orch: " << Version::string() << std::endl;
  std::cout << std::endl;

  // Demonstrate gopher-orch Hello class
  std::cout << "1. gopher-orch Hello class:" << std::endl;
  Hello hello("MCP User");
  std::cout << "   " << hello.greet() << std::endl;
  std::cout << std::endl;

  // Demonstrate gopher-mcp types
  std::cout << "2. gopher-mcp types:" << std::endl;

  // Create a Tool definition
  Tool calculator_tool;
  calculator_tool.name = "calculator";
  calculator_tool.description = make_optional(
      std::string("A simple calculator tool for basic arithmetic"));

  // Create input schema
  json::JsonValue schema;
  schema["type"] = "object";
  schema["properties"]["operation"]["type"] = "string";
  schema["properties"]["a"]["type"] = "number";
  schema["properties"]["b"]["type"] = "number";

  auto required_arr = json::JsonValue::array();
  required_arr.push_back("operation");
  required_arr.push_back("a");
  required_arr.push_back("b");
  schema["required"] = required_arr;

  calculator_tool.inputSchema = make_optional(schema);

  std::cout << "   Created Tool: " << calculator_tool.name << std::endl;
  if (calculator_tool.description.has_value()) {
    std::cout << "   Description: " << calculator_tool.description.value()
              << std::endl;
  }
  std::cout << std::endl;

  // Create a Resource definition
  Resource sample_resource;
  sample_resource.uri = "file:///example/data.json";
  sample_resource.name = "Example Data";
  sample_resource.description =
      make_optional(std::string("Sample JSON data resource for testing"));
  sample_resource.mimeType = make_optional(std::string("application/json"));

  std::cout << "3. MCP Resource:" << std::endl;
  std::cout << "   URI: " << sample_resource.uri << std::endl;
  std::cout << "   Name: " << sample_resource.name << std::endl;
  if (sample_resource.mimeType.has_value()) {
    std::cout << "   MIME Type: " << sample_resource.mimeType.value()
              << std::endl;
  }
  std::cout << std::endl;

  // Create a Prompt definition
  Prompt greeting_prompt;
  greeting_prompt.name = "greeting";
  greeting_prompt.description =
      make_optional(std::string("A simple greeting prompt"));

  PromptArgument name_arg;
  name_arg.name = "name";
  name_arg.description = make_optional(std::string("The name to greet"));
  name_arg.required = true;

  greeting_prompt.arguments =
      make_optional(std::vector<PromptArgument>{name_arg});

  std::cout << "4. MCP Prompt:" << std::endl;
  std::cout << "   Name: " << greeting_prompt.name << std::endl;
  if (greeting_prompt.description.has_value()) {
    std::cout << "   Description: " << greeting_prompt.description.value()
              << std::endl;
  }
  if (greeting_prompt.arguments.has_value()) {
    std::cout << "   Arguments: " << greeting_prompt.arguments.value().size()
              << std::endl;
    for (const auto& arg : greeting_prompt.arguments.value()) {
      std::cout << "     - " << arg.name;
      if (arg.required) {
        std::cout << " (required)";
      }
      std::cout << std::endl;
    }
  }
  std::cout << std::endl;

  // Demonstrate JSON serialization
  std::cout << "5. JSON Operations:" << std::endl;
  json::JsonValue data;
  data["greeting"] = hello.greet();
  data["version"] = Version::string();
  data["tool_count"] = 1;
  data["resource_count"] = 1;

  std::cout << "   Created JSON object with greeting and version info"
            << std::endl;
  std::cout << std::endl;

  // Integration example: Using gopher-orch to enhance gopher-mcp
  std::cout << "6. Integration Example:" << std::endl;
  HelloBuilder builder;
  auto orchestrator = builder.with_name("MCP Orchestrator").build();
  std::cout << "   " << orchestrator->greet() << std::endl;
  std::cout
      << "   This demonstrates gopher-orch extending gopher-mcp capabilities"
      << std::endl;
  std::cout << std::endl;

  std::cout << "=== Example Complete ===" << std::endl;
  std::cout
      << "The gopher-orch library successfully integrates with gopher-mcp!"
      << std::endl;

  return 0;
}
