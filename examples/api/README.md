# examples/api — TypeScript SDK examples for the seven `create_by_*` factories

This directory holds the TypeScript siblings of the C++ SDK examples
under
[`gopher-orch/examples/sdk/api/`](../../third_party/gopher-orch/examples/sdk/api/).
Each `.ts` file mirrors its `.cc` counterpart one-to-one and exercises
exactly one of the seven `create_by_*` factories the SDK exposes
through `GopherAgent`.

All examples in this directory resolve their dependencies from the
**npm-published** [`@gopher.security/gopher-mcp-js`](https://www.npmjs.com/package/@gopher.security/gopher-mcp-js)
package — they do not use the in-tree `src/` TypeScript source or the
locally-built `native/lib/` directory. To work against the in-tree
source instead, see the existing `examples/client_example_json*` pair
at the `examples/` root or the contract tests under `tests/`.

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

Each `.ts` file ships with a `*_run.sh` wrapper that bootstraps a
fresh `node_modules`, installs `@gopher.security/gopher-mcp-js`
from npm, and forwards positional arguments to the example as
queries.

## Quick start

1. Set the env vars your chosen example needs (see the matrix below).
   At minimum every example needs `LLM_MODEL` and the LLM
   provider's own credentials (`ANTHROPIC_API_KEY` for the default
   `AnthropicProvider`):

   ```sh
   export LLM_MODEL=<your-model-id>
   export ANTHROPIC_API_KEY=...
   export GOPHER_API_KEY=...            # only if your variant needs it
   ```

2. Run the wrapper. It will create
   `examples/api/test-project-<variant>/` with a fresh
   `node_modules` inside,
   `npm install @gopher.security/gopher-mcp-js` from npm, then
   `tsx`-run the `.ts`:

   ```sh
   ./examples/api/create_by_api_key_run.sh "What time is it in Tokyo?"
   ```

   Positional arguments to the wrapper become queries; with no
   arguments each example runs a canned query so a first
   invocation produces visible output.

3. To pin a specific SDK version, set `SDK_VERSION` before invoking
   a wrapper. Otherwise the `latest` dist-tag is installed:

   ```sh
   SDK_VERSION=0.1.23 ./examples/api/create_by_server_id_run.sh
   ```

The wrappers are idempotent: each run nukes its `test-project-*`
directory and rebuilds `node_modules` from scratch so a stale
install cannot mask a problem. The `test-project-*` directories
are intentionally ignored by `.gitignore` at the repo root.

## Manual run (no wrapper)

If you would rather drive the install yourself, the `.ts` files are
self-contained and run against any project that has
`@gopher.security/gopher-mcp-js` installed plus `tsx`:

```sh
mkdir my-example && cd my-example
npm init -y
npm install @gopher.security/gopher-mcp-js
npm install --save-dev tsx typescript

export LLM_MODEL=<your-model-id>
export ANTHROPIC_API_KEY=...
cp /path/to/gopher-mcp-js/examples/api/create_by_api_key.ts .
npx tsx create_by_api_key.ts "What time is it in Tokyo?"
```

npm picks the right platform native binary automatically via the
`optionalDependencies` on the main package — no separate native
install is required.

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

The wrappers also recognise:

- `SDK_VERSION` — pin `@gopher.security/gopher-mcp-js` to a
  specific npm version (or a dist-tag like `latest` or
  `next`). Defaults to `latest`.
- `ANTHROPIC_API_KEY` — required by the default
  `AnthropicProvider`; the wrappers warn if unset but do not fail.

Notes:

- `LLM_PROVIDER` defaults to `AnthropicProvider` in every example.
- `LLM_MODEL` has no default; each example refuses to start until
  the variable is set rather than calling into the FFI with a
  placeholder. The example never surfaces a stale or fictional
  model identifier.

## Picking the right factory

