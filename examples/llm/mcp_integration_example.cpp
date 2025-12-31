// MCP Integration Example
// This example shows how to integrate LLM providers with MCP servers for tool execution

#include "gopher/orch/llm/llm.h"
#include "gopher/orch/core/types.h"
// Remove MCP includes for now as they depend on server headers
// #include "gopher/orch/server/mcp_server.h"
// #include "gopher/orch/server/server_composite.h"
#include <thread>
#include <fstream>
#include <iostream>
#include <cstdlib>

using namespace gopher::orch;
using namespace gopher::orch::llm;
using namespace gopher::orch::core;
using namespace gopher::orch::server;

// ═══════════════════════════════════════════════════════════════════
// MCP TOOL BRIDGE
// ═══════════════════════════════════════════════════════════════════

class MCPToolBridge {
public:
    MCPToolBridge(std::shared_ptr<MCPServer> server) : mcp_server_(server) {}
    
    // Convert MCP tools to LLM ToolSpecs
    std::vector<ToolSpec> getMCPToolSpecs() {
        std::vector<ToolSpec> specs;
        
        // Get tools from MCP server
        auto tools = mcp_server_->listTools();
        
        for (const auto& tool : tools) {
            ToolSpec spec;
            spec.name = tool.name;
            spec.description = tool.description;
            
            // Convert MCP schema to LLM parameters format
            spec.parameters = convertMCPSchema(tool.inputSchema);
            
            specs.push_back(spec);
        }
        
        return specs;
    }
    
    // Execute MCP tool call
    Result<JsonValue> executeMCPTool(const ToolCall& call) {
        // Find the tool in MCP server
        auto tools = mcp_server_->listTools();
        bool found = false;
        
        for (const auto& tool : tools) {
            if (tool.name == call.name) {
                found = true;
                break;
            }
        }
        
        if (!found) {
            return makeOrchError<JsonValue>(
                OrchError::NOT_FOUND,
                "Tool not found in MCP server: " + call.name);
        }
        
        // Execute via MCP server
        try {
            auto result = mcp_server_->callTool(call.name, call.arguments);
            return makeSuccess(result);
        } catch (const std::exception& e) {
            return makeOrchError<JsonValue>(
                OrchError::EXECUTION_ERROR,
                std::string("MCP tool execution failed: ") + e.what());
        }
    }
    
private:
    JsonValue convertMCPSchema(const JsonValue& mcp_schema) {
        // MCP schema is already in JSON Schema format
        // Just ensure it's properly formatted for LLM
        return mcp_schema;
    }
    
