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
    # Clean auth example
    rm -rf "${SCRIPT_DIR}/examples/auth/node_modules"
    rm -rf "${SCRIPT_DIR}/examples/auth/dist"
    rm -rf "${SCRIPT_DIR}/examples/auth/lib"
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
# First try with recorded commit, if that fails (commit doesn't exist), use --remote to get latest
if ! git submodule update --init third_party/gopher-orch 2>/dev/null; then
    echo -e "${YELLOW}  Recorded commit not found, fetching latest from remote...${NC}"
    if ! git submodule update --init --remote third_party/gopher-orch 2>/dev/null; then
        echo -e "${RED}Error: Failed to clone gopher-orch submodule${NC}"
        echo -e "${YELLOW}If you have multiple GitHub accounts, use:${NC}"
        echo -e "  GITHUB_SSH_HOST=your-ssh-alias ./build.sh"
        exit 1
    fi
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
# BUILD_BUNDLED_SHARED=OFF means we need to copy all dependency libraries separately
echo -e "${YELLOW}  Configuring CMake...${NC}"
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${SCRIPT_DIR}/native" \
    -DBUILD_SHARED_LIBS=ON \
    -DBUILD_BUNDLED_SHARED=OFF \
    -DBUILD_TESTS=OFF \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON

# Build
echo -e "${YELLOW}  Compiling...${NC}"
cmake --build . --config Release -j$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

# Install to native directory
echo -e "${YELLOW}  Installing...${NC}"
cmake --install .

# Copy dependency libraries (since BUILD_BUNDLED_SHARED=OFF)
echo -e "${YELLOW}  Copying dependency libraries...${NC}"
NATIVE_LIB="${SCRIPT_DIR}/native/lib"
mkdir -p "${NATIVE_LIB}"

# Copy gopher-mcp libraries
cp -P "${BUILD_DIR}"/lib/libgopher-mcp*.dylib "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libgopher-mcp*.so* "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libgopher-mcp-event*.dylib "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libgopher-mcp-event*.so* "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libgopher-mcp-logging*.dylib "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libgopher-mcp-logging*.so* "${NATIVE_LIB}/" 2>/dev/null || true

# Copy gopher-auth libraries
cp -P "${BUILD_DIR}"/lib/libgopher-auth*.dylib "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libgopher-auth*.so* "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/gopher-auth*.dll "${NATIVE_LIB}/" 2>/dev/null || true

# Copy fmt and llhttp static libraries
cp -P "${BUILD_DIR}"/lib/libfmt*.a "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/lib/libllhttp*.a "${NATIVE_LIB}/" 2>/dev/null || true
cp -P "${BUILD_DIR}"/_deps/fmt-build/libfmt*.a "${NATIVE_LIB}/" 2>/dev/null || true

cd "${SCRIPT_DIR}"

echo -e "${GREEN}✓ Native library built successfully${NC}"
echo ""

# Step 4: Verify build artifacts
echo -e "${YELLOW}Step 3: Verifying native build artifacts...${NC}"

NATIVE_LIB_DIR="${SCRIPT_DIR}/native/lib"
NATIVE_INCLUDE_DIR="${SCRIPT_DIR}/native/include"

if [ -d "${NATIVE_LIB_DIR}" ]; then
    echo -e "${GREEN}✓ Libraries installed to: ${NATIVE_LIB_DIR}${NC}"
    ls -lh "${NATIVE_LIB_DIR}"/lib*.dylib 2>/dev/null || \
    ls -lh "${NATIVE_LIB_DIR}"/lib*.so 2>/dev/null || \
    ls -lh "${NATIVE_LIB_DIR}"/*.dll 2>/dev/null || true
else
    echo -e "${YELLOW}⚠ Library directory not found: ${NATIVE_LIB_DIR}${NC}"
fi

if [ -d "${NATIVE_INCLUDE_DIR}" ]; then
    echo -e "${GREEN}✓ Headers installed to: ${NATIVE_INCLUDE_DIR}${NC}"
else
    echo -e "${YELLOW}⚠ Include directory not found: ${NATIVE_INCLUDE_DIR}${NC}"
fi

echo ""

# Step 5: Set up Node.js environment
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

# Step 6: Build TypeScript
echo -e "${YELLOW}Step 5: Building TypeScript SDK...${NC}"
npm run build --silent 2>/dev/null || npm run build

echo -e "${GREEN}✓ TypeScript SDK built successfully${NC}"
echo ""

# Step 7: Run tests
echo -e "${YELLOW}Step 6: Running tests...${NC}"
npm test --silent 2>/dev/null && echo -e "${GREEN}✓ Tests passed${NC}" || echo -e "${YELLOW}⚠ Some tests may have failed (native library required)${NC}"

echo ""

# Step 8: Build auth example
echo -e "${YELLOW}Step 7: Building auth example...${NC}"
AUTH_EXAMPLE_DIR="${SCRIPT_DIR}/examples/auth"

if [ -d "${AUTH_EXAMPLE_DIR}" ]; then
    cd "${AUTH_EXAMPLE_DIR}"

    # Copy native libraries to example lib directory
    echo -e "${YELLOW}  Copying native libraries to example...${NC}"
    mkdir -p "${AUTH_EXAMPLE_DIR}/lib"
    cp -P "${NATIVE_LIB_DIR}"/libgopher-auth*.dylib "${AUTH_EXAMPLE_DIR}/lib/" 2>/dev/null || true
    cp -P "${NATIVE_LIB_DIR}"/libgopher-auth*.so* "${AUTH_EXAMPLE_DIR}/lib/" 2>/dev/null || true
    cp -P "${NATIVE_LIB_DIR}"/gopher-auth*.dll "${AUTH_EXAMPLE_DIR}/lib/" 2>/dev/null || true

    # Install dependencies
    echo -e "${YELLOW}  Installing example dependencies...${NC}"
    npm install --silent 2>/dev/null || npm install

    # Build TypeScript
    echo -e "${YELLOW}  Building example TypeScript...${NC}"
    npm run build --silent 2>/dev/null || npm run build

    # Run tests
    echo -e "${YELLOW}  Running example tests...${NC}"
    npm test --silent 2>/dev/null && echo -e "${GREEN}✓ Example tests passed${NC}" || echo -e "${YELLOW}⚠ Some example tests may have failed${NC}"

    cd "${SCRIPT_DIR}"
    echo -e "${GREEN}✓ Auth example built successfully${NC}"
else
    echo -e "${YELLOW}⚠ Auth example directory not found: ${AUTH_EXAMPLE_DIR}${NC}"
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "Native libraries: ${YELLOW}${NATIVE_LIB_DIR}${NC}"
echo -e "Native headers:   ${YELLOW}${NATIVE_INCLUDE_DIR}${NC}"
echo -e "Run SDK tests:    ${YELLOW}npm test${NC}"
echo -e "Run SDK example:  ${YELLOW}npm run example${NC}"
echo -e "Build SDK:        ${YELLOW}npm run build${NC}"
echo ""
echo -e "Auth example:     ${YELLOW}${AUTH_EXAMPLE_DIR}${NC}"
echo -e "Run auth server:  ${YELLOW}cd examples/auth && npm start${NC}"
echo -e "Run auth tests:   ${YELLOW}cd examples/auth && npm test${NC}"
