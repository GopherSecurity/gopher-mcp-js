#!/bin/bash

echo "========================================="
echo "  Verifying Client Test Structure       "
echo "========================================="
echo ""

# Check test files exist
echo "Checking test files..."
FILES=(
    "tool_test.cpp"
    "provider_test.cpp"
    "oauth_manager_test.cpp"
    "user_context_test.cpp"
    "integration_platform_test.cpp"
    "CMakeLists.txt"
    "README.md"
)

ALL_GOOD=true
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        ALL_GOOD=false
    fi
done

echo ""
echo "Checking implementation files..."

# Navigate to root directory
cd ../../../..

IMPL_FILES=(
    "src/client/integration_platform.cpp"
    "src/client/oauth_manager.cpp"
    "src/client/connected_account.cpp"
    "src/client/user_context.cpp"
    "src/client/runnable_adapters.cpp"
    "src/client/provider/anthropic_provider.cpp"
    "src/client/provider/openai_provider.cpp"
    "src/client/provider/google_provider.cpp"
    "src/client/provider/llama_provider.cpp"
)

for file in "${IMPL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        ALL_GOOD=false
    fi
done

echo ""
echo "Checking header files..."

HEADER_FILES=(
    "include/gopher/orch/client/integration_platform.h"
    "include/gopher/orch/client/tool.h"
    "include/gopher/orch/client/oauth_manager.h"
    "include/gopher/orch/client/user_context.h"
    "include/gopher/orch/client/connected_account.h"
    "include/gopher/orch/client/provider/provider_base.h"
    "include/gopher/orch/client/provider/anthropic_provider.h"
    "include/gopher/orch/client/provider/openai_provider.h"
    "include/gopher/orch/client/provider/google_provider.h"
    "include/gopher/orch/client/provider/llama_provider.h"
    "include/gopher/orch/client/provider/all_providers.h"
)

for file in "${HEADER_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        ALL_GOOD=false
    fi
done

echo ""
if [ "$ALL_GOOD" = true ]; then
    echo "========================================="
    echo "     ✓ All files in correct location!   "
    echo "========================================="
else
    echo "========================================="
    echo "     ✗ Some files are missing           "
    echo "========================================="
    exit 1
fi

echo ""
echo "Test directory structure:"
echo "  /tests/gopher/orch/client/  <- Test files (correct location)"
echo "  /include/gopher/orch/client/  <- Header files"
echo "  /src/client/  <- Implementation files"
echo ""