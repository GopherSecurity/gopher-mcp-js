// Tool/Function Calling Example
// This example demonstrates how to use LLM providers with tool/function calling

#include "gopher/orch/llm/llm.h"
#include "gopher/orch/core/types.h"
#include <iostream>
#include <cstdlib>
#include <cmath>
#include <thread>

using namespace gopher::orch;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;

// ═══════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════

// Simple calculator tool
JsonValue calculate(const JsonValue& args) {
    std::string operation = args["operation"].asString();
    double a = args["a"].asDouble();
    double b = args["b"].asDouble();
    
    double result;
    if (operation == "add") {
        result = a + b;
    } else if (operation == "subtract") {
        result = a - b;
    } else if (operation == "multiply") {
        result = a * b;
    } else if (operation == "divide") {
        if (b == 0) {
            return JsonValue("Error: Division by zero");
        }
        result = a / b;
    } else if (operation == "power") {
        result = std::pow(a, b);
    } else {
        return JsonValue("Error: Unknown operation");
    }
    
    JsonValue response = JsonValue::object();
    response["result"] = result;
    response["expression"] = std::to_string(a) + " " + operation + " " + std::to_string(b);
    return response;
}

// Weather tool (mock)
JsonValue getWeather(const JsonValue& args) {
    std::string location = args["location"].asString();
    std::string units = args.has("units") ? args["units"].asString() : "celsius";
    
    // Mock weather data
    JsonValue response = JsonValue::object();
    response["location"] = location;
    response["temperature"] = (units == "fahrenheit") ? 72 : 22;
    response["units"] = units;
    response["conditions"] = "Partly cloudy";
    response["humidity"] = 65;
    response["wind_speed"] = 10;
    
    return response;
}

// Search tool (mock)
JsonValue searchKnowledgeBase(const JsonValue& args) {
    std::string query = args["query"].asString();
    int max_results = args.has("max_results") ? args["max_results"].asInt() : 3;
    
    JsonValue results = JsonValue::array();
    
    // Mock search results based on query
    if (query.find("capital") != std::string::npos) {
        JsonValue result = JsonValue::object();
        result["title"] = "World Capitals";
        result["snippet"] = "Paris is the capital of France. London is the capital of the United Kingdom.";
        result["relevance"] = 0.95;
        results.push_back(result);
    }
    
    if (query.find("programming") != std::string::npos || query.find("C++") != std::string::npos) {
        JsonValue result = JsonValue::object();
        result["title"] = "C++ Programming";
        result["snippet"] = "C++ is a high-performance programming language widely used in systems programming.";
        result["relevance"] = 0.90;
        results.push_back(result);
    }
    
    // Limit results
    while (results.size() > max_results) {
        results.pop_back();
    }
    
    return results;
}

