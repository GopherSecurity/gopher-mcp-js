# gopher-orch Makefile
# Consolidates all CMake commands for easy building

# Build configuration
BUILD_DIR ?= build
BUILD_TYPE ?= Debug
GENERATOR ?= "Unix Makefiles"
PARALLEL_JOBS ?= $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Library build options (both by default)
BUILD_STATIC ?= ON
BUILD_SHARED ?= ON

# CMake options
CMAKE_OPTIONS ?=
VERBOSE ?= 0

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

# Default target
.PHONY: all
all: build test
	@echo "$(GREEN)Build and test completed successfully$(NC)"

# Configure with CMake
.PHONY: configure
configure:
	@echo "$(BLUE)Configuring with CMake...$(NC)"
	@echo "  Build type: $(BUILD_TYPE)"
	@echo "  Static library: $(BUILD_STATIC)"
	@echo "  Shared library: $(BUILD_SHARED)"
	@mkdir -p $(BUILD_DIR)
	@cd $(BUILD_DIR) && cmake .. -G $(GENERATOR) \
		-DCMAKE_BUILD_TYPE=$(BUILD_TYPE) \
		-DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
		-DBUILD_STATIC_LIBS=$(BUILD_STATIC) \
		-DBUILD_SHARED_LIBS=$(BUILD_SHARED) \
		$(CMAKE_OPTIONS)
	@echo "$(GREEN)Configuration complete$(NC)"

# Build the project
.PHONY: build
build: configure
	@echo "$(BLUE)Building gopher-orch libraries...$(NC)"
	@cmake --build $(BUILD_DIR) -- -j$(PARALLEL_JOBS)
	@echo "$(GREEN)Build complete$(NC)"
	@$(MAKE) --no-print-directory lib-info-summary

# Build in release mode
.PHONY: release
release:
	@echo "$(BLUE)Building in Release mode...$(NC)"
	@$(MAKE) BUILD_TYPE=Release build test
	@echo "$(GREEN)Release build complete$(NC)"

# Build in debug mode (explicit)
.PHONY: debug
debug:
	@echo "$(BLUE)Building in Debug mode...$(NC)"
	@$(MAKE) BUILD_TYPE=Debug build
	@echo "$(GREEN)Debug build complete$(NC)"

# Run tests
.PHONY: test
test: build
	@echo "$(BLUE)Running tests...$(NC)"
	@cd $(BUILD_DIR) && ctest --output-on-failure
	@echo "$(GREEN)All tests passed$(NC)"

# Run tests with verbose output
.PHONY: test-verbose
test-verbose: build
	@echo "$(BLUE)Running tests (verbose)...$(NC)"
	@cd $(BUILD_DIR) && ctest -V
	@echo "$(GREEN)All tests passed$(NC)"

# Run tests in parallel
.PHONY: test-parallel
test-parallel: build
	@echo "$(BLUE)Running tests in parallel...$(NC)"
	@cd $(BUILD_DIR) && ctest -j$(PARALLEL_JOBS) --output-on-failure
	@echo "$(GREEN)All tests passed$(NC)"

# Run specific test
.PHONY: test-one
test-one: build
	@if [ -z "$(TEST)" ]; then \
		echo "$(RED)Error: TEST variable not set. Usage: make test-one TEST=test_name$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)Running test: $(TEST)...$(NC)"
	@cd $(BUILD_DIR) && ctest -R $(TEST) -V
	@echo "$(GREEN)Test complete$(NC)"

# Build only the libraries (respects current configuration)
.PHONY: libs
libs: configure
	@echo "$(BLUE)Building libraries...$(NC)"
	@if [ -f $(BUILD_DIR)/CMakeCache.txt ]; then \
		if grep -q "BUILD_STATIC_LIBS:BOOL=ON" $(BUILD_DIR)/CMakeCache.txt 2>/dev/null; then \
			cmake --build $(BUILD_DIR) --target gopher-orch-static -- -j$(PARALLEL_JOBS); \
		fi; \
		if grep -q "BUILD_SHARED_LIBS:BOOL=ON" $(BUILD_DIR)/CMakeCache.txt 2>/dev/null; then \
			cmake --build $(BUILD_DIR) --target gopher-orch-shared -- -j$(PARALLEL_JOBS); \
		fi; \
	else \
		cmake --build $(BUILD_DIR) --target gopher-orch-static -- -j$(PARALLEL_JOBS); \
	fi
	@echo "$(GREEN)Libraries built$(NC)"

