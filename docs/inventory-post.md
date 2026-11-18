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

Native release `v0.1.45` at `ac84f1b30831a1d9d9eb180c0247aa9934b636c3`
is the source and platform-dependency pin. Its contract keeps
`succeeded` / `data.servers` authoritative. There is no new `data.sources`
schema. Backend policy determines matching, default inventory membership,
names, and direct/gateway overlap. A gateway entry is a remote endpoint;
the client never expands it into backing servers.

JS retains asynchronous fetch and passes validated configuration to the existing
native JSON creation ABI. It does not call the native selection-fetch symbol
or fetch twice. Source and native platform package versions are aligned to
`0.1.45` for SDK `0.1.45-1`. JS retries legacy GET when POST returns
HTTP 405 for empty or single selections. The pinned native inventory fetcher
uses GET first for those selections and retries POST only after HTTP 405.
Multi-selection still requires backend POST support.

Before release validation is complete, publish all six `0.1.45` platform
packages and regenerate the lockfile so each has a registry URL and integrity
hash. The already published SDK `0.1.44-1` cannot be overwritten.

Inventory-only validation rejects malformed entries and conflicting runtime
names and removes identical entries. Native endpoint/config precedence is
reflected in OAuth target extraction. API-sourced entries must specify an HTTP
or WebSocket transport explicitly; `stdio`, omitted/null transports, and local
command entries are rejected before OAuth or native creation. Remote inventory
never expands host environment variables. Strings containing `${ENV_NAME}`
references are rejected in the effective endpoint `config.url` and header
values, including when selected from `http_sse`, `streamable_http`, or
`websocket` fallback configs. The native-expanded registry `data.base_url` field
is guarded too. Descriptions, tool text, identities, object keys, and unused
fields retain literal placeholders; they are not interpreted as environment
references. Literal remote URLs and credentials remain intact. These restrictions do
not apply to explicit local URL/JSON/server configuration APIs. Both `data.servers` and `data.gateways` are supported. Entries in the separate
`gateways` array must use the same named HTTP transport/config shape as other
remote endpoints (`id` or legacy server ID, `name`, `transport`, `config.url`,
optional `config.headers`). The collection identifies them as gateways, and JS
marks them `type: "gateway"`, deduplicates them, and emits one native
`data.servers` configuration. Gateway members are never used as endpoints.
Member-only, malformed, or contradictory entries fail rather than being guessed.
Other non-empty collections, including `data.sources`, are rejected.

When any gateway ID/name is selected, every requested identity must match a
remote gateway route. In addition to explicit `type: "gateway"` metadata,
canonical URL paths `/v1/mcp/gateways/<id>/mcp` and
`/v1/mcp/gateways/<id>/sse` establish gateway identity, matching native route
validation. A single trailing slash is allowed, and the path is URL-decoded
before matching; query/fragment text never establishes gateway identity.
Gateway IDs may match the entry's native-precedence ID (`id`, `serverId`,
`server_id`) or its canonical path ID; names match exactly. Canonical backing
paths `/v1/mcp/servers/...` never count as gateways, even with a gateway marker.
Empty results, invalid or mismatched paths, and backing servers alone fail
before OAuth/native creation. These checks apply to POST and GET fallback.
Gateway-only selections also reject direct or unrequested routes. IDs, headers
and gateway endpoints remain attached to their original source; the SDK does
not rewrite endpoints or expand gateway members. Local configuration parsing
remains outside inventory-only validation.

Redirects are rejected. If POST returns HTTP 405, the SDK retries GET only
when the normalized selection is empty or contains exactly one value across all
selector fields. A single value is preserved as its corresponding query
parameter. Multiple selectors are never dropped, split, or widened to all
sources; they require backend POST support. No other HTTP status or transport
error triggers fallback. HTTP/transport/backend failures do not echo untrusted
response bodies or credentials. POST and GET share one 30-second abort timeout;
this does not add a public creation cancellation API.

## Scope

This migration does not implement embedded gateways, independent multi-server
OAuth, new public sessions, or automatic runtime-token renewal. Existing OAuth
and runtime credential behavior is retained. Backend POST support must be
available before rolling out multi-selection; an empty selection's server/gateway membership must
be confirmed rather than assumed from fixtures. Older GET clients require a
backend compatibility period.

## Validation and external gate

A provenance-documented copy of the shared native fixture lives at
`tests/fixtures/inventory/conformance.json`. Unit tests do not require private
submodule checkout. JS tests
cover the same request and response cases, all creation paths, additive
selectors, validation, timeout/error cleanup and consistent route extraction.

On 2026-11-13, a read-only POST to the test API using the available environment
credential returned HTTP 401. No credentials or inventory bodies were logged.
Authenticated deployed behavior, backend selector resolution and all-authorized
membership remain release gates. Run the check with a credential authorized for
the test environment; successful unit tests do not prove deployed support.

On 2026-11-17, unauthenticated production checks returned HTTP 405 for POST
and HTTP 200 for GET. This establishes the compatibility requirement, but does
not verify authenticated inventory contents or gateway selection semantics.

Python integration is a separate task using the same native contract/fixtures.
