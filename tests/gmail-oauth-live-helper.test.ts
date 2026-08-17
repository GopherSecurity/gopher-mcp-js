import {
  GOOGLE_OAUTH_TOKEN_ENDPOINT,
  readGmailRefreshTokenEnv,
  refreshGmailAccessTokenFromEnv,
} from './helpers/gmailOAuthLive';

const COMPLETE_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  GOOGLE_GMAIL_REFRESH_TOKEN: 'refresh-token',
};

describe('Gmail OAuth live helper', () => {
  test('refreshes access token with Google refresh-token grant', async () => {
    const fetchImpl = fetchJson(
      {
        access_token: 'access-token',
        token_type: 'Bearer',
      },
      { status: 200 }
    );

    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl,
      })
    ).resolves.toEqual({
      accessToken: 'access-token',
      tokenType: 'Bearer',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(GOOGLE_OAUTH_TOKEN_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-token');
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('client_secret')).toBe('client-secret');
  });

  test('fails with missing variable names only', () => {
    expect(() =>
      readGmailRefreshTokenEnv({
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-value',
      })
    ).toThrow('GOOGLE_GMAIL_REFRESH_TOKEN');

    try {
      readGmailRefreshTokenEnv({
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-value',
      });
    } catch (error) {
      expect((error as Error).message).not.toContain('client-secret-value');
    }
  });

  test('surfaces invalid_grant without token values', async () => {
    const fetchImpl = fetchJson(
      {
        error: 'invalid_grant',
        error_description: 'refresh-token',
      },
      { status: 400 }
    );

    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl,
      })
    ).rejects.toThrow(
      'gmail_oauth_refresh_failed: Google token endpoint returned HTTP 400 (invalid_grant)'
    );

    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl,
      })
    ).rejects.not.toThrow('refresh-token');
  });

  test('surfaces non-2xx responses clearly', async () => {
    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl: fetchJson({}, { status: 500 }),
      })
    ).rejects.toThrow(
      'gmail_oauth_refresh_failed: Google token endpoint returned HTTP 500'
    );
  });

  test('rejects missing access token', async () => {
    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl: fetchJson({ token_type: 'Bearer' }, { status: 200 }),
      })
    ).rejects.toThrow('Google token response missing access_token');
  });

  test('rejects missing token type', async () => {
    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl: fetchJson({ access_token: 'access-token' }, { status: 200 }),
      })
    ).rejects.toThrow('Google token response missing token_type');
  });

  test('rejects invalid JSON response', async () => {
    await expect(
      refreshGmailAccessTokenFromEnv({
        env: COMPLETE_ENV,
        fetchImpl: fetchText('not-json', { status: 200 }),
      })
    ).rejects.toThrow('Google token response was not valid JSON');
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
