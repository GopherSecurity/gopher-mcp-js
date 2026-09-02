import {
  OAUTH_TEST_ACCESS_TOKEN,
  OAUTH_TEST_CLIENT_ID,
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  OAUTH_TEST_REGISTERED_CLIENT_ID,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import { refreshOAuthToken } from '../src/oauthTokenExchange';

describe('custom OAuth test IdP', () => {
  test('serves OIDC and OAuth authorization server metadata', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      await expect(fetchJson(idp.openIdConfigurationUrl)).resolves.toEqual(
        expect.objectContaining({
          issuer: idp.issuer,
          authorization_endpoint: idp.authorizationEndpoint,
          token_endpoint: idp.tokenEndpoint,
          jwks_uri: idp.jwksUrl,
          grant_types_supported: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_methods_supported: [
            'none',
            'client_secret_post',
          ],
        })
      );
      await expect(
        fetchJson(idp.authorizationServerMetadataUrl)
      ).resolves.toEqual(
        expect.objectContaining({
          issuer: idp.issuer,
          token_endpoint: idp.tokenEndpoint,
        })
      );
      await expect(fetchJson(idp.jwksUrl)).resolves.toEqual({ keys: [] });
    } finally {
      await idp.close();
    }
  });

  test('redirects authorization requests back to the loopback callback', async () => {
    const idp = await startCustomOAuthTestIdp();
    const redirectUri = 'http://127.0.0.1:43210/callback';
    try {
      const registerResponse = await fetch(`${idp.issuer}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
        }),
      });
      await expect(registerResponse.json()).resolves.toEqual({
        client_id: OAUTH_TEST_REGISTERED_CLIENT_ID,
      });
      const response = await fetch(
        `${idp.authorizationEndpoint}?${new URLSearchParams({
          response_type: 'code',
          client_id: OAUTH_TEST_REGISTERED_CLIENT_ID,
          redirect_uri: redirectUri,
          state: 'test-state',
          code_challenge: 'test-challenge',
          code_challenge_method: 'S256',
        })}`,
        { redirect: 'manual' }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(
        `${redirectUri}?code=test-authorization-code&state=test-state`
      );
    } finally {
      await idp.close();
    }
  });

  test('dynamic registration does not disable confidential client refresh', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      const registerResponse = await fetch(`${idp.issuer}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://127.0.0.1:43210/callback'],
          token_endpoint_auth_method: 'none',
        }),
      });
      expect(registerResponse.status).toBe(201);

      await expect(
        refreshOAuthToken({
          tokenEndpoint: idp.tokenEndpoint,
          clientId: OAUTH_TEST_CLIENT_ID,
          clientSecret: OAUTH_TEST_CLIENT_SECRET,
          refreshToken: OAUTH_TEST_REFRESH_TOKEN,
        })
      ).resolves.toEqual(
        expect.objectContaining({
          accessToken: OAUTH_TEST_ACCESS_TOKEN,
          refreshToken: OAUTH_TEST_REFRESH_TOKEN,
        })
      );
    } finally {
      await idp.close();
    }
  });

  test('exchanges fixed test refresh token for deterministic access token', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      await expect(
        refreshOAuthToken({
          tokenEndpoint: idp.tokenEndpoint,
          clientId: OAUTH_TEST_CLIENT_ID,
          clientSecret: OAUTH_TEST_CLIENT_SECRET,
          refreshToken: OAUTH_TEST_REFRESH_TOKEN,
        })
      ).resolves.toEqual({
        accessToken: OAUTH_TEST_ACCESS_TOKEN,
        refreshToken: OAUTH_TEST_REFRESH_TOKEN,
        tokenType: 'Bearer',
        expiresAt: expect.any(Number),
      });
    } finally {
      await idp.close();
    }
  });

  test.each([
    [
      'bad client credentials',
      {
        clientId: 'wrong-client',
        clientSecret: OAUTH_TEST_CLIENT_SECRET,
        refreshToken: OAUTH_TEST_REFRESH_TOKEN,
      },
      'invalid_client',
    ],
    [
      'wrong refresh token',
      {
        clientId: OAUTH_TEST_CLIENT_ID,
        clientSecret: OAUTH_TEST_CLIENT_SECRET,
        refreshToken: 'wrong-refresh-token',
      },
      'invalid_grant',
    ],
  ])(
    'returns %s OAuth error deterministically',
    async (_label, credentials, expectedError) => {
      const idp = await startCustomOAuthTestIdp();
      try {
        await expect(
          refreshOAuthToken({
            tokenEndpoint: idp.tokenEndpoint,
            ...credentials,
          })
        ).rejects.toThrow(expectedError);
      } finally {
        await idp.close();
      }
    }
  );

  test('returns unsupported_grant_type for non-refresh grants', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      const response = await fetch(idp.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: OAUTH_TEST_CLIENT_ID,
          client_secret: OAUTH_TEST_CLIENT_SECRET,
        }),
      });

      await expect(response.json()).resolves.toEqual({
        error: 'unsupported_grant_type',
      });
      expect(response.status).toBe(400);
    } finally {
      await idp.close();
    }
  });

  test('returns invalid_request for missing fields', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      const response = await fetch(idp.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: OAUTH_TEST_CLIENT_ID,
          client_secret: OAUTH_TEST_CLIENT_SECRET,
        }),
      });

      await expect(response.json()).resolves.toEqual({
        error: 'invalid_request',
      });
      expect(response.status).toBe(400);
    } finally {
      await idp.close();
    }
  });

  test('close stops the local server', async () => {
    const idp = await startCustomOAuthTestIdp();
    await idp.close();

    await expect(fetch(idp.openIdConfigurationUrl)).rejects.toThrow();
  });
});

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return response.json();
}
