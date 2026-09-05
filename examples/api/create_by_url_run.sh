#!/bin/bash

# Run the TypeScript SDK example for GopherAgent.createWithUrl against
# the local @gopher.security/gopher-mcp-js checkout.
# Bootstraps and reuses node_modules in
# examples/api/test-project-create-by-url/, installs this repository when the
# package manifest changes, then runs the example via tsx.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$SCRIPT_DIR/test-project-create-by-url"
SDK_INSTALL_SPEC="${SDK_INSTALL_SPEC:-$REPO_ROOT}"
LOCAL_NATIVE_LIBRARY_PATH="$REPO_ROOT/native/current/lib"

source "$SCRIPT_DIR/../scripts/node_version_check.sh"
require_node_18

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}GopherAgent.createWithUrl example${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""

if [ -z "$GOPHER_MCP_URL" ]; then
    echo -e "${YELLOW}Warning: GOPHER_MCP_URL environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export GOPHER_MCP_URL=http://127.0.0.1:8080/mcp${NC}"
    echo ""
fi

if [ -z "$LLM_MODEL" ]; then
    echo -e "${YELLOW}Warning: LLM_MODEL environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export LLM_MODEL=<your-model-id>${NC}"
    echo ""
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}Warning: ANTHROPIC_API_KEY environment variable is not set${NC}"
    echo -e "${YELLOW}(Required for the default AnthropicProvider.)${NC}"
    echo ""
fi

echo -e "${CYAN}SDK: installing $SDK_INSTALL_SPEC${NC}"
if [ -z "$GOPHER_ORCH_LIBRARY_PATH" ] && [ -d "$LOCAL_NATIVE_LIBRARY_PATH" ]; then
    export GOPHER_ORCH_LIBRARY_PATH="$LOCAL_NATIVE_LIBRARY_PATH"
fi
echo -e "${CYAN}Native: ${GOPHER_ORCH_LIBRARY_PATH:-using package/default resolution}${NC}"
echo -e "${CYAN}Elicitation: ${GOPHER_MCP_ELICITATION:-on demand}${NC}"
echo ""

echo -e "${YELLOW}Setting up test project at $WORK_DIR...${NC}"
mkdir -p "$WORK_DIR"

cd "$WORK_DIR"

cat > package.json.tmp << 'EOF'
{
  "name": "@gopher.security/gopher-mcp-js-create-by-url-example",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "tsx create_by_url.ts"
  },
  "dependencies": {
    "@gopher.security/gopher-mcp-js": "file:REPO_ROOT_PLACEHOLDER"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

node -e "const fs=require('fs'); const p='package.json.tmp'; const pkg=fs.readFileSync(p,'utf8').replace('file:REPO_ROOT_PLACEHOLDER', 'file:' + process.argv[1]); fs.writeFileSync(p,pkg);" "$REPO_ROOT"
if [ ! -f package.json ] || ! cmp -s package.json.tmp package.json; then
    mv package.json.tmp package.json
else
    rm package.json.tmp
fi

cp "$SCRIPT_DIR/create_by_url.ts" .

npm_dependencies_current() {
    [ -d "node_modules" ] || return 1
    [ -f "node_modules/.package-lock.json" ] || return 1
    [ ! "package.json" -nt "node_modules/.package-lock.json" ] || return 1
    if [ -f "package-lock.json" ] && [ "package-lock.json" -nt "node_modules/.package-lock.json" ]; then
        return 1
    fi
    return 0
}

if npm_dependencies_current; then
    echo -e "${GREEN}Dependencies already installed${NC}"
else
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install --silent
fi

if [ "$SDK_INSTALL_SPEC" != "$REPO_ROOT" ]; then
    if [ ! -f ".sdk-install-spec" ] || [ "$(cat .sdk-install-spec)" != "$SDK_INSTALL_SPEC" ]; then
        echo -e "${YELLOW}Installing SDK override: $SDK_INSTALL_SPEC${NC}"
        npm install --silent "$SDK_INSTALL_SPEC"
        printf '%s' "$SDK_INSTALL_SPEC" > .sdk-install-spec
    else
        echo -e "${GREEN}SDK override already installed${NC}"
    fi
else
    rm -f .sdk-install-spec
fi

echo -e "${CYAN}Installed packages:${NC}"
npm ls @gopher.security/gopher-mcp-js || true

echo ""
echo -e "${YELLOW}Running example...${NC}"
echo ""
npm run start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
