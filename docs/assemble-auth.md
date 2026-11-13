# Multi-server MCP assemble authorization

API-key creation now hands multiple detected MCP OAuth challenges to the shared
gopher-orch embedded authorization coordinator. One local page lets the user
connect each required server and Continue only when native verification succeeds.
The existing single-server, public, explicit-credential, OAuth-disabled, URL and
inline-config paths retain their behavior. Multiple routes proven to share the
same issuer, resource audience and scopes keep their legacy shared-token/cache
path; distinct or unresolved bindings use the native coordinator.

No remote gateway provisioning or public Client/Session API is required. A remote
gateway remains a remote endpoint; the SDK never replaces it with backing-server
connections. Inventory is fetched once using the existing POST contract.

## Default browser flow

```typescript
const agent = await GopherAgent.createWithApiKey(provider, model, apiKey);
try {
  // Async execution keeps Node available for worker callbacks and host I/O.
  const answer = await agent.runAsync('Get my mail profile');
  console.log(answer);
} finally {
  await agent.disposeAsync();
}
```

While creation is pending, the SDK opens the native page once. No capability URL
is automatically logged. Each server has independent issuer/resource/client/user
bindings. Continue is enforced by native code, not just a disabled UI button.

If all grants are already available, no page is necessary. The native default
store is scoped to that context: repeated creations do not share its in-memory
grants. For cache persistence across creations, supply a custom store and stable
identity namespace as below. Legacy single-flow cache keys are not imported into
multi-server grants.

## Manual/custom presentation and cancellation

```typescript
const controller = new AbortController();
const agent = await GopherAgent.createWithApiKey(provider, model, apiKey, {
  oauth: {
    openBrowser: false,
    assemble: {
      signal: controller.signal,
      onAuthorizationUrl: async (url, flow) => {
        // Present privately in your application UI, not logs/telemetry.
        await showPrivateAuthorizationLink(url, flow);
      },
      onProgress: (sources) => updateConnectionStatus(sources),
    },
  },
});
```

The UI functions above are application-provided examples. Supplying
onAuthorizationUrl makes the application responsible for presenting/opening the
URL. Without it, the default browser launcher is used. Browser-disabled/failed
launch without a presenter rejects with AUTH_PRESENTATION_REQUIRED and guidance;
it does not print a sensitive URL or declare success. Closing a browser is not
completion. The AbortSignal applies to creation, not later agent runs.

Progress contains source/state only; it never includes the privileged store
queue. Presentation/progress callback errors reject creation with sanitized
errors. Async presentation/store operations do not block native callback I/O.
Cancellation and deadlines remain active even if an application callback stalls.

Native deadlines exposed in assemble options:

| Option | Default | Range (ms) |
| --- | --- | --- |
| networkTimeoutMs | 10000 | 100–30000 |
| discoveryTimeoutMs | 30000 | 100–120000 |
| timeoutMs (human authorization) | 600000 | 100–1800000 |

The host adapter also bounds total creation by the sum of these budgets. These
creation deadlines do not replace provider run-time consent timeouts. Passing a
run timeout retains the existing native ABI behavior; this feature does not add
a new native execution-timeout guarantee.

## External token stores and execution

Use the existing oauth.tokenStore interface with an application-controlled
`oauth.assemble.identityNamespace` identifying the user/account. A custom store
without that namespace is rejected. Never use one namespace for unrelated users.

Grant records include an opaque `embeddedGrant` field. Persist and return it
intact with the rest of GopherAgentTokenRecord. It contains credentials and
registration data: do not log it. Scoped keys begin with gopher-embedded-v1 and
include the exact native source, issuer, resource, scopes and client identity.
Existing unscoped OAuth entries are not treated as native grants.

Store get/set/delete are asynchronous host operations on a privileged queue. A
missing delete implementation rejects an erase request rather than pretending it
succeeded. A failing store causes source authorization/refresh to fail safely.
Keep the store usable until agent disposal, including while native refresh runs.

