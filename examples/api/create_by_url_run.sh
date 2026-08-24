#!/bin/bash

# Run the TypeScript SDK example for GopherAgent.createWithUrl against
# the local @gopher.security/gopher-mcp-js package.
# Bootstraps a fresh node_modules in
# examples/api/test-project-create-by-url/, builds and packs this repository,
# installs the local tarball, then runs the example via tsx.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$SCRIPT_DIR/test-project-create-by-url"
LOCAL_ORCH_LIBRARY_PATH="${GOPHER_ORCH_LIBRARY_PATH:-$REPO_ROOT/third_party/gopher-orch/build/lib}"

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

if [ -d "$LOCAL_ORCH_LIBRARY_PATH" ]; then
    export GOPHER_ORCH_LIBRARY_PATH="$LOCAL_ORCH_LIBRARY_PATH"
    echo -e "${CYAN}Native: using local gopher-orch library at $GOPHER_ORCH_LIBRARY_PATH${NC}"
    echo ""
else
    echo -e "${YELLOW}Warning: local gopher-orch library was not found at $LOCAL_ORCH_LIBRARY_PATH${NC}"
    echo -e "${YELLOW}The installed SDK package will use its default native library resolution.${NC}"
    echo ""
fi

echo -e "${YELLOW}Setting up test project at $WORK_DIR...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

echo -e "${YELLOW}Building and packing local @gopher.security/gopher-mcp-js...${NC}"
cd "$REPO_ROOT"
npm run build
PACK_OUTPUT="$(npm pack --silent --pack-destination "$WORK_DIR")"
PACK_FILE="$(echo "$PACK_OUTPUT" | tail -n 1)"
if [[ "$PACK_FILE" = /* ]]; then
    PACK_PATH="$PACK_FILE"
else
    PACK_PATH="$WORK_DIR/$PACK_FILE"
fi

cd "$WORK_DIR"

cat > package.json << 'EOF'
{
  "name": "@gopher.security/gopher-mcp-js-create-by-url-example",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "tsx create_by_url.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

cp "$SCRIPT_DIR/create_by_url.ts" .

echo -e "${YELLOW}Installing local @gopher.security/gopher-mcp-js package...${NC}"
npm install --silent
npm install --silent "$PACK_PATH"

echo -e "${CYAN}Installed packages:${NC}"
npm ls @gopher.security/gopher-mcp-js || true

echo ""
echo -e "${YELLOW}Running example...${NC}"
echo ""
npm run start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
