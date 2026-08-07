# @gopher.security/gopher-mcp-js

TypeScript SDK for AI Agent orchestration with MCP (Model Context Protocol) support.

[![npm version](https://img.shields.io/npm/v/@gopher.security/gopher-mcp-js.svg)](https://www.npmjs.com/package/@gopher.security/gopher-mcp-js)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Features

- **Multi-Provider LLM Support** - Anthropic, OpenAI, Google, Azure, and more
- **MCP Protocol** - Full Model Context Protocol client support
- **Native Performance** - Powered by C++ core with TypeScript bindings
- **Tool Orchestration** - Execute tools across multiple MCP servers
- **Type Safety** - Full TypeScript support with strict mode

## Supported LLM Providers

| Provider | Models |
|----------|--------|
| Anthropic | Claude 3.5 Sonnet, Claude 3 Haiku, Claude 3 Opus |
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4 Turbo |
| Google | Gemini 2.5 Flash, Gemini 2.0 Pro |
| Azure OpenAI | GPT-4o, GPT-4 (via Azure deployment) |

## Installation

```bash
npm install @gopher.security/gopher-mcp-js
```

The package automatically installs the correct native library for your platform:
- macOS (ARM64, x64)
- Linux (ARM64, x64)
- Windows (ARM64, x64)

## Quick Start

### Using Gopher API Key (Recommended)

```typescript
import { GopherAgent } from '@gopher.security/gopher-mcp-js';

// Create agent with Gopher API key (fetches MCP config automatically)
const agent = await GopherAgent.createWithApiKey(
  'AnthropicProvider',
  'claude-3-haiku-20240307',
  process.env.GOPHER_API_KEY!
);

try {
  const answer = agent.run('List all my Gmail drafts');
  console.log(answer);
} finally {
  agent.dispose();
}
```

### Using Custom Server Configuration

```typescript
import { GopherAgent } from '@gopher.security/gopher-mcp-js';

const serverConfig = JSON.stringify({
  succeeded: true,
  code: 200000000,
  message: 'success',
  data: {
    servers: [
      {
        version: '2025-01-09',
        serverId: '1',
        name: 'my-server',
        transport: 'http_sse',
        config: { url: 'http://localhost:3001/mcp', headers: {} },
        connectTimeout: 5000,
        requestTimeout: 30000,
      },
    ],
  },
});

const agent = GopherAgent.createWithServerConfig(
  'OpenAIProvider',
  'gpt-4o-mini',
  serverConfig
);

try {
  const answer = agent.run('What tools are available?');
  console.log(answer);
} finally {
  agent.dispose();
}
```

### Using Configuration Builder

```typescript
import { GopherAgent, GopherAgentConfig } from '@gopher.security/gopher-mcp-js';

const config = GopherAgentConfig.builder()
  .provider('AnthropicProvider')
  .model('claude-3-haiku-20240307')
  .apiKey(process.env.GOPHER_API_KEY!)
  .build();

const agent = await GopherAgent.createAsync(config);

try {
  const answer = agent.run('Hello, what can you do?');
  console.log(answer);
} finally {
  agent.dispose();
}
```

### OAuth-Protected MCP Servers

Use the async factories with `oauth: { mode: 'auto' }` when an MCP endpoint may require OAuth. The SDK probes the endpoint, discovers OAuth metadata, opens the authorization flow when needed, and passes the acquired access token to the native agent runtime.

```typescript
import { GopherAgent } from '@gopher.security/gopher-mcp-js';

const agent = await GopherAgent.createWithUrlAsync(
  'AnthropicProvider',
  'claude-3-haiku-20240307',
  process.env.GOPHER_MCP_URL!,
  { oauth: { mode: 'auto' } }
);

try {
  console.log(agent.run('List available tools'));
} finally {
  agent.dispose();
}
```

The same OAuth option is supported by `createWithApiKey`, `createAsync(config)`, `createWithServerId`, `createWithServerName`, `createWithGatewayId`, `createWithGatewayName`, and `createWithServerConfigAsync`.

For terminal or SSH workflows where the SDK should not launch a browser automatically:

```typescript
const agent = await GopherAgent.createWithUrlAsync(provider, model, url, {
  oauth: {
    mode: 'auto',
    openBrowser: false,
  },
});
```

## API Reference

### GopherAgent

```typescript
// Create agent with Gopher API key; supports OAuth create options
GopherAgent.createWithApiKey(provider, model, apiKey, options?): Promise<GopherAgent>

// Create agent with server configuration JSON
GopherAgent.createWithServerConfig(provider, model, serverConfigJson, options?): GopherAgent

// Create agent with server configuration JSON; supports OAuth create options
GopherAgent.createWithServerConfigAsync(provider, model, serverConfigJson, options?): Promise<GopherAgent>

// Create agent directly from an MCP URL
GopherAgent.createWithUrl(provider, model, url, runtimeOptions?): GopherAgent

// Create agent directly from an MCP URL; supports OAuth create options
GopherAgent.createWithUrlAsync(provider, model, url, options?): Promise<GopherAgent>

// Create agent scoped to one server or gateway; supports OAuth create options
GopherAgent.createWithServerId(provider, model, apiKey, serverId, options?): Promise<GopherAgent>
GopherAgent.createWithServerName(provider, model, apiKey, serverName, options?): Promise<GopherAgent>
GopherAgent.createWithGatewayId(provider, model, apiKey, gatewayId, options?): Promise<GopherAgent>
GopherAgent.createWithGatewayName(provider, model, apiKey, gatewayName, options?): Promise<GopherAgent>

// Create agent with config object and inline server config
GopherAgent.create(config): GopherAgent

// Create agent with config object and remote API-key fetch
GopherAgent.createAsync(config): Promise<GopherAgent>

// Run a query
agent.run(query, timeoutMs?): string

// Run with detailed result
agent.runDetailed(query, timeoutMs?): AgentResult

// Release resources (must be called when done)
agent.dispose(): void
```

### OAuth Notes

OAuth auto-flow is Node/local-app oriented. Synchronous factories do not open a browser or run an OAuth flow; use async factories when OAuth may be required. If you already have credentials, pass `accessToken` or `headers.Authorization` and the SDK will skip OAuth discovery.

Token precedence is explicit caller credential first: `headers.Authorization` wins over `accessToken`, and `accessToken` wins over an OAuth-acquired token. Unrelated runtime headers are preserved.

Multi-server OAuth currently supports one shared token only when every protected MCP endpoint is clearly equivalent by issuer, resource, and scopes. If protected servers differ, creation fails with a per-server-token unsupported error until native per-server token plumbing is available.

Tokens are kept in memory by default. The SDK does not persist OAuth tokens to disk unless the caller provides a custom token store that does so.

### Error Handling

```typescript
import {
  GopherAgent,
  AgentError,
  ApiKeyError,
  ConnectionError,
  TimeoutError
} from '@gopher.security/gopher-mcp-js';

try {
  const agent = await GopherAgent.createWithApiKey(provider, model, apiKey);
  const result = agent.run('query');
  agent.dispose();
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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOPHER_API_KEY` | Your Gopher API key (get one at https://gopher.security) |
| `ANTHROPIC_API_KEY` | Required when using AnthropicProvider |
| `OPENAI_API_KEY` | Required when using OpenAIProvider |
| `GOOGLE_API_KEY` | Required when using GoogleProvider |
| `AZURE_OPENAI_API_KEY` | Required when using AzureProvider |
| `GOPHER_SDK_TEST=true` | Route API calls to `https://api-test.gopher.security` instead of the default `https://api.gopher.security` (staging/QA only; accepts `true`, `1`, or `yes`, case-insensitively; all other values stay on production). |
| `GOPHER_DEBUG=1` | Enable debug logging |

## Platform Packages

The SDK uses platform-specific packages for native binaries:

| Platform | Package |
|----------|---------|
| macOS ARM64 | `@gopher.security/gopher-orch-darwin-arm64` |
| macOS x64 | `@gopher.security/gopher-orch-darwin-x64` |
| Linux ARM64 | `@gopher.security/gopher-orch-linux-arm64` |
| Linux x64 | `@gopher.security/gopher-orch-linux-x64` |
| Windows ARM64 | `@gopher.security/gopher-orch-win32-arm64` |
| Windows x64 | `@gopher.security/gopher-orch-win32-x64` |

These are installed automatically as optional dependencies.

## Requirements

- Node.js 18+
- Supported platforms: macOS, Linux, Windows (ARM64 or x64)

## Troubleshooting

### Native library not found

If you see "Failed to load gopher-mcp native library":

1. Ensure you're on a supported platform
2. Try reinstalling: `npm install @gopher.security/gopher-mcp-js --force`
3. Enable debug logging: `GOPHER_DEBUG=1 node your-app.js`

### Permission errors on macOS

```bash
xattr -d com.apple.quarantine node_modules/@gopher.security/gopher-orch-darwin-*/lib/*.dylib
```

## Links

- [GitHub Repository](https://github.com/GopherSecurity/gopher-mcp-js)
- [Gopher Security](https://gopher.security)
- [MCP Protocol Specification](https://modelcontextprotocol.io)

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.
