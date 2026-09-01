import { registerOAuthClient } from '../src/oauthRegistration';
import { OAuthAuthorizationServerMetadata } from '../src/oauthDiscovery';
import { OAUTH_FETCH_TIMEOUT_MS } from '../src/oauthFetch';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

const metadata: OAuthAuthorizationServerMetadata = {
  issuer: 'https://auth.example.com',
  authorizationEndpoint: 'https://auth.example.com/authorize',
  tokenEndpoint: 'https://auth.example.com/token',
  registrationEndpoint: 'https://auth.example.com/register',
  scopesSupported: ['openid', 'email'],
  rawJson: '{}',
};

describe('registerOAuthClient', () => {
  let server: Server | undefined;
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    if (server !== undefined) {
      await close(server);
      server = undefined;
    }
  });

  test('sends redirect URI and requested scopes', async () => {
    server = createRegistrationServer((body) => {
      expect(body.client_name).toBe('Test Client');
      expect(body.redirect_uris).toEqual(['http://127.0.0.1:49152/callback']);
      expect(body.scope).toBe('openid email');
      return { client_id: 'client-123' };
    });
    await listen(server);

    const result = await registerOAuthClient({
      metadata: {
        ...metadata,
        registrationEndpoint: `${serverUrl(server)}/register`,
      },
      redirectUri: 'http://127.0.0.1:49152/callback',
      scopes: ['openid', 'email'],
      oauth: { clientName: 'Test Client' },
    });

    expect(result).toEqual({ clientId: 'client-123' });
  });

  test('handles public client without secret', async () => {
    server = createRegistrationServer(() => ({ client_id: 'public-client' }));
    await listen(server);

    await expect(
      registerOAuthClient({
        metadata: {
          ...metadata,
          registrationEndpoint: `${serverUrl(server)}/register`,
        },
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
      })
    ).resolves.toEqual({ clientId: 'public-client' });
  });

  test('handles confidential client with secret', async () => {
    server = createRegistrationServer(() => ({
      client_id: 'confidential-client',
      client_secret: 'secret',
    }));
    await listen(server);

    await expect(
      registerOAuthClient({
        metadata: {
          ...metadata,
          registrationEndpoint: `${serverUrl(server)}/register`,
        },
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
      })
    ).resolves.toEqual({
      clientId: 'confidential-client',
      clientSecret: 'secret',
    });
  });

  test('registers with fetch by default', async () => {
    server = createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/register') {
        response.writeHead(404);
        response.end();
        return;
      }

      const body = (await readJson(request)) as Record<string, unknown>;
      expect(body.client_name).toBe('Fetch Client');
      expect(body.redirect_uris).toEqual(['http://127.0.0.1:49152/callback']);
      expect(body.token_endpoint_auth_method).toBe('none');
      expect(body.grant_types).toEqual(['authorization_code', 'refresh_token']);
      expect(body.scope).toBe('openid email');
      json(response, {
        client_id: 'fetch-client',
        client_secret: 'fetch-secret',
      });
    });
    await listen(server);

    await expect(
      registerOAuthClient({
        metadata: {
          ...metadata,
          registrationEndpoint: `${serverUrl(server)}/register`,
        },
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: ['openid', 'email'],
        oauth: { clientName: 'Fetch Client' },
      })
    ).resolves.toEqual({
      clientId: 'fetch-client',
      clientSecret: 'fetch-secret',
    });
  });

  test('fails clearly when no registration endpoint exists', async () => {
    const noRegistration = { ...metadata };
    delete noRegistration.registrationEndpoint;

    await expect(
      registerOAuthClient({
        metadata: noRegistration,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
      })
    ).rejects.toThrow('oauth_registration_required');
  });

  test('registration endpoint requests time out', async () => {
    jest.useFakeTimers();
    globalThis.fetch = createHungFetch();

    const pending = registerOAuthClient({
      metadata,
      redirectUri: 'http://127.0.0.1:49152/callback',
      scopes: [],
    });

    const assertion = expect(pending).rejects.toMatchObject({
      code: 'OAUTH_FETCH_FAILED',
      message:
        'Failed to fetch OAuth dynamic client registration: request timed out after 30000ms',
    });
    await jest.advanceTimersByTimeAsync(OAUTH_FETCH_TIMEOUT_MS);
    await assertion;
  });
});

function createRegistrationServer(
  handleBody: (body: Record<string, unknown>) => Record<string, unknown>
): Server {
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/register') {
      response.writeHead(404);
      response.end();
      return;
    }

    const body = (await readJson(request)) as Record<string, unknown>;
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body.grant_types).toEqual(['authorization_code', 'refresh_token']);
    json(response, handleBody(body));
  });
}

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
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

function createHungFetch(): typeof fetch {
  return jest.fn((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      return Promise.reject(new Error('missing abort signal'));
    }

    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  }) as typeof fetch;
}
