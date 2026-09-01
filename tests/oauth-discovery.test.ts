import {
  fetchOAuthAuthorizationServerMetadata,
  fetchOAuthProtectedResourceMetadata,
  parseWwwAuthenticateParam,
  probeMcpOAuthChallenge,
} from '../src/oauthDiscovery';

const originalFetch = global.fetch;
const originalOAuthDebug = process.env.GOPHER_MCP_OAUTH_DEBUG;

function mockFetch(response: Response): jest.MockedFunction<typeof fetch> {
  const fetchMock = jest.fn(
    async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1]
    ) => response
  ) as jest.MockedFunction<typeof fetch>;
  global.fetch = fetchMock;
  return fetchMock;
}

function mockFetchSequence(
  responses: Response[]
): jest.MockedFunction<typeof fetch> {
  const fetchMock = jest.fn(async (_input: Parameters<typeof fetch>[0]) => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error('unexpected fetch');
    }
    return response;
  }) as jest.MockedFunction<typeof fetch>;
  global.fetch = fetchMock;
  return fetchMock;
}

describe('MCP OAuth challenge discovery', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GOPHER_MCP_OAUTH_DEBUG = originalOAuthDebug;
    jest.restoreAllMocks();
  });

  test('parses quoted resource_metadata from WWW-Authenticate', () => {
    expect(
      parseWwwAuthenticateParam(
        'Bearer realm="mcp", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
        'resource_metadata'
      )
    ).toBe('https://mcp.example.com/.well-known/oauth-protected-resource/mcp');
  });

  test('treats 2xx response as no OAuth required', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 200,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mcp.example.com/mcp',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('terminates initialized probe sessions when the server returns a session id', async () => {
    const fetchMock = mockFetchSequence([
      new Response('{}', {
        status: 200,
        headers: { 'Mcp-Session-Id': 'session-123' },
      }),
      new Response(null, { status: 204 }),
    ]);

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp', {
        headers: { 'X-Api-Key': 'api-key' },
      })
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 200,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://mcp.example.com/mcp',
      expect.objectContaining({
        method: 'DELETE',
        redirect: 'manual',
        headers: {
          'Mcp-Session-Id': 'session-123',
          'X-Api-Key': 'api-key',
        },
      })
    );
  });

  test('ignores probe session termination failures', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Mcp-Session-Id': 'session-123' },
        })
      )
      .mockRejectedValueOnce(new Error('delete failed'));
    global.fetch = fetchMock as jest.MockedFunction<typeof fetch>;

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('sends caller headers with OAuth probe', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));

    await probeMcpOAuthChallenge('https://mcp.example.com/mcp', {
      headers: {
        'X-Api-Key': 'api-key',
        'X-Tenant': 'tenant-a',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mcp.example.com/mcp',
      expect.objectContaining({
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'X-Api-Key': 'api-key',
          'X-Tenant': 'tenant-a',
        },
      })
    );
  });

  test('returns OAuth requirement for 401 challenge with metadata', async () => {
    mockFetch(
      new Response('', {
        status: 401,
        headers: {
          'WWW-Authenticate':
            'Bearer realm="mcp", resource_metadata="https://mcp.example.com/resource"',
        },
      })
    );

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

  test('falls back to protected-resource well-known metadata for bare 401', async () => {
    const fetchMock = mockFetchSequence([
      new Response('', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="mcp"' },
      }),
      new Response(
        JSON.stringify({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://auth.example.com'],
          scopes_supported: ['openid'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
    ]);

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: true,
      httpStatus: 401,
      wwwAuthenticate: 'Bearer realm="mcp"',
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      resource: 'https://mcp.example.com/mcp',
      authorizationServer: 'https://auth.example.com',
      scopes: ['openid'],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('uses origin protected-resource well-known metadata for root resources', async () => {
    const fetchMock = mockFetchSequence([
      new Response('', { status: 401 }),
      new Response(
        JSON.stringify({
          resource: 'https://mcp.example.com/',
          authorization_servers: ['https://auth.example.com'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
    ]);

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/')
    ).resolves.toMatchObject({
      requiresOAuth: true,
      resourceMetadataUrl:
        'https://mcp.example.com/.well-known/oauth-protected-resource',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://mcp.example.com/.well-known/oauth-protected-resource',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('treats missing WWW-Authenticate header as no OAuth requirement when fallback metadata is unavailable', async () => {
    mockFetchSequence([
      new Response('', { status: 401 }),
      new Response('', { status: 404 }),
    ]);

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 401,
      wwwAuthenticate: undefined,
    });
  });

  test('treats 401 without resource metadata as no OAuth requirement when fallback metadata is unavailable', async () => {
    mockFetchSequence([
      new Response('', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="mcp"' },
      }),
      new Response('', { status: 404 }),
    ]);

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 401,
      wwwAuthenticate: 'Bearer realm="mcp"',
    });
  });

  test('treats network errors as no OAuth requirement', async () => {
    process.env.GOPHER_MCP_OAUTH_DEBUG = '1';
    const stderrWrite = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    global.fetch = jest.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1]
      ) => {
        throw new Error('connect failed');
      }
    ) as jest.MockedFunction<typeof fetch>;

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 0,
    });
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('probe request failed')
    );
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('connect failed')
    );
  });

  test('treats non-401 probe responses as no OAuth requirement', async () => {
    mockFetch(new Response('', { status: 405 }));

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 405,
    });
  });
});

