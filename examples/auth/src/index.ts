/**
 * JS Auth MCP Server - Entry Point
 *
 * OAuth-protected MCP server using GopherAuth module and
 * StreamableHTTPServerTransport from @modelcontextprotocol/sdk.
 * Mirrors the pattern from gopher-auth-example-server.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { GopherAuth } from '@gopher.security/gopher-mcp-js';
import { MCPServer } from './server';
import { registerWeatherTools } from './tools/weather-tools';

const MCP_ENDPOINT = '/mcp';

async function main(): Promise<void> {
  console.log('');
  console.log('========================================');
  console.log('    JS Auth MCP Server');
  console.log('========================================');
  console.log('');

  // Initialize GopherAuth
  const configPath =
    process.argv[2] || path.join(__dirname, '..', 'server.config');
  const auth = new GopherAuth({ configPath });
  try {
    auth.initialize();
    console.log('GopherAuth initialized successfully');
  } catch (error) {
    console.error(`Failed to initialize GopherAuth: ${error}`);
    process.exit(1);
  }

  // Create MCP server with StreamableHTTP transport
  const mcpServer = new MCPServer();

  // Register weather tools on the MCP server
  registerWeatherTools(mcpServer.getMcpServer(), auth);

  // Create Express app
  const app = express();

  // 1. CORS — must be first (same as working gopher-auth-example-server)
  app.use(cors());

  // 2. Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // 3. OAuth discovery + flow + health routes (public, no auth)
  auth.registerOAuthRoutes(app);

  // 4. MCP endpoint — auth middleware + StreamableHTTP handler
  app.all(
    MCP_ENDPOINT,
    // Auth middleware (skips 'initialize' method)
    auth.expressMiddleware({
      publicMethods: ['initialize'],
      toolScopes: {
        'get-forecast': ['mcp:read'],
        'get-weather-alerts': ['mcp:admin'],
      },
    }),
    // MCP handler (StreamableHTTP — handles GET for SSE, POST for JSON-RPC)
    async (req: express.Request, res: express.Response) => {
      try {
        await mcpServer.handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message:
                err instanceof Error ? err.message : 'Internal error',
            },
            id: (req.body as Record<string, unknown>)?.id ?? null,
          });
        }
      }
    }
  );

  // Start server
  const port = auth.nativeConfig?.getInt('port') ?? 3001;
  const host = auth.nativeConfig?.getString('host') ?? '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`Server started on ${host}:${port}`);
    console.log(`MCP endpoint: http://localhost:${port}${MCP_ENDPOINT}`);
    console.log('Press Ctrl+C to shutdown');
  });

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
