# OAuth Auto Verification With Custom IdP

The custom IdP OAuth suite is the stable SDK correctness test for automatic
OAuth discovery and token injection. It runs entirely on local loopback servers
started by Jest, so it does not require Gmail, hosted Gopher services, GitHub
Secrets, or live LLM credentials.

Run it locally with:

```bash
npm run test:oauth-custom-idp
```

The suite covers both endpoint shapes that the SDK must support:

- Direct MCP server endpoint
- MCP gateway endpoint

For each endpoint shape, the tests start a protected MCP endpoint, advertise
OAuth protected-resource metadata, refresh a deterministic local test token
against the custom IdP token endpoint, and assert that `GopherAgent.createWithUrl`
passes the acquired access token to the native runtime options.

The fixture client ID, client secret, refresh token, and access token are local
test data. They are intentionally deterministic and are not GitHub Secrets.
Tests also assert that failure messages do not include fixture secret values.

## What It Verifies

- OAuth challenge discovery from `WWW-Authenticate`
- Protected-resource metadata parsing
- Authorization server metadata parsing
- Refresh-token grant handling
- Direct server and gateway endpoint parity
- Runtime credential injection before native agent creation
- Secret-safe failures for invalid token, client, grant, and metadata cases

## What It Does Not Verify

This suite does not verify a real identity provider account, Gmail security
policy, MFA, hosted Gopher gateway availability, or a live LLM answer. Those
checks are intentionally separate because they can fail due to external service
state rather than SDK behavior.

Use `docs/verify-examples.md` for optional published-package example smoke
checks against real services.
