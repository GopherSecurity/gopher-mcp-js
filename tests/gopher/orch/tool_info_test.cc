// Unit tests for ToolInfo JSON serialization and deserialization

#include <gtest/gtest.h>
#include "gopher/orch/server/server.h"

using namespace gopher::orch::server;
using namespace gopher::orch::core;
using mcp::json::JsonValue;

class ToolInfoTest : public ::testing::Test {
 protected:
  void SetUp() override {
    // Setup code if needed
  }

  void TearDown() override {
    // Cleanup code if needed
  }
};

// =============================================================================
// Basic ToolInfo Tests
// =============================================================================

TEST_F(ToolInfoTest, DefaultConstructor) {
  ToolInfo info;
  EXPECT_TRUE(info.name.empty());
  EXPECT_TRUE(info.description.empty());
  EXPECT_TRUE(info.inputSchema.isObject());
  EXPECT_FALSE(info.metadata.has_value());
}

TEST_F(ToolInfoTest, ParameterizedConstructor) {
  ToolInfo info("test_tool", "A test tool");
  EXPECT_EQ(info.name, "test_tool");
  EXPECT_EQ(info.description, "A test tool");
  EXPECT_TRUE(info.inputSchema.isObject());
  EXPECT_FALSE(info.metadata.has_value());
}

// =============================================================================
// JSON Serialization Tests
// =============================================================================

TEST_F(ToolInfoTest, ToJsonBasic) {
  ToolInfo info("calculator", "Performs calculations");
  
  JsonValue json = info.toJson();
  
  EXPECT_TRUE(json.isObject());
  EXPECT_TRUE(json.contains("name"));
  EXPECT_TRUE(json.contains("description"));
  EXPECT_EQ(json["name"].getString(), "calculator");
  EXPECT_EQ(json["description"].getString(), "Performs calculations");
}

TEST_F(ToolInfoTest, ToJsonWithInputSchema) {
  ToolInfo info("math_tool", "Math operations");
  
  // Create a simple JSON schema
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("object");
  JsonValue properties = JsonValue::object();
  properties["operation"] = JsonValue::object();
  properties["operation"]["type"] = JsonValue("string");
  properties["operation"]["enum"] = JsonValue::array();
  properties["operation"]["enum"].push_back(JsonValue("add"));
  properties["operation"]["enum"].push_back(JsonValue("subtract"));
  schema["properties"] = properties;
  
  info.inputSchema = schema;
  
  JsonValue json = info.toJson();
  
  EXPECT_TRUE(json.contains("inputSchema"));
  EXPECT_TRUE(json["inputSchema"].isObject());
  EXPECT_EQ(json["inputSchema"]["type"].getString(), "object");
  EXPECT_TRUE(json["inputSchema"]["properties"]["operation"]["enum"].isArray());
  EXPECT_EQ(json["inputSchema"]["properties"]["operation"]["enum"].size(), 2);
}

TEST_F(ToolInfoTest, ToJsonWithMetadata) {
  ToolInfo info("advanced_tool", "Tool with metadata");
  
  std::map<std::string, JsonValue> metadata;
  metadata["version"] = JsonValue("1.0.0");
  metadata["author"] = JsonValue("test_author");
  metadata["tags"] = JsonValue::array();
  metadata["tags"].push_back(JsonValue("tag1"));
  metadata["tags"].push_back(JsonValue("tag2"));
  
  info.metadata = make_optional(metadata);
  
  JsonValue json = info.toJson();
  
  EXPECT_TRUE(json.contains("metadata"));
  EXPECT_TRUE(json["metadata"].isObject());
  EXPECT_EQ(json["metadata"]["version"].getString(), "1.0.0");
  EXPECT_EQ(json["metadata"]["author"].getString(), "test_author");
  EXPECT_TRUE(json["metadata"]["tags"].isArray());
  EXPECT_EQ(json["metadata"]["tags"].size(), 2);
  EXPECT_EQ(json["metadata"]["tags"][0].getString(), "tag1");
  EXPECT_EQ(json["metadata"]["tags"][1].getString(), "tag2");
}

// =============================================================================
// JSON Deserialization Tests
// =============================================================================

TEST_F(ToolInfoTest, FromJsonMinimal) {
  JsonValue json = JsonValue::object();
  json["name"] = JsonValue("minimal_tool");
  
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo info = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info.name, "minimal_tool");
  EXPECT_TRUE(info.description.empty());
  EXPECT_TRUE(info.inputSchema.isObject());
  EXPECT_FALSE(info.metadata.has_value());
}