    std::shared_ptr<MCPServer> mcp_server_;
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE MCP TOOLS
// ═══════════════════════════════════════════════════════════════════

class FileSystemMCPServer : public MCPServer {
public:
    FileSystemMCPServer() : MCPServer("filesystem", "1.0.0") {
        // Register file system tools
        registerTool("read_file", "Read contents of a file",
            [](const JsonValue& args) -> JsonValue {
                std::string path = args["path"].asString();
                
                std::ifstream file(path);
                if (!file.is_open()) {
                    throw std::runtime_error("Failed to open file: " + path);
                }
                
                std::stringstream buffer;
                buffer << file.rdbuf();
                
                JsonValue result = JsonValue::object();
                result["content"] = buffer.str();
                result["path"] = path;
                return result;
            });
        
        registerTool("list_files", "List files in a directory",
            [](const JsonValue& args) -> JsonValue {
                std::string dir = args["directory"].asString();
                
                JsonValue result = JsonValue::object();
                JsonValue files = JsonValue::array();
                
                // Mock implementation
                files.push_back("file1.txt");
                files.push_back("file2.cpp");
                files.push_back("README.md");
                
                result["directory"] = dir;
                result["files"] = files;
                return result;
            });
        
        registerTool("write_file", "Write content to a file",
            [](const JsonValue& args) -> JsonValue {
                std::string path = args["path"].asString();
                std::string content = args["content"].asString();
                bool append = args.has("append") ? args["append"].asBool() : false;
                
                std::ofstream file(path, append ? std::ios::app : std::ios::out);
                if (!file.is_open()) {
                    throw std::runtime_error("Failed to open file for writing: " + path);
                }
                
                file << content;
                file.close();
                
                JsonValue result = JsonValue::object();
                result["success"] = true;
                result["path"] = path;
                result["bytes_written"] = static_cast<int>(content.length());
                return result;
            });
    }
};

class DatabaseMCPServer : public MCPServer {
public:
    DatabaseMCPServer() : MCPServer("database", "1.0.0") {
        // Register database tools
        registerTool("query", "Execute a database query",
            [this](const JsonValue& args) -> JsonValue {
                std::string sql = args["sql"].asString();
                std::string database = args.has("database") ? 
                    args["database"].asString() : "default";
                
                // Mock database query
                JsonValue result = JsonValue::object();
                result["database"] = database;
                result["query"] = sql;
                
                if (sql.find("SELECT") != std::string::npos) {
                    JsonValue rows = JsonValue::array();
                    
                    JsonValue row1 = JsonValue::object();
                    row1["id"] = 1;
                    row1["name"] = "Alice";
                    row1["age"] = 30;
                    rows.push_back(row1);
                    
                    JsonValue row2 = JsonValue::object();
                    row2["id"] = 2;
                    row2["name"] = "Bob";
                    row2["age"] = 25;
                    rows.push_back(row2);
                    
                    result["rows"] = rows;
                    result["row_count"] = 2;
                } else {
                    result["affected_rows"] = 1;
                }
                
                return result;
            });
        
        registerTool("list_tables", "List all tables in the database",
            [](const JsonValue& args) -> JsonValue {
                std::string database = args.has("database") ? 
                    args["database"].asString() : "default";
                
                JsonValue result = JsonValue::object();
                result["database"] = database;
                
                JsonValue tables = JsonValue::array();
                tables.push_back("users");
                tables.push_back("products");
                tables.push_back("orders");
                result["tables"] = tables;
                
                return result;
            });
    }
};

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

int main(int argc, char** argv) {
    std::cout << "🔌 LLM + MCP Integration Example\n" << std::endl;
    
    // Create dispatcher
    auto dispatcher = std::make_shared<Dispatcher>();
    
    // Check for API key
    const char* api_key = std::getenv("OPENAI_API_KEY");
    if (!api_key) {
        std::cerr << "❌ Please set OPENAI_API_KEY environment variable" << std::endl;
        return 1;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Setup MCP Servers
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "Setting up MCP servers..." << std::endl;
    
    auto fs_server = std::make_shared<FileSystemMCPServer>();
    auto db_server = std::make_shared<DatabaseMCPServer>();
    
    // Create composite server that combines both
    auto composite_server = std::make_shared<MCPServerComposite>();
    composite_server->addServer(fs_server);
    composite_server->addServer(db_server);
    
    // Create bridge
    auto bridge = std::make_unique<MCPToolBridge>(composite_server);
    
    // Get all available tools
    auto mcp_tools = bridge->getMCPToolSpecs();
    
    std::cout << "Available MCP tools:" << std::endl;
    for (const auto& tool : mcp_tools) {
        std::cout << "  • " << tool.name << ": " << tool.description << std::endl;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 1: File System Operations via MCP
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n=== Example 1: File System Operations ===" << std::endl;
    
    auto provider = makeOpenAIProvider(api_key);
    
    std::vector<Message> messages = {
        Message::system("You are a helpful assistant with access to file system tools. "
                       "Use them to help the user with file operations."),
        Message::user("Create a new file called 'test_output.txt' with the content "
                     "'Hello from LLM + MCP!' and then read it back to confirm.")
    };
    
    LLMConfig config = LLMConfig()
        .withModel("gpt-3.5-turbo")
        .withTemperature(0.0);
    
    // Capture bridge pointer for lambda
    auto* bridge_ptr = bridge.get();
    
    bool done = false;
    std::function<void(std::vector<Message>)> process_messages;
    
    process_messages = [&](std::vector<Message> msgs) {
        provider->chat(msgs, mcp_tools, config, *dispatcher,
            [&](Result<LLMResponse> result) {
                if (mcp::holds_alternative<Error>(result)) {
                    std::cerr << "Error: " << mcp::get<Error>(result).message << std::endl;
                    done = true;
                    return;
                }
                
                auto& response = mcp::get<LLMResponse>(result);
                std::cout << "\n🤖 Assistant: " << response.message.content << std::endl;
                
                if (response.hasToolCalls()) {
                    std::cout << "\n📞 Executing MCP tools:" << std::endl;
                    
                    msgs.push_back(response.message);
                    
                    for (const auto& call : response.toolCalls()) {
                        std::cout << "  • " << call.name << "..." << std::flush;
                        
                        auto tool_result = bridge_ptr->executeMCPTool(call);
                        
                        if (mcp::holds_alternative<Error>(tool_result)) {
                            std::cout << " ❌ Error" << std::endl;
                            msgs.push_back(Message::toolResult(call.id,
                                "Error: " + mcp::get<Error>(tool_result).message));
                        } else {
                            std::cout << " ✅ Success" << std::endl;
                            msgs.push_back(Message::toolResult(call.id,
                                mcp::get<JsonValue>(tool_result).toString()));
                        }
                    }
                    
                    // Continue conversation with tool results
                    process_messages(msgs);
                } else {
                    done = true;
                }
            });
    };
    
    process_messages(messages);
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 2: Database Operations via MCP
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 2: Database Operations ===" << std::endl;
    
    messages = {
        Message::system("You are a database assistant. Use the database tools to help users "
                       "query and understand their data."),
        Message::user("Show me all users who are over 25 years old. "
                     "First list the tables to see what's available.")
    };
    
    done = false;
    process_messages(messages);
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 3: Complex Multi-Tool Workflow
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 3: Complex Multi-Tool Workflow ===" << std::endl;
    
    messages = {
        Message::system("You are a data analyst assistant. Use both file system and database "
                       "tools to help users with data analysis tasks."),
        Message::user("Get the list of users from the database, create a summary report, "
                     "and save it to a file called 'user_report.txt'.")
    };
    
    done = false;
    process_messages(messages);
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 4: Using LLMChain with MCP Tools
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 4: LLMChain with MCP Tools ===" << std::endl;
    
    LLMChain::Config chain_config;
    chain_config.provider = provider;
    chain_config.system_prompt = "You are a helpful assistant with access to file and database tools.";
    chain_config.llm_config = config;
    chain_config.tools = mcp_tools;
    chain_config.auto_execute_tools = true;
    chain_config.tool_executor = [bridge_ptr](const ToolCall& call) -> Result<JsonValue> {
        return bridge_ptr->executeMCPTool(call);
    };
    
    auto chain = std::make_shared<LLMChain>(chain_config);
    
    JsonValue input = "List all files in the current directory and count how many there are.";
    
    done = false;
    chain->invoke(input, RunnableConfig{}, *dispatcher,
        [&](Result<JsonValue> result) {
            if (mcp::holds_alternative<Error>(result)) {
                std::cerr << "Error: " << mcp::get<Error>(result).message << std::endl;
            } else {
                auto& output = mcp::get<JsonValue>(result);
                std::cout << "\n🔗 Chain result: " << output["content"].asString() << std::endl;
            }
            done = true;
        });
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // Example 5: Dynamic Tool Registration
    // ═══════════════════════════════════════════════════════════════════
    
    std::cout << "\n\n=== Example 5: Dynamic Tool Registration ===" << std::endl;
    
    // Add a new tool dynamically
    fs_server->registerTool("get_file_info", "Get detailed information about a file",
        [](const JsonValue& args) -> JsonValue {
            std::string path = args["path"].asString();
            
            JsonValue result = JsonValue::object();
            result["path"] = path;
            result["size"] = 1024;  // Mock size
            result["modified"] = "2024-01-15T10:30:00Z";
            result["permissions"] = "rw-r--r--";
            result["type"] = "file";
            
            return result;
        });
    
    // Refresh tools
    mcp_tools = bridge->getMCPToolSpecs();
    
    std::cout << "New tool added: get_file_info" << std::endl;
    
    messages = {
        Message::system("You are a file system analyst."),
        Message::user("Get detailed information about the file 'test_output.txt'.")
    };
    
    done = false;
    process_messages(messages);
    
    while (!done) {
        dispatcher->poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    std::cout << "\n✅ MCP Integration Example Complete!" << std::endl;
    
    return 0;
}