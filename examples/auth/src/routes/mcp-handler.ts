/**
 * MCP Handler - JSON-RPC 2.0 Implementation
 *
 * Implements the Model Context Protocol (MCP) JSON-RPC handler
 * for tool registration and invocation.
 */

import { Express, Request, Response } from 'express';

/**
 * Set common CORS headers on response
 *
 * @param res - Express response object
 */
function setCorsHeaders(res: Response): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD'
  );
  res.set(
    'Access-Control-Allow-Headers',
    'Accept, Accept-Language, Content-Language, Content-Type, Authorization, ' +
      'X-Requested-With, Origin, Cache-Control, Pragma, Mcp-Session-Id, Mcp-Protocol-Version'
  );
  res.set(
    'Access-Control-Expose-Headers',
    'WWW-Authenticate, Content-Length, Content-Type'
  );
  res.set('Access-Control-Max-Age', '86400');
}

/**
 * JSON-RPC 2.0 Request structure
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Response structure
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 Error structure
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Standard JSON-RPC error codes
 */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Tool specification for MCP
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

/**
 * Tool execution result
 */
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  request: Request
) => Promise<ToolResult> | ToolResult;

/**
 * Registered tool with spec and handler
 */
interface RegisteredTool {
  spec: ToolSpec;
  handler: ToolHandler;
}

/**
 * MCP Handler class
 *
 * Manages tool registration and JSON-RPC request handling.
 */
export class McpHandler {
  private tools: Map<string, RegisteredTool> = new Map();
  private serverInfo = {
    name: 'js-auth-mcp-server',
    version: '1.0.0',
  };

  /**
   * Register a tool with the handler
   *
   * @param name - Unique tool name
   * @param spec - Tool specification (description, input schema)
   * @param handler - Function to execute when tool is called
   */
  registerTool(
    name: string,
    spec: Omit<ToolSpec, 'name'>,
    handler: ToolHandler
  ): void {
    this.tools.set(name, {
      spec: { name, ...spec },
      handler,
    });
  }

  /**
   * Get list of registered tools
   */
  getTools(): ToolSpec[] {
    return Array.from(this.tools.values()).map((t) => t.spec);
  }

  /**
   * Handle a JSON-RPC request
   *
   * @param body - Request body
   * @param req - Express request (for auth context)
   * @returns JSON-RPC response
   */
  async handleRequest(
    body: unknown,
    req: Request
  ): Promise<JsonRpcResponse> {
    // Parse and validate request
    const parseResult = this.parseRequest(body);
    if ('error' in parseResult) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: parseResult.error,
      };
    }

    const request = parseResult.request;
    const id = request.id ?? null;

    try {
      const result = await this.dispatchMethod(
        request.method,
        request.params || {},
        req
      );
      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: this.toJsonRpcError(error),
      };
    }
  }

  /**
   * Parse and validate a JSON-RPC request
   */
  private parseRequest(
    body: unknown
  ): { request: JsonRpcRequest } | { error: JsonRpcError } {
    if (!body || typeof body !== 'object') {
      return {
        error: {
          code: JsonRpcErrorCode.INVALID_REQUEST,
          message: 'Invalid request: expected object',
        },
      };
    }

    const obj = body as Record<string, unknown>;

    if (obj.jsonrpc !== '2.0') {
      return {
        error: {
          code: JsonRpcErrorCode.INVALID_REQUEST,
          message: 'Invalid request: jsonrpc must be "2.0"',
        },
      };
    }

    if (typeof obj.method !== 'string') {
      return {
        error: {
          code: JsonRpcErrorCode.INVALID_REQUEST,
          message: 'Invalid request: method must be a string',
        },
      };
    }

    if (obj.params !== undefined && typeof obj.params !== 'object') {
      return {
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: 'Invalid params: must be an object',
        },
      };
    }

    return {
      request: {
        jsonrpc: '2.0',
        id: obj.id as string | number | null | undefined,
        method: obj.method,
        params: obj.params as Record<string, unknown> | undefined,
      },
    };
  }

  /**
   * Dispatch a method call to the appropriate handler
   */
  private async dispatchMethod(
    method: string,
    params: Record<string, unknown>,
    req: Request
  ): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);

      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolsCall(params, req);

      case 'ping':
        return {};

      default:
        throw {
          code: JsonRpcErrorCode.METHOD_NOT_FOUND,
          message: `Method not found: ${method}`,
        };
    }
  }

  /**
   * Handle initialize method
   */
  private handleInitialize(params: Record<string, unknown>): unknown {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: this.serverInfo,
    };
  }

  /**
   * Handle tools/list method
   */
  private handleToolsList(): unknown {
    return {
      tools: this.getTools(),
    };
  }

  /**
   * Handle tools/call method
   */
  private async handleToolsCall(
    params: Record<string, unknown>,
    req: Request
  ): Promise<unknown> {
    const name = params.name;
    const args = params.arguments || {};

    if (typeof name !== 'string') {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid params: name must be a string',
      };
    }

    const tool = this.tools.get(name);
    if (!tool) {
      throw {
        code: JsonRpcErrorCode.METHOD_NOT_FOUND,
        message: `Tool not found: ${name}`,
      };
    }

    const result = await tool.handler(args as Record<string, unknown>, req);
    return result;
  }

  /**
   * Convert an error to JSON-RPC error format
   */
  private toJsonRpcError(error: unknown): JsonRpcError {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      return error as JsonRpcError;
    }

    if (error instanceof Error) {
      return {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: error.message,
      };
    }

    return {
      code: JsonRpcErrorCode.INTERNAL_ERROR,
      message: 'Internal error',
    };
  }
}

/**
 * Register MCP handler with Express app
 *
 * @param app - Express application
 * @returns McpHandler instance for tool registration
 */
export function registerMcpHandler(app: Express): McpHandler {
  const handler = new McpHandler();

  // OPTIONS handler for /mcp CORS preflight
  app.options('/mcp', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  // OPTIONS handler for /rpc CORS preflight
  app.options('/rpc', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const response = await handler.handleRequest(
      req.body,
      req as Request
    );
    setCorsHeaders(res);
    res.status(200).json(response);
  });

  // Also support /rpc endpoint
  app.post('/rpc', async (req: Request, res: Response) => {
    const response = await handler.handleRequest(
      req.body,
      req as Request
    );
    setCorsHeaders(res);
    res.status(200).json(response);
  });

  return handler;
}
