#!/bin/bash

# Run the TypeScript client example using API key with npm-installed SDK
# This demonstrates how to use GopherAgent.createWithApiKey() when installed via npm

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
WORK_DIR="$SCRIPT_DIR/test-project-api"

# SDK version to install (can be overridden via environment variable)
# Note: gopher-orch now uses non-self-contained builds with separate dependency libraries
SDK_VERSION="${SDK_VERSION:-latest}"

# Check for GOPHER_API_KEY
if [ -z "$GOPHER_API_KEY" ]; then
    echo -e "${RED}Error: GOPHER_API_KEY environment variable is not set${NC}"
    echo ""
    echo "Please set your Gopher API key:"
    echo "  export GOPHER_API_KEY=your_api_key_here"
    echo ""
    echo "Get an API key from https://gopher.security"
    exit 1
fi

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Running npm SDK API Key Example${NC}"
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
  "name": "gopher-orch-npm-api-example",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx client_example_api.ts"
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
cp "$SCRIPT_DIR/client_example_api.ts" .

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Run the TypeScript client
echo ""
echo -e "${YELLOW}Running TypeScript client with API key...${NC}"
echo ""

# Run with npm
npm run start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"
echo ""
echo -e "${CYAN}To run this example manually:${NC}"
echo "  1. export GOPHER_API_KEY=your_api_key_here"
echo "  2. npm install gopher-orch"
echo "  3. Copy client_example_api.ts to your project"
echo "  4. Run: npx tsx client_example_api.ts"

exit 0
