import {
  exchangeOAuthCodeForToken,
  refreshOAuthToken,
} from '../src/oauthTokenExchange';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

function createClient(response: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  success: boolean;
  error?: string;
  errorDescription?: string;
}) {
  return {
    exchangeCode: jest.fn(() => response),
    refreshToken: jest.fn(() => response),
    destroy: jest.fn(),
  };
}

describe('exchangeOAuthCodeForToken', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await close(server);
      server = undefined;
    }
  });

  test('successful exchange returns token record', async () => {
    const client = createClient({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      success: true,
    });

    await expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        nowMs: 1000,
        clientFactory: () => client,
      })
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 3_601_000,
    });
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  test('error response preserves OAuth error description', async () => {
    const client = createClient({
      accessToken: '',
      expiresIn: 0,
      tokenType: 'Bearer',
      success: false,
      error: 'invalid_grant',
      errorDescription: 'Code expired',
    });

    await expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        clientFactory: () => client,
      })
    ).rejects.toThrow('Code expired');
  });

  test('PKCE verifier is sent', async () => {
    const client = createClient({
      accessToken: 'access-token',
      expiresIn: 0,
      tokenType: 'Bearer',
      success: true,
    });

    await exchangeOAuthCodeForToken({
      code: 'code-123',
      redirectUri: 'http://127.0.0.1:49152/callback',
      codeVerifier: 'verifier-123',
      tokenEndpoint: 'https://auth.example.com/token',
      clientId: 'client-123',
      clientSecret: 'secret',
      clientFactory: (tokenEndpoint, clientId, clientSecret) => {
        expect(tokenEndpoint).toBe('https://auth.example.com/token');
        expect(clientId).toBe('client-123');
        expect(clientSecret).toBe('secret');
        return client;
      },
    });

    expect(client.exchangeCode).toHaveBeenCalledWith(
      'code-123',
      'http://127.0.0.1:49152/callback',
      'verifier-123'
    );
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
    const client = createClient({
      accessToken: 'refreshed-access-token',
      refreshToken: 'next-refresh-token',
      expiresIn: 60,
      tokenType: 'Bearer',
      success: true,
    });

    await expect(
      refreshOAuthToken({
        refreshToken: 'refresh-token',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        nowMs: 1000,
        clientFactory: () => client,
      })
    ).resolves.toEqual({
      accessToken: 'refreshed-access-token',
      refreshToken: 'next-refresh-token',
      tokenType: 'Bearer',
      expiresAt: 61_000,
    });

    expect(client.refreshToken).toHaveBeenCalledWith('refresh-token');
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  test('refresh token response preserves old refresh token when not rotated', async () => {
    const client = createClient({
      accessToken: 'refreshed-access-token',
      expiresIn: 60,
      tokenType: 'Bearer',
      success: true,
    });

    await expect(
      refreshOAuthToken({
        refreshToken: 'existing-refresh-token',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        nowMs: 1000,
        clientFactory: () => client,
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
