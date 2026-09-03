import { GopherAgent } from '../src/agent';
import { GopherOrchHandle } from '../src/ffi/library';
import * as oauthResolver from '../src/oauthResolver';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const URL_A = 'https://mcp.example.com/a/mcp';
const URL_B = 'https://mcp.example.com/b/mcp';

type AgentCreateByJson = jest.Mock<
  GopherOrchHandle,
  [string, string, string, unknown]
>;
type CreateFromFfi = (
  createHandle: (lib: {
    agentCreateByJson: AgentCreateByJson;
  }) => GopherOrchHandle
) => GopherAgent;

function serverConfig(...urls: string[]): string {
  return JSON.stringify({
    succeeded: true,
    data: {
      servers: urls.map((url, index) => ({
        serverId: `srv-${index + 1}`,
        transport: 'http_sse',
        config: { url },
      })),
    },
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

describe('GopherAgent.createWithServerConfig', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('single OAuth URL scopes token before native JSON create', async () => {
    const config = serverConfig(URL_A);
    const agentCreateByJson = installNativeCreateMock();
    const resolveRuntimeOptionsWithOAuth = jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockResolvedValue({
        serverOptions: [
          {
            serverId: 'srv-1',
            url: URL_A,
            accessToken: 'resolved-token',
          },
        ],
        oauthAuthorizationOrigins: ['https://auth.example.com'],
      });

    await GopherAgent.createWithServerConfig(PROVIDER, MODEL, config, {
      oauth: {},
    });

    expect(resolveRuntimeOptionsWithOAuth).toHaveBeenCalledWith({
      urls: [],
      serverConfig: config,
      runtimeOptions: undefined,
      oauth: {},
      hooks: undefined,
    });
    expect(agentCreateByJson).toHaveBeenCalledWith(PROVIDER, MODEL, config, {
      serverOptions: [
        {
          serverId: 'srv-1',
          url: URL_A,
          accessToken: 'resolved-token',
        },
      ],
      elicitation: {},
    });
  });

  test('single OAuth URL preserves elicitation with resolved token', async () => {
    const config = serverConfig(URL_A);
    const agentCreateByJson = installNativeCreateMock();
    const handler = jest.fn(() => ({ action: 'accept' as const }));
    const resolveRuntimeOptionsWithOAuth = jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockResolvedValue({
        serverOptions: [
          {
            serverId: 'srv-1',
            url: URL_A,
            accessToken: 'resolved-token',
          },
        ],
      });

    await GopherAgent.createWithServerConfig(PROVIDER, MODEL, config, {
      oauth: {},
      elicitation: { handler, openBrowser: false },
    });

    expect(resolveRuntimeOptionsWithOAuth).toHaveBeenCalledWith({
      urls: [],
      serverConfig: config,
      runtimeOptions: undefined,
      oauth: {},
      hooks: undefined,
    });
    expect(agentCreateByJson).toHaveBeenCalledWith(PROVIDER, MODEL, config, {
      serverOptions: [
        {
          serverId: 'srv-1',
          url: URL_A,
          accessToken: 'resolved-token',
        },
      ],
      elicitation: { handler, openBrowser: false },
    });
  });

  test('multiple unauthenticated URLs create with existing runtime options', async () => {
    const config = serverConfig(URL_A, URL_B);
    const agentCreateByJson = installNativeCreateMock();
    const resolveRuntimeOptionsWithOAuth = jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockResolvedValue({ headers: { 'X-Tenant': 'tenant-a' } });

    await GopherAgent.createWithServerConfig(PROVIDER, MODEL, config, {
      headers: { 'X-Tenant': 'tenant-a' },
      oauth: {},
    });

    expect(resolveRuntimeOptionsWithOAuth).toHaveBeenCalledWith({
      urls: [],
      serverConfig: config,
      runtimeOptions: { headers: { 'X-Tenant': 'tenant-a' } },
      oauth: {},
      hooks: undefined,
    });
    expect(agentCreateByJson).toHaveBeenCalledWith(PROVIDER, MODEL, config, {
      headers: { 'X-Tenant': 'tenant-a' },
    });
  });

  test('multiple incompatible OAuth URLs fail before native create', async () => {
    const agentCreateByJson = installNativeCreateMock();
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockRejectedValue(
        new Error(
          'OAuth auto-flow found multiple protected MCP servers with different OAuth issuers.\nPer-server OAuth tokens are not supported yet.'
        )
      );

    await expect(
      GopherAgent.createWithServerConfig(
        PROVIDER,
        MODEL,
        serverConfig(URL_A, URL_B),
        { oauth: {} }
      )
    ).rejects.toThrow('Per-server OAuth tokens are not supported yet.');

    expect(agentCreateByJson).not.toHaveBeenCalled();
  });
});
