# MCP helpers for web applications

`GopherAgent` factories remain the default for SDK-managed authorization and
agent execution. Applications that own a browser callback can use
`McpOAuthClient` without copying the OAuth protocol into their route handlers.

```typescript
import { McpOAuthClient } from '@gopher.security/gopher-mcp-js';

const oauth = new McpOAuthClient({ clientName: 'My web app' });
const { authorizeUrl, pending } = await oauth.start(mcpUrl, callbackUrl);
// Store pending privately in a server session or protected cookie with a short
// expiry. It contains the PKCE verifier and possibly a client secret. Never
// return it to frontend code or log it. Send only authorizeUrl to the browser.

// In the application callback, retrieve the same pending state:
const tokens = await oauth.exchange(pending, { code, state });
// Consume/delete pending state after success or a state mismatch. The SDK
// checks state, exchanges the code with PKCE and binds the token to the exact
// advertised resource. The application owns session isolation and replay policy.

const revoked = await oauth.revoke(mcpUrl, tokens.accessToken);
// false means no revocation endpoint was advertised or it rejected the request.
// Network/discovery failures throw so the application can choose logout policy.
```

The SDK reuses its normal discovery, registration, authorization-URL and token
helpers. Scopes come from protected-resource metadata (or explicit `scopes`),
not the authorization server's entire scope catalog. Public clients and
`client_secret_post`/`client_secret_basic` registrations are supported. HTTPS is
required unless `allowInsecureHttp: true` is explicitly set for development.

A `request(url, init)` option can enforce the application's outbound URL policy
for every metadata, registration, token and revocation request. Redirects are
never followed. Adapters are scoped to each async operation; they do not replace
global fetch or affect simultaneous clients. Respect the supplied abort signal.

## Connection and tool discovery without an LLM

```typescript
import { probeMcpServer } from '@gopher.security/gopher-mcp-js';

const status = await probeMcpServer(mcpUrl, {
  accessToken: tokens.accessToken, // omit for unauthenticated checks
  timeoutMs: 120_000,
  // request: applicationRequestWithUrlPolicy,
});
// status.state: connected | authRequired | error
// connected includes optional serverName and the available tool names.
```

The probe performs initialization, sends the initialized notification, lists all
pages of tools, and best-effort terminates its temporary MCP session. It supports
JSON and SSE responses, cancelling an open SSE response after its matching RPC
result. A total timeout bounds requests, body reads and cleanup. Redirects are
not followed. Optional explicit headers override the access-token Authorization
header. No OAuth flow is started and no agent or LLM provider is instantiated.
