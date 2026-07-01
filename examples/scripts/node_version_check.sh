#!/usr/bin/env bash

require_node_18() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is required but was not found in PATH." >&2
    echo "Install Node.js 18 or newer, then rerun this example." >&2
    return 1
  fi

  local version major
  version="$(node -v 2>/dev/null || true)"
  major="${version#v}"
  major="${major%%.*}"

  if [[ ! "${major}" =~ ^[0-9]+$ ]] || ((major < 18)); then
    echo "Error: Node.js 18 or newer is required." >&2
    echo "Current Node.js: ${version:-unknown}" >&2
    echo "" >&2
    echo "Ubuntu 20 commonly ships an older Node.js. Install a newer Node:" >&2
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -" >&2
    echo "  sudo apt-get install -y nodejs" >&2
    echo "" >&2
    echo "Or use nvm:" >&2
    echo "  nvm install 20" >&2
    echo "  nvm use 20" >&2
    return 1
  fi
}
