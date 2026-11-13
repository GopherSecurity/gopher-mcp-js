# examples/api — TypeScript SDK examples for the seven `create_by_*` factories

This directory holds the TypeScript siblings of the C++ SDK examples
under
[`gopher-orch/examples/sdk/api/`](../../third_party/gopher-orch/examples/sdk/api/).
Each `.ts` file mirrors its `.cc` counterpart one-to-one and exercises
exactly one of the seven `create_by_*` factories the SDK exposes
through `GopherAgent`.

All examples use the repository's `src/` SDK and local native libraries.
Install dependencies once from the repository root with `npm ci --ignore-optional`.
No published SDK package is installed by the example wrappers.

## File-to-factory mapping

| C++ reference                  | TypeScript port                | `GopherAgent` factory          |
| ------------------------------ | ------------------------------ | ------------------------------ |
| `create_by_api_key.cc`         | `create_by_api_key.ts`         | `createWithApiKey`             |
| `create_by_json.cc`            | `create_by_json.ts`            | `createWithServerConfig`       |
| `create_by_server_id.cc`       | `create_by_server_id.ts`       | `createWithServerId`           |
| `create_by_server_name.cc`     | `create_by_server_name.ts`     | `createWithServerName`         |
| `create_by_gateway_id.cc`      | `create_by_gateway_id.ts`      | `createWithGatewayId`          |
| `create_by_gateway_name.cc`    | `create_by_gateway_name.ts`    | `createWithGatewayName`        |
| `create_by_url.cc`             | `create_by_url.ts`             | `createWithUrl`                |

Each `.ts` file has a `*_run.sh` wrapper that runs it with the repository's `tsx`.

## Quick start

From the repository root:

```sh
npm ci --ignore-optional
export LLM_MODEL=<your-model-id>
export ANTHROPIC_API_KEY=...
export GOPHER_API_KEY=...
./examples/api/create_by_api_key_run.sh "What time is it in Tokyo?"
```

You can also run `node_modules/.bin/tsx examples/api/create_by_api_key.ts`.
Positional arguments become queries.

The examples select native libraries from `native/current/lib`, `native/lib`,
then `third_party/gopher-orch/build/lib`. Set `GOPHER_ORCH_LIBRARY_PATH` to
use another local library directory or file. The native binaries must be built
for your platform; these scripts do not rebuild them.

## Environment variables per example

| Example                  | Required                                                   | Optional                |
| ------------------------ | ---------------------------------------------------------- | ----------------------- |
| `create_by_api_key`      | `GOPHER_API_KEY`, `LLM_MODEL`                              | `LLM_PROVIDER`, `DEBUG` |
| `create_by_json`         | `LLM_MODEL`                                                | `LLM_PROVIDER`, `DEBUG` |
| `create_by_server_id`    | `GOPHER_API_KEY`, `GOPHER_MCP_SERVER_ID`, `LLM_MODEL`      | `LLM_PROVIDER`, `DEBUG` |
| `create_by_server_name`  | `GOPHER_API_KEY`, `GOPHER_MCP_SERVER_NAME`, `LLM_MODEL`    | `LLM_PROVIDER`, `DEBUG` |
| `create_by_gateway_id`   | `GOPHER_API_KEY`, `GOPHER_MCP_GATEWAY_ID`, `LLM_MODEL`     | `LLM_PROVIDER`, `DEBUG` |
| `create_by_gateway_name` | `GOPHER_API_KEY`, `GOPHER_MCP_GATEWAY_NAME`, `LLM_MODEL`   | `LLM_PROVIDER`, `DEBUG` |
| `create_by_url`          | `GOPHER_MCP_URL`, `LLM_MODEL`                              | `LLM_PROVIDER`, `DEBUG` |

Notes:

- `LLM_PROVIDER` defaults to `AnthropicProvider` in every example.
- `LLM_MODEL` has no default; each example refuses to start until
  the variable is set rather than calling into the FFI with a
  placeholder. The example never surfaces a stale or fictional
  model identifier.

## Picking the right factory

| Factory | Inventory selection |
| --- | --- |
| `createWithApiKey` | Arrays from options; empty arrays request the backend default inventory. |
| `createWithServerId` / `createWithServerName` | Positional selector plus all option arrays. |
| `createWithGatewayId` / `createWithGatewayName` | Positional selector plus all option arrays; gateway URLs stay remote. |
| `createWithServerConfig` / `createWithUrl` | Supplied configuration/URL; no inventory fetch. Selector options are rejected. |

All inventory factories send `POST /v1/mcp-servers` with `serverId`,
`serverName`, `gatewayId`, and `gatewayName` arrays. Values are unioned,
exact-deduplicated, and never silently dropped. For example:

```typescript
const agent = await GopherAgent.createWithServerId(provider, model, apiKey, 'srv_1', {
  serverId: ['srv_2'],
  gatewayName: ['production'],
});
```

The authoritative response remains `succeeded` / `data.servers`, not
`data.sources`. The backend defines all-authorized inventory membership and
overlap resolution. No client-side gateway flattening is performed. Distinct
sources sharing a runtime name fail rather than silently overriding tools.

This migration requires deployed backend POST support. It does not add the
embedded gateway runtime or independent multi-server OAuth. JS continues to
call the existing native JSON creation ABI, so it needs no new selection symbol.
The pinned native branch also implements the same contract for native callers.

## Provider OAuth Elicitation

Gateway-routed MCP tools can request provider OAuth after the agent
has already connected, for example when a mail tool needs a Google
account connection. The normal examples do not need to pass explicit
`elicitation` options for this flow. The SDK installs its default
URL-mode handler around `agent.run()`: when native gopher-orch returns
a provider authorization URL, the JS SDK opens or surfaces that URL,
waits for acceptance, and retries the query once.

Use `GOPHER_MCP_ELICITATION=manual` with `create_by_url` only when
you want to suppress automatic browser launch and complete the
provider OAuth URL manually:

```sh
GOPHER_MCP_ELICITATION=manual ./examples/api/create_by_url_run.sh "get mail profile"
```

Custom elicitation handlers are an application override for custom
UI, headless environments, cancellation policies, or shorter
timeouts. They are not required for the default browser-based flow.

## Published-package verification

`scripts/verify-examples.sh` copies these examples into an isolated project and
rewrites their local imports to the published SDK. The GitHub verification
workflow therefore continues to check the requested npm release.

## Cross-reference

- C++ canonical examples:
  `gopher-orch/examples/sdk/api/` (in the `third_party/gopher-orch`
  submodule of this repo).
- C++ canonical docs:
  `gopher-orch/docs/Agent.md` ("Simple creation factories"
  section).
- Python siblings:
  [`gopher-mcp-python/examples/api/`](https://github.com/GopherSecurity/gopher-mcp-python/tree/main/examples/api).
- FFI binding layer:
  `src/ffi/library.ts` (`agentCreateBy*` methods).
- High-level wrappers:
  `src/agent.ts` (`GopherAgent.createWith*` static methods).
- Contract tests:
  `tests/agent-create-by.test.ts`.
- Sibling npm-style wrappers (older, two-variant superset):
  `examples/npm/` — examples for the published package.
