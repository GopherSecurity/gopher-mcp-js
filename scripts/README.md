# Scripts

## `verify-examples.sh`

Verifies the published `@gopher.security/gopher-mcp-js@latest` package from a
clean temporary npm project.

By default, the verifier installs:

```bash
@gopher.security/gopher-mcp-js@latest
```

It does not verify the local package version. To verify a pinned published
version or another npm install spec, set `SDK_INSTALL_SPEC`:

```bash
SDK_INSTALL_SPEC='@gopher.security/gopher-mcp-js@0.1.2' \
scripts/verify-examples.sh --mode live --only create_by_url
```

### Usage

Offline verification:

```bash
scripts/verify-examples.sh --mode offline
```

Auto verification:

```bash
scripts/verify-examples.sh --mode auto
```

Live verification:

```bash
scripts/verify-examples.sh --mode live
```

Or load local parameters from an env file:

```bash
scripts/verify-examples.sh --mode live --only create_by_url --env-file .env.verify-examples
```

The env file is sourced by Bash, so use shell-compatible assignments:

```bash
LLM_PROVIDER=AnthropicProvider
LLM_MODEL=<model>
ANTHROPIC_API_KEY=<key>
GOPHER_MCP_URL=http://127.0.0.1:3001/mcp
```

By default live verification asks:

```text
What tools we have?
```

The word `PASS` is reserved for live checks where the example prints a
non-empty `Agent Response` section and that response contains `tool`
case-insensitively by default. Offline checks can return `OK`, but they do not
produce `PASS` because they do not verify an actual AI answer. Override this
for a stricter local smoke test when the expected tool name is known:

```bash
VERIFY_EXPECTED_ANSWER="get-weather" \
scripts/verify-examples.sh --mode live --only create_by_url
```

Run one example:

```bash
scripts/verify-examples.sh --mode offline --only create_by_url
```

### Modes

- `offline`: verifies npm install, SDK import, native library loading,
  `createWithUrl` native reachability, and missing-env bootstrap behavior.
  Offline mode reports `OK`, not `PASS`, because live credentials are unset and
  no AI answer is verified.
- `auto`: runs offline checks, then runs live examples only when required
  environment variables are present.
- `live`: runs only live checks. It requires all live environment variables for
  selected examples and fails when any are missing, when `Agent Response` is
  empty, or when the response does not contain `VERIFY_EXPECTED_ANSWER`.

### Examples

The verifier currently covers:

- `create_by_url`
- `create_by_api_key`
- `create_by_json`
- `create_by_server_id`
- `create_by_server_name`
- `create_by_gateway_id`
- `create_by_gateway_name`

### Live Environment

Set the variables needed by the selected examples:

```bash
export LLM_PROVIDER=AnthropicProvider
export LLM_MODEL=<model>
export ANTHROPIC_API_KEY=<key>
export GOPHER_API_KEY=<key>
export GOPHER_MCP_URL=http://127.0.0.1:3001/mcp
export GOPHER_MCP_SERVER_ID=<server-id>
export GOPHER_MCP_SERVER_NAME=<server-name>
export GOPHER_MCP_GATEWAY_ID=<gateway-id>
export GOPHER_MCP_GATEWAY_NAME=<gateway-name>
```

For the GitHub workflow's current live checks, only these values are needed:

```bash
LLM_PROVIDER=AnthropicProvider
LLM_MODEL=<model>
ANTHROPIC_API_KEY=<key>
GOPHER_API_KEY=<key>
GOPHER_MCP_URL=<url>
```

Store API keys as GitHub Actions secrets. `LLM_MODEL` and `LLM_PROVIDER` are
not secret, but the workflow currently reads them from secrets for simplicity.

For local runs, the same values can be placed in `.env.verify-examples` and
loaded with `--env-file .env.verify-examples` or
`VERIFY_EXAMPLES_ENV_FILE=.env.verify-examples`.

Successful live runs print up to the first 10 lines of the answer after the
final PASS result:

```text
[verify-examples] create_by_url live: PASS
[verify-examples] result: PASS
======================
The available tools include get-weather, get-forecast, and get-weather-alerts.
```

### Local Linux

Use the Ubuntu 20 Docker wrapper:

```bash
scripts/verify-examples-linux-docker.sh --mode offline
```

The wrapper starts an `ubuntu:20.04` x64 container, installs Node.js 20 inside
the container, then runs `scripts/verify-examples.sh`.

### Local Windows

Run on a real Windows x64 machine or Windows VM from Git Bash:

```bash
scripts/verify-examples.sh --mode offline
```

Do not use Docker-on-macOS or Wine for Windows verification; they do not
faithfully verify Windows DLL loading.

### GitHub Actions

`.github/workflows/verify-examples.yml` verifies the published SDK package on:

- `darwin-arm64` using `macos-15`
- `linux-x64` using `ubuntu-22.04`

The workflow is triggered by pull requests to `main`, pushes to `main`,
`br_release`, and `iml_verify_auto`, manual dispatch, and the scheduled run.
Manual dispatch accepts `npm_version`, defaulting to `latest`.

Each matrix job runs native package verification first on the same runner. If
native verification fails, example verification does not run. The workflow then
runs exactly two live examples in order:

```bash
scripts/verify-examples.sh --mode live --only create_by_api_key
scripts/verify-examples.sh --mode live --only create_by_url
```

The second command runs only after the first succeeds.
