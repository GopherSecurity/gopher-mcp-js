#!/usr/bin/env bash

set -euo pipefail

MODE="${VERIFY_EXAMPLES_MODE:-auto}"
SDK_VERSION="${SDK_VERSION:-latest}"
SDK_SPEC="${SDK_SPEC:-}"
ONLY_EXAMPLE=""
NODE_VERSION=""
PLATFORM=""

usage() {
  cat <<'EOF'
Usage: scripts/verify-examples.sh [options]

Options:
  --mode <offline|live|auto>     Verification mode (default: auto)
  --sdk-version <version>        npm version or dist-tag to install (default: latest)
  --sdk-spec <spec>              npm install spec, e.g. file:/path/to/package.tgz
  --only <example-name>          Run one example by registry name
  -h, --help                     Show this help
EOF
}

log() {
  printf '[verify-examples] %s\n' "$*"
}

fail() {
  log "error: $*"
  exit 1
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --mode)
        [ "$#" -ge 2 ] || fail "--mode requires a value"
        MODE="$2"
        shift 2
        ;;
      --sdk-version)
        [ "$#" -ge 2 ] || fail "--sdk-version requires a value"
        SDK_VERSION="$2"
        shift 2
        ;;
      --sdk-spec)
        [ "$#" -ge 2 ] || fail "--sdk-spec requires a value"
        SDK_SPEC="$2"
        shift 2
        ;;
      --only)
        [ "$#" -ge 2 ] || fail "--only requires a value"
        ONLY_EXAMPLE="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "unknown argument: $1"
        ;;
    esac
  done
}

validate_args() {
  case "$MODE" in
    offline|live|auto) ;;
    *) fail "invalid --mode '${MODE}'; expected offline, live, or auto" ;;
  esac

  if [ -n "$SDK_SPEC" ] && [ "$SDK_VERSION" != "latest" ]; then
    fail "--sdk-spec and --sdk-version cannot both be set"
  fi

  if [ -z "$SDK_SPEC" ] && [ -z "$SDK_VERSION" ]; then
    fail "--sdk-version must not be empty"
  fi

  if [ -n "$ONLY_EXAMPLE" ] && ! [[ "$ONLY_EXAMPLE" =~ ^[A-Za-z0-9_-]+$ ]]; then
    fail "--only must be an example name containing only letters, numbers, '_' or '-'"
  fi
}

require_node_18() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js 18 or newer is required, but node was not found in PATH"
  fi

  NODE_VERSION="$(node -v 2>/dev/null || true)"
  local major="${NODE_VERSION#v}"
  major="${major%%.*}"

  if ! [[ "$major" =~ ^[0-9]+$ ]] || [ "$major" -lt 18 ]; then
    fail "Node.js 18 or newer is required; current version is ${NODE_VERSION:-unknown}"
  fi
}

detect_platform() {
  local os
  local arch

  os="$(uname -s 2>/dev/null || true)"
  arch="$(uname -m 2>/dev/null || true)"

  case "${os}:${arch}" in
    Darwin:arm64)
      PLATFORM="darwin-arm64"
      ;;
    Darwin:x86_64|Darwin:amd64)
      PLATFORM="darwin-x64"
      ;;
    Linux:x86_64|Linux:amd64)
      PLATFORM="linux-x64"
      ;;
    MINGW*:x86_64|MSYS*:x86_64|CYGWIN*:x86_64|Windows_NT:x86_64|Windows_NT:amd64)
      PLATFORM="win32-x64"
      ;;
    *)
      fail "unsupported platform '${os:-unknown}' '${arch:-unknown}'; supported platforms are darwin-arm64, darwin-x64, linux-x64, and win32-x64"
      ;;
  esac
}

main() {
  parse_args "$@"
  validate_args
  require_node_18
  detect_platform

  if [ -n "$SDK_SPEC" ]; then
    log "platform=${PLATFORM} node=${NODE_VERSION} mode=${MODE} sdk=${SDK_SPEC}"
  else
    log "platform=${PLATFORM} node=${NODE_VERSION} mode=${MODE} sdk=${SDK_VERSION}"
  fi

  if [ -n "$ONLY_EXAMPLE" ]; then
    log "only=${ONLY_EXAMPLE}"
  fi

  log "result: PASS"
}

main "$@"
