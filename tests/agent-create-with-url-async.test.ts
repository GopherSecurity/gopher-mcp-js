import { GopherAgent } from '../src/agent';
import { GopherAgentRuntimeOptions } from '../src/config';
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

describe('GopherAgent.createWithUrlAsync', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setOAuthUrlRuntimeOptionsResolverForTest();
  });

  test('no OAuth options probes before createWithUrl', async () => {
    const agent = fakeAgent();
    const createWithUrl = jest
      .spyOn(GopherAgent, 'createWithUrl')
      .mockReturnValue(agent);
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrlAsync(PROVIDER, MODEL, URL)
    ).resolves.toBe(agent);

    expect(resolver).toHaveBeenCalledWith({
      url: URL,
      runtimeOptions: undefined,
      oauth: {},
    });
    expect(createWithUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, undefined);
  });

  test('disabled OAuth delegates to createWithUrl without resolver', async () => {
    const agent = fakeAgent();
    const createWithUrl = jest
      .spyOn(GopherAgent, 'createWithUrl')
      .mockReturnValue(agent);
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrlAsync(PROVIDER, MODEL, URL, {
        oauth: { mode: 'disabled' },
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(createWithUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, undefined);
  });

  test('explicit access token skips OAuth resolver', async () => {
    const agent = fakeAgent();
    const createWithUrl = jest
      .spyOn(GopherAgent, 'createWithUrl')
      .mockReturnValue(agent);
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrlAsync(PROVIDER, MODEL, URL, {
        accessToken: 'caller-token',
        oauth: {},
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(createWithUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      accessToken: 'caller-token',
    });
  });

  test('explicit Authorization header skips OAuth resolver', async () => {
    const agent = fakeAgent();
    const createWithUrl = jest
      .spyOn(GopherAgent, 'createWithUrl')
      .mockReturnValue(agent);
    const resolver = jest.fn(async () => undefined);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrlAsync(PROVIDER, MODEL, URL, {
        headers: { authorization: 'Bearer caller-token' },
        oauth: {},
      })
    ).resolves.toBe(agent);

    expect(resolver).not.toHaveBeenCalled();
    expect(createWithUrl).toHaveBeenCalledWith(PROVIDER, MODEL, URL, {
      headers: { authorization: 'Bearer caller-token' },
    });
  });

  test('OAuth auto calls resolver before native create', async () => {
    const agent = fakeAgent();
    const createWithUrl = jest
      .spyOn(GopherAgent, 'createWithUrl')
      .mockReturnValue(agent);
    const resolvedOptions: GopherAgentRuntimeOptions = {
      accessToken: 'resolved-token',
    };
    const resolver = jest.fn(async () => resolvedOptions);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrlAsync(PROVIDER, MODEL, URL, {
        oauth: { scopes: ['openid'] },
      })
    ).resolves.toBe(agent);

    expect(resolver).toHaveBeenCalledWith({
      url: URL,
      runtimeOptions: undefined,
      oauth: { scopes: ['openid'] },
    });
    expect(createWithUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      resolvedOptions
    );
  });

  test('no OAuth options use resolved OAuth credentials when required', async () => {
    const agent = fakeAgent();
    const createWithUrl = jest
      .spyOn(GopherAgent, 'createWithUrl')
      .mockReturnValue(agent);
    const resolvedOptions: GopherAgentRuntimeOptions = {
      accessToken: 'resolved-token',
    };
    const resolver = jest.fn(async () => resolvedOptions);
    setOAuthUrlRuntimeOptionsResolverForTest(resolver);

    await expect(
      GopherAgent.createWithUrlAsync(PROVIDER, MODEL, URL)
    ).resolves.toBe(agent);

    expect(resolver).toHaveBeenCalledWith({
      url: URL,
      runtimeOptions: undefined,
      oauth: {},
    });
    expect(createWithUrl).toHaveBeenCalledWith(
      PROVIDER,
      MODEL,
      URL,
      resolvedOptions
    );
  });
});
