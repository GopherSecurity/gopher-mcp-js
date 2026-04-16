# Migration Guide: gopher-auth-sdk-nodejs to @gopher.security/gopher-mcp-js

This guide documents how to migrate from the standalone `gopher-auth-sdk-nodejs` package to the integrated auth module in `@gopher.security/gopher-mcp-js`.

## Why Migrate

- **Native performance**: JWT validation, JWKS caching, and OAuth operations run in C++ via FFI instead of JavaScript (jose/axios)
- **Unified SDK**: One package for both MCP agent orchestration and OAuth authentication
- **PQC-ready**: The native crypto layer supports post-quantum algorithms
- **Thread-safe session management**: Built-in per-client session tracking
- **Per-request auth context**: No shared state race condition (the old SDK's `currentAuthContext` bug)

## Installation

```bash
# Remove old SDK and its dependencies
npm uninstall gopher-auth-sdk-nodejs jose axios dotenv

# Install unified SDK
npm install @gopher.security/gopher-mcp-js
```

The native binary is auto-downloaded via `postinstall` for:
- macOS (arm64, x64)
- Linux (arm64, x64)
- Windows (arm64, x64)

## Import Changes

```typescript
// Before
import { GopherAuth } from 'gopher-auth-sdk-nodejs';

// After
import { GopherAuth } from '@gopher.security/gopher-mcp-js';
```

## Configuration

The old SDK uses environment variables via `dotenv`. The new SDK supports both `server.config` files and inline config:

```typescript
// Before (env vars via dotenv)
dotenv.config();
const auth = new GopherAuth({
  authServerUrl: process.env.GOPHER_AUTH_SERVER_URL!,
  clientId: process.env.GOPHER_CLIENT_ID!,
  clientSecret: process.env.GOPHER_CLIENT_SECRET!,
  serverUrl: SERVER_URL,
});

// After (config file — same INI format as C++ example)
const auth = new GopherAuth({ configPath: './server.config' });
auth.initialize(); // Required — loads native library

// Or (inline config)
const auth = new GopherAuth({
  config: {
    authServerUrl: 'https://auth.example.com/realms/mcp',
    clientId: 'my-server',
    clientSecret: 'secret',
    serverUrl: 'http://localhost:3001',
  },
});
auth.initialize();
```

### server.config format

```ini
# Required
client_id = my-client
client_secret = my-secret
auth_server_url = https://auth.example.com/realms/mcp

# Optional (auto-derived from auth_server_url)
# jwks_uri = ...
# oauth_authorize_url = ...
# oauth_token_url = ...

# Server settings
host = 0.0.0.0
port = 3001
# server_url = https://my-public-url.com

# Scopes
allowed_scopes = openid profile email mcp:read mcp:admin
```

## API Mapping

| Old SDK | New SDK | Notes |
|---------|---------|-------|
| `new GopherAuth({...})` | `new GopherAuth({ configPath })` or `new GopherAuth({ config: {...} })` | Config nested or from file |
| *(implicit)* | `auth.initialize()` | **Required** before any method |
| `await auth.validateToken(token)` | `auth.validateToken(token)` | Now **sync**. Remove `await`. |
| `await auth.exchangeToken(opts)` | `auth.exchangeToken(opts)` | Now **sync**. Remove `await`. |
| `auth.hasScope(payload, scope)` | `auth.hasScope(payload, scope)` | Same |
| `auth.expressMiddleware(opts)` | `auth.expressMiddleware(opts)` | Same options |
| `auth.registerOAuthRoutes(app, opts)` | `auth.registerOAuthRoutes(app, opts)` | Same |
| `(req as any).auth` | `req.authContext` | Typed `GopherAuthContext`, per-request |
| `(req as any).auth.rawToken` | `req.authContext.rawToken` | Same concept |
| `auth.getProtectedResourceMetadata()` | `auth.getProtectedResourceMetadata()` | Same |
| `auth.getWWWAuthenticateHeader(opts)` | `auth.getWWWAuthenticateHeader(opts)` | Same |
| `auth.getTokenEndpoint()` | `auth.getTokenEndpoint()` | Same |
| `await auth.refreshJwks()` | `auth.refreshJwks()` | Now **sync** |
| *(none)* | `auth.shutdown()` | **Required** for cleanup |

## Express Setup

```typescript
// Before
app.use(cors());
app.use(bodyParser.json());
auth.registerOAuthRoutes(app, { serverUrl: SERVER_URL, allowedScopes: MCP_SCOPES });
app.all('/mcp',
  auth.expressMiddleware({ toolScopes: {...} }),
  async (req, res) => { await mcpServer.handleRequest(req, res); }
);

// After — nearly identical, but add:
// 1. cors() must expose mcp-session-id header
// 2. publicMethods for MCP initialize
app.use(cors({
  exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id'],
}));
app.use(bodyParser.json());
auth.registerOAuthRoutes(app, { serverUrl: SERVER_URL, allowedScopes: MCP_SCOPES });
app.all('/mcp',
  auth.expressMiddleware({
    publicMethods: ['initialize'],  // Let MCP init through without auth
    toolScopes: {...},
  }),
  async (req, res) => { await mcpServer.handleRequest(req, res); }
);
```

## Auth Context Access

```typescript
// Before
const authContext = (req as any).auth;
const userId = authContext?.sub;
const rawToken = authContext?.rawToken;

// After (typed, per-request)
const authContext = req.authContext;
const userId = authContext?.userId;
const rawToken = authContext?.rawToken;
```

## Token Exchange

```typescript
// Before (async)
const result = await auth.exchangeToken({
  subjectToken: authContext.rawToken,
  requestedIssuer: 'gopher-idp',
});
console.log(result.access_token);

// After (sync)
const result = auth.exchangeToken({
  subjectToken: authContext.rawToken,
  requestedIssuer: 'gopher-idp',
});
console.log(result.accessToken); // camelCase
```

## MCP SDK 1.29+ Compatibility

If using `@modelcontextprotocol/sdk` 1.29+, the `Server` class only allows one `connect()` call. Create a **factory function** that returns a new `Server` per session:

```typescript
// Before (single Server, works with older SDK)
const server = new Server({...}, {...});
server.setRequestHandler(ListToolsRequestSchema, async () => {...});
const mcpServer = new MCPServer(server);

// After (factory, works with SDK 1.29+)
function createMcpServer(): Server {
  const server = new Server({...}, {...});
  server.setRequestHandler(ListToolsRequestSchema, async () => {...});
  return server;
}
const mcpServer = new MCPServer(createMcpServer);
```

Update `MCPServer` constructor to accept a factory:

```typescript
export type ServerFactory = () => Server;

export class MCPServer {
  private serverFactory: ServerFactory;
  constructor(serverFactory: ServerFactory) {
    this.serverFactory = serverFactory;
  }
  // In handleRequest, for new sessions:
  const sessionServer = this.serverFactory();
  await sessionServer.connect(transport);
}
```

## CORS Configuration

The `mcp-session-id` header must be exposed for browser-based MCP clients:

```typescript
app.use(cors({
  exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id'],
}));
```

Without this, the browser cannot read the session ID from the `initialize` response, causing all subsequent requests to fail.

## OAuth Discovery

The new SDK's `registerOAuthRoutes()` points `token_endpoint` and `authorization_endpoint` in discovery metadata **directly to Keycloak** (from `oauth_token_url` and `oauth_authorize_url` in config). This matches the old SDK pattern — no local token proxy needed.

## Shutdown

```typescript
// New — required for native resource cleanup
process.on('SIGINT', () => {
  auth.shutdown();
  process.exit(0);
});
```

## Breaking Changes Summary

1. `auth.initialize()` — required before any method call
2. `validateToken()` and `exchangeToken()` — synchronous (remove `await`)
3. `req.authContext` — typed `GopherAuthContext` instead of `(req as any).auth`
4. `userId` — field renamed from `sub` to `userId`
5. `accessToken` — camelCase in TokenResponse (was `access_token`)
6. `auth.shutdown()` — required on exit
7. `cors({ exposedHeaders: ['mcp-session-id'] })` — required for MCP Inspector
8. `publicMethods: ['initialize']` — needed in expressMiddleware for MCP protocol

## Deployment Changes

- **No longer depends on** `jose`, `axios`, or `dotenv` npm packages
- **Requires native binary** for target platform (auto-downloaded via npm postinstall)
- **Docker**: Ensure the native library is available in the runtime image
- **Lambda/serverless**: Include native library in deployment package
- **Set `GOPHER_ORCH_LIBRARY_PATH`** env var for custom library location

## New Features (not in old SDK)

- **Auto-refresh**: Transparent token refresh via session manager + auto-refresh function
- **hasAllScopes() / hasAnyScope()**: AND/OR scope validation backed by C++
- **Per-request auth context**: `req.authContext` is never shared between requests
- **ConfigLoader**: Load config from files, environment variables, or inline key-value pairs with Keycloak endpoint auto-derivation
- **IDP alias validation**: `gopherAuthValidateIdp()` for RFC 8693 token exchange
- **OAuth metadata builders**: RFC 9728, RFC 8414, OIDC discovery JSON built by native library
- **Session management**: Thread-safe per-client session storage with expiry tracking

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Cannot load library" | Run `npm install` to re-download native binary. Check platform support. |
| "Function not available" | Native library version mismatch. Update `@gopher.security/gopher-mcp-js`. |
| "Auth client not initialized" | Call `auth.initialize()` before using any auth methods. |
| "GopherAuth not initialized" | Call `auth.initialize()` after construction. |
| "Already connected to a transport" | Use a `ServerFactory` pattern instead of shared `Server` (SDK 1.29+). |
| CORS error on /mcp | Add `exposedHeaders: ['mcp-session-id']` to `cors()` config. |
| "Missing form parameter: grant_type" | Discovery metadata should point to Keycloak directly, not a local proxy. |
| "Mcp-Session-Id header is required" | Ensure `mcp-session-id` is in CORS `exposedHeaders`. |
| Token proxy 404 | Check that `auth_server_url` in config points to the correct Keycloak realm. |
