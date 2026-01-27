#!/usr/bin/env node

/**
 * Simple MCP Server (No Authentication)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import { getWeather } from './tools/get-weather.js';
import { getForecast } from './tools/get-forecast.js';
import { getAlerts } from './tools/get-alerts.js';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3001', 10);
const SERVER_URL = process.env.SERVER_URL || `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_NAME = process.env.SERVER_NAME || 'mcp-server-3001';
const SERVER_VERSION = process.env.SERVER_VERSION || '1.0.0';

const TOOLS = [
  {
    name: 'get-weather',
    description: 'Get current weather for a city',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' } },
      required: ['city'],
    },
  },
  {
    name: 'get-forecast',
    description: 'Get weather forecast for a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        days: { type: 'number', description: 'Days (1-7)', minimum: 1, maximum: 7 },
      },
      required: ['city'],
    },
  },
  {
    name: 'get-weather-alerts',
    description: 'Get weather alerts for a region',
    inputSchema: {
      type: 'object',
      properties: { region: { type: 'string', description: 'Region name' } },
      required: ['region'],
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
            case 'get-weather':
              result = await getWeather.handler(req.body);
              break;
            case 'get-forecast':
              result = await getForecast.handler(req.body);
              break;
            case 'get-weather-alerts':
              result = await getAlerts.handler(req.body);
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
