#!/bin/bash

# Run the TypeScript SDK example for GopherAgent.createWithUrl against
# the published @gopher.security/gopher-mcp-js npm package.
# Bootstraps a fresh node_modules in
# examples/api/test-project-create-by-url/, installs the npm package, then runs
# the example via tsx.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SCRIPT_DIR/test-project-create-by-url"
SDK_PACKAGE_VERSION="${GOPHER_MCP_JS_VERSION:-latest}"

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

echo -e "${CYAN}SDK: installing @gopher.security/gopher-mcp-js@$SDK_PACKAGE_VERSION from npm${NC}"
echo -e "${CYAN}Native: using the native library bundled/resolved by the npm package${NC}"
echo ""

echo -e "${YELLOW}Setting up test project at $WORK_DIR...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

cd "$WORK_DIR"

cat > package.json << 'EOF'
{
  "name": "@gopher.security/gopher-mcp-js-create-by-url-example",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "tsx create_by_url.ts"
  },
  "dependencies": {
    "@gopher.security/gopher-mcp-js": "latest"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

cp "$SCRIPT_DIR/create_by_url.ts" .

echo -e "${YELLOW}Installing npm dependencies...${NC}"
npm install --silent
if [ "$SDK_PACKAGE_VERSION" != "latest" ]; then
    npm install --silent "@gopher.security/gopher-mcp-js@$SDK_PACKAGE_VERSION"
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
