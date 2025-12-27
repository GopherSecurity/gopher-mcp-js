#include <iostream>
#include <memory>
#include <vector>

#include "orch/core/hello.h"
#include "orch/core/version.h"

using namespace gopher::orch::core;

int main(int argc, char* argv[]) {
  std::cout << "gopher-orch version: " << Version::string() << std::endl;
  std::cout << "----------------------------------------" << std::endl;

  // Basic usage
  {
    std::cout << "\n1. Basic Hello usage:" << std::endl;
    Hello hello;
    std::cout << "   " << hello.greet() << std::endl;

    hello.set_name("gopher-orch User");
    std::cout << "   " << hello.greet() << std::endl;
  }

  // Constructor with parameter
  {
    std::cout << "\n2. Parameterized constructor:" << std::endl;
    Hello hello("Alice");
    std::cout << "   " << hello.greet() << std::endl;
  }

  // Custom prefix
  {
    std::cout << "\n3. Custom prefix greetings:" << std::endl;
    Hello hello("Bob");
    std::cout << "   " << hello.greet_with_prefix("Hi") << std::endl;
    std::cout << "   " << hello.greet_with_prefix("Welcome") << std::endl;
    std::cout << "   " << hello.greet_with_prefix("Greetings") << std::endl;
  }

  // Builder pattern
  {
    std::cout << "\n4. Using HelloBuilder:" << std::endl;
    HelloBuilder builder;

    auto hello1 = builder.with_name("Charlie").build();
    std::cout << "   " << hello1->greet() << std::endl;

    auto hello2 =
        builder.with_name("Diana").with_greeting_style("formal").build();
    std::cout << "   " << hello2->greet() << std::endl;
  }

  // Command line argument
  if (argc > 1) {
    std::cout << "\n5. Using command line argument:" << std::endl;
    Hello hello(argv[1]);
    std::cout << "   " << hello.greet() << std::endl;
  }

  // Multiple instances
  {
    std::cout << "\n6. Multiple instances:" << std::endl;
    std::vector<std::unique_ptr<Hello>> hellos;

    hellos.push_back(std::make_unique<Hello>("User1"));
    hellos.push_back(std::make_unique<Hello>("User2"));
    hellos.push_back(std::make_unique<Hello>("User3"));

    for (const auto& hello : hellos) {
      std::cout << "   " << hello->greet() << std::endl;
    }
  }

  std::cout << "\n----------------------------------------" << std::endl;
  std::cout << "Example completed successfully!" << std::endl;

  return 0;
}
