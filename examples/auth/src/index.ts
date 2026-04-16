/**
 * JS Auth MCP Server - Entry Point
 *
 * OAuth-protected MCP server example using GopherAuth reusable module.
 * Replaces ~800 lines of hand-written auth code with the module from
 * '@gopher.security/gopher-mcp-js'.
 */

import express from 'express';
import path from 'path';
import { GopherAuth } from '@gopher.security/gopher-mcp-js';
import { registerMcpHandler } from './routes/mcp-handler';
import { registerWeatherTools } from './tools/weather-tools';

function printBanner(): void {
  console.log('');
  console.log('========================================');
  console.log('    JS Auth MCP Server');
  console.log('    OAuth-Protected MCP Example');
  console.log('========================================');
  console.log('');
}

async function main(): Promise<void> {
  printBanner();

  // Determine config path
  const configPath =
    process.argv[2] || path.join(__dirname, '..', 'server.config');

  // Initialize GopherAuth from config file
  const auth = new GopherAuth({ configPath });
  try {
    auth.initialize();
    console.log('GopherAuth initialized successfully');
  } catch (error) {
    console.error(`Failed to initialize GopherAuth: ${error}`);
    process.exit(1);
  }

  // Create Express app
  const app = express();
  app.use(express.json());

  // Register OAuth discovery + flow + health endpoints
  auth.registerOAuthRoutes(app);

  // Apply auth middleware to protected routes
  app.use(auth.expressMiddleware({
    publicMethods: ['initialize'],
    toolScopes: {
      'get-forecast': ['mcp:read'],
      'get-weather-alerts': ['mcp:admin'],
    },
  }));

  // Register MCP handler
  const mcpHandler = registerMcpHandler(app);

  // Register weather tools
  registerWeatherTools(mcpHandler, auth);

  // Start server
  const port = auth.nativeConfig?.getInt('port') ?? 3001;
  const host = auth.nativeConfig?.getString('host') ?? '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`Server started on ${host}:${port}`);
    console.log('Press Ctrl+C to shutdown');
  });

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('\nShutting down...');
    server.close();
    auth.shutdown();
    console.log('Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
