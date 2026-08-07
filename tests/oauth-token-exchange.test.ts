import { exchangeOAuthCodeForToken } from '../src/oauthTokenExchange';

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
    destroy: jest.fn(),
  };
}

describe('exchangeOAuthCodeForToken', () => {
  test('successful exchange returns token record', () => {
    const client = createClient({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      success: true,
    });

    expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        nowMs: 1000,
        clientFactory: () => client,
      })
    ).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 3_601_000,
    });
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  test('error response preserves OAuth error description', () => {
    const client = createClient({
      accessToken: '',
      expiresIn: 0,
      tokenType: 'Bearer',
      success: false,
      error: 'invalid_grant',
      errorDescription: 'Code expired',
    });

    expect(() =>
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        clientFactory: () => client,
      })
    ).toThrow('Code expired');
  });

  test('PKCE verifier is sent', () => {
    const client = createClient({
      accessToken: 'access-token',
      expiresIn: 0,
      tokenType: 'Bearer',
      success: true,
    });

    exchangeOAuthCodeForToken({
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
});
