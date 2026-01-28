#!/usr/bin/env node

/**
 * Simple MCP Server (No Authentication)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import { getTime } from './tools/get-time.js';
import { generatePassword } from './tools/generate-password.js';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3002', 10);
const SERVER_URL = process.env.SERVER_URL || `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_NAME = process.env.SERVER_NAME || 'mcp-server-3002';
const SERVER_VERSION = process.env.SERVER_VERSION || '1.0.0';

const TOOLS = [
  {
    name: 'get-time',
    description: 'Get current time for a timezone or city',
    inputSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Timezone (e.g., "UTC", "America/New_York") or city name',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'generate-password',
    description: 'Generate a secure password',
    inputSchema: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Length (8-128)', minimum: 8, maximum: 128 },
        includeUppercase: { type: 'boolean', description: 'Include A-Z' },
        includeLowercase: { type: 'boolean', description: 'Include a-z' },
        includeNumbers: { type: 'boolean', description: 'Include 0-9' },
        includeSymbols: { type: 'boolean', description: 'Include symbols' },
      },
      required: [],
    },
  },
];

async function startServer() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(bodyParser.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // MCP endpoint
  app.all('/mcp', async (req: Request, res: Response) => {
    const { method, params, id } = req.body || {};
    let response: any;

    switch (method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          result: {
            protocolVersion: params?.protocolVersion || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
          id,
        };
        break;

      case 'tools/list':
        response = { jsonrpc: '2.0', result: { tools: TOOLS }, id };
        break;

      case 'tools/call':
        try {
          const toolName = params?.name;
          let result: any;

          switch (toolName) {
            case 'get-time':
              result = await getTime.handler(req.body);
              break;
            case 'generate-password':
              result = await generatePassword.handler(req.body);
              break;
            default:
              result = {
                content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
                isError: true,
              };
          }
          response = { jsonrpc: '2.0', result, id };
        } catch (error) {
          response = {
            jsonrpc: '2.0',
            error: { code: -32603, message: error instanceof Error ? error.message : 'Error' },
            id,
          };
        }
        break;

      default:
        response = {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        };
    }

    res.json(response);
  });

  app.listen(SERVER_PORT, '127.0.0.1', () => {
    console.log(`MCP Server running at ${SERVER_URL}`);
    console.log(`  POST ${SERVER_URL}/mcp`);
    console.log(`  GET  ${SERVER_URL}/health`);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    process.exit(0);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
