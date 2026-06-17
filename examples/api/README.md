# examples/api — TypeScript SDK examples for the seven `create_by_*` factories

This directory holds the TypeScript siblings of the C++ SDK examples
under
[`gopher-orch/examples/sdk/api/`](../../third_party/gopher-orch/examples/sdk/api/).
Each `.ts` file mirrors its `.cc` counterpart one-to-one and exercises
exactly one of the seven `create_by_*` factories the SDK exposes
through `GopherAgent`.

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

Each `.ts` file ships with a `*_run.sh` wrapper that sets the native
library path and forwards positional arguments as queries.

## Quick start

1. Build the native library (one-time, repeats after a submodule bump):

   ```sh
   cd /Users/james/Desktop/dev/gopher-mcp-js
   ./build.sh
   ```

   This builds `third_party/gopher-orch` and drops the resulting dylibs
   into `native/lib/`.

2. Pick a factory and run the matching wrapper:

   ```sh
   export GOPHER_API_KEY=...
   export LLM_MODEL=<your-model-id>
   export ANTHROPIC_API_KEY=...
   ./examples/api/create_by_api_key_run.sh "What time is it in Tokyo?"
   ```

   Positional arguments to the wrapper become queries; with no
   arguments each example runs a canned query so a first invocation
   produces visible output.

3. To target a specific MCP server, MCP gateway, or one-off URL, set
   the corresponding routing env var and run the matching wrapper.
   See the table below.

## Environment variables per example

| Example                       | Required                                                   | Optional                                              |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `create_by_api_key`           | `GOPHER_API_KEY`, `LLM_MODEL`                              | `LLM_PROVIDER`, `DEBUG`                               |
| `create_by_json`              | `LLM_MODEL`                                                | `LLM_PROVIDER`, `DEBUG`                               |
| `create_by_server_id`         | `GOPHER_API_KEY`, `GOPHER_MCP_SERVER_ID`, `LLM_MODEL`      | `LLM_PROVIDER`, `DEBUG`                               |
| `create_by_server_name`       | `GOPHER_API_KEY`, `GOPHER_MCP_SERVER_NAME`, `LLM_MODEL`    | `LLM_PROVIDER`, `DEBUG`                               |
| `create_by_gateway_id`        | `GOPHER_API_KEY`, `GOPHER_MCP_GATEWAY_ID`, `LLM_MODEL`     | `LLM_PROVIDER`, `DEBUG`                               |
| `create_by_gateway_name`      | `GOPHER_API_KEY`, `GOPHER_MCP_GATEWAY_NAME`, `LLM_MODEL`   | `LLM_PROVIDER`, `DEBUG`                               |
| `create_by_url`               | `GOPHER_MCP_URL`, `LLM_MODEL`                              | `LLM_PROVIDER`, `DEBUG`                               |

Notes:

- `LLM_PROVIDER` defaults to `AnthropicProvider` in every example.
- `LLM_MODEL` has no default; each example refuses to start until the
  variable is set rather than calling into the FFI with a placeholder.
- The LLM provider's own credentials (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GOOGLE_API_KEY`, etc.) are required by the
  backing provider rather than by the SDK directly; the wrappers warn
  if `ANTHROPIC_API_KEY` is unset since `AnthropicProvider` is the
  default.

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
`gopher-orch/docs/Agent.md` so the JS-side documentation stays aligned
with the upstream C++ docs.

## How the examples find the SDK

Each `.ts` file imports `GopherAgent` from `../../src` (relative path),
so the examples always pick up the in-repo SDK rather than the
`@gopher.security/gopher-mcp-js` package on npm. This keeps the
examples in lockstep with whatever is checked out under `src/` and
avoids a version-coupling round-trip when adding a new factory:

- Edit `src/` to expose the new factory
- Add an example here that imports `../../src` and exercises it
- Both land in the same commit series; no npm publish is needed
  between the SDK change and the example landing.

When a user installs the SDK from npm and wants to copy one of these
examples into their own project, the only required adjustment is the
import path: change `'../../src'` to
`'@gopher.security/gopher-mcp-js'`.

## How the wrappers find the native library

Each `*_run.sh` script:

1. Resolves `PROJECT_DIR` to the `gopher-mcp-js` repo root (two
   `dirname` calls because the scripts sit at `examples/api/` rather
   than `examples/`).
2. Exits early with a pointer at `./build.sh` if
   `$PROJECT_DIR/native/lib` is missing.
3. Exports `DYLD_LIBRARY_PATH` (macOS) and `LD_LIBRARY_PATH` (Linux)
   to that directory so koffi's library loader picks up the freshly
   built dylib from `build.sh:138-150` rather than the platform npm
   package or any system-installed copy.
4. Invokes `npx tsx examples/api/<file>.ts "$@"` so positional
   arguments pass straight through as queries.

If you need to point at a different library location entirely, set
`GOPHER_ORCH_LIBRARY_PATH` before invoking the wrapper. That env var
is checked first by `src/ffi/library.ts` and bypasses the
`native/lib/` and platform-package resolution steps.

## Cross-reference

- C++ canonical examples:
  `gopher-orch/examples/sdk/api/` (in the `third_party/gopher-orch`
  submodule of this repo)
- C++ canonical docs:
  `gopher-orch/docs/Agent.md` ("Simple creation factories" section)
- FFI binding layer:
  `src/ffi/library.ts` (`agentCreateBy*` methods)
- High-level wrappers:
  `src/agent.ts` (`GopherAgent.createWith*` static methods)
- Contract tests:
  `tests/agent-create-by.test.ts`
