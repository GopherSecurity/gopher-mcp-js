import {
  hasRuntimeAuthorization,
  mergeOAuthTokenIntoRuntimeOptions,
  shouldSkipOAuthResolution,
} from '../src/oauthRuntimeOptions';

const token = {
  accessToken: 'oauth-token',
  tokenType: 'Bearer',
};

describe('mergeOAuthTokenIntoRuntimeOptions', () => {
  test('explicit Authorization header wins', () => {
    expect(
      mergeOAuthTokenIntoRuntimeOptions(
        { headers: { Authorization: 'Bearer caller-token' } },
        token
      )
    ).toEqual({
      headers: { Authorization: 'Bearer caller-token' },
    });
  });

  test('explicit access token wins', () => {
    expect(
      mergeOAuthTokenIntoRuntimeOptions({ accessToken: 'caller-token' }, token)
    ).toEqual({ accessToken: 'caller-token' });
  });

  test('OAuth token fills empty options', () => {
    expect(mergeOAuthTokenIntoRuntimeOptions(undefined, token)).toEqual({
      accessToken: 'oauth-token',
    });
  });

  test('existing unrelated headers are preserved', () => {
    expect(
      mergeOAuthTokenIntoRuntimeOptions(
        { headers: { 'X-Tenant': 'tenant-a' } },
        token
      )
    ).toEqual({
      headers: { 'X-Tenant': 'tenant-a' },
      accessToken: 'oauth-token',
    });
  });
});

describe('OAuth runtime option policy', () => {
  test('runtime access token counts as caller auth', () => {
    expect(hasRuntimeAuthorization({ accessToken: 'caller-token' })).toBe(true);
  });

  test('disabled OAuth skips resolution', () => {
    expect(
      shouldSkipOAuthResolution({
        oauth: { mode: 'disabled' },
        runtimeOptions: { headers: { 'X-Tenant': 'tenant-a' } },
      })
    ).toBe(true);
  });

  test('unrelated headers do not skip OAuth resolution', () => {
    expect(
      shouldSkipOAuthResolution({
        oauth: {},
        runtimeOptions: { headers: { 'X-Tenant': 'tenant-a' } },
      })
    ).toBe(false);
  });
});
