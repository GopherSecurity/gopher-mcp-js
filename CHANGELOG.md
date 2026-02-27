# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- **Rename main package** from `gopher-orch` to `@gopher.security/gopher-mcp`
  - New install: `npm install @gopher.security/gopher-mcp`
  - New import: `import { GopherAgent } from '@gopher.security/gopher-mcp'`
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
[0.1.0-20260227-124047]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260226-072516...v0.1.0-20260227-124047
[0.1.0-20260226-072516]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260208-150923...v0.1.0-20260226-072516
[0.1.0-20260208-150923]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v0.1.0-20260206-152345...v0.1.0-20260208-150923
[0.1.0-20260206-152345]: https://github.com/GopherSecurity/gopher-mcp-js/releases/tag/v0.1.0-20260206-152345
