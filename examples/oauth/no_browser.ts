#!/usr/bin/env npx tsx
/**
 * OAuth-aware URL example without automatic browser launch.
 *
 * Required environment:
 *   GOPHER_MCP_URL   OAuth-protected or public MCP endpoint URL.
 *   LLM_MODEL        Model identifier accepted by the provider.
 *
 * Optional environment:
 *   LLM_PROVIDER     Defaults to "AnthropicProvider".
 *
 * Use this in terminals, SSH sessions, or environments where opening a local
 * browser automatically is not desirable. The SDK prints the authorization
 * URL, then waits for the loopback callback after you complete login manually.
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
  const url = requiredEnv('GOPHER_MCP_URL');
  const query = process.argv.slice(2).join(' ') || 'What tools are available?';

  const agent = await GopherAgent.createWithUrlAsync(provider, model, url, {
    oauth: {
      mode: 'auto',
      openBrowser: false,
    },
  });

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
