#!/usr/bin/env npx tsx
/**
 * Example using Gopher API key with npm-installed SDK.
 *
 * This example shows how to use GopherAgent.createWithApiKey() when
 * the gopher-orch SDK is installed via npm. The API key is used to
 * fetch MCP server configurations from the Gopher API.
 */

import { GopherAgent } from '@gopher.security/gopher-mcp-js';

function main(): void {
  // Your Gopher API key - get one from https://gopher.security
  const apiKey = process.env.GOPHER_API_KEY || '{YOUR_GOPHER_API_KEY}';
  const provider = process.env.LLM_PROVIDER || 'AnthropicProvider';
  const model = process.env.LLM_MODEL || 'claude-3-haiku-20240307';

  if (apiKey === '{YOUR_GOPHER_API_KEY}') {
    console.error('Error: Please set GOPHER_API_KEY environment variable');
    console.error('  export GOPHER_API_KEY=your_api_key_here');
    process.exit(1);
  }

  console.log('=== Gopher Agent API Example (npm) ===');
  console.log('');

  try {
    // Create agent with API key - fetches server config from Gopher API
    console.log('Creating agent with API key...');
    console.log(
      `  Calling createWithApiKey("${provider}", "${model}", "${apiKey.substring(0, 10)}...")`
    );
    const agent = GopherAgent.createWithApiKey(provider, model, apiKey);
    console.log('GopherAgent created successfully!');
    console.log(`  Agent handle: ${agent ? 'valid' : 'null'}`);
    console.log('');

    // Get question from command line args or use default
    const args = process.argv.slice(2);
    const question =
      args.length > 0 ? args.join(' ') : 'List all my Gmail drafts.';
    console.log(`Question: ${question}`);
    console.log('');

    // Run the query
    console.log('Running query...');
    const answer = agent.run(question);

    console.log('Answer:');
    console.log('--------------------------------');
    console.log(answer);
    console.log('--------------------------------');

    // Cleanup
    agent.dispose();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    console.error((e as Error).stack);
    process.exit(1);
  }
}

main();
