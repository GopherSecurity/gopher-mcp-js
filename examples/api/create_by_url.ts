#!/usr/bin/env npx tsx
/**
 * SDK example for GopherAgent.createWithUrl.
 *
 * TypeScript port of gopher-orch/examples/sdk/api/create_by_url.cc.
 *
 * Builds a GopherAgent from a single MCP server URL, skipping the remote
 * /v1/mcp-servers fetch that createWithApiKey performs and the inline
 * JSON shape that createWithServerConfig requires. Internally the
 * factory synthesises an http_sse server entry around the URL and
 * delegates to createByJson. Use this for local development or one-off
 * endpoints where the operator already knows the URL.
 *
 * Provider defaults to AnthropicProvider; the model is taken from
 * LLM_MODEL. Override either via env or by editing the constants in
 * main().
 *
 * Configuration (env vars):
 *   GOPHER_MCP_URL      Full URL of the MCP server (e.g. http://127.0.0.1:8080/mcp)
 *   GOPHER_ACCESS_TOKEN Optional. Bearer token for protected MCP runtime traffic.
 *   LLM_PROVIDER        Optional. Defaults to "AnthropicProvider".
 *   LLM_MODEL           Required. Model identifier the provider accepts.
 *   DEBUG               When set, koffi prints library-resolution diagnostics.
 *
 * Usage:
 *   npx tsx create_by_url.ts                              # built-in query
 *   npx tsx create_by_url.ts "query one" "query two" ...  # supplied queries
 */

import {
  GopherAgent,
  GopherAgentRuntimeOptions,
} from '@gopher.security/gopher-mcp-js';

const URL_PLACEHOLDER = '{YOUR_MCP_URL}';
const MODEL_PLACEHOLDER = '{YOUR_LLM_MODEL}';

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function main(): void {
  console.log('=== GopherAgent.createWithUrl example ===');
  console.log(`Usage: npx tsx ${__filename} [query1] [query2] ...`);
  console.log(
    'Env:   GOPHER_MCP_URL GOPHER_ACCESS_TOKEN LLM_PROVIDER LLM_MODEL DEBUG'
  );
  console.log('');

  const queries =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['What time is it in Tokyo?'];

  const provider = envOr('LLM_PROVIDER', 'AnthropicProvider');
  const model = envOr('LLM_MODEL', MODEL_PLACEHOLDER);
  const url = envOr('GOPHER_MCP_URL', URL_PLACEHOLDER);
  const accessToken = envOr('GOPHER_ACCESS_TOKEN', '');

  console.log(`Provider: ${provider}`);
  console.log(
    `Model:    ${model === MODEL_PLACEHOLDER ? `${model}  (set LLM_MODEL)` : model}`
  );
  console.log(
    `MCP URL:  ${url === URL_PLACEHOLDER ? `${url}  (set GOPHER_MCP_URL)` : url}`
  );
  console.log(
    `Access:   ${
      accessToken.length === 0
        ? '<empty; set GOPHER_ACCESS_TOKEN for protected MCP>'
        : '<set via GOPHER_ACCESS_TOKEN>'
    }`
  );
  console.log(`Queries:  ${queries.length}`);

  if (model === MODEL_PLACEHOLDER || url === URL_PLACEHOLDER) {
    console.error('\nError: LLM_MODEL and GOPHER_MCP_URL must both be set.');
    process.exit(1);
  }

  const runtimeOptions: GopherAgentRuntimeOptions | undefined =
    accessToken.length === 0
      ? undefined
      : {
          accessToken,
        };

  console.log('\nCreating agent via GopherAgent.createWithUrl...');
  const agent = GopherAgent.createWithUrl(provider, model, url, runtimeOptions);
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
