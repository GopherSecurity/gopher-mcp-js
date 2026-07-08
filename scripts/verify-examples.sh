#!/usr/bin/env bash

set -euo pipefail

MODE="${VERIFY_EXAMPLES_MODE:-auto}"
ONLY_EXAMPLE=""
ENV_FILE="${VERIFY_EXAMPLES_ENV_FILE:-}"
NODE_VERSION=""
PLATFORM=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMP_ROOT=""
TEMP_BASE=""
PROJECT_DIR=""
SDK_INSTALL_SPEC="${SDK_INSTALL_SPEC:-@gopher.security/gopher-mcp-js@latest}"
SDK_VERSION=""
VERIFY_LIVE_PROMPT="${VERIFY_LIVE_PROMPT:-What tools we have?}"
VERIFY_EXPECTED_ANSWER="${VERIFY_EXPECTED_ANSWER:-tool}"
LIVE_CHECKS_RUN=0
LIVE_CHECKS_SKIPPED=0
LIVE_ANSWER_SUMMARY=""
SELECTED_EXAMPLES=()
EXAMPLES=(
  "create_by_url|examples/api/create_by_url.ts|GOPHER_MCP_URL LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_api_key|examples/api/create_by_api_key.ts|GOPHER_API_KEY LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_json|examples/api/create_by_json.ts|LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_server_id|examples/api/create_by_server_id.ts|GOPHER_API_KEY GOPHER_MCP_SERVER_ID LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_server_name|examples/api/create_by_server_name.ts|GOPHER_API_KEY GOPHER_MCP_SERVER_NAME LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_gateway_id|examples/api/create_by_gateway_id.ts|GOPHER_API_KEY GOPHER_MCP_GATEWAY_ID LLM_MODEL|ANTHROPIC_API_KEY"
  "create_by_gateway_name|examples/api/create_by_gateway_name.ts|GOPHER_API_KEY GOPHER_MCP_GATEWAY_NAME LLM_MODEL|ANTHROPIC_API_KEY"
)

usage() {
  cat <<'EOF'
Usage: scripts/verify-examples.sh [options]

Options:
  --mode <offline|live|auto>     Verification mode (default: auto)
  --only <example-name>          Run one example by registry name
  --env-file <path>              Load live environment variables from a file
  -h, --help                     Show this help

Environment:
  VERIFY_EXAMPLES_ENV_FILE       Default env file path
  VERIFY_LIVE_PROMPT             Prompt used for live agent.run() checks
  VERIFY_EXPECTED_ANSWER         Text that must appear in the live answer
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
      --env-file)
        [ "$#" -ge 2 ] || fail "--env-file requires a value"
        ENV_FILE="$2"
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

load_env_file() {
  if [ -z "$ENV_FILE" ]; then
    return
  fi

  if [ ! -f "$ENV_FILE" ]; then
    fail "env file not found: ${ENV_FILE}"
  fi

  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
  log "env_file=${ENV_FILE}"
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
    fail "unknown example '${ONLY_EXAMPLE}'; supported examples are create_by_url, create_by_api_key, create_by_json, create_by_server_id, create_by_server_name, create_by_gateway_id, and create_by_gateway_name"
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
          node --import tsx "$(basename "$target_file")" 2>&1
    )"
    status=$?
    set -e

    if [ "$status" -eq 0 ]; then
      printf '%s\n' "$output"
      fail "${name} offline: expected missing-env validation failure"
    fi

    if ! grep -Eq 'must (both |all )?be set' <<<"$output"; then
      printf '%s\n' "$output"
      fail "${name} offline: did not report expected missing-env validation"
    fi

    log "${name} offline bootstrap: OK"
  done
}

extract_answer_excerpt() {
  local output="$1"
  printf '%s\n' "$output" | awk '
    found && $0 !~ /^-+$/ && length($0) > 0 {
      print
      count++
      if (count >= 10) {
        exit
      }
    }
    /Agent Response/ {
      found = 1
    }
  '
}

