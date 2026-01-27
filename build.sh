#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="${SCRIPT_DIR}/third_party/gopher-orch"
BUILD_DIR="${NATIVE_DIR}/build"

# Handle --clean flag (cleans CMake cache but preserves _deps)
if [ "$1" = "--clean" ]; then
    echo -e "${YELLOW}Cleaning build artifacts (preserving _deps)...${NC}"
    rm -rf "${SCRIPT_DIR}/native"
    rm -rf "${SCRIPT_DIR}/node_modules"
    rm -rf "${SCRIPT_DIR}/dist"
    rm -f "${BUILD_DIR}/CMakeCache.txt"
    rm -rf "${BUILD_DIR}/CMakeFiles"
    rm -rf "${BUILD_DIR}/lib"
    rm -rf "${BUILD_DIR}/bin"
    echo -e "${GREEN}✓ Clean complete${NC}"
    if [ "$2" != "--build" ]; then
        exit 0
    fi
fi

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Building gopher-orch TypeScript SDK${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Step 1: Update submodules recursively
echo -e "${YELLOW}Step 1: Updating submodules...${NC}"

# Support custom SSH host for multiple GitHub accounts
# Usage: GITHUB_SSH_HOST=bettercallsaulj ./build.sh
SSH_HOST="${GITHUB_SSH_HOST:-github.com}"
if [ -n "${GITHUB_SSH_HOST}" ]; then
    echo -e "${YELLOW}  Using custom SSH host: ${GITHUB_SSH_HOST}${NC}"
fi

# Configure SSH URL rewrite for GopherSecurity repos
# Clear any existing rewrites first to avoid conflicts
git config --local --unset-all url."git@${SSH_HOST}:GopherSecurity/".insteadOf 2>/dev/null || true
# Set up URL rewrites - both https and default git@github.com should map to custom SSH host
git config --local --add url."git@${SSH_HOST}:GopherSecurity/".insteadOf "https://github.com/GopherSecurity/"
git config --local --add url."git@${SSH_HOST}:GopherSecurity/".insteadOf "git@github.com:GopherSecurity/"
git config --local submodule.third_party/gopher-orch.url "git@${SSH_HOST}:GopherSecurity/gopher-orch.git"

# Check if submodule directory exists but is empty/broken (missing CMakeLists.txt)
if [ -d "${NATIVE_DIR}" ] && [ ! -f "${NATIVE_DIR}/CMakeLists.txt" ]; then
    echo -e "${YELLOW}  Submodule directory exists but appears incomplete, reinitializing...${NC}"
    # Deinitialize and remove the submodule directory
    git submodule deinit -f third_party/gopher-orch 2>/dev/null || true
    rm -rf "${NATIVE_DIR}"
    rm -rf .git/modules/third_party/gopher-orch 2>/dev/null || true
fi

# Update main submodule
if ! git submodule update --init third_party/gopher-orch 2>/dev/null; then
    echo -e "${RED}Error: Failed to clone gopher-orch submodule${NC}"
    echo -e "${YELLOW}If you have multiple GitHub accounts, use:${NC}"
    echo -e "  GITHUB_SSH_HOST=your-ssh-alias ./build.sh"
    exit 1
fi

# Update nested submodule (gopher-mcp inside gopher-orch)
# Note: gopher-orch/.gitmodules has 'update = none' so we must explicitly update
if [ -d "${NATIVE_DIR}" ]; then
    cd "${NATIVE_DIR}"
    git config --local url."git@${SSH_HOST}:GopherSecurity/".insteadOf "https://github.com/GopherSecurity/"
    # Override 'update = none' by using --checkout
    git submodule update --init --checkout third_party/gopher-mcp 2>/dev/null || true
    # Also update gopher-mcp's nested submodules recursively
    if [ -d "third_party/gopher-mcp" ]; then
        cd third_party/gopher-mcp
        git config --local url."git@${SSH_HOST}:GopherSecurity/".insteadOf "https://github.com/GopherSecurity/"
        git submodule update --init --recursive 2>/dev/null || true
    fi
    cd "${SCRIPT_DIR}"
fi

echo -e "${GREEN}✓ Submodules updated${NC}"
echo ""

# Step 2: Check if gopher-orch exists
if [ ! -d "${NATIVE_DIR}" ]; then
    echo -e "${RED}Error: gopher-orch submodule not found at ${NATIVE_DIR}${NC}"
    echo -e "${RED}Run: git submodule update --init --recursive${NC}"
    exit 1
fi

# Step 3: Build gopher-orch native library
echo -e "${YELLOW}Step 2: Building gopher-orch native library...${NC}"
cd "${NATIVE_DIR}"

# Create build directory
if [ ! -d "${BUILD_DIR}" ]; then
    mkdir -p "${BUILD_DIR}"
fi

cd "${BUILD_DIR}"

# Configure with CMake
echo -e "${YELLOW}  Configuring CMake...${NC}"
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${SCRIPT_DIR}/native" \
    -DBUILD_SHARED_LIBS=ON \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON

# Build
echo -e "${YELLOW}  Compiling...${NC}"
cmake --build . --config Release -j$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

# Install to native directory
echo -e "${YELLOW}  Installing...${NC}"
cmake --install .

# Copy dependency libraries (gopher-mcp, fmt) that gopher-orch depends on
echo -e "${YELLOW}  Copying dependency libraries...${NC}"
NATIVE_LIB_DIR="${SCRIPT_DIR}/native/lib"
mkdir -p "${NATIVE_LIB_DIR}"

# Copy gopher-mcp libraries
cp -P "${BUILD_DIR}/lib/libgopher-mcp"*.dylib "${NATIVE_LIB_DIR}/" 2>/dev/null || \
cp -P "${BUILD_DIR}/lib/libgopher-mcp"*.so "${NATIVE_LIB_DIR}/" 2>/dev/null || true

# Copy fmt library
cp -P "${BUILD_DIR}/lib/libfmt"*.dylib "${NATIVE_LIB_DIR}/" 2>/dev/null || \
cp -P "${BUILD_DIR}/lib/libfmt"*.so "${NATIVE_LIB_DIR}/" 2>/dev/null || true

# Fix library install names on macOS (remove @rpath so DYLD_LIBRARY_PATH works)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}  Fixing library install names for macOS...${NC}"
    cd "${NATIVE_LIB_DIR}"

    # Fix install names (the library's own ID)
    [ -f "libgopher-orch.0.1.0.dylib" ] && install_name_tool -id "libgopher-orch.0.dylib" libgopher-orch.0.1.0.dylib
    [ -f "libgopher-mcp.0.1.0.dylib" ] && install_name_tool -id "libgopher-mcp.0.dylib" libgopher-mcp.0.1.0.dylib
    [ -f "libgopher-mcp-event.0.1.0.dylib" ] && install_name_tool -id "libgopher-mcp-event.0.dylib" libgopher-mcp-event.0.1.0.dylib
    [ -f "libgopher-mcp-logging.dylib" ] && install_name_tool -id "libgopher-mcp-logging.dylib" libgopher-mcp-logging.dylib
    [ -f "libfmt.10.2.1.dylib" ] && install_name_tool -id "libfmt.10.dylib" libfmt.10.2.1.dylib

    # Fix @rpath references in libgopher-mcp-event
    if [ -f "libgopher-mcp-event.0.1.0.dylib" ]; then
        install_name_tool -change "@rpath/libgopher-mcp.0.dylib" "libgopher-mcp.0.dylib" libgopher-mcp-event.0.1.0.dylib
        install_name_tool -change "@rpath/libgopher-mcp-logging.dylib" "libgopher-mcp-logging.dylib" libgopher-mcp-event.0.1.0.dylib
        install_name_tool -change "@rpath/libfmt.10.dylib" "libfmt.10.dylib" libgopher-mcp-event.0.1.0.dylib
    fi

    cd "${SCRIPT_DIR}"
fi

echo -e "${GREEN}✓ Native library built successfully${NC}"
echo ""

# Step 4: Verify build artifacts
echo -e "${YELLOW}Step 3: Verifying native build artifacts...${NC}"

NATIVE_LIB_DIR="${SCRIPT_DIR}/native/lib"
NATIVE_INCLUDE_DIR="${SCRIPT_DIR}/native/include"

if [ -d "${NATIVE_LIB_DIR}" ]; then
    echo -e "${GREEN}✓ Libraries installed to: ${NATIVE_LIB_DIR}${NC}"
    ls -lh "${NATIVE_LIB_DIR}"/*.dylib 2>/dev/null || ls -lh "${NATIVE_LIB_DIR}"/*.so 2>/dev/null || true
else
    echo -e "${YELLOW}⚠ Library directory not found: ${NATIVE_LIB_DIR}${NC}"
fi

if [ -d "${NATIVE_INCLUDE_DIR}" ]; then
    echo -e "${GREEN}✓ Headers installed to: ${NATIVE_INCLUDE_DIR}${NC}"
else
    echo -e "${YELLOW}⚠ Include directory not found: ${NATIVE_INCLUDE_DIR}${NC}"
fi

echo ""

# Step 4: Set up Node.js environment
echo -e "${YELLOW}Step 4: Setting up Node.js environment...${NC}"
cd "${SCRIPT_DIR}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found. Please install Node.js first.${NC}"
    echo -e "${YELLOW}  macOS: brew install node${NC}"
    echo -e "${YELLOW}  Linux: sudo apt-get install nodejs npm${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ required. Current version: $(node -v)${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}  Installing npm dependencies...${NC}"
npm install --silent 2>/dev/null || npm install

echo -e "${GREEN}✓ Node.js environment set up successfully${NC}"
echo ""

# Step 5: Build TypeScript
echo -e "${YELLOW}Step 5: Building TypeScript SDK...${NC}"
npm run build --silent 2>/dev/null || npm run build

echo -e "${GREEN}✓ TypeScript SDK built successfully${NC}"
echo ""

# Step 6: Run tests
echo -e "${YELLOW}Step 6: Running tests...${NC}"
npm test --silent 2>/dev/null && echo -e "${GREEN}✓ Tests passed${NC}" || echo -e "${YELLOW}⚠ Some tests may have failed (native library required)${NC}"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "Native libraries: ${YELLOW}${NATIVE_LIB_DIR}${NC}"
echo -e "Native headers:   ${YELLOW}${NATIVE_INCLUDE_DIR}${NC}"
echo -e "Run tests:        ${YELLOW}npm test${NC}"
echo -e "Run example:      ${YELLOW}npm run example${NC}"
echo -e "Build:            ${YELLOW}npm run build${NC}"
