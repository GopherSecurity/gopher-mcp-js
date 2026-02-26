#!/usr/bin/env npx tsx
/**
 * Example using JSON server configuration with npm-installed SDK.
 *
 * This example shows how to use the gopher-orch SDK when installed via npm.
 * The native library is automatically loaded from the platform-specific package.
 */

import { GopherAgent } from '@gopher.security/gopher-mcp';

// Server configuration for local MCP servers
const SERVER_CONFIG = JSON.stringify({
  succeeded: true,
  code: 200000000,
  message: 'success',
  data: {
    servers: [
      {
        version: '2025-01-09',
        serverId: '1',
        name: 'server1',
        transport: 'http_sse',
        config: { url: 'http://127.0.0.1:3001/mcp', headers: {} },
        connectTimeout: 5000,
        requestTimeout: 30000,
      },
      {
        version: '2025-01-09',
        serverId: '2',
        name: 'server2',
        transport: 'http_sse',
        config: { url: 'http://127.0.0.1:3002/mcp', headers: {} },
        connectTimeout: 5000,
        requestTimeout: 30000,
      },
    ],
  },
});

function main(): void {
  const provider = 'AnthropicProvider';
  const model = 'claude-3-haiku-20240307';

  try {
    // Create agent with JSON server configuration
    const agent = GopherAgent.createWithServerConfig(
      provider,
      model,
      SERVER_CONFIG
    );
    console.log('GopherAgent created!');

    // Get question from command line args or use default
    const args = process.argv.slice(2);
    const question =
      args.length > 0
        ? args.join(' ')
        : 'What is the weather like in New York?';
    console.log(`Question: ${question}`);

    // Run the query
    const answer = agent.run(question);
    console.log('Answer:');
    console.log(answer);

    // Cleanup
    agent.dispose();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    console.error((e as Error).stack);
    process.exit(1);
  }
}

main();
