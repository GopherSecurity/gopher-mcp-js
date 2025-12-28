// Unit tests for ServerComposite
//
// Tests multi-server aggregation, tool namespacing, aliasing,
// and connection management across multiple mock servers.

#include "orch_test_fixture.h"

// =============================================================================
// ServerComposite Tests
// =============================================================================

TEST_F(OrchTest, ServerCompositeCreate) {
  auto composite = ServerComposite::create("test-composite");
  EXPECT_EQ(composite->name(), "test-composite");
  EXPECT_TRUE(composite->listTools().empty());
  EXPECT_TRUE(composite->servers().empty());
}

TEST_F(OrchTest, ServerCompositeAddServer) {
  auto composite = ServerComposite::create("test-composite");

  auto server1 = makeMockServer("server1");
  server1->addTool("tool1", "First tool");

  auto server2 = makeMockServer("server2");
  server2->addTool("tool2", "Second tool");

  // Add servers with explicit tool mappings
  std::vector<std::string> tools1 = {"tool1"};
  std::vector<std::string> tools2 = {"tool2"};
  composite->addServer(server1, tools1, true);
  composite->addServer(server2, tools2, true);

  EXPECT_EQ(composite->servers().size(), 2u);
  EXPECT_NE(composite->server("server1"), nullptr);
  EXPECT_NE(composite->server("server2"), nullptr);
  EXPECT_EQ(composite->server("nonexistent"), nullptr);
}

TEST_F(OrchTest, ServerCompositeToolNamespacing) {
  // Tests that tools are namespaced by server name when namespace_tools=true
  auto composite = ServerComposite::create("namespaced");

  auto server = makeMockServer("weather");
  server->addTool("get_forecast", "Gets weather forecast");
  server->setResponse("get_forecast", JsonValue("Sunny"));

  std::vector<std::string> tool_names = {"get_forecast"};
  composite->addServer(server, tool_names, true);

  // Tools should be listed with namespace prefix
  auto tools = composite->listTools();
  EXPECT_EQ(tools.size(), 1u);
  EXPECT_EQ(tools[0], "weather.get_forecast");

  // Can get tool by fully-qualified name
  EXPECT_TRUE(composite->hasTool("weather.get_forecast"));
}

TEST_F(OrchTest, ServerCompositeNoNamespacing) {
  // Tests that tools are exposed without prefix when namespace_tools=false
  auto composite = ServerComposite::create("flat");

  auto server = makeMockServer("myserver");
  server->addTool("simple_tool", "A simple tool");

  std::vector<std::string> tool_names = {"simple_tool"};
  composite->addServer(server, tool_names, false);

  auto tools = composite->listTools();
  EXPECT_EQ(tools.size(), 1u);
  EXPECT_EQ(tools[0], "simple_tool");

  EXPECT_TRUE(composite->hasTool("simple_tool"));
}

TEST_F(OrchTest, ServerCompositeAliases) {
  // Tests tool aliasing - expose tools under different names
  auto composite = ServerComposite::create("aliased");

  auto server = makeMockServer("complex-name-server");
  server->addTool("internal_get_data_v2", "Gets data");
  server->setResponse("internal_get_data_v2", JsonValue("data"));

  // Map internal name to a simpler alias
  std::map<std::string, std::string> aliases = {
      {"get_data", "internal_get_data_v2"},
      {"fetch", "internal_get_data_v2"}  // Multiple aliases for same tool
  };
  composite->addServerWithAliases(server, aliases);

  auto tools = composite->listTools();
  EXPECT_EQ(tools.size(), 2u);

  EXPECT_TRUE(composite->hasTool("get_data"));
  EXPECT_TRUE(composite->hasTool("fetch"));
}

TEST_F(OrchTest, ServerCompositeAddSingleTool) {
  // Tests adding individual tools with optional alias
  auto composite = ServerComposite::create("single-tool");

  auto server = makeMockServer("myserver");
  server->addTool("tool1", "Tool one");
  server->addTool("tool2", "Tool two");

  // Add only one tool with an alias
  composite->addTool(server, "tool1", "my_tool");

  auto tools = composite->listTools();
  EXPECT_EQ(tools.size(), 1u);
  EXPECT_EQ(tools[0], "my_tool");

  EXPECT_TRUE(composite->hasTool("my_tool"));
  EXPECT_FALSE(composite->hasTool("tool1"));
  EXPECT_FALSE(composite->hasTool("tool2"));
}