TEST_F(ToolInfoTest, FromJsonComplete) {
  JsonValue json = JsonValue::object();
  json["name"] = JsonValue("complete_tool");
  json["description"] = JsonValue("A complete tool example");
  
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("object");
  json["inputSchema"] = schema;
  
  JsonValue metadata = JsonValue::object();
  metadata["version"] = JsonValue("2.0.0");
  json["metadata"] = metadata;
  
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo info = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info.name, "complete_tool");
  EXPECT_EQ(info.description, "A complete tool example");
  EXPECT_TRUE(info.inputSchema.isObject());
  EXPECT_EQ(info.inputSchema["type"].getString(), "object");
  ASSERT_TRUE(info.metadata.has_value());
  EXPECT_EQ(info.metadata.value()["version"].getString(), "2.0.0");
}

TEST_F(ToolInfoTest, FromJsonInvalidNoName) {
  JsonValue json = JsonValue::object();
  json["description"] = JsonValue("Missing name");
  
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<Error>(result));
  const Error& error = mcp::get<Error>(result);
  EXPECT_EQ(error.code, OrchError::INVALID_ARGUMENT);
  EXPECT_NE(error.message.find("name"), std::string::npos);
}

TEST_F(ToolInfoTest, FromJsonInvalidNotObject) {
  JsonValue json = JsonValue::array();
  
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<Error>(result));
  const Error& error = mcp::get<Error>(result);
  EXPECT_EQ(error.code, OrchError::INVALID_ARGUMENT);
  EXPECT_NE(error.message.find("object"), std::string::npos);
}

TEST_F(ToolInfoTest, FromJsonInvalidDescriptionType) {
  JsonValue json = JsonValue::object();
  json["name"] = JsonValue("test");
  json["description"] = JsonValue(123);  // Invalid: should be string
  
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<Error>(result));
  const Error& error = mcp::get<Error>(result);
  EXPECT_EQ(error.code, OrchError::INVALID_ARGUMENT);
  EXPECT_NE(error.message.find("description"), std::string::npos);
}

TEST_F(ToolInfoTest, FromJsonInvalidMetadataType) {
  JsonValue json = JsonValue::object();
  json["name"] = JsonValue("test");
  json["metadata"] = JsonValue("not_an_object");  // Invalid: should be object
  
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<Error>(result));
  const Error& error = mcp::get<Error>(result);
  EXPECT_EQ(error.code, OrchError::INVALID_ARGUMENT);
  EXPECT_NE(error.message.find("metadata"), std::string::npos);
}

// =============================================================================
// Round-trip Tests
// =============================================================================

TEST_F(ToolInfoTest, RoundTripSimple) {
  ToolInfo original("round_trip", "Test round trip");
  
  JsonValue json = original.toJson();
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(original, restored);
}

TEST_F(ToolInfoTest, RoundTripComplex) {
  ToolInfo original("complex_tool", "Complex tool with all fields");
  
  // Add complex input schema
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("object");
  JsonValue properties = JsonValue::object();
  
  JsonValue prop1 = JsonValue::object();
  prop1["type"] = JsonValue("string");
  prop1["description"] = JsonValue("First property");
  properties["prop1"] = prop1;
  
  JsonValue prop2 = JsonValue::object();
  prop2["type"] = JsonValue("number");
  prop2["minimum"] = JsonValue(0);
  prop2["maximum"] = JsonValue(100);
  properties["prop2"] = prop2;
  
  schema["properties"] = properties;
  schema["required"] = JsonValue::array();
  schema["required"].push_back(JsonValue("prop1"));
  
  original.inputSchema = schema;
  
  // Add metadata
  std::map<std::string, JsonValue> metadata;
  metadata["version"] = JsonValue("3.0.0");
  metadata["deprecated"] = JsonValue(false);
  JsonValue features = JsonValue::array();
  features.push_back(JsonValue("feature1"));
  features.push_back(JsonValue("feature2"));
  metadata["features"] = features;
  
  original.metadata = make_optional(metadata);
  
  // Round trip
  JsonValue json = original.toJson();
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(original, restored);
}

// =============================================================================
// Equality Operator Tests
// =============================================================================

TEST_F(ToolInfoTest, EqualityIdentical) {
  ToolInfo info1("tool", "description");
  ToolInfo info2("tool", "description");
  
  EXPECT_EQ(info1, info2);
}

