#!/bin/bash

# Start MCP Server (Weather Tools)

set -e

DIR_CURR=$(cd "$(dirname "$0")";pwd)
cd $DIR_CURR

# Stop existing server on port 3001
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
sleep 1

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  npm install
fi

echo "🚀 Starting MCP Server on port 3001..."
echo "   📡 MCP Endpoint: http://127.0.0.1:3001/mcp"
echo "   💚 Health: http://127.0.0.1:3001/health"
echo ""

npm run dev
