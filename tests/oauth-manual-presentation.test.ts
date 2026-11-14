import { resolveRuntimeOptionsWithOAuth } from '../src/oauthResolver';
import { InMemoryGopherAgentTokenStore } from '../src/oauthTokenStore';

function fixture(earlyTimeout = false) {
  let complete: (value: { code: string; state: string }) => void;
  const callback = new Promise<{ code: string; state: string }>(
    (resolve, reject) => {
      complete = resolve;
      if (earlyTimeout)
        setTimeout(() => reject(new Error('callback timed out')), 5);
    }
  );
  const close = jest.fn(async () => undefined);
  const exchange = jest.fn(async () => ({
    accessToken: 'token',
    tokenType: 'Bearer',
  }));
  const open = jest.fn(async (url: string) => ({
    url,
    opened: false,
    manualFallbackRequired: true,
  }));
  const run = (assemble: {
    onAuthorizationUrl?: (
      url: string,
      flow: 'single' | 'assemble'
    ) => void | Promise<void>;
    signal?: AbortSignal;
    timeoutMs?: number;
  }) =>
    resolveRuntimeOptionsWithOAuth({
      urls: ['https://mcp.example/mcp'],
      oauth: {
        openBrowser: false,
        tokenStore: new InMemoryGopherAgentTokenStore(),
        assemble,
      },
      hooks: {
        probeChallenge: async (url) => ({
          url,
          requiresOAuth: true,
          resourceMetadataUrl: 'https://mcp.example/metadata',
        }),
        fetchProtectedResourceMetadata: async () => ({
          resource: 'https://mcp.example/mcp',
          authorizationServers: ['https://auth.example'],
          scopesSupported: ['read'],
          rawJson: '{}',
        }),
        fetchAuthorizationServerMetadata: async () => ({
          issuer: 'https://auth.example',
          authorizationEndpoint: 'https://auth.example/authorize',
          tokenEndpoint: 'https://auth.example/token',
          scopesSupported: [],
          rawJson: '{}',
        }),
        registerClient: async () => {
          if (earlyTimeout)
            await new Promise((resolve) => setTimeout(resolve, 20));
          return { clientId: 'client' };
        },
        createLoopbackCallbackServer: async () => ({
          redirectUri: 'http://127.0.0.1:4444/callback',
          waitForCallback: () => callback,
          close,
        }),
        openAuthorizationUrl: open,
        exchangeCodeForToken: exchange,
      },
    });
  return {
    run,
    close,
    exchange,
    open,
    complete: (url: string) =>
      complete!({
        code: 'code',
        state: new URL(url).searchParams.get('state')!,
      }),
  };
}

afterEach(() => jest.restoreAllMocks());

test('single OAuth uses the application presenter without browser launch or stderr URL', async () => {
  const f = fixture();
  const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  await expect(
    f.run({
      onAuthorizationUrl: (url, flow) => {
        expect(flow).toBe('single');
        f.complete(url);
      },
    })
  ).resolves.toMatchObject({ accessToken: 'token' });
  expect(f.open).not.toHaveBeenCalled();
  expect(stderr).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});

test('presenter success alone does not complete OAuth', async () => {
  const f = fixture();
  const controller = new AbortController();
  let presented!: () => void;
  const ready = new Promise<void>((resolve) => {
    presented = resolve;
  });
  const pending = f.run({
    signal: controller.signal,
    onAuthorizationUrl: () => {
      presented();
    },
  });
  const rejected = expect(pending).rejects.toMatchObject({
    code: 'AUTH_CANCELLED',
  });
  await ready;
  expect(f.exchange).not.toHaveBeenCalled();
  controller.abort();
  await rejected;
  expect(f.close).toHaveBeenCalledTimes(1);
});

test('cancellation interrupts a stalled presentation callback and closes the loopback listener', async () => {
  const f = fixture();
  const controller = new AbortController();
  let presented!: () => void;
  const ready = new Promise<void>((resolve) => {
    presented = resolve;
  });
  const pending = f.run({
    signal: controller.signal,
    onAuthorizationUrl: () => {
      presented();
      return new Promise<void>(() => undefined);
    },
  });
  const rejected = expect(pending).rejects.toMatchObject({
    code: 'AUTH_CANCELLED',
  });
  await ready;
  controller.abort();
  await rejected;
  expect(f.exchange).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});

test('human authorization timeout also bounds a stalled presentation callback', async () => {
  const f = fixture();
  await expect(
    f.run({
      timeoutMs: 20,
      onAuthorizationUrl: () => new Promise<void>(() => undefined),
    })
  ).rejects.toMatchObject({ code: 'AUTH_TIMEOUT' });
  expect(f.close).toHaveBeenCalledTimes(1);
});

test('presentation errors are sanitized and do not leak privileged URLs', async () => {
  const f = fixture();
  await expect(
    f.run({
      onAuthorizationUrl: (url) => {
        throw new Error(url);
      },
    })
  ).rejects.toMatchObject({
    code: 'AUTH_PRESENTATION_FAILED',
    message: 'OAuth authorization URL presentation failed.',
  });
  expect(f.close).toHaveBeenCalledTimes(1);
});

test('callback deadline is observed while client registration is still pending', async () => {
  const f = fixture(true);
  await expect(f.run({ onAuthorizationUrl: () => undefined })).rejects.toThrow(
    'callback timed out'
  );
  expect(f.exchange).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});
