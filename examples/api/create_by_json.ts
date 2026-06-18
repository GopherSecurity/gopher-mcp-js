#!/usr/bin/env npx tsx
/**
 * SDK example for GopherAgent.createWithServerConfig.
 *
 * TypeScript port of gopher-orch/examples/sdk/api/create_by_json.cc.
 *
 * Builds a GopherAgent from an inline server JSON document, skipping the
 * remote /v1/mcp-servers fetch that createWithApiKey performs. Useful when
 * the caller already knows which MCP servers to bind to and wants to skip
 * the round-trip; the inline payload follows the
 * { succeeded, code, message, data: { servers: [...] } } shape that
 * ConfigLoader on the C++ side accepts.
 *
 * Provider defaults to AnthropicProvider; the model is taken from
 * LLM_MODEL. Edit SERVER_CONFIG below to point at your own MCP servers.
 *
 * Configuration (env vars):
 *   LLM_PROVIDER  Optional. Defaults to "AnthropicProvider".
 *   LLM_MODEL     Required. Model identifier the provider accepts.
 *   DEBUG         When set, koffi prints library-resolution diagnostics.
 *
 * Usage:
 *   npx tsx create_by_json.ts                              # built-in query
 *   npx tsx create_by_json.ts "query one" "query two" ...  # supplied queries
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

const MODEL_PLACEHOLDER = '{YOUR_LLM_MODEL}';

const SERVER_CONFIG = JSON.stringify({
  succeeded: true,
  code: 200000000,
  message: 'success',
  data: {
    servers: [
      {
        version: '2025-01-09',
        serverId: '1877234567890123456',
        name: 'gopher-auth-server',
        transport: 'http_sse',
        config: {
          url: 'http://127.0.0.1:3001/rpc',
          headers: {},
        },
        connectTimeout: 5000,
        requestTimeout: 30000,
      },
    ],
  },
});

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function main(): void {
  console.log('=== GopherAgent.createWithServerConfig example ===');
  console.log(`Usage: npx tsx ${__filename} [query1] [query2] ...`);
  console.log('Env:   LLM_PROVIDER LLM_MODEL DEBUG');
  console.log('');

  const queries =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['What time is it in Tokyo?'];

  const provider = envOr('LLM_PROVIDER', 'AnthropicProvider');
  const model = envOr('LLM_MODEL', MODEL_PLACEHOLDER);

  console.log(`Provider: ${provider}`);
  console.log(
    `Model:    ${model === MODEL_PLACEHOLDER ? `${model}  (set LLM_MODEL)` : model}`
  );
  console.log(`Queries:  ${queries.length}`);

  if (model === MODEL_PLACEHOLDER) {
    console.error('\nError: LLM_MODEL must be set.');
    process.exit(1);
  }

  console.log('\nCreating agent via GopherAgent.createWithServerConfig...');
  const agent = GopherAgent.createWithServerConfig(
    provider,
    model,
    SERVER_CONFIG
  );
  console.log('Agent created successfully!');

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
