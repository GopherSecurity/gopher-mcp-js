import { fetchGopherServerConfig } from '../src/apiConfig';
import { AgentError } from '../src/errors';

const fetchMock = jest.fn<
  Promise<Pick<Response, 'ok' | 'status' | 'text'>>,
  Parameters<typeof fetch>
>();

function installFetchMock(): void {
  global.fetch = fetchMock as unknown as typeof fetch;
}

function lastFetchedUrl(): string {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not invoked');
  }
  return call[0].toString();
}

describe('fetchGopherServerConfig API root selection', () => {
  const originalGopherSdkTest = process.env['GOPHER_SDK_TEST'];
  const originalFetch = global.fetch;

  beforeEach(() => {
    installFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          succeeded: true,
          data: {
            servers: [
              {
                type: 'gateway',
                id: 'g',
                name: 'mail gateway',
                transport: 'http',
                config: { url: 'https://gateway.invalid/mail' },
              },
              {
                type: 'gateway',
                id: 'gw1',
                name: 'work',
                transport: 'http',
                config: { url: 'https://gateway.invalid/work' },
              },
            ],
          },
        }),
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    global.fetch = originalFetch;
    if (originalGopherSdkTest === undefined) {
      delete process.env['GOPHER_SDK_TEST'];
    } else {
      process.env['GOPHER_SDK_TEST'] = originalGopherSdkTest;
    }
  });

  test.each(['true', '1', 'yes', ' TRUE ', '\tYes\n'])(
    'routes GOPHER_SDK_TEST=%p to the test API root',
    async (value) => {
      process.env['GOPHER_SDK_TEST'] = value;

      await fetchGopherServerConfig('api-key');

      expect(lastFetchedUrl()).toBe(
        'https://api-test.gopher.security/v1/mcp-servers'
      );
    }
  );

  test.each([undefined, '', 'false', '0', 'no', 'truee', 'enable'])(
    'routes GOPHER_SDK_TEST=%p to the production API root',
    async (value) => {
      if (value === undefined) {
        delete process.env['GOPHER_SDK_TEST'];
      } else {
        process.env['GOPHER_SDK_TEST'] = value;
      }

      await fetchGopherServerConfig('api-key');

      expect(lastFetchedUrl()).toBe(
        'https://api.gopher.security/v1/mcp-servers'
      );
    }
  );

  test('serializes scoped selections in POST JSON', async () => {
    process.env['GOPHER_SDK_TEST'] = 'true';

    await fetchGopherServerConfig('api-key', {
      gatewayName: ['mail gateway'],
    });

    expect(lastFetchedUrl()).toBe(
      'https://api-test.gopher.security/v1/mcp-servers'
    );
  });

  test('sends all arrays and rejects redirects without leaking transport errors', async () => {
    await fetchGopherServerConfig('secret', {
      serverId: ['s'],
      gatewayId: ['g'],
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer secret',
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serverId: ['s'],
        serverName: [],
        gatewayId: ['g'],
        gatewayName: [],
      }),
    });
    fetchMock.mockRejectedValue(new Error('secret runtime-token'));
    await expect(fetchGopherServerConfig('secret')).rejects.toThrow(
      'transport failed'
    );
    await expect(fetchGopherServerConfig('secret')).rejects.not.toThrow(
      'runtime-token'
    );
  });

  test.each([
    [{}, ''],
    [{ serverId: ['srv /1', 'srv /1'] }, '?serverId=srv+%2F1'],
    [{ serverName: ['drive & mail'] }, '?serverName=drive+%26+mail'],
    [{ gatewayId: ['gw1'] }, '?gatewayId=gw1'],
    [{ gatewayName: ['work'] }, '?gatewayName=work'],
  ])(
    'falls back on 405 with exact legacy selection %p',
    async (selection, query) => {
      delete process.env['GOPHER_SDK_TEST'];
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 405,
        text: async () => '',
      });
      await expect(
        fetchGopherServerConfig('secret', selection)
      ).resolves.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(lastFetchedUrl()).toBe(
        'https://api.gopher.security/v1/mcp-servers' + query
      );
      const retry = fetchMock.mock.calls[1]?.[1];
      expect(retry).toMatchObject({
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          Authorization: 'Bearer secret',
        },
      });
      expect(retry?.body).toBeUndefined();
      expect(retry?.signal).toBe(fetchMock.mock.calls[0]?.[1]?.signal);
    }
  );

  test.each([{ serverId: ['a', 'b'] }, { serverId: ['a'], gatewayId: ['b'] }])(
    'never widens multiple selectors on 405: %p',
    async (selection) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 405,
        text: async () => '',
      });
      await expect(
        fetchGopherServerConfig('secret', selection)
      ).rejects.toThrow('requires POST support');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  test.each([401, 403, 404, 500, 501])(
    'does not retry status %s',
    async (status) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        text: async () => 'secret',
      });
      await expect(fetchGopherServerConfig('secret')).rejects.toThrow(
        'status ' + status
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  test('reports GET failure without retrying or exposing the response body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 405,
      text: async () => '',
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'private-token',
    });
    await expect(fetchGopherServerConfig('secret')).rejects.toThrow(
      'Inventory HTTP request failed with status 403'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('GET fallback shares the original total deadline', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20000));
        return { ok: false, status: 405, text: async () => '' };
      });
      fetchMock.mockImplementationOnce(
        async (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('private-token'))
            );
          })
      );
      const pending = fetchGopherServerConfig('secret');
      const assertion = expect(pending).rejects.toThrow(
        'request timed out after 30000ms'
      );
      await jest.advanceTimersByTimeAsync(30001);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('passes gateway selectors to response validation after GET fallback', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 405,
      text: async () => '',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          succeeded: true,
          data: {
            servers: [
              {
                id: 'g',
                name: 'g',
                transport: 'http',
                config: { url: 'https://backing.invalid/mcp' },
              },
            ],
          },
        }),
    });
    await expect(
      fetchGopherServerConfig('secret', { gatewayId: ['g'] })
    ).rejects.toThrow('refusing backing-server substitution');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('throws AgentError for non-2xx responses without using a subprocess', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'temporarily unavailable',
    });

    await expect(fetchGopherServerConfig('api-key')).rejects.toThrow(
      AgentError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test('aborts timed-out inventory and clears its timer', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        async (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new DOMException('secret', 'AbortError'))
            );
          })
      );
      const pending = fetchGopherServerConfig('secret');
      const assertion = expect(pending).rejects.toThrow(
        'request timed out after 30000ms'
      );
      await jest.advanceTimersByTimeAsync(30001);
      await assertion;
      expect(jest.getTimerCount()).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not expose HTTP failure body credentials', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Bearer secret',
    });
    await expect(fetchGopherServerConfig('secret')).rejects.toThrow(
      'status 401'
    );
    await expect(fetchGopherServerConfig('secret')).rejects.not.toThrow(
      'secret'
    );
  });
});
