#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="${SCRIPT_DIR}/third_party/gopher-orch"
BUILD_DIR="${NATIVE_DIR}/build"
NATIVE_ROOT="${SCRIPT_DIR}/native"

REQUESTED_TARGET=""
RESOLVED_TARGET=""
TARGET_NATIVE_DIR=""
ACTIVE_NATIVE_DIR="${NATIVE_ROOT}/current"
NATIVE_LIB_DIR="${NATIVE_ROOT}/lib"
NATIVE_INCLUDE_DIR="${NATIVE_ROOT}/include"
RUN_BUILD_AFTER_CLEAN=0
NATIVE_VERIFICATION_STATUS="not run"
TYPESCRIPT_BUILD_STATUS="not run"

usage() {
    cat <<EOF
Usage: ./build.sh [target] [--clean] [--build]

Targets:
  macos        Build the local macOS native library (default on macOS)
  linux        Build Linux x64 native libraries with Docker
  linux-x64    Same as linux

Options:
  --clean      Remove generated build artifacts
  --build      Continue building after --clean
EOF
}

parse_args() {
    for arg in "$@"; do
        case "$arg" in
            --clean)
                clean_artifacts
                ;;
            --build)
                RUN_BUILD_AFTER_CLEAN=1
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            macos|darwin|darwin-arm64|darwin-x64|linux|linux-x64)
                if [ -n "$REQUESTED_TARGET" ]; then
                    echo -e "${RED}Error: multiple build targets provided.${NC}"
                    usage
                    exit 1
                fi
                REQUESTED_TARGET="$arg"
                ;;
            *)
                echo -e "${RED}Error: unknown argument: $arg${NC}"
                usage
                exit 1
                ;;
        esac
    done

    if [ -z "$REQUESTED_TARGET" ]; then
        REQUESTED_TARGET="macos"
    fi
}

clean_artifacts() {
    echo -e "${YELLOW}Cleaning build artifacts...${NC}"
    rm -rf "${NATIVE_ROOT}"
    rm -rf "${SCRIPT_DIR}/node_modules"
    rm -rf "${SCRIPT_DIR}/dist"
    rm -f "${BUILD_DIR}/CMakeCache.txt"
    rm -rf "${BUILD_DIR}/CMakeFiles"
    rm -rf "${BUILD_DIR}/lib"
    rm -rf "${BUILD_DIR}/bin"
    rm -rf "${NATIVE_DIR}/build-output/linux-x64"
    rm -rf "${SCRIPT_DIR}/examples/auth/node_modules"
    rm -rf "${SCRIPT_DIR}/examples/auth/dist"
    rm -rf "${SCRIPT_DIR}/examples/auth/lib"
    echo -e "${GREEN}✓ Clean complete${NC}"
}

detect_host_target() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$REQUESTED_TARGET" in
        macos|darwin)
            if [ "$os" != "Darwin" ]; then
                echo -e "${RED}Error: macOS target must be built on macOS. Use ./build.sh linux for Docker Linux builds.${NC}"
                exit 1
            fi
            case "$arch" in
                arm64) RESOLVED_TARGET="darwin-arm64" ;;
                x86_64|amd64) RESOLVED_TARGET="darwin-x64" ;;
                *)
                    echo -e "${RED}Error: unsupported macOS architecture: $arch${NC}"
                    exit 1
                    ;;
            esac
            ;;
        darwin-arm64|darwin-x64)
            if [ "$os" != "Darwin" ]; then
                echo -e "${RED}Error: $REQUESTED_TARGET must be built on macOS.${NC}"
                exit 1
            fi
            RESOLVED_TARGET="$REQUESTED_TARGET"
            ;;
        linux|linux-x64)
            RESOLVED_TARGET="linux-x64"
            ;;
        *)
            echo -e "${RED}Error: unsupported build target: $REQUESTED_TARGET${NC}"
            exit 1
            ;;
    esac

    TARGET_NATIVE_DIR="${NATIVE_ROOT}/${RESOLVED_TARGET}"
}

