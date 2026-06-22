#!/bin/bash

# Run the TypeScript client example with local MCP servers, using the
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
WORK_DIR="$SCRIPT_DIR/.run-json"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Running TypeScript Client Example (npm SDK)${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Set up a scratch project that consumes the published SDK
echo -e "${YELLOW}Setting up scratch project at $WORK_DIR ...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

cat > "$WORK_DIR/package.json" << EOF
{
  "name": "gopher-mcp-js-json-example",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx client_example_json.ts"
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

cp "$SCRIPT_DIR/client_example_json.ts" "$WORK_DIR/client_example_json.ts"

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
