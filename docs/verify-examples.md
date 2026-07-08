# Verifying SDK Examples

`scripts/verify-examples.sh` verifies the published
`@gopher.security/gopher-mcp-js@latest` package from a clean temporary npm
project. It does not verify the local package version.

The verifier always installs:

```bash
@gopher.security/gopher-mcp-js@latest
```

## Local macOS

Offline verification:

```bash
npm run verify:examples
```

Equivalent direct command:

```bash
scripts/verify-examples.sh --mode offline
```

Auto mode runs offline checks and skips live examples when credentials are
missing:

```bash
npm run verify:examples:auto
```

Live mode requires credentials and endpoints:

```bash
export LLM_PROVIDER=AnthropicProvider
export LLM_MODEL=<model>
export ANTHROPIC_API_KEY=<key>
export GOPHER_API_KEY=<key>
export GOPHER_MCP_URL=http://127.0.0.1:3001/mcp

npm run verify:examples:live
```

## Local Linux

Local Linux verification from macOS or another non-Linux host uses Docker and
targets Ubuntu 20.04:

```bash
scripts/verify-examples-linux-docker.sh --mode offline
```

The wrapper starts an `ubuntu:20.04` x64 container, installs Node.js 20 inside
the container, and then runs `scripts/verify-examples.sh`.

Live Linux verification uses the same wrapper:

```bash
export LLM_PROVIDER=AnthropicProvider
export LLM_MODEL=<model>
export ANTHROPIC_API_KEY=<key>
export GOPHER_API_KEY=<key>
export GOPHER_MCP_URL=http://127.0.0.1:3001/mcp

scripts/verify-examples-linux-docker.sh --mode auto
```

## Local Windows

Local Windows verification must run on a real Windows x64 machine or Windows
VM. Do not use Docker-on-macOS or Wine for this check because they do not
faithfully verify Windows DLL loading.

From Git Bash on Windows:

```bash
npm run verify:examples
```

For live checks, set the same live environment variables used by macOS and
Linux, then run:

```bash
npm run verify:examples:live
```

## Modes

- `offline`: verifies installability, SDK import, native loading, the
  `createWithUrl` native path, and missing-env example bootstrap behavior.
- `auto`: runs offline checks and runs live examples only when required
  variables are present.
- `live`: requires all live variables for selected examples and fails if any
  are missing.

## GitHub Actions

`.github/workflows/verify-examples.yml` runs the same verifier on hosted
macOS, Linux, and Windows runners.

Required secrets for live checks:

```text
LLM_PROVIDER
LLM_MODEL
ANTHROPIC_API_KEY
GOPHER_API_KEY
GOPHER_MCP_URL
```

Pull requests and normal `main` pushes run offline mode. Scheduled and manual
runs can use auto mode. Pushes to `br_release` run strict live mode.

## Examples Covered

The verifier currently covers:

- `create_by_url`
- `create_by_api_key`
- `create_by_json`
- `create_by_server_id`
- `create_by_server_name`
- `create_by_gateway_id`
- `create_by_gateway_name`
