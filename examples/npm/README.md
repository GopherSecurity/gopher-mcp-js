# Using gopher-orch SDK via npm

This guide shows how to use the gopher-orch TypeScript SDK when installed via npm.

## Installation

```bash
npm install gopher-orch
```

The package will automatically install the correct native library for your platform as an optional dependency.

### Supported Platforms

| Platform | Architecture | Package |
|----------|-------------|---------|
| macOS | ARM64 (Apple Silicon) | @gopher-test/gopher-orch-darwin-arm64 |
| macOS | x64 (Intel) | @gopher-test/gopher-orch-darwin-x64 |
| Linux | x64 | @gopher-test/gopher-orch-linux-x64 |
| Linux | ARM64 | @gopher-test/gopher-orch-linux-arm64 |
| Windows | x64 | @gopher-test/gopher-orch-win32-x64 |
| Windows | ARM64 | @gopher-test/gopher-orch-win32-arm64 |

## Quick Start

### Using API Key

```typescript
import { GopherAgent } from 'gopher-orch';

// Create agent with API key (fetches server config from Gopher API)
const agent = GopherAgent.createWithApiKey(
  'AnthropicProvider',
  'claude-3-haiku-20240307',
  'your-gopher-api-key'
);

// Run a query
const answer = agent.run('What is the weather like in New York?');
console.log(answer);

// Clean up when done
agent.dispose();
```

### Using Server Configuration

```typescript
import { GopherAgent } from 'gopher-orch';

// Server configuration JSON
const serverConfig = JSON.stringify({
  succeeded: true,
  code: 200000000,
  message: 'success',
  data: {
    servers: [
      {
        version: '2025-01-09',
        serverId: '1',
        name: 'my-mcp-server',
        transport: 'http_sse',
        config: {
          url: 'http://localhost:3001/mcp',
          headers: {}
        },
        connectTimeout: 5000,
        requestTimeout: 30000,
      },
    ],
  },
});

// Create agent with server config
const agent = GopherAgent.createWithServerConfig(
  'AnthropicProvider',
  'claude-3-haiku-20240307',
  serverConfig
);

// Run a query
const answer = agent.run('List available tools');
console.log(answer);

// Clean up when done
agent.dispose();
```

## Configuration Builder Pattern

For more control, use the configuration builder:

```typescript
import { GopherAgent, GopherAgentConfig } from 'gopher-orch';

const config = GopherAgentConfig.builder()
  .provider('AnthropicProvider')
  .model('claude-3-haiku-20240307')
  .apiKey('your-gopher-api-key')
  .build();

const agent = GopherAgent.create(config);
const answer = agent.run('Hello, what can you do?');
agent.dispose();
```

## Running the Example

### Prerequisites

1. Node.js 18+ installed
2. MCP servers running (see examples/server3001 and examples/server3002)
3. ANTHROPIC_API_KEY environment variable set

### Run with the provided script

```bash
cd examples/npm

# Use default (latest) SDK version
./client_example_json_run.sh

# Or specify a specific version
SDK_VERSION=0.1.0-20260131-170458 ./client_example_json_run.sh
```

### Run manually

```bash
# Create a new project
mkdir my-gopher-app && cd my-gopher-app
npm init -y

# Install dependencies
npm install gopher-orch tsx typescript

# Create your TypeScript file (e.g., app.ts)
# Then run:
npx tsx app.ts
```

## API Reference

### GopherAgent

#### Static Methods

- `GopherAgent.createWithApiKey(provider, model, apiKey)` - Create agent using Gopher API key
- `GopherAgent.createWithServerConfig(provider, model, serverConfigJson)` - Create agent with server configuration JSON
- `GopherAgent.create(config)` - Create agent with GopherAgentConfig object

#### Instance Methods

- `agent.run(query, timeoutMs?)` - Run a query and return the response
- `agent.dispose()` - Release resources (must be called when done)

### GopherAgentConfig

#### Builder Methods

- `.provider(name)` - Set the LLM provider (e.g., 'AnthropicProvider')
- `.model(name)` - Set the model name (e.g., 'claude-3-haiku-20240307')
- `.apiKey(key)` - Set the Gopher API key
- `.serverConfig(json)` - Set the server configuration JSON
- `.build()` - Build the configuration object

## Troubleshooting

### Native library not found

If you see "Failed to load gopher-orch native library", ensure:

1. You're on a supported platform
2. The optional dependency was installed correctly
3. Try reinstalling: `npm install gopher-orch --force`

### Permission errors on macOS

If you get permission errors loading the library:

```bash
xattr -d com.apple.quarantine node_modules/@gopher-test/gopher-orch-darwin-*/lib/*.dylib
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for using Anthropic models
- `GOPHER_DEBUG=1` - Enable debug logging for library loading