answer_summary_lines() {
  local text="$1"
  printf '%s\n' "$text" | sed -n '1,10p'
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

  if [ "${#missing[@]}" -eq 0 ]; then
    printf '\n'
    return
  fi

  printf '%s\n' "${missing[*]}"
}

run_live_example_checks() {
  local spec
  local name
  local source_path
  local required_envs
  local provider_envs
  local missing
  local target_file
  local output
  local status
  local answer_excerpt

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
      LIVE_CHECKS_SKIPPED=$((LIVE_CHECKS_SKIPPED + 1))
      log "${name} live: SKIP missing ${missing}"
      continue
    fi

    target_file="${PROJECT_DIR}/$(basename "$source_path")"
    if [ ! -f "$target_file" ]; then
      cp "${REPO_ROOT}/${source_path}" "$target_file"
    fi

    set +e
    output="$(
      cd "$PROJECT_DIR" &&
        node --import tsx "$(basename "$target_file")" \
          "$VERIFY_LIVE_PROMPT" 2>&1
    )"
    status=$?
    set -e

    if [ "$status" -ne 0 ]; then
      printf '%s\n' "$output"
      fail "${name} live: example exited with status ${status}"
    fi

    if ! grep -q 'Agent Response' <<<"$output"; then
      printf '%s\n' "$output"
      fail "${name} live: missing agent response marker"
    fi

    answer_excerpt="$(extract_answer_excerpt "$output")"
    if [ -z "$answer_excerpt" ]; then
      printf '%s\n' "$output"
      fail "${name} live: empty agent response"
    fi

    if [ -n "$VERIFY_EXPECTED_ANSWER" ] && ! grep -Fqi "$VERIFY_EXPECTED_ANSWER" <<<"$output"; then
      printf '%s\n' "$output"
      fail "${name} live: answer did not contain expected text: ${VERIFY_EXPECTED_ANSWER}"
    fi

    if [ -z "$LIVE_ANSWER_SUMMARY" ]; then
      LIVE_ANSWER_SUMMARY="$(answer_summary_lines "$answer_excerpt")"
    fi
    LIVE_CHECKS_RUN=$((LIVE_CHECKS_RUN + 1))
    log "${name} live: PASS"
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

  SDK_VERSION="$(
    cd "$PROJECT_DIR" &&
      node -p "require('@gopher.security/gopher-mcp-js/package.json').version"
  )"

  log "temp_project=${PROJECT_DIR}"
}

run_native_probe() {
  local output
  local status

  set +e
  output="$(
    cd "$PROJECT_DIR" &&
      node "${REPO_ROOT}/scripts/verify-example-native-probe.cjs" 2>&1
  )"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    printf '%s\n' "$output"
    fail "offline import/native probe failed"
  fi

  printf '%s\n' "$output" | grep -E '^(SDK import and native load OK|createWithUrl reached native code and failed as expected)$' || true
  log "offline import/native: OK"
}

main() {
  parse_args "$@"
  validate_args
  load_env_file
  require_node_18
  detect_platform
  select_examples
  trap cleanup_temp_project EXIT

  if [ -n "$ONLY_EXAMPLE" ]; then
    log "only=${ONLY_EXAMPLE}"
  fi
  log_selected_examples

  create_temp_project
  log "platform=${PLATFORM} node=${NODE_VERSION} mode=${MODE} sdk=${SDK_VERSION}"
  if [ "$MODE" != "live" ]; then
    run_native_probe
    run_offline_example_bootstrap_checks
  fi
  run_live_example_checks

  if [ "$LIVE_CHECKS_RUN" -gt 0 ] && [ "$LIVE_CHECKS_SKIPPED" -eq 0 ]; then
    log "result: PASS"
    printf '======================\n'
    printf '%s\n' "$LIVE_ANSWER_SUMMARY"
  else
    log "result: OK offline checks only; no AI answer verified"
  fi
}

main "$@"
