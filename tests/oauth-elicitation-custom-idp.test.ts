import { GopherAgent } from '../src/agent';
import { GopherAgentCreateOptions, GopherAgentTokenStore } from '../src/config';
import { resolveElicitationAction } from '../src/elicitationRuntime';
import { GopherOrchHandle } from '../src/ffi/library';
import {
  setOAuthFlowHooksForTest,
  setOAuthResolverHooksForTest,
} from '../src/oauthResolver';
import {
  OAUTH_TEST_ACCESS_TOKEN,
  OAUTH_TEST_CLIENT_ID,
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import { startCustomProtectedMcpEndpoints } from './helpers/customProtectedMcpEndpoints';

jest.mock('../src/ffi/auth/oauth-compatibility', () => ({
  requireNativeSingleOAuthAuthorizationServer: jest.fn((servers: string[]) => ({
    authorizationServer: servers[0] ?? '',
  })),
}));

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';

type AgentCreateByUrl = jest.Mock<
  GopherOrchHandle,
  [string, string, string, GopherAgentCreateOptions | undefined]
>;
type CreateFromFfi = (
  createHandle: (lib: {
    agentCreateByUrl: AgentCreateByUrl;
  }) => GopherOrchHandle
) => GopherAgent;

describe('OAuth elicitation verification with custom IdP', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setOAuthFlowHooksForTest();
    setOAuthResolverHooksForTest();
  });

  test('resolves first-step OAuth and accepts second-step provider OAuth', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const tokenStore = refreshTokenStore();
    const elicitationHandler = jest.fn(() => ({ action: 'accept' as const }));
    const agentCreateByUrl = installNativeCreateMock();

    setOAuthFlowHooksForTest({
      fetchProtectedResourceMetadata: async () => ({
        resource: endpoints.gateway.mcpUrl,
        authorizationServers: [idp.issuer],
        scopesSupported: ['openid', 'profile', 'email'],
        rawJson: '{}',
      }),
      fetchAuthorizationServerMetadata: async () => ({
        issuer: idp.issuer,
        authorizationEndpoint: idp.authorizationEndpoint,
        tokenEndpoint: idp.tokenEndpoint,
        scopesSupported: ['openid', 'profile', 'email'],
        rawJson: '{}',
      }),
      registerClient: async () => ({
        clientId: OAUTH_TEST_CLIENT_ID,
        clientSecret: OAUTH_TEST_CLIENT_SECRET,
      }),
      refreshToken: async () => ({
        accessToken: OAUTH_TEST_ACCESS_TOKEN,
        tokenType: 'Bearer',
      }),
    });
    setOAuthResolverHooksForTest({
      probeChallenge: async (url) => ({
        url,
        requiresOAuth: true,
        resourceMetadataUrl: endpoints.gateway.resourceMetadataUrl,
        authorizationServer: idp.issuer,
      }),
    });

    try {
      await GopherAgent.createWithUrl(
        PROVIDER,
        MODEL,
        endpoints.gateway.mcpUrl,
        {
          oauth: { tokenStore },
          elicitation: {
            handler: elicitationHandler,
            openBrowser: false,
          },
        }
      );

      const nativeOptions = agentCreateByUrl.mock.calls[0]?.[3];
      expect(nativeOptions).toEqual({
        accessToken: OAUTH_TEST_ACCESS_TOKEN,
        elicitation: {
          handler: elicitationHandler,
          openBrowser: false,
        },
      });

      await expect(
        resolveElicitationAction(nativeOptions!.elicitation!, {
          mode: 'url',
          elicitationId: 'provider-oauth-1',
          message: 'Connect provider account',
          url: `${idp.authorizationEndpoint}?client_id=provider-client&state=provider-state`,
          requestIdJson: '"srv-1"',
        })
      ).resolves.toBe('accept');

      expect(elicitationHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'url',
          elicitationId: 'provider-oauth-1',
          url: expect.stringContaining(idp.authorizationEndpoint),
        })
      );
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });
});

function installNativeCreateMock(): AgentCreateByUrl {
  const agentCreateByUrl = jest.fn<
    GopherOrchHandle,
    [string, string, string, GopherAgentCreateOptions | undefined]
  >(() => ({}) as GopherOrchHandle);
  const agent = {
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false),
  } as unknown as GopherAgent;

  jest
    .spyOn(
      GopherAgent as unknown as { createFromFfi: CreateFromFfi },
      'createFromFfi'
    )
    .mockImplementation((createHandle) => {
      createHandle({ agentCreateByUrl });
      return agent;
    });

  return agentCreateByUrl;
}

function refreshTokenStore(): GopherAgentTokenStore {
  return {
    get: jest.fn(async () => ({
      accessToken: 'expired-access-token',
      refreshToken: OAUTH_TEST_REFRESH_TOKEN,
      tokenType: 'Bearer',
      expiresAt: 0,
      oauthClientId: OAUTH_TEST_CLIENT_ID,
      oauthClientSecret: OAUTH_TEST_CLIENT_SECRET,
    })),
    set: jest.fn(async () => undefined),
  };
}
