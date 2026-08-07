#!/usr/bin/env npx tsx
/**
 * OAuth-aware server-id example for local Node apps.
 *
 * Required environment:
 *   GOPHER_API_KEY        Gopher API key for fetching server config.
 *   GOPHER_MCP_SERVER_ID  MCP server id to bind this agent to.
 *   LLM_MODEL             Model identifier accepted by the provider.
 *
 * Optional environment:
 *   LLM_PROVIDER          Defaults to "AnthropicProvider".
 *
 * The async factory fetches the server config first, extracts the MCP URL,
 * and starts OAuth only when the selected backend requires it.
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

async function main(): Promise<void> {
  const provider = process.env['LLM_PROVIDER'] ?? 'AnthropicProvider';
  const model = requiredEnv('LLM_MODEL');
  const apiKey = requiredEnv('GOPHER_API_KEY');
  const serverId = requiredEnv('GOPHER_MCP_SERVER_ID');
  const query = process.argv.slice(2).join(' ') || 'What tools are available?';

  const agent = await GopherAgent.createWithServerId(
    provider,
    model,
    apiKey,
    serverId,
    { oauth: { mode: 'auto' } }
  );

  try {
    console.log(agent.run(query));
  } finally {
    agent.dispose();
  }
}

void main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
