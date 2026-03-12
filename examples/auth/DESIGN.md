# JavaScript Auth MCP Server Example

OAuth-protected MCP (Model Context Protocol) server implementation in TypeScript/JavaScript using gopher-auth FFI bindings for JWT token validation.

## Overview

This example demonstrates:
- OAuth 2.0 protected MCP server using JSON-RPC 2.0
- JWT token validation via gopher-auth native library (FFI)
- OAuth discovery endpoints (RFC 9728, RFC 8414, OIDC)
- Scope-based access control for MCP tools
- Integration with Keycloak or compatible OAuth providers

## Project Structure

```
examples/auth/
├── src/
│   ├── index.ts                    # Entry point, Express app setup
│   ├── config.ts                   # Configuration loader
│   ├── middleware/
│   │   ├── oauth-auth.ts           # JWT validation middleware
│   │   └── __tests__/
│   │       └── oauth-auth.test.ts
│   ├── routes/
│   │   ├── health.ts               # Health endpoint
│   │   ├── oauth-endpoints.ts      # OAuth discovery endpoints
│   │   ├── mcp-handler.ts          # JSON-RPC 2.0 handler
│   │   └── __tests__/
│   │       ├── health.test.ts
│   │       ├── oauth-endpoints.test.ts
│   │       └── mcp-handler.test.ts
│   ├── tools/
│   │   ├── weather-tools.ts        # Example MCP tools
│   │   └── __tests__/
│   │       └── weather-tools.test.ts
│   └── __tests__/
│       ├── config.test.ts
│       └── integration.test.ts
├── dist/                           # Compiled JavaScript
├── lib/                            # Native libraries (libgopher-orch)
├── package.json
├── tsconfig.json
├── jest.config.js
├── server.config                   # Configuration file
└── README.md
```

---

## Endpoints Reference

### Public Endpoints (No Authentication Required)

#### Health Check

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health monitoring |

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 123
}
```

---

### OAuth Discovery Endpoints

#### Protected Resource Metadata (RFC 9728)

| Method | Path                                        | Description               |
| ------ | ------------------------------------------- | ------------------------- |
| GET    | `/.well-known/oauth-protected-resource`     | Resource metadata         |
| GET    | `/.well-known/oauth-protected-resource/mcp` | Resource-specific variant |
|        |                                             |                           |

**Response:**
```json
{
  "resource": "http://localhost:3001/mcp",
  "authorization_servers": ["https://auth.example.com/realms/mcp"],
  "scopes_supported": ["openid", "profile", "email", "mcp:read", "mcp:admin"],
  "bearer_methods_supported": ["header", "query"],
  "resource_documentation": "http://localhost:3001/docs"
}
```

#### Authorization Server Metadata (RFC 8414)

| Method | Path                                      | Description           |
| ------ | ----------------------------------------- | --------------------- |
| GET    | `/.well-known/oauth-authorization-server` | OAuth server metadata |

**Response:**
```json
{
  "issuer": "https://auth.example.com/realms/mcp",
  "authorization_endpoint": "https://auth.example.com/realms/mcp/protocol/openid-connect/auth",
  "token_endpoint": "https://auth.example.com/realms/mcp/protocol/openid-connect/token",
  "jwks_uri": "https://auth.example.com/realms/mcp/protocol/openid-connect/certs",
  "registration_endpoint": "http://localhost:3001/oauth/register",
  "scopes_supported": ["openid", "profile", "email", "mcp:read", "mcp:admin"],
  "response_types_supported": ["code", "token", "id_token", "code token", "code id_token"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

#### OpenID Connect Discovery

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/openid-configuration` | OIDC discovery |

**Response:** Extends RFC 8414 with:
```json
{
  "...": "...RFC 8414 fields...",
  "userinfo_endpoint": "https://auth.example.com/realms/mcp/protocol/openid-connect/userinfo",
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

#### Authorization Redirect

| Method | Path               | Description                         |
| ------ | ------------------ | ----------------------------------- |
| GET    | `/oauth/authorize` | Redirects to authorization endpoint |

Forwards all query parameters to the configured `oauth_authorize_url`. Returns HTTP 302 redirect.

#### Dynamic Client Registration (RFC 7591)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/oauth/register` | Client registration (stateless mode) |

**Request:**
```json
{
  "redirect_uris": ["http://localhost:8080/callback"]
}
```

**Response:**
```json
{
  "client_id": "mcp-client-id",
  "client_secret": "mcp-client-secret",
  "client_id_issued_at": 1705312200,
  "client_secret_expires_at": 0,
  "redirect_uris": ["http://localhost:8080/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "client_secret_basic"
}
```

---

### Protected Endpoints (Authentication Required)

#### MCP JSON-RPC Handler

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mcp` | MCP JSON-RPC 2.0 endpoint |
| POST | `/rpc` | Alias for /mcp |
| OPTIONS | `/mcp` | CORS preflight |
| OPTIONS | `/rpc` | CORS preflight |

---

## MCP JSON-RPC Methods

### `initialize`

Initialize MCP protocol session.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "test-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "auth-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

### `tools/list`

List available tools.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get-weather",
        "description": "Get current weather for a city",
        "inputSchema": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "City name"
            }
          },
          "required": ["city"]
        }
      },
      {
        "name": "get-forecast",
        "description": "Get 5-day forecast (requires mcp:read scope)",
        "inputSchema": { "..." }
      },
      {
        "name": "get-weather-alerts",
        "description": "Get weather alerts (requires mcp:admin scope)",
        "inputSchema": { "..." }
      }
    ]
  }
}
```

### `tools/call`

Invoke a tool.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get-weather",
    "arguments": {
      "city": "Seattle"
    }
  }
}
```

**Response (Success):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"city\":\"Seattle\",\"temperature\":20,\"condition\":\"Sunny\",\"humidity\":65,\"windSpeed\":12}"
      }
    ]
  }
}
```

**Response (Access Denied):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"error\":\"access_denied\",\"message\":\"Access denied. Required scope: mcp:read\"}"
      }
    ],
    "isError": true
  }
}
```

### `ping`

Health check method.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "ping",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {}
}
```

