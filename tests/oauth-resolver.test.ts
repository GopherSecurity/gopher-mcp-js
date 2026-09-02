import { resolveRuntimeOptionsWithOAuth } from '../src/oauthResolver';
import {
  createOAuthTokenCacheKey,
  InMemoryGopherAgentTokenStore,
} from '../src/oauthTokenStore';

describe('resolveRuntimeOptionsWithOAuth', () => {
  test('disabled mode is a no-op', async () => {
    const runtimeOptions = { headers: { 'X-Tenant': 'tenant-a' } };
    const probeChallenge = jest.fn();

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:3001/mcp'],
        runtimeOptions,
        oauth: { mode: 'disabled' },
        hooks: { probeChallenge },
      })
    ).resolves.toEqual(runtimeOptions);

    expect(probeChallenge).not.toHaveBeenCalled();
  });

  test('existing access token is a no-op', async () => {
    const runtimeOptions = { accessToken: 'caller-token' };
    const probeChallenge = jest.fn();

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:3001/mcp'],
        runtimeOptions,
        oauth: {},
        hooks: { probeChallenge },
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

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:3001/mcp'],
        runtimeOptions,
        oauth: {},
        hooks: { probeChallenge, acquireToken },
      })
    ).resolves.toEqual(runtimeOptions);

    expect(probeChallenge).toHaveBeenCalledTimes(1);
    expect(acquireToken).not.toHaveBeenCalled();
  });

  test('passes runtime and server config headers to OAuth probes', async () => {
    const serverConfig = JSON.stringify({
      data: {
        servers: [
          {
            serverId: 'api-key-server',
            transport: 'http_sse',
            config: {
              url: 'https://mcp.example.com/mcp',
              headers: { 'X-Config-Key': 'config-key' },
            },
          },
        ],
      },
    });
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: false,
    }));

    await resolveRuntimeOptionsWithOAuth({
      urls: [],
      serverConfig,
      runtimeOptions: {
        headers: { 'X-Global': 'global' },
        serverOptions: [
          {
            serverId: 'api-key-server',
            headers: { 'X-Server': 'server' },
          },
        ],
      },
      oauth: {},
      hooks: { probeChallenge },
    });

    expect(probeChallenge).toHaveBeenCalledWith('https://mcp.example.com/mcp', {
      headers: {
        'X-Global': 'global',
        'X-Config-Key': 'config-key',
        'X-Server': 'server',
      },
    });
  });

  test('OAuth probe failure does not abort agent creation', async () => {
    const runtimeOptions = { headers: { 'X-Tenant': 'tenant-a' } };
    const probeChallenge = jest.fn(async () => {
      throw new Error('connect failed');
    });
    const acquireToken = jest.fn();

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['http://127.0.0.1:1/mcp'],
        runtimeOptions,
        oauth: {},
        hooks: { probeChallenge, acquireToken },
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

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        runtimeOptions: { headers: { 'X-Tenant': 'tenant-a' } },
        oauth: { scopes: ['openid'] },
        hooks: { probeChallenge, acquireToken },
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
      { scopes: ['openid'] },
      expect.any(Object)
    );
  });

  test('server config OAuth token is scoped to protected servers', async () => {
    const serverConfig = JSON.stringify({
      data: {
        servers: [
          {
            serverId: 'protected-server',
            name: 'protected-name',
            transport: 'http_sse',
            config: { url: 'https://mcp.example.com/protected' },
          },
          {
            serverId: 'public-server',
            transport: 'http_sse',
            config: { url: 'https://mcp.example.com/public' },
          },
        ],
      },
    });
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: url.endsWith('/protected'),
      authorizationServer: 'https://auth.example.com',
    }));
    const acquireToken = jest.fn(async () => ({
      accessToken: 'resolved-token',
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: [],
        serverConfig,
        runtimeOptions: { headers: { 'X-Tenant': 'tenant-a' } },
        oauth: {},
        hooks: { probeChallenge, acquireToken },
      })
    ).resolves.toEqual({
      headers: { 'X-Tenant': 'tenant-a' },
      serverOptions: [
        {
          serverId: 'protected-server',
          serverName: 'protected-name',
          url: 'https://mcp.example.com/protected',
          accessToken: 'resolved-token',
        },
      ],
    });
  });

  test('cached token avoids dynamic registration and browser flow', async () => {
    const tokenStore = new InMemoryGopherAgentTokenStore();
    await tokenStore.set(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/mcp',
        issuer: 'https://auth.example.com/',
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
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
    }));
    const hooks = {
      probeChallenge,
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
    };

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: { scopes: ['openid'], tokenStore },
        hooks,
      })
    ).resolves.toEqual({
      accessToken: 'cached-token',
      oauthAuthorizationOrigins: ['https://auth.example.com'],
    });

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
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      resource: 'https://mcp.example.com/mcp',
      authorizationServer: 'https://auth.example.com',
      scopes: ['openid'],
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: { tokenStore },
        hooks: {
          probeChallenge,
          fetchProtectedResourceMetadata,
          fetchAuthorizationServerMetadata,
          createLoopbackCallbackServer,
          registerClient,
          openAuthorizationUrl,
        },
      })
    ).resolves.toEqual({
      accessToken: 'cached-token',
      oauthAuthorizationOrigins: ['https://auth.example.com'],
    });

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

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/a', 'https://mcp.example.com/b'],
        oauth: {},
        hooks: { probeChallenge },
      })
    ).rejects.toThrow(
      'OAuth auto-flow found multiple protected MCP servers with different OAuth issuers.\nPer-server OAuth tokens are not supported yet.'
    );
  });

  test('uses configured OAuth redirect URI for loopback and registration', async () => {
    const tokenStore = new InMemoryGopherAgentTokenStore();
    const waitForCallback = jest.fn(async () => ({
      code: 'code-123',
      state: 'state-123',
    }));
    const close = jest.fn(async () => undefined);
    const createLoopbackCallbackServer = jest.fn(async () => ({
      redirectUri: 'http://127.0.0.1:49152/fixed-callback',
      waitForCallback,
      close,
    }));
    const registerClient = jest.fn(async () => ({
      clientId: 'client-123',
    }));
    const createCodeVerifier = jest
      .fn()
      .mockReturnValueOnce('state-123')
      .mockReturnValueOnce('verifier');
    const exchangeCodeForToken = jest.fn(async () => ({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 60_000,
    }));

    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: {
          redirectUri: 'http://127.0.0.1:49152/fixed-callback',
          scopes: ['openid'],
          tokenStore,
        },
        hooks: {
          probeChallenge,
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
          exchangeCodeForToken,
          createCodeVerifier,
          createCodeChallenge: () => 'challenge',
          openAuthorizationUrl: async (url) => ({
            opened: false,
            manualFallbackRequired: true,
            url,
          }),
        },
      })
    ).resolves.toEqual({
      accessToken: 'access-token',
      oauthAuthorizationOrigins: ['https://auth.example.com'],
    });

    expect(createLoopbackCallbackServer).toHaveBeenCalledWith({
      state: expect.any(String),
      redirectUri: 'http://127.0.0.1:49152/fixed-callback',
    });
    expect(registerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'http://127.0.0.1:49152/fixed-callback',
      })
    );
    expect(exchangeCodeForToken).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'http://127.0.0.1:49152/fixed-callback',
        resource: 'https://mcp.example.com/mcp',
      })
    );
  });

  test('does not request authorization-server scopes by default', async () => {
    const tokenStore = new InMemoryGopherAgentTokenStore();
    const waitForCallback = jest.fn(async () => ({
      code: 'code-123',
      state: 'state-123',
    }));
    const createLoopbackCallbackServer = jest.fn(async () => ({
      redirectUri: 'http://127.0.0.1:49152/callback',
      waitForCallback,
      close: jest.fn(async () => undefined),
    }));
    const registerClient = jest.fn(async () => ({
      clientId: 'client-123',
    }));
    const exchangeCodeForToken = jest.fn(async () => ({
      accessToken: 'access-token',
      tokenType: 'Bearer',
    }));
    const openAuthorizationUrl = jest.fn(async (url: string) => ({
      opened: true,
      manualFallbackRequired: false,
      url,
    }));
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: { tokenStore },
        hooks: {
          probeChallenge,
          fetchProtectedResourceMetadata: async () => ({
            resource: 'https://mcp.example.com/mcp',
            authorizationServers: ['https://auth.example.com'],
            scopesSupported: [],
            rawJson: '{}',
          }),
          fetchAuthorizationServerMetadata: async () => ({
            issuer: 'https://auth.example.com',
            authorizationEndpoint: 'https://auth.example.com/authorize',
            tokenEndpoint: 'https://auth.example.com/token',
            registrationEndpoint: 'https://auth.example.com/register',
            scopesSupported: ['openid', 'profile', 'email', 'phone'],
            rawJson: '{}',
          }),
          createLoopbackCallbackServer,
          registerClient,
          exchangeCodeForToken,
          createCodeVerifier: jest
            .fn()
            .mockReturnValueOnce('state-123')
            .mockReturnValueOnce('verifier'),
          createCodeChallenge: () => 'challenge',
          openAuthorizationUrl,
        },
      })
    ).resolves.toEqual({
      accessToken: 'access-token',
      oauthAuthorizationOrigins: ['https://auth.example.com'],
    });

    expect(registerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [],
      })
    );
    expect(openAuthorizationUrl).toHaveBeenCalled();
    const openedUrl = new URL(openAuthorizationUrl.mock.calls[0]?.[0] ?? '');
    expect(openedUrl.searchParams.get('scope')).toBeNull();
  });

  test('refreshes cached tokens with protected resource indicator', async () => {
    const tokenStore = new InMemoryGopherAgentTokenStore();
    await tokenStore.set(
      createOAuthTokenCacheKey({
        resource: 'https://mcp.example.com/mcp',
        issuer: 'https://auth.example.com',
        scopes: ['openid'],
      }),
      {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1_000,
        oauthClientId: 'registered-client',
        oauthClientSecret: 'registered-secret',
      }
    );
    const refreshToken = jest.fn(async () => ({
      accessToken: 'refreshed-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 60_000,
    }));
    const createLoopbackCallbackServer = jest.fn();
    const registerClient = jest.fn();
    const openAuthorizationUrl = jest.fn();
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/mcp'],
        oauth: { scopes: ['openid'], tokenStore },
        hooks: {
          probeChallenge,
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
          refreshToken,
          createLoopbackCallbackServer,
          registerClient,
          openAuthorizationUrl,
        },
      })
    ).resolves.toEqual({
      accessToken: 'refreshed-token',
      oauthAuthorizationOrigins: ['https://auth.example.com'],
    });

    expect(refreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'refresh-token',
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'registered-client',
        clientSecret: 'registered-secret',
        resource: 'https://mcp.example.com/mcp',
      })
    );
    expect(createLoopbackCallbackServer).not.toHaveBeenCalled();
    expect(registerClient).not.toHaveBeenCalled();
    expect(openAuthorizationUrl).not.toHaveBeenCalled();
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

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/a', 'https://mcp.example.com/b'],
        oauth: { scopes: ['openid', 'profile'] },
        hooks: { probeChallenge, acquireToken },
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
      { scopes: ['openid', 'profile'] },
      expect.any(Object)
    );
  });

  test('same issuer from different metadata URLs can reuse one token', async () => {
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      resourceMetadataUrl: `${url}/.well-known/oauth-protected-resource`,
    }));
    const fetchProtectedResourceMetadata = jest.fn(async (url: string) => ({
      resource: url.replace('/.well-known/oauth-protected-resource', ''),
      authorizationServers: ['https://auth.example.com'],
      scopesSupported: ['openid'],
      rawJson: '{}',
    }));
    const acquireToken = jest.fn(async () => ({
      accessToken: 'shared-token',
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: ['https://mcp.example.com/a', 'https://mcp.example.com/b'],
        oauth: {},
        hooks: { probeChallenge, acquireToken, fetchProtectedResourceMetadata },
      })
    ).resolves.toEqual({ accessToken: 'shared-token' });

    expect(fetchProtectedResourceMetadata).toHaveBeenCalledTimes(2);
    expect(acquireToken).toHaveBeenCalledTimes(1);
  });

  test('OAuth metadata enrichment failure does not abort other servers', async () => {
    const serverConfig = JSON.stringify({
      data: {
        servers: [
          {
            serverId: 'protected-a',
            transport: 'http_sse',
            config: { url: 'https://mcp.example.com/a' },
          },
          {
            serverId: 'protected-b',
            transport: 'http_sse',
            config: { url: 'https://mcp.example.com/b' },
          },
          {
            serverId: 'public-c',
            transport: 'http_sse',
            config: { url: 'https://mcp.example.com/c' },
          },
        ],
      },
    });
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: !url.endsWith('/c'),
      resourceMetadataUrl: `${url}/.well-known/oauth-protected-resource`,
    }));
    const fetchProtectedResourceMetadata = jest.fn(async (url: string) => {
      if (url.includes('/b/')) {
        throw new Error('metadata temporarily unavailable');
      }
      return {
        resource: url.replace('/.well-known/oauth-protected-resource', ''),
        authorizationServers: ['https://auth.example.com'],
        scopesSupported: ['openid'],
        rawJson: '{}',
      };
    });
    const acquireToken = jest.fn(async () => ({
      accessToken: 'shared-token',
    }));

    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls: [],
        serverConfig,
        oauth: {},
        hooks: { probeChallenge, fetchProtectedResourceMetadata, acquireToken },
      })
    ).resolves.toEqual({
      serverOptions: [
        {
          serverId: 'protected-a',
          url: 'https://mcp.example.com/a',
          accessToken: 'shared-token',
        },
      ],
    });

    expect(fetchProtectedResourceMetadata).toHaveBeenCalledTimes(2);
    expect(acquireToken).toHaveBeenCalledWith(
      [
        {
          url: 'https://mcp.example.com/a',
          requiresOAuth: true,
          resourceMetadataUrl:
            'https://mcp.example.com/a/.well-known/oauth-protected-resource',
          resource: 'https://mcp.example.com/a',
          authorizationServer: 'https://auth.example.com',
          scopes: ['openid'],
        },
      ],
      {},
      expect.any(Object)
    );
  });
});
