#!/usr/bin/env npx tsx
/**
 * SDK example for GopherAgent.createWithUrl with dynamic MCP headers.
 *
 * TypeScript port of gopher-orch/examples/sdk/header/access_token_create_by_url.cc.
 *
 * Shows the runtime options object:
 *
 *   GopherAgent.createWithUrl(provider, model, mcpUrl, {
 *     accessToken: userAccessToken,
 *     headers: { 'x-trace-id': '...' },
 *   });
 *
 * accessToken is a convenience alias for Authorization: Bearer <token>
 * on MCP runtime traffic only. Explicit headers.Authorization takes
 * precedence on the native side.
 */

import {
  GopherAgent,
  GopherAgentRuntimeOptions,
} from '@gopher.security/gopher-mcp-js';

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function queriesFromArgs(): string[] {
  const args = process.argv.slice(2);
  return args.length > 0 ? args : ['What is the weather in Tokyo?'];
}

function main(): void {
  console.log('=== GopherAgent.createWithUrl dynamic header example ===');
  console.log(`Usage: npx tsx ${__filename} [query1] [query2] ...`);
  console.log(
    'Env:   GOPHER_MCP_URL GOPHER_ACCESS_TOKEN GOPHER_SDK_TEST GOPHER_MCP_LOG_FLOW DEBUG'
  );
  console.log('');

  const provider = envOr('LLM_PROVIDER', 'AnthropicProvider');
  const model = envOr('LLM_MODEL', 'claude-haiku-4-5-20251001');
  const mcpUrl = envOr('GOPHER_MCP_URL', 'http://127.0.0.1:5001/mcp');
  const accessToken = envOr('GOPHER_ACCESS_TOKEN', '');
  const queries = queriesFromArgs();

  console.log(`Provider:       ${provider}`);
  console.log(`Model:          ${model}`);
  console.log(`MCP URL:        ${mcpUrl}`);
  console.log(
    `Access token:   ${
      accessToken.length === 0
        ? '<empty; set GOPHER_ACCESS_TOKEN for protected MCP>'
        : '<set via GOPHER_ACCESS_TOKEN>'
    }`
  );
  console.log(`Queries:        ${queries.length}`);

  const runtimeOptions: GopherAgentRuntimeOptions = {
    accessToken,
    headers: {
      'x-gopher-example': 'header-create-by-url',
    },
  };

  console.log(
    '\nCreating agent via GopherAgent.createWithUrl(..., options)...'
  );
  const agent = GopherAgent.createWithUrl(
    provider,
    model,
    mcpUrl,
    runtimeOptions
  );

  try {
    queries.forEach((query, i) => {
      console.log(`\nQuery ${i + 1}: ${query}`);
      const answer = agent.run(query);
      console.log(`\nAgent Response ${i + 1}:`);
      console.log('--------------------------------');
      console.log(answer);
      console.log('--------------------------------');
    });
  } finally {
    agent.dispose();
  }
}

try {
  main();
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  if ((e as Error).stack) {
    console.error((e as Error).stack);
  }
  process.exit(1);
}