# Build only the examples
.PHONY: examples
examples: libs
	@echo "$(BLUE)Building examples...$(NC)"
	@cmake --build $(BUILD_DIR) --target hello_world_example -- -j$(PARALLEL_JOBS)
	@echo "$(GREEN)Examples built$(NC)"

# Run the hello world example
.PHONY: run-hello
run-hello: examples
	@echo "$(BLUE)Running hello_world_example...$(NC)"
	@$(BUILD_DIR)/bin/hello_world_example
	@echo "$(GREEN)Example completed$(NC)"

# Clean build directory
.PHONY: clean
clean:
	@echo "$(YELLOW)Cleaning build directory...$(NC)"
	@rm -rf $(BUILD_DIR)
	@echo "$(GREEN)Clean complete$(NC)"

# Deep clean (including submodules)
.PHONY: distclean
distclean: clean
	@echo "$(YELLOW)Deep cleaning...$(NC)"
	@git submodule deinit -f .
	@rm -rf third_party/gopher-mcp
	@rm -rf .git/modules/third_party
	@echo "$(GREEN)Deep clean complete$(NC)"

# Format all source files
.PHONY: format
format:
	@echo "$(BLUE)Formatting all source files with clang-format...$(NC)"
	@find . -path "./$(BUILD_DIR)*" -prune -o -path "./third_party" -prune -o \
		\( -name "*.h" -o -name "*.hpp" -o -name "*.cpp" -o -name "*.cc" -o -name "*.c" \) -print | \
		xargs clang-format -i
	@echo "$(GREEN)Formatting complete$(NC)"

# Check formatting without modifying files
.PHONY: check-format
check-format:
	@echo "$(BLUE)Checking source file formatting...$(NC)"
	@find . -path "./$(BUILD_DIR)*" -prune -o -path "./third_party" -prune -o \
		\( -name "*.h" -o -name "*.hpp" -o -name "*.cpp" -o -name "*.cc" -o -name "*.c" \) -print | \
		xargs clang-format --dry-run --Werror
	@if [ $$? -eq 0 ]; then \
		echo "$(GREEN)All files are properly formatted$(NC)"; \
	else \
		echo "$(RED)Format check failed - run 'make format' to fix$(NC)"; \
		exit 1; \
	fi

# Alias for consistency with gopher-mcp
.PHONY: format-check
format-check: check-format

# Install the library
.PHONY: install
install: build
	@echo "$(BLUE)Installing gopher-orch...$(NC)"
	@cmake --build $(BUILD_DIR) --target install
	@echo "$(GREEN)Installation complete$(NC)"

# Uninstall the library
.PHONY: uninstall
uninstall:
	@echo "$(YELLOW)Uninstalling gopher-orch...$(NC)"
	@if [ ! -f $(BUILD_DIR)/install_manifest.txt ]; then \
		echo "$(RED)Error: No installation found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi
	@cmake --build $(BUILD_DIR) --target uninstall
	@echo "$(GREEN)Uninstall complete$(NC)"

# Generate documentation (requires doxygen)
.PHONY: docs
docs:
	@echo "$(BLUE)Generating documentation...$(NC)"
	@doxygen Doxyfile 2>/dev/null || echo "$(YELLOW)Warning: Doxygen not found or configured$(NC)"
	@echo "$(GREEN)Documentation generated$(NC)"

# Update submodules
.PHONY: update-submodules
update-submodules:
	@echo "$(BLUE)Updating submodules...$(NC)"
	@git submodule update --init --recursive
	@echo "$(GREEN)Submodules updated$(NC)"

# Configure to use system gopher-mcp instead of submodule
.PHONY: use-system-gopher-mcp
use-system-gopher-mcp:
	@echo "$(BLUE)Configuring to use system gopher-mcp...$(NC)"
	@$(MAKE) CMAKE_OPTIONS="-DUSE_SUBMODULE_GOPHER_MCP=OFF" configure
	@echo "$(GREEN)Configured to use system gopher-mcp$(NC)"

# Configure to use submodule gopher-mcp
.PHONY: use-submodule-gopher-mcp
use-submodule-gopher-mcp:
	@echo "$(BLUE)Configuring to use submodule gopher-mcp...$(NC)"
	@$(MAKE) CMAKE_OPTIONS="-DUSE_SUBMODULE_GOPHER_MCP=ON" configure
	@echo "$(GREEN)Configured to use submodule gopher-mcp$(NC)"

