#include <gtest/gtest.h>
#include "gopher/orch/client/tool.h"

using namespace gopher::orch::client;
using namespace gopher::orch::core;

// Test implementation of Tool
class TestTool : public Tool {
public:
    TestTool() : Tool("test_tool", "A test tool") {}
    
    Result<JsonValue> execute(
        const std::string& userId,
        const JsonValue& params,
        const optional<std::string>& connectionId
    ) override {
        // Check for required parameter
        if (!params.contains("input")) {
            return Result<JsonValue>(Error(400, "Missing required parameter: input"));
        }
        
        JsonValue result = JsonValue::object();
        result["output"] = params["input"].getString() + "_processed";
        result["userId"] = userId;
        if (connectionId.hasValue()) {
            result["connectionId"] = connectionId.value();
        }
        
        return makeSuccess(result);
    }
    
    ToolSchema getSchema() const override {
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        
        JsonValue properties = JsonValue::object();
        JsonValue inputProp = JsonValue::object();
        inputProp["type"] = "string";
        inputProp["description"] = "Input to process";
        properties["input"] = inputProp;
        
        params["properties"] = properties;
        
        JsonValue required = JsonValue::array();
        required.push_back("input");
        params["required"] = required;
        
        return {name_, description_, params, JsonValue::object()};
    }
};

class ToolTest : public ::testing::Test {
protected:
    void SetUp() override {
        tool = std::make_unique<TestTool>();
    }
    
    std::unique_ptr<TestTool> tool;
};

TEST_F(ToolTest, ToolHasCorrectNameAndDescription) {
    EXPECT_EQ(tool->name(), "test_tool");
    EXPECT_EQ(tool->description(), "A test tool");
}

TEST_F(ToolTest, ExecuteWithValidParams) {
    JsonValue params = JsonValue::object();
    params["input"] = "test_data";
    
    auto result = tool->execute("user123", params);
    
    ASSERT_TRUE(result.hasValue());
    EXPECT_EQ(result.value()["output"].getString(), "test_data_processed");
    EXPECT_EQ(result.value()["userId"].getString(), "user123");
    EXPECT_FALSE(result.value().contains("connectionId"));
}

TEST_F(ToolTest, ExecuteWithConnectionId) {
    JsonValue params = JsonValue::object();
    params["input"] = "test_data";
    
    optional<std::string> connectionId("conn_456");
    auto result = tool->execute("user123", params, connectionId);
    
    ASSERT_TRUE(result.hasValue());
    EXPECT_EQ(result.value()["connectionId"].getString(), "conn_456");
}

TEST_F(ToolTest, ExecuteWithMissingRequiredParam) {
    JsonValue params = JsonValue::object();
    // Missing "input" parameter
    
    auto result = tool->execute("user123", params);
    
    ASSERT_TRUE(result.hasError());
    EXPECT_EQ(result.error().code, 400);
    EXPECT_NE(result.error().message.find("Missing required parameter"), std::string::npos);
}

TEST_F(ToolTest, GetSchemaReturnsValidSchema) {
    auto schema = tool->getSchema();
    
    EXPECT_EQ(schema.name, "test_tool");
    EXPECT_EQ(schema.description, "A test tool");
    EXPECT_TRUE(schema.parameters.contains("type"));
    EXPECT_EQ(schema.parameters["type"].getString(), "object");
    EXPECT_TRUE(schema.parameters.contains("properties"));
    EXPECT_TRUE(schema.parameters["properties"].contains("input"));
    EXPECT_TRUE(schema.parameters.contains("required"));
    EXPECT_EQ(schema.parameters["required"].size(), 1);
}