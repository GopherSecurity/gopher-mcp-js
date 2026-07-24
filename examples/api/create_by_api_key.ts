#!/usr/bin/env npx tsx
/**
 * SDK example for GopherAgent.createWithApiKey.
 *
 * TypeScript port of gopher-orch/examples/sdk/api/create_by_api_key.cc.
 *
 * Uses a Gopher API key to fetch the caller's full MCP server inventory
 * via GET /v1/mcp-servers; the agent gets every server the api key owns
 * with no extra routing. Smallest of the seven create_by_* examples and
 * a good first sanity check that the toolchain (tsx, koffi loading the
 * right native lib, env vars) is wired correctly.
 *
 * Provider defaults to AnthropicProvider; the model is taken from
 * LLM_MODEL. Override either via env or by editing the constants in
 * main().
 *
 * Configuration (env vars):
 *   GOPHER_API_KEY  Gopher API key for /v1/mcp-servers
 *   LLM_PROVIDER    Optional. Defaults to "AnthropicProvider".
 *   LLM_MODEL       Required. Model identifier the provider accepts.
 *   DEBUG           When set, koffi prints library-resolution diagnostics.
 *
 * Usage:
 *   npx tsx create_by_api_key.ts                              # built-in query
 *   npx tsx create_by_api_key.ts "query one" "query two" ...  # supplied queries
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

const API_KEY_PLACEHOLDER = '{YOUR_GOPHER_API_KEY}';
const MODEL_PLACEHOLDER = '{YOUR_LLM_MODEL}';

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

async function main(): Promise<void> {
  console.log('=== GopherAgent.createWithApiKey example ===');
  console.log(`Usage: npx tsx ${__filename} [query1] [query2] ...`);
  console.log('Env:   GOPHER_API_KEY LLM_PROVIDER LLM_MODEL DEBUG');
  console.log('');

  const queries =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['What time is it in Tokyo?'];

  const provider = envOr('LLM_PROVIDER', 'AnthropicProvider');
  const model = envOr('LLM_MODEL', MODEL_PLACEHOLDER);
  const apiKey = envOr('GOPHER_API_KEY', API_KEY_PLACEHOLDER);

  console.log(`Provider: ${provider}`);
  console.log(
    `Model:    ${model === MODEL_PLACEHOLDER ? `${model}  (set LLM_MODEL)` : model}`
  );
  console.log(
    `API key:  ${apiKey === API_KEY_PLACEHOLDER ? `${apiKey}  (set GOPHER_API_KEY)` : '<set via GOPHER_API_KEY>'}`
  );
  console.log(`Queries:  ${queries.length}`);

  if (model === MODEL_PLACEHOLDER || apiKey === API_KEY_PLACEHOLDER) {
    console.error('\nError: LLM_MODEL and GOPHER_API_KEY must both be set.');
    process.exit(1);
  }

  console.log('\nCreating agent via GopherAgent.createWithApiKey...');
  const agent = await GopherAgent.createWithApiKey(provider, model, apiKey);
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

void main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  if ((e as Error).stack) {
    console.error((e as Error).stack);
  }
  process.exit(1);
});
