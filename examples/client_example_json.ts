#!/usr/bin/env npx tsx
/**
 * Example using JSON server configuration.
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

// Server configuration for local MCP servers
const SERVER_CONFIG = JSON.stringify({
  succeeded: true,
  code: 200000000,
  message: 'success',
  data: {
    servers: [
      {
        version: '2025-01-09',
        serverId: 'luma',
        name: 'luma',
        transport: 'http_sse',
        config: {
          url: 'https://mcp.gopher.security/v1/mcp/servers/ns5cutvjvu328m320ss3qr40hcx5njrv/mcp',
          headers: {}
        },
        connectTimeout: 10000,
        requestTimeout: 60000
      }
    ]
  }
});

function main(): void {
  const provider = 'AnthropicProvider';
  const model = 'claude-haiku-4-5-20251001';

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
