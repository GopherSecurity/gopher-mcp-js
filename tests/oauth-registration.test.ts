import { registerOAuthClient } from '../src/oauthRegistration';
import { OAuthAuthorizationServerMetadata } from '../src/oauthDiscovery';
import { GopherOAuthClient } from '../src/ffi/auth/oauth-client';

jest.mock('../src/ffi/auth/oauth-client', () => {
  const actual = jest.requireActual('../src/ffi/auth/oauth-client');
  return {
    ...actual,
    GopherOAuthClient: jest.fn(),
  };
});

const MockedGopherOAuthClient = GopherOAuthClient as jest.MockedClass<
  typeof GopherOAuthClient
>;

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

  test('registers with native client by default', async () => {
    const client = createClient({
      clientId: 'native-client',
      clientSecret: 'native-secret',
      success: true,
    });
    MockedGopherOAuthClient.mockImplementationOnce(
      () => client as unknown as GopherOAuthClient
    );

    await expect(
      registerOAuthClient({
        metadata,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: ['openid', 'email'],
        oauth: { clientName: 'Native Client' },
      })
    ).resolves.toEqual({
      clientId: 'native-client',
      clientSecret: 'native-secret',
    });

    expect(MockedGopherOAuthClient).toHaveBeenCalledWith(
      'https://auth.example.com/token',
      ''
    );
    expect(client.registerClient).toHaveBeenCalledWith(
      'https://auth.example.com/register',
      'Native Client',
      ['http://127.0.0.1:49152/callback'],
      'openid email'
    );
    expect(client.destroy).toHaveBeenCalledTimes(1);
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
