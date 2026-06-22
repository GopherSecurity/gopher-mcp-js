#!/bin/bash

# Run the TypeScript client example with a Gopher API key, using the
# published @gopher.security/gopher-mcp-js SDK from npm (not local source).

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SCRIPT_DIR/.run-api"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Running TypeScript Client API Example (npm SDK)${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

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

# Set up a scratch project that consumes the published SDK
echo -e "${YELLOW}Setting up scratch project at $WORK_DIR ...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

cat > "$WORK_DIR/package.json" << EOF
{
  "name": "gopher-mcp-js-api-example",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx client_example_api.ts"
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

cp "$SCRIPT_DIR/client_example_api.ts" "$WORK_DIR/client_example_api.ts"

echo -e "${YELLOW}Installing @gopher.security/gopher-mcp-js@latest ...${NC}"
(cd "$WORK_DIR" && npm install --silent)

# Run the TypeScript client
echo ""
echo -e "${YELLOW}Running TypeScript client...${NC}"
echo ""
cd "$WORK_DIR"
npm run --silent start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
