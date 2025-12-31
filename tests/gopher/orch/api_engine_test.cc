// API Engine Tests

#include "orch_test_fixture.h"
#include "gopher/orch/api/api_engine.h"
#include "../../../src/gopher/orch/api/test_api_engine.h"

using namespace gopher::orch::api;
using namespace gopher::orch::core;

// Test 1: Basic GET request with mock response
TEST_F(OrchTest, ApiEngineBasicGetRequestWithMockResponse) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup mock response
    ApiResponse mock_response;
    mock_response.status_code = 200;
    mock_response.body = R"({"message": "Hello, World!"})";
    mock_response.headers["Content-Type"] = "application/json";
    
    engine->addMockResponse("https://api.example.com/hello", "GET", mock_response);
    
    // Make request
    ApiResponse response = engine->get("/hello");
    
    // Verify response
    EXPECT_EQ(response.status_code, 200);
    EXPECT_EQ(response.body, R"({"message": "Hello, World!"})");
    EXPECT_TRUE(response.isSuccess());
    EXPECT_EQ(response.headers["Content-Type"], "application/json");
}

// Test 2: POST request with JSON data
TEST_F(OrchTest, ApiEnginePostRequestWithJsonData) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup mock response
    ApiResponse mock_response;
    mock_response.status_code = 201;
    mock_response.body = R"({"id": 123, "status": "created"})";
    
    engine->addMockResponse("https://api.example.com/users", "POST", mock_response);
    
    // Prepare request data
    std::string json_data = R"({"name": "John Doe", "email": "john@example.com"})";
    std::unordered_map<std::string, std::string> headers = {
        {"Content-Type", "application/json"}
    };
    
    // Make request
    ApiResponse response = engine->post("/users", json_data, headers);
    
    // Verify response
    EXPECT_EQ(response.status_code, 201);
    EXPECT_TRUE(response.isSuccess());
    
    // Parse response JSON
    JsonValue root = JsonValue::parse(response.body);
    
    EXPECT_EQ(root["id"].getInt(), 123);
    EXPECT_EQ(root["status"].getString(), "created");
}

// Test 3: Using response queue for sequential responses
TEST_F(OrchTest, ApiEngineResponseQueueForSequentialCalls) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Queue multiple responses
    ApiResponse first_response;
    first_response.status_code = 200;
    first_response.body = "First response";
    
    ApiResponse second_response;
    second_response.status_code = 201;
    second_response.body = "Second response";
    
    ApiResponse third_response;
    third_response.status_code = 204;
    third_response.body = "";
    
    engine->queueResponse(first_response);
    engine->queueResponse(second_response);
    engine->queueResponse(third_response);
    
    // Make sequential requests - responses come from queue
    ApiResponse resp1 = engine->get("/any/path");
    EXPECT_EQ(resp1.status_code, 200);
    EXPECT_EQ(resp1.body, "First response");
    
    ApiResponse resp2 = engine->post("/different/path", "data");
    EXPECT_EQ(resp2.status_code, 201);
    EXPECT_EQ(resp2.body, "Second response");
    
    ApiResponse resp3 = engine->del("/another/path");
    EXPECT_EQ(resp3.status_code, 204);
    EXPECT_EQ(resp3.body, "");
}

// Test 4: Request history tracking
TEST_F(OrchTest, ApiEngineRequestHistoryTracking) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup default response
    ApiResponse default_resp;
    default_resp.status_code = 200;
    engine->setDefaultResponse(default_resp);
    
    // Make several requests
    engine->get("/users");
    engine->post("/users", R"({"name": "Alice"})");
    engine->put("/users/1", R"({"name": "Bob"})");
    engine->del("/users/2");
    
    // Check request history
    const auto& history = engine->getRequestHistory();
    EXPECT_EQ(history.size(), 4);
    
    // Verify first request
    EXPECT_EQ(history[0].method, "GET");
    EXPECT_EQ(history[0].url, "https://api.example.com/users");
    EXPECT_EQ(history[0].data, "");
    
    // Verify second request
    EXPECT_EQ(history[1].method, "POST");
    EXPECT_EQ(history[1].url, "https://api.example.com/users");
    EXPECT_EQ(history[1].data, R"({"name": "Alice"})");
    
    // Verify third request
    EXPECT_EQ(history[2].method, "PUT");
    EXPECT_EQ(history[2].url, "https://api.example.com/users/1");
    EXPECT_EQ(history[2].data, R"({"name": "Bob"})");
    
    // Verify fourth request
    EXPECT_EQ(history[3].method, "DELETE");
    EXPECT_EQ(history[3].url, "https://api.example.com/users/2");
}