TEST_F(ToolInfoTest, EqualityDifferentName) {
  ToolInfo info1("tool1", "description");
  ToolInfo info2("tool2", "description");
  
  EXPECT_NE(info1, info2);
}

TEST_F(ToolInfoTest, EqualityDifferentDescription) {
  ToolInfo info1("tool", "description1");
  ToolInfo info2("tool", "description2");
  
  EXPECT_NE(info1, info2);
}

TEST_F(ToolInfoTest, EqualityDifferentSchema) {
  ToolInfo info1("tool", "description");
  ToolInfo info2("tool", "description");
  
  info1.inputSchema["type"] = JsonValue("string");
  info2.inputSchema["type"] = JsonValue("number");
  
  EXPECT_NE(info1, info2);
}

TEST_F(ToolInfoTest, EqualityWithMetadata) {
  ToolInfo info1("tool", "description");
  ToolInfo info2("tool", "description");
  
  std::map<std::string, JsonValue> metadata;
  metadata["key"] = JsonValue("value");
  
  info1.metadata = make_optional(metadata);
  info2.metadata = make_optional(metadata);
  
  EXPECT_EQ(info1, info2);
}

TEST_F(ToolInfoTest, EqualityDifferentMetadata) {
  ToolInfo info1("tool", "description");
  ToolInfo info2("tool", "description");
  
  std::map<std::string, JsonValue> metadata1;
  metadata1["key"] = JsonValue("value1");
  info1.metadata = make_optional(metadata1);
  
  std::map<std::string, JsonValue> metadata2;
  metadata2["key"] = JsonValue("value2");
  info2.metadata = make_optional(metadata2);
  
  EXPECT_NE(info1, info2);
}

TEST_F(ToolInfoTest, EqualityOneWithMetadata) {
  ToolInfo info1("tool", "description");
  ToolInfo info2("tool", "description");
  
  std::map<std::string, JsonValue> metadata;
  metadata["key"] = JsonValue("value");
  info1.metadata = make_optional(metadata);
  
  // info2 has no metadata
  
  EXPECT_NE(info1, info2);
}

// =============================================================================
// Edge Cases and Special Values
// =============================================================================

TEST_F(ToolInfoTest, EmptyStrings) {
  ToolInfo info("", "");  // Empty name and description
  
  JsonValue json = info.toJson();
  EXPECT_EQ(json["name"].getString(), "");
  EXPECT_EQ(json["description"].getString(), "");
  
  auto result = ToolInfo::fromJson(json);
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info, restored);
}

TEST_F(ToolInfoTest, SpecialCharactersInStrings) {
  ToolInfo info("tool_with_\"quotes\"", "Description with\nnewlines\tand\ttabs");
  
  JsonValue json = info.toJson();
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info, restored);
}

TEST_F(ToolInfoTest, UnicodeInStrings) {
  ToolInfo info("工具", "描述 with émoji 🚀");
  
  JsonValue json = info.toJson();
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info, restored);
}

TEST_F(ToolInfoTest, LargeMetadata) {
  ToolInfo info("tool", "description");
  
  std::map<std::string, JsonValue> metadata;
  for (int i = 0; i < 100; ++i) {
    std::string key = "key_" + std::to_string(i);
    metadata[key] = JsonValue("value_" + std::to_string(i));
  }
  info.metadata = make_optional(metadata);
  
  JsonValue json = info.toJson();
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info, restored);
  ASSERT_TRUE(restored.metadata.has_value());
  EXPECT_EQ(restored.metadata.value().size(), 100);
}

TEST_F(ToolInfoTest, NestedJsonInSchema) {
  ToolInfo info("nested_tool", "Tool with nested schema");
  
  JsonValue schema = JsonValue::object();
  schema["type"] = JsonValue("object");
  
  JsonValue properties = JsonValue::object();
  JsonValue nestedObject = JsonValue::object();
  nestedObject["type"] = JsonValue("object");
  
  JsonValue nestedProps = JsonValue::object();
  nestedProps["innerProp"] = JsonValue::object();
  nestedProps["innerProp"]["type"] = JsonValue("string");
  nestedObject["properties"] = nestedProps;
  
  properties["nested"] = nestedObject;
  schema["properties"] = properties;
  
  info.inputSchema = schema;
  
  JsonValue json = info.toJson();
  auto result = ToolInfo::fromJson(json);
  
  ASSERT_TRUE(mcp::holds_alternative<ToolInfo>(result));
  ToolInfo restored = mcp::get<ToolInfo>(result);
  
  EXPECT_EQ(info, restored);
}