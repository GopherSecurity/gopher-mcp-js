#!/bin/bash

# Run the TypeScript client example with Gopher API key

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/scripts/node_version_check.sh"
require_node_18

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Running TypeScript Client API Example${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check if native library exists
if [ ! -d "$PROJECT_DIR/native/lib" ]; then
    echo -e "${RED}Error: Native library not found at $PROJECT_DIR/native/lib${NC}"
    echo -e "${YELLOW}Please run ./build.sh first${NC}"
    exit 1
fi

# Check if GOPHER_API_KEY is set
if [ -z "$GOPHER_API_KEY" ]; then
    echo -e "${YELLOW}Warning: GOPHER_API_KEY environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export GOPHER_API_KEY=your_api_key${NC}"
    echo ""
fi

# Check if ANTHROPIC_API_KEY is set (required for LLM provider)
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}Warning: ANTHROPIC_API_KEY environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export ANTHROPIC_API_KEY=your_api_key${NC}"
    echo ""
fi

# Run the TypeScript client
echo -e "${YELLOW}Running TypeScript client...${NC}"
echo ""
cd "$PROJECT_DIR"

# Run with Node.js (set library path for native library)
DYLD_LIBRARY_PATH="$PROJECT_DIR/native/lib" \
LD_LIBRARY_PATH="$PROJECT_DIR/native/lib" \
npx tsx examples/client_example_api.ts "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
