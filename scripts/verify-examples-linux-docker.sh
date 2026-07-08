#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE="${VERIFY_EXAMPLES_LINUX_IMAGE:-ubuntu:20.04}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[verify-examples-linux] error: docker is required for local Linux verification" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  set -- --mode offline
fi

DOCKER_ENV_ARGS=()
for name in \
  LLM_PROVIDER \
  LLM_MODEL \
  ANTHROPIC_API_KEY \
  GOPHER_API_KEY \
  GOPHER_MCP_URL \
  GOPHER_SDK_TEST \
  GOPHER_ACCESS_TOKEN \
  DEBUG
do
  if [ -n "${!name:-}" ]; then
    DOCKER_ENV_ARGS+=("-e" "$name")
  fi
done

docker run --rm \
  --platform linux/amd64 \
  -v "${REPO_ROOT}:/repo" \
  -w /repo \
  "${DOCKER_ENV_ARGS[@]}" \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update >/dev/null
    apt-get install -y --no-install-recommends ca-certificates curl gnupg >/dev/null
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update >/dev/null
    apt-get install -y --no-install-recommends nodejs >/dev/null
    NPM_CONFIG_CACHE=/tmp/gopher-mcp-js-npm-cache scripts/verify-examples.sh "$@"
  ' bash "$@"
