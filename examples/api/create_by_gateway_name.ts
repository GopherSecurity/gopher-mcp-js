#!/usr/bin/env npx tsx
/**
 * SDK example for GopherAgent.createWithGatewayName.
 *
 * TypeScript port of gopher-orch/examples/sdk/api/create_by_gateway_name.cc.
 *
 * Scopes a GopherAgent to a single MCP gateway in the caller's workspace
 * by human-readable name. Internally this hits the same GET
 * /v1/mcp-servers endpoint as createWithApiKey under the Bearer api
 * key, but adds the "?gatewayName={name}" routing query so the response
 * carries the backing MCP servers for that gateway. Use this when the
 * api key owns several gateways and the agent should bind to exactly
 * one identified by name rather than id.
 *
 * Provider defaults to AnthropicProvider; the model is taken from
 * LLM_MODEL. Override either via env or by editing the constants in
 * main().
 *
 * Configuration (env vars):
 *   GOPHER_API_KEY           Gopher API key for /v1/mcp-servers
 *   GOPHER_MCP_GATEWAY_NAME  MCP gateway name to scope the agent to
 *   LLM_PROVIDER             Optional. Defaults to "AnthropicProvider".
 *   LLM_MODEL                Required. Model identifier the provider accepts.
 *   DEBUG                    When set, koffi prints library-resolution diagnostics.
 *
 * Usage:
 *   npx tsx create_by_gateway_name.ts                              # built-in query
 *   npx tsx create_by_gateway_name.ts "query one" "query two" ...  # supplied queries
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

const API_KEY_PLACEHOLDER = '{YOUR_GOPHER_API_KEY}';
const GATEWAY_NAME_PLACEHOLDER = '{YOUR_MCP_GATEWAY_NAME}';
const MODEL_PLACEHOLDER = '{YOUR_LLM_MODEL}';

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function main(): void {
  console.log('=== GopherAgent.createWithGatewayName example ===');
  console.log(`Usage: npx tsx ${__filename} [query1] [query2] ...`);
  console.log(
    'Env:   GOPHER_API_KEY GOPHER_MCP_GATEWAY_NAME LLM_PROVIDER LLM_MODEL DEBUG'
  );
  console.log('');

  const queries =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['What time is it in Tokyo?'];

  const provider = envOr('LLM_PROVIDER', 'AnthropicProvider');
  const model = envOr('LLM_MODEL', MODEL_PLACEHOLDER);
  const apiKey = envOr('GOPHER_API_KEY', API_KEY_PLACEHOLDER);
  const gatewayName = envOr(
    'GOPHER_MCP_GATEWAY_NAME',
    GATEWAY_NAME_PLACEHOLDER
  );

  console.log(`Provider:         ${provider}`);
  console.log(
    `Model:            ${model === MODEL_PLACEHOLDER ? `${model}  (set LLM_MODEL)` : model}`
  );
  console.log(
    `API key:          ${apiKey === API_KEY_PLACEHOLDER ? `${apiKey}  (set GOPHER_API_KEY)` : '<set via GOPHER_API_KEY>'}`
  );
  console.log(
    `MCP gateway name: ${gatewayName === GATEWAY_NAME_PLACEHOLDER ? `${gatewayName}  (set GOPHER_MCP_GATEWAY_NAME)` : gatewayName}`
  );
  console.log(`Queries:          ${queries.length}`);

  if (
    model === MODEL_PLACEHOLDER ||
    apiKey === API_KEY_PLACEHOLDER ||
    gatewayName === GATEWAY_NAME_PLACEHOLDER
  ) {
    console.error(
      '\nError: LLM_MODEL, GOPHER_API_KEY, and GOPHER_MCP_GATEWAY_NAME must all be set.'
    );
    process.exit(1);
  }

  console.log('\nCreating agent via GopherAgent.createWithGatewayName...');
  const agent = GopherAgent.createWithGatewayName(
    provider,
    model,
    apiKey,
    gatewayName
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
