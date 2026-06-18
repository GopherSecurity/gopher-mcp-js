#!/bin/bash

# Run the TypeScript SDK example for GopherAgent.createWithServerId
# against the npm-published @gopher.security/gopher-mcp-js package.
# Bootstraps a fresh node_modules in
# examples/api/test-project-create-by-server-id/, installs the SDK
# from npm, then runs the example via tsx.
#
# Set SDK_VERSION to pin to a specific release (e.g. SDK_VERSION=0.1.23);
# otherwise the latest published version is installed. The routing
# factories require @gopher.security/gopher-mcp-js >= 0.1.23.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SCRIPT_DIR/test-project-create-by-server-id"
SDK_VERSION="${SDK_VERSION:-latest}"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}GopherAgent.createWithServerId example${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

if [ -z "$GOPHER_API_KEY" ]; then
    echo -e "${YELLOW}Warning: GOPHER_API_KEY environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export GOPHER_API_KEY=your_api_key${NC}"
    echo ""
fi

if [ -z "$GOPHER_MCP_SERVER_ID" ]; then
    echo -e "${YELLOW}Warning: GOPHER_MCP_SERVER_ID environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export GOPHER_MCP_SERVER_ID=srv-...${NC}"
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

echo -e "${YELLOW}Setting up test project at $WORK_DIR...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

cat > package.json << 'EOF'
{
  "name": "@gopher.security/gopher-mcp-js-create-by-server-id-example",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "tsx create_by_server_id.ts"
  },
  "dependencies": {
    "@gopher.security/gopher-mcp-js": "SDK_VERSION_PLACEHOLDER"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

sed -i.bak "s/SDK_VERSION_PLACEHOLDER/$SDK_VERSION/" package.json && rm -f package.json.bak

cp "$SCRIPT_DIR/create_by_server_id.ts" .

echo -e "${YELLOW}Installing @gopher.security/gopher-mcp-js@$SDK_VERSION from npm...${NC}"
npm install --silent

echo -e "${CYAN}Installed packages:${NC}"
npm ls @gopher.security/gopher-mcp-js || true

echo ""
echo -e "${YELLOW}Running example...${NC}"
echo ""
npm run start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
