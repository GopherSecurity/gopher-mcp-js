import {
  fetchOAuthProtectedResourceMetadata,
  parseWwwAuthenticateParam,
  probeMcpOAuthChallenge,
} from '../src/oauthDiscovery';

const originalFetch = global.fetch;

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

describe('MCP OAuth challenge discovery', () => {
  afterEach(() => {
    global.fetch = originalFetch;
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

  test('handles missing WWW-Authenticate header', async () => {
    mockFetch(new Response('', { status: 401 }));

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).rejects.toThrow('oauth_metadata_missing');
  });

  test('handles 401 without resource metadata', async () => {
    mockFetch(
      new Response('', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="mcp"' },
      })
    );

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).rejects.toThrow('oauth_metadata_missing');
  });

  test('surfaces network errors clearly', async () => {
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
    ).rejects.toThrow('oauth_metadata_fetch_failed');
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
