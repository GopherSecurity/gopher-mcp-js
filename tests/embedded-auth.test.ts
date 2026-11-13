import * as browser from '../src/oauthBrowser';
import { createEmbeddedAgent } from '../src/embeddedAuth';
import type { GopherOrchHandle, GopherOrchLibrary } from '../src/ffi/library';
import type {
  NativeAuthEvent,
  NativeStoreRequest,
} from '../src/ffi/embeddedAuth';

function fake() {
  const events: NativeAuthEvent[] = [];
  const requests: NativeStoreRequest[] = [];
  const handle = {} as GopherOrchHandle;
  const context = {
    start: jest.fn(() =>
      events.push({
        type: 'page',
        url: 'http://127.0.0.1:1234/private',
        flow: 'assemble',
      })
    ),
    event: jest.fn(() => events.shift() ?? null),
    storeRequest: jest.fn(() => requests.shift() ?? null),
    completeStore: jest.fn(),
    createAgent: jest.fn(() => events.push({ type: 'agent_ready' })),
    takeAgent: jest.fn(() => handle),
    cancel: jest.fn(),
    release: jest.fn(async () => undefined),
  };
  const lib = {
    embeddedAuthCapabilities: jest.fn(() => ({
      version: 1,
      embedded_auth: true,
    })),
    createEmbeddedAuth: jest.fn(() => context),
  } as unknown as GopherOrchLibrary;
  return { events, requests, handle, context, lib };
}
const inventory = JSON.stringify({ succeeded: true, data: { servers: [] } });

describe('embedded authorization host adapter', () => {
  test('one private page callback completes strict native flow without blocking Node', async () => {
    const f = fake();
    const onUrl = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      f.events.push({ type: 'authorized' });
    });
    const created = await createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
      oauth: { openBrowser: false, assemble: { onAuthorizationUrl: onUrl } },
    });
    expect(created.handle).toBe(f.handle);
    expect(onUrl).toHaveBeenCalledTimes(1);
    expect(f.context.createAgent).toHaveBeenCalledTimes(1);
    expect(f.context.release).toHaveBeenCalledTimes(1);
    await created.close();
    expect(f.context.release).toHaveBeenCalledTimes(1);
  });
  test('cancel while page is open cleans up without creating an agent', async () => {
    const f = fake();
    const controller = new AbortController();
    await expect(
      createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
        oauth: {
          assemble: {
            signal: controller.signal,
            onAuthorizationUrl: () => controller.abort(),
          },
        },
      })
    ).rejects.toThrow('cancelled');
    expect(f.context.takeAgent).not.toHaveBeenCalled();
    expect(f.context.release).toHaveBeenCalledTimes(1);
  });
  test('store failures and manual handler failures never leak private data', async () => {
    const f = fake();
    await expect(
      createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
        oauth: {
          assemble: {
            onAuthorizationUrl: async () => {
              throw new Error('private secret');
            },
          },
        },
      })
    ).rejects.toThrow('host callback failed');
    expect(f.context.release).toHaveBeenCalledTimes(1);
  });
  test('requires native capability and a stable namespace for persistent stores', async () => {
    const f = fake();
    await expect(
      createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
        oauth: {
          tokenStore: { get: async () => undefined, set: async () => {} },
        },
      })
    ).rejects.toThrow('identityNamespace');
    jest.mocked(f.lib.embeddedAuthCapabilities).mockReturnValue(null);
    await expect(
      createEmbeddedAgent(f.lib, inventory, 'p', 'm')
    ).rejects.toThrow('interface v1');
  });
  test('privileged grant storage never enters public progress and remains serviced until close', async () => {
    const f = fake();
    const get = jest.fn(async () => undefined);
    const set = jest.fn(async () => undefined);
    const binding = {
      identity_namespace: 'user',
      source: 'a',
      issuer: 'issuer',
      resource: 'resource',
      scopes: 'scope',
      client_identity: 'client',
    };
    const grant = {
      binding,
      access_token: 'secret',
      client_id: 'client',
      token_endpoint: 'https://issuer/token',
      expires_at: 2000000000,
    };
    f.requests.push(
      { id: 'get', operation: 'get', binding },
      { id: 'put', operation: 'put', binding, grant }
    );
    const result = await createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
      oauth: {
        tokenStore: { get, set },
        assemble: {
          identityNamespace: 'user',
          onAuthorizationUrl: () => {
            f.events.push({ type: 'authorized' });
          },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 15));
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('gopher-embedded-v1:')
    );
    expect(set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ accessToken: 'secret', embeddedGrant: grant })
    );
    expect(result.requiresAsyncRun).toBe(true);
    await result.close();
    expect(f.context.release).toHaveBeenCalledTimes(1);
  });
  test('manual mode without a presenter fails with actionable guidance and no capability URL', async () => {
    const f = fake();
    await expect(
      createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
        oauth: { openBrowser: false },
      })
    ).rejects.toThrow('onAuthorizationUrl');
    expect(f.context.release).toHaveBeenCalledTimes(1);
  });
  test('cancellation remains active if a presentation callback never settles', async () => {
    const f = fake();
    const controller = new AbortController();
    const pending = createEmbeddedAgent(f.lib, inventory, 'p', 'm', {
      oauth: {
        assemble: {
          signal: controller.signal,
          onAuthorizationUrl: () => {
            f.events.push({ type: 'authorized' });
            return new Promise<void>(() => undefined);
          },
        },
      },
    });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow('cancelled');
    expect(f.context.takeAgent).not.toHaveBeenCalled();
    expect(f.context.release).toHaveBeenCalledTimes(1);
  });
  test('default presentation opens one page and preserves the no-extra-window rule', async () => {
    const f = fake();
    const open = jest
      .spyOn(browser, 'openAuthorizationUrl')
      .mockImplementation(async (url) => {
        f.events.push(
          {
            type: 'page',
            url: 'http://127.0.0.1:1234/private',
            flow: 'assemble',
          },
          { type: 'authorized' }
        );
        return { opened: true, manualFallbackRequired: false, url };
      });
    try {
      const result = await createEmbeddedAgent(f.lib, inventory, 'p', 'm');
      expect(open).toHaveBeenCalledTimes(1);
      await result.close();
    } finally {
      open.mockRestore();
    }
  });
});
