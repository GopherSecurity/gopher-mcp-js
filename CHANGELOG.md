# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]


## [0.1.34.1] - 2026-08-13

### Changed

- Pin `gopher-orch` native library to [v0.1.34](https://github.com/GopherSecurity/gopher-orch/releases/tag/v0.1.34).

#### SDK changes since v0.1.34

- Fix OAuth createWithUrl crash
- Initialize auth before OAuth FFI use
- Stabilize native FFI smoke tests
- Fix OAuth lint errors
- Update live example verification prompt
- Use npm package for create by URL example

#### gopher-orch v0.1.34 highlights


### Added
- Add structured OAuth discovery errors (#159)
- Add per-server runtime credentials (#159)
- Add MCP OAuth challenge probe (#159)
- Support automatic gateway backend OAuth
- Add the four-step security verification checklist to deploy/SECURITY.md
- Address review findings on the gateway Helm chart
- Add Helm chart to deploy gateway + Presidio DLP as one unit
### Changed
- make format
- Document SDK OAuth native usage (#159)
- Extend FFI agent runtime options (#159)
- Preserve per-server credentials for tool calls (#159)
- Apply per-server credentials during discovery (#159)
- Complete OAuth client SDK accessors (#159)
- Expose MCP OAuth discovery over C API (#159)
- Fetch OAuth authorization metadata (#159)
- Fetch OAuth protected resource metadata (#159)
- Lock down SDK runtime auth headers (#159)
- make format
- Cover gateway OAuth token proxy workaround
- Guard gateway auto OAuth metadata adoption
- Isolate gateway passthrough backend routes
- Clarify gateway backend auth failures
- Fail fast on unsupported gateway backend auth (#147)
- Pin Presidio to GHCR 2.2.362 instead of tracking mcr :latest
- Keep the backend manifest and audit token out of the pod spec
- Bound Presidio Service names and stop templating values into shell
- Bring the gateway Docker README up to date with security and env-aware builds
- Document security enablement paths and the Presidio lifecycle
- Let the backend own the bearer-token requirement
- Make gateway build + deploy test/live aware with per-env image repos
- Clean up changelog entry
- Preserve direct tool call errors
- Use request timeout for direct tool calls
- Clean up direct streamable HTTP sessions
- Retry direct streamable HTTP discovery
- Guard streamable HTTP listTools fallback
- Track gopher-mcp main
### Fixed
- Fix Windows ARM64 OAuth discovery build
- Fix gateway OAuth token exchange for Postman
- Fix gateway OAuth passthrough discovery
- Fix gateway streamable HTTP curl stop handling
- Fix gateway Service selector and expose the bearer-token switch
- Fix gateway build and e2e tests
- Fix gateway passthrough routing and build cache

## [0.1.34] - 2026-08-11

### Added

- Add automatic MCP OAuth discovery for agent creation APIs, including
  protected-resource probing, authorization-server metadata discovery, PKCE,
  loopback callback handling, dynamic client registration, token exchange, token
  refresh, and token caching.
- Add OAuth-aware examples for URL and server-id agent creation.
- Add example verification tooling for offline and live runs, including scoped
  example execution and native package preflight checks.
- Add runtime Node.js version checks and shared koffi type registration guards.

### Changed

- Pin `gopher-orch` native library to [v0.1.34](https://github.com/GopherSecurity/gopher-orch/releases/tag/v0.1.34).
- Consolidate agent creation APIs onto the existing public API names while
  keeping OAuth resolution automatic and on demand.
- Route OAuth runtime credentials through native agent creation, discovery, and
  tool calls without overwriting explicit caller-provided Authorization headers.
- Update API examples to use the published SDK package and improve live
  verification prompts.
- Default SDK API routing to production unless `GOPHER_SDK_TEST` is explicitly
  enabled.

### Fixed

- Stabilize native FFI smoke tests by avoiding live network calls and preventing
  null handles or null pointers from crossing into native calls.
- Fix OAuth lint issues and type-safety gaps.
- Improve native library loading for packaged and local development builds,
  including owned string cleanup, Linux dependency preloading, and Node runtime
  compatibility checks.
- Make agent creation failures surface actionable `AgentError` messages when
  the native side returns an empty error.

#### gopher-orch v0.1.34 highlights

##### Added

- Add structured OAuth discovery errors, protected-resource probing, and
  authorization-server metadata discovery for SDK OAuth flows.
- Add per-server runtime credentials so OAuth tokens can be applied during
  backend discovery and tool calls.
- Add automatic gateway backend OAuth support.
- Add Helm deployment support for gateway + Presidio DLP, including security
  verification documentation.

##### Changed

- Extend the C FFI with OAuth discovery and agent runtime option accessors.
- Preserve explicit SDK runtime auth headers while applying discovered OAuth
  credentials only where needed.
- Fail fast on unsupported gateway backend auth modes instead of silently
  skipping configured backends.
- Harden gateway OAuth metadata adoption, passthrough routing, direct tool-call
  error handling, and streamable HTTP discovery/session cleanup.
- Pin Presidio deployment images and tighten generated gateway deployment
  manifests.

##### Fixed

- Fix Windows ARM64 OAuth discovery builds.
- Fix gateway OAuth token exchange and passthrough discovery behavior for
  Postman-compatible flows.
- Fix gateway streamable HTTP curl stop handling, passthrough routing, build
  cache usage, and e2e coverage.
- Fix gateway Service selectors and expose the bearer-token switch.

## [0.1.33] - 2026-07-26

### Fixed
- **TLS / HTTPS code path** (via gopher-mcp v0.1.7 + gopher-orch v0.1.24)
  - Resolve intermittent SIGSEGV / `EXC_BAD_ACCESS` during SSL handshake
    teardown — use-after-free in `SslStateMachine` posted lambdas; fixed
    via a `std::shared_ptr<bool>` liveness token captured as `weak_ptr`.
  - Resolve `SIGSEGV` on OpenSSL 3.x error reporting — `ERR_func_error_string()`
    is deprecated and always returns `NULL` on 3.x; streaming `NULL` into a
    `stringstream` was UB. Null-guard both `ERR_*_error_string()` accessors.
  - Surface SSL failures via `WARN`-level log (`handleSslError`) so TLS
    issues stop being invisible at the default log level.
  - Apply the same liveness-token UAF fix to `ReActAgent`'s four async
    callback sites (`callLLM`, `executeToolCalls`, `handleToolResults`).
- **Silent empty-tool-registry failure** — when every configured MCP server
  fails connection or `tools/list` returns nothing, `createWithApiKey` /
  `createWithServerConfig` now throw `AgentError` instead of handing the
  LLM a zero-tool agent. The previous behavior masked TLS / discovery bugs
  as "the model didn't pick a tool."
- **Cargo-cult 1-second wait removed** — dropped the fixed-budget
  `for (int i=0; i<20; i++) NonBlock + 50ms` settle pause that came after
  `tools/list` already completed.
### Changed
- **API root now defaults to production** — `https://api.gopher.security`
  is the default. Set `GOPHER_SDK_TEST=true` (literal lowercase) to route
  to `https://api-test.gopher.security`. Previously prebuilt sidecar
  packages silently used the test environment because of a default-OFF
  CMake option. Any value other than the literal `true` (including `TRUE`,
  `1`, `yes`, empty) stays on production — typos can't accidentally
  redirect real traffic to staging.
- **Filter registry startup logs demoted** — filter / circuit-breaker
  registration logs in libgopher-mcp moved from `Info` to `Debug`,
  eliminating ~11 lines of noise on every process start.
### Notes
- New regression tests added on the native side: 4 UAF tests on
  `SslStateMachine`, 3 on `TransportSocketStateMachine`, 5 on the OpenSSL
  null-guard, 1 on `ReActAgent` lifetime, 1 HTTPS code-path test on
  `createByJson`, and 4 on `GOPHER_SDK_TEST` env handling.

### Changed

- Pin `gopher-orch` native library to [v0.1.33](https://github.com/GopherSecurity/gopher-orch/releases/tag/v0.1.33).

#### SDK changes since v0.1.32

- Verify examples against live staging
- Track gopher-orch release branch
- Show installed SDK version in API examples
- Use anonymous owned string disposable
- Checkout before verifier preflight
- Guard macOS Homebrew cleanup
- Remove feature branch verifier trigger
- Limit verifier workflow token permissions
- Scope verifier secrets to live step
- Respect verifier workflow mode
- Update API examples to latest SDK
- Update verifier workflow and native submodule
- Add access token support to API examples
- Match live verifier expectations to prompts
- Update example verification prompts and triggers
- Gate example verification on native preflight
- Document example verification workflow (#20)
- Harden FFI setup retries (#20)
- Add scoped example verification (#20)
- Add create by JSON verification (#20)
- Add verifier release live mode (#20)
- Add verifier workflow auto mode (#20)
- Wire verifier offline workflow (#20)
- Add verifier workflow skeleton (#20)
- Add Ubuntu 20 Linux verifier helper (#20)
- Add verifier package scripts (#20)
- Add verifier live example execution (#20)
- Add verifier live mode gating (#20)
- Add verifier offline example bootstrap (#20)
- Add verifier example registry (#20)
- Add verifier createWithUrl smoke (#20)
- Add verifier native import probe (#20)
- Add verifier temp project setup (#20)
- Add verifier platform detection (#20)
- Add verifier script skeleton (#20)
- Use AgentError for runtime guard
- Use static FFI imports
- Align TypeScript target with Node 18
- Use async fetch for API config
- Cover API root env routing
- Fix disposable koffi type suffix
- Use updated gopher-orch submodule for HTTP gateways
- Use npm package for API key example (#18)
- Use disposable strings for owned FFI results (#18)
- Narrow Linux deep binding to HTTP TLS deps (#18)
- Deep bind Linux native libraries (#18)
- Preserve Linux Docker build cache (#18)
- Prefer host native bundle for local examples (#18)
- Run API key example without tsx wrapper (#18)
- Handle owned native run strings safely (#18)
- Avoid native API curl bootstrap on Linux (#18)
- Build Linux native SDK on Ubuntu 20 (#18)
- Harden local native library resolution (#18)
- Fix Linux native verification path (#18)
- Prefer active native library output (#18)
- Improve native build targets (#18)
- Fix native loading and Node runtime checks (#18)
- make format
- Require token for header example run
- Normalize empty builder access token
- Treat empty access token as absent
- Guard agent option koffi structs
- Use published SDK in header example (#16)
- Add header createByUrl verification example (#16)
- Expose agent runtime options in SDK APIs (#16)
- Add agent runtime options FFI bindings (#16)
- Test SDK API routing env guard
- Lazy initialize auth koffi types
- Validate shared koffi type registrations
- Track gopher-orch submodule main
- Format code
- Fix duplicate Koffi FFI type registration
- Make GopherAgent.create error message actionable on empty lastError
- Bump gopher-orch to v0.1.24; document GOPHER_SDK_TEST

#### gopher-orch v0.1.33 highlights


### Added
- Support MCP access tokens in API examples
### Changed
- make format
- Use direct Streamable HTTP MCP calls
- Revert gateway Docker build file changes
- make format
- Return 404 for unknown gateway routes
- Improve changelog release continuity
- Exclude MCP namespace root from gateway auth
- Capture gateway auth context only when needed
- Scope tokenless gateway auth by connection
- Restrict stateless gateway auth fallback
### Fixed
- Fix gateway passthrough routing and build cache
- Fix gateway authorization scoping

## [0.1.2] - 2026-03-12

## [0.1.1] - 2026-02-28

## [0.1.0-20260227-124047] - 2026-02-27

### Changed

- **CI Workflow Fix**
  - Use `npm install --ignore-optional` instead of `npm ci` to avoid lock file sync issues with optional dependencies

### Fixed

- **Documentation Updates**
  - Rewrite README.md with comprehensive content for npm users
  - Add supported LLM providers table
  - Add environment variables reference
  - Add troubleshooting section
  - Fix platform package names in documentation (correctly reference `gopher-orch-*` packages)

## [0.1.0-20260226-072516] - 2026-02-26

### Added

- **Centralized Version Management**
  - Add `scripts/update-version.js` to update version across all files
  - Add `npm run update-version <version>` script
  - Workflow now reads version from `package.json` instead of hardcoded env

- **GitHub Release Creation**
  - Add automatic GitHub release creation on successful publish
  - Release notes include "What's Changed" from CHANGELOG.md

### Changed

- **Rename main package** from `gopher-orch` to `@gopher.security/gopher-mcp-js`
  - New install: `npm install @gopher.security/gopher-mcp-js`
  - New import: `import { GopherAgent } from '@gopher.security/gopher-mcp-js'`
- Switch npm organization from `@gopher-test` to official `@gopher.security`
  - `@gopher.security/gopher-orch-darwin-arm64`
  - `@gopher.security/gopher-orch-darwin-x64`
  - `@gopher.security/gopher-orch-linux-arm64`
  - `@gopher.security/gopher-orch-linux-x64`
  - `@gopher.security/gopher-orch-win32-arm64`
  - `@gopher.security/gopher-orch-win32-x64`
- Update examples to use environment variables for LLM provider/model configuration
  - `LLM_PROVIDER` env var (default: AnthropicProvider)
  - `LLM_MODEL` env var (default: claude-3-haiku-20240307)
- Change default example question to "List all my Gmail drafts"

## [0.1.0-20260208-150923] - 2026-02-08

### Added

- **API Key Authentication**
  - Add `GopherAgent.createWithApiKey()` for simplified setup
  - Fetches MCP server configuration from Gopher API

- **npm Examples**
  - Add `examples/npm/` directory for npm-installed SDK usage
  - Add API key example (`client_example_api.ts`)

### Changed

- Update workflow to use `npm install --ignore-optional`
- Use scoped package names `@gopher-test/gopher-orch-*`

## [0.1.0-20260206-152345] - 2026-02-06

### Added

- **Initial npm Release**
  - Platform-specific packages for native binaries
    - `@gopher-test/gopher-orch-darwin-arm64`
    - `@gopher-test/gopher-orch-darwin-x64`
    - `@gopher-test/gopher-orch-linux-arm64`
    - `@gopher-test/gopher-orch-linux-x64`
    - `@gopher-test/gopher-orch-win32-arm64`
    - `@gopher-test/gopher-orch-win32-x64`
  - Main `gopher-orch` package with TypeScript bindings

- **Core Features**
  - `GopherAgent` class for AI agent orchestration
  - `createWithApiKey()` - Create agent with Gopher API key
  - `createWithJson()` - Create agent with JSON configuration
  - `run()` - Execute queries with tool support
  - Native FFI bindings via koffi

- **Examples**
  - JSON configuration example (`client_example_json.ts`)
  - API key example (`client_example_api.ts`)

- **CI/CD**
  - GitHub Actions workflow for publishing to npm
  - Automatic download of gopher-orch native binaries
  - Multi-platform support (6 platforms)

---

[Unreleased]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...HEAD
[0.1.34.1]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.34.1[0.1.34]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.34[0.1.33]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.33[0.1.2]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.2[0.1.1]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.1[0.1.0-20260227-124047]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260226-072516...v0.1.0-20260227-124047
[0.1.0-20260226-072516]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260208-150923...v0.1.0-20260226-072516
[0.1.0-20260208-150923]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260206-152345...v0.1.0-20260208-150923
[0.1.0-20260206-152345]: https://github.com/GopherSecurity/gopher-mcp-js/releases/tag/v0.1.0-20260206-152345
