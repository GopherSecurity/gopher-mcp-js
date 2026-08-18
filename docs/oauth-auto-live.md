# OAuth Auto Live Verification

The live OAuth verification suite checks that `gopher-mcp-js` can use a
manually provided Gmail refresh token to create short-lived Google access
tokens, pass them through SDK runtime credentials, and run a Gmail-backed MCP
query through both a direct MCP server URL and an MCP gateway URL.

Google login, MFA, SMS, phone approval, and browser account selection are not
automated by this suite. The Gmail refresh token is provided manually and stored
outside the repository, such as in GitHub Actions secrets or local environment
variables.

## Required Variables

Set these variables before running the live verification:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_GMAIL_REFRESH_TOKEN
GOPHER_GMAIL_SERVER_MCP_URL
GOPHER_GMAIL_GATEWAY_MCP_URL
LLM_PROVIDER
LLM_MODEL
ANTHROPIC_API_KEY
VERIFY_EXPECTED_EMAIL
```

`LLM_PROVIDER` currently defaults to `AnthropicProvider` in the GitHub Actions
workflow when the secret is not configured. `ANTHROPIC_API_KEY` is required for
that provider.

## Local Run

From the repository root, export the required variables and run the live suite:

```bash
export GOOGLE_OAUTH_CLIENT_ID='<google-oauth-client-id>'
export GOOGLE_OAUTH_CLIENT_SECRET='<google-oauth-client-secret>'
export GOOGLE_GMAIL_REFRESH_TOKEN='<gmail-refresh-token>'
export GOPHER_GMAIL_SERVER_MCP_URL='https://.../mcp'
export GOPHER_GMAIL_GATEWAY_MCP_URL='https://.../mcp'
export LLM_PROVIDER='AnthropicProvider'
export LLM_MODEL='<anthropic-model>'
export ANTHROPIC_API_KEY='<anthropic-api-key>'
export VERIFY_EXPECTED_EMAIL='<gmail-account-email>'
```

Then run:

```bash
npm run test:oauth-live
```

The suite runs both the direct MCP server URL check and the MCP gateway URL
check.

When any required variable is missing, the suite skips deterministically and
prints only the missing variable names. It must not print client secrets, Gmail
refresh tokens, short-lived access tokens, or provider API keys.

## CI Run

The `.github/workflows/oauth-auto-live.yml` workflow runs the same command on
pull requests, manual dispatch, and a weekly schedule. Secrets are exposed only
to the test step that runs `npm run test:oauth-live`.

Pull requests without access to repository secrets should skip the live tests
instead of failing. Runs with all required secrets should verify:

- Direct MCP server URL returns a mail profile containing `VERIFY_EXPECTED_EMAIL`.
- MCP gateway URL returns a mail profile containing `VERIFY_EXPECTED_EMAIL`.
- Logs contain only the non-secret milestones from the live test.
