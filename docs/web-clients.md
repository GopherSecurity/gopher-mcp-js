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

// Persist tokens.grant privately with the token, including any client secret.
// Revocation uses the issuer/endpoint captured during authorization, not fresh
// discovery through a potentially changed MCP server.
const revoked = await oauth.revoke(tokens.grant, tokens.accessToken);
// false means no revocation endpoint was advertised or it rejected the request.
// Grant-validation and network failures throw; callers choose logout policy.
```

`exchange()` returns `McpOAuthTokenRecord`, which extends the usual token record
with a private `grant: McpOAuthGrant`. This contains the validated issuer, pinned
revocation endpoint, registered client ID/secret, and negotiated token-endpoint
authentication method. Persist it server-side with the token. It excludes the
PKCE verifier and authorization state, which can be deleted after exchange.

`revoke(grant, accessToken)` performs no metadata discovery. It authenticates
confidential clients using the stored `client_secret_basic` or
`client_secret_post` method; public clients use `none` and send `client_id`.
Missing required secrets and unsupported methods fail before any request.
The revocation endpoint is pinned from validated issuer metadata and must have
the same origin as that issuer. This same-origin restriction is an SDK policy;
providers using cross-origin revocation endpoints are currently unsupported.
HTTPS remains required except for explicitly enabled HTTP development mode.
Redirects are not followed. HTTP 200 means success; missing endpoints or other
HTTP statuses return `false`. Authentication follows
[RFC 7009 section 2.1](https://www.rfc-editor.org/rfc/rfc7009.html#section-2.1).

The old `revoke(serverUrl, accessToken)` overload is deprecated and throws
`OAUTH_GRANT_REQUIRED` without network access. Grants/pending states persisted
before issuer information was captured require reauthorization; do not reconstruct
the issuer or endpoint by rediscovering through the MCP URL at logout time.

Discovery validates metadata identities before registration, authorization URL
creation, or token revocation. The protected-resource metadata `resource` must
exactly equal the requested MCP `serverUrl`, and the authorization-server
metadata `issuer` must exactly equal the selected `authorization_servers` entry.
Comparisons do not normalize case, trailing slashes, ports, or percent encoding.
Mismatches throw `OAUTH_RESOURCE_MISMATCH` or `OAUTH_ISSUER_MISMATCH`, including
when discovery uses the OIDC fallback. These checks follow
[RFC 9728 section 3.3](https://www.rfc-editor.org/rfc/rfc9728.html#section-3.3)
and [RFC 8414 section 3.3](https://www.rfc-editor.org/rfc/rfc8414.html#section-3.3).
Servers advertising a parent resource URL instead of the requested MCP endpoint
must correct their metadata; the client does not silently change token audience.

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
result. The probe timeout bounds requests and body reads. Best-effort session DELETE
uses a separate one-second abort controller so it can run after a probe timeout;
cleanup can add up to one second and never replaces the probe result. Redirects are
not followed. Optional explicit headers override the access-token Authorization
header. No OAuth flow is started and no agent or LLM provider is instantiated.

## Tools from a connected agent

```typescript
const agent = await GopherAgent.createWithApiKey(provider, model, apiKey, options);
try {
  const toolNames = agent.getToolNames();
  // Display toolNames after authorization. No model query or new MCP connection.
} finally {
  await agent.disposeAsync();
}
```

`getToolNames()` snapshots the same native registry used by the agent's LLM,
including tools discovered from multiple servers. It does not re-fetch inventory,
read credentials into JavaScript, or repeat OAuth. The native library must expose
`gopher_orch_agent_tool_names`; older libraries continue supporting other agent
methods and give a rebuild error when this accessor is requested.