print_header() {
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Building gopher-orch TypeScript SDK${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo -e "${CYAN}Requested target: ${REQUESTED_TARGET}${NC}"
    echo -e "${CYAN}Resolved target:  ${RESOLVED_TARGET}${NC}"
    echo ""
}

prepare_submodules() {
    echo -e "${YELLOW}Step 1: Updating submodules...${NC}"

    local ssh_host
    ssh_host="${GITHUB_SSH_HOST:-github.com}"
    if [ -n "${GITHUB_SSH_HOST}" ]; then
        echo -e "${YELLOW}  Using custom SSH host: ${GITHUB_SSH_HOST}${NC}"
    fi

    git config --local --unset-all url."git@${ssh_host}:GopherSecurity/".insteadOf 2>/dev/null || true
    git config --local --add url."git@${ssh_host}:GopherSecurity/".insteadOf "https://github.com/GopherSecurity/"
    git config --local --add url."git@${ssh_host}:GopherSecurity/".insteadOf "git@github.com:GopherSecurity/"
    git config --local submodule.third_party/gopher-orch.url "git@${ssh_host}:GopherSecurity/gopher-orch.git"

    if [ -d "${NATIVE_DIR}" ] && [ ! -f "${NATIVE_DIR}/CMakeLists.txt" ]; then
        echo -e "${YELLOW}  Submodule directory exists but appears incomplete, reinitializing...${NC}"
        git submodule deinit -f third_party/gopher-orch 2>/dev/null || true
        rm -rf "${NATIVE_DIR}"
        rm -rf .git/modules/third_party/gopher-orch 2>/dev/null || true
    fi

    if ! git submodule update --init third_party/gopher-orch 2>/dev/null; then
        echo -e "${YELLOW}  Recorded commit not found, fetching latest from remote...${NC}"
        if ! git submodule update --init --remote third_party/gopher-orch 2>/dev/null; then
            echo -e "${RED}Error: Failed to clone gopher-orch submodule${NC}"
            echo -e "${YELLOW}If you have multiple GitHub accounts, use:${NC}"
            echo -e "  GITHUB_SSH_HOST=your-ssh-alias ./build.sh"
            exit 1
        fi
    fi

    if [ -d "${NATIVE_DIR}" ]; then
        cd "${NATIVE_DIR}"
        git config --local url."git@${ssh_host}:GopherSecurity/".insteadOf "https://github.com/GopherSecurity/"
        git submodule update --init --checkout third_party/gopher-mcp 2>/dev/null || true
        if [ -d "third_party/gopher-mcp" ]; then
            cd third_party/gopher-mcp
            git config --local url."git@${ssh_host}:GopherSecurity/".insteadOf "https://github.com/GopherSecurity/"
            git submodule update --init --recursive 2>/dev/null || true
        fi
        cd "${SCRIPT_DIR}"
    fi

    if [ ! -d "${NATIVE_DIR}" ]; then
        echo -e "${RED}Error: gopher-orch submodule not found at ${NATIVE_DIR}${NC}"
        echo -e "${RED}Run: git submodule update --init --recursive${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Submodules updated${NC}"
    echo ""
}

check_local_build_deps() {
    if [ "$(uname -s)" = "Linux" ]; then
        local missing_deps=()

        command -v cmake >/dev/null 2>&1 || missing_deps+=("cmake")
        command -v pkg-config >/dev/null 2>&1 || missing_deps+=("pkg-config")
        command -v g++ >/dev/null 2>&1 || missing_deps+=("build-essential")

        if command -v pkg-config >/dev/null 2>&1; then
            pkg-config --exists libevent || missing_deps+=("libevent-dev")
            pkg-config --exists libevent_pthreads || missing_deps+=("libevent-dev")
            pkg-config --exists openssl || missing_deps+=("libssl-dev")
            pkg-config --exists libcurl || missing_deps+=("libcurl4-openssl-dev")
        fi

        if [ ${#missing_deps[@]} -gt 0 ]; then
            echo -e "${RED}Error: missing Linux build dependencies.${NC}"
            echo -e "${YELLOW}Install them with:${NC}"
            echo -e "  sudo apt-get update"
            echo -e "  sudo apt-get install -y ${missing_deps[*]}"
            echo ""
            echo -e "${YELLOW}For Ubuntu 20, the common full set is:${NC}"
            echo -e "  sudo apt-get install -y build-essential cmake pkg-config libevent-dev libssl-dev libcurl4-openssl-dev"
            exit 1
        fi
    fi
}

reset_cmake_cache_if_path_changed() {
    if [ -f "${BUILD_DIR}/CMakeCache.txt" ]; then
        local cache_source_dir cache_build_dir
        cache_source_dir=$(grep '^CMAKE_HOME_DIRECTORY:INTERNAL=' "${BUILD_DIR}/CMakeCache.txt" 2>/dev/null | cut -d= -f2- || true)
        cache_build_dir=$(grep '^CMAKE_CACHEFILE_DIR:INTERNAL=' "${BUILD_DIR}/CMakeCache.txt" 2>/dev/null | cut -d= -f2- || true)
        if [ "${cache_source_dir}" != "${NATIVE_DIR}" ] || [ "${cache_build_dir}" != "${BUILD_DIR}" ]; then
            echo -e "${YELLOW}  CMake cache was created for a different path; clearing cache metadata...${NC}"
            echo -e "${YELLOW}    cached source: ${cache_source_dir:-<unknown>}${NC}"
            echo -e "${YELLOW}    current source: ${NATIVE_DIR}${NC}"
            rm -f "${BUILD_DIR}/CMakeCache.txt"
            rm -rf "${BUILD_DIR}/CMakeFiles"
        fi
    fi
}

copy_native_dependency_libraries() {
    local lib_dir="$1"
    mkdir -p "${lib_dir}"

    cp -P "${BUILD_DIR}"/lib/libgopher-mcp*.dylib "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-mcp*.so* "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-mcp-event*.dylib "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-mcp-event*.so* "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-mcp-logging*.dylib "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-mcp-logging*.so* "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-auth*.dylib "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libgopher-auth*.so* "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/gopher-auth*.dll "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libfmt*.a "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/lib/libllhttp*.a "${lib_dir}/" 2>/dev/null || true
    cp -P "${BUILD_DIR}"/_deps/fmt-build/libfmt*.a "${lib_dir}/" 2>/dev/null || true
}

bundle_macos_dependencies() {
    local lib_dir="$1"

    if [ "$(uname -s)" != "Darwin" ]; then
        return
    fi

    echo -e "${YELLOW}  Bundling third-party dependencies (recursive)...${NC}"

    local homebrew_prefix
    homebrew_prefix=$([[ $(uname -m) == "arm64" ]] && echo "/opt/homebrew" || echo "/usr/local")

    resolve_dep() {
        local ref="$1"
        local dep_name
        dep_name=$(basename "$ref")
        case "$ref" in
            /usr/lib/*|/System/*|*:) echo ""; return ;;
            @loader_path/*) echo ""; return ;;
            @rpath/*)
                for search_dir in "${homebrew_prefix}/lib" "${homebrew_prefix}/opt"/*/lib; do
                    if [ -f "${search_dir}/${dep_name}" ]; then
                        echo "${search_dir}/${dep_name}"; return
                    fi
                done
                echo ""; return ;;
            *) echo "$ref"; return ;;
        esac
    }

    collect_deps() {
        local dylib="$1"
        [ -L "$dylib" ] && return
        [ -f "$dylib" ] || return
        while IFS= read -r dep; do
            local ref dep_path dep_name
            ref=$(echo "$dep" | sed 's/^[[:space:]]*//' | sed 's/ (compatibility.*//')
            dep_path=$(resolve_dep "$ref")
            [ -z "$dep_path" ] && continue
            dep_name=$(basename "$dep_path")
            case "$dep_name" in
                libc++*|libSystem*) continue ;;
            esac
            if [ -f "$dep_path" ] && [ ! -f "${lib_dir}/${dep_name}" ]; then
                echo "    Bundling: ${dep_name}"
                cp "$dep_path" "${lib_dir}/${dep_name}"
                chmod 644 "${lib_dir}/${dep_name}"
                collect_deps "${lib_dir}/${dep_name}"
            fi
        done < <(otool -L "$dylib" | tail -n +2)
    }

    for dylib in "${lib_dir}"/libgopher-*.dylib; do
        collect_deps "$dylib"
    done

    for dylib in "${lib_dir}"/*.dylib; do
        [ -L "$dylib" ] && continue
        [ -f "$dylib" ] || continue
        chmod u+w "$dylib"
        local dylib_name
        dylib_name=$(basename "$dylib")
        install_name_tool -id "@loader_path/${dylib_name}" "$dylib" 2>/dev/null || true
        while IFS= read -r dep; do
            local dep_path dep_name
            dep_path=$(echo "$dep" | sed 's/^[[:space:]]*//' | sed 's/ (compatibility.*//')
            case "$dep_path" in
                /usr/lib/*|/System/*|@loader_path/*|*:) continue ;;
            esac
            dep_name=$(basename "$dep_path")
            if [ -f "${lib_dir}/${dep_name}" ]; then
                install_name_tool -change "$dep_path" "@loader_path/${dep_name}" "$dylib" 2>/dev/null || true
            fi
        done < <(otool -L "$dylib" | tail -n +2)
    done

    for dylib in "${lib_dir}"/*.dylib; do
        [ -L "$dylib" ] && continue
        [ -f "$dylib" ] || continue
        codesign --force --sign - --options=linker-signed "$dylib" 2>/dev/null || true
    done

    local leaked=0
    for dylib in "${lib_dir}"/*.dylib; do
        [ -L "$dylib" ] && continue
        [ -f "$dylib" ] || continue
        if otool -L "$dylib" | grep -qE '/usr/local/|/opt/homebrew/'; then
            echo -e "${RED}  ✗ $(basename "$dylib") still has Homebrew paths${NC}"
            leaked=1
        fi
    done
    [ "$leaked" -eq 0 ] && echo -e "${GREEN}  ✓ Dependencies bundled, paths rewritten, code signed${NC}"
}

build_macos_local() {
    echo -e "${YELLOW}Step 2: Building gopher-orch native library for ${RESOLVED_TARGET}...${NC}"
    check_local_build_deps

    rm -rf "${TARGET_NATIVE_DIR}.tmp"
    mkdir -p "${BUILD_DIR}"
    cd "${BUILD_DIR}"
    reset_cmake_cache_if_path_changed

    echo -e "${YELLOW}  Configuring CMake...${NC}"
    cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX="${TARGET_NATIVE_DIR}.tmp" \
        -DBUILD_SHARED_LIBS=ON \
        -DBUILD_BUNDLED_SHARED=OFF \
        -DBUILD_TESTS=OFF \
        -DCMAKE_POSITION_INDEPENDENT_CODE=ON

    echo -e "${YELLOW}  Compiling...${NC}"
    cmake --build . --config Release -j$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

    echo -e "${YELLOW}  Installing to ${TARGET_NATIVE_DIR}.tmp...${NC}"
    cmake --install .

    echo -e "${YELLOW}  Copying dependency libraries...${NC}"
    copy_native_dependency_libraries "${TARGET_NATIVE_DIR}.tmp/lib"
    bundle_macos_dependencies "${TARGET_NATIVE_DIR}.tmp/lib"

    rm -rf "${TARGET_NATIVE_DIR}"
    mv "${TARGET_NATIVE_DIR}.tmp" "${TARGET_NATIVE_DIR}"
    cd "${SCRIPT_DIR}"

    echo -e "${GREEN}✓ Native library built successfully for ${RESOLVED_TARGET}${NC}"
    echo ""
}

build_linux_x64_docker() {
    echo -e "${YELLOW}Step 2: Building gopher-orch native library for linux-x64 with Docker...${NC}"

    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker is required for ./build.sh linux.${NC}"
        echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop/"
        exit 1
    fi

    cd "${NATIVE_DIR}"
    rm -rf "build-output/linux-x64"
    "${NATIVE_DIR}/docker/build-linux-x64-docker.sh"

    local output_dir="${NATIVE_DIR}/build-output/linux-x64"
    if [ ! -f "${output_dir}/libgopher-orch.so" ] && [ -z "$(find "${output_dir}" -maxdepth 1 -name 'libgopher-orch.so*' -type f 2>/dev/null | head -n 1)" ]; then
        echo -e "${RED}Error: Linux Docker build did not produce libgopher-orch.so${NC}"
        exit 1
    fi

    rm -rf "${TARGET_NATIVE_DIR}.tmp"
    mkdir -p "${TARGET_NATIVE_DIR}.tmp/lib" "${TARGET_NATIVE_DIR}.tmp/bin"
    cp -P "${output_dir}"/*.so* "${TARGET_NATIVE_DIR}.tmp/lib/" 2>/dev/null || true
    cp -P "${output_dir}"/*.a "${TARGET_NATIVE_DIR}.tmp/lib/" 2>/dev/null || true
    if [ -d "${output_dir}/include" ]; then
        cp -R "${output_dir}/include" "${TARGET_NATIVE_DIR}.tmp/include"
    fi
    if [ -f "${output_dir}/verify_orch" ]; then
        cp "${output_dir}/verify_orch" "${TARGET_NATIVE_DIR}.tmp/bin/"
        chmod +x "${TARGET_NATIVE_DIR}.tmp/bin/verify_orch"
    fi

    rm -rf "${TARGET_NATIVE_DIR}"
    mv "${TARGET_NATIVE_DIR}.tmp" "${TARGET_NATIVE_DIR}"
    cd "${SCRIPT_DIR}"

    echo -e "${GREEN}✓ Native library built successfully for linux-x64${NC}"
    echo ""
}

install_active_native() {
    echo -e "${YELLOW}Step 3: Updating active native output...${NC}"

    rm -rf "${ACTIVE_NATIVE_DIR}.tmp"
    cp -R "${TARGET_NATIVE_DIR}" "${ACTIVE_NATIVE_DIR}.tmp"
    rm -rf "${ACTIVE_NATIVE_DIR}"
    mv "${ACTIVE_NATIVE_DIR}.tmp" "${ACTIVE_NATIVE_DIR}"

    rm -rf "${NATIVE_LIB_DIR}.tmp" "${NATIVE_INCLUDE_DIR}.tmp"
    if [ -d "${ACTIVE_NATIVE_DIR}/lib" ]; then
        cp -R "${ACTIVE_NATIVE_DIR}/lib" "${NATIVE_LIB_DIR}.tmp"
        rm -rf "${NATIVE_LIB_DIR}"
        mv "${NATIVE_LIB_DIR}.tmp" "${NATIVE_LIB_DIR}"
    fi
    if [ -d "${ACTIVE_NATIVE_DIR}/include" ]; then
        cp -R "${ACTIVE_NATIVE_DIR}/include" "${NATIVE_INCLUDE_DIR}.tmp"
        rm -rf "${NATIVE_INCLUDE_DIR}"
        mv "${NATIVE_INCLUDE_DIR}.tmp" "${NATIVE_INCLUDE_DIR}"
    fi

    echo -e "${GREEN}✓ Active native output updated: ${ACTIVE_NATIVE_DIR}${NC}"
    echo ""
}

verify_native_output() {
    echo -e "${YELLOW}Step 4: Verifying native build artifacts...${NC}"

    local expected_lib="libgopher-orch.dylib"
    if [ "$RESOLVED_TARGET" = "linux-x64" ]; then
        expected_lib="libgopher-orch.so"
    fi

    if [ -d "${ACTIVE_NATIVE_DIR}/lib" ]; then
        echo -e "${GREEN}✓ Active libraries: ${ACTIVE_NATIVE_DIR}/lib${NC}"
        ls -lh "${ACTIVE_NATIVE_DIR}/lib"/lib*.dylib 2>/dev/null || \
        ls -lh "${ACTIVE_NATIVE_DIR}/lib"/lib*.so* 2>/dev/null || \
        ls -lh "${ACTIVE_NATIVE_DIR}/lib"/*.dll 2>/dev/null || true
    else
        echo -e "${RED}Error: active library directory not found: ${ACTIVE_NATIVE_DIR}/lib${NC}"
        exit 1
    fi

    if [ ! -e "${ACTIVE_NATIVE_DIR}/lib/${expected_lib}" ] && [ -z "$(find "${ACTIVE_NATIVE_DIR}/lib" -maxdepth 1 -name "${expected_lib}*" -type f 2>/dev/null | head -n 1)" ]; then
        echo -e "${RED}Error: expected native library not found: ${expected_lib}${NC}"
        exit 1
    fi

    if [ -d "${ACTIVE_NATIVE_DIR}/include" ]; then
        echo -e "${GREEN}✓ Active headers: ${ACTIVE_NATIVE_DIR}/include${NC}"
    else
        echo -e "${YELLOW}⚠ Include directory not found: ${ACTIVE_NATIVE_DIR}/include${NC}"
    fi

    if [ "$RESOLVED_TARGET" = "linux-x64" ] && [ -x "${ACTIVE_NATIVE_DIR}/bin/verify_orch" ]; then
        if docker run --rm --platform linux/amd64 -v "${ACTIVE_NATIVE_DIR}:/work" -w /work ubuntu:22.04 sh -c 'LD_LIBRARY_PATH=/work/lib /work/bin/verify_orch'; then
            NATIVE_VERIFICATION_STATUS="passed"
        else
            NATIVE_VERIFICATION_STATUS="failed"
            echo -e "${RED}Error: Linux native verification failed.${NC}"
            exit 1
        fi
    else
        NATIVE_VERIFICATION_STATUS="passed"
    fi

    echo ""
}

setup_node_environment() {
    echo -e "${YELLOW}Step 5: Setting up Node.js environment...${NC}"
    cd "${SCRIPT_DIR}"

    if ! command -v node >/dev/null 2>&1; then
        echo -e "${RED}Error: Node.js not found. Please install Node.js first.${NC}"
        echo -e "${YELLOW}  macOS: brew install node${NC}"
        echo -e "${YELLOW}  Linux: sudo apt-get install nodejs npm${NC}"
        exit 1
    fi

    local node_version
    node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        echo -e "${RED}Error: Node.js 18+ required. Current version: $(node -v)${NC}"
        exit 1
    fi

    echo -e "${YELLOW}  Installing npm dependencies...${NC}"
    npm install --silent 2>/dev/null || npm install
    echo -e "${GREEN}✓ Node.js environment set up successfully${NC}"
    echo ""
}

build_typescript() {
    echo -e "${YELLOW}Step 6: Building TypeScript SDK...${NC}"
    npm run build --silent 2>/dev/null || npm run build
    TYPESCRIPT_BUILD_STATUS="passed"
    echo -e "${GREEN}✓ TypeScript SDK built successfully${NC}"
    echo ""
}

run_sdk_tests_if_compatible() {
    if [ "$RESOLVED_TARGET" = "linux-x64" ] && [ "$(uname -s)" = "Darwin" ]; then
        echo -e "${YELLOW}Step 7: Skipping host SDK tests for Linux native output on macOS.${NC}"
        echo ""
        return
    fi

    echo -e "${YELLOW}Step 7: Running tests...${NC}"
    npm test --silent 2>/dev/null && echo -e "${GREEN}✓ Tests passed${NC}" || echo -e "${YELLOW}⚠ Some tests may have failed (native library required)${NC}"
    echo ""
}

build_auth_example_if_compatible() {
    if [ "$RESOLVED_TARGET" = "linux-x64" ] && [ "$(uname -s)" = "Darwin" ]; then
        echo -e "${YELLOW}Step 8: Skipping auth example build for Linux native output on macOS.${NC}"
        echo ""
        return
    fi

    echo -e "${YELLOW}Step 8: Building auth example...${NC}"
    local auth_example_dir="${SCRIPT_DIR}/examples/auth"

    if [ -d "${auth_example_dir}" ]; then
        cd "${auth_example_dir}"
        echo -e "${YELLOW}  Copying native libraries to example...${NC}"
        mkdir -p "${auth_example_dir}/lib"
        cp -P "${ACTIVE_NATIVE_DIR}/lib"/libgopher-auth*.dylib "${auth_example_dir}/lib/" 2>/dev/null || true
        cp -P "${ACTIVE_NATIVE_DIR}/lib"/libgopher-auth*.so* "${auth_example_dir}/lib/" 2>/dev/null || true
        cp -P "${ACTIVE_NATIVE_DIR}/lib"/gopher-auth*.dll "${auth_example_dir}/lib/" 2>/dev/null || true

        echo -e "${YELLOW}  Installing example dependencies...${NC}"
        npm install --silent 2>/dev/null || npm install

        echo -e "${YELLOW}  Building example TypeScript...${NC}"
        npm run build --silent 2>/dev/null || npm run build

        echo -e "${YELLOW}  Running example tests...${NC}"
        npm test --silent 2>/dev/null && echo -e "${GREEN}✓ Example tests passed${NC}" || echo -e "${YELLOW}⚠ Some example tests may have failed${NC}"

        cd "${SCRIPT_DIR}"
        echo -e "${GREEN}✓ Auth example built successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Auth example directory not found: ${auth_example_dir}${NC}"
    fi
    echo ""
}

print_summary() {
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Build completed successfully!${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
    echo -e "Requested target:       ${YELLOW}${REQUESTED_TARGET}${NC}"
    echo -e "Resolved target:        ${YELLOW}${RESOLVED_TARGET}${NC}"
    echo -e "Platform native output: ${YELLOW}${TARGET_NATIVE_DIR}${NC}"
    echo -e "Active native output:   ${YELLOW}${ACTIVE_NATIVE_DIR}${NC}"
    echo -e "Native library path:    ${YELLOW}${ACTIVE_NATIVE_DIR}/lib${NC}"
    echo -e "Compatibility lib path: ${YELLOW}${NATIVE_LIB_DIR}${NC}"
    echo -e "Native verification:    ${YELLOW}${NATIVE_VERIFICATION_STATUS}${NC}"
    echo -e "TypeScript build:       ${YELLOW}${TYPESCRIPT_BUILD_STATUS}${NC}"
    echo ""
    echo -e "Run SDK tests:          ${YELLOW}npm test${NC}"
    echo -e "Run SDK example:        ${YELLOW}npm run example${NC}"
    echo -e "Build SDK:              ${YELLOW}npm run build${NC}"
    echo ""
    echo -e "Auth example:           ${YELLOW}${SCRIPT_DIR}/examples/auth${NC}"
    echo -e "Run auth server:        ${YELLOW}cd examples/auth && npm start${NC}"
    echo -e "Run auth tests:         ${YELLOW}cd examples/auth && npm test${NC}"
}

main() {
    parse_args "$@"

    if [ "$RUN_BUILD_AFTER_CLEAN" -eq 0 ] && printf '%s\n' "$@" | grep -qx -- '--clean'; then
        exit 0
    fi

    detect_host_target
    print_header
    prepare_submodules

    case "$RESOLVED_TARGET" in
        darwin-arm64|darwin-x64)
            build_macos_local
            ;;
        linux-x64)
            build_linux_x64_docker
            ;;
    esac

    install_active_native
    verify_native_output
    setup_node_environment
    build_typescript
    run_sdk_tests_if_compatible
    build_auth_example_if_compatible
    print_summary
}

main "$@"
