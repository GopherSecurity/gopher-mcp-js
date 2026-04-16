/**
 * MCP Server wrapper using StreamableHTTPServerTransport
 *
 * Uses a single stateful transport that manages session IDs internally.
 * Mirrors the pattern from gopher-auth-example-server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { IncomingMessage, ServerResponse } from 'http';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

export class MCPServer {
  private server: McpServer;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  constructor() {
    this.server = new McpServer({
      name: 'js-auth-mcp-server',
      version: '1.0.0',
    });
  }

  getMcpServer(): McpServer {
    return this.server;
  }

  async handleRequest(req: Request, res: Response): Promise<void> {
    const nodeReq = req as unknown as IncomingMessage;
    const nodeRes = res as unknown as ServerResponse;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    let transport: StreamableHTTPServerTransport | undefined;

    // Reuse existing transport for session
    if (sessionId && this.transports.has(sessionId)) {
      transport = this.transports.get(sessionId)!;
    }

    // Create new transport for initialization
    if (!transport) {
      if (req.method === 'POST' && req.body?.method !== 'initialize') {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session. Send initialize first.',
          },
          id: req.body?.id ?? null,
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // Store transport by session ID after first response
      const origSessionId = transport.sessionId;
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid && this.transports.has(sid)) {
          this.transports.delete(sid);
        }
      };

      await this.server.connect(transport);

      // Store transport after connect (sessionId is now set)
      if (transport.sessionId) {
        this.transports.set(transport.sessionId, transport);
      }
    }

    await transport.handleRequest(nodeReq, nodeRes, req.body);

    // Store transport by sessionId if it was just assigned
    if (transport.sessionId && !this.transports.has(transport.sessionId)) {
      this.transports.set(transport.sessionId, transport);
    }
  }
}
