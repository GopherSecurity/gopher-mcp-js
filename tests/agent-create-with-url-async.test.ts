import { GopherAgent } from '../src/agent';
import { GopherAgentRuntimeOptions } from '../src/config';
import { GopherOrchHandle, GopherOrchLibrary } from '../src/ffi/library';
import * as oauthResolver from '../src/oauthResolver';

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
  });

  test('no OAuth options probes before createWithUrl', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

    await expect(GopherAgent.createWithUrl(PROVIDER, MODEL, URL)).resolves.toBe(
      agent
    );

    expect(resolver).toHaveBeenCalledWith({
      urls: [URL],
      runtimeOptions: undefined,
      oauth: {},
      hooks: undefined,
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
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

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

  test('disabled OAuth preserves elicitation options', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    const handler = jest.fn(() => 'accept' as const);
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        oauth: { mode: 'disabled' },
        elicitation: { handler, openBrowser: false },
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(agentCreateByUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      {
        elicitation: { handler, openBrowser: false },
      }
    );
  });

  test('explicit access token skips OAuth resolver', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolver = jest.fn(async () => undefined);
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

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
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

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
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        oauth: { scopes: ['openid'] },
      })
    ).resolves.toBe(agent);

    expect(resolver).toHaveBeenCalledWith({
      urls: [URL],
      runtimeOptions: undefined,
      oauth: { scopes: ['openid'] },
      hooks: undefined,
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      ...resolvedOptions,
    });
  });

  test('OAuth auto preserves elicitation with resolved credentials', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const handler = jest.fn(() => ({ action: 'accept' as const }));
    const resolvedOptions: GopherAgentRuntimeOptions = {
      accessToken: 'resolved-token',
    };
    const resolver = jest.fn(async () => resolvedOptions);
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, URL, {
        oauth: { scopes: ['openid'] },
        elicitation: { handler, timeoutMs: 120000 },
      })
    ).resolves.toBe(agent);

    expect(resolver).toHaveBeenCalledWith({
      urls: [URL],
      runtimeOptions: undefined,
      oauth: { scopes: ['openid'] },
      hooks: undefined,
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      accessToken: 'resolved-token',
      elicitation: { handler, timeoutMs: 120000 },
    });
  });

  test('no OAuth options use resolved OAuth credentials when required', async () => {
    const { agent, agentCreateByUrl } = installNativeCreateMock();
    const resolvedOptions: GopherAgentRuntimeOptions = {
      accessToken: 'resolved-token',
    };
    const resolver = jest.fn(async () => resolvedOptions);
    jest
      .spyOn(oauthResolver, 'resolveRuntimeOptionsWithOAuth')
      .mockImplementation(resolver);

    await expect(GopherAgent.createWithUrl(PROVIDER, MODEL, URL)).resolves.toBe(
      agent
    );

    expect(resolver).toHaveBeenCalledWith({
      urls: [URL],
      runtimeOptions: undefined,
      oauth: {},
      hooks: undefined,
    });
    expect(agentCreateByUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      ...resolvedOptions,
    });
  });

  test('run handles provider OAuth URL in JS and retries once when accepted', () => {
    const handler = jest.fn(() => 'accept' as const);
    const agent = new (GopherAgent as unknown as {
      new (
        handle: GopherOrchHandle,
        elicitationOptions?: { handler: typeof handler }
      ): GopherAgent;
    })({} as GopherOrchHandle, { handler });
    const agentRun = jest
      .fn()
      .mockReturnValueOnce(
        'Authorization required: https://auth.example.com/authorize?client_id=provider-client&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code'
      )
      .mockReturnValueOnce('profile ok');

    jest.spyOn(GopherOrchLibrary, 'getInstance').mockReturnValue({
      agentRun,
      lastError: jest.fn(),
      clearError: jest.fn(),
    } as unknown as GopherOrchLibrary);

    expect(agent.run('get profile')).toBe('profile ok');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'url',
        url: expect.stringContaining('https://auth.example.com/authorize'),
      })
    );
    expect(agentRun).toHaveBeenCalledTimes(2);
  });
});
