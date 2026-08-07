import {
  createOAuthTokenCacheKey,
  InMemoryGopherAgentTokenStore,
  resolveOAuthTokenFromStore,
} from '../src/oauthTokenStore';

const validToken = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresAt: 2000,
};

describe('OAuth token store', () => {
  test('valid cached token avoids browser flow', async () => {
    const store = new InMemoryGopherAgentTokenStore();
    await store.set('key', validToken);
    const acquireToken = jest.fn();

    await expect(
      resolveOAuthTokenFromStore({
        store,
        key: 'key',
        nowMs: 1000,
        refreshToken: jest.fn(),
        acquireToken,
      })
    ).resolves.toEqual(validToken);

    expect(acquireToken).not.toHaveBeenCalled();
  });

  test('expired token refreshes when refresh token exists', async () => {
    const store = new InMemoryGopherAgentTokenStore();
    await store.set('key', {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 1000,
    });
    const refreshed = {
      accessToken: 'new-token',
      tokenType: 'Bearer',
      expiresAt: 3000,
    };
    const refreshToken = jest.fn(async () => refreshed);
    const acquireToken = jest.fn();

    await expect(
      resolveOAuthTokenFromStore({
        store,
        key: 'key',
        nowMs: 2000,
        refreshToken,
        acquireToken,
      })
    ).resolves.toEqual(refreshed);

    expect(refreshToken).toHaveBeenCalledWith('refresh-token');
    expect(acquireToken).not.toHaveBeenCalled();
    await expect(store.get('key')).resolves.toEqual(refreshed);
  });

  test('failed refresh falls back to full flow', async () => {
    const store = new InMemoryGopherAgentTokenStore();
    await store.set('key', {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 1000,
    });
    const acquired = { accessToken: 'new-token', tokenType: 'Bearer' };

    await expect(
      resolveOAuthTokenFromStore({
        store,
        key: 'key',
        nowMs: 2000,
        refreshToken: jest.fn(async () => {
          throw new Error('refresh failed');
        }),
        acquireToken: jest.fn(async () => acquired),
      })
    ).resolves.toEqual(acquired);

    await expect(store.get('key')).resolves.toEqual(acquired);
  });

  test('cache key separates resources and scopes', () => {
    expect(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        clientId: 'client',
        scopes: ['email', 'openid'],
      })
    ).not.toBe(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/b',
        issuer: 'https://auth.example.com',
        clientId: 'client',
        scopes: ['email', 'openid'],
      })
    );
    expect(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        clientId: 'client',
        scopes: ['email', 'openid'],
      })
    ).toBe(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        clientId: 'client',
        scopes: ['openid', 'email'],
      })
    );
  });
});
