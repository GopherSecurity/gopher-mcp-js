import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

export type ProtectedMcpEndpointKind = 'server' | 'gateway';

export interface CustomProtectedMcpEndpointsOptions {
  authorizationServer: string;
  accessToken: string;
  scopesSupported?: string[];
  protectedResourceMetadata?: Record<string, unknown>;
}

export interface CustomProtectedMcpEndpoint {
  kind: ProtectedMcpEndpointKind;
  baseUrl: string;
  mcpUrl: string;
  resourceMetadataUrl: string;
}

export interface CustomProtectedMcpEndpoints {
  server: CustomProtectedMcpEndpoint;
  gateway: CustomProtectedMcpEndpoint;
  close(): Promise<void>;
}

interface EndpointState {
  kind: ProtectedMcpEndpointKind;
  baseUrl: string;
  authorizationServer: string;
  accessToken: string;
  scopesSupported: string[];
  protectedResourceMetadata?: Record<string, unknown>;
}

export async function startCustomProtectedMcpEndpoints(
  options: CustomProtectedMcpEndpointsOptions
): Promise<CustomProtectedMcpEndpoints> {
  const server = await startCustomProtectedMcpEndpoint('server', options);
  const gateway = await startCustomProtectedMcpEndpoint('gateway', options);

  return {
    server: server.endpoint,
    gateway: gateway.endpoint,
    close: async () => {
      await Promise.all([server.close(), gateway.close()]);
    },
  };
}

async function startCustomProtectedMcpEndpoint(
  kind: ProtectedMcpEndpointKind,
  options: CustomProtectedMcpEndpointsOptions
): Promise<{
  endpoint: CustomProtectedMcpEndpoint;
  close(): Promise<void>;
}> {
  const state: EndpointState = {
    kind,
    baseUrl: '',
    authorizationServer: options.authorizationServer,
    accessToken: options.accessToken,
    scopesSupported: options.scopesSupported ?? ['openid', 'profile', 'email'],
    protectedResourceMetadata: options.protectedResourceMetadata,
  };
  const server = createServer((request, response) => {
    void handleEndpointRequest(request, response, state);
  });
  await listen(server);

  const address = server.address() as AddressInfo | null;
  if (address === null) {
    throw new Error(`custom protected MCP ${kind} endpoint failed to start`);
  }
  state.baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    endpoint: {
      kind,
      baseUrl: state.baseUrl,
      mcpUrl: `${state.baseUrl}/mcp`,
      resourceMetadataUrl: `${state.baseUrl}/.well-known/oauth-protected-resource/mcp`,
    },
    close: () => close(server),
  };
}

async function handleEndpointRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: EndpointState
): Promise<void> {
  const url = new URL(request.url ?? '/', state.baseUrl);

  if (
    request.method === 'GET' &&
    url.pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    json(
      response,
      state.protectedResourceMetadata ?? {
        resource: `${state.baseUrl}/mcp`,
        authorization_servers: [state.authorizationServer],
        scopes_supported: state.scopesSupported,
      }
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/mcp') {
    if (!hasExpectedBearerToken(request, state.accessToken)) {
      response.writeHead(401, {
        'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${state.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
      });
      response.end();
      return;
    }

    json(response, {
      jsonrpc: '2.0',
      id: 'custom-protected-mcp-response',
      result: {
        endpoint: state.kind,
        authenticated: true,
      },
    });
    return;
  }

  response.writeHead(404);
  response.end();
}

function hasExpectedBearerToken(
  request: IncomingMessage,
  accessToken: string
): boolean {
  const authorization = request.headers.authorization;
  return authorization === `Bearer ${accessToken}`;
}

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
