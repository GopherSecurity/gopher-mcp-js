import {
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
