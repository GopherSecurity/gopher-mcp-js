#!/usr/bin/env node

/**
 * JS Auth MCP Server — migrated from gopher-auth-example-server
 *
 * Uses GopherAuth from @gopher.security/gopher-mcp-js with server.config
 * file for configuration (same format as the C++ auth example).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GopherAuth } from '@gopher.security/gopher-mcp-js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { getWeather } from './tools/get-weather.js';
import { getForecast } from './tools/get-forecast.js';
import { getAlerts } from './tools/get-alerts.js';
import { MCPServer } from './server.js';

// Load config from server.config file
const configPath =
  process.argv[2] ||
  path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'server.config'
  );

// Initialize GopherAuth from config file
const auth = new GopherAuth({ configPath });
auth.initialize();

// Read config values for server setup
const SERVER_PORT = auth.nativeConfig?.getInt('port') ?? 3001;
const SERVER_HOST = auth.nativeConfig?.getString('host') ?? '0.0.0.0';
const SERVER_URL =
  auth.nativeConfig?.getString('server_url') ??
  `http://localhost:${SERVER_PORT}`;
const ALLOWED_SCOPES =
  auth.nativeConfig?.getString('allowed_scopes') ?? 'openid profile email';
const MCP_SCOPES = ALLOWED_SCOPES.split(' ').filter(Boolean);

// Factory: create a new MCP Server instance per session
function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'js-auth-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [getWeather, getForecast, getAlerts],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    switch (toolName) {
      case 'get-weather':
        return getWeather.handler(request);
      case 'get-forecast':
        return getForecast.handler(request);
      case 'get-weather-alerts':
        return getAlerts.handler(request);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  });

  return server;
}

// Create MCP server wrapper with per-session Server instances
const mcpServer = new MCPServer(createMcpServer);

// Start server
async function startServer() {
  const app = express();

  app.use(
    cors({
      exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id'],
    })
  );
  app.use(bodyParser.json());

  // Log ALL incoming requests
  app.use((req: Request, _res: Response, next: Function) => {
    console.log(
      `🌐 ${req.method} ${req.path} [session: ${req.headers['mcp-session-id'] || 'none'}] [auth: ${req.headers['authorization'] ? 'yes' : 'no'}]`
    );
    next();
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: mcpServer.getActiveSessions(),
    });
  });

  // OAuth discovery + flow routes
  auth.registerOAuthRoutes(app, {
    serverUrl: SERVER_URL,
    allowedScopes: MCP_SCOPES,
  });

  // MCP endpoint with auth + StreamableHTTP
  const MCP_ENDPOINT = '/mcp';

  app.all(
    MCP_ENDPOINT,
    auth.expressMiddleware({
      publicMethods: [],
      toolScopes: {
        'get-forecast': MCP_SCOPES,
        'get-weather-alerts': MCP_SCOPES,
      },
    }),
    async (req: Request, res: Response) => {
      await mcpServer.handleRequest(req, res);
    }
  );

  app.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log('========================================');
    console.log('   JS Auth MCP Server');
    console.log('========================================');
    console.log(`🚀 Server: http://${SERVER_HOST}:${SERVER_PORT}`);
    console.log(`📡 MCP: ${SERVER_URL}${MCP_ENDPOINT}`);
    console.log(`🔐 OAuth: ${SERVER_URL}/.well-known/oauth-protected-resource`);
    console.log(`💚 Health: ${SERVER_URL}/health`);
    console.log(`📄 Config: ${configPath}`);
    console.log(`🔑 Auth: ${auth.isDisabled ? 'DISABLED' : 'ENABLED'}`);
    console.log('');
  });
}

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  auth.shutdown();
  process.exit(0);
});

startServer().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
