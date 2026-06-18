#!/usr/bin/env npx tsx
/**
 * SDK example for GopherAgent.createWithServerName.
 *
 * TypeScript port of gopher-orch/examples/sdk/api/create_by_server_name.cc.
 *
 * Scopes a GopherAgent to a single MCP server in the caller's workspace
 * by human-readable name. Internally this hits the same GET
 * /v1/mcp-servers endpoint as createWithApiKey under the Bearer api
 * key, but adds the "?serverName={name}" routing query so the response
 * carries only the matching server entry. Use this when the api key
 * owns several MCP servers and the agent should bind to exactly one
 * identified by name rather than id.
 *
 * Provider defaults to AnthropicProvider; the model is taken from
 * LLM_MODEL. Override either via env or by editing the constants in
 * main().
 *
 * Configuration (env vars):
 *   GOPHER_API_KEY          Gopher API key for /v1/mcp-servers
 *   GOPHER_MCP_SERVER_NAME  MCP server name to scope the agent to
 *   LLM_PROVIDER            Optional. Defaults to "AnthropicProvider".
 *   LLM_MODEL               Required. Model identifier the provider accepts.
 *   DEBUG                   When set, koffi prints library-resolution diagnostics.
 *
 * Usage:
 *   npx tsx create_by_server_name.ts                              # built-in query
 *   npx tsx create_by_server_name.ts "query one" "query two" ...  # supplied queries
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

const API_KEY_PLACEHOLDER = '{YOUR_GOPHER_API_KEY}';
const SERVER_NAME_PLACEHOLDER = '{YOUR_MCP_SERVER_NAME}';
const MODEL_PLACEHOLDER = '{YOUR_LLM_MODEL}';

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function main(): void {
  console.log('=== GopherAgent.createWithServerName example ===');
  console.log(`Usage: npx tsx ${__filename} [query1] [query2] ...`);
  console.log(
    'Env:   GOPHER_API_KEY GOPHER_MCP_SERVER_NAME LLM_PROVIDER LLM_MODEL DEBUG'
  );
  console.log('');

  const queries =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['What time is it in Tokyo?'];

  const provider = envOr('LLM_PROVIDER', 'AnthropicProvider');
  const model = envOr('LLM_MODEL', MODEL_PLACEHOLDER);
  const apiKey = envOr('GOPHER_API_KEY', API_KEY_PLACEHOLDER);
  const serverName = envOr('GOPHER_MCP_SERVER_NAME', SERVER_NAME_PLACEHOLDER);

  console.log(`Provider:        ${provider}`);
  console.log(
    `Model:           ${model === MODEL_PLACEHOLDER ? `${model}  (set LLM_MODEL)` : model}`
  );
  console.log(
    `API key:         ${apiKey === API_KEY_PLACEHOLDER ? `${apiKey}  (set GOPHER_API_KEY)` : '<set via GOPHER_API_KEY>'}`
  );
  console.log(
    `MCP server name: ${serverName === SERVER_NAME_PLACEHOLDER ? `${serverName}  (set GOPHER_MCP_SERVER_NAME)` : serverName}`
  );
  console.log(`Queries:         ${queries.length}`);

  if (
    model === MODEL_PLACEHOLDER ||
    apiKey === API_KEY_PLACEHOLDER ||
    serverName === SERVER_NAME_PLACEHOLDER
  ) {
    console.error(
      '\nError: LLM_MODEL, GOPHER_API_KEY, and GOPHER_MCP_SERVER_NAME must all be set.'
    );
    process.exit(1);
  }

  console.log('\nCreating agent via GopherAgent.createWithServerName...');
  const agent = GopherAgent.createWithServerName(
    provider,
    model,
    apiKey,
    serverName
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
