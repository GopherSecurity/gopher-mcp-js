import express from 'express';
import request from 'supertest';
import {
  McpHandler,
  registerMcpHandler,
  JsonRpcErrorCode,
} from '../mcp-handler';
import { AuthenticatedRequest } from '../../middleware/oauth-auth';
import { Request } from 'express';

describe('McpHandler', () => {
  let handler: McpHandler;

  beforeEach(() => {
    handler = new McpHandler();
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      handler.registerTool(
        'test-tool',
        {
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input value' },
            },
            required: ['input'],
          },
        },
        async () => ({ content: [{ type: 'text', text: 'result' }] })
      );

      const tools = handler.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
    });

    it('should register multiple tools', () => {
      handler.registerTool(
        'tool-1',
        {
          description: 'Tool 1',
          inputSchema: { type: 'object', properties: {} },
        },
        async () => ({ content: [{ type: 'text', text: 'result1' }] })
      );

      handler.registerTool(
        'tool-2',
        {
          description: 'Tool 2',
          inputSchema: { type: 'object', properties: {} },
        },
        async () => ({ content: [{ type: 'text', text: 'result2' }] })
      );

      const tools = handler.getTools();
      expect(tools).toHaveLength(2);
    });
  });

  describe('getTools', () => {
    it('should return empty array when no tools registered', () => {
      expect(handler.getTools()).toEqual([]);
    });

    it('should return tool specs with names', () => {
      handler.registerTool(
        'my-tool',
        {
          description: 'My tool description',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'number' },
            },
          },
        },
        async () => ({ content: [] })
      );

      const tools = handler.getTools();
      expect(tools[0]).toEqual({
        name: 'my-tool',
        description: 'My tool description',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
        },
      });
    });
  });

  describe('handleRequest', () => {
    const mockReq = {} as AuthenticatedRequest;

    describe('request validation', () => {
      it('should reject non-object body', async () => {
        const response = await handler.handleRequest(null, mockReq);
        expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_REQUEST);
        expect(response.error?.message).toContain('expected object');
      });

      it('should reject missing jsonrpc field', async () => {
        const response = await handler.handleRequest(
          { method: 'ping' },
          mockReq
        );
        expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_REQUEST);
        expect(response.error?.message).toContain('jsonrpc must be "2.0"');
      });

      it('should reject wrong jsonrpc version', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '1.0', method: 'ping' },
          mockReq
        );
        expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_REQUEST);
      });

      it('should reject non-string method', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', method: 123 },
          mockReq
        );
        expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_REQUEST);
        expect(response.error?.message).toContain('method must be a string');
      });

      it('should reject non-object params', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', method: 'ping', params: 'invalid' },
          mockReq
        );
        expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_PARAMS);
      });
    });

    describe('initialize method', () => {
      it('should return server info and capabilities', async () => {
        const response = await handler.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05' },
          },
          mockReq
        );

        expect(response.error).toBeUndefined();
        expect(response.result).toMatchObject({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'js-auth-mcp-server',
            version: '1.0.0',
          },
        });
      });
    });

    describe('ping method', () => {
      it('should return empty object', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: 1, method: 'ping' },
          mockReq
        );

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({});
      });
    });

    describe('tools/list method', () => {
      it('should return empty tools array when no tools registered', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          mockReq
        );

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ tools: [] });
      });

      it('should return registered tools', async () => {
        handler.registerTool(
          'echo',
          {
            description: 'Echo tool',
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
            },
          },
          async () => ({ content: [] })
        );

        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          mockReq
        );

        expect(response.error).toBeUndefined();
        const result = response.result as { tools: unknown[] };
        expect(result.tools).toHaveLength(1);
      });
    });

    describe('tools/call method', () => {
      beforeEach(() => {
        handler.registerTool(
          'echo',
          {
            description: 'Echo tool',
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
          },
          async (args) => ({
            content: [{ type: 'text', text: String(args.message) }],
          })
        );
      });

      it('should call registered tool', async () => {
        const response = await handler.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'echo', arguments: { message: 'hello' } },
          },
          mockReq
        );

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({
          content: [{ type: 'text', text: 'hello' }],
        });
      });

      it('should return error for missing tool name', async () => {
        const response = await handler.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { arguments: {} },
          },
          mockReq
        );

        expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_PARAMS);
      });

      it('should return error for non-existent tool', async () => {
        const response = await handler.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'nonexistent' },
          },
          mockReq
        );

        expect(response.error?.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND);
        expect(response.error?.message).toContain('Tool not found');
      });

      it('should handle tool execution errors', async () => {
        handler.registerTool(
          'failing-tool',
          {
            description: 'A tool that fails',
            inputSchema: { type: 'object', properties: {} },
          },
          async () => {
            throw new Error('Tool execution failed');
          }
        );

        const response = await handler.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'failing-tool' },
          },
          mockReq
        );

        expect(response.error?.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect(response.error?.message).toBe('Tool execution failed');
      });

      it('should handle tool returning synchronously', async () => {
        handler.registerTool(
          'sync-tool',
          {
            description: 'Sync tool',
            inputSchema: { type: 'object', properties: {} },
          },
          () => ({ content: [{ type: 'text', text: 'sync result' }] })
        );

        const response = await handler.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'sync-tool' },
          },
          mockReq
        );

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({
          content: [{ type: 'text', text: 'sync result' }],
        });
      });
    });

    describe('unknown method', () => {
      it('should return method not found error', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: 1, method: 'unknown/method' },
          mockReq
        );

        expect(response.error?.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND);
        expect(response.error?.message).toContain('Method not found');
      });
    });

    describe('request id handling', () => {
      it('should preserve string id', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: 'request-123', method: 'ping' },
          mockReq
        );

        expect(response.id).toBe('request-123');
      });

      it('should preserve number id', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: 42, method: 'ping' },
          mockReq
        );

        expect(response.id).toBe(42);
      });

      it('should handle null id', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', id: null, method: 'ping' },
          mockReq
        );

        expect(response.id).toBeNull();
      });

      it('should handle missing id', async () => {
        const response = await handler.handleRequest(
          { jsonrpc: '2.0', method: 'ping' },
          mockReq
        );

        expect(response.id).toBeNull();
      });
    });
  });
});

