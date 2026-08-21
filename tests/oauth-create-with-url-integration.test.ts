import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { GopherAgent } from '../src/agent';
import { GopherOrchHandle } from '../src/ffi/library';
import * as oauthResolver from '../src/oauthResolver';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';

interface FakeOAuthServer {
  baseUrl: string;
  mcpUrl: string;
  close(): Promise<void>;
}

function fakeAgent(): GopherAgent {
  return {
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false),
  } as unknown as GopherAgent;
}

type AgentCreateByUrl = jest.Mock<
  GopherOrchHandle,
  [string, string, string, unknown]
>;
type CreateFromFfi = (
  createHandle: (lib: {
    agentCreateByUrl: AgentCreateByUrl;
  }) => GopherOrchHandle
) => GopherAgent;

async function startFakeOAuthServer(): Promise<FakeOAuthServer> {
  let baseUrl = '';
  const server = createServer(async (request, response) => {
    await handleFakeOAuthRequest(request, response, () => baseUrl);
  });
  await listen(server);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    mcpUrl: `${baseUrl}/mcp`,
    close: () => close(server),
  };
}

async function handleFakeOAuthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  getBaseUrl: () => string
): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = new URL(request.url ?? '/', baseUrl);

  if (request.method === 'POST' && url.pathname === '/mcp') {
    response.writeHead(401, {
      'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    });
    response.end();
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    json(response, {
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['openid', 'email'],
    });
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/.well-known/oauth-authorization-server'
  ) {
    json(response, {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      scopes_supported: ['openid', 'email'],
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (redirectUri === null || state === null) {
      response.writeHead(400);
      response.end('missing redirect_uri or state');
      return;
    }

    const callback = new URL(redirectUri);
    callback.searchParams.set('code', 'local-auth-code');
    callback.searchParams.set('state', state);
    response.writeHead(302, { Location: callback.toString() });
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/token') {
    const body = await readBody(request);
    const form = new URLSearchParams(body);
    if (form.get('code') !== 'local-auth-code') {
      response.writeHead(400);
      response.end('bad code');
      return;
    }

    json(response, {
      access_token: 'local-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    return;
  }

  response.writeHead(404);
  response.end();
}

describe('OAuth createWithUrl integration', () => {
  let server: FakeOAuthServer;

  beforeEach(async () => {
    server = await startFakeOAuthServer();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await server.close();
  });

  test('URL agent creation resolves OAuth credentials before native create', async () => {
    const agent = fakeAgent();
    const agentCreateByUrl = jest.fn<
      GopherOrchHandle,
      [string, string, string, unknown]
    >(() => ({}) as GopherOrchHandle);
    jest
      .spyOn(
        GopherAgent as unknown as { createFromFfi: CreateFromFfi },
        'createFromFfi'
      )
      .mockImplementation((createHandle) => {
        createHandle({ agentCreateByUrl });
        return agent;
      });
    const resolveRuntimeOptionsWithOAuth = jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockResolvedValue({ accessToken: 'local-access-token' });

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, server.mcpUrl)
    ).resolves.toBe(agent);

    expect(resolveRuntimeOptionsWithOAuth).toHaveBeenCalledWith({
      urls: [server.mcpUrl],
      runtimeOptions: undefined,
      oauth: {},
      hooks: undefined,
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      server.mcpUrl,
      {
        accessToken: 'local-access-token',
      }
    );
  });
});

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
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
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
