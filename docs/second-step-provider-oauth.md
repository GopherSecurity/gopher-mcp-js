# Second-Step Provider OAuth

The SDK supports two OAuth moments that happen at different layers.

First-step MCP OAuth happens before native agent creation finishes. The SDK
probes the MCP gateway or server URL, discovers protected-resource metadata,
gets an MCP runtime access token, and passes that token to gopher-orch as
runtime credentials.

Second-step provider OAuth happens after the MCP connection already exists. A
tool can require a provider account such as mail, calendar, or storage. In that
case, the MCP gateway or server sends `elicitation/create` with `mode: "url"`.
Native gopher-orch forwards that request to the JS SDK, the SDK opens or
surfaces the URL, and the SDK returns `accept`, `decline`, or `cancel`.

The provider authorization code exchange is not performed by this SDK. The URL
points at the provider and redirects to the Gopher callback endpoint. The JS SDK
only handles the MCP elicitation round trip.

## Create Options

Enable default URL handling:

```ts
const agent = await GopherAgent.createWithUrl(provider, model, mcpUrl, {
  oauth: { tokenStore },
  elicitation: {},
});
```

Use a custom handler for headless or CI usage:

```ts
const agent = await GopherAgent.createWithUrl(provider, model, mcpUrl, {
  oauth: { tokenStore },
  elicitation: {
    openBrowser: false,
    handler: (request) => {
      console.error(request.message ?? 'Provider authorization requested');
      console.error(request.url);
      return { action: 'accept' };
    },
  },
});
```

The first release is URL-mode focused. Other elicitation modes are out of
scope until native and SDK contracts are defined.

## Logging

Set `GOPHER_MCP_OAUTH_DEBUG=1` or `DEBUG=1` to log elicitation debug context.
Debug logs include mode, host, elicitation id, and returned action. They do not
log raw OAuth query values such as `state`, `code`, `client_secret`, or tokens.

Manual fallback output can print the full authorization URL because the user
needs that URL to complete OAuth.

## Local Tests

Run the JS-only unit coverage:

```bash
npm test -- tests/elicitation-runtime.test.ts tests/oauth-browser.test.ts tests/agent-runtime-options.test.ts
```

Run the deterministic custom IdP integration coverage:

```bash
npm test -- tests/oauth-elicitation-custom-idp.test.ts tests/oauth-auto-custom-idp.test.ts
```

Those integration tests start local loopback servers for the custom IdP and
protected MCP endpoints. They do not require Gmail, real provider credentials,
GitHub Secrets, hosted Gopher services, or a live LLM.

## CI Guidance

Use the custom IdP tests as the stable CI signal. They verify first-step OAuth
token refresh, direct MCP server and gateway endpoint parity, second-step
URL-mode elicitation handler delivery, and secret-safe logging behavior.

Live Gmail or other real provider smoke tests should stay optional because MFA,
account security policy, and hosted provider availability can fail independently
of SDK correctness.
