import {
  resolveRuntimeOptionsWithOAuth,
  setOAuthResolverHooksForTest,
} from '../src/oauthResolver';

describe('resolveRuntimeOptionsWithOAuth', () => {
  afterEach(() => {
    setOAuthResolverHooksForTest();
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
    ).rejects.toThrow('oauth_multiple_issuers_unsupported');
  });
});
