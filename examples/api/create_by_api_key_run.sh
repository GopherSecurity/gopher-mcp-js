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

# Prefer the in-tree native build over previously staged/released binaries.
# An explicit override may name a library file or directory.
if [ -z "${GOPHER_ORCH_LIBRARY_PATH:-}" ]; then
  case "$(uname -s)" in
    Darwin) LIBRARY_NAMES=(libgopher-orch.dylib) ;;
    Linux) LIBRARY_NAMES=(libgopher-orch.so) ;;
    MINGW*|MSYS*|CYGWIN*) LIBRARY_NAMES=(libgopher-orch.dll gopher-orch.dll) ;;
    *) echo "Unsupported platform; set GOPHER_ORCH_LIBRARY_PATH explicitly." >&2; exit 1 ;;
  esac

  for LIBRARY_DIR in \
    "$REPO_ROOT/third_party/gopher-orch/build/lib" \
    "$REPO_ROOT/native/current/lib" \
    "$REPO_ROOT/native/lib"; do
    for LIBRARY_NAME in "${LIBRARY_NAMES[@]}"; do
      if [ -f "$LIBRARY_DIR/$LIBRARY_NAME" ]; then
        export GOPHER_ORCH_LIBRARY_PATH="$LIBRARY_DIR/$LIBRARY_NAME"
        break 2
      fi
    done
  done

  if [ -z "${GOPHER_ORCH_LIBRARY_PATH:-}" ]; then
    echo "Local native library not found. Run ./build.sh or set GOPHER_ORCH_LIBRARY_PATH." >&2
    exit 1
  fi
fi

echo "Using local SDK source: $REPO_ROOT/src"
echo "Using native library: $GOPHER_ORCH_LIBRARY_PATH"

cd "$REPO_ROOT"
exec "$REPO_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/create_by_api_key.ts" "$@"
