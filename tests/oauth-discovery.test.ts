import {
  fetchOAuthAuthorizationServerMetadata,
  fetchOAuthProtectedResourceMetadata,
  probeMcpOAuthChallenge,
} from '../src/oauthDiscovery';

const fetchMock = jest.fn();

function mockFetchResponse(input: {
  status?: number;
  ok?: boolean;
  body?: string;
  headers?: Record<string, string>;
}) {
  fetchMock.mockResolvedValueOnce({
    status: input.status ?? 200,
    ok: input.ok ?? true,
    headers: {
      get: (name: string) => input.headers?.[name.toLowerCase()] ?? null,
    },
    text: async () => input.body ?? '',
  });
}

describe('MCP OAuth challenge discovery', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test('maps no-OAuth response', async () => {
    mockFetchResponse({ status: 200 });

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 200,
    });
  });

  test('maps OAuth challenge with resource metadata', async () => {
    mockFetchResponse({
      status: 401,
      ok: false,
      headers: {
        'www-authenticate':
          'Bearer realm="mcp", resource_metadata="https://mcp.example.com/resource"',
      },
    });

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: true,
      httpStatus: 401,
      wwwAuthenticate:
        'Bearer realm="mcp", resource_metadata="https://mcp.example.com/resource"',
      resourceMetadataUrl: 'https://mcp.example.com/resource',
    });
  });

  test('preserves oauth_metadata_missing challenge failures', async () => {
    mockFetchResponse({
      status: 401,
      ok: false,
      headers: {
        'www-authenticate': 'Bearer realm="mcp"',
      },
    });

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).rejects.toThrow('oauth_metadata_missing');
  });
});

describe('OAuth protected resource metadata discovery', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test('maps protected resource metadata', async () => {
    const body =
      '{"resource":"https://mcp.example.com/mcp","authorization_servers":["https://auth.example.com"],"scopes_supported":["openid","email"]}';
    mockFetchResponse({ body });

    await expect(
      fetchOAuthProtectedResourceMetadata(
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp'
      )
    ).resolves.toEqual({
      resource: 'https://mcp.example.com/mcp',
      authorizationServers: ['https://auth.example.com'],
      scopesSupported: ['openid', 'email'],
      rawJson: body,
    });
  });

  test('preserves protected resource metadata failures', async () => {
    mockFetchResponse({
      body: '{"resource":"https://mcp.example.com/mcp"}',
    });

    await expect(
      fetchOAuthProtectedResourceMetadata('https://mcp.example.com/resource')
    ).rejects.toThrow('authorization_servers');
  });
});

describe('OAuth authorization server metadata discovery', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test('maps authorization server metadata', async () => {
    const body =
      '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token","registration_endpoint":"https://auth.example.com/register","scopes_supported":["openid","email"]}';
    mockFetchResponse({ body });

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).resolves.toEqual({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      registrationEndpoint: 'https://auth.example.com/register',
      scopesSupported: ['openid', 'email'],
      rawJson: body,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/oauth-authorization-server',
      expect.any(Object)
    );
  });

  test('builds authorization metadata URL with issuer path after well-known', async () => {
    const body =
      '{"issuer":"https://auth.example.com/realms/gopher","authorization_endpoint":"https://auth.example.com/realms/gopher/authorize","token_endpoint":"https://auth.example.com/realms/gopher/token"}';
    mockFetchResponse({ body });

    await expect(
      fetchOAuthAuthorizationServerMetadata(
        'https://auth.example.com/realms/gopher'
      )
    ).resolves.toEqual({
      issuer: 'https://auth.example.com/realms/gopher',
      authorizationEndpoint: 'https://auth.example.com/realms/gopher/authorize',
      tokenEndpoint: 'https://auth.example.com/realms/gopher/token',
      scopesSupported: [],
      rawJson: body,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/oauth-authorization-server/realms/gopher',
      expect.any(Object)
    );
  });

  test('falls back to OpenID configuration when OAuth metadata URL fails', async () => {
    const body =
      '{"issuer":"https://auth.example.com/realms/gopher","authorization_endpoint":"https://auth.example.com/realms/gopher/authorize","token_endpoint":"https://auth.example.com/realms/gopher/token"}';
    mockFetchResponse({ status: 404, ok: false });
    mockFetchResponse({ body });

    await expect(
      fetchOAuthAuthorizationServerMetadata(
        'https://auth.example.com/realms/gopher'
      )
    ).resolves.toEqual({
      issuer: 'https://auth.example.com/realms/gopher',
      authorizationEndpoint: 'https://auth.example.com/realms/gopher/authorize',
      tokenEndpoint: 'https://auth.example.com/realms/gopher/token',
      scopesSupported: [],
      rawJson: body,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://auth.example.com/.well-known/oauth-authorization-server/realms/gopher',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://auth.example.com/.well-known/openid-configuration/realms/gopher',
      expect.any(Object)
    );
  });

  test('omits empty registration endpoint', async () => {
    mockFetchResponse({
      body: '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token"}',
    });

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).resolves.toEqual({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      scopesSupported: [],
      rawJson:
        '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token"}',
    });
  });

  test('preserves authorization server metadata failures', async () => {
    mockFetchResponse({
      body: '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize"}',
    });

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).rejects.toThrow('token_endpoint');
  });
});
