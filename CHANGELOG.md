# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

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
[0.1.2]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.2[0.1.1]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260227-124047...v0.1.1[0.1.0-20260227-124047]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260226-072516...v0.1.0-20260227-124047
[0.1.0-20260226-072516]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260208-150923...v0.1.0-20260226-072516
[0.1.0-20260208-150923]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260206-152345...v0.1.0-20260208-150923
[0.1.0-20260206-152345]: https://github.com/GopherSecurity/gopher-mcp-js/releases/tag/v0.1.0-20260206-152345
