import { GopherAgent } from '../src/agent';
import { GopherAgentRuntimeOptions } from '../src/config';
import { GopherOrchHandle } from '../src/ffi/library';
import { setOAuthUrlRuntimeOptionsResolverForTest } from '../src/oauthResolver';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const URL = 'http://127.0.0.1:8080/mcp';

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

describe('GopherAgent.createWithUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setOAuthUrlRuntimeOptionsResolverForTest();
  });

  test('no OAuth options probes before createWithUrl', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(GopherAgent.createWithUrl(PROVIDER, MODEL, URL)).resolves.toBe(
      agent
    );

    expect(resolver).toHaveBeenCalledWith({
      url: URL,
      runtimeOptions: undefined,
      oauth: {},
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      undefined
    );
  });

  test('disabled OAuth delegates to createWithUrl without resolver', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        oauth: { mode: 'disabled' },
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      undefined
    );
  });

  test('explicit access token skips OAuth resolver', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        accessToken: 'caller-token',
        oauth: {},
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(agentCreateByUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      accessToken: 'caller-token',
    });
  });

  test('explicit Authorization header skips OAuth resolver', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        headers: { authorization: 'Bearer caller-token' },
        oauth: {},
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(agentCreateByUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      headers: { authorization: 'Bearer caller-token' },
    });
  });

  test('OAuth auto calls resolver before native create', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolvedOptions: GopherAgentRuntimeOptions = {
      accessToken: 'resolved-token',
    };
    const resolver = jest.fn(async () => resolvedOptions);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        oauth: { scopes: ['openid'] },
      })
    ).resolves.toBe(agent);

    expect(resolver).toHaveBeenCalledWith({
      url: URL,
      runtimeOptions: undefined,
      oauth: { scopes: ['openid'] },
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      resolvedOptions
    );
  });

  test('no OAuth options use resolved OAuth credentials when required', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolvedOptions: GopherAgentRuntimeOptions = {
      accessToken: 'resolved-token',
    };
    const resolver = jest.fn(async () => resolvedOptions);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(GopherAgent.createWithUrl(PROVIDER, MODEL, URL)).resolves.toBe(
      agent
    );

    expect(resolver).toHaveBeenCalledWith({
      url: URL,
      runtimeOptions: undefined,
      oauth: {},
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      resolvedOptions
    );
  });
});
