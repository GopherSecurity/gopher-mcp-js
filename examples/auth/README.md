# JS Auth MCP Server Example

OAuth-protected MCP (Model Context Protocol) server implementation in TypeScript/Node.js using gopher-auth FFI bindings for JWT token validation.

## Overview

This example demonstrates:
- OAuth 2.0 protected MCP server using JSON-RPC 2.0
- JWT token validation via gopher-auth native library (FFI)
- OAuth discovery endpoints (RFC 9728, RFC 8414, OIDC)
- Scope-based access control for MCP tools
- Integration with Keycloak or compatible OAuth providers

## Prerequisites

- Node.js 18+
- npm or yarn
- Compiled `libgopher-auth` from gopher-orch (for production use)
- Keycloak or compatible OAuth 2.0 server (optional, for auth testing)

## Installation

```bash
# Install dependencies
npm install

# Copy libgopher-auth to lib/ (from gopher-orch build)
# macOS:
cp /path/to/gopher-orch/build/lib/libgopher-auth.dylib ./lib/

# Linux:
cp /path/to/gopher-orch/build/lib/libgopher-auth.so ./lib/
```

## Building the Native Library

Build libgopher-auth from gopher-orch:

```bash
cd /path/to/gopher-orch
mkdir -p build && cd build
cmake -DBUILD_SHARED_LIBS=ON ..
make gopher-auth

# Copy to this example
cp lib/libgopher-auth.* /path/to/gopher-mcp-js/examples/auth/lib/
```

## Configuration

Create or modify `server.config`:

### Auth Disabled Mode (Development/Testing)

```ini
# Server settings
host=0.0.0.0
port=3001
server_url=http://localhost:3001

# Disable auth for development
auth_disabled=true
```

### Auth Enabled Mode (Production)

```ini
# Server settings
host=0.0.0.0
port=3001
server_url=http://localhost:3001

# OAuth/IDP settings (Keycloak example)
auth_server_url=https://keycloak.example.com/realms/mcp
client_id=mcp-client
client_secret=your-client-secret

# Optional: Override derived endpoints
# jwks_uri=https://keycloak.example.com/realms/mcp/protocol/openid-connect/certs
# issuer=https://keycloak.example.com/realms/mcp
# oauth_authorize_url=https://keycloak.example.com/realms/mcp/protocol/openid-connect/auth
# oauth_token_url=https://keycloak.example.com/realms/mcp/protocol/openid-connect/token

# Token validation settings
allowed_scopes=openid profile email mcp:read mcp:admin
jwks_cache_duration=3600
jwks_auto_refresh=true
request_timeout=30
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `host` | Server bind address | `0.0.0.0` |
| `port` | Server port | `3001` |
| `server_url` | Public server URL | `http://localhost:{port}` |
| `auth_server_url` | OAuth server base URL | - |
| `jwks_uri` | JWKS endpoint URL | Derived from auth_server_url |
| `issuer` | Expected token issuer | Derived from auth_server_url |
| `client_id` | OAuth client ID | - |
| `client_secret` | OAuth client secret | - |
| `allowed_scopes` | Space-separated allowed scopes | `openid profile email mcp:read mcp:admin` |
| `jwks_cache_duration` | JWKS cache TTL in seconds | `3600` |
| `jwks_auto_refresh` | Auto-refresh JWKS before expiry | `true` |
| `request_timeout` | HTTP request timeout in seconds | `30` |
| `auth_disabled` | Disable authentication entirely | `false` |

## Running the Server

### Development Mode

```bash
# Run with ts-node (auto-reload not included)
npm run dev
```

### Production Mode

```bash
# Build TypeScript
npm run build

# Run compiled JavaScript
npm start

# Or with custom config
npm start -- /path/to/custom.config
```

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- src/__tests__/integration.test.ts
```

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 123
}
```

### OAuth Discovery

```bash
# Protected Resource Metadata (RFC 9728)
curl http://localhost:3001/.well-known/oauth-protected-resource

# Authorization Server Metadata (RFC 8414)
curl http://localhost:3001/.well-known/oauth-authorization-server

# OpenID Configuration
curl http://localhost:3001/.well-known/openid-configuration
```

### MCP Tools

#### Without Authentication (auth_disabled=true)

```bash
# List available tools
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'

# Get weather (no auth required)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-weather", "arguments": {"city": "Seattle"}}}'
```

#### With Authentication