// Test 5: URL pattern matching with regex
TEST_F(OrchTest, ApiEngineRegexUrlPatternMatching) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup mock responses with regex patterns
    ApiResponse user_response;
    user_response.status_code = 200;
    user_response.body = R"({"type": "user"})";
    
    ApiResponse admin_response;
    admin_response.status_code = 200;
    admin_response.body = R"({"type": "admin"})";
    
    // Match any URL ending with /users/[number]
    engine->addMockResponse(".*\\/users\\/\\d+", "GET", user_response);
    
    // Match any URL containing /admin/
    engine->addMockResponse(".*\\/admin\\/.*", "GET", admin_response);
    
    // Test user endpoint
    ApiResponse resp1 = engine->get("/api/v1/users/123");
    EXPECT_EQ(resp1.body, R"({"type": "user"})");
    
    ApiResponse resp2 = engine->get("/users/456");
    EXPECT_EQ(resp2.body, R"({"type": "user"})");
    
    // Test admin endpoint
    ApiResponse resp3 = engine->get("/admin/dashboard");
    EXPECT_EQ(resp3.body, R"({"type": "admin"})");
}

// Test 6: Authentication header testing
TEST_F(OrchTest, ApiEngineAuthenticationHeaders) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup default response
    ApiResponse default_resp;
    default_resp.status_code = 200;
    engine->setDefaultResponse(default_resp);
    
    // Test API Key
    engine->setApiKey("secret-key-123");
    engine->get("/protected");
    
    const auto& history1 = engine->getRequestHistory();
    EXPECT_EQ(history1.back().headers.at("X-API-Key"), "secret-key-123");
    
    // Clear and test Bearer Token
    engine->clearRequestHistory();
    engine->setBearerToken("jwt-token-xyz");
    engine->get("/protected");
    
    const auto& history2 = engine->getRequestHistory();
    EXPECT_EQ(history2.back().headers.at("Authorization"), "Bearer jwt-token-xyz");
    
    // Clear and test Basic Auth
    engine->clearRequestHistory();
    engine->setBasicAuth("user", "pass");
    engine->get("/protected");
    
    const auto& history3 = engine->getRequestHistory();
    EXPECT_EQ(history3.back().headers.at("Authorization"), "Basic user:pass");
}

// Test 7: Error simulation (network errors and timeouts)
TEST_F(OrchTest, ApiEngineErrorSimulation) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Test network error simulation
    engine->simulateNetworkError(true);
    ApiResponse network_error = engine->get("/test");
    
    EXPECT_EQ(network_error.status_code, -1);
    EXPECT_EQ(network_error.error_message, "Simulated network error");
    EXPECT_FALSE(network_error.isSuccess());
    
    // Reset and test timeout simulation
    engine->simulateNetworkError(false);
    engine->simulateTimeout(true);
    ApiResponse timeout_error = engine->get("/test");
    
    EXPECT_EQ(timeout_error.status_code, -1);
    EXPECT_EQ(timeout_error.error_message, "Request timeout");
    EXPECT_FALSE(timeout_error.isSuccess());
}

