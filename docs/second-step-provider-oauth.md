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

Default URL handling requires no explicit elicitation option. The async agent
factories install the SDK's built-in URL-mode handler before entering native
`agent.run()`, so normal local apps can create a gateway or server agent like
this:

```ts
const agent = await GopherAgent.createWithUrl(provider, model, mcpUrl);
```

The same default applies to API-key gateway factories:

```ts
const agent = await GopherAgent.createWithGatewayId(
  provider,
  model,
  apiKey,
  gatewayId
);
```

Use custom elicitation configuration only as an override for headless or custom
UI usage:

```ts
const agent = await GopherAgent.createWithUrl(provider, model, mcpUrl, {
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

## Gateway Behavior

Gateway-routed second-step OAuth uses the same SDK callback path as direct MCP
server calls. The application does not need to configure gateway-specific
elicitation data. When a backend MCP server emits `elicitation/create` during
`tools/call`, native gopher-orch propagates the SDK callback to the backend
connection, waits for the callback action, and resumes the tool call only after
the provider authorization response is accepted, declined, or canceled.

## Logging

Set `GOPHER_MCP_OAUTH_DEBUG=1` or `DEBUG=1` to log elicitation debug context.
Debug logs include mode, host, elicitation id, and returned action. They do not
log raw OAuth query values such as `state`, `code`, `client_secret`, or tokens.

Manual fallback output can print the full authorization URL because the user
needs that URL to complete OAuth.

## Troubleshooting

- No browser is available: pass `elicitation: { openBrowser: false }` or a
  custom `handler` that presents `request.url` in your app's UI.
- User cancels: the default handler returns `cancel`; the backend tool call
  should fail clearly and the agent can be retried after authorization is
  completed.
- Callback timeout or exception: the native call returns a clear elicitation
  error instead of retrying indefinitely.
- Backend never sends a final tool result after accept: the native gateway or
  MCP request timeout still bounds the call.

## Local Tests

Run the JS-only unit coverage:

```bash
npm test -- tests/elicitation-runtime.test.ts tests/oauth-browser.test.ts tests/agent-runtime-options.test.ts
```

Run the deterministic custom IdP integration coverage:

```bash
npm test -- tests/oauth-elicitation-custom-idp.test.ts tests/oauth-auto-custom-idp.test.ts
```

Run the API factory coverage that proves default create options are preserved
for `createWithUrl` and gateway factories:

```bash
npm test -- tests/agent-create-with-url-async.test.ts tests/agent-async-factories-oauth.test.ts
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