### JSON-RPC Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse Error | Invalid JSON |
| -32600 | Invalid Request | Invalid JSON-RPC request |
| -32601 | Method Not Found | Method does not exist |
| -32602 | Invalid Params | Invalid method parameters |
| -32603 | Internal Error | Server error |

---

## Available Tools & Scopes

| Tool | Description | Required Scope |
|------|-------------|----------------|
| `get-weather` | Current weather for a city | None (public) |
| `get-forecast` | 5-day weather forecast | `mcp:read` |
| `get-weather-alerts` | Weather alerts for a region | `mcp:admin` |

### Scope Hierarchy

```
openid          - Standard OIDC scope
profile         - User profile information
email           - User email
mcp:read        - Read access to MCP tools (forecast)
mcp:admin       - Admin access to MCP tools (alerts)
```

---

## OAuth Flow

### Complete Authentication Flow

```
┌──────────┐     ┌─────────────────┐     ┌──────────────┐
│  Client  │     │  MCP Server     │     │  OAuth/IDP   │
└────┬─────┘     └───────┬─────────┘     └──────┬───────┘
     │                   │                      │
     │ GET /.well-known/oauth-protected-resource│
     │──────────────────>│                      │
     │ { authorization_servers: [...] }         │
     │<──────────────────│                      │
     │                   │                      │
     │ GET /.well-known/oauth-authorization-server
     │──────────────────>│                      │
     │ { authorization_endpoint, token_endpoint, ... }
     │<──────────────────│                      │
     │                   │                      │
     │ GET /oauth/authorize?response_type=code&...
     │──────────────────>│                      │
     │ HTTP 302 Redirect │                      │
     │<──────────────────│                      │
     │                   │                      │
     │ Redirect to authorization_endpoint       │
     │─────────────────────────────────────────>│
     │                   │    User authenticates│
     │ Redirect with authorization code         │
     │<─────────────────────────────────────────│
     │                   │                      │
     │ POST token_endpoint (exchange code)      │
     │─────────────────────────────────────────>│
     │                   │    Access token      │
     │<─────────────────────────────────────────│
     │                   │                      │
     │ POST /mcp with Bearer token              │
     │──────────────────>│                      │
     │                   │ Validate JWT (JWKS)  │
     │                   │─────────────────────>│
     │                   │ Token valid          │
     │                   │<─────────────────────│
     │ Tool response     │                      │
     │<──────────────────│                      │
```

### Token Validation Flow

```
1. Extract token from Authorization header or query parameter
   └─ Authorization: Bearer <token>
   └─ ?access_token=<token>

2. Verify token signature against JWKS
   └─ Fetch JWKS from configured jwks_uri
   └─ Cache JWKS for configured duration

3. Check token expiration
   └─ Apply clock skew tolerance (default: 30s)

4. Extract JWT claims
   └─ subject (sub) → userId
   └─ scope → scopes (space-separated)
   └─ aud → audience
   └─ exp → tokenExpiry

5. Attach auth context to request
   └─ { userId, scopes, audience, tokenExpiry, authenticated: true }

6. Route to handler
   └─ Handler checks required scope at tool invocation time
```

### Path-Based Access Control

