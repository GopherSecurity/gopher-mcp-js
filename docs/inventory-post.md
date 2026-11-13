# Multi-select inventory POST migration

All API-key creation paths use one `POST /v1/mcp-servers` request. It carries
`Authorization: Bearer <project API key>`, JSON Accept/Content-Type headers, and
four arrays: `serverId`, `serverName`, `gatewayId`, `gatewayName`.

```typescript
const agent = await GopherAgent.createWithServerId(provider, model, apiKey, 's1', {
  serverId: ['s2'],
  gatewayName: ['Production'],
  oauth: { mode: 'disabled' }, // only when credentials/public endpoints permit it
});
```

The positional value is prepended to its field, all categories are additive,
and exact duplicates are removed without changing case or trimming nonempty
values. Invalid arrays, whitespace-only values, embedded NULs, and likely
selector misspellings fail before requests. The same selection works through
`GopherAgentConfig.builder().runtimeOptions(...)` with an API key. URL/JSON-only
creation rejects selectors and does not fetch inventory.

## Native compatibility

Native branch `feat/improve-api-mcp-server` at `54c73e08` implements O1–O5.
Its confirmed contract keeps `succeeded` / `data.servers` authoritative. There
is no new `data.sources` schema. Backend policy determines matching, default
inventory membership, names, and direct/gateway overlap. A gateway entry is a
remote endpoint; the client never expands it into backing servers.

JS retains asynchronous fetch and passes validated configuration to the existing
native JSON creation ABI. It does not call the new native selection-fetch symbol
or fetch twice. This path needs no additional selection FFI capability/version
bump beyond the existing SDK native ABI requirements. The submodule is pinned to
the native implementation for cross-language conformance; published package
versions are unchanged by this work.

Inventory-only validation rejects malformed entries and conflicting runtime
names and removes identical entries. Native endpoint/config precedence is
reflected in OAuth target extraction. Unknown collections are never combined
with data.servers. IDs, headers and gateway routes remain attached to their
source. Local configuration parsing remains outside inventory-only validation.

Redirects are rejected, with no fallback to GET. HTTP/transport/backend failures
do not echo untrusted response bodies or credentials. Inventory fetch has a
30-second abort timeout; this does not add a public creation cancellation API.

## Scope

This migration does not implement embedded gateways, independent multi-server
OAuth, new public sessions, or automatic runtime-token renewal. Existing OAuth
and runtime credential behavior is retained. Backend POST support must be
available before rollout; an empty selection's server/gateway membership must
be confirmed rather than assumed from fixtures. Older GET clients require a
backend compatibility period.

## Validation and external gate

Shared fixtures live at
`third_party/gopher-orch/tests/fixtures/inventory/conformance.json`. JS tests
cover the same request and response cases, all creation paths, additive
selectors, validation, timeout/error cleanup and consistent route extraction.

On 2026-11-13, a read-only POST to the test API using the available environment
credential returned HTTP 401. No credentials or inventory bodies were logged.
Authenticated deployed behavior, backend selector resolution and all-authorized
membership remain release gates. Run the check with a credential authorized for
the test environment; successful unit tests do not prove deployed support.

Python integration is a separate task using the same native contract/fixtures.
