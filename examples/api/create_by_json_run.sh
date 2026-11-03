#!/usr/bin/env bash
# Run this example with the repository SDK and local native libraries.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../scripts/node_version_check.sh"
require_node_18

if [ ! -x "$REPO_ROOT/node_modules/.bin/tsx" ]; then
  echo "Install repository dependencies first: npm ci --ignore-optional" >&2
  exit 1
fi

cd "$REPO_ROOT"
exec "$REPO_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/create_by_json.ts" "$@"