TEST_F(OrchTest, ServerCompositeRemoveServer) {
  auto composite = ServerComposite::create("removable");

  auto server1 = makeMockServer("server1");
  server1->addTool("tool1");
  std::vector<std::string> t1 = {"tool1"};
  composite->addServer(server1, t1, true);

  auto server2 = makeMockServer("server2");
  server2->addTool("tool2");
  std::vector<std::string> t2 = {"tool2"};
  composite->addServer(server2, t2, true);

  EXPECT_EQ(composite->servers().size(), 2u);
  EXPECT_TRUE(composite->hasTool("server1.tool1"));
  EXPECT_TRUE(composite->hasTool("server2.tool2"));

  // Remove server1
  composite->removeServer("server1");

  EXPECT_EQ(composite->servers().size(), 1u);
  EXPECT_FALSE(composite->hasTool("server1.tool1"));
  EXPECT_TRUE(composite->hasTool("server2.tool2"));
}

TEST_F(OrchTest, ServerCompositeConnectAll) {
  // Tests connecting all servers at once
  auto composite = ServerComposite::create("connect-all");

  auto server1 = makeMockServer("server1");
  server1->addTool("tool1");
  composite->addServer(server1, std::vector<std::string>{"tool1"}, true);

  auto server2 = makeMockServer("server2");
  server2->addTool("tool2");
  composite->addServer(server2, std::vector<std::string>{"tool2"}, true);

  // Both servers should be disconnected initially
  EXPECT_EQ(server1->connectionState(), ConnectionState::DISCONNECTED);
  EXPECT_EQ(server2->connectionState(), ConnectionState::DISCONNECTED);

  // Connect all servers
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        composite->connectAll(d, std::move(cb));
      });

  // Both servers should now be connected
  EXPECT_TRUE(server1->isConnected());
  EXPECT_TRUE(server2->isConnected());
}

TEST_F(OrchTest, ServerCompositeConnectAllEmpty) {
  // Tests connecting when no servers are added (should succeed immediately)
  auto composite = ServerComposite::create("empty");

  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        composite->connectAll(d, std::move(cb));
      });
  // Should complete without error
}

TEST_F(OrchTest, ServerCompositeDisconnectAll) {
  auto composite = ServerComposite::create("disconnect-all");

  auto server1 = makeMockServer("server1");
  server1->addTool("tool1");
  std::vector<std::string> t1 = {"tool1"};
  composite->addServer(server1, t1, true);

  auto server2 = makeMockServer("server2");
  server2->addTool("tool2");
  std::vector<std::string> t2 = {"tool2"};
  composite->addServer(server2, t2, true);

  // Connect first
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        composite->connectAll(d, std::move(cb));
      });

  EXPECT_TRUE(server1->isConnected());
  EXPECT_TRUE(server2->isConnected());

  // Disconnect all
  bool disconnected = false;
  composite->disconnectAll(*dispatcher_, [&]() { disconnected = true; });

  // Run dispatcher until callback fires
  while (!disconnected) {
    dispatcher_->run(mcp::event::RunType::NonBlock);
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }

  EXPECT_FALSE(server1->isConnected());
  EXPECT_FALSE(server2->isConnected());
}

TEST_F(OrchTest, ServerCompositeToolInvocation) {
  // Tests invoking a tool through the composite
  auto composite = ServerComposite::create("invoke-test");

  auto server = makeMockServer("math");
  server->addTool("add", "Adds two numbers");
  server->setHandler("add", [](const JsonValue& args) -> Result<JsonValue> {
    int a = args["a"].getInt();
    int b = args["b"].getInt();
    JsonValue result = JsonValue::object();
    result["sum"] = JsonValue(a + b);
    return makeSuccess(JsonValue(result));
  });

  std::vector<std::string> tool_names = {"add"};
  composite->addServer(server, tool_names, true);

  // Connect
  runToCompletion<std::nullptr_t>(
      [&](Dispatcher& d, ResultCallback<std::nullptr_t> cb) {
        composite->connectAll(d, std::move(cb));
      });

  // Get tool through composite
  auto addTool = composite->tool("math.add");
  EXPECT_NE(addTool, nullptr);
  EXPECT_EQ(addTool->name(), "math.add");

  // Invoke the tool
  JsonValue input = JsonValue::object();
  input["a"] = JsonValue(3);
  input["b"] = JsonValue(5);

  JsonValue result =
      runToCompletion<JsonValue>([&](Dispatcher& d, JsonCallback cb) {
        addTool->invoke(input, RunnableConfig(), d, std::move(cb));
      });

  EXPECT_EQ(result["sum"].getInt(), 8);
}

