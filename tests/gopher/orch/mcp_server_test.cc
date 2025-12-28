// Unit tests for MCPServer
//
// Tests MCPServer configuration, creation, and integration with
// ServerComposite. Note: Full integration tests require actual MCP server
// connections.

#include "orch_test_fixture.h"

#ifdef GOPHER_ORCH_WITH_MCP
#include "gopher/orch/server/mcp_server.h"
#endif

// =============================================================================
// MCPServer Configuration Tests
// =============================================================================

#ifdef GOPHER_ORCH_WITH_MCP

TEST_F(OrchTest, MCPServerConfigDefaults) {
  // Test that MCPServerConfig has sensible defaults
  server::MCPServerConfig config;
  config.name = "test-server";

  EXPECT_EQ(config.name, "test-server");
  EXPECT_EQ(config.transport_type,
            server::MCPServerConfig::TransportType::STDIO);
  EXPECT_EQ(config.client_name, "gopher-orch");
  EXPECT_EQ(config.client_version, "1.0.0");
  EXPECT_EQ(config.max_connect_retries, 3u);
  EXPECT_EQ(config.connect_timeout.count(), 30000);
  EXPECT_EQ(config.request_timeout.count(), 60000);
}

TEST_F(OrchTest, MCPServerConfigStdioTransport) {
  // Test stdio transport configuration
  server::MCPServerConfig config;
  config.name = "npx-server";
  config.transport_type = server::MCPServerConfig::TransportType::STDIO;
  config.stdio_transport.command = "npx";
  config.stdio_transport.args = {"-y",
                                 "@modelcontextprotocol/server-everything"};
  config.stdio_transport.env["NODE_ENV"] = "production";

  EXPECT_EQ(config.stdio_transport.command, "npx");
  EXPECT_EQ(config.stdio_transport.args.size(), 2u);
  EXPECT_EQ(config.stdio_transport.args[0], "-y");
  EXPECT_EQ(config.stdio_transport.env["NODE_ENV"], "production");
}

TEST_F(OrchTest, MCPServerConfigHttpSseTransport) {
  // Test HTTP+SSE transport configuration
  server::MCPServerConfig config;
  config.name = "remote-server";
  config.transport_type = server::MCPServerConfig::TransportType::HTTP_SSE;
  config.http_sse_transport.url = "https://api.example.com/mcp";
  config.http_sse_transport.headers["Authorization"] = "Bearer token123";
  config.http_sse_transport.verify_ssl = true;

  EXPECT_EQ(config.http_sse_transport.url, "https://api.example.com/mcp");
  EXPECT_EQ(config.http_sse_transport.headers["Authorization"],
            "Bearer token123");
  EXPECT_TRUE(config.http_sse_transport.verify_ssl);
}

TEST_F(OrchTest, MCPServerWithComposite) {
  // Test that Server interface can be used with ServerComposite
  // Uses mock server since MCPServer requires actual MCP connection
  auto mockServer = makeMockServer("mcp-like-server");
  mockServer->addTool("get_weather", "Get weather for a location");
  mockServer->setHandler("get_weather",
                         [](const JsonValue& args) -> Result<JsonValue> {
                           JsonValue result = JsonValue::object();
                           result["temperature"] = JsonValue(72);
                           result["location"] = args["city"];
                           return makeSuccess(JsonValue(result));
                         });

  // Create composite and add the server
  auto composite = ServerComposite::create("multi-server");
  std::vector<std::string> tools = {"get_weather"};
  composite->addServer(mockServer, tools, true);

  // Connect
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        composite->connectAll(d, std::move(cb));
      });

  // Get tool through composite
  auto weatherTool = composite->tool("mcp-like-server.get_weather");
  ASSERT_NE(weatherTool, nullptr);

  // Invoke the tool
  JsonValue input = JsonValue::object();
  input["city"] = JsonValue("Seattle");

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        weatherTool->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["temperature"].getInt(), 72);
  EXPECT_EQ(result["location"].getString(), "Seattle");
}

#endif  // GOPHER_ORCH_WITH_MCP
