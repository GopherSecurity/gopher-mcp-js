import { GopherAgent } from '../src/agent';
import {
  GopherAgentTokenRecord,
  GopherAgentOAuthOptions,
  GopherAgentTokenStore,
} from '../src/config';
import {
  GOPHER_AGENT_OAUTH_TEST_HOOKS,
  GopherAgentOAuthTestHooks,
} from '../src/internalOAuthTestHooks';
import { GopherOrchHandle } from '../src/ffi/library';
import {
  OAUTH_TEST_ACCESS_TOKEN,
  OAUTH_TEST_CLIENT_ID,
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  OAUTH_TEST_REGISTERED_CLIENT_ID,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import {
  CustomProtectedMcpEndpoint,
  startCustomProtectedMcpEndpoints,
} from './helpers/customProtectedMcpEndpoints';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const ORIGINAL_OAUTH_DEBUG = process.env.GOPHER_MCP_OAUTH_DEBUG;

function fakeAgent(): GopherAgent {
  return {
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false),
  } as unknown as GopherAgent;
}

type AgentCreateByUrl = jest.Mock<
  GopherOrchHandle,
  [string, string, string, unknown]
>;
type CreateFromFfi = (
  createHandle: (lib: {
    agentCreateByUrl: AgentCreateByUrl;
  }) => GopherOrchHandle
) => GopherAgent;

function installNativeCreateMock(): {
  agent: GopherAgent;
  agentCreateByUrl: AgentCreateByUrl;
} {
  const agent = fakeAgent();
  const agentCreateByUrl = jest.fn<
    GopherOrchHandle,
    [string, string, string, unknown]
  >(() => ({}) as GopherOrchHandle);

  jest
    .spyOn(
      GopherAgent as unknown as { createFromFfi: CreateFromFfi },
      'createFromFfi'
    )
    .mockImplementation((createHandle) => {
      createHandle({ agentCreateByUrl });
      return agent;
    });

  return { agent, agentCreateByUrl };
}

function createRefreshTokenStore(): GopherAgentTokenStore {
  const tokens = new Map<string, GopherAgentTokenRecord>();
  return {
    get: jest.fn(async (key) => {
      if (!tokens.has(key)) {
        return {
          accessToken: 'expired-access-token',
          refreshToken: OAUTH_TEST_REFRESH_TOKEN,
          tokenType: 'Bearer',
          expiresAt: 0,
          oauthClientId: OAUTH_TEST_CLIENT_ID,
          oauthClientSecret: OAUTH_TEST_CLIENT_SECRET,
        };
      }
      return tokens.get(key);
    }),
    set: jest.fn(async (key, token) => {
      tokens.set(key, token);
    }),
    delete: jest.fn(async (key) => {
      tokens.delete(key);
    }),
  };
}

function createEmptyTokenStore(): GopherAgentTokenStore {
  const tokens = new Map<string, GopherAgentTokenRecord>();
  return {
    get: jest.fn(async (key) => tokens.get(key)),
    set: jest.fn(async (key, token) => {
      tokens.set(key, token);
    }),
    delete: jest.fn(async (key) => {
      tokens.delete(key);
    }),
  };
}

function withOAuthTestHooks(
  oauth: GopherAgentOAuthOptions,
  hooks: GopherAgentOAuthTestHooks
): GopherAgentOAuthOptions {
  return {
    ...oauth,
    [GOPHER_AGENT_OAUTH_TEST_HOOKS]: hooks,
  } as GopherAgentOAuthOptions;
}

describe('OAuth auto verification with custom IdP', () => {
  beforeEach(() => {
    process.env.GOPHER_MCP_OAUTH_DEBUG = '1';
  });

  afterEach(() => {
    if (ORIGINAL_OAUTH_DEBUG === undefined) {
      delete process.env.GOPHER_MCP_OAUTH_DEBUG;
    } else {
      process.env.GOPHER_MCP_OAUTH_DEBUG = ORIGINAL_OAUTH_DEBUG;
    }
    jest.restoreAllMocks();
  });

  test('runs first-time DCR authorization-code flow for direct MCP server endpoint', async () => {
    const stderrWrites: string[] = [];
    jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const tokenStore = createEmptyTokenStore();

    try {
      await expect(
        GopherAgent.createWithUrl(PROVIDER, MODEL, endpoints.server.mcpUrl, {
          oauth: withOAuthTestHooks(
            { tokenStore },
            {
              openAuthorizationUrl: async (url: string) => {
                const response = await fetch(url, { redirect: 'follow' });
                await response.text();
                return { opened: true, url };
              },
            }
          ),
        })
      ).resolves.toBe(agent);

      expect(tokenStore.get).toHaveBeenCalled();
      expect(tokenStore.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          accessToken: OAUTH_TEST_ACCESS_TOKEN,
          refreshToken: OAUTH_TEST_REFRESH_TOKEN,
          oauthClientId: OAUTH_TEST_REGISTERED_CLIENT_ID,
          tokenType: 'Bearer',
        })
      );
      expect(agentCreateByUrl).toHaveBeenCalledWith(
        PROVIDER,
        MODEL,
        endpoints.server.mcpUrl,
        {
          accessToken: OAUTH_TEST_ACCESS_TOKEN,
        }
      );
      const stderr = stderrWrites.join('');
      expect(stderr).not.toBe('');
      expect(stderr).not.toContain(OAUTH_TEST_CLIENT_SECRET);
      expect(stderr).not.toContain(OAUTH_TEST_REFRESH_TOKEN);
      expect(stderr).not.toContain(OAUTH_TEST_ACCESS_TOKEN);
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('injects refreshed token for direct MCP server endpoint', async () => {
    await expectRefreshedTokenInjectedForEndpoint('server');
  });

  test('injects refreshed token for MCP gateway endpoint', async () => {
    await expectRefreshedTokenInjectedForEndpoint('gateway');
  });
});

async function expectRefreshedTokenInjectedForEndpoint(
  endpointName: 'server' | 'gateway'
): Promise<void> {
  const stderrWrites: string[] = [];
  jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk));
      return true;
    });
  const idp = await startCustomOAuthTestIdp();
  const endpoints = await startCustomProtectedMcpEndpoints({
    authorizationServer: idp.issuer,
    accessToken: OAUTH_TEST_ACCESS_TOKEN,
  });
  const endpoint: CustomProtectedMcpEndpoint = endpoints[endpointName];
  const { agent, agentCreateByUrl } = installNativeCreateMock();
  const tokenStore = createRefreshTokenStore();

  try {
    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, endpoint.mcpUrl, {
        oauth: withOAuthTestHooks(
          { tokenStore },
          {
            registerClient: async () => ({
              clientId: OAUTH_TEST_CLIENT_ID,
              clientSecret: OAUTH_TEST_CLIENT_SECRET,
            }),
          }
        ),
      })
    ).resolves.toBe(agent);

    expect(tokenStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        accessToken: OAUTH_TEST_ACCESS_TOKEN,
        tokenType: 'Bearer',
      })
    );
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      endpoint.mcpUrl,
      {
        accessToken: OAUTH_TEST_ACCESS_TOKEN,
      }
    );
    const stderr = stderrWrites.join('');
    expect(stderr).not.toBe('');
    expect(stderr).not.toContain(OAUTH_TEST_CLIENT_SECRET);
    expect(stderr).not.toContain(OAUTH_TEST_REFRESH_TOKEN);
    expect(stderr).not.toContain(OAUTH_TEST_ACCESS_TOKEN);
  } finally {
    await endpoints.close();
    await idp.close();
  }
}