# Build shared library only
.PHONY: shared
shared:
	@$(MAKE) BUILD_STATIC=OFF BUILD_SHARED=ON clean build

# Build static library only
.PHONY: static
static:
	@$(MAKE) BUILD_STATIC=ON BUILD_SHARED=OFF clean build

# Build both static and shared libraries (default behavior)
.PHONY: both
both:
	@$(MAKE) BUILD_STATIC=ON BUILD_SHARED=ON clean build

# Build standalone (without gopher-mcp dependency)
.PHONY: standalone
standalone:
	@echo "$(BLUE)Building standalone (without gopher-mcp)...$(NC)"
	@$(MAKE) CMAKE_OPTIONS="-DBUILD_WITHOUT_GOPHER_MCP=ON" build
	@echo "$(GREEN)Standalone build complete$(NC)"

# Show brief library summary (used after build)
.PHONY: lib-info-summary
lib-info-summary:
	@if [ -f $(BUILD_DIR)/lib/libgopher-orch.a ]; then \
		echo "  $(GREEN)Static library:  $(BUILD_DIR)/lib/libgopher-orch.a ($$(du -h $(BUILD_DIR)/lib/libgopher-orch.a 2>/dev/null | cut -f1))$(NC)"; \
	fi
	@if [ -f $(BUILD_DIR)/lib/libgopher-orch.so ]; then \
		echo "  $(GREEN)Shared library:  $(BUILD_DIR)/lib/libgopher-orch.so ($$(du -h $(BUILD_DIR)/lib/libgopher-orch.so 2>/dev/null | cut -f1))$(NC)"; \
	elif [ -f $(BUILD_DIR)/lib/libgopher-orch.dylib ]; then \
		echo "  $(GREEN)Shared library:  $(BUILD_DIR)/lib/libgopher-orch.dylib ($$(du -h $(BUILD_DIR)/lib/libgopher-orch.dylib 2>/dev/null | cut -f1))$(NC)"; \
	fi

# Show detailed library information
.PHONY: lib-info
lib-info:
	@echo "$(BLUE)Library Information:$(NC)"
	@if [ -f $(BUILD_DIR)/lib/libgopher-orch.a ]; then \
		echo "$(GREEN)Static library:$(NC)"; \
		echo "  Path: $(BUILD_DIR)/lib/libgopher-orch.a"; \
		echo "  Size: $$(du -h $(BUILD_DIR)/lib/libgopher-orch.a | cut -f1)"; \
		if command -v ar >/dev/null 2>&1; then \
			echo "  Objects: $$(ar -t $(BUILD_DIR)/lib/libgopher-orch.a 2>/dev/null | wc -l) files"; \
		fi; \
	else \
		echo "$(YELLOW)Static library not found$(NC)"; \
	fi
	@echo ""
	@if [ -f $(BUILD_DIR)/lib/libgopher-orch.so ] || [ -f $(BUILD_DIR)/lib/libgopher-orch.dylib ]; then \
		echo "$(GREEN)Shared library:$(NC)"; \
		LIB_PATH=$$(find $(BUILD_DIR)/lib -name "libgopher-orch.so*" -o -name "libgopher-orch.dylib" | head -1); \
		if [ -n "$$LIB_PATH" ]; then \
			echo "  Path: $$LIB_PATH"; \
			echo "  Size: $$(du -h $$LIB_PATH | cut -f1)"; \
			if command -v ldd >/dev/null 2>&1; then \
				echo "  Dependencies:"; \
				ldd $$LIB_PATH | head -5 | sed 's/^/    /'; \
			elif command -v otool >/dev/null 2>&1; then \
				echo "  Dependencies:"; \
				otool -L $$LIB_PATH | head -5 | sed 's/^/    /'; \
			fi; \
		fi; \
	else \
		echo "$(YELLOW)Shared library not found$(NC)"; \
	fi
	@echo ""
	@if [ -f $(BUILD_DIR)/CMakeCache.txt ]; then \
		echo "$(BLUE)Current configuration:$(NC)"; \
		grep -E "^(BUILD_SHARED_LIBS|BUILD_STATIC_LIBS):BOOL=" $(BUILD_DIR)/CMakeCache.txt | sed 's/^/  /'; \
	fi

