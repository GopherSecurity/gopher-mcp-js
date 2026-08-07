import { mergeOAuthTokenIntoRuntimeOptions } from '../src/oauthRuntimeOptions';

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