**Assembled agents using a custom token store require runAsync or
runDetailedAsync.** A synchronous run would prevent Node from servicing store
requests and can deadlock refresh. The SDK rejects that case before execution.
Existing agents using the legacy resolver retain synchronous run/runDetailed.
Default native-store assembled agents can still use the synchronous methods,
but async execution is recommended for host responsiveness.

Only one runAsync may be active per agent. It retains the native handle during
execution. dispose marks the agent unusable and releases its owner reference;
context cleanup waits for an active async run to finish. disposeAsync additionally
awaits cleanup. Disposing does not add a new public run-cancellation mechanism.

## Provider authorization is separate

Completing MCP server login does not connect Gmail or another tool-provider
account. Existing native discovery elicitation and runtime provider callbacks
remain installed. Assemble completion does not set skip-discovery-elicitation
headers or provider-preflight-complete markers.

Synchronous elicitation handlers remain synchronous; do not return Promises from
them. Existing accept/decline/cancel behavior and bounded retry are preserved.
The async run adapter preserves the existing textual URL fallback's explicit
origin allowlist. It does not treat the local page URL as a trusted provider
origin or broaden the allowlist to arbitrary inventory/browser URLs. Structured
native elicitation follows the existing callback path.

LLM API credentials are unrelated to MCP server tokens and backend-owned provider
account tokens. This feature does not move provider credentials into the SDK.

## Supported native artifacts and compatibility

Require actual embedded authorization interface version 1, including all lifecycle
symbols, rather than assuming support from the native version string. The pinned
native source is 0307f8c9. Its initial listener supports POSIX and HTTP MCP
sources, HTTPS in production, with public DCR or configured public/client-secret-
post clients that allow ephemeral loopback redirects. Windows capability reports
unavailable; published cross-platform support is not claimed by this change.

Pre-registered clients can be configured per source ID/name through assemble.clients
using clientId, optional clientSecret, tokenEndpointAuthMethod and optional scopes.
Global oauth.scopes applies unless a client entry overrides it. allowLoopbackHttp
is for controlled local fixtures only and defaults to false.

The same 0.1.42 version label can refer to an older binary without these additive
symbols. Existing native package versions are deliberately not bumped here: a
source submodule pin is not a released artifact. Missing capability fails only
when the new multi-flow path is required, with EMBEDDED_AUTH_UNAVAILABLE. Existing
zero/single flows keep loading and working with supported old binaries.

Check the binary the application will actually load:

```sh
npm run verify:embedded-native
# Or select an explicitly built artifact:
GOPHER_ORCH_LIBRARY_PATH=/path/to/native/lib npm run verify:embedded-native
```

Default local example resolution may choose native/current/lib before a rebuilt
submodule. Set GOPHER_ORCH_LIBRARY_PATH explicitly when validating the new build.

## Validation and release gate

Default build/lint/Jest checks retain legacy auth, config/URL, provider and
resource-lifetime regression coverage. The opt-in real artifact suite uses
controlled local OAuth issuers and MCP endpoints and performs no external LLM
calls:

```sh
GOPHER_EMBEDDED_AUTH_TEST_LIBRARY=/path/to/native/lib \
  npm test -- --runInBand tests/embedded-auth-native.test.ts
```

It checks different issuers, shared issuer with separate audiences, independent
stored grants/refresh, strict Continue, native agent handoff, cancellation,
concurrent contexts, and subsequent provider discovery elicitation reaching JS.
Worker callback compatibility is exercised through the actual loaded library.
Native G5 separately covers full tool-time provider retry and runtime refresh;
JS lifecycle tests verify run/result/disposal behavior and bounded retry.

The JS suite does not claim live browser/cloud issuer compatibility, external
LLM execution, or platform coverage beyond the artifact tested. Compatible npm
artifacts on every advertised platform and coordinated release validation remain
R1 work; keep the feature capability-gated until those artifacts are distributed.
