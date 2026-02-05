#!/usr/bin/env npx tsx
/**
 * Example using Gopher API key to fetch server configuration.
 *
 * This example demonstrates how to use GopherAgent.createWithApiKey()
 * which fetches MCP server configurations from the Gopher API.
 */

import { GopherAgent } from '../src';

function main(): void {
  const provider = 'AnthropicProvider';
  const model = 'claude-3-haiku-20240307';

  // Your Gopher API key - get one from https://gopher.security
  const apiKey = process.env.GOPHER_API_KEY || '{YOUR_GOPHER_API_KEY}';

  if (apiKey === '{YOUR_GOPHER_API_KEY}') {
    console.error('Error: Please set GOPHER_API_KEY environment variable');
    console.error('  export GOPHER_API_KEY=your_api_key_here');
    process.exit(1);
  }

  console.log('=== Gopher Agent API Example ===');
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`API Key: ${apiKey.substring(0, 10)}...`);
  console.log('');

  try {
    // Create agent with API key - fetches server config from Gopher API
    console.log('Creating agent with API key...');
    console.log(`  Calling createWithApiKey("${provider}", "${model}", "${apiKey.substring(0, 10)}...")`);
    const agent = GopherAgent.createWithApiKey(provider, model, apiKey);
    console.log('GopherAgent created successfully!');
    console.log(`  Agent handle: ${agent ? 'valid' : 'null'}`);
    console.log('');

    // Get question from command line args or use default
    const args = process.argv.slice(2);
    const question =
      args.length > 0
        ? args.join(' ')
        : 'What tools are available? List their names.';

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
