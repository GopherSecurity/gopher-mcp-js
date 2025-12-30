#include <gtest/gtest.h>
#include "gopher/orch/client/provider/all_providers.h"
#include "gopher/orch/client/tool.h"

using namespace gopher::orch::client;
using namespace gopher::orch::client::provider;
using namespace gopher::orch::core;

// Mock tool for testing
class MockTool : public Tool {
public:
    MockTool(const std::string& name, const std::string& desc) 
        : Tool(name, desc), executeCalled(false) {}
    
    Result<JsonValue> execute(
        const std::string& userId,
        const JsonValue& params,
        const optional<std::string>& connectionId = nullopt
    ) override {
        executeCalled = true;
        lastUserId = userId;
        lastParams = params;
        
        JsonValue result = JsonValue::object();
        result["success"] = true;
        result["tool"] = name_;
        return makeSuccess(result);
    }
    
    ToolSchema getSchema() const override {
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        
        JsonValue properties = JsonValue::object();
        JsonValue testProp = JsonValue::object();
        testProp["type"] = "string";
        properties["test"] = testProp;
        params["properties"] = properties;
        
        return {name_, description_, params, JsonValue::object()};
    }
    
    bool executeCalled;
    std::string lastUserId;
    JsonValue lastParams;
};

class ProviderTest : public ::testing::Test {
protected:
    void SetUp() override {
        tool1 = std::make_shared<MockTool>("tool1", "First tool");
        tool2 = std::make_shared<MockTool>("tool2", "Second tool");
        tools = {tool1, tool2};
        
        toolMap["tool1"] = tool1;
        toolMap["tool2"] = tool2;
    }
    
    std::shared_ptr<MockTool> tool1;
    std::shared_ptr<MockTool> tool2;
    std::vector<ToolPtr> tools;
    std::unordered_map<std::string, ToolPtr> toolMap;
};

// Test AnthropicProvider
TEST_F(ProviderTest, AnthropicProviderTransformTools) {
    AnthropicProvider provider;
    
    auto transformed = provider.transformTools(tools);
    
    ASSERT_TRUE(transformed.isArray());
    EXPECT_EQ(transformed.size(), 2);
    
    // Check first tool
    const auto& tool = transformed[0];
    EXPECT_EQ(tool["name"].getString(), "tool1");
    EXPECT_EQ(tool["description"].getString(), "First tool");
    EXPECT_TRUE(tool.contains("input_schema"));
    EXPECT_EQ(tool["input_schema"]["type"].getString(), "object");
}

TEST_F(ProviderTest, AnthropicProviderHandleToolCalls) {
    AnthropicProvider provider;
    
    // Create Claude-style response with tool_use
    JsonValue aiResponse = JsonValue::object();
    JsonValue content = JsonValue::array();
    
    JsonValue toolUse = JsonValue::object();
    toolUse["type"] = "tool_use";
    toolUse["id"] = "call_123";
    toolUse["name"] = "tool1";
    JsonValue input = JsonValue::object();
    input["test"] = "value";
    toolUse["input"] = input;
    
    content.push_back(toolUse);
    aiResponse["content"] = content;
    
    auto result = provider.handleToolCalls("user456", aiResponse, toolMap);
    
    ASSERT_TRUE(result.hasValue());
    ASSERT_TRUE(result.value().isArray());
    EXPECT_EQ(result.value().size(), 1);
    
    const auto& toolResult = result.value()[0];
    EXPECT_EQ(toolResult["tool_use_id"].getString(), "call_123");
    EXPECT_FALSE(toolResult["is_error"].getBool());
    
    // Check that tool was executed
    EXPECT_TRUE(tool1->executeCalled);
    EXPECT_EQ(tool1->lastUserId, "user456");
}

// Test OpenAIProvider
TEST_F(ProviderTest, OpenAIProviderTransformTools) {
    OpenAIProvider provider;
    
    auto transformed = provider.transformTools(tools);
    
    ASSERT_TRUE(transformed.isArray());
    EXPECT_EQ(transformed.size(), 2);
    
    // Check first tool
    const auto& tool = transformed[0];
    EXPECT_EQ(tool["type"].getString(), "function");
    EXPECT_TRUE(tool.contains("function"));
    EXPECT_EQ(tool["function"]["name"].getString(), "tool1");
    EXPECT_EQ(tool["function"]["description"].getString(), "First tool");
    EXPECT_TRUE(tool["function"].contains("parameters"));
}

