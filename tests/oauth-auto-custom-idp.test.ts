import { GopherAgent } from '../src/agent';
import { GopherAgentTokenRecord, GopherAgentTokenStore } from '../src/config';
import { GopherOrchHandle } from '../src/ffi/library';
import { setOAuthFlowHooksForTest } from '../src/oauthResolver';
import {
  OAUTH_TEST_ACCESS_TOKEN,
  OAUTH_TEST_CLIENT_ID,
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import {
  CustomProtectedMcpEndpoint,
  startCustomProtectedMcpEndpoints,
} from './helpers/customProtectedMcpEndpoints';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';

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

describe('OAuth auto verification with custom IdP', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setOAuthFlowHooksForTest();
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

  setOAuthFlowHooksForTest({
    registerClient: async () => ({
      clientId: OAUTH_TEST_CLIENT_ID,
      clientSecret: OAUTH_TEST_CLIENT_SECRET,
    }),
  });

  try {
    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, endpoint.mcpUrl, {
        oauth: {
          tokenStore,
        },
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
    expect(stderrWrites.join('')).not.toContain(OAUTH_TEST_CLIENT_SECRET);
    expect(stderrWrites.join('')).not.toContain(OAUTH_TEST_REFRESH_TOKEN);
    expect(stderrWrites.join('')).not.toContain(OAUTH_TEST_ACCESS_TOKEN);
  } finally {
    await endpoints.close();
    await idp.close();
  }
}
