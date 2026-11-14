import { registerOAuthClient } from '../src/oauthRegistration';
import {
  exchangeOAuthCodeForToken,
  refreshOAuthToken,
} from '../src/oauthTokenExchange';

const metadata = {
  issuer: 'https://auth.example',
  authorizationEndpoint: 'https://auth.example/authorize',
  tokenEndpoint: 'https://auth.example/token',
  registrationEndpoint: 'https://auth.example/register',
  scopesSupported: [],
  rawJson: '{}',
};

afterEach(() => jest.restoreAllMocks());

test('registration preserves the negotiated token endpoint authentication method', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        client_id: 'client',
        client_secret: 'secret',
        token_endpoint_auth_method: 'client_secret_basic',
      })
    )
  );
  await expect(
    registerOAuthClient({
      metadata,
      redirectUri: 'http://localhost/callback',
      scopes: [],
    })
  ).resolves.toMatchObject({ tokenEndpointAuthMethod: 'client_secret_basic' });
});

for (const grant of ['code', 'refresh']) {
  for (const method of ['client_secret_basic', 'client_secret_post', 'none']) {
    test(`${grant} token request uses ${method}`, async () => {
      const request = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ access_token: 'token' }))
        );
      const client = {
        tokenEndpoint: metadata.tokenEndpoint,
        clientId: 'cli:ent',
        ...(method !== 'none' ? { clientSecret: 'se cret' } : {}),
        tokenEndpointAuthMethod: method,
      };
      if (grant === 'code') {
        await exchangeOAuthCodeForToken({
          ...client,
          code: 'code',
          redirectUri: 'http://localhost/callback',
          codeVerifier: 'verifier',
        });
      } else {
        await refreshOAuthToken({ ...client, refreshToken: 'refresh' });
      }
      const init = request.mock.calls[0]![1]!;
      const headers = new Headers(init.headers);
      const form = new URLSearchParams(init.body as URLSearchParams);
      expect(form.get('client_id')).toBe('cli:ent');
      if (method === 'client_secret_basic') {
        expect(headers.get('authorization')).toBe(
          `Basic ${Buffer.from('cli%3Aent:se+cret').toString('base64')}`
        );
        expect(form.has('client_secret')).toBe(false);
      } else {
        expect(headers.has('authorization')).toBe(false);
        expect(form.get('client_secret')).toBe(
          method === 'none' ? null : 'se cret'
        );
      }
    });
  }
}
