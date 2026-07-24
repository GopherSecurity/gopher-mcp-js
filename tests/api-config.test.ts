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
      text: async () => '{"succeeded":true}',
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

  test('preserves scoped route query parameters', async () => {
    process.env['GOPHER_SDK_TEST'] = 'true';

    await fetchGopherServerConfig('api-key', {
      key: 'gatewayName',
      value: 'mail gateway',
    });

    expect(lastFetchedUrl()).toBe(
      'https://api-test.gopher.security/v1/mcp-servers?gatewayName=mail+gateway'
    );
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
});
