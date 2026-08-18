# Optional Native OAuth E2E Follow-Up

The custom IdP Jest suite is the primary PR signal for SDK OAuth auto behavior.
It exercises discovery, refresh-token exchange, direct server and gateway
endpoint shapes, and native runtime-option marshalling while mocking the native
agent boundary.

A full native end-to-end smoke test can be added later if we need coverage past
that boundary. It should remain optional unless the native runtime can be
started deterministically without live LLM credentials or hosted services.

## Proposed Shape

- Reuse the local custom IdP harness.
- Reuse the local protected MCP endpoint harness.
- Add a minimal local MCP tool such as `whoami` or `echo`.
- Start a real `GopherAgent.createWithUrl` flow against the local endpoint.
- Assert the native runtime can call the protected tool after OAuth auto token
  injection.

## CI Placement

Keep this as a manual or nightly smoke check until it is fully deterministic:

- Native package availability must be explicit.
- No Gmail or real IdP account should be required.
- No hosted Gopher gateway should be required.
- No LLM provider secret should be required for the stable PR path.

The current stable gate is:

```bash
npm run test:oauth-custom-idp
```