describe('OAuth protected resource metadata discovery', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('parses valid metadata', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://auth.example.com'],
          scopes_supported: ['openid', 'email'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(
      fetchOAuthProtectedResourceMetadata(
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp'
      )
    ).resolves.toEqual({
      resource: 'https://mcp.example.com/mcp',
      authorizationServers: ['https://auth.example.com'],
      scopesSupported: ['openid', 'email'],
      rawJson:
        '{"resource":"https://mcp.example.com/mcp","authorization_servers":["https://auth.example.com"],"scopes_supported":["openid","email"]}',
    });
  });

  test('preserves multiple authorization servers', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: [
            'https://auth-a.example.com',
            'https://auth-b.example.com',
          ],
        }),
        { status: 200 }
      )
    );

    const metadata = await fetchOAuthProtectedResourceMetadata(
      'https://mcp.example.com/resource'
    );

    expect(metadata.authorizationServers).toEqual([
      'https://auth-a.example.com',
      'https://auth-b.example.com',
    ]);
    expect(metadata.scopesSupported).toEqual([]);
  });

  test('missing authorization server fails clearly', async () => {
    mockFetch(
      new Response(
        JSON.stringify({ resource: 'https://mcp.example.com/mcp' }),
        {
          status: 200,
        }
      )
    );

    await expect(
      fetchOAuthProtectedResourceMetadata('https://mcp.example.com/resource')
    ).rejects.toThrow('authorization_servers');
  });

  test('invalid JSON fails clearly', async () => {
    mockFetch(new Response('{not json', { status: 200 }));

    await expect(
      fetchOAuthProtectedResourceMetadata('https://mcp.example.com/resource')
    ).rejects.toThrow('Invalid protected resource metadata JSON');
  });
});

describe('OAuth authorization server metadata discovery', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('OAuth metadata path works', async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register',
          scopes_supported: ['openid', 'email'],
        }),
        { status: 200 }
      )
    );

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).resolves.toEqual({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      registrationEndpoint: 'https://auth.example.com/register',
      scopesSupported: ['openid', 'email'],
      rawJson:
        '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token","registration_endpoint":"https://auth.example.com/register","scopes_supported":["openid","email"]}',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/oauth-authorization-server',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('OIDC fallback works', async () => {
    const fetchMock = mockFetchSequence([
      new Response('', { status: 404 }),
      new Response(
        JSON.stringify({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
        }),
        { status: 200 }
      ),
    ]);

    const metadata = await fetchOAuthAuthorizationServerMetadata(
      'https://auth.example.com'
    );

    expect(metadata.issuer).toBe('https://auth.example.com');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server',
      'https://auth.example.com/.well-known/openid-configuration',
    ]);
  });

  test('path-based OAuth issuer works', async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          issuer: 'https://auth.example.com/tenant',
          authorization_endpoint: 'https://auth.example.com/tenant/authorize',
          token_endpoint: 'https://auth.example.com/tenant/token',
        }),
        { status: 200 }
      )
    );

    await fetchOAuthAuthorizationServerMetadata(
      'https://auth.example.com/tenant'
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://auth.example.com/.well-known/oauth-authorization-server/tenant'
    );
  });

  test('path-based OIDC issuer uses issuer-relative fallback', async () => {
    const fetchMock = mockFetchSequence([
      new Response('', { status: 404 }),
      new Response(
        JSON.stringify({
          issuer: 'https://auth.example.com/realms/acme',
          authorization_endpoint:
            'https://auth.example.com/realms/acme/authorize',
          token_endpoint: 'https://auth.example.com/realms/acme/token',
        }),
        { status: 200 }
      ),
    ]);

    await fetchOAuthAuthorizationServerMetadata(
      'https://auth.example.com/realms/acme'
    );

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server/realms/acme',
      'https://auth.example.com/realms/acme/.well-known/openid-configuration',
    ]);
  });

  test('missing authorization endpoint fails', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          issuer: 'https://auth.example.com',
          token_endpoint: 'https://auth.example.com/token',
        }),
        { status: 200 }
      )
    );

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).rejects.toThrow('authorization_endpoint');
  });

  test('missing token endpoint fails', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
        }),
        { status: 200 }
      )
    );

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).rejects.toThrow('token_endpoint');
  });
});
