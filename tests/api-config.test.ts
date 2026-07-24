const execFileSyncMock = jest.fn<string, unknown[]>(
  () => '{"succeeded":true}'
);

jest.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

import { fetchGopherServerConfig } from '../src/apiConfig';

function lastFetchedUrl(): string {
  const call = execFileSyncMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch subprocess was not invoked');
  }
  const options = call[2] as { input: string };
  return JSON.parse(options.input).url as string;
}

describe('fetchGopherServerConfig API root selection', () => {
  const originalGopherSdkTest = process.env['GOPHER_SDK_TEST'];

  afterEach(() => {
    execFileSyncMock.mockClear();
    if (originalGopherSdkTest === undefined) {
      delete process.env['GOPHER_SDK_TEST'];
    } else {
      process.env['GOPHER_SDK_TEST'] = originalGopherSdkTest;
    }
  });

  test.each(['true', '1', 'yes', ' TRUE ', '\tYes\n'])(
    'routes GOPHER_SDK_TEST=%p to the test API root',
    (value) => {
      process.env['GOPHER_SDK_TEST'] = value;

      fetchGopherServerConfig('api-key');

      expect(lastFetchedUrl()).toBe(
        'https://api-test.gopher.security/v1/mcp-servers'
      );
    }
  );

  test.each([undefined, '', 'false', '0', 'no', 'truee', 'enable'])(
    'routes GOPHER_SDK_TEST=%p to the production API root',
    (value) => {
      if (value === undefined) {
        delete process.env['GOPHER_SDK_TEST'];
      } else {
        process.env['GOPHER_SDK_TEST'] = value;
      }

      fetchGopherServerConfig('api-key');

      expect(lastFetchedUrl()).toBe(
        'https://api.gopher.security/v1/mcp-servers'
      );
    }
  );

  test('preserves scoped route query parameters', () => {
    process.env['GOPHER_SDK_TEST'] = 'true';

    fetchGopherServerConfig('api-key', {
      key: 'gatewayName',
      value: 'mail gateway',
    });

    expect(lastFetchedUrl()).toBe(
      'https://api-test.gopher.security/v1/mcp-servers?gatewayName=mail+gateway'
    );
  });
});
