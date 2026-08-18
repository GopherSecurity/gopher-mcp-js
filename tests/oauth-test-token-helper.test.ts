import { refreshTestOAuthToken } from './helpers/oauthTestToken';

const TOKEN_ENDPOINT = 'https://idp.example.test/token';
const TOKEN_INPUT = {
  tokenEndpoint: TOKEN_ENDPOINT,
  clientId: 'test-client',
  clientSecret: 'test-secret',
  refreshToken: 'test-refresh-token',
};

describe('refreshTestOAuthToken', () => {
  test('posts refresh-token grant and returns token fields', async () => {
    const fetchImpl = fetchJson(
      {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
      },
      { status: 200 }
    );

    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl,
      })
    ).resolves.toEqual({
      accessToken: 'test-access-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      scope: 'openid profile email',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(TOKEN_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('test-client');
    expect(body.get('client_secret')).toBe('test-secret');
    expect(body.get('refresh_token')).toBe('test-refresh-token');
  });

  test.each([
    ['invalid_grant', 400],
    ['invalid_client', 401],
    ['unsupported_grant_type', 400],
  ])('surfaces OAuth error %s without secret values', async (error, status) => {
    const fetchImpl = fetchJson(
      {
        error,
        error_description: 'test-secret test-refresh-token test-access-token',
      },
      { status }
    );

    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl,
      })
    ).rejects.toThrow(
      `oauth_test_token_refresh_failed: token endpoint returned HTTP ${status} (${error})`
    );

    try {
      await refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl,
      });
    } catch (caught) {
      const message = (caught as Error).message;
      expect(message).not.toContain('test-secret');
      expect(message).not.toContain('test-refresh-token');
      expect(message).not.toContain('test-access-token');
    }
  });

  test('surfaces non-2xx responses clearly', async () => {
    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl: fetchJson({}, { status: 500 }),
      })
    ).rejects.toThrow(
      'oauth_test_token_refresh_failed: token endpoint returned HTTP 500'
    );
  });

  test('rejects missing access token', async () => {
    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl: fetchJson({ token_type: 'Bearer' }, { status: 200 }),
      })
    ).rejects.toThrow('token response missing access_token');
  });

  test('rejects missing token type', async () => {
    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl: fetchJson(
          { access_token: 'test-access-token' },
          { status: 200 }
        ),
      })
    ).rejects.toThrow('token response missing token_type');
  });

  test('rejects invalid JSON response', async () => {
    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl: fetchText('not-json', { status: 200 }),
      })
    ).rejects.toThrow('token response was not valid JSON');
  });

  test('rejects non-object JSON response', async () => {
    await expect(
      refreshTestOAuthToken({
        ...TOKEN_INPUT,
        fetchImpl: fetchText('[]', { status: 200 }),
      })
    ).rejects.toThrow('token response was not a JSON object');
  });
});

function fetchJson(
  body: unknown,
  init: ResponseInit
): jest.MockedFunction<typeof fetch> {
  return fetchText(JSON.stringify(body), init);
}

function fetchText(
  body: string,
  init: ResponseInit
): jest.MockedFunction<typeof fetch> {
  return jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => new Response(body, init)
  );
}
