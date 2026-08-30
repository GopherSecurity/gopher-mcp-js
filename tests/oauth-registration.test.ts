import { registerOAuthClient } from '../src/oauthRegistration';
import { OAuthAuthorizationServerMetadata } from '../src/oauthDiscovery';

const fetchMock = jest.fn();

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
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          client_id: 'fetch-client',
          client_secret: 'fetch-secret',
        }),
    });

    await expect(
      registerOAuthClient({
        metadata,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: ['openid', 'email'],
        oauth: { clientName: 'Fetch Client' },
      })
    ).resolves.toEqual({
      clientId: 'fetch-client',
      clientSecret: 'fetch-secret',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/register',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"client_name":"Fetch Client"'),
      })
    );
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
