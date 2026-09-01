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
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const tokenStore = createRefreshTokenStore({
      refreshToken: 'wrong-refresh-token',
    });

    try {
      await expectFailureWithoutFixtureSecrets(
        GopherAgent.createWithUrl(PROVIDER, MODEL, endpoints.server.mcpUrl, {
          oauth: {
            tokenStore,
            hooks: {
              openAuthorizationUrl: async () => {
                throw new Error(
                  'authorization fallback disabled for invalid_grant test'
                );
              },
            },
          },
        }),
        'authorization fallback disabled for invalid_grant test'
      );
      expect(tokenStore.delete).toHaveBeenCalled();
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('wrong client credentials return secret-safe invalid_client failure', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const tokenStore = createRefreshTokenStore({
      clientId: 'wrong-client',
    });

    try {
      await expectFailureWithoutFixtureSecrets(
        GopherAgent.createWithUrl(PROVIDER, MODEL, endpoints.server.mcpUrl, {
          oauth: {
            tokenStore,
          },
        }),
        'invalid_client'
      );
      expect(tokenStore.delete).not.toHaveBeenCalled();
    } finally {
      await endpoints.close();
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

  test('SDK refresh failure stays secret-safe before fallback failure', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const tokenStore = createRefreshTokenStore({
      refreshToken: 'wrong-refresh-token',
    });

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

function createRefreshTokenStore(
  overrides: {
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
  } = {}
): GopherAgentTokenStore {
  return {
    get: jest.fn(async () => ({
      accessToken: 'expired-access-token',
      refreshToken: overrides.refreshToken ?? OAUTH_TEST_REFRESH_TOKEN,
      tokenType: 'Bearer',
      expiresAt: 0,
      oauthClientId: overrides.clientId ?? OAUTH_TEST_CLIENT_ID,
      oauthClientSecret: overrides.clientSecret ?? OAUTH_TEST_CLIENT_SECRET,
    })),
    set: jest.fn(async (_key: string, _token: GopherAgentTokenRecord) => {}),
    delete: jest.fn(async (_key: string) => {}),
  };
}
