import {
  resolveRuntimeOptionsWithOAuth,
  setOAuthFlowHooksForTest,
  setOAuthResolverHooksForTest,
} from '../src/oauthResolver';
import {
  createOAuthTokenCacheKey,
  InMemoryGopherAgentTokenStore,
} from '../src/oauthTokenStore';

describe('resolveRuntimeOptionsWithOAuth', () => {
  afterEach(() => {
    setOAuthResolverHooksForTest();
    setOAuthFlowHooksForTest();
  });

  test('disabled mode is a no-op', async () => {
    const runtimeOptions = { headers: { 'X-Tenant': 'tenant-a' } };
    const probeChallenge = jest.fn();
    setOAuthResolverHooksForTest({ probeChallenge });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:3001/mcp'],
        runtimeOptions,
        oauth: { mode: 'disabled' },
      })
    ).resolves.toEqual(runtimeOptions);

    expect(probeChallenge).not.toHaveBeenCalled();
  });

  test('existing access token is a no-op', async () => {
    const runtimeOptions = { accessToken: 'caller-token' };
    const probeChallenge = jest.fn();
    setOAuthResolverHooksForTest({ probeChallenge });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:3001/mcp'],
        runtimeOptions,
        oauth: {},
      })
    ).resolves.toEqual(runtimeOptions);

    expect(probeChallenge).not.toHaveBeenCalled();
  });

  test('unauthenticated server keeps existing runtime options', async () => {
    const runtimeOptions = { headers: { 'X-Tenant': 'tenant-a' } };
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: false,
    }));
    const acquireToken = jest.fn();
    setOAuthResolverHooksForTest({ probeChallenge, acquireToken });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:3001/mcp'],
        runtimeOptions,
        oauth: {},
      })
    ).resolves.toEqual(runtimeOptions);

    expect(probeChallenge).toHaveBeenCalledTimes(1);
    expect(acquireToken).not.toHaveBeenCalled();
  });

  test('one OAuth server returns merged access token', async () => {
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
    }));
    const acquireToken = jest.fn(async () => ({
      accessToken: 'resolved-token',
    }));
    setOAuthResolverHooksForTest({ probeChallenge, acquireToken });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        runtimeOptions: { headers: { 'X-Tenant': 'tenant-a' } },
        oauth: { scopes: ['openid'] },
      })
    ).resolves.toEqual({
      accessToken: 'resolved-token',
      headers: { 'X-Tenant': 'tenant-a' },
    });

    expect(acquireToken).toHaveBeenCalledWith(
      [
        {
          url: 'https://mcp.example.com/mcp',
          requiresOAuth: true,
          resourceMetadataUrl:
            'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
        },
      ],
      { scopes: ['openid'] }
    );
  });

  test('cached token avoids dynamic registration and browser flow', async () => {
    const tokenStore = new InMemoryGopherAgentTokenStore();
    await tokenStore.set(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/mcp',
        issuer: 'https://auth.example.com',
        scopes: ['openid'],
      }),
      {
        accessToken: 'cached-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 60_000,
        oauthClientId: 'registered-client',
      }
    );
    const createLoopbackCallbackServer = jest.fn();
    const registerClient = jest.fn();
    const openAuthorizationUrl = jest.fn();
    setOAuthResolverHooksForTest({
      probeChallenge: jest.fn(async (url: string) => ({
        url,
        requiresOAuth: true,
        resourceMetadataUrl:
          'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      })),
    });
    setOAuthFlowHooksForTest({
      fetchProtectedResourceMetadata: async () => ({
        resource: 'https://mcp.example.com/mcp',
        authorizationServers: ['https://auth.example.com'],
        scopesSupported: ['openid'],
        rawJson: '{}',
      }),
      fetchAuthorizationServerMetadata: async () => ({
        issuer: 'https://auth.example.com',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        registrationEndpoint: 'https://auth.example.com/register',
        scopesSupported: ['openid'],
        rawJson: '{}',
      }),
      createLoopbackCallbackServer,
      registerClient,
      openAuthorizationUrl,
    });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: { scopes: ['openid'], tokenStore },
      })
    ).resolves.toEqual({ accessToken: 'cached-token' });

    expect(createLoopbackCallbackServer).not.toHaveBeenCalled();
    expect(registerClient).not.toHaveBeenCalled();
    expect(openAuthorizationUrl).not.toHaveBeenCalled();
  });

  test('challenge metadata can resolve cached token before OAuth discovery', async () => {
    const tokenStore = new InMemoryGopherAgentTokenStore();
    await tokenStore.set(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/mcp',
        issuer: 'https://auth.example.com',
        scopes: ['openid'],
      }),
      {
        accessToken: 'cached-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 60_000,
        oauthClientId: 'registered-client',
      }
    );
    const fetchProtectedResourceMetadata = jest.fn();
    const fetchAuthorizationServerMetadata = jest.fn();
    const createLoopbackCallbackServer = jest.fn();
    const registerClient = jest.fn();
    const openAuthorizationUrl = jest.fn();
    setOAuthResolverHooksForTest({
      probeChallenge: jest.fn(async (url: string) => ({
        url,
        requiresOAuth: true,
        resourceMetadataUrl:
          'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
        resource: 'https://mcp.example.com/mcp',
        authorizationServer: 'https://auth.example.com',
        scopes: ['openid'],
      })),
    });
    setOAuthFlowHooksForTest({
      fetchProtectedResourceMetadata,
      fetchAuthorizationServerMetadata,
      createLoopbackCallbackServer,
      registerClient,
      openAuthorizationUrl,
    });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: { tokenStore },
      })
    ).resolves.toEqual({ accessToken: 'cached-token' });

    expect(fetchProtectedResourceMetadata).not.toHaveBeenCalled();
    expect(fetchAuthorizationServerMetadata).not.toHaveBeenCalled();
    expect(createLoopbackCallbackServer).not.toHaveBeenCalled();
    expect(registerClient).not.toHaveBeenCalled();
    expect(openAuthorizationUrl).not.toHaveBeenCalled();
  });

  test('multiple incompatible OAuth servers fail clearly', async () => {
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      authorizationServer: url.endsWith('/a')
        ? 'https://auth-a.example.com'
        : 'https://auth-b.example.com',
    }));
    setOAuthResolverHooksForTest({ probeChallenge });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/a', 'https://mcp.example.com/b'],
        oauth: {},
      })
    ).rejects.toThrow(
      'OAuth auto-flow found multiple protected MCP servers with different OAuth issuers.\nPer-server OAuth tokens are not supported yet.'
    );
  });

  test('multiple equivalent OAuth servers can reuse one token', async () => {
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      authorizationServer: 'https://auth.example.com',
      resource: 'https://mcp.example.com/resource',
      scopes: ['profile', 'openid'],
    }));
    const acquireToken = jest.fn(async () => ({
      accessToken: 'shared-token',
    }));
    setOAuthResolverHooksForTest({ probeChallenge, acquireToken });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/a', 'https://mcp.example.com/b'],
        oauth: { scopes: ['openid', 'profile'] },
      })
    ).resolves.toEqual({ accessToken: 'shared-token' });

    expect(acquireToken).toHaveBeenCalledTimes(1);
    expect(acquireToken).toHaveBeenCalledWith(
      [
        {
          url: 'https://mcp.example.com/a',
          requiresOAuth: true,
          authorizationServer: 'https://auth.example.com',
          resource: 'https://mcp.example.com/resource',
          scopes: ['profile', 'openid'],
        },
        {
          url: 'https://mcp.example.com/b',
          requiresOAuth: true,
          authorizationServer: 'https://auth.example.com',
          resource: 'https://mcp.example.com/resource',
          scopes: ['profile', 'openid'],
        },
      ],
      { scopes: ['openid', 'profile'] }
    );
  });

  test('same issuer with different resource still fails before per-server tokens exist', async () => {
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      authorizationServer: 'https://auth.example.com',
      resource: url,
    }));
    setOAuthResolverHooksForTest({ probeChallenge });

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/a', 'https://mcp.example.com/b'],
        oauth: {},
      })
    ).rejects.toThrow('Per-server OAuth tokens are not supported yet.');
  });
});