describe('registerMcpHandler', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should register /mcp endpoint', async () => {
    registerMcpHandler(app);

    const response = await request(app)
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'ping' });

    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({});
  });

  it('should register /rpc endpoint', async () => {
    registerMcpHandler(app);

    const response = await request(app)
      .post('/rpc')
      .send({ jsonrpc: '2.0', id: 1, method: 'ping' });

    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({});
  });

  it('should return McpHandler instance', () => {
    const handler = registerMcpHandler(app);

    expect(handler).toBeInstanceOf(McpHandler);
  });

  it('should allow tool registration after setup', async () => {
    const handler = registerMcpHandler(app);

    handler.registerTool(
      'greet',
      {
        description: 'Greet someone',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
      (args) => ({
        content: [{ type: 'text', text: `Hello, ${args.name}!` }],
      })
    );

    const response = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'greet', arguments: { name: 'World' } },
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({
      content: [{ type: 'text', text: 'Hello, World!' }],
    });
  });

  it('should handle initialize request', async () => {
    registerMcpHandler(app);

    const response = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      });

    expect(response.status).toBe(200);
    expect(response.body.result.protocolVersion).toBe('2024-11-05');
    expect(response.body.result.serverInfo.name).toBe('js-auth-mcp-server');
  });

  it('should handle tools/list request', async () => {
    const handler = registerMcpHandler(app);

    handler.registerTool(
      'test',
      {
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} },
      },
      () => ({ content: [] })
    );

    const response = await request(app)
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(response.status).toBe(200);
    expect(response.body.result.tools).toHaveLength(1);
    expect(response.body.result.tools[0].name).toBe('test');
  });
});
