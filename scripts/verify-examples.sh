#!/usr/bin/env bash

set -euo pipefail

MODE="${VERIFY_EXAMPLES_MODE:-auto}"
ONLY_EXAMPLE=""
NODE_VERSION=""
PLATFORM=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMP_ROOT=""
TEMP_BASE=""
PROJECT_DIR=""
SDK_INSTALL_SPEC="@gopher.security/gopher-mcp-js@latest"
SELECTED_EXAMPLES=()
EXAMPLES=(
  "create_by_url|examples/api/create_by_url.ts|GOPHER_MCP_URL LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_api_key|examples/api/create_by_api_key.ts|GOPHER_API_KEY LLM_MODEL|ANTHROPIC_API_KEY"
)

usage() {
  cat <<'EOF'
Usage: scripts/verify-examples.sh [options]

Options:
  --mode <offline|live|auto>     Verification mode (default: auto)
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

example_name() {
  local spec="$1"
  printf '%s\n' "${spec%%|*}"
}

example_path() {
  local spec="$1"
  local rest="${spec#*|}"
  printf '%s\n' "${rest%%|*}"
}

select_examples() {
  local spec
  local name
  local found=0

  SELECTED_EXAMPLES=()

  for spec in "${EXAMPLES[@]}"; do
    name="$(example_name "$spec")"
    if [ -z "$ONLY_EXAMPLE" ] || [ "$ONLY_EXAMPLE" = "$name" ]; then
      SELECTED_EXAMPLES+=("$spec")
      found=1
    fi
  done

  if [ "$found" -ne 1 ]; then
    fail "unknown example '${ONLY_EXAMPLE}'; supported examples are create_by_url and create_by_api_key"
  fi
}

log_selected_examples() {
  local names=()
  local spec

  for spec in "${SELECTED_EXAMPLES[@]}"; do
    names+=("$(example_name "$spec")")
  done

  local joined="${names[*]}"
  log "examples=${joined// /,}"
}

run_offline_example_bootstrap_checks() {
  local spec
  local name
  local source_path
  local target_file
  local output
  local status

  for spec in "${SELECTED_EXAMPLES[@]}"; do
    name="$(example_name "$spec")"
    source_path="${REPO_ROOT}/$(example_path "$spec")"
    target_file="${PROJECT_DIR}/$(basename "$source_path")"

    if [ ! -f "$source_path" ]; then
      fail "${name} offline: source file not found: ${source_path}"
    fi

    cp "$source_path" "$target_file"

    set +e
    output="$(
      cd "$PROJECT_DIR" &&
        env \
          -u GOPHER_MCP_URL \
          -u GOPHER_API_KEY \
          -u LLM_MODEL \
          -u LLM_PROVIDER \
          -u ANTHROPIC_API_KEY \
          npx tsx "$(basename "$target_file")" 2>&1
    )"
    status=$?
    set -e

    if [ "$status" -eq 0 ]; then
      printf '%s\n' "$output"
      fail "${name} offline: expected missing-env validation failure"
    fi

    if ! grep -q 'must both be set' <<<"$output"; then
      printf '%s\n' "$output"
      fail "${name} offline: did not report expected missing-env validation"
    fi

    log "${name} offline: PASS"
  done
}

missing_env_vars() {
  local vars="$1"
  local missing=()
  local var

  for var in $vars; do
    if [ -z "${!var:-}" ]; then
      missing+=("$var")
    fi
  done

  printf '%s\n' "${missing[*]}"
}

check_live_mode_gating() {
  local spec
  local name
  local source_path
  local required_envs
  local provider_envs
  local missing

  if [ "$MODE" = "offline" ]; then
    return
  fi

  for spec in "${SELECTED_EXAMPLES[@]}"; do
    IFS='|' read -r name source_path required_envs provider_envs <<<"$spec"
    missing="$(missing_env_vars "${required_envs} ${provider_envs}")"

    if [ -n "$missing" ]; then
      if [ "$MODE" = "live" ]; then
        fail "${name} live: missing ${missing}"
      fi
      log "${name} live: SKIP missing ${missing}"
      continue
    fi

    log "${name} live: READY"
  done
}

cleanup_temp_project() {
  if [ -n "$TEMP_ROOT" ] && [ -n "$TEMP_BASE" ] && [[ "$TEMP_ROOT" == "${TEMP_BASE}/gopher-mcp-js-example-verify."* ]]; then
    rm -rf "$TEMP_ROOT"
  fi
}

create_temp_project() {
  TEMP_BASE="${TMPDIR:-/tmp}"
  TEMP_BASE="${TEMP_BASE%/}"

  TEMP_ROOT="$(mktemp -d "${TEMP_BASE}/gopher-mcp-js-example-verify.XXXXXX")"
  PROJECT_DIR="${TEMP_ROOT}/project"

  mkdir -p "$PROJECT_DIR"

  (
    cd "$PROJECT_DIR"
    npm init -y >/dev/null
    npm install --silent --no-audit --fund=false \
      "$SDK_INSTALL_SPEC" \
      'tsx@^4.7.0' \
      'typescript@^5.3.3'
  )

  log "temp_project=${PROJECT_DIR}"
}

run_native_probe() {
  (
    cd "$PROJECT_DIR"
    node "${REPO_ROOT}/scripts/verify-example-native-probe.cjs"
  )
  log "offline import/native: PASS"
}

main() {
  parse_args "$@"
  validate_args
  require_node_18
  detect_platform
  select_examples
  trap cleanup_temp_project EXIT

  log "platform=${PLATFORM} node=${NODE_VERSION} mode=${MODE} sdk=latest"

  if [ -n "$ONLY_EXAMPLE" ]; then
    log "only=${ONLY_EXAMPLE}"
  fi
  log_selected_examples

  create_temp_project
  run_native_probe
  run_offline_example_bootstrap_checks
  check_live_mode_gating

  log "result: PASS"
}

main "$@"