| Factory                 | Selects                                                         | Network call                                      |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| `createWithApiKey`      | Every MCP server the api key owns                               | `GET /v1/mcp-servers`                             |
| `createWithServerConfig`| Servers described in an inline JSON document                    | None                                              |
| `createWithServerId`    | One MCP server by id                                            | `GET /v1/mcp-servers?serverId=...`                |
| `createWithServerName`  | One MCP server by name                                          | `GET /v1/mcp-servers?serverName=...`              |
| `createWithGatewayId`   | All MCP servers under one gateway by id                         | `GET /v1/mcp-servers?gatewayId=...`               |
| `createWithGatewayName` | All MCP servers under one gateway by name                       | `GET /v1/mcp-servers?gatewayName=...`             |
| `createWithUrl`         | One MCP server reachable at a known URL                         | None (synthesised locally to an `http_sse` entry) |

The table mirrors the C++ canonical reference at
`gopher-orch/docs/Agent.md` so the JS-side documentation stays
aligned with the upstream C++ docs.

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

The five routing factories
(`createWithServerId` / `createWithServerName` /
`createWithGatewayId` / `createWithGatewayName` /
`createWithUrl`) require
`@gopher.security/gopher-mcp-js` ≥ 0.1.23 on npm. Earlier versions
only expose `createWithApiKey` and `createWithServerConfig`.

## How the examples find the SDK

Each `.ts` file imports `GopherAgent` from the npm package:

```ts
import { GopherAgent } from '@gopher.security/gopher-mcp-js';
```

Resolution flow:

- Through a wrapper (`create_by_*_run.sh`): the wrapper creates
  `examples/api/test-project-<variant>/`, writes a `package.json`
  with `@gopher.security/gopher-mcp-js` pinned to `$SDK_VERSION`,
  `npm install`-s it, then `tsx`-runs the example. The import
  resolves against the just-installed npm package, never against
  the in-tree `src/` source.
- Manual run: the example resolves against whatever
  `@gopher.security/gopher-mcp-js` is in the active project's
  `node_modules`.

A downstream consumer copying any of these examples into their
own project does not need to edit the import path — the same
`import { GopherAgent } from '@gopher.security/gopher-mcp-js'`
line works as long as the package is installed.

## How the wrappers find the native library

The native `libgopher-orch.dylib` / `.so` / `.dll` is loaded by
the `koffi` FFI layer inside `src/ffi/library.ts`. With the
npm-based wrappers, resolution happens entirely inside the
bootstrapped `node_modules`:

1. The wrapper runs `npm install @gopher.security/gopher-mcp-js`.
   npm resolves the matching platform-specific
   `@gopher.security/gopher-orch-<platform>-<arch>` package via
   the main package's `optionalDependencies` and drops the dylib
   into `node_modules/@gopher.security/gopher-orch-*/lib/`.
2. `src/ffi/library.ts` walks the resolver chain looking for the
   matching `@gopher.security/gopher-orch-*` package and uses its
   `package.json` location to find the `lib/` directory.
3. `DYLD_LIBRARY_PATH` / `LD_LIBRARY_PATH` are **not** set by the
   wrappers — the loader finds the platform package via Node's
   module resolution rather than a search path.

If you need to point at a different library location entirely
(for example a locally-built `libgopher-orch.dylib` for testing a
patch), set `GOPHER_ORCH_LIBRARY_PATH` before invoking the
wrapper. That env var is checked first by `src/ffi/library.ts`
and bypasses the platform-package resolution step.

## Troubleshooting

### "Failed to load gopher-orch library"

The matching platform package was not installed. With
`npm install --no-optional` or some other flag that skips optional
dependencies, the platform binary is missing. Re-install without
the flag:

```sh
npm install @gopher.security/gopher-mcp-js
```

### Permission errors on macOS

Quarantine flags on a freshly-downloaded dylib can block load:

```sh
xattr -d com.apple.quarantine node_modules/@gopher.security/gopher-orch-darwin-*/lib/*.dylib
```

### Routing factory raises `AgentError` against an older npm release

The five routing factories landed in
`@gopher.security/gopher-mcp-js` 0.1.23. If the wrapper installs
an older version (for example because `latest` has not yet been
bumped), the higher-level factory raises `AgentError` because the
underlying C symbol is missing. Pin to a recent release:

```sh
SDK_VERSION=0.1.23 ./examples/api/create_by_server_id_run.sh
```

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
  `examples/npm/` — same `node_modules` bootstrap pattern these
  wrappers inherit.
