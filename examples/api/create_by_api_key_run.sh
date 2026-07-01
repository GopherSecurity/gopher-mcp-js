#!/bin/bash

# Run the TypeScript SDK example for GopherAgent.createWithApiKey
# against the local @gopher.security/gopher-mcp-js checkout.
# Bootstraps a fresh node_modules in
# examples/api/test-project-create-by-api-key/, installs the SDK
# from the local repository, then runs the example via tsx.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$SCRIPT_DIR/test-project-create-by-api-key"
LOCAL_SDK_DIR="${LOCAL_SDK_DIR:-$PROJECT_DIR}"

source "$SCRIPT_DIR/../scripts/node_version_check.sh"
source "$SCRIPT_DIR/../scripts/native_library_path.sh"
require_node_18

detect_local_native_library() {
    local platform lib_name lib_path
    platform="$(uname -s)"
    case "$platform" in
        Darwin) lib_name="libgopher-orch.dylib" ;;
        Linux) lib_name="libgopher-orch.so" ;;
        *) echo -e "${RED}Unsupported platform for this run script: $platform${NC}" >&2; exit 1 ;;
    esac

    resolve_native_library_file "$LOCAL_SDK_DIR" "$lib_name"
}

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}GopherAgent.createWithApiKey example${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

if [ -z "$GOPHER_API_KEY" ]; then
    echo -e "${YELLOW}Warning: GOPHER_API_KEY environment variable is not set${NC}"
    echo -e "${YELLOW}Set it with: export GOPHER_API_KEY=your_api_key${NC}"
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

LOCAL_NATIVE_LIBRARY="$(detect_local_native_library)"

echo -e "${YELLOW}Building local SDK at $LOCAL_SDK_DIR...${NC}"
npm --prefix "$LOCAL_SDK_DIR" run build

cat > package.json << 'EOF'
{
  "name": "@gopher.security/gopher-mcp-js-create-by-api-key-example",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "tsx create_by_api_key.ts"
  },
  "dependencies": {
    "@gopher.security/gopher-mcp-js": "LOCAL_SDK_PLACEHOLDER"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

LOCAL_SDK_PACKAGE="file:$LOCAL_SDK_DIR"
sed -i.bak "s#LOCAL_SDK_PLACEHOLDER#$LOCAL_SDK_PACKAGE#" package.json && rm -f package.json.bak

cp "$SCRIPT_DIR/create_by_api_key.ts" .

echo -e "${YELLOW}Installing @gopher.security/gopher-mcp-js from local checkout...${NC}"
echo -e "${CYAN}Local SDK:     $LOCAL_SDK_DIR${NC}"
echo -e "${CYAN}Native library: $LOCAL_NATIVE_LIBRARY${NC}"
npm install --silent

echo -e "${CYAN}Installed packages:${NC}"
npm ls @gopher.security/gopher-mcp-js || true

echo ""
echo -e "${YELLOW}Running example...${NC}"
echo ""
GOPHER_ORCH_LIBRARY_PATH="$LOCAL_NATIVE_LIBRARY" npm run start -- "$@"

echo ""
echo -e "${GREEN}Example completed${NC}"

exit 0
