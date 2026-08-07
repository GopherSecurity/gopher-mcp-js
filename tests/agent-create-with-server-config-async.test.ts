import { GopherAgent } from '../src/agent';
import { GopherOrchHandle } from '../src/ffi/library';
import { setOAuthResolverHooksForTest } from '../src/oauthResolver';

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

describe('GopherAgent.createWithServerConfigAsync', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setOAuthResolverHooksForTest();
  });

  test('single OAuth URL resolves token before native JSON create', async () => {
    const config = serverConfig(URL_A);
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

    await GopherAgent.createWithServerConfigAsync(PROVIDER, MODEL, config, {
      oauth: {},
    });

    expect(probeChallenge).toHaveBeenCalledWith(URL_A);
    expect(acquireToken).toHaveBeenCalledTimes(1);
    expect(agentCreateByJson).toHaveBeenCalledWith(PROVIDER, MODEL, config, {
      accessToken: 'resolved-token',
    });
  });

  test('multiple unauthenticated URLs create with existing runtime options', async () => {
    const config = serverConfig(URL_A, URL_B);
    const agentCreateByJson = installNativeCreateMock();
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: false,
    }));
    const acquireToken = jest.fn();
    setOAuthResolverHooksForTest({ probeChallenge, acquireToken });

    await GopherAgent.createWithServerConfigAsync(PROVIDER, MODEL, config, {
      headers: { 'X-Tenant': 'tenant-a' },
      oauth: {},
    });

    expect(probeChallenge).toHaveBeenCalledTimes(2);
    expect(probeChallenge).toHaveBeenCalledWith(URL_A);
    expect(probeChallenge).toHaveBeenCalledWith(URL_B);
    expect(acquireToken).not.toHaveBeenCalled();
    expect(agentCreateByJson).toHaveBeenCalledWith(PROVIDER, MODEL, config, {
      headers: { 'X-Tenant': 'tenant-a' },
    });
  });

  test('multiple incompatible OAuth URLs fail before native create', async () => {
    const agentCreateByJson = installNativeCreateMock();
    const probeChallenge = jest.fn(async (url: string) => ({
      url,
      requiresOAuth: true,
      authorizationServer:
        url === URL_A
          ? 'https://auth-a.example.com'
          : 'https://auth-b.example.com',
    }));
    setOAuthResolverHooksForTest({ probeChallenge });

    await expect(
      GopherAgent.createWithServerConfigAsync(
        PROVIDER,
        MODEL,
        serverConfig(URL_A, URL_B),
        { oauth: {} }
      )
    ).rejects.toThrow('Per-server OAuth tokens are not supported yet.');

    expect(agentCreateByJson).not.toHaveBeenCalled();
  });
});
