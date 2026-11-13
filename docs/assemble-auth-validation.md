# JS assemble authorization validation

Date: 2026-11-13. Native source: 0307f8c9 (G5), pinned by this integration.
No native gateway implementation files were modified by the JS work.

## Regression baseline and final results

| Check | Result |
| --- | --- |
| Pre-change build/lint/Jest baseline | 360 passed, 77 skipped, no failures |
| Final TypeScript build and ESLint | Passed |
| Final default Jest suite | 378 passed, 82 skipped, no failures |
| Real native integration suite (explicit artifact) | 5 passed, no failures |
| Equivalent-resource routing tests alongside native run | 2 passed |
| Changed TypeScript formatting and git diff --check | Passed |
| Artifact capability check against G5 build | interface v1, embedded_auth=true, async_store=true |
| Artifact capability check against default legacy local build | Expected failure with actionable compatibility message |

The final default suite includes five skipped opt-in real-native cases; the
other 77 skips match the baseline. The five native cases were then run explicitly
against a compatible library. Routing tests overlap the full suite: do not sum
all table rows as unique tests.

Commands:

```sh
npm run build
npm run lint
npm test -- --runInBand
GOPHER_EMBEDDED_AUTH_TEST_LIBRARY=<G5-built-library-directory> \
  npm test -- --runInBand tests/embedded-auth-native.test.ts tests/embedded-auth-routing.test.ts
GOPHER_ORCH_LIBRARY_PATH=<G5-built-library-directory> \
  node scripts/check-embedded-auth-native.js
```

Validated native artifact: Mach-O x86_64 Debug, built from the same native
revision as the submodule. Its SHA-256 matches the native G5 validation record:

```text
9aa893aea9fa2facaceba69beb7b6b17b64b3c9d64f01091f277de1bc2f8d5a7
```

## Real native coverage

The JavaScript fixture uses local HTTP issuers/MCP endpoints and the real C FFI,
with no external LLM requests. Inventory is supplied at the JS fetch boundary;
server discovery, OAuth metadata, PKCE/code exchange, local assemble handlers,
credential verification and native agent creation use actual network traffic.

- Different issuers and shared issuer with separate resource audiences/scopes.
- One private page, strict Continue rejection before authorization, independent
  credentials and one inventory fetch per creation.
- External grant store reuse, refresh of an expired source without overwriting
  a sibling token, and a subsequent creation with no extra authorization page.
- Provider discovery elicitation after MCP grants are ready, delivered from a
  native creation worker to the existing synchronous JS handler.
- Cancellation closes the local listener.
- Concurrent creations retain separate page transactions and identities.

Unit/lifecycle tests additionally cover missing capabilities, privileged queues,
manual/browser presentation failures, stalled host callbacks, cancellation,
provider URL origin restrictions and bounded retries, async run ownership, and
cleanup when disposing during a run.

An integration test initially used an error-only tools/list response, which the
existing native discovery flow does not consume as a discovery elicitation.
The fixture was corrected to advertise tools and send elicitation/create on the
existing event-stream path. No gateway/native discovery behavior was changed.

## Limits and release gate

This validates a local G5 development artifact, not newly published npm binaries.
The older default library lacks embedded v1 symbols and is correctly rejected
only when the new multi-flow path is required. Current native package version
labels were not changed and cannot establish capability by themselves.

Real external browser/issuer/cloud-provider flows, Windows/ARM artifact builds,
and external LLM tool execution were not run. Full tool-time native refresh and
provider retry coverage remains in native G5; JS unit tests cover the adapter's
run/result/ownership behavior. Remote gateway regression evidence is recorded
in the native EmbeddedAuthValidation.md; the JS work did not modify those sources.

Before R1 distribution, ship compatible native artifacts for every advertised
platform and rerun capability/integration checks against the actual installable
packages. Native listener support is initially POSIX/HTTP and requires supported
loopback registration policies. Do not claim unsupported platform compatibility.
