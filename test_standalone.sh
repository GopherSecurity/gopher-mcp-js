#!/bin/bash

# Build and test gopher-orch in standalone mode (without gopher-mcp dependency)
# This script uses the dispatcher abstraction layer for testing

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BUILD_DIR="build_standalone"
BUILD_TYPE="Debug"
PARALLEL_JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  gopher-orch Standalone Build & Test  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    local missing_tools=()
    
    # Check for cmake
    if ! command -v cmake &> /dev/null; then
        missing_tools+=("cmake")
    else
        echo -e "  ${GREEN}✓${NC} cmake found: $(cmake --version | head -n1)"
    fi
    
    # Check for make
    if ! command -v make &> /dev/null; then
        missing_tools+=("make")
    else
        echo -e "  ${GREEN}✓${NC} make found"
    fi
    
    # Check for g++ or clang++
    if command -v g++ &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} g++ found: $(g++ --version | head -n1)"
    elif command -v clang++ &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} clang++ found: $(clang++ --version | head -n1)"
    else
        missing_tools+=("C++ compiler (g++ or clang++)")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        echo -e "${RED}ERROR: Missing required tools:${NC}"
        for tool in "${missing_tools[@]}"; do
            echo -e "  ${RED}✗${NC} $tool"
        done
        exit 1
    fi
    
    echo ""
}

# Function to clean build directory
clean_build() {
    echo -e "${YELLOW}Cleaning build directory...${NC}"
    if [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
        echo -e "  ${GREEN}✓${NC} Removed existing $BUILD_DIR"
    fi
    mkdir -p "$BUILD_DIR"
    echo -e "  ${GREEN}✓${NC} Created fresh $BUILD_DIR"
    echo ""
}

# Function to configure with CMake
configure_cmake() {
    echo -e "${YELLOW}Configuring with CMake...${NC}"
    echo -e "  Build type: ${BLUE}$BUILD_TYPE${NC}"
    echo -e "  Build mode: ${BLUE}Standalone (without gopher-mcp)${NC}"
    echo ""
    
    cd "$BUILD_DIR"
    
    if cmake .. \
        -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
        -DBUILD_TESTS=ON \
        -DBUILD_EXAMPLES=ON \
        -DBUILD_WITHOUT_GOPHER_MCP=ON \
        -DUSE_SUBMODULE_GOPHER_MCP=OFF \
        -DCMAKE_EXPORT_COMPILE_COMMANDS=ON; then
        echo -e "${GREEN}✓ Configuration successful${NC}"
    else
        echo -e "${RED}✗ Configuration failed${NC}"
        exit 1
    fi
    
    cd ..
    echo ""
}

# Function to build the project
build_project() {
    echo -e "${YELLOW}Building project...${NC}"
    echo -e "  Using ${BLUE}$PARALLEL_JOBS${NC} parallel jobs"
    echo ""
    
    cd "$BUILD_DIR"
    
    if make -j"$PARALLEL_JOBS"; then
        echo -e "${GREEN}✓ Build successful${NC}"
    else
        echo -e "${RED}✗ Build failed${NC}"
        exit 1
    fi
    
    cd ..
    echo ""
}

# Function to check built artifacts
check_artifacts() {
    echo -e "${YELLOW}Checking built artifacts...${NC}"
    
    local test_executables=(
        "hello_test"
        "orch_framework_test"
        "ffi_test"
        "gopher-orch-tests"
    )
    
    local all_found=true
    
    for test_exe in "${test_executables[@]}"; do
        if [ -f "$BUILD_DIR/bin/$test_exe" ]; then
            echo -e "  ${GREEN}✓${NC} $test_exe"
        else
            echo -e "  ${RED}✗${NC} $test_exe not found"
            all_found=false
        fi
    done
    
    # Check libraries
    if [ -f "$BUILD_DIR/lib/libgopher-orch.a" ] || [ -f "$BUILD_DIR/lib/libgopher-orch.so" ] || [ -f "$BUILD_DIR/lib/libgopher-orch.dylib" ]; then
        echo -e "  ${GREEN}✓${NC} gopher-orch library"
    else
        echo -e "  ${RED}✗${NC} gopher-orch library not found"
        all_found=false
    fi
    
    if [ "$all_found" = false ]; then
        echo -e "${YELLOW}Warning: Some artifacts were not built${NC}"
    fi
    
    echo ""
}

# Function to run tests
run_tests() {
    echo -e "${YELLOW}Running unit tests...${NC}"
    echo ""
    
    cd "$BUILD_DIR"
    
    # Run tests with CTest
    if command -v ctest &> /dev/null; then
        echo -e "${BLUE}Running tests with CTest...${NC}"
        if ctest --output-on-failure -V; then
            echo -e "${GREEN}✓ All tests passed${NC}"
            test_result=0
        else
            echo -e "${RED}✗ Some tests failed${NC}"
            test_result=1
        fi
    else
        # Fallback: run test executables directly
        echo -e "${BLUE}Running test executables directly...${NC}"
        test_result=0
        
        for test_exe in bin/*test*; do
            if [ -f "$test_exe" ]; then
                test_name=$(basename "$test_exe")
                echo -e "${BLUE}Running $test_name...${NC}"
                if "./$test_exe"; then
                    echo -e "  ${GREEN}✓${NC} $test_name passed"
                else
                    echo -e "  ${RED}✗${NC} $test_name failed"
                    test_result=1
                fi
            fi
        done
    fi
    
    cd ..
    echo ""
    
    return $test_result
}

# Function to print summary
print_summary() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}             Summary                    ${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ Build: Successful${NC}"
        echo -e "${GREEN}✓ Tests: All passed${NC}"
        echo ""
        echo -e "${GREEN}Success! gopher-orch built and tested in standalone mode.${NC}"
        echo ""
        echo "Test executables are available in: $BUILD_DIR/bin/"
        echo "Libraries are available in: $BUILD_DIR/lib/"
    else
        echo -e "${GREEN}✓ Build: Successful${NC}"
        echo -e "${RED}✗ Tests: Some failures${NC}"
        echo ""
        echo -e "${YELLOW}Build succeeded but some tests failed.${NC}"
        echo "Check the output above for details."
    fi
    echo ""
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --clean          Clean build directory before building"
    echo "  --release        Build in Release mode (default: Debug)"
    echo "  --skip-tests     Skip running tests"
    echo "  --verbose        Enable verbose output"
    echo "  --help           Show this help message"
    echo ""
    echo "This script builds gopher-orch without the gopher-mcp dependency"
    echo "and runs all unit tests using the standalone dispatcher implementation."
}

# Parse command line arguments
CLEAN_BUILD=false
SKIP_TESTS=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --release)
            BUILD_TYPE="Release"
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            set -x  # Enable bash debug output
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    # Check prerequisites
    check_prerequisites
    
    # Clean if requested or if build directory doesn't exist
    if [ "$CLEAN_BUILD" = true ] || [ ! -d "$BUILD_DIR" ]; then
        clean_build
    fi
    
    # Configure if needed
    if [ ! -f "$BUILD_DIR/CMakeCache.txt" ]; then
        configure_cmake
    else
        echo -e "${YELLOW}Using existing CMake configuration${NC}"
        echo ""
    fi
    
    # Build
    build_project
    
    # Check artifacts
    check_artifacts
    
    # Run tests unless skipped
    if [ "$SKIP_TESTS" = false ]; then
        if run_tests; then
            print_summary 0
            exit 0
        else
            print_summary 1
            exit 1
        fi
    else
        echo -e "${YELLOW}Tests skipped as requested${NC}"
        print_summary 0
        exit 0
    fi
}

# Run main function
main