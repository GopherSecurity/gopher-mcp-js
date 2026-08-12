import { registerOAuthClient } from '../src/oauthRegistration';
import { OAuthAuthorizationServerMetadata } from '../src/oauthDiscovery';
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

function createClient(response: {
  clientId: string;
  clientSecret?: string;
  success: boolean;
  error?: string;
}) {
  return {
    registerClient: jest.fn(() => response),
    destroy: jest.fn(),
  };
}

describe('registerOAuthClient', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await close(server);
      server = undefined;
    }
  });

  test('sends redirect URI and requested scopes', async () => {
    const client = createClient({ clientId: 'client-123', success: true });

    const result = await registerOAuthClient({
      metadata,
      redirectUri: 'http://127.0.0.1:49152/callback',
      scopes: ['openid', 'email'],
      oauth: { clientName: 'Test Client' },
      clientFactory: () => client,
    });

    expect(result).toEqual({ clientId: 'client-123' });
    expect(client.registerClient).toHaveBeenCalledWith(
      'https://auth.example.com/register',
      'Test Client',
      ['http://127.0.0.1:49152/callback'],
      'openid email'
    );
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  test('handles public client without secret', async () => {
    const client = createClient({ clientId: 'public-client', success: true });

    await expect(
      registerOAuthClient({
        metadata,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
        clientFactory: () => client,
      })
    ).resolves.toEqual({ clientId: 'public-client' });
  });

  test('handles confidential client with secret', async () => {
    const client = createClient({
      clientId: 'confidential-client',
      clientSecret: 'secret',
      success: true,
    });

    await expect(
      registerOAuthClient({
        metadata,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
        clientFactory: () => client,
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
});

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
