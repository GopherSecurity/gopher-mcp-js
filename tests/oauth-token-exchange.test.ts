import {
  exchangeOAuthCodeForToken,
  refreshOAuthToken,
} from '../src/oauthTokenExchange';

const fetchMock = jest.fn();

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
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: 'fetch-access-token',
          refresh_token: 'fetch-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await expect(
      exchangeOAuthCodeForToken({
        code: 'code-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        codeVerifier: 'verifier-123',
        tokenEndpoint: 'https://auth.example.com/token',
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

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      })
    );
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('client-123');
    expect(body.get('client_secret')).toBe('secret');
    expect(body.get('code_verifier')).toBe('verifier-123');
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

  test('refresh token uses fetch by default', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: 'fetch-refreshed-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await expect(
      refreshOAuthToken({
        refreshToken: 'refresh-token',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        clientSecret: 'secret',
        nowMs: 1000,
      })
    ).resolves.toEqual({
      accessToken: 'fetch-refreshed-access-token',
      tokenType: 'Bearer',
      expiresAt: 3_601_000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      })
    );
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-token');
  });
});
