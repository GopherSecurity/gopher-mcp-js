#!/bin/bash

# Run the TypeScript client example using npm-installed SDK
# This demonstrates how to use gopher-orch when installed via npm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLES_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$EXAMPLES_DIR")"
WORK_DIR="$SCRIPT_DIR/test-project"

# SDK version to install (can be overridden via environment variable)
# Note: Use a known working version by default since 'latest' may have issues
SDK_VERSION="${SDK_VERSION:-0.1.0-20260131-170458}"

# Kill any existing processes on ports 3001 and 3002
kill_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}Killing existing process on port $port${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    kill_port 3001
    kill_port 3002
    echo -e "${GREEN}Done${NC}"
}

trap cleanup EXIT

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Running npm SDK Example${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Create test project directory
echo -e "${YELLOW}Setting up test project...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Create package.json
cat > package.json << 'EOF'
{
  "name": "gopher-orch-npm-example",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx client_example_json.ts"
  },
  "dependencies": {
    "gopher-orch": "SDK_VERSION_PLACEHOLDER"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

# Replace SDK version placeholder
sed -i.bak "s/SDK_VERSION_PLACEHOLDER/$SDK_VERSION/" package.json && rm -f package.json.bak

# Copy the example TypeScript file
cp "$SCRIPT_DIR/client_example_json.ts" .

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Kill any existing processes on ports
kill_port 3001
kill_port 3002

# Start server3001
echo -e "${YELLOW}Starting server3001...${NC}"
cd "$EXAMPLES_DIR/server3001"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies for server3001...${NC}"
    npm install
fi
npm run dev > /dev/null 2>&1 &
SERVER3001_PID=$!
echo -e "${GREEN}server3001 started (PID: $SERVER3001_PID)${NC}"

# Start server3002
echo -e "${YELLOW}Starting server3002...${NC}"
cd "$EXAMPLES_DIR/server3002"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies for server3002...${NC}"
    npm install
fi
npm run dev > /dev/null 2>&1 &
SERVER3002_PID=$!
echo -e "${GREEN}server3002 started (PID: $SERVER3002_PID)${NC}"

# Wait for servers to start
echo -e "${YELLOW}Waiting for servers to start...${NC}"
sleep 3

# Run the TypeScript client
echo ""
echo -e "${YELLOW}Running TypeScript client...${NC}"
echo ""
cd "$WORK_DIR"

# Run with npm
npm run start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"
echo ""
echo -e "${CYAN}To run this example manually:${NC}"
echo "  1. npm install gopher-orch"
echo "  2. Copy client_example_json.ts to your project"
echo "  3. Run: npx tsx client_example_json.ts"

exit 0