// Test 8: Dynamic response handler
TEST_F(OrchTest, ApiEngineDynamicResponseHandler) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Add a handler that returns different responses based on request data
    engine->addMockHandler(".*\\/calculate", "POST", 
        [](const std::string& url, const std::string& data) -> ApiResponse {
            ApiResponse response;
            
            // Parse input JSON
            JsonValue input = JsonValue::parse(data);
            
            int a = input["a"].getInt();
            int b = input["b"].getInt();
            int result = a + b;
            
            // Create response
            JsonValue output = JsonValue::object();
            output["result"] = JsonValue(result);
            
            response.body = output.toString();
            response.status_code = 200;
            
            return response;
        });
    
    // Test the dynamic handler
    ApiResponse resp1 = engine->post("/calculate", R"({"a": 5, "b": 3})");
    EXPECT_EQ(resp1.status_code, 200);
    
    JsonValue result1 = JsonValue::parse(resp1.body);
    EXPECT_EQ(result1["result"].getInt(), 8);
    
    // Test with different values
    ApiResponse resp2 = engine->post("/calculate", R"({"a": 10, "b": 20})");
    JsonValue result2 = JsonValue::parse(resp2.body);
    EXPECT_EQ(result2["result"].getInt(), 30);
}

// Test 9: Testing fetchComposite business logic
TEST_F(OrchTest, ApiEngineFetchCompositeBusinessLogic) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup mock response for composite endpoint
    ApiResponse composite_response;
    composite_response.status_code = 200;
    composite_response.body = R"({
        "namespace": "production",
        "components": ["service-a", "service-b", "service-c"],
        "status": "healthy"
    })";
    
    engine->addMockResponse(".*\\/api\\/v1\\/composite\\/production", "GET", composite_response);
    
    // Call business logic method
    std::string result = engine->fetchComposite("production");
    
    // Verify result
    EXPECT_EQ(result, composite_response.body);
    
    // Verify the correct endpoint was called
    const auto& history = engine->getRequestHistory();
    EXPECT_EQ(history.size(), 1);
    EXPECT_EQ(history[0].method, "GET");
    EXPECT_TRUE(history[0].url.find("/api/v1/composite/production") != std::string::npos);
}

// Test 10: Error handling in fetchComposite
TEST_F(OrchTest, ApiEngineFetchCompositeErrorHandling) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Setup error response
    ApiResponse error_response;
    error_response.status_code = 404;
    error_response.error_message = "Namespace not found";
    
    engine->addMockResponse(".*\\/api\\/v1\\/composite\\/unknown", "GET", error_response);
    
    // Expect exception to be thrown
    EXPECT_THROW({
        engine->fetchComposite("unknown");
    }, std::runtime_error);
}

// Test 11: Default response for unmatched requests
TEST_F(OrchTest, ApiEngineDefaultResponseForUnmatchedRequests) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Set custom default response
    ApiResponse custom_default;
    custom_default.status_code = 503;
    custom_default.body = "Service temporarily unavailable";
    custom_default.error_message = "No mock configured";
    
    engine->setDefaultResponse(custom_default);
    
    // Make request that doesn't match any mock
    ApiResponse response = engine->get("/unmocked/endpoint");
    
    EXPECT_EQ(response.status_code, 503);
    EXPECT_EQ(response.body, "Service temporarily unavailable");
    EXPECT_EQ(response.error_message, "No mock configured");
}

// Test 12: Clear mocks and reset state
TEST_F(OrchTest, ApiEngineClearMocksAndResetState) {
    auto engine = std::make_unique<TestApiEngine>();
    engine->setBaseUrl("https://api.example.com");
    
    // Add some mocks and queued responses
    ApiResponse mock_resp;
    mock_resp.status_code = 200;
    engine->addMockResponse(".*", "GET", mock_resp);
    engine->queueResponse(mock_resp);
    
    // Make a request to populate history
    engine->get("/test");
    
    EXPECT_EQ(engine->getRequestHistory().size(), 1);
    
    // Clear everything
    engine->clearMocks();
    engine->clearRequestHistory();
    
    // Verify cleared
    EXPECT_EQ(engine->getRequestHistory().size(), 0);
    
    // Request should now return default response
    ApiResponse response = engine->get("/test");
    EXPECT_EQ(response.status_code, 404); // Default response
}

// Tests are now part of the main test suite