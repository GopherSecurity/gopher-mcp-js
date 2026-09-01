import {
  createOAuthTokenCacheKey,
  InMemoryGopherAgentTokenStore,
  resolveOAuthTokenFromStore,
} from '../src/oauthTokenStore';
import { OAuthTokenRefreshError } from '../src/oauthTokenExchange';

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
      oauthClientId: 'client-id',
      oauthClientSecret: 'client-secret',
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
    ).resolves.toEqual({
      ...refreshed,
      refreshToken: 'refresh-token',
      oauthClientId: 'client-id',
      oauthClientSecret: 'client-secret',
    });

    expect(refreshToken).toHaveBeenCalledWith({
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      oauthClientId: 'client-id',
      oauthClientSecret: 'client-secret',
      tokenType: 'Bearer',
      expiresAt: 1000,
    });
    expect(acquireToken).not.toHaveBeenCalled();
    await expect(store.get('key')).resolves.toEqual({
      ...refreshed,
      refreshToken: 'refresh-token',
      oauthClientId: 'client-id',
      oauthClientSecret: 'client-secret',
    });
  });

  test('refresh keeps rotated refresh token when present', async () => {
    const store = new InMemoryGopherAgentTokenStore();
    await store.set('key', {
      accessToken: 'old-token',
      refreshToken: 'old-refresh-token',
      tokenType: 'Bearer',
      expiresAt: 1000,
    });
    const refreshed = {
      accessToken: 'new-token',
      refreshToken: 'new-refresh-token',
      tokenType: 'Bearer',
      expiresAt: 3000,
    };

    await expect(
      resolveOAuthTokenFromStore({
        store,
        key: 'key',
        nowMs: 2000,
        refreshToken: jest.fn(async () => refreshed),
        acquireToken: jest.fn(),
      })
    ).resolves.toEqual(refreshed);

    await expect(store.get('key')).resolves.toEqual(refreshed);
  });

  test('permanent refresh failure falls back to full flow', async () => {
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
          throw new OAuthTokenRefreshError('invalid_grant', true);
        }),
        acquireToken: jest.fn(async () => acquired),
      })
    ).resolves.toEqual(acquired);

    await expect(store.get('key')).resolves.toEqual(acquired);
  });

  test('transient refresh failure keeps cached token and rejects', async () => {
    const store = new InMemoryGopherAgentTokenStore();
    const cached = {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: 1000,
    };
    await store.set('key', cached);
    const acquireToken = jest.fn();

    await expect(
      resolveOAuthTokenFromStore({
        store,
        key: 'key',
        nowMs: 2000,
        refreshToken: jest.fn(async () => {
          throw new OAuthTokenRefreshError('temporary failure', false);
        }),
        acquireToken,
      })
    ).rejects.toThrow('temporary failure');

    expect(acquireToken).not.toHaveBeenCalled();
    await expect(store.get('key')).resolves.toEqual(cached);
  });

  test('cache key separates resources and scopes', () => {
    expect(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        scopes: ['email', 'openid'],
      })
    ).not.toBe(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/b',
        issuer: 'https://auth.example.com',
        scopes: ['email', 'openid'],
      })
    );
    expect(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        scopes: ['email', 'openid'],
      })
    ).toBe(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        scopes: ['openid', 'email'],
      })
    );
  });

  test('cache key normalizes trailing issuer slashes', () => {
    expect(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com',
        scopes: ['openid'],
      })
    ).toBe(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/a',
        issuer: 'https://auth.example.com/',
        scopes: ['openid'],
      })
    );
  });
});
