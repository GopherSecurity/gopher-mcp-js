# OAuth Auto Verification With Custom IdP

The custom IdP OAuth suite is the stable SDK correctness test for automatic
OAuth discovery and token injection. It runs entirely on local loopback servers
started by Jest, so it does not require Gmail, hosted Gopher services, GitHub
Secrets, or live LLM credentials.

Run it locally with:

```bash
npm run test:oauth-custom-idp
```

The suite covers the first-run interactive OAuth path for a direct MCP server
endpoint and refresh-token reuse for both endpoint shapes that the SDK must
support:

- Direct MCP server endpoint
- MCP gateway endpoint

The direct endpoint first-run test starts a protected MCP endpoint, advertises
OAuth protected-resource metadata, dynamically registers a public client, follows
the authorization redirect through the loopback callback, validates PKCE at the
token endpoint, and asserts that `GopherAgent.createWithUrl` passes the acquired
access token to the native runtime options.

The endpoint-parity tests seed an expired cached token with a refresh token,
refresh a deterministic local test token against the custom IdP token endpoint,
and assert that direct server and gateway URLs receive the acquired access token
through native runtime options.

The fixture client ID, client secret, refresh token, and access token are local
test data. They are intentionally deterministic and are not GitHub Secrets.
Tests also assert that failure messages do not include fixture secret values.

## What It Verifies

- OAuth challenge discovery from `WWW-Authenticate`
- Protected-resource metadata parsing
- Authorization server metadata parsing
- Dynamic client registration for the first-run direct endpoint flow
- Authorization-code grant handling through the loopback callback
- PKCE challenge and verifier validation
- Refresh-token grant handling
- Direct server and gateway endpoint parity
- Runtime credential injection before native agent creation
- Secret-safe failures for invalid token, client, grant, and metadata cases

## What It Does Not Verify

This suite does not verify a real identity provider account, Gmail security
policy, MFA, hosted Gopher gateway availability, or a live LLM answer. Those
checks are intentionally separate because they can fail due to external service
state rather than SDK behavior.

The gateway endpoint coverage verifies refresh-token reuse and credential
injection parity; the full first-run browser authorization flow is covered by
the direct endpoint case.

Use `docs/verify-examples.md` for published-package example verification
against real services.
