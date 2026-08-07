import { registerOAuthClient } from '../src/oauthRegistration';
import { OAuthAuthorizationServerMetadata } from '../src/oauthDiscovery';

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
  test('sends redirect URI and requested scopes', () => {
    const client = createClient({ clientId: 'client-123', success: true });

    const result = registerOAuthClient({
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

  test('handles public client without secret', () => {
    const client = createClient({ clientId: 'public-client', success: true });

    expect(
      registerOAuthClient({
        metadata,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
        clientFactory: () => client,
      })
    ).toEqual({ clientId: 'public-client' });
  });

  test('handles confidential client with secret', () => {
    const client = createClient({
      clientId: 'confidential-client',
      clientSecret: 'secret',
      success: true,
    });

    expect(
      registerOAuthClient({
        metadata,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
        clientFactory: () => client,
      })
    ).toEqual({
      clientId: 'confidential-client',
      clientSecret: 'secret',
    });
  });

  test('fails clearly when no registration endpoint exists', () => {
    const noRegistration = { ...metadata };
    delete noRegistration.registrationEndpoint;

    expect(() =>
      registerOAuthClient({
        metadata: noRegistration,
        redirectUri: 'http://127.0.0.1:49152/callback',
        scopes: [],
      })
    ).toThrow('oauth_registration_required');
  });
});
