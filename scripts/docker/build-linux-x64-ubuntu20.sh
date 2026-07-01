#!/bin/sh

set -e

echo "=== Checking gopher-mcp submodule ==="
ls /source/third_party/gopher-mcp/CMakeLists.txt

mkdir -p /build/cmake-build /tmp/output
rm -rf /build/cmake-build/install /tmp/output/* /host-output/*

cd /build/cmake-build
cmake -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_CXX_STANDARD=14 \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DBUILD_SHARED_LIBS=ON \
      -DBUILD_STATIC_LIBS=ON \
      -DBUILD_BUNDLED_SHARED=OFF \
      -DBUILD_TESTS=OFF \
      -DBUILD_EXAMPLES=OFF \
      -DUSE_SUBMODULE_GOPHER_MCP=ON \
      -DCMAKE_INSTALL_PREFIX=/build/cmake-build/install \
      -DCMAKE_INSTALL_RPATH='$ORIGIN' \
      /source

make -j"$(nproc)"
make install

cp /build/cmake-build/install/lib/libgopher-orch*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libgopher-orch*.a /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libgopher-mcp*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libgopher-mcp-event*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/lib/libgopher-mcp*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/lib/libgopher-mcp-event*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libfmt*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libfmt*.a /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libllhttp*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/install/lib/libllhttp*.a /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/lib/libfmt*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/lib/libfmt*.a /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/lib/libllhttp*.so* /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/lib/libllhttp*.a /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/_deps/fmt-build/libfmt*.a /tmp/output/ 2>/dev/null || true
cp /build/cmake-build/_deps/llhttp-build/libllhttp*.a /tmp/output/ 2>/dev/null || true

mkdir -p /tmp/output/include
cp -r /source/include/* /tmp/output/include/ 2>/dev/null || true
cp -r /source/third_party/gopher-mcp/include/* /tmp/output/include/ 2>/dev/null || true

echo "=== Bundling third-party dependencies ==="
for dylib in /tmp/output/libgopher-*.so*; do
    [ -L "$dylib" ] && continue
    [ -f "$dylib" ] || continue
    ldd "$dylib" 2>/dev/null | grep "=> /" | while read -r line; do
        dep_path=$(echo "$line" | sed 's/.*=> //' | sed 's/ (.*//' | tr -d '[:space:]')
        dep_name=$(basename "$dep_path")
        case "$dep_name" in
            libc.so*|libm.so*|libdl.so*|librt.so*|libpthread.so*|linux-vdso*|ld-linux*|libstdc++*|libgcc_s*|libresolv*|libnss*|libnsl*) continue ;;
        esac
        if [ -f "$dep_path" ] && [ ! -f "/tmp/output/$dep_name" ]; then
            echo "  Bundling: $dep_name"
            cp "$dep_path" "/tmp/output/$dep_name"
            chmod 644 "/tmp/output/$dep_name"
        fi
    done
done

for sofile in /tmp/output/*.so /tmp/output/*.so.*; do
    [ -L "$sofile" ] && continue
    [ -f "$sofile" ] || continue
    patchelf --set-rpath '$ORIGIN' "$sofile" 2>/dev/null || true
done
echo "=== Bundling complete ==="

cat > /tmp/verify_orch.c <<'EOF'
#include <stdio.h>
#include <dlfcn.h>

int main() {
    printf("libgopher-orch verification tool (Linux x86_64, Ubuntu 20 compatible)\n");
    printf("==================================================================\n\n");
    void* handle = dlopen("./libgopher-orch.so", RTLD_NOW);
    if (!handle) {
        printf("X Failed to load gopher-orch library: %s\n", dlerror());
        return 1;
    }
    printf("OK gopher-orch library loaded successfully\n");
    void* mcp_handle = dlopen("./libgopher-mcp.so", RTLD_NOW);
    if (mcp_handle) {
        printf("OK gopher-mcp library loaded successfully\n");
        dlclose(mcp_handle);
    } else {
        printf("-- gopher-mcp library not found (may be statically linked)\n");
    }
    dlclose(handle);
    printf("\nOK Verification complete\n");
    return 0;
}
EOF
gcc -o /tmp/output/verify_orch /tmp/verify_orch.c -ldl -O2

cp -r /tmp/output/* /host-output/
echo "Ubuntu 20 compatible x86_64 build complete!"
ls -la /tmp/output/
