#!/bin/bash

# Run the TypeScript client example with local MCP servers

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
source "$SCRIPT_DIR/scripts/native_library_path.sh"
require_node_18

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
echo -e "${GREEN}Running TypeScript Client Example${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

NATIVE_LIBRARY_DIR="$(resolve_native_library_dir "$PROJECT_DIR")"
echo -e "${YELLOW}Native library path: ${NATIVE_LIBRARY_DIR}${NC}"

# Kill any existing processes on ports
kill_port 3001
kill_port 3002

# Start server3001
echo -e "${YELLOW}Starting server3001...${NC}"
cd "$SCRIPT_DIR/server3001"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies for server3001...${NC}"
    npm install
fi
npm run dev > /dev/null 2>&1 &
SERVER3001_PID=$!
echo -e "${GREEN}server3001 started (PID: $SERVER3001_PID)${NC}"

# Start server3002
echo -e "${YELLOW}Starting server3002...${NC}"
cd "$SCRIPT_DIR/server3002"
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
cd "$PROJECT_DIR"

# Run with Node.js (set library path for native library)
DYLD_LIBRARY_PATH="$NATIVE_LIBRARY_DIR" \
LD_LIBRARY_PATH="$NATIVE_LIBRARY_DIR" \
npx tsx examples/client_example_json.ts "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