TEST_F(ProviderTest, OpenAIProviderHandleToolCalls) {
    OpenAIProvider provider;
    
    // Create OpenAI-style response with tool_calls
    JsonValue aiResponse = JsonValue::object();
    JsonValue choices = JsonValue::array();
    JsonValue choice = JsonValue::object();
    JsonValue message = JsonValue::object();
    JsonValue toolCalls = JsonValue::array();
    
    JsonValue toolCall = JsonValue::object();
    toolCall["id"] = "call_456";
    JsonValue function = JsonValue::object();
    function["name"] = "tool2";
    JsonValue arguments = JsonValue::object();
    arguments["test"] = "data";
    function["arguments"] = arguments;
    toolCall["function"] = function;
    
    toolCalls.push_back(toolCall);
    message["tool_calls"] = toolCalls;
    choice["message"] = message;
    choices.push_back(choice);
    aiResponse["choices"] = choices;
    
    auto result = provider.handleToolCalls("user789", aiResponse, toolMap);
    
    ASSERT_TRUE(result.hasValue());
    ASSERT_TRUE(result.value().isArray());
    EXPECT_EQ(result.value().size(), 1);
    
    const auto& toolResult = result.value()[0];
    EXPECT_EQ(toolResult["tool_call_id"].getString(), "call_456");
    EXPECT_EQ(toolResult["role"].getString(), "tool");
    
    // Check that tool was executed
    EXPECT_TRUE(tool2->executeCalled);
    EXPECT_EQ(tool2->lastUserId, "user789");
}

// Test Google Provider
TEST_F(ProviderTest, GoogleProviderTransformTools) {
    GoogleProvider provider;
    
    auto transformed = provider.transformTools(tools);
    
    ASSERT_TRUE(transformed.contains("function_declarations"));
    const auto& functions = transformed["function_declarations"];
    ASSERT_TRUE(functions.isArray());
    EXPECT_EQ(functions.size(), 2);
    
    const auto& func = functions[0];
    EXPECT_EQ(func["name"].getString(), "tool1");
    EXPECT_EQ(func["description"].getString(), "First tool");
}

// Test Llama Provider
TEST_F(ProviderTest, LlamaProviderTransformTools) {
    LlamaProvider provider;
    
    auto transformed = provider.transformTools(tools);
    
    ASSERT_TRUE(transformed.isArray());
    EXPECT_EQ(transformed.size(), 2);
    
    const auto& tool = transformed[0];
    EXPECT_EQ(tool["name"].getString(), "tool1");
    EXPECT_EQ(tool["description"].getString(), "First tool");
    EXPECT_TRUE(tool.contains("parameters"));
}

// Test Provider Factory
TEST_F(ProviderTest, CreateProviderFactory) {
    auto anthropic = createProvider("anthropic");
    ASSERT_NE(anthropic, nullptr);
    EXPECT_EQ(anthropic->name(), "anthropic");
    
    auto openai = createProvider("openai");
    ASSERT_NE(openai, nullptr);
    EXPECT_EQ(openai->name(), "openai");
    
    auto google = createProvider("google");
    ASSERT_NE(google, nullptr);
    EXPECT_EQ(google->name(), "google");
    
    auto llama = createProvider("llama");
    ASSERT_NE(llama, nullptr);
    EXPECT_EQ(llama->name(), "llama");
    
    auto invalid = createProvider("invalid_provider");
    EXPECT_EQ(invalid, nullptr);
}

TEST_F(ProviderTest, GetAvailableProviders) {
    auto providers = getAvailableProviders();
    
    ASSERT_EQ(providers.size(), 4);
    EXPECT_NE(std::find(providers.begin(), providers.end(), "anthropic"), providers.end());
    EXPECT_NE(std::find(providers.begin(), providers.end(), "openai"), providers.end());
    EXPECT_NE(std::find(providers.begin(), providers.end(), "google"), providers.end());
    EXPECT_NE(std::find(providers.begin(), providers.end(), "llama"), providers.end());
}

// Test provider-specific features
TEST_F(ProviderTest, ProviderVersionAndFeatures) {
    AnthropicProvider anthropic;
    EXPECT_EQ(anthropic.version(), "2024-02-15");
    EXPECT_TRUE(anthropic.supportsStreaming());
    EXPECT_EQ(anthropic.maxToolsPerRequest(), 64);
    
    OpenAIProvider openai;
    EXPECT_EQ(openai.version(), "v1");
    EXPECT_TRUE(openai.supportsStreaming());
    EXPECT_EQ(openai.maxToolsPerRequest(), 128);
    
    GoogleProvider google;
    EXPECT_EQ(google.version(), "v1beta");
    EXPECT_TRUE(google.supportsStreaming());
    EXPECT_EQ(google.maxToolsPerRequest(), 64);
    
    LlamaProvider llama;
    EXPECT_EQ(llama.version(), "3.0");
    EXPECT_FALSE(llama.supportsStreaming());
    EXPECT_EQ(llama.maxToolsPerRequest(), 32);
}