#!/bin/bash -x

# Build script for gopher-orch with submodule support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== gopher-orch Build Script ===${NC}"

# Parse arguments
BUILD_TYPE="${BUILD_TYPE:-Debug}"
BUILD_DIR="${BUILD_DIR:-build}"
USE_SUBMODULE=ON
BUILD_TESTS=ON
BUILD_EXAMPLES=ON
BUILD_GOPHER_MCP=ON

for arg in "$@"; do
    case $arg in
        --release)
            BUILD_TYPE=Release
            shift
            ;;
        --no-submodule)
            USE_SUBMODULE=OFF
            shift
            ;;
        --no-tests)
            BUILD_TESTS=OFF
            shift
            ;;
        --no-examples)
            BUILD_EXAMPLES=OFF
            shift
            ;;
        --no-gopher-mcp)
            BUILD_GOPHER_MCP=OFF
            shift
            ;;
        --build-gopher-mcp)
            BUILD_GOPHER_MCP=ON
            shift
            ;;
        --standalone)
            # Build without gopher-mcp for testing
            USE_SUBMODULE=OFF
            BUILD_WITHOUT_MCP=ON
            BUILD_GOPHER_MCP=OFF
            shift
            ;;
        --clean)
            echo -e "${YELLOW}Cleaning build directory...${NC}"
            rm -rf "$BUILD_DIR"
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --release        Build in Release mode (default: Debug)"
            echo "  --no-submodule   Use system gopher-mcp instead of submodule"
            echo "  --no-tests       Don't build tests"
            echo "  --no-examples    Don't build examples"
            echo "  --build-gopher-mcp Build gopher-mcp submodule (default: ON)"
            echo "  --no-gopher-mcp  Don't build gopher-mcp submodule"
            echo "  --standalone     Build without gopher-mcp dependency"
            echo "  --clean          Clean build directory before building"
            echo "  --help           Show this help message"
            exit 0
            ;;
    esac
done

# Initialize submodule if needed
if [ "$USE_SUBMODULE" = "ON" ] && [ "${BUILD_WITHOUT_MCP:-OFF}" = "OFF" ]; then
    if [ ! -f "third_party/gopher-mcp/CMakeLists.txt" ]; then
        echo -e "${YELLOW}Initializing gopher-mcp submodule...${NC}"
        git submodule update --init --recursive third_party/gopher-mcp
    else
        echo -e "${GREEN}gopher-mcp submodule already initialized${NC}"
    fi
    
    # Build gopher-mcp if requested
    if [ "$BUILD_GOPHER_MCP" = "ON" ]; then
        echo -e "${BLUE}Building gopher-mcp submodule...${NC}"
        GOPHER_MCP_BUILD_DIR="third_party/gopher-mcp/build"
        
        # Create build directory for gopher-mcp
        mkdir -p "$GOPHER_MCP_BUILD_DIR"
        
        # Configure gopher-mcp
        echo -e "${YELLOW}Configuring gopher-mcp...${NC}"
        cmake -B "$GOPHER_MCP_BUILD_DIR" -S "third_party/gopher-mcp" \
            -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
            -DBUILD_TESTS=OFF \
            -DBUILD_EXAMPLES=OFF
        
        # Build gopher-mcp
        echo -e "${YELLOW}Building gopher-mcp...${NC}"
        cmake --build "$GOPHER_MCP_BUILD_DIR" -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
        
        echo -e "${GREEN}gopher-mcp built successfully${NC}"
    else
        echo -e "${YELLOW}Skipping gopher-mcp build (--no-gopher-mcp specified)${NC}"
    fi
fi

# Create build directory
mkdir -p "$BUILD_DIR"

# Configure
echo -e "${BLUE}Configuring with CMake...${NC}"
echo "  Build type: $BUILD_TYPE"
echo "  Use submodule: $USE_SUBMODULE"
echo "  Build tests: $BUILD_TESTS"
echo "  Build examples: $BUILD_EXAMPLES"
echo "  Build gopher-mcp: $BUILD_GOPHER_MCP"

CMAKE_ARGS=(
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
    -DUSE_SUBMODULE_GOPHER_MCP="$USE_SUBMODULE"
    -DBUILD_TESTS="$BUILD_TESTS"
    -DBUILD_EXAMPLES="$BUILD_EXAMPLES"
)

# If we pre-built gopher-mcp, tell CMake where to find it
if [ "$BUILD_GOPHER_MCP" = "ON" ] && [ "$USE_SUBMODULE" = "ON" ] && [ -d "third_party/gopher-mcp/build" ]; then
    CMAKE_ARGS+=(-Dgopher-mcp_DIR="${PWD}/third_party/gopher-mcp/build")
    echo -e "${GREEN}Using pre-built gopher-mcp from: ${PWD}/third_party/gopher-mcp/build${NC}"
fi

if [ "${BUILD_WITHOUT_MCP:-OFF}" = "ON" ]; then
    CMAKE_ARGS+=(-DBUILD_WITHOUT_GOPHER_MCP=ON)
    echo -e "${YELLOW}Building without gopher-mcp dependency (standalone mode)${NC}"
fi

cmake -B "$BUILD_DIR" -S . "${CMAKE_ARGS[@]}"

# Build
echo -e "${BLUE}Building...${NC}"
cmake --build "$BUILD_DIR" -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo -e "${GREEN}Build completed successfully!${NC}"

# Run tests if built
if [ "$BUILD_TESTS" = "ON" ]; then
    echo -e "${BLUE}Running tests...${NC}"
    (cd "$BUILD_DIR" && ctest --output-on-failure) || {
        echo -e "${RED}Some tests failed${NC}"
        exit 1
    }
    echo -e "${GREEN}All tests passed!${NC}"
fi

# Show example usage
if [ "$BUILD_EXAMPLES" = "ON" ] && [ -f "$BUILD_DIR/bin/hello_world_example" ]; then
    echo -e "${BLUE}Example built:${NC}"
    echo "  Run: ./$BUILD_DIR/bin/hello_world_example"
fi

echo -e "${GREEN}=== Build Complete ===${NC}"
