#!/bin/bash

# Run the TypeScript SDK example for GopherAgent.createWithUrl.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo -e "${GREEN}===================================${NC}"
echo -e "${GREEN}GopherAgent.createWithUrl example${NC}"
echo -e "${GREEN}===================================${NC}"
echo ""

if [ ! -d "$PROJECT_DIR/native/lib" ]; then
    echo -e "${RED}Error: Native library not found at $PROJECT_DIR/native/lib${NC}"
    echo -e "${YELLOW}Please run ./build.sh first${NC}"
    exit 1
fi

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

cd "$PROJECT_DIR"

DYLD_LIBRARY_PATH="$PROJECT_DIR/native/lib" \
LD_LIBRARY_PATH="$PROJECT_DIR/native/lib" \
npx tsx examples/api/create_by_url.ts "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