TEST_F(OrchTest, ServerCompositeToolByServerAndName) {
  // Tests the two-argument tool() method
  auto composite = ServerComposite::create("two-arg");

  auto server = makeMockServer("myserver");
  server->addTool("mytool");
  server->setResponse("mytool", JsonValue("result"));

  std::vector<std::string> tool_names = {"mytool"};
  composite->addServer(server, tool_names, true);

  // Get tool using server name and tool name
  auto tool = composite->tool("myserver", "mytool");
  EXPECT_NE(tool, nullptr);
}

TEST_F(OrchTest, ServerCompositeToolCaching) {
  // Tests that tool objects are cached
  auto composite = ServerComposite::create("cache-test");

  auto server = makeMockServer("server");
  server->addTool("tool");
  std::vector<std::string> tool_names = {"tool"};
  composite->addServer(server, tool_names, true);

  auto tool1 = composite->tool("server.tool");
  auto tool2 = composite->tool("server.tool");

  // Should return the same cached object
  EXPECT_EQ(tool1.get(), tool2.get());
}

TEST_F(OrchTest, ServerCompositeToolNotFound) {
  auto composite = ServerComposite::create("not-found");

  auto server = makeMockServer("server");
  server->addTool("existing_tool");
  std::vector<std::string> tool_names = {"existing_tool"};
  composite->addServer(server, tool_names, true);

  // Try to get a non-existent tool by alias/direct name - returns nullptr
  auto tool = composite->tool("nonexistent");
  EXPECT_EQ(tool, nullptr);

  EXPECT_FALSE(composite->hasTool("nonexistent"));

  // Note: Fully-qualified names (server.tool) can resolve to any tool on
  // a registered server, even if not explicitly mapped. This allows dynamic
  // tool discovery while still supporting explicit mappings for aliases.
  EXPECT_TRUE(composite->hasTool("server.existing_tool"));  // Mapped explicitly
}

TEST_F(OrchTest, ServerCompositeMultipleToolsSameServer) {
  // Tests adding multiple tools from the same server
  auto composite = ServerComposite::create("multi-tool");

  auto server = makeMockServer("api");
  server->addTool("read", "Reads data");
  server->addTool("write", "Writes data");
  server->addTool("delete", "Deletes data");

  std::vector<std::string> tool_names = {"read", "write", "delete"};
  composite->addServer(server, tool_names, true);

  auto tools = composite->listTools();
  EXPECT_EQ(tools.size(), 3u);

  EXPECT_TRUE(composite->hasTool("api.read"));
  EXPECT_TRUE(composite->hasTool("api.write"));
  EXPECT_TRUE(composite->hasTool("api.delete"));
}

TEST_F(OrchTest, ServerCompositeListToolInfos) {
  auto composite = ServerComposite::create("info-test");

  auto server = makeMockServer("server");
  server->addTool("tool1", "Tool one description");
  server->addTool("tool2", "Tool two description");

  std::vector<std::string> tool_names = {"tool1", "tool2"};
  composite->addServer(server, tool_names, true);

  auto infos = composite->listToolInfos();
  EXPECT_EQ(infos.size(), 2u);

  // Check that exposed names are set
  bool found_tool1 = false, found_tool2 = false;
  for (const auto& info : infos) {
    if (info.name == "server.tool1")
      found_tool1 = true;
    if (info.name == "server.tool2")
      found_tool2 = true;
  }
  EXPECT_TRUE(found_tool1);
  EXPECT_TRUE(found_tool2);
}

TEST_F(OrchTest, ServerCompositeChainedAdditions) {
  // Tests fluent API for adding servers and tools
  auto composite = ServerComposite::create("chained");

  auto server1 = makeMockServer("s1");
  server1->addTool("t1");
  auto server2 = makeMockServer("s2");
  server2->addTool("t2");

  // Chain additions
  std::vector<std::string> t1 = {"t1"};
  std::vector<std::string> t2 = {"t2"};
  composite->addServer(server1, t1, true).addServer(server2, t2, true);

  EXPECT_EQ(composite->servers().size(), 2u);
  EXPECT_EQ(composite->listTools().size(), 2u);
}