// Tool executor that routes to the right function
Result<JsonValue> executeToolCall(const ToolCall& call) {
    try {
        if (call.name == "calculate") {
            return makeSuccess(calculate(call.arguments));
        } else if (call.name == "get_weather") {
            return makeSuccess(getWeather(call.arguments));
        } else if (call.name == "search") {
            return makeSuccess(searchKnowledgeBase(call.arguments));
        } else {
            return makeOrchError<JsonValue>(
                OrchError::NOT_FOUND,
                "Unknown tool: " + call.name);
        }
    } catch (const std::exception& e) {
        return makeOrchError<JsonValue>(
            OrchError::EXECUTION_ERROR,
            std::string("Tool execution failed: ") + e.what());
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

int main(int argc, char** argv) {
    std::cout << "🛠️  LLM Tool Calling Example\n" << std::endl;
    
    // Create dispatcher
    auto dispatcher = std::make_shared<Dispatcher>();
    
    // Check for API key
    const char* api_key = std::getenv("OPENAI_API_KEY");
    if (!api_key) {
        std::cerr << "❌ Please set OPENAI_API_KEY environment variable" << std::endl;
        std::cerr << "   Note: Anthropic also supports tools if you set ANTHROPIC_API_KEY" << std::endl;
        return 1;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Define Available Tools
    // ═══════════════════════════════════════════════════════════════════
    
    std::vector<ToolSpec> tools;
    
    // Calculator tool
    {
        ToolSpec calc;
        calc.name = "calculate";
        calc.description = "Perform mathematical calculations";
        
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        
        JsonValue properties = JsonValue::object();
        
        JsonValue operation = JsonValue::object();
        operation["type"] = "string";
        operation["enum"] = JsonValue::array();
        operation["enum"].push_back("add");
        operation["enum"].push_back("subtract");
        operation["enum"].push_back("multiply");
        operation["enum"].push_back("divide");
        operation["enum"].push_back("power");
        operation["description"] = "The mathematical operation to perform";
        properties["operation"] = operation;
        
        JsonValue a = JsonValue::object();
        a["type"] = "number";
        a["description"] = "First operand";
        properties["a"] = a;
        
        JsonValue b = JsonValue::object();
        b["type"] = "number";
        b["description"] = "Second operand";
        properties["b"] = b;
        
        params["properties"] = properties;
        
        JsonValue required = JsonValue::array();
        required.push_back("operation");
        required.push_back("a");
        required.push_back("b");
        params["required"] = required;
        
        calc.parameters = params;
        tools.push_back(calc);
    }
    
    // Weather tool
    {
        ToolSpec weather;
        weather.name = "get_weather";
        weather.description = "Get current weather information for a location";
        
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        
        JsonValue properties = JsonValue::object();
        
        JsonValue location = JsonValue::object();
        location["type"] = "string";
        location["description"] = "City name or location";
        properties["location"] = location;
        
        JsonValue units = JsonValue::object();
        units["type"] = "string";
        units["enum"] = JsonValue::array();
        units["enum"].push_back("celsius");
        units["enum"].push_back("fahrenheit");
        units["description"] = "Temperature units";
        properties["units"] = units;
        
        params["properties"] = properties;
        
        JsonValue required = JsonValue::array();
        required.push_back("location");
        params["required"] = required;
        
        weather.parameters = params;
        tools.push_back(weather);
    }
    
    // Search tool
    {
        ToolSpec search;
        search.name = "search";
        search.description = "Search the knowledge base for information";
        
        JsonValue params = JsonValue::object();
        params["type"] = "object";
        
        JsonValue properties = JsonValue::object();
        
        JsonValue query = JsonValue::object();
        query["type"] = "string";
        query["description"] = "Search query";
        properties["query"] = query;
        
        JsonValue max_results = JsonValue::object();
        max_results["type"] = "integer";
        max_results["description"] = "Maximum number of results";
        max_results["default"] = 3;
        properties["max_results"] = max_results;
        
        params["properties"] = properties;
        
        JsonValue required = JsonValue::array();
        required.push_back("query");
        params["required"] = required;
        
        search.parameters = params;
        tools.push_back(search);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 1: Simple Tool Call
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "=== Example 1: Simple Tool Call ===" << std::endl;
    
    auto provider = makeOpenAIProvider(api_key);
    
    std::vector<Message> messages = {
        Message::system("You are a helpful assistant with access to tools. "
                       "Use them when needed to answer questions accurately."),
        Message::user("What is 25 * 17?")
    };
    
    LLMConfig config = LLMConfig()
        .withModel("gpt-3.5-turbo")
        .withTemperature(0.0);
    
    bool done = false;
    provider->chat(messages, tools, config, *dispatcher,
        [&](Result<LLMResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                std::cerr << "Error: " << mcp::get<Error>(result).message << std::endl;
                done = true;
                return;
            }
            
            auto& response = mcp::get<LLMResponse>(result);
            std::cout << "\n🤖 Assistant: " << response.message.content << std::endl;
            
            // Check for tool calls
            if (response.hasToolCalls()) {
                std::cout << "\n📞 Tool calls requested:" << std::endl;
                
                messages.push_back(response.message);
                
                for (const auto& call : response.toolCalls()) {
                    std::cout << "  • Calling " << call.name 
                              << " with args: " << call.arguments.toString() << std::endl;
                    
                    // Execute tool
                    auto tool_result = executeToolCall(call);
                    
                    if (mcp::holds_alternative<Error>(tool_result)) {
                        std::cerr << "  ❌ Error: " << mcp::get<Error>(tool_result).message << std::endl;
                        messages.push_back(Message::toolResult(call.id, 
                            "Error: " + mcp::get<Error>(tool_result).message));
                    } else {
                        auto& result_json = mcp::get<JsonValue>(tool_result);
                        std::cout << "  ✅ Result: " << result_json.toString() << std::endl;
                        messages.push_back(Message::toolResult(call.id, result_json.toString()));
                    }
                }
                
                // Call LLM again with tool results
                std::cout << "\n🔄 Sending tool results back to LLM..." << std::endl;
                
                provider->chat(messages, tools, config, *dispatcher,
                    [&](Result<LLMResponse> final_result) {
                        if (mcp::holds_alternative<Error>(final_result)) {
                            std::cerr << "Error: " << mcp::get<Error>(final_result).message << std::endl;
                        } else {
                            auto& final_response = mcp::get<LLMResponse>(final_result);
                            std::cout << "\n🤖 Final answer: " << final_response.message.content << std::endl;
                        }
                        done = true;
                    });
            } else {
                done = true;
            }
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 2: Multiple Tool Calls
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 2: Multiple Tool Calls ===" << std::endl;
    
    messages = {
        Message::system("You are a helpful assistant with access to tools. "
                       "Use them when needed to answer questions accurately."),
        Message::user("What's the weather in London and Paris? "
                     "Also calculate 2^8 for me.")
    };
    
    done = false;
    provider->chat(messages, tools, config, *dispatcher,
        [&](Result<LLMResponse> result) {
            if (mcp::holds_alternative<Error>(result)) {
                std::cerr << "Error: " << mcp::get<Error>(result).message << std::endl;
                done = true;
                return;
            }
            
            auto& response = mcp::get<LLMResponse>(result);
            
            if (!response.message.content.empty()) {
                std::cout << "\n🤖 Assistant: " << response.message.content << std::endl;
            }
            
            if (response.hasToolCalls()) {
                std::cout << "\n📞 Multiple tool calls:" << std::endl;
                
                messages.push_back(response.message);
                
                for (const auto& call : response.toolCalls()) {
                    std::cout << "  • " << call.name << std::endl;
                    auto tool_result = executeToolCall(call);
                    
                    if (mcp::holds_alternative<JsonValue>(tool_result)) {
                        messages.push_back(Message::toolResult(call.id, 
                            mcp::get<JsonValue>(tool_result).toString()));
                    }
                }
                
                // Get final response
                provider->chat(messages, tools, config, *dispatcher,
                    [&](Result<LLMResponse> final_result) {
                        if (!mcp::holds_alternative<Error>(final_result)) {
                            auto& final_response = mcp::get<LLMResponse>(final_result);
                            std::cout << "\n🤖 Final response: " << final_response.message.content << std::endl;
                        }
                        done = true;
                    });
            } else {
                done = true;
            }
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 3: Using LLMChain with Auto Tool Execution
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 3: LLMChain with Auto Tool Execution ===" << std::endl;
    
    LLMChain::Config chain_config;
    chain_config.provider = provider;
    chain_config.system_prompt = "You are a helpful math tutor. Use the calculator tool for all calculations.";
    chain_config.llm_config = config;
    chain_config.tools = tools;
    chain_config.auto_execute_tools = true;
    chain_config.tool_executor = executeToolCall;
    
    auto chain = std::make_shared<LLMChain>(chain_config);
    
    JsonValue input = "If I have 15 apples and buy 23 more, then eat 7, how many do I have?";
    
    done = false;
    chain->invoke(input, RunnableConfig{}, *dispatcher,
        [&](Result<JsonValue> result) {
            if (mcp::holds_alternative<Error>(result)) {
                std::cerr << "Error: " << mcp::get<Error>(result).message << std::endl;
            } else {
                auto& output = mcp::get<JsonValue>(result);
                std::cout << "\n🔗 Chain output: " << output["content"].asString() << std::endl;
                
                if (output.has("usage")) {
                    std::cout << "\n📊 Total usage:" << std::endl;
                    std::cout << "  Tokens: " << output["usage"]["total_tokens"].asInt() << std::endl;
                }
            }
            done = true;
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    std::cout << "\n✅ Tool Calling Example Complete!" << std::endl;
    
    return 0;
}