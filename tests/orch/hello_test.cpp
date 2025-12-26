#include "orch/core/hello.h"
#include "orch/core/version.h"
#include <gmock/gmock.h>
#include <gtest/gtest.h>

using namespace orch::core;
using namespace testing;

class HelloTest : public ::testing::Test {
protected:
  void SetUp() override {
    // Setup code if needed
  }

  void TearDown() override {
    // Teardown code if needed
  }
};

TEST_F(HelloTest, DefaultConstructor) {
  Hello hello;
  EXPECT_EQ(hello.greet(), "Hello, World!");
  EXPECT_EQ(hello.get_name(), "World");
}

TEST_F(HelloTest, ParameterizedConstructor) {
  Hello hello("Alice");
  EXPECT_EQ(hello.greet(), "Hello, Alice!");
  EXPECT_EQ(hello.get_name(), "Alice");
}

TEST_F(HelloTest, SetName) {
  Hello hello;
  hello.set_name("Bob");
  EXPECT_EQ(hello.greet(), "Hello, Bob!");
  EXPECT_EQ(hello.get_name(), "Bob");
}

TEST_F(HelloTest, GreetWithPrefix) {
  Hello hello("Charlie");
  EXPECT_EQ(hello.greet_with_prefix("Hi"), "Hi Charlie!");
  EXPECT_EQ(hello.greet_with_prefix("Welcome"), "Welcome Charlie!");
}

TEST_F(HelloTest, GetVersion) { EXPECT_EQ(Hello::get_version(), "0.1.0"); }

TEST_F(HelloTest, EmptyName) {
  Hello hello("");
  EXPECT_EQ(hello.greet(), "Hello, !");
  EXPECT_EQ(hello.get_name(), "");
}

TEST_F(HelloTest, SpecialCharacters) {
  Hello hello("User@123!");
  EXPECT_EQ(hello.greet(), "Hello, User@123!!");
  EXPECT_EQ(hello.get_name(), "User@123!");
}

TEST_F(HelloTest, LongName) {
  std::string long_name(1000, 'a');
  Hello hello(long_name);
  EXPECT_EQ(hello.get_name(), long_name);
  EXPECT_THAT(hello.greet(), StartsWith("Hello, "));
  EXPECT_THAT(hello.greet(), EndsWith("!"));
}

// Test HelloBuilder
class HelloBuilderTest : public ::testing::Test {
protected:
  HelloBuilder builder;
};

TEST_F(HelloBuilderTest, DefaultBuild) {
  auto hello = builder.build();
  EXPECT_EQ(hello->greet(), "Hello, World!");
}

TEST_F(HelloBuilderTest, WithName) {
  auto hello = builder.with_name("Diana").build();
  EXPECT_EQ(hello->greet(), "Hello, Diana!");
}

TEST_F(HelloBuilderTest, ChainedCalls) {
  auto hello = builder.with_name("Eve").with_greeting_style("formal").build();
  EXPECT_EQ(hello->greet(), "Hello, Eve!");
}

TEST_F(HelloBuilderTest, MultipleBuildsSameBuilder) {
  builder.with_name("Frank");
  auto hello1 = builder.build();
  auto hello2 = builder.build();

  EXPECT_EQ(hello1->greet(), "Hello, Frank!");
  EXPECT_EQ(hello2->greet(), "Hello, Frank!");

  // Verify they are independent objects
  hello1->set_name("George");
  EXPECT_EQ(hello1->get_name(), "George");
  EXPECT_EQ(hello2->get_name(), "Frank");
}

// Version tests
TEST(VersionTest, VersionConstants) {
  EXPECT_EQ(Version::major(), 0);
  EXPECT_EQ(Version::minor(), 1);
  EXPECT_EQ(Version::patch(), 0);
  EXPECT_STREQ(Version::string(), "0.1.0");
}
