#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/.run-create-by-url"
SDK_VERSION="${SDK_VERSION:-latest}"

SERVER_BIN="${SCRIPT_DIR}/create_by_url_server"
GATEWAY_BIN="${SCRIPT_DIR}/create_by_url_gateway"
CLIENT_TS="${SCRIPT_DIR}/create_by_url.ts"

SERVER_PORT="${GOPHER_MCP_SERVER_PORT:-5000}"
GATEWAY_PORT="${GOPHER_GATEWAY_PORT:-5001}"
BACKEND_URL="http://127.0.0.1:${SERVER_PORT}/mcp"
GATEWAY_URL="http://127.0.0.1:${GATEWAY_PORT}/mcp"

TOKEN="${GOPHER_ACCESS_TOKEN:-}"
QUERY="${1:-What is the weather in Tokyo?}"
SESSION_ID="gopher-mcp-js-header-create-by-url-run"

LOG_DIR="${TMPDIR:-/tmp}/gopher-mcp-js-header-verify.$$"
SERVER_LOG="${LOG_DIR}/server.log"
GATEWAY_LOG="${LOG_DIR}/gateway.log"
CLIENT_LOG="${LOG_DIR}/client.log"
CURL_LOG="${LOG_DIR}/curl.log"

SERVER_PID=""
GATEWAY_PID=""

redacted_token() {
  local token="$1"
  local len=${#token}
  if [[ ${len} -eq 0 ]]; then
    printf '<empty>'
  elif [[ ${len} -le 6 ]]; then
    printf '***'
  else
    printf '%s...%s' "${token:0:3}" "${token: -3}"
  fi
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local deadline=$((SECONDS + 20))

  while ((SECONDS < deadline)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "ERROR: ${name} did not become ready at ${url}" >&2
  return 1
}

release_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  echo "Releasing TCP port ${port}: ${pids}"
  kill ${pids} 2>/dev/null || true

  local deadline=$((SECONDS + 5))
  while ((SECONDS < deadline)); do
    pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -z "${pids}" ]]; then
      return 0
    fi
    sleep 0.2
  done

  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Force releasing TCP port ${port}: ${pids}"
    kill -9 ${pids} 2>/dev/null || true
  fi
}

cleanup() {
  local status=$?
  if [[ -n "${GATEWAY_PID}" ]] && kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    kill "${GATEWAY_PID}" 2>/dev/null || true
    wait "${GATEWAY_PID}" 2>/dev/null || true
  fi
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi

  if [[ ${status} -ne 0 ]]; then
    echo
    echo "Verification failed. Logs are in: ${LOG_DIR}" >&2
    echo "  server:  ${SERVER_LOG}" >&2
    echo "  gateway: ${GATEWAY_LOG}" >&2
    echo "  client:  ${CLIENT_LOG}" >&2
    echo "  curl:    ${CURL_LOG}" >&2
  else
    echo
    echo "Verification passed. Logs are in: ${LOG_DIR}"
  fi
  exit "${status}"
}
trap cleanup EXIT

mkdir -p "${LOG_DIR}"

for bin in "${SERVER_BIN}" "${GATEWAY_BIN}"; do
  if [[ ! -x "${bin}" ]]; then
    echo "ERROR: required binary not found or not executable: ${bin}" >&2
    exit 1
  fi
done

if [[ ! -f "${CLIENT_TS}" ]]; then
  echo "ERROR: TypeScript client not found: ${CLIENT_TS}" >&2
  exit 1
fi

if [[ -z "${TOKEN}" ]]; then
  echo "ERROR: GOPHER_ACCESS_TOKEN must be set for header passthrough verification." >&2
  exit 1
fi