| Path Pattern | Authentication |
|--------------|----------------|
| `/.well-known/*` | Not required |
| `/oauth/*` | Not required |
| `/health` | Not required |
| `/authorize` | Not required |
| `/mcp/*` | Required |
| `/rpc/*` | Required |
| `/events/*` | Required |
| `/sse/*` | Required |
| Other | Required (default) |

---

## Configuration

### Configuration File Format

Key=value pairs (INI-style):
```ini
# Comments start with #
host=0.0.0.0
port=3001
auth_server_url=https://auth.example.com/realms/mcp
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | `0.0.0.0` | Server bind address |
| `port` | number | `3001` | Server port |
| `server_url` | string | `http://localhost:{port}` | Public server URL |
| `auth_server_url` | string | - | OAuth provider base URL |
| `jwks_uri` | string | Derived | JWKS endpoint URL |
| `issuer` | string | Derived | Expected token issuer |
| `client_id` | string | - | OAuth client ID |
| `client_secret` | string | - | OAuth client secret |
| `oauth_authorize_url` | string | Derived | Authorization endpoint |
| `oauth_token_url` | string | Derived | Token endpoint |
| `allowed_scopes` | string | `openid profile email mcp:read mcp:admin` | Allowed scopes |
| `jwks_cache_duration` | number | `3600` | JWKS cache TTL (seconds) |
| `jwks_auto_refresh` | boolean | `true` | Auto-refresh JWKS |
| `request_timeout` | number | `30` | HTTP timeout (seconds) |
| `auth_disabled` | boolean | `false` | Disable authentication |

### Endpoint Derivation

When `auth_server_url` is provided, endpoints are derived automatically:

```
auth_server_url = https://auth.example.com/realms/mcp

Derived endpoints:
├── jwks_uri         = {auth_server_url}/protocol/openid-connect/certs
├── issuer           = {auth_server_url}
├── oauth_authorize_url = {auth_server_url}/protocol/openid-connect/auth
└── oauth_token_url  = {auth_server_url}/protocol/openid-connect/token
```

### Example Configuration

```ini
# Server settings
host=0.0.0.0
port=3001
server_url=https://mcp.example.com

# OAuth/IDP settings (Keycloak)
auth_server_url=https://keycloak.example.com/realms/mcp
client_id=mcp-client
client_secret=your-client-secret

# Scopes
allowed_scopes=openid profile email mcp:read mcp:admin

# Cache settings
jwks_cache_duration=3600
jwks_auto_refresh=true
request_timeout=30

# Development mode (disable for production)
auth_disabled=false
```

---

## Running the Server

### Development Mode

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run with auth disabled
npm start -- --no-auth

# Run with auth enabled
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- routes/mcp-handler.test.ts
```

### Testing Endpoints

```bash
# Health check
curl http://localhost:3001/health

# OAuth discovery
curl http://localhost:3001/.well-known/oauth-protected-resource
curl http://localhost:3001/.well-known/oauth-authorization-server

# MCP initialize (no auth required for initialize)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List tools
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call public tool (no auth)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get-weather","arguments":{"city":"Seattle"}}}'

# Call protected tool (with auth)
TOKEN="your-jwt-token"
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get-forecast","arguments":{"city":"Portland"}}}'
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@gopher.security/gopher-mcp-js` | FFI bindings for gopher-auth |
| `express` | Web framework |
| `typescript` | Type-safe development |
| `jest` | Testing framework |
| `supertest` | HTTP testing |

---

## Security Considerations

1. **Token Validation**: All JWT tokens are validated against the JWKS endpoint
2. **Signature Verification**: RS256 signature verification using public keys
3. **Expiration Checks**: Tokens are checked for expiration with clock skew tolerance
4. **Scope Enforcement**: Tool-level scope checking prevents unauthorized access
5. **CORS**: Configurable CORS headers for browser clients
6. **HTTPS**: Use HTTPS in production for token security

---

## Troubleshooting

### Library Loading Errors

```
RuntimeError: Auth functions not available
```

**Solution:** Ensure native library is compiled and accessible:
- Copy `libgopher-orch.dylib` (macOS) or `libgopher-orch.so` (Linux) to `./lib/`
- Or set `GOPHER_ORCH_LIBRARY_PATH` environment variable

### Token Validation Failures

```
401 Unauthorized: Token validation failed
```

**Causes:**
- Token expired - obtain a new token
- Invalid issuer - check `issuer` in config matches token
- JWKS fetch failed - verify `jwks_uri` is accessible
- Invalid signature - ensure correct JWKS endpoint

### Scope Access Denied

```json
{"error":"access_denied","message":"Required scope: mcp:read"}
```

**Solution:** Request additional scopes during token acquisition from the OAuth provider.
