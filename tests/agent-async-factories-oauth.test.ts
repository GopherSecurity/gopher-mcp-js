import { GopherAgent } from '../src/agent';
import { GopherAgentConfig } from '../src/config';
import { GopherOrchHandle } from '../src/ffi/library';
import { setOAuthResolverHooksForTest } from '../src/oauthResolver';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const API_KEY = 'test-api-key';
const MCP_URL = 'https://mcp.example.com/srv/mcp';
const elicitationHandler = jest.fn(() => ({ action: 'accept' as const }));
const elicitation = { handler: elicitationHandler, openBrowser: false };
const SERVER_CONFIG = JSON.stringify({
  succeeded: true,
  data: {
    servers: [
      {
        serverId: 'srv-1',
        name: 'mail',
        transport: 'http_sse',
        config: { url: MCP_URL },
      },
    ],
  },
});

type AgentCreateByJson = jest.Mock<
  GopherOrchHandle,
  [string, string, string, unknown]
>;
type CreateFromFfi = (
  createHandle: (lib: {
    agentCreateByJson: AgentCreateByJson;
  }) => GopherOrchHandle
) => GopherAgent;

const fetchMock = jest.fn<
  Promise<Pick<Response, 'ok' | 'status' | 'text'>>,
  Parameters<typeof fetch>
>();

function installFetchMock(): void {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => SERVER_CONFIG,
  });
}

function installNativeCreateMock(): AgentCreateByJson {
  const agentCreateByJson = jest.fn<
    GopherOrchHandle,
    [string, string, string, unknown]
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
      createHandle({ agentCreateByJson });
      return agent;
    });

  return agentCreateByJson;
}

function lastFetchedUrl(): string {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not invoked');
  }
  return call[0].toString();
}

describe('GopherAgent async API-key factories with OAuth', () => {
  const originalFetch = global.fetch;
  const originalGopherSdkTest = process.env['GOPHER_SDK_TEST'];

  beforeEach(() => {
    process.env['GOPHER_SDK_TEST'] = 'true';
    installFetchMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fetchMock.mockReset();
    global.fetch = originalFetch;
    setOAuthResolverHooksForTest();
    if (originalGopherSdkTest === undefined) {
      delete process.env['GOPHER_SDK_TEST'];
    } else {
      process.env['GOPHER_SDK_TEST'] = originalGopherSdkTest;
    }
  });

  test.each([
    {
      name: 'createWithApiKey',
      create: () =>
        GopherAgent.createWithApiKey(PROVIDER, MODEL, API_KEY, {
          elicitation,
        }),
      expectedFetchUrl: 'https://api-test.gopher.security/v1/mcp-servers',
    },
    {
      name: 'create',
      create: () =>
        GopherAgent.create(
          GopherAgentConfig.builder()
            .provider(PROVIDER)
            .model(MODEL)
            .apiKey(API_KEY)
            .runtimeOptions({ elicitation })
            .build()
        ),
      expectedFetchUrl: 'https://api-test.gopher.security/v1/mcp-servers',
    },
    {
      name: 'createWithServerId',
      create: () =>
        GopherAgent.createWithServerId(PROVIDER, MODEL, API_KEY, 'srv-1', {
          oauth: {},
          elicitation,
        }),
      expectedFetchUrl:
        'https://api-test.gopher.security/v1/mcp-servers?serverId=srv-1',
    },
    {
      name: 'createWithServerName',
      create: () =>
        GopherAgent.createWithServerName(PROVIDER, MODEL, API_KEY, 'mail', {
          oauth: {},
          elicitation,
        }),
      expectedFetchUrl:
        'https://api-test.gopher.security/v1/mcp-servers?serverName=mail',
    },
    {
      name: 'createWithGatewayId',
      create: () =>
        GopherAgent.createWithGatewayId(PROVIDER, MODEL, API_KEY, 'gw-1', {
          oauth: {},
          elicitation,
        }),
      expectedFetchUrl:
        'https://api-test.gopher.security/v1/mcp-servers?gatewayId=gw-1',
    },
    {
      name: 'createWithGatewayName',
      create: () =>
        GopherAgent.createWithGatewayName(PROVIDER, MODEL, API_KEY, 'prod', {
          oauth: {},
          elicitation,
        }),
      expectedFetchUrl:
        'https://api-test.gopher.security/v1/mcp-servers?gatewayName=prod',
    },
  ])(
    '$name probes expected config URLs',
    async ({ create, expectedFetchUrl }) => {
      const agentCreateByJson = installNativeCreateMock();
      const probeChallenge = jest.fn(async (url: string) => ({
        url,
        requiresOAuth: true,
        authorizationServer: 'https://auth.example.com',
      }));
      const acquireToken = jest.fn(async () => ({
        accessToken: 'resolved-token',
      }));
      setOAuthResolverHooksForTest({ probeChallenge, acquireToken });

      await create();

      expect(lastFetchedUrl()).toBe(expectedFetchUrl);
      expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
        accept: 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      });
      expect(probeChallenge).toHaveBeenCalledWith(MCP_URL);
      expect(acquireToken).toHaveBeenCalledTimes(1);
      expect(agentCreateByJson).toHaveBeenCalledWith(
        PROVIDER,
        MODEL,
        SERVER_CONFIG,
        { accessToken: 'resolved-token', elicitation }
      );
    }
  );

  test('no OAuth options continue without token when backend is public', async () => {
    const agentCreateByJson = installNativeCreateMock();
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: false,
    }));
    const acquireToken = jest.fn();
    setOAuthResolverHooksForTest({ probeChallenge, acquireToken });

    await GopherAgent.createWithServerId(PROVIDER, MODEL, API_KEY, 'srv-1');

    expect(lastFetchedUrl()).toBe(
      'https://api-test.gopher.security/v1/mcp-servers?serverId=srv-1'
    );
    expect(probeChallenge).toHaveBeenCalledWith(MCP_URL);
    expect(acquireToken).not.toHaveBeenCalled();
    expect(agentCreateByJson).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      SERVER_CONFIG,
      undefined
    );
  });

  test('existing caller credentials skip OAuth probing after config fetch', async () => {
    const agentCreateByJson = installNativeCreateMock();
    const probeChallenge = jest.fn();
    setOAuthResolverHooksForTest({ probeChallenge });

    await GopherAgent.createWithGatewayName(PROVIDER, MODEL, API_KEY, 'prod', {
      headers: { Authorization: 'Bearer caller-token' },
      oauth: {},
    });

    expect(lastFetchedUrl()).toBe(
      'https://api-test.gopher.security/v1/mcp-servers?gatewayName=prod'
    );
    expect(probeChallenge).not.toHaveBeenCalled();
    expect(agentCreateByJson).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      SERVER_CONFIG,
      { headers: { Authorization: 'Bearer caller-token' } }
    );
  });
});