echo "Installing @gopher.security/gopher-mcp-js@${SDK_VERSION} from npm..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"
cat >"${WORK_DIR}/package.json" <<EOF
{
  "name": "gopher-mcp-js-header-create-by-url-example",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "tsx create_by_url.ts"
  },
  "dependencies": {
    "@gopher.security/gopher-mcp-js": "${SDK_VERSION}"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF
cp "${CLIENT_TS}" "${WORK_DIR}/create_by_url.ts"
(cd "${WORK_DIR}" && npm install --silent)

release_port "${SERVER_PORT}"
release_port "${GATEWAY_PORT}"

echo "Starting local MCP server on ${BACKEND_URL}..."
GOPHER_SDK_TEST=1 \
GOPHER_MCP_LOG_FLOW=1 \
GOPHER_MCP_SERVER_PORT="${SERVER_PORT}" \
"${SERVER_BIN}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!
wait_for_url "http://127.0.0.1:${SERVER_PORT}/health" "MCP server"

echo "Starting local gateway on ${GATEWAY_URL}..."
GOPHER_SDK_TEST=1 \
GOPHER_MCP_LOG_FLOW=1 \
GOPHER_GATEWAY_PORT="${GATEWAY_PORT}" \
GOPHER_BACKEND_MCP_URL="${BACKEND_URL}" \
"${GATEWAY_BIN}" >"${GATEWAY_LOG}" 2>&1 &
GATEWAY_PID=$!
wait_for_url "http://127.0.0.1:${GATEWAY_PORT}/health" "gateway"

echo "Running deterministic MCP calls through gateway..."
{
  echo "=== initialize ==="
  curl -fsS -X POST "${GATEWAY_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"gopher-mcp-js-header-verify","version":"1.0.0"}}}'
  echo
  echo "=== tools/list ==="
  curl -fsS -X POST "${GATEWAY_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  echo
  echo "=== tools/call ==="
  curl -fsS -X POST "${GATEWAY_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get-weather","arguments":{"city":"Tokyo"}}}'
  echo
} >"${CURL_LOG}" 2>&1

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "Running TypeScript SDK agent client through gateway..."
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  GOPHER_SDK_TEST=1 \
  GOPHER_MCP_LOG_FLOW=1 \
  GOPHER_MCP_URL="${GATEWAY_URL}" \
  GOPHER_ACCESS_TOKEN="${TOKEN}" \
  npm --prefix "${WORK_DIR}" run start -- "${QUERY}" >"${CLIENT_LOG}" 2>&1 || {
    echo "SDK client returned non-zero; continuing with transport verification."
  }
else
  echo "Skipping TypeScript SDK agent client because ANTHROPIC_API_KEY is not set."
fi

EXPECTED="Bearer $(redacted_token "${TOKEN}") len=${#TOKEN}"

echo "Checking token trace: ${EXPECTED}"
grep -F "token=${EXPECTED}" "${SERVER_LOG}" >/dev/null
grep -F "[access-token-server] get-weather" "${SERVER_LOG}" >/dev/null
grep -F "Current weather in Tokyo" "${CURL_LOG}" >/dev/null
if grep -F "mcp auth:" "${GATEWAY_LOG}" >/dev/null; then
  grep -F "token=${EXPECTED}" "${GATEWAY_LOG}" >/dev/null
fi
if [[ -s "${CLIENT_LOG}" ]]; then
  if grep -F "mcp auth:" "${CLIENT_LOG}" >/dev/null; then
    grep -F "token=${EXPECTED}" "${CLIENT_LOG}" >/dev/null
  fi
fi

echo
echo "Matched token logs:"
if [[ -s "${CLIENT_LOG}" ]]; then
  grep -F "token=${EXPECTED}" "${CLIENT_LOG}" | head -n 3 || true
else
  echo "(TypeScript SDK client skipped; no client log)"
fi
grep -F "token=${EXPECTED}" "${GATEWAY_LOG}" | head -n 5 || true
grep -F "token=${EXPECTED}" "${SERVER_LOG}" | head -n 3
echo
echo "MCP tools/call response:"
grep -F "Current weather in Tokyo" "${CURL_LOG}" | head -n 1
