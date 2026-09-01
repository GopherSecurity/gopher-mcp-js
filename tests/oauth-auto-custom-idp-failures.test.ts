import { GopherAgent } from '../src/agent';
import { GopherAgentTokenRecord, GopherAgentTokenStore } from '../src/config';
import {
  OAUTH_TEST_ACCESS_TOKEN,
  OAUTH_TEST_CLIENT_ID,
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import { startCustomProtectedMcpEndpoints } from './helpers/customProtectedMcpEndpoints';
import { refreshTestOAuthToken } from './helpers/oauthTestToken';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const FIXTURE_SECRETS = [
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  OAUTH_TEST_ACCESS_TOKEN,
];

describe('custom IdP OAuth auto failure modes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('wrong refresh token returns secret-safe invalid_grant failure', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      await expectFailureWithoutFixtureSecrets(
        refreshTestOAuthToken({
          tokenEndpoint: idp.tokenEndpoint,
          clientId: OAUTH_TEST_CLIENT_ID,
          clientSecret: OAUTH_TEST_CLIENT_SECRET,
          refreshToken: 'wrong-refresh-token',
        }),
        'invalid_grant'
      );
    } finally {
      await idp.close();
    }
  });

  test('wrong client credentials return secret-safe invalid_client failure', async () => {
    const idp = await startCustomOAuthTestIdp();
    try {
      await expectFailureWithoutFixtureSecrets(
        refreshTestOAuthToken({
          tokenEndpoint: idp.tokenEndpoint,
          clientId: 'wrong-client',
          clientSecret: OAUTH_TEST_CLIENT_SECRET,
          refreshToken: OAUTH_TEST_REFRESH_TOKEN,
        }),
        'invalid_client'
      );
    } finally {
      await idp.close();
    }
  });

  test('unsupported grant type returns clear OAuth failure', async () => {
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

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'unsupported_grant_type',
      });
    } finally {
      await idp.close();
    }
  });

  test('missing protected resource metadata fields fail clearly', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
      protectedResourceMetadata: {
        resource: 'missing-authorization-servers',
      },
    });

    try {
      await expectFailureWithoutFixtureSecrets(
        GopherAgent.createWithUrl(PROVIDER, MODEL, endpoints.server.mcpUrl),
        'authorization_servers'
      );
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('wrong bearer token is rejected by protected endpoint', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });

    try {
      const response = await fetch(endpoints.server.mcpUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'wrong-token' }),
        redirect: 'manual',
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        `Bearer realm="mcp", resource_metadata="${endpoints.server.resourceMetadataUrl}"`
      );
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('SDK refresh failure stays secret-safe before fallback failure', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const tokenStore = createRefreshTokenStore('wrong-refresh-token');

    try {
      await expectFailureWithoutFixtureSecrets(
        GopherAgent.createWithUrl(PROVIDER, MODEL, endpoints.server.mcpUrl, {
          oauth: {
            tokenStore,
            hooks: {
              registerClient: async () => ({
                clientId: OAUTH_TEST_CLIENT_ID,
                clientSecret: OAUTH_TEST_CLIENT_SECRET,
              }),
              openAuthorizationUrl: async () => {
                throw new Error(
                  'authorization fallback disabled for failure test'
                );
              },
            },
          },
        }),
        'authorization fallback disabled for failure test'
      );
      expect(tokenStore.delete).toHaveBeenCalled();
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });
});

async function expectFailureWithoutFixtureSecrets(
  promise: Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  try {
    await promise;
    throw new Error('expected promise to reject');
  } catch (caught) {
    const message = (caught as Error).message;
    expect(message).toContain(expectedMessage);
    for (const secret of FIXTURE_SECRETS) {
      expect(message).not.toContain(secret);
    }
  }
}

function createRefreshTokenStore(refreshToken: string): GopherAgentTokenStore {
  return {
    get: jest.fn(async () => ({
      accessToken: 'expired-access-token',
      refreshToken,
      tokenType: 'Bearer',
      expiresAt: 0,
      oauthClientId: OAUTH_TEST_CLIENT_ID,
      oauthClientSecret: OAUTH_TEST_CLIENT_SECRET,
    })),
    set: jest.fn(async (_key: string, _token: GopherAgentTokenRecord) => {}),
    delete: jest.fn(async (_key: string) => {}),
  };
}
