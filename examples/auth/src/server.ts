import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Check if a request is an initialize request
 */
function isInitializeRequest(body: any): boolean {
  return body && body.method === 'initialize';
}

/**
 * MCPServer wrapper class that manages Streamable HTTP transport
 * Uses per-session transport instances to support multiple concurrent clients
 */
export type ServerFactory = () => Server;

export class MCPServer {
  private serverFactory: ServerFactory;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  constructor(serverFactory: ServerFactory) {
    this.serverFactory = serverFactory;
    console.log('🔒 MCP Server ready with StreamableHTTP transport (per-session mode)');
  }

  /**
   * Handle both GET and POST requests for the MCP endpoint
   * Creates per-session transport instances for proper multi-client support
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      // Cast Express Request/Response to Node.js native types
      const nodeReq = req as unknown as IncomingMessage;
      const nodeRes = res as unknown as ServerResponse;

      // Check for existing session ID in headers
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const method = req.body?.method || req.method;

      console.log(`📨 Request: ${method} [session: ${sessionId || 'none'}]`);

      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = this.transports.get(sessionId)!;
        console.log(`♻️  Reusing transport for session: ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request - create new transport
        console.log('🆕 Creating new transport for initialization');

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            // Store the transport by session ID when session is initialized
            console.log(`✅ Session initialized with ID: ${newSessionId}`);
            this.transports.set(newSessionId, transport);
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            console.log(`🗑️  Transport closed for session ${sid}, removing from map`);
            this.transports.delete(sid);
          }
        };

        // Create a new Server instance for this session and connect
        const sessionServer = this.serverFactory();
        await sessionServer.connect(transport);
      } else {
        // Invalid request - no session ID or not initialization request
        console.error(`❌ Invalid request: sessionId=${sessionId}, method=${method}`);
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
        return;
      }

      // Pass the parsed body from Express to avoid re-parsing
      // OAuth is handled by middleware BEFORE this point
      // Auth context is available via (req as any).auth if needed by handlers
      await transport.handleRequest(nodeReq, nodeRes, req.body);

    } catch (error: any) {
      console.error('❌ Error handling request:', error.message);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error.message || 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Close all active transports
   */
  async closeAll(): Promise<void> {
    console.log(`🛑 Closing ${this.transports.size} active transports...`);
    for (const [sessionId, transport] of this.transports) {
      try {
        console.log(`  Closing session: ${sessionId}`);
        await transport.close();
      } catch (error) {
        console.error(`  Error closing session ${sessionId}:`, error);
      }
    }
    this.transports.clear();
  }
}
