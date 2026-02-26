# gopher-orch - TypeScript SDK

TypeScript SDK for Gopher Orch - AI Agent orchestration framework with native C++ performance.

## Table of Contents

- [Features](#features)
- [When to Use This SDK](#when-to-use-this-sdk)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Building from Source](#building-from-source)
  - [Prerequisites](#prerequisites)
  - [Step 1: Clone the Repository](#step-1-clone-the-repository)
  - [Step 2: Build Everything](#step-2-build-everything)
  - [Step 3: Verify the Build](#step-3-verify-the-build)
  - [Step 4: Run Tests](#step-4-run-tests)
- [Native Library Details](#native-library-details)
  - [Library Location](#library-location)
  - [Platform-Specific Library Names](#platform-specific-library-names)
  - [Custom Library Path](#custom-library-path)
  - [Library Search Order](#library-search-order)
- [API Documentation](#api-documentation)
  - [GopherAgent](#gopheragent)
  - [ServerConfig](#serverconfig)
  - [Error Handling](#error-handling)
- [Examples](#examples)
  - [Basic Usage with API Key](#basic-usage-with-api-key)
  - [Using Local MCP Servers](#using-local-mcp-servers)
  - [Running the Example](#running-the-example)
- [Development](#development)
  - [Project Structure](#project-structure)
  - [Build Scripts](#build-scripts)
  - [Rebuilding Native Library](#rebuilding-native-library)
  - [Updating Submodules](#updating-submodules)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Native Performance** - Powered by C++ core with TypeScript bindings via koffi
- **AI Agent Framework** - Build intelligent agents with LLM integration
- **MCP Protocol** - Model Context Protocol client and server support
- **Tool Orchestration** - Manage and execute tools across multiple MCP servers
- **State Management** - Built-in state graph for complex workflows
- **Type Safety** - Full TypeScript typing with strict mode support

## When to Use This SDK

This SDK is ideal for:

- **Node.js applications** that need high-performance AI agent orchestration
- **Backend services** requiring MCP protocol support
- **CLI tools** needing reliable agent infrastructure
- **Server-side applications** integrating AI agents

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   TypeScript SDK (gopher-orch)              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ GopherAgent │  │ ServerConfig│  │ Error Classes       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │ FFI (koffi)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Native Library (libgopher-orch)                │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │ Agent Engine  │  │ LLM Providers │  │ MCP Client      │  │
│  │               │  │ - Anthropic   │  │ - HTTP/SSE      │  │
│  │               │  │ - OpenAI      │  │ - Tool Registry │  │
│  └───────────────┘  └───────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Servers                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Weather API │  │ Database    │  │ Custom Tools        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Option 1: npm (when published)

```bash
npm install @gopher.security/gopher-mcp
```

### Option 2: Build from Source

See [Building from Source](#building-from-source) below.

## Quick Start

```typescript
import { GopherAgent, GopherAgentConfig } from '@gopher.security/gopher-mcp';

// Create an agent
const agent = GopherAgent.create(
  GopherAgentConfig.builder()
    .provider('AnthropicProvider')
    .model('claude-3-haiku-20240307')
    .apiKey(process.env.ANTHROPIC_API_KEY!)
    .build()
);

try {
  // Run a query
  const answer = agent.run('What is the weather like in Tokyo?');
  console.log(answer);
} finally {
  // Clean up
  agent.dispose();
}
```

## Building from Source

### Prerequisites

- **Node.js 18+** - JavaScript runtime
- **CMake 3.14+** - Build system generator
- **C++ Compiler** - GCC 9+, Clang 10+, or MSVC 2019+
- **Git** - Version control

### Step 1: Clone the Repository

```bash
git clone --recursive https://github.com/GopherSecurity/gopher-mcp-js.git
cd gopher-mcp-js
```

### Step 2: Build Everything

The `build.sh` script handles everything: submodule updates, native library compilation, npm install, and TypeScript build:

```bash
./build.sh
```

### Step 3: Verify the Build

```bash
# Check native libraries
ls -la native/lib/

# You should see:
# - libgopher-orch.dylib (macOS) or libgopher-orch.so (Linux)
# - libgopher-mcp.dylib/so
# - libfmt.dylib/so
```

### Step 4: Run Tests

```bash
npm test
```

## Native Library Details

### Library Location

After building, native libraries are installed to:

```
native/
├── lib/
│   ├── libgopher-orch.dylib    # Main library
│   ├── libgopher-mcp.dylib     # MCP protocol library
│   └── libfmt.dylib            # Formatting library
└── include/
    └── orch/                   # Header files
```

### Platform-Specific Library Names

| Platform | Library Name |
|----------|--------------|
| macOS    | `libgopher-orch.dylib` |
| Linux    | `libgopher-orch.so` |
| Windows  | `gopher-orch.dll` |

### Custom Library Path

Set the `GOPHER_ORCH_LIBRARY_PATH` environment variable to specify a custom location:

```bash
export GOPHER_ORCH_LIBRARY_PATH=/custom/path/libgopher-orch.dylib
```

### Library Search Order

1. `GOPHER_ORCH_LIBRARY_PATH` environment variable
2. `native/lib/` in current directory
3. `native/lib/` relative to module location
4. System paths (`/usr/local/lib`, `/opt/homebrew/lib`, `/usr/lib`)

## API Documentation

### GopherAgent

The main class for interacting with the agent:

```typescript
// Static methods
GopherAgent.init(): void                    // Initialize library
GopherAgent.shutdown(): void                // Shutdown library
GopherAgent.isInitialized(): boolean        // Check if initialized
GopherAgent.create(config): GopherAgent     // Create agent with config
GopherAgent.createWithApiKey(...): GopherAgent
GopherAgent.createWithServerConfig(...): GopherAgent

// Instance methods
agent.run(query, timeoutMs?): string        // Run a query
agent.runDetailed(query, timeoutMs?): AgentResult  // Run with metadata
agent.dispose(): void                       // Free resources
agent.isDisposed(): boolean                 // Check if disposed
```

### ServerConfig

Utility for fetching server configurations:

```typescript
const config = ServerConfig.fetch(apiKey);
```

### Error Handling

The SDK provides typed exceptions:

```typescript
try {
  const agent = GopherAgent.create(config);
  const result = agent.run('query');
} catch (e) {
  if (e instanceof ApiKeyError) {
    console.error('Invalid API key:', e.message);
  } else if (e instanceof ConnectionError) {
    console.error('Connection failed:', e.message);
  } else if (e instanceof TimeoutError) {
    console.error('Operation timed out:', e.message);
  } else if (e instanceof AgentError) {
    console.error('Agent error:', e.message);
  }
}
```

## Examples

### Basic Usage with API Key

```typescript
import { GopherAgent, GopherAgentConfig } from '@gopher.security/gopher-mcp';

const agent = GopherAgent.createWithApiKey(
  'AnthropicProvider',
  'claude-3-haiku-20240307',
  process.env.ANTHROPIC_API_KEY!
);

try {
  const answer = agent.run('Hello, how are you?');
  console.log(answer);
} finally {
  agent.dispose();
}
```

### Using Local MCP Servers

```typescript
import { GopherAgent, GopherAgentConfig } from '@gopher.security/gopher-mcp';

const serverConfig = JSON.stringify({
  servers: [
    {
      name: 'weather',
      transport: 'HTTP_SSE',
      url: 'http://localhost:3001/mcp'
    }
  ]
});

const agent = GopherAgent.createWithServerConfig(
  'AnthropicProvider',
  'claude-3-haiku-20240307',
  serverConfig
);

try {
  const answer = agent.run('What is the weather in Tokyo?');
  console.log(answer);
} finally {
  agent.dispose();
}
```

### Running the Example

```bash
# Start local MCP servers
cd examples/server3001 && npm install && npm start &
cd examples/server3002 && npm install && npm start &

# Run the example
npm run example
```

## Development

### Project Structure

```
gopher-mcp-js/
├── src/                      # TypeScript source
│   ├── index.ts             # Main exports
│   ├── agent.ts             # GopherAgent class
│   ├── config.ts            # Configuration builder
│   ├── result.ts            # AgentResult class
│   ├── errors.ts            # Error classes
│   ├── serverConfig.ts      # ServerConfig utility
│   └── ffi/                 # FFI bindings
│       ├── index.ts
│       └── library.ts       # koffi bindings
├── tests/                   # Jest tests
├── examples/                # Example applications
├── third_party/             # Git submodules
│   └── gopher-orch/         # Native library source
├── native/                  # Built native libraries (after build)
├── dist/                    # Compiled TypeScript (after build)
├── package.json
├── tsconfig.json
├── jest.config.js
└── build.sh                 # Build script
```

### Build Scripts

```bash
./build.sh              # Build everything
./build.sh --clean      # Clean and rebuild
npm run build           # TypeScript only
npm test                # Run tests
npm run example         # Run example
npm run lint            # Run ESLint
npm run lint:fix        # Run ESLint with auto-fix
npm run format          # Format code with Prettier
npm run format:check    # Check formatting
```

### Rebuilding Native Library

```bash
./build.sh --clean --build
```

### Updating Submodules

```bash
git submodule update --init --recursive
```

For custom SSH hosts (multiple GitHub accounts):

```bash
GITHUB_SSH_HOST=your-ssh-alias ./build.sh
```

## Troubleshooting

### Library Not Found

If you get "Failed to load gopher-orch native library", check:

1. Native library exists: `ls -la native/lib/`
2. Environment variable: `echo $GOPHER_ORCH_LIBRARY_PATH`
3. Rebuild: `./build.sh --clean --build`

### Submodule Issues

```bash
git submodule deinit -f third_party/gopher-orch
rm -rf .git/modules/third_party/gopher-orch
git submodule update --init --recursive
```

### macOS Library Loading

On macOS, you may need to allow the library in System Preferences > Security & Privacy.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) for details.
