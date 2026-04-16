#!/bin/bash

# Run the Auth MCP Server example
# Usage:
#   ./run_example.sh           # Run using server.config settings
#   ./run_example.sh --no-auth # Override config to disable auth
#   ./run_example.sh --help    # Show help

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Check for help flag
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Auth MCP Server Example (JavaScript)"
    echo ""
    echo "Usage:"
    echo "  ./run_example.sh           Run using server.config settings"
    echo "  ./run_example.sh --no-auth Override config to disable auth"
    echo "  ./run_example.sh --help    Show this help"
    echo ""
    echo "Options:"
    echo "  --no-auth    Disable OAuth authentication (overrides server.config)"
    echo ""
    echo "Configuration:"
    echo "  Edit server.config to configure OAuth settings (auth_disabled=true/false)"
    echo ""
    echo "Test endpoints:"
    echo "  curl http://localhost:3001/health"
    echo "  curl -X POST http://localhost:3001/mcp \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'"
    exit 0
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found${NC}"
    echo "Please install Node.js 18+ first"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ required. Current version: $(node -v)${NC}"
    exit 1
fi

# Check if node_modules exists, install if not
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Check if dist exists, build if not
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}Building TypeScript...${NC}"
    npm run build
fi

echo -e "${GREEN}Starting Auth MCP Server...${NC}"
echo -e "Configuration: ${YELLOW}server.config${NC}"
echo ""

# Run server with arguments
exec npm start -- "$@"
