import {
  exchangeOAuthCodeForToken,
  refreshOAuthToken,
} from '../src/oauthTokenExchange';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

describe('exchangeOAuthCodeForToken', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await close(server);
      server = undefined;
    }
  });

  test('successful exchange returns token record', async () => {
    server = createServer(async (request, response) => {
      const body = await expectTokenRequest(request, response);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-123');
      expect(body.get('redirect_uri')).toBe('http://127.0.0.1:49152/callback');
      expect(body.get('resource')).toBe('https://mcp.example.com/mcp');
      json(response, {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });
    });
    await listen(server);

    await expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: `${serverUrl(server)}/token`,
        clientId: 'client-123',
        resource: 'https://mcp.example.com/mcp',
        nowMs: 1000,
      })
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 3_601_000,
    });
  });

  test('error response preserves OAuth error description', async () => {
    server = createServer(async (request, response) => {
      await expectTokenRequest(request, response);
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Code expired',
        })
      );
    });
    await listen(server);

    await expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: `${serverUrl(server)}/token`,
        clientId: 'client-123',
      })
    ).rejects.toThrow('Code expired');
  });

  test('PKCE verifier is sent', async () => {
    server = createServer(async (request, response) => {
      const body = await expectTokenRequest(request, response);
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('secret');
      expect(body.get('code_verifier')).toBe('verifier-123');
      json(response, {
        access_token: 'access-token',
        token_type: 'Bearer',
      });
    });
    await listen(server);

    await exchangeOAuthCodeForToken({
      code: 'code-123',
      redirectUri: 'http://127.0.0.1:49152/callback',
      codeVerifier: 'verifier-123',
      tokenEndpoint: `${serverUrl(server)}/token`,
      clientId: 'client-123',
      clientSecret: 'secret',
    });
  });

  test('exchanges authorization code with fetch by default', async () => {
    server = createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/token') {
        response.writeHead(404);
        response.end();
        return;
      }

      const body = new URLSearchParams(await readBody(request));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-123');
      expect(body.get('redirect_uri')).toBe('http://127.0.0.1:49152/callback');
      expect(body.get('code_verifier')).toBe('verifier-123');
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('secret');
      json(response, {
        access_token: 'fetch-access-token',
        refresh_token: 'fetch-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });
    });
    await listen(server);

    await expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: `${serverUrl(server)}/token`,
        clientId: 'client-123',
        clientSecret: 'secret',
        nowMs: 1000,
      })
    ).resolves.toEqual({
      accessToken: 'fetch-access-token',
      refreshToken: 'fetch-refresh-token',
      tokenType: 'Bearer',
      expiresAt: 3_601_000,
    });
  });

  test('refresh token response returns token record', async () => {
    server = createServer(async (request, response) => {
      const body = await expectTokenRequest(request, response);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-token');
      expect(body.get('resource')).toBe('https://mcp.example.com/mcp');
      json(response, {
        access_token: 'refreshed-access-token',
        refresh_token: 'next-refresh-token',
        expires_in: 60,
        token_type: 'Bearer',
      });
    });
    await listen(server);

    await expect(
      refreshOAuthToken({
        refreshToken: 'refresh-token',
        tokenEndpoint: `${serverUrl(server)}/token`,
        clientId: 'client-123',
        resource: 'https://mcp.example.com/mcp',
        nowMs: 1000,
      })
    ).resolves.toEqual({
      accessToken: 'refreshed-access-token',
      refreshToken: 'next-refresh-token',
      tokenType: 'Bearer',
      expiresAt: 61_000,
    });
  });

  test('refresh token response preserves old refresh token when not rotated', async () => {
    server = createServer(async (request, response) => {
      const body = await expectTokenRequest(request, response);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('existing-refresh-token');
      json(response, {
        access_token: 'refreshed-access-token',
        expires_in: 60,
        token_type: 'Bearer',
      });
    });
    await listen(server);

    await expect(
      refreshOAuthToken({
        refreshToken: 'existing-refresh-token',
        tokenEndpoint: `${serverUrl(server)}/token`,
        clientId: 'client-123',
        nowMs: 1000,
      })
    ).resolves.toEqual({
      accessToken: 'refreshed-access-token',
      refreshToken: 'existing-refresh-token',
      tokenType: 'Bearer',
      expiresAt: 61_000,
    });
  });

  test('string expires_in is parsed as seconds', async () => {
    server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/token') {
        response.writeHead(404);
        response.end();
        return;
      }

      json(response, {
        access_token: 'refreshed-access-token',
        token_type: 'Bearer',
        expires_in: '3600',
      });
    });
    await listen(server);

    await expect(
      refreshOAuthToken({
        refreshToken: 'refresh-token',
        tokenEndpoint: `${serverUrl(server)}/token`,
        clientId: 'client-123',
        nowMs: 1000,
      })
    ).resolves.toEqual({
      accessToken: 'refreshed-access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 3_601_000,
    });
  });
});

async function expectTokenRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<URLSearchParams> {
  if (request.method !== 'POST' || request.url !== '/token') {
    response.writeHead(404);
    response.end();
    throw new Error('unexpected token request');
  }
  return new URLSearchParams(await readBody(request));
}

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

function serverUrl(server: Server): string {
  const address = server.address() as AddressInfo | null;
  if (address === null) {
    throw new Error('server is not listening');
  }
  return `http://127.0.0.1:${address.port}`;
}
