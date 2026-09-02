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

Local live parameters can also be loaded from a shell-compatible env file:

```bash
scripts/verify-examples.sh --mode live --only create_by_url --env-file .env.verify-examples
```

Example `.env.verify-examples`:

```bash
LLM_PROVIDER=AnthropicProvider
LLM_MODEL=<model>
ANTHROPIC_API_KEY=<key>
GOPHER_MCP_URL=http://127.0.0.1:3001/mcp
```

By default, live mode asks each example:

```text
What tools we have?
```

The response must contain `tool` case-insensitively by default. The word
`PASS` is reserved for this live answer validation. Offline checks can return
`OK`, but they do not produce `PASS` because no actual AI answer is verified.
Use `VERIFY_LIVE_PROMPT` and `VERIFY_EXPECTED_ANSWER` to run a stricter prompt
or require a known tool name such as `get-weather`.

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
  It reports `OK`, not `PASS`, because live credentials are unset and no AI
  answer is verified.
- `auto`: runs offline checks and runs live examples only when required
  variables are present.
- `live`: runs only live checks. It requires all live variables for selected
  examples and fails if any are missing, if the `Agent Response` section is
  empty, or if the response does not contain `VERIFY_EXPECTED_ANSWER`.

Successful live runs print up to the first 10 lines of the answer after the
final PASS result:

```text
[verify-examples] create_by_url live: PASS
[verify-examples] result: PASS
======================
The available tools include get-weather, get-forecast, and get-weather-alerts.
```

## GitHub Actions

`.github/workflows/verify-examples.yml` runs the same verifier on hosted
macOS and Linux runners as an optional smoke path. It runs on pull requests
targeting `main`, pushes to configured verification branches, and manual
dispatch.

```bash
npm run test:oauth-custom-idp
```

Required secrets for live checks:

```text
LLM_PROVIDER
LLM_MODEL
ANTHROPIC_API_KEY
GOPHER_API_KEY
GOPHER_MCP_URL
```

Pull request and push runs use `live` mode. Manual dispatch can select
`offline`, `live`, or `auto` mode and choose the npm package version to verify.

## Examples Covered

The verifier currently covers:

- `create_by_url`
- `create_by_api_key`
- `create_by_json`
- `create_by_server_id`
- `create_by_server_name`
- `create_by_gateway_id`
- `create_by_gateway_name`