# Show build configuration
.PHONY: info
info:
	@echo "$(BLUE)Build Configuration:$(NC)"
	@echo "  Build directory: $(BUILD_DIR)"
	@echo "  Build type: $(BUILD_TYPE)"
	@echo "  Generator: $(GENERATOR)"
	@echo "  Parallel jobs: $(PARALLEL_JOBS)"
	@echo "  Build static libs: $(BUILD_STATIC)"
	@echo "  Build shared libs: $(BUILD_SHARED)"
	@echo "  CMake options: $(CMAKE_OPTIONS)"
	@if [ -f $(BUILD_DIR)/CMakeCache.txt ]; then \
		echo "\n$(BLUE)Current CMake cache:$(NC)"; \
		grep -E "^(CMAKE_BUILD_TYPE|BUILD_SHARED_LIBS|BUILD_STATIC_LIBS|USE_SUBMODULE_GOPHER_MCP)" $(BUILD_DIR)/CMakeCache.txt || true; \
	else \
		echo "\n$(YELLOW)No build directory found. Run 'make configure' first.$(NC)"; \
	fi

# Help target
.PHONY: help
help:
	@echo "$(BLUE)gopher-orch Build System$(NC)"
	@echo ""
	@echo "$(GREEN)Common targets:$(NC)"
	@echo "  make                    - Build both libraries and run tests (default)"
	@echo "  make build             - Build both static and shared libraries"
	@echo "  make release           - Build and test in release mode"
	@echo "  make test              - Run tests"
	@echo "  make clean             - Clean build directory"
	@echo "  make install           - Install the libraries"
	@echo "  make uninstall         - Uninstall the libraries"
	@echo ""
	@echo "$(GREEN)Library build targets:$(NC)"
	@echo "  make both              - Build both library types (default)"
	@echo "  make static            - Build static library only (with clean)"
	@echo "  make shared            - Build shared library only (with clean)"
	@echo "  make libs              - Build libraries (current config)"
	@echo "  make lib-info          - Show detailed library information"
	@echo ""
	@echo "$(GREEN)Build modes:$(NC)"
	@echo "  make debug             - Build in debug mode"
	@echo "  make release           - Build in release mode"
	@echo "  make standalone        - Build without gopher-mcp"
	@echo ""
	@echo "$(GREEN)Test targets:$(NC)"
	@echo "  make test-verbose      - Run tests with verbose output"
	@echo "  make test-parallel     - Run tests in parallel"
	@echo "  make test-one TEST=name - Run specific test"
	@echo ""
	@echo "$(GREEN)Component targets:$(NC)"
	@echo "  make libs              - Build only libraries"
	@echo "  make examples          - Build examples"
	@echo "  make run-hello         - Run hello world example"
	@echo ""
	@echo "$(GREEN)Dependency management:$(NC)"
	@echo "  make update-submodules - Update git submodules"
	@echo "  make use-system-gopher-mcp - Use system gopher-mcp"
	@echo "  make use-submodule-gopher-mcp - Use submodule gopher-mcp"
	@echo ""
	@echo "$(GREEN)Code Quality:$(NC)"
	@echo "  make format            - Auto-format all source files"
	@echo "  make check-format      - Check formatting without modifying"
	@echo "  make format-check      - Alias for check-format"
	@echo ""
	@echo "$(GREEN)Utilities:$(NC)"
	@echo "  make docs              - Generate documentation"
	@echo "  make info              - Show build configuration"
	@echo "  make distclean         - Deep clean including submodules"
	@echo ""
	@echo "$(GREEN)Variables:$(NC)"
	@echo "  BUILD_DIR=dir          - Set build directory (default: build)"
	@echo "  BUILD_TYPE=type        - Set build type (Debug/Release, default: Debug)"
	@echo "  BUILD_STATIC=ON/OFF    - Build static library (default: ON)"
	@echo "  BUILD_SHARED=ON/OFF    - Build shared library (default: ON)"
	@echo "  CMAKE_OPTIONS=opts     - Additional CMake options"
	@echo "  PARALLEL_JOBS=n        - Number of parallel jobs"
	@echo ""
	@echo "$(GREEN)Examples:$(NC)"
	@echo "  make                   - Build both libraries (default)"
	@echo "  make BUILD_SHARED=OFF  - Build static library only"
	@echo "  make BUILD_TYPE=Release - Build both libraries in release mode"
	@echo "  make static            - Build only static library"

.DEFAULT_GOAL := all
