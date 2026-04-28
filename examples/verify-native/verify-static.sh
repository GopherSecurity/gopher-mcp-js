#!/bin/bash
# verify-static.sh — Static verification of bundled dylibs
#
# Checks the npm package without running native code.
# Works on any Mac, even with Homebrew installed.
#
# Usage:
#   npm install @gopher.security/gopher-mcp-js@latest
#   bash verify-static.sh [path-to-lib-dir]
#
# Or from the repo:
#   bash examples/verify-native/verify-static.sh native/lib

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Find lib directory
LIB_DIR="${1:-}"
if [ -z "$LIB_DIR" ]; then
    # Try npm package location
    for pkg in gopher-orch-darwin-arm64 gopher-orch-darwin-x64; do
        d="node_modules/@gopher.security/${pkg}/lib"
        if [ -d "$d" ]; then
            LIB_DIR="$d"
            break
        fi
    done
fi

if [ -z "$LIB_DIR" ] || [ ! -d "$LIB_DIR" ]; then
    echo -e "${RED}Error: lib directory not found${NC}"
    echo "Usage: $0 [path-to-lib-dir]"
    echo "  e.g. $0 node_modules/@gopher.security/gopher-orch-darwin-arm64/lib"
    exit 1
fi

echo "Checking: $LIB_DIR"
echo ""

FAILED=0

# Check 1: No Homebrew paths
echo -e "${YELLOW}Check 1: No hardcoded Homebrew paths${NC}"
for f in "$LIB_DIR"/*.dylib; do
    [ -L "$f" ] && continue
    [ -f "$f" ] || continue
    leaked=$(otool -L "$f" | grep -E '/usr/local/|/opt/homebrew/' || true)
    if [ -n "$leaked" ]; then
        echo -e "  ${RED}✗ $(basename "$f") has Homebrew paths:${NC}"
        echo "$leaked" | sed 's/^/    /'
        FAILED=1
    fi
done
[ "$FAILED" -eq 0 ] && echo -e "  ${GREEN}✓ No Homebrew paths found${NC}"

# Check 2: All @loader_path deps exist
echo ""
echo -e "${YELLOW}Check 2: All @loader_path dependencies bundled${NC}"
MISSING=0
for f in "$LIB_DIR"/*.dylib; do
    [ -L "$f" ] && continue
    [ -f "$f" ] || continue
    otool -L "$f" | grep "@loader_path/" | while read -r dep rest; do
        dep_name=$(echo "$dep" | sed 's|@loader_path/||')
        if [ ! -f "$LIB_DIR/$dep_name" ]; then
            echo -e "  ${RED}✗ MISSING: ${dep_name} (needed by $(basename "$f"))${NC}"
            # Use a temp file to signal failure from subshell
            touch /tmp/.verify-missing
        fi
    done
done
if [ -f /tmp/.verify-missing ]; then
    rm -f /tmp/.verify-missing
    MISSING=1
    FAILED=1
fi
[ "$MISSING" -eq 0 ] && echo -e "  ${GREEN}✓ All @loader_path dependencies are bundled${NC}"

# Check 3: Code signatures valid
echo ""
echo -e "${YELLOW}Check 3: Code signatures valid${NC}"
SIGFAIL=0
for f in "$LIB_DIR"/*.dylib; do
    [ -L "$f" ] && continue
    [ -f "$f" ] || continue
    result=$(codesign -v "$f" 2>&1)
    if [ $? -ne 0 ]; then
        echo -e "  ${RED}✗ $(basename "$f"): ${result}${NC}"
        SIGFAIL=1
        FAILED=1
    fi
done
[ "$SIGFAIL" -eq 0 ] && echo -e "  ${GREEN}✓ All dylibs have valid signatures${NC}"

# Check 4: List all bundled files
echo ""
echo -e "${YELLOW}Bundled libraries:${NC}"
for f in "$LIB_DIR"/*.dylib; do
    [ -L "$f" ] && continue
    [ -f "$f" ] || continue
    size=$(ls -lh "$f" | awk '{print $5}')
    echo "  $(basename "$f") ($size)"
done

echo ""
if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All static checks passed${NC}"
else
    echo -e "${RED}❌ Some checks failed — see above${NC}"
    exit 1
fi
