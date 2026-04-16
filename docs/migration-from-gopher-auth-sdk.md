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
npm uninstall gopher-auth-sdk-nodejs jose axios

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

## Initialization

The new SDK requires an explicit `initialize()` call to load the native library:

```typescript
// Before
const auth = new GopherAuth({
  authServerUrl: 'https://auth.example.com/realms/mcp',
  clientId: 'my-server',
  clientSecret: 'secret',
  serverUrl: 'http://localhost:3001',
});

// After
const auth = new GopherAuth({
  config: {
    authServerUrl: 'https://auth.example.com/realms/mcp',
    clientId: 'my-server',
    clientSecret: 'secret',
    serverUrl: 'http://localhost:3001',
  },
});
auth.initialize(); // Required — loads native library
```

Or load from a config file:

```typescript
const auth = new GopherAuth({ configPath: './server.config' });
auth.initialize();
```

## API Mapping

| Old SDK | New SDK | Notes |
|---------|---------|-------|
| `auth.validateToken(token)` | `auth.validateToken(token)` | Now **sync** (was async). Remove `await`. |
| `auth.exchangeToken(opts)` | `auth.exchangeToken(opts)` | Now **sync** (was async). Remove `await`. |
| `auth.hasScope(payload, scope)` | `auth.hasScope(payload, scope)` | Same |
| `auth.expressMiddleware(opts)` | `auth.expressMiddleware(opts)` | Same options shape |
| `auth.registerOAuthRoutes(app, opts)` | `auth.registerOAuthRoutes(app, opts)` | Same |
| `(req as any).auth` | `req.authContext` | Typed `GopherAuthContext`, per-request |
| `(req as any).auth.rawToken` | `req.authContext.rawToken` | Same concept |
| `auth.getProtectedResourceMetadata()` | `auth.getProtectedResourceMetadata()` | Same |
| `auth.getWWWAuthenticateHeader(opts)` | `auth.getWWWAuthenticateHeader(opts)` | Same |
| `auth.getTokenEndpoint()` | `auth.getTokenEndpoint()` | Same |
| `auth.refreshJwks()` | `auth.refreshJwks()` | Now **sync** (was async) |
| — | `auth.shutdown()` | **New**: Required for cleanup |

## Breaking Changes

### 1. `initialize()` required before any method call

```typescript
const auth = new GopherAuth({ config: { ... } });
auth.initialize(); // Must be called before validateToken, expressMiddleware, etc.
```

### 2. Synchronous API (was async)

The native FFI calls are synchronous. Remove `await` from:
- `validateToken()`
- `exchangeToken()`
- `refreshJwks()`

```typescript
// Before
const payload = await auth.validateToken(token);
const result = await auth.exchangeToken({ subjectToken, requestedIssuer });

// After
const payload = auth.validateToken(token);
const result = auth.exchangeToken({ subjectToken, requestedIssuer });
```

### 3. Auth context access pattern

```typescript
// Before
app.use((req, res, next) => {
  const auth = (req as any).auth;
  const userId = auth?.sub;
  const rawToken = auth?.rawToken;
});

// After
app.use((req, res, next) => {
  const auth = req.authContext;       // Typed GopherAuthContext
  const userId = auth?.userId;        // Field name changed from 'sub' to 'userId'
  const rawToken = auth?.rawToken;
});
```

### 4. Config object nesting

```typescript
// Before — config at top level
new GopherAuth({ authServerUrl, clientId, clientSecret });

// After — config nested under 'config' key
new GopherAuth({ config: { authServerUrl, clientId, clientSecret } });
```

### 5. Shutdown required

```typescript
// New — required for native resource cleanup
process.on('SIGINT', () => {
  auth.shutdown();
  process.exit(0);
});
```

## Deployment Changes

- **No longer depends on** `jose` or `axios` npm packages
- **Requires native binary** for target platform (auto-downloaded via npm postinstall)
- **Docker**: Ensure the native library is available in the runtime image. Use multi-stage builds if needed.
- **Lambda/serverless**: Include native library in deployment package. Set `GOPHER_ORCH_LIBRARY_PATH` env var for custom location.
- **CI/CD**: The library is downloaded automatically during `npm install`

## New Features (not in old SDK)

- **Auto-refresh**: Transparent token refresh via session manager + auto-refresh function
- **hasAllScopes() / hasAnyScope()**: AND/OR scope validation backed by C++
- **Per-request auth context**: `req.authContext` is never shared between requests (fixes the concurrency bug in the old SDK's `currentAuthContext`)
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
| Token proxy 404 | Check that `auth_server_url` in config points to the correct Keycloak realm. |
| CORS preflight fails | Ensure discovery metadata advertises local endpoints, not Keycloak URLs directly. |