```bash
# Get an access token from your OAuth provider first
TOKEN="your-jwt-token"

# Get forecast (requires mcp:read scope)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-forecast", "arguments": {"city": "Portland"}}}'

# Get weather alerts (requires mcp:admin scope)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-weather-alerts", "arguments": {"region": "Pacific Northwest"}}}'
```

## Available Tools

| Tool | Description | Required Scope |
|------|-------------|----------------|
| `get-weather` | Current weather for a city | None |
| `get-forecast` | 5-day forecast for a city | `mcp:read` |
| `get-weather-alerts` | Weather alerts for a region | `mcp:admin` |

## OAuth Flow

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐
│  Client │     │  MCP Server  │     │  Keycloak   │
└────┬────┘     └──────┬───────┘     └──────┬──────┘
     │                 │                    │
     │  GET /.well-known/oauth-protected-resource
     │─────────────────>                    │
     │  { authorization_servers: [...] }    │
     │<─────────────────                    │
     │                 │                    │
     │  GET /.well-known/oauth-authorization-server
     │─────────────────>                    │
     │  { authorization_endpoint, token_endpoint, ... }
     │<─────────────────                    │
     │                 │                    │
     │  Redirect to authorization_endpoint  │
     │─────────────────────────────────────>│
     │                 │   User authenticates
     │  Redirect with auth code             │
     │<─────────────────────────────────────│
     │                 │                    │
     │  POST token_endpoint (exchange code) │
     │─────────────────────────────────────>│
     │                 │    Access token    │
     │<─────────────────────────────────────│
     │                 │                    │
     │  POST /mcp with Bearer token         │
     │─────────────────>                    │
     │                 │  Validate JWT      │
     │                 │───────────────────>│
     │                 │   Token valid      │
     │                 │<───────────────────│
     │  Tool response  │                    │
     │<─────────────────                    │
```

## Obtaining a Test Token

### Using Keycloak Direct Access Grant

```bash
# Get token using password grant (for testing only)
curl -X POST https://keycloak.example.com/realms/mcp/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=mcp-client" \
  -d "client_secret=your-secret" \
  -d "username=testuser" \
  -d "password=testpassword" \
  -d "scope=openid profile mcp:read mcp:admin"
```

### Using Authorization Code Flow (Recommended)

1. Start the MCP server
2. Navigate to `http://localhost:3001/oauth/authorize?client_id=your-client&response_type=code&redirect_uri=your-callback`
3. Complete login in Keycloak
4. Exchange the authorization code for tokens

## Troubleshooting

### Library Loading Errors

```
Error: Cannot load library: ./lib/libgopher-auth.dylib
```

**Solution:** Ensure the native library is compiled and copied to the `lib/` directory.

### Token Validation Failures

```
401 Unauthorized: Token validation failed
```

**Causes:**
- Token expired - obtain a new token
- Invalid issuer - check `issuer` in config matches token
- JWKS fetch failed - verify `jwks_uri` is accessible
- Invalid audience - ensure token has correct audience claim

### JWKS Fetch Errors

```
Error: JWKS fetch failed
```

**Solutions:**
- Verify `jwks_uri` is correct and accessible
- Check network connectivity to OAuth server
- Increase `request_timeout` if needed

### Scope Access Denied

```
{"error": "access_denied", "message": "Required scope: mcp:read"}
```

**Solution:** Ensure your token includes the required scope. Request additional scopes during token acquisition.

## Project Structure

```
examples/auth/
├── lib/                    # Native library (libgopher-auth)
├── src/
│   ├── ffi/               # FFI bindings
│   │   ├── types.ts       # Type definitions
│   │   ├── loader.ts      # Native library loader
│   │   ├── auth-client.ts # AuthClient wrapper
│   │   ├── validation-options.ts
│   │   └── index.ts       # Barrel export
│   ├── middleware/
│   │   └── oauth-auth.ts  # OAuth middleware
│   ├── routes/
│   │   ├── health.ts      # Health endpoint
│   │   ├── oauth-endpoints.ts  # Discovery endpoints
│   │   └── mcp-handler.ts # JSON-RPC handler
│   ├── tools/
│   │   └── weather-tools.ts    # Example tools
│   ├── config.ts          # Configuration loader
│   └── index.ts           # Entry point
├── package.json
├── tsconfig.json
├── server.config          # Server configuration
└── README.md
```

## License

See the main gopher-mcp-js repository for license information.
